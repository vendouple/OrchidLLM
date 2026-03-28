/**
 * /api/chat/completions - Chat Completions Proxy
 *
 * Key design decisions:
 *  - isDbConfigured() is checked FIRST (sync, no oracledb calls).
 *    If Oracle env vars are absent, every request is treated as
 *    anonymous demo — no DB is touched, no hang possible.
 *  - BYOP keys skip DB entirely (fast path).
 *  - All DB calls are wrapped with a hard timeout so a reachable-but-
 *    slow Oracle also can't exceed the Vercel function limit.
 */

import { detectKeyType, validateApiKey, isModelAllowed, isProviderAllowed, getPollinationsServerKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession, checkTokenLimits } from '../../lib/usage.js';
import { countMessagesTokens, estimateOutputTokens } from '../../lib/tokenizer.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool, isDbConfigured } from '../../lib/oracle.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';
const NVIDIA_BASE      = 'https://integrate.api.nvidia.com/v1';

// Max time to wait for the upstream AI response
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_FETCH_TIMEOUT_MS || 55000);
// Max time to wait for any single DB call (should be << Vercel limit)
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 8000);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(tid);
    }
}

/**
 * Race a DB promise against a hard timeout.
 * On timeout, resolve to `fallback` (fail open) instead of throwing.
 */
function withDbTimeout(promise, fallback, label = 'DB') {
    return Promise.race([
        promise,
        new Promise(resolve =>
            setTimeout(() => {
                console.warn(`[completions] ${label} timed out after ${DB_TIMEOUT_MS}ms — using fallback`);
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
    const authHeader    = req.headers['authorization'];
    const rawKey        = authHeader?.replace('Bearer ', '').trim() || '';
    const clientIP      = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                          || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent     = req.headers['user-agent'] || 'unknown';

    // ── Decide whether we can use Oracle at all ──────────────────────────────
    const dbAvailable = isDbConfigured();
    let usedDb = false;

    try {
        let keyInfo    = null;
        let identifier = null;

        if (rawKey) {
            // ── Key supplied ─────────────────────────────────────────────────
            const keyType = detectKeyType(rawKey);

            if (keyType.type === 'byop') {
                // BYOP: zero DB — forward user's own key straight to Pollinations
                keyInfo    = { type: 'byop', actualKey: keyType.actualKey, bypassLimits: true };
                identifier = `byop:${rawKey.substring(0, 20)}`;

            } else if (keyType.needsDbValidation) {
                if (!dbAvailable) {
                    // DB not configured — reject with a clear error so the
                    // caller knows to use BYOP or wait for DB to be set up
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
            // ── No key — demo / anonymous mode ───────────────────────────────
            let fingerprint = {};
            if (fingerprintStr) {
                try { fingerprint = JSON.parse(fingerprintStr); } catch { /* ignore */ }
            }
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);

            if (dbAvailable) {
                // Try to track session in DB; fall open if DB is slow/broken
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
                    type: 'demo',
                    id: demoSession.apiKeyId,
                    rpm: 5, rpd: 20,
                    inputTokenLimit: 10000, outputTokenLimit: -1,
                    bypassLimits: false
                };
            } else {
                // No DB — graceful anonymous demo (no tracking, no rate-limiting)
                keyInfo = {
                    type: 'demo',
                    id: null,
                    rpm: 5, rpd: 20,
                    inputTokenLimit: 10000, outputTokenLimit: -1,
                    bypassLimits: false
                };
            }
            identifier = `demo:${compositeHash}`;
        }

        // ── Rate limiting (skip for BYOP / when DB not available) ────────────
        if (!keyInfo.bypassLimits && usedDb) {
            const rl = await withDbTimeout(
                checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd),
                { allowed: true, remaining: -1 },
                'checkRateLimit'
            );
            if (!rl.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    reason: rl.reason,
                    resetAt: rl.resetAt,
                    remaining: 0
                });
            }
        }

        // ── Parse request body ───────────────────────────────────────────────
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

        // ── Token limits (skip BYOP) ─────────────────────────────────────────
        let inputTokens = 0;
        if (!keyInfo.bypassLimits && keyInfo.inputTokenLimit !== -1) {
            inputTokens = await countMessagesTokens(messages);
            const estimatedOutput = estimateOutputTokens(inputTokens, model);
            const tc = await checkTokenLimits(keyInfo, inputTokens, estimatedOutput);
            if (!tc.allowed) {
                return res.status(400).json({ error: 'Token limit exceeded', message: tc.reason });
            }
        }

        // ── Select upstream ──────────────────────────────────────────────────
        let targetUrl, targetKey;
        const requestBody = { ...body };

        if (model.startsWith('nvidia/')) {
            targetUrl            = NVIDIA_BASE;
            targetKey            = process.env.NVIDIA_API_KEY;
            requestBody.model    = model.replace('nvidia/', '');
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

        // ── Forward to upstream ──────────────────────────────────────────────
        const upstream = await fetchWithTimeout(
            `${targetUrl}/chat/completions`,
            {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${targetKey}`
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!upstream.ok) {
            const errBody = await upstream.json().catch(() => ({}));
            return res.status(upstream.status).json({
                error:   'Upstream API error',
                status:  upstream.status,
                message: errBody.error?.message || errBody.message || upstream.statusText || 'Unknown error'
            });
        }

        // ── Return response ──────────────────────────────────────────────────
        if (stream) {
            res.setHeader('Content-Type',  'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection',    'keep-alive');

            const reader = upstream.body.getReader();
            let outputTokens = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = new TextDecoder().decode(value);
                    const m = chunk.match(/"completion_tokens":\s*(\d+)/);
                    if (m) outputTokens = parseInt(m[1]);
                    res.write(value);
                }
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
            const data          = await upstream.json();
            const outputTokens  = data.usage?.completion_tokens || 0;
            const actualInput   = data.usage?.prompt_tokens || inputTokens;

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
        console.error('[completions] handler error:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    } finally {
        if (usedDb) {
            await closePool();
        }
    }
}
