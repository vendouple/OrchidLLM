/**
 * /api/images/generations - Image Generation Proxy
 *
 * Refactored to support:
 * - Provider registry routing for OpenAI-compatible image endpoints.
 * - Multiple upstream keys per provider with per-key usage counters.
 * - Priority queue scheduling before dispatching to providers.
 */

import {
    detectKeyType,
    validateApiKey,
    isModelAllowed
} from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession } from '../../lib/usage.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool, isDbConfigured } from '../../lib/oracle.js';
import {
    buildProviderCandidates,
    PROVIDER_ENDPOINTS
} from '../../lib/provider-registry.js';
import { recordProviderUsage } from '../../lib/provider-keys.js';
import {
    executeProviderImageGeneration,
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
    orderCandidatesForExecution,
    endpointModelLabel
} from '../../providers/distributor.js';

const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 8000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_FETCH_TIMEOUT_MS || 60000);

function withDbTimeout(promise, fallback, label = 'DB') {
    let timeoutId;

    return Promise.race([
        promise,
        new Promise(resolve =>
            timeoutId = setTimeout(() => {
                console.warn(`[generations] ${label} timed out after ${DB_TIMEOUT_MS}ms — using fallback`);
                resolve(fallback);
            }, DB_TIMEOUT_MS)
        )
    ]).finally(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader     = req.headers['authorization'];
    const rawKey         = authHeader?.replace('Bearer ', '').trim() || '';
    const clientIP       = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                           || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent      = req.headers['user-agent'] || 'unknown';

    const dbAvailable = isDbConfigured();
    let usedDb = false;

    // Single abort controller covers full upstream round-trip (connect + body)
    const upstreamCtrl  = new AbortController();
    const upstreamTimer = setTimeout(() => {
        upstreamCtrl.abort();
        console.error('[generations] Upstream timeout after', UPSTREAM_TIMEOUT_MS, 'ms');
    }, UPSTREAM_TIMEOUT_MS);

    let queueId = null;
    let selectedCandidate = null;

    try {
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
                        message: 'API key validation requires a database. Use BYOP mode or try again later.'
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
                    return res.status(429).json({ error: 'Session blocked' });
                }
                keyInfo = {
                    type: 'demo', id: demoSession.apiKeyId,
                    rpm: 5, rpd: 20, bypassLimits: false
                };
            } else {
                keyInfo = { type: 'demo', id: null, rpm: 5, rpd: 20, bypassLimits: false };
            }
            identifier = `demo:${compositeHash}`;
        }

        // Rate limit (only when DB was used)
        if (!keyInfo.bypassLimits && usedDb) {
            const rl = await withDbTimeout(
                checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd),
                { allowed: true, remaining: -1 },
                'checkRateLimit'
            );
            if (!rl.allowed) {
                return res.status(429).json({ error: 'Rate limit exceeded', resetAt: rl.resetAt });
            }
        }

        const body = req.body || {};
        const { prompt, model, provider: requestedProvider } = body;
        const isByopFastTrack = keyInfo.type === 'byop';
        const effectiveRequestedProvider = isByopFastTrack ? 'pollinations' : requestedProvider;

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        if (model && !keyInfo.bypassLimits && keyInfo.type !== 'demo' && !isModelAllowed(keyInfo, model)) {
            return res.status(403).json({
                error: 'Model not allowed',
                message: `No access to ${model}`
            });
        }

        const allowedProviders = Array.isArray(keyInfo.providers)
            ? keyInfo.providers
            : [];

        const providerCandidates = buildProviderCandidates({
            model,
            requestedProvider: effectiveRequestedProvider,
            allowedProviders,
            endpointKey: PROVIDER_ENDPOINTS.IMAGE_GENERATIONS
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

        const routableCandidates = await buildRoutableCandidates({
            providerCandidates: accessibleCandidates,
            keyInfo,
            allowDb: dbAvailable,
            endpointKey: PROVIDER_ENDPOINTS.IMAGE_GENERATIONS
        });

        if (routableCandidates.length === 0) {
            return res.status(503).json({
                error: 'No upstream provider available',
                message: 'No provider key is currently available for image generation'
            });
        }

        if (isByopFastTrack) {
            selectedCandidate = routableCandidates.find(candidate => candidate.providerId === 'pollinations') || null;
            res.setHeader('x-provider-fasttrack', 'byop-pollinations');
        } else {
            const queuePriority = normalizeQueuePriority(
                keyInfo.queuePriority !== undefined
                    ? keyInfo.queuePriority
                    : 0
            );

            const queueEntry = await enqueueRequest({
                endpoint: '/images/generations',
                identifier,
                apiKeyId: keyInfo.id,
                model: model || null,
                priority: queuePriority
            });

            queueId = queueEntry.id;
            if (queueId) {
                res.setHeader('x-queue-id', queueId);
            }

            selectedCandidate = await waitForQueueTurn({
                queueId,
                endpoint: '/images/generations',
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

        const candidatesInAttemptOrder = isByopFastTrack
            ? [selectedCandidate]
            : orderCandidatesForExecution(selectedCandidate, routableCandidates);

        let providerResult = null;
        let lastProviderError = null;

        for (const candidate of candidatesInAttemptOrder) {
            const requestBody = { ...forwardBody };
            if (candidate.upstreamModel) {
                requestBody.model = candidate.upstreamModel;
            }

            try {
                providerResult = await executeProviderImageGeneration({
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

                const counterType = candidate.credential?.usageCounterType ||
                    candidate.providerDefinition?.usageCounterType ||
                    'tokens';

                await recordProviderUsage({
                    providerId: candidate.providerId,
                    credential: candidate.credential,
                    endpoint: '/images/generations',
                    model: candidate.upstreamModel,
                    statusCode: providerError.status || 502,
                    usage: {
                        counterType,
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                        providerUnits: counterType === 'requests' ? 1 : 0,
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

        const data = providerResult.normalizedData || {};

        if (usedDb) {
            logUsage({
                identifier, apiKeyId: keyInfo.id, endpoint: '/images/generations',
                model: endpointModelLabel(selectedCandidate),
                inputTokens: 0,
                outputTokens: 0,
                ip: clientIP,
                fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                userAgent
            }).catch(() => {});
        }

        await recordProviderUsage({
            providerId: selectedCandidate.providerId,
            credential: selectedCandidate.credential,
            endpoint: '/images/generations',
            model: selectedCandidate.upstreamModel,
            statusCode: providerResult.response.status,
            usage: extractProviderUsage({
                providerId: selectedCandidate.providerId,
                providerDefinition: selectedCandidate.providerDefinition,
                credential: selectedCandidate.credential,
                responseHeaders: providerResult.response.headers,
                responseData: data,
                fallbackPromptTokens: 0,
                fallbackCompletionTokens: 0
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

    } catch (err) {
        console.error('[generations] handler error:', err.name, err.message);

        if (queueId) {
            await completeQueueItem({
                queueId,
                status: 'error',
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
        clearTimeout(upstreamTimer);
        if (usedDb) {
            await closePool();
        }
    }
}
