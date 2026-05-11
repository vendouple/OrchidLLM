/**
 * /api/chat/completions — Chat Completions Gateway
 *
 * Full request lifecycle per ORCHIDLLM_PLAN §18:
 * Auth → RPM → Model Access → Context Check → Credit Reserve → Route → Stream/Return
 */
import { applyCors, resolveAuthContext, sendJson, sendError, readJsonBody, getBearerToken } from '../../lib/api-helpers.js';
import { getModelRecord, checkModelAccess, checkContextAccess, checkDemoKeyLimit, touchDemoKey, touchApiKeyUsage, logRequest, logRouting, makeKeyRefHash } from '../../lib/api-core.js';
import { selectProvider, getMultipliers, calculateCost, handleProviderFailure } from '../../lib/router.js';
import { forwardChatCompletion, extractUsage } from '../../lib/providers.js';
import { countMessagesTokens, estimateOutputTokens } from '../../lib/tokenizer.js';
import { reserveCredits, reconcileCredits, releaseReservation, getEffectivePriority } from '../../lib/billing.js';
import { enqueueRequest, waitForQueueTurn, completeQueueItem, failQueueItem } from '../../lib/queue.js';
import { checkRateLimit } from '../../lib/redis.js';
import { isDbConfigured } from '../../lib/oracle.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'POST only.');

    const auth = await resolveAuthContext(req, { allowAnonymousDemo: true });
    if (!auth.authenticated) {
        return sendError(res, 401, 'unauthorized', 'Authentication required.');
    }

    // RPM check
    const rpmKey = auth.userId ? `rpm:${auth.userId}` : `rpm:demo:${auth.demoKey?.demoKeyId || 'anon'}`;
    const rpmLimit = auth.rpm || 3;
    const rpmCheck = await checkRateLimit(rpmKey, rpmLimit, 60, { requireDurable: false });
    if (!rpmCheck.allowed) {
        return sendError(res, 429, 'rate_limit', 'Rate limit exceeded. Please slow down.');
    }

    if (auth.type === 'demo') {
        const demoLimit = await checkDemoKeyLimit(auth.demoKey?.demoKeyId);
        if (!demoLimit.allowed) {
            return sendError(res, 429, 'demo_limit_exceeded', `Demo daily limit reached (${demoLimit.limit} requests/day).`);
        }
    }

    const body = await readJsonBody(req);
    const modelSlug = body.model;
    if (!modelSlug) return sendError(res, 400, 'missing_model', 'model field is required.');

    if (!isDbConfigured()) {
        return sendError(res, 503, 'db_unavailable', 'Service temporarily unavailable.');
    }

    // Model access check
    const modelRow = await getModelRecord(modelSlug);
    const accessCheck = checkModelAccess(auth, modelRow);
    if (!accessCheck.allowed) {
        return sendError(res, accessCheck.status, accessCheck.code, accessCheck.message);
    }

    // Token count + context check
    const inputTokens = await countMessagesTokens(body.messages || []);
    const demoContextCap = Number(process.env.DEMO_CONTEXT_CAP || 33000);
    if (auth.type === 'demo' && inputTokens > demoContextCap) {
        return sendError(res, 403, 'context_limit_exceeded', 'Context limit exceeded. Demo requests are capped at 33,000 tokens.');
    }
    const contextCheck = checkContextAccess(auth, modelRow, inputTokens);
    if (!contextCheck.allowed) {
        return sendError(res, contextCheck.status, contextCheck.code, contextCheck.message);
    }

    // Parameter handling + provider routing
    const requestedParams = Object.keys(body).filter(k => !['model', 'messages', 'stream', '_requiredParams', '_orchidMeta'].includes(k));
    const explicitRequiredParams = Array.isArray(body._requiredParams) ? body._requiredParams : [];
    const requiredParams = [...new Set([...requestedParams, ...explicitRequiredParams])];
    const strictParams = auth.type === 'api_key' && auth.apiKey?.strictParamsEnabled;
    const preferFastProviders = auth.type !== 'demo'
        && (auth.modelAccessTier || 'free') !== 'free';
    const provider = await selectProvider(modelSlug, inputTokens, {
        strictParams,
        requiredParams,
        preferFastProviders,
    });
    if (!provider) {
        return sendError(res, strictParams ? 400 : 503, strictParams ? 'unsupported_parameters' : 'no_provider',
            strictParams ? 'No available provider supports all requested parameters for this model.' : 'No provider available for this model. Please try again later.');
    }
    const droppedParams = provider.droppedParams || [];
    const forwardBody = { ...body };
    for (const param of droppedParams) delete forwardBody[param];
    if (!strictParams && auth.apiKey?.strictParamsOption && droppedParams.length) {
        res.setHeader('X-OrchidLLM-Param-Dropped', droppedParams.join(','));
        res.setHeader('X-Orchid-Unsupported-Params', droppedParams.join(','));
    }

    // Credit reservation (skip for demo)
    const multipliers = await getMultipliers(modelSlug, inputTokens);
    const estimatedOutput = estimateOutputTokens(inputTokens, modelSlug);
    const estimatedCost = calculateCost({ input: inputTokens, output: estimatedOutput }, multipliers);
    let reserved = false;

    if (auth.type !== 'demo' && auth.userId) {
        reserved = await reserveCredits(auth.userId, estimatedCost);
        if (!reserved) {
            return sendError(res, 402, 'insufficient_credits', 'Insufficient credits. Please upgrade or purchase a booster pack.');
        }
    }

    // Queue
    const queueEntry = await enqueueRequest({
        userId: auth.userId, apiKeyId: auth.apiKey?.id,
        modelId: modelRow?.ID, providerId: provider.providerId,
        priority: auth.userId ? await getEffectivePriority(auth.userId, auth.apiKey?.tierId || auth.user?.tierId).catch(() => 0) : 0,
        reservedCredits: estimatedCost,
    });

    const queueTurn = await waitForQueueTurn(queueEntry.id, {
        maxConcurrent: auth.apiKey?.maxConcurrent || 1,
        userId: auth.userId,
    });

    if (!queueTurn.acquired) {
        if (auth.userId && reserved) await releaseReservation(auth.userId, estimatedCost);
        await failQueueItem(queueEntry.id);
        return sendError(res, 429, 'queue_full', queueTurn.reason === 'concurrency_limit' || queueTurn.lastReason === 'concurrency_limit'
            ? 'Concurrent request limit reached.' : 'Queue is full. Please try again.');
    }

    // Dispatch to provider
    const startMs = Date.now();
    try {
        const providerResponse = await forwardChatCompletion({
            baseUrl: provider.baseUrl,
            authKeyEnv: provider.authKeyEnv,
            providerModelId: provider.providerModelId,
            requestBody: forwardBody,
        });

        if (!providerResponse.ok) {
            const status = providerResponse.status;
            await handleProviderFailure(provider.id, status);
            if (auth.userId && reserved) await releaseReservation(auth.userId, estimatedCost);
            await failQueueItem(queueEntry.id);
            await logRequest({ userId: auth.userId, apiKeyId: auth.apiKey?.id, modelId: modelRow?.ID, providerId: provider.providerId, endpoint: '/chat/completions', status: 'fail' });
            return sendError(res, 503, 'provider_error', 'Service temporarily unavailable. Please retry.');
        }

        const ttftMs = Date.now() - startMs;
        const contentType = providerResponse.headers.get('content-type') || '';

        // Streaming response
        if (body.stream && contentType.includes('text/event-stream')) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = providerResponse.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);
                    fullText += chunk;
                }
            } finally {
                reader.releaseLock();
            }

            res.end();
            // Reconcile (estimated usage for streaming)
            const actualCost = estimatedCost;
            if (auth.userId && reserved) await reconcileCredits(auth.userId, estimatedCost, actualCost);
            await completeQueueItem({ queueId: queueEntry.id, actualCredits: actualCost });
            if (auth.type === 'demo') await touchDemoKey(auth.demoKey?.demoKeyId);
            if (auth.apiKey?.id) await touchApiKeyUsage(auth.apiKey.id, actualCost);
            await logRequest({ userId: auth.userId, apiKeyId: auth.apiKey?.id, modelId: modelRow?.ID, providerId: provider.providerId, endpoint: '/chat/completions', status: 'success', creditsCharged: actualCost });
            await logRouting({ requestId: queueEntry.id, userId: auth.userId, keyRefHash: makeKeyRefHash(auth), providersAttempted: [provider.providerId], finalProviderId: provider.providerId, routingReason: preferFastProviders ? 'provider_speed_fast' : 'provider_speed_slow', queueWaitMs: queueTurn.waitMs, ttftMs, paramsStripped: droppedParams });
            return;
        }

        // Non-streaming response
        const data = await providerResponse.json();
        const usage = extractUsage(data);
        const actualCost = calculateCost(usage, multipliers);

        if (auth.userId && reserved) await reconcileCredits(auth.userId, estimatedCost, actualCost);
        await completeQueueItem({ queueId: queueEntry.id, actualCredits: actualCost });
        if (auth.type === 'demo') await touchDemoKey(auth.demoKey?.demoKeyId);
        if (auth.apiKey?.id) await touchApiKeyUsage(auth.apiKey.id, actualCost);
        await logRequest({ userId: auth.userId, apiKeyId: auth.apiKey?.id, modelId: modelRow?.ID, providerId: provider.providerId, endpoint: '/chat/completions', status: 'success', creditsCharged: actualCost });
        await logRouting({ requestId: queueEntry.id, userId: auth.userId, keyRefHash: makeKeyRefHash(auth), providersAttempted: [provider.providerId], finalProviderId: provider.providerId, routingReason: preferFastProviders ? 'provider_speed_fast' : 'provider_speed_slow', queueWaitMs: queueTurn.waitMs, ttftMs, paramsStripped: droppedParams });

        return sendJson(res, 200, data);

    } catch (err) {
        console.error('[chat/completions] Dispatch error:', err.message);
        if (auth.userId && reserved) await releaseReservation(auth.userId, estimatedCost);
        await failQueueItem(queueEntry.id);
        await logRequest({ userId: auth.userId, apiKeyId: auth.apiKey?.id, modelId: modelRow?.ID, endpoint: '/chat/completions', status: 'fail' });
        return sendError(res, 503, 'service_error', 'Service temporarily unavailable. Please retry.');
    }
}
