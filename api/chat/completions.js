/**
 * /api/chat/completions - Chat Completions Proxy
 *
 * Key design decisions:
 *  - isDbConfigured() is checked FIRST (sync, no oracledb calls).
 *  - BYOP keys skip DB entirely (fast path).
 *  - A SINGLE AbortController + timeout covers the full upstream
 *    round-trip (fetch headers AND body read), not just the connect.
 *    This prevents a 300 s Vercel hang when Pollinations sends headers
 *    quickly but stalls the response body.
 */

import { detectKeyType, validateApiKey, isModelAllowed, isProviderAllowed, getPollinationsServerKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession, checkTokenLimits } from '../../lib/usage.js';
import { countMessagesTokens, estimateOutputTokens } from '../../lib/tokenizer.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool, isDbConfigured } from '../../lib/oracle.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';
const NVIDIA_BASE       = 'https://integrate.api.nvidia.com/v1';

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
    return Promise.race([
        promise,
        new Promise(resolve =>
            setTimeout(() => {
                console.warn(`[completions] ${label} timed out after ${DB_TIMEOUT_MS}ms — fail open`);
                resolve(fallback);
            }, DB_TIMEOUT_MS)
        )
    ]);
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
        const body = req.body;
        const { model, messages, stream } = body;

        if (!model || !messages) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'model and messages are required'
            });
        }

        // ── Provider / model access (global keys only) ───────────────────────
        if (!keyInfo.bypassLimits && keyInfo.type !== 'demo') {
            const provider = model.startsWith('nvidia/') ? 'nvidia' : 'pollinations';
            if (!isProviderAllowed(keyInfo, provider)) {
                return res.status(403).json({ error: 'Provider not allowed', message: `No access to ${provider}` });
            }
            if (!isModelAllowed(keyInfo, model)) {
                return res.status(403).json({ error: 'Model not allowed', message: `No access to ${model}` });
            }
        }

        // ── Token limits ─────────────────────────────────────────────────────
        let inputTokens = 0;
        if (!keyInfo.bypassLimits && keyInfo.inputTokenLimit !== -1) {
            inputTokens = await countMessagesTokens(messages);
            const estimatedOutput = estimateOutputTokens(inputTokens, model);
            const tc = await checkTokenLimits(keyInfo, inputTokens, estimatedOutput);
            if (!tc.allowed) {
                return res.status(400).json({ error: 'Token limit exceeded', message: tc.reason });
            }
        }

        // ── Select upstream target ───────────────────────────────────────────
        let targetUrl, targetKey;
        const requestBody = { ...body };

        if (model.startsWith('nvidia/')) {
            targetUrl         = NVIDIA_BASE;
            targetKey         = process.env.NVIDIA_API_KEY;
            requestBody.model = model.replace('nvidia/', '');
        } else {
            targetUrl = POLLINATIONS_BASE;
            targetKey = keyInfo.type === 'byop'
                ? keyInfo.actualKey
                : getPollinationsServerKey();
        }

        if (!targetKey || !String(targetKey).trim()) {
            return res.status(500).json({
                error: 'Server misconfiguration',
                message: model.startsWith('nvidia/')
                    ? 'Missing NVIDIA_API_KEY env var.'
                    : 'Missing POLLINATIONS_API_KEY env var.'
            });
        }

        // ── Forward to Pollinations / NVIDIA ─────────────────────────────────
        // NOTE: upstreamCtrl.signal is shared between the fetch() call AND the
        // subsequent body read (upstream.json / reader.read). This means the
        // abort fires on the full round-trip, not just connection establishment.
        let upstream;
        try {
            upstream = await fetch(`${targetUrl}/chat/completions`, {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${targetKey}`
                },
                body: JSON.stringify(requestBody),
                signal: upstreamCtrl.signal   // ← covers connect + headers
            });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                return res.status(504).json({
                    error: 'Gateway timeout',
                    message: `Upstream did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s`
                });
            }
            throw fetchErr;
        }

        if (!upstream.ok) {
            const errBody = await upstream.json().catch(() => ({}));
            return res.status(upstream.status).json({
                error:   'Upstream API error',
                status:  upstream.status,
                message: errBody.error?.message || errBody.message || upstream.statusText || 'Unknown error'
            });
        }

        // ── Consume response body (still under the same abort timer) ─────────
        if (stream) {
            res.setHeader('Content-Type',  'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection',    'keep-alive');

            const reader = upstream.body.getReader();
            let outputTokens = 0;
            try {
                while (true) {
                    // reader.read() also respects upstreamCtrl.signal
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = new TextDecoder().decode(value);
                    const m = chunk.match(/"completion_tokens":\s*(\d+)/);
                    if (m) outputTokens = parseInt(m[1]);
                    res.write(value);
                }
            } catch (readErr) {
                if (readErr.name === 'AbortError') {
                    res.write('data: [DONE]\n\n');
                }
                // else re-throw handled by outer catch
            } finally {
                res.end();
            }

            if (usedDb) {
                logUsage({
                    identifier, apiKeyId: keyInfo.id, endpoint: '/chat/completions',
                    model, inputTokens, outputTokens, ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }

        } else {
            // Non-streaming: body read is covered by upstreamCtrl.signal
            let data;
            try {
                data = await upstream.json();
            } catch (readErr) {
                if (readErr.name === 'AbortError') {
                    return res.status(504).json({
                        error: 'Gateway timeout',
                        message: `Upstream body stalled after ${UPSTREAM_TIMEOUT_MS / 1000}s`
                    });
                }
                throw readErr;
            }

            const outputTokens = data.usage?.completion_tokens || 0;
            const actualInput  = data.usage?.prompt_tokens || inputTokens;

            if (usedDb) {
                logUsage({
                    identifier, apiKeyId: keyInfo.id, endpoint: '/chat/completions',
                    model, inputTokens: actualInput, outputTokens, ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }

            res.status(200).json(data);
        }

    } catch (err) {
        console.error('[completions] handler error:', err.name, err.message);
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
