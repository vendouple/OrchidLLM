/**
 * /api/chat/completions - Chat Completions Proxy
 *
 * Refactored to support:
 * - Provider registry with OpenAI-compatible and non-compatible adapters.
 * - Multiple upstream keys per provider with per-key usage counters.
 * - Priority queue scheduling before dispatching to providers.
 * - Response normalization for providers that do not return OpenAI shape.
 */

import {
    detectKeyType,
    validateApiKey,
    isModelAllowed
} from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession, checkTokenLimits } from '../../lib/usage.js';
import { countMessagesTokens, estimateOutputTokens } from '../../lib/tokenizer.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool, isDbConfigured } from '../../lib/oracle.js';
import {
    getActiveModelById,
    mapProviderCandidatesForModel
} from '../../lib/model-catalog.js';
import {
    buildProviderCandidates,
    PROVIDER_ENDPOINTS
} from '../../lib/provider-registry.js';
import { recordProviderUsage } from '../../lib/provider-keys.js';
import {
    executeProviderChatCompletion,
    extractProviderUsage
} from '../../lib/providers.js';
import {
    normalizeQueuePriority,
    enqueueRequest,
    completeQueueItem,
    cancelQueueItem,
    getQueueStatus
} from '../../lib/queue.js';
import {
    filterCandidatesByKeyAccess,
    buildRoutableCandidates,
    waitForQueueTurn,
    orderCandidatesForExecution
} from '../../providers/distributor.js';
import { deductCredits } from '../../lib/credits.js';
import { routeRequest } from '../../lib/context-router.js';

// Hard wall for the entire upstream round-trip (connect + headers + full body).
// Keep well below Vercel's 300 s function limit.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_FETCH_TIMEOUT_MS || 60000);
// Hard wall for each DB call.
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 8000);

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Race a DB promise against a hard timeout; resolve to fallback on timeout.
 */
function withDbTimeout(promise, fallback, label = 'DB') {
    let timeoutId;

    return Promise.race([
        promise,
        new Promise(resolve =>
            timeoutId = setTimeout(() => {
                console.warn(`[completions] ${label} timed out after ${DB_TIMEOUT_MS}ms — fail open`);
                resolve(fallback);
            }, DB_TIMEOUT_MS)
        )
    ]).finally(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    });
}

// ─── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Identify caller ──────────────────────────────────────────────────────
    const authHeader     = req.headers['authorization'];
    const rawKey         = authHeader?.replace('Bearer ', '').trim() || '';
    const clientIP       = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                           || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent      = req.headers['user-agent'] || 'unknown';

    const dbAvailable = isDbConfigured();
    let usedDb = false;

    // ── Single abort controller covering the ENTIRE upstream call ────────────
    // Cleared only after headers AND body have been fully consumed.
    const upstreamCtrl = new AbortController();
    const upstreamTimer = setTimeout(() => {
        upstreamCtrl.abort();
        console.error('[completions] Upstream timeout — aborting after', UPSTREAM_TIMEOUT_MS, 'ms');
    }, UPSTREAM_TIMEOUT_MS);

    let queueId = null;
    let selectedCandidate = null;

    try {
        // ── Key / session resolution ─────────────────────────────────────────
        let keyInfo    = null;
        let identifier = null;

        if (rawKey) {
            const keyType = detectKeyType(rawKey);

            if (keyType.type === 'byop') {
                keyInfo    = { type: 'byop', actualKey: keyType.actualKey, bypassLimits: true };
                identifier = `byop:${rawKey.substring(0, 20)}`;

            } else if (keyType.needsDbValidation) {
                if (!dbAvailable) {
                    return res.status(503).json({
                        error: 'Database unavailable',
                        message: 'API key validation requires a database. Use BYOP mode (prefix your Pollinations key with BYOP_) or try again later.'
                    });
                }
                usedDb = true;
                const validated = await withDbTimeout(validateApiKey(rawKey), null, 'validateApiKey');
                if (!validated) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                keyInfo    = validated;
                identifier = `key:${rawKey}`;

            } else {
                return res.status(401).json({ error: 'Unknown key format' });
            }

        } else {
            // Demo / anonymous
            let fingerprint = {};
            if (fingerprintStr) {
                try { fingerprint = JSON.parse(fingerprintStr); } catch { /* ignore */ }
            }
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);

            if (dbAvailable) {
                usedDb = true;
                const demoSession = await withDbTimeout(
                    checkDemoSession(compositeHash, fingerprint, clientIP, userAgent),
                    { isBlocked: false, apiKeyId: null, key: null },
                    'checkDemoSession'
                );
                if (demoSession.isBlocked) {
                    return res.status(429).json({
                        error: 'Session blocked',
                        message: 'Your session has been blocked due to suspicious activity'
                    });
                }
                keyInfo = {
                    type: 'demo', id: demoSession.apiKeyId,
                    rpm: 5, rpd: 20,
                    inputTokenLimit: 10000, outputTokenLimit: -1,
                    bypassLimits: false
                };
            } else {
                // No DB — graceful anonymous demo
                keyInfo = {
                    type: 'demo', id: null,
                    rpm: 5, rpd: 20,
                    inputTokenLimit: 10000, outputTokenLimit: -1,
                    bypassLimits: false
                };
            }
            identifier = `demo:${compositeHash}`;
        }

        // ── Rate limiting ────────────────────────────────────────────────────
        if (!keyInfo.bypassLimits && usedDb) {
            const rl = await withDbTimeout(
                checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd),
                { allowed: true, remaining: -1 },
                'checkRateLimit'
            );
            if (!rl.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    reason: rl.reason, resetAt: rl.resetAt, remaining: 0
                });
            }
        }

        // ── Parse body ───────────────────────────────────────────────────────
        const body = req.body || {};
        const { model, messages, stream, provider: requestedProvider } = body;
        let requestedModelId = String(model || '').trim();
        const isByopFastTrack = keyInfo.type === 'byop';
        const isDemoPinnedMode = keyInfo.type === 'demo';
        const isPollinationsPinnedMode = isByopFastTrack || isDemoPinnedMode;
        const effectiveRequestedProvider = isPollinationsPinnedMode ? 'pollinations' : requestedProvider;

        if (!requestedModelId || !messages) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'model and messages are required'
            });
        }

        if (!dbAvailable) {
            return res.status(503).json({
                error: 'Database unavailable',
                message: 'Model routing requires Oracle DB because the model catalog is DB-only.'
            });
        }

        let activeModel = null;
        try {
            activeModel = await withDbTimeout(
                getActiveModelById(requestedModelId),
                null,
                'getActiveModelById'
            );
        } catch (catalogError) {
            if (catalogError?.code === 'MODEL_CATALOG_TABLE_MISSING') {
                return res.status(503).json({
                    error: 'Model catalog table missing',
                    message: 'Run db/migrate_provider_queue.sql to create model_catalog and model_provider_mappings.'
                });
            }

            throw catalogError;
        }

        if (!activeModel) {
            return res.status(400).json({
                error: 'Invalid model',
                message: `Model '${requestedModelId}' is not active in model_catalog.`
            });
        }

        // ── Model access (global keys only) ───────────────────────────────────
        if (!keyInfo.bypassLimits && keyInfo.type !== 'demo' && !isModelAllowed(keyInfo, requestedModelId)) {
            return res.status(403).json({
                error: 'Model not allowed',
                message: `No access to ${requestedModelId}`
            });
        }

        // ── Token limits ─────────────────────────────────────────────────────
        let inputTokens = 0;
        if (!keyInfo.bypassLimits && keyInfo.inputTokenLimit !== -1) {
            inputTokens = await countMessagesTokens(messages);
            const estimatedOutput = estimateOutputTokens(inputTokens, requestedModelId);
            const tc = await checkTokenLimits(keyInfo, inputTokens, estimatedOutput);
            if (!tc.allowed) {
                return res.status(400).json({ error: 'Token limit exceeded', message: tc.reason });
            }
        }

        // ── Dynamic Context Routing ──────────────────────────────────────────
        let routedMessages = messages;
        let routeMultiplier = 1.0;
        
        if (dbAvailable && keyInfo.userId && !keyInfo.bypassLimits) {
            if (inputTokens === 0) {
                inputTokens = await countMessagesTokens(messages);
            }
            
            const routeResult = await withDbTimeout(
                routeRequest({ messages, modelRow: activeModel, userId: keyInfo.userId }),
                { action: 'RAW', multiplier: 1.0, messages },
                'routeRequest'
            );
            
            if (routeResult.action === 'BLOCK') {
                return res.status(400).json({ error: 'Context threshold exceeded', message: 'Context size blocked by your routing preferences.' });
            }
            
            if (routeResult.action === 'COMPRESS') {
                routedMessages = routeResult.compressedMessages;
                requestedModelId = routeResult.workerModel.id;
                activeModel = routeResult.workerModel;
                
                // Recalculate token count for the compressed prompt
                inputTokens = await countMessagesTokens(routedMessages);
            } else {
                routeMultiplier = routeResult.multiplier || 1.0;
            }
        }

        // ── Build provider candidates ────────────────────────────────────────
        const allowedProviders = Array.isArray(keyInfo.providers)
            ? keyInfo.providers
            : [];

        const providerCandidates = buildProviderCandidates({
            model: requestedModelId,
            requestedProvider: effectiveRequestedProvider,
            allowedProviders,
            endpointKey: PROVIDER_ENDPOINTS.CHAT_COMPLETIONS
        });

        if (providerCandidates.length === 0) {
            return res.status(403).json({
                error: 'Provider not allowed',
                message: 'No provider is allowed by this key for the requested model/provider'
            });
        }

        const accessibleCandidates = filterCandidatesByKeyAccess(providerCandidates, keyInfo);

        if (accessibleCandidates.length === 0) {
            return res.status(403).json({
                error: 'Provider not allowed',
                message: 'No provider is allowed by this key for the requested model/provider'
            });
        }

        const mappedCandidatesResult = await withDbTimeout(
            mapProviderCandidatesForModel(requestedModelId, accessibleCandidates),
            { reason: 'mapping_resolution_timeout', model: activeModel, candidates: [] },
            'mapProviderCandidatesForModel'
        );

        if (mappedCandidatesResult?.reason === 'model_not_found') {
            return res.status(400).json({
                error: 'Invalid model',
                message: `Model '${requestedModelId}' is not active in model_catalog.`
            });
        }

        const mappedCandidates = Array.isArray(mappedCandidatesResult?.candidates)
            ? mappedCandidatesResult.candidates
            : [];

        if (mappedCandidates.length === 0) {
            const reason = mappedCandidatesResult?.reason || 'mapping_missing';
            return res.status(503).json({
                error: 'No upstream provider available',
                reason,
                message: `No active provider mapping found for model '${requestedModelId}'.`
            });
        }

        const routableCandidates = await buildRoutableCandidates({
            providerCandidates: mappedCandidates,
            keyInfo,
            allowDb: dbAvailable,
            endpointKey: PROVIDER_ENDPOINTS.CHAT_COMPLETIONS
        });

        if (routableCandidates.length === 0) {
            return res.status(503).json({
                error: 'No upstream provider available',
                message: 'No provider key is currently available for this request'
            });
        }

        // ── Queue scheduling (skip entirely for BYOP fast-track) ────────────
        if (isByopFastTrack) {
            selectedCandidate = routableCandidates.find(candidate => candidate.providerId === 'pollinations') || null;
            res.setHeader('x-provider-fasttrack', 'byop-pollinations');
        } else {
            let queuePriority = normalizeQueuePriority(
                keyInfo.queuePriority !== undefined
                    ? keyInfo.queuePriority
                    : 0
            );

            // ── Credit Deduction (Pre-flight estimated) ─────────────────────────
            let deductedCreditsInfo = null;
            if (dbAvailable && keyInfo.userId && !keyInfo.bypassLimits) {
                const estOutput = estimateOutputTokens(inputTokens, requestedModelId);
                const deduction = await withDbTimeout(
                    deductCredits({ 
                        userId: keyInfo.userId, 
                        promptTokens: inputTokens, 
                        completionTokens: estOutput, 
                        modelRow: activeModel, 
                        isBatch: false, 
                        isCached: false 
                    }),
                    null,
                    'deductCredits'
                );
                
                if (deduction && !deduction.allowed) {
                    return res.status(402).json({ error: 'Insufficient credits', message: 'Not enough credits to process request.' });
                }
                
                if (deduction) {
                    queuePriority = deduction.queuePriority;
                    deductedCreditsInfo = deduction;
                }
            }

            const queueEntry = await enqueueRequest({
                endpoint: '/chat/completions',
                identifier,
                apiKeyId: keyInfo.id,
                model: requestedModelId,
                priority: queuePriority
            });

            queueId = queueEntry.id;
            if (queueId) {
                res.setHeader('x-queue-id', queueId);
            }

            selectedCandidate = await waitForQueueTurn({
                queueId,
                endpoint: '/chat/completions',
                candidates: routableCandidates
            });
        }

        if (!selectedCandidate) {
            const queueStatus = queueId ? await getQueueStatus(queueId) : null;
            if (queueId) {
                await cancelQueueItem(queueId, 'queue_wait_timeout');
            }

            return res.status(503).json({
                error: 'All providers are busy',
                message: 'Queue timeout reached before a provider slot was available',
                queueId,
                queueStatus
            });
        }

        const { provider: _requestedProvider, ...forwardBody } = body;
        forwardBody.messages = routedMessages;

        const candidatesInAttemptOrder = isPollinationsPinnedMode
            ? [selectedCandidate]
            : orderCandidatesForExecution(selectedCandidate, routableCandidates);

        let providerResult = null;
        let lastProviderError = null;

        for (const candidate of candidatesInAttemptOrder) {
            const requestBody = { ...forwardBody, model: candidate.upstreamModel };

            try {
                providerResult = await executeProviderChatCompletion({
                    providerId: candidate.providerId,
                    upstreamModel: candidate.upstreamModel,
                    requestBody,
                    credential: candidate.credential,
                    signal: upstreamCtrl.signal
                });

                selectedCandidate = candidate;
                break;
            } catch (providerError) {
                lastProviderError = providerError;

                await recordProviderUsage({
                    providerId: candidate.providerId,
                    credential: candidate.credential,
                    endpoint: '/chat/completions',
                    model: candidate.upstreamModel,
                    statusCode: providerError.status || 502,
                    usage: {
                        counterType: candidate.credential?.usageCounterType || candidate.providerDefinition?.usageCounterType || 'tokens',
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                        providerUnits: 0,
                        rateLimitSnapshot: null
                    },
                    errorMessage: providerError.message,
                    identifier,
                    apiKeyId: keyInfo.id
                });
            }
        }

        if (!providerResult) {
            const status = Number(lastProviderError?.status || 503);

            if (queueId) {
                await completeQueueItem({
                    queueId,
                    status: 'error',
                    statusCode: status,
                    errorMessage: lastProviderError?.message || 'No upstream provider available'
                });
            }

            return res.status(status).json({
                error: 'No upstream provider available',
                status,
                message: lastProviderError?.message || 'All configured providers failed to process this request'
            });
        }

        res.setHeader('x-provider-speed-tier', selectedCandidate?.providerDefinition?.speedTier ?? 3);
        res.setHeader('x-provider-free-tier', selectedCandidate?.providerDefinition?.enableFreeTier ?? false);
        res.setHeader('x-provider-env-keys', (selectedCandidate?.providerDefinition?.envKeyCandidates ?? []).join(','));

        // ── Consume response body (still under the same abort timer) ─────────
        if (stream && providerResult.mode === 'stream') {
            res.setHeader('Content-Type',  'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection',    'keep-alive');

            const reader = providerResult.response.body.getReader();
            const decoder = new TextDecoder();
            let outputTokens = 0;
            let promptTokensFromStream = inputTokens;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);

                    const completionMatch = chunk.match(/"completion_tokens":\s*(\d+)/);
                    if (completionMatch) {
                        outputTokens = parseInt(completionMatch[1], 10);
                    }

                    const promptMatch = chunk.match(/"prompt_tokens":\s*(\d+)/);
                    if (promptMatch) {
                        promptTokensFromStream = parseInt(promptMatch[1], 10);
                    }

                    res.write(value);
                }
            } catch (readErr) {
                if (readErr.name === 'AbortError') {
                    res.write('data: [DONE]\n\n');
                }
            } finally {
                res.end();
            }

            if (usedDb) {
                const clientFacingModel = selectedCandidate?.globalModelId || requestedModelId;
                logUsage({
                    identifier, apiKeyId: keyInfo.id, endpoint: '/chat/completions',
                    model: clientFacingModel,
                    inputTokens: promptTokensFromStream,
                    outputTokens,
                    ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }

            await recordProviderUsage({
                providerId: selectedCandidate.providerId,
                credential: selectedCandidate.credential,
                endpoint: '/chat/completions',
                model: selectedCandidate.upstreamModel,
                statusCode: providerResult.response.status,
                usage: extractProviderUsage({
                    providerId: selectedCandidate.providerId,
                    providerDefinition: selectedCandidate.providerDefinition,
                    credential: selectedCandidate.credential,
                    responseHeaders: providerResult.response.headers,
                    responseData: {
                        usage: {
                            prompt_tokens: promptTokensFromStream,
                            completion_tokens: outputTokens,
                            total_tokens: promptTokensFromStream + outputTokens
                        }
                    },
                    fallbackPromptTokens: promptTokensFromStream,
                    fallbackCompletionTokens: outputTokens
                }),
                identifier,
                apiKeyId: keyInfo.id
            });

            if (queueId) {
                await completeQueueItem({
                    queueId,
                    status: 'done',
                    statusCode: 200
                });
            }

        } else {
            const data = providerResult.normalizedData || {};
            const clientFacingModel = selectedCandidate?.globalModelId || requestedModelId;

            if (data && typeof data === 'object') {
                data.model = clientFacingModel;
                data.provider_speed_tier = selectedCandidate?.providerDefinition?.speedTier ?? 3;
                data.provider_free_tier = selectedCandidate?.providerDefinition?.enableFreeTier ?? false;
                data.provider_env_keys = selectedCandidate?.providerDefinition?.envKeyCandidates ?? [];
            }

            const outputTokens = data.usage?.completion_tokens || 0;
            const actualInput  = data.usage?.prompt_tokens || inputTokens;

            if (usedDb) {
                logUsage({
                    identifier, apiKeyId: keyInfo.id, endpoint: '/chat/completions',
                    model: clientFacingModel,
                    inputTokens: actualInput,
                    outputTokens,
                    ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }

            await recordProviderUsage({
                providerId: selectedCandidate.providerId,
                credential: selectedCandidate.credential,
                endpoint: '/chat/completions',
                model: selectedCandidate.upstreamModel,
                statusCode: providerResult.response.status,
                usage: extractProviderUsage({
                    providerId: selectedCandidate.providerId,
                    providerDefinition: selectedCandidate.providerDefinition,
                    credential: selectedCandidate.credential,
                    responseHeaders: providerResult.response.headers,
                    responseData: data,
                    fallbackPromptTokens: actualInput,
                    fallbackCompletionTokens: outputTokens
                }),
                identifier,
                apiKeyId: keyInfo.id
            });

            if (queueId) {
                await completeQueueItem({
                    queueId,
                    status: 'done',
                    statusCode: 200
                });
            }

            res.status(200).json(data);
        }

    } catch (err) {
        console.error('[completions] handler error:', err.name, err.message);

        if (queueId) {
            await completeQueueItem({
                queueId,
                status: err.name === 'AbortError' ? 'error' : 'error',
                statusCode: err.name === 'AbortError' ? 504 : 500,
                errorMessage: err.message
            });
        }

        if (!res.headersSent) {
            if (err.name === 'AbortError') {
                res.status(504).json({ error: 'Gateway timeout', message: `Request aborted after ${UPSTREAM_TIMEOUT_MS / 1000}s` });
            } else {
                res.status(500).json({ error: 'Internal server error', message: err.message });
            }
        }
    } finally {
        // Always clear the upstream timer to avoid leaks
        clearTimeout(upstreamTimer);
        if (usedDb) {
            await closePool();
        }
    }
}
