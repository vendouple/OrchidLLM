/**
 * /api/images/generations - Image Generation Proxy
 *
 * Same DB-guard pattern as /api/chat/completions:
 *  - isDbConfigured() checked synchronously up front — no oracledb hang.
 *  - BYOP: zero DB, direct passthrough.
 *  - Demo without DB: allowed anonymously (no tracking).
 */

import { detectKeyType, validateApiKey, getPollinationsServerKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession } from '../../lib/usage.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool, isDbConfigured } from '../../lib/oracle.js';

const POLLINATIONS_BASE  = 'https://gen.pollinations.ai/v1';
const DB_TIMEOUT_MS      = Number(process.env.DB_TIMEOUT_MS || 8000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_FETCH_TIMEOUT_MS || 60000);

function withDbTimeout(promise, fallback, label = 'DB') {
    return Promise.race([
        promise,
        new Promise(resolve =>
            setTimeout(() => {
                console.warn(`[generations] ${label} timed out after ${DB_TIMEOUT_MS}ms — using fallback`);
                resolve(fallback);
            }, DB_TIMEOUT_MS)
        )
    ]);
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

        const body    = req.body;
        const { prompt, model } = body;

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        const targetKey = keyInfo.type === 'byop'
            ? keyInfo.actualKey
            : getPollinationsServerKey();

        if (!targetKey || !String(targetKey).trim()) {
            return res.status(500).json({
                error: 'Server misconfiguration',
                message: 'Missing POLLINATIONS_API_KEY env var.'
            });
        }

        const upstream = await fetch(`${POLLINATIONS_BASE}/images/generations`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${targetKey}`
            },
            body: JSON.stringify(body),
            signal: upstreamCtrl.signal   // covers connect + headers + body
        });

        if (!upstream.ok) {
            const errBody = await upstream.json().catch(() => ({}));
            return res.status(upstream.status).json({
                error:   'Upstream API error',
                message: errBody.error?.message || errBody.message || 'Unknown error'
            });
        }

        // Body read is also covered by upstreamCtrl.signal
        let data;
        try {
            data = await upstream.json();
        } catch (readErr) {
            if (readErr.name === 'AbortError') {
                return res.status(504).json({
                    error:   'Gateway timeout',
                    message: `Upstream body stalled after ${UPSTREAM_TIMEOUT_MS / 1000}s`
                });
            }
            throw readErr;
        }

        if (usedDb) {
            logUsage({
                identifier, apiKeyId: keyInfo.id, endpoint: '/images/generations',
                model: model || 'default', inputTokens: 0, outputTokens: 0,
                ip: clientIP, userAgent
            }).catch(() => {});
        }

        res.status(200).json(data);

    } catch (err) {
        console.error('[generations] handler error:', err.name, err.message);
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
