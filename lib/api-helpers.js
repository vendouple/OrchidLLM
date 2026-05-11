/**
 * lib/api-helpers.js — Shared HTTP helpers for Vercel serverless functions
 */
import { parse as parseCookieHeader, serialize } from 'cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ── JSON Helpers ────────────────────────────────────────────────────────────

export function sendJson(res, status, data) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
}

export function sendError(res, status, code, message) {
    return sendJson(res, status, { error: { message, type: code, code } });
}

export function sendRedirect(res, url) {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
}

export async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

// ── Cookie Helpers ──────────────────────────────────────────────────────────

export function parseCookies(req) {
    return parseCookieHeader(req.headers?.cookie || '');
}

export function serializeCookie(name, value, opts = {}) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    return serialize(name, value, {
        path: '/',
        httpOnly: opts.httpOnly !== false,
        secure: isProd,
        sameSite: opts.sameSite || (isProd ? 'lax' : 'lax'),
        maxAge: opts.maxAge,
        ...opts,
    });
}

export function appendSetCookie(res, cookieStr) {
    const existing = res.getHeader('Set-Cookie');
    if (existing) {
        const arr = Array.isArray(existing) ? existing : [existing];
        arr.push(cookieStr);
        res.setHeader('Set-Cookie', arr);
    } else {
        res.setHeader('Set-Cookie', cookieStr);
    }
}

// ── CORS ────────────────────────────────────────────────────────────────────

export function applyCors(req, res) {
    const origin = req.headers?.origin || '';
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    const appUrl = process.env.APP_URL || '';

    if (allowed.length && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (appUrl && origin === appUrl) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Orchid-Demo-Key,X-Cron-Secret');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// ── Auth Context ────────────────────────────────────────────────────────────

const SESSION_SECRET = () => process.env.SESSION_SECRET || 'dev-fallback-secret-change-me';

function hmacSign(payload) {
    return createHmac('sha256', SESSION_SECRET()).update(payload).digest('hex');
}

export function verifySessionCookie(cookieValue) {
    if (!cookieValue) return null;
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = hmacSign(payload);
    try {
        if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    } catch { return null; }
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (data.exp && Date.now() > data.exp) return null;
        return data;
    } catch { return null; }
}

export function getBearerToken(req) {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return null;
}

/**
 * Resolve auth context from request headers/cookies.
 * Returns { authenticated, type, userId, isAdmin, ... }
 */
export async function resolveAuthContext(req, opts = {}) {
    // 1. API Key auth
    const bearer = getBearerToken(req);
    if (bearer && bearer.startsWith('sk-orch-')) {
        try {
            const { validateApiKey } = await import('./keys.js');
            const keyData = await validateApiKey(bearer);
            if (keyData) {
                return {
                    authenticated: true, type: 'api_key',
                    userId: keyData.userId, apiKey: keyData,
                    isAdmin: false,
                    modelAccessTier: keyData.modelAccessTier || 'free',
                    rpm: keyData.rpm || 3,
                };
            }
        } catch { /* fall through */ }
    }

    // 2. Demo key (UUID in bearer or header or cookie)
    const demoKeyId = bearer && !bearer.startsWith('sk-orch-') ? bearer
        : req.headers?.['x-orchid-demo-key']
        || parseCookies(req).orchid_demo_key;
    if (demoKeyId && opts.allowAnonymousDemo !== false) {
        try {
            const { executeQuery } = await import('./oracle.js');
            const r = await executeQuery('SELECT * FROM demo_keys WHERE id = :id', { id: demoKeyId });
            if (r.rows.length) {
                return {
                    authenticated: true, type: 'demo',
                    userId: null, isAdmin: false,
                    modelAccessTier: 'demo', rpm: 3,
                    demoKey: { demoKeyId, ...r.rows[0] },
                };
            }
        } catch { /* fall through */ }
    }

    // 3. Session cookie
    const cookies = parseCookies(req);
    const sessionData = verifySessionCookie(cookies.orchid_session);
    if (sessionData) {
        // Resolve full user from DB if we have userId
        let user = null;
        let tierId = null;
        let tierName = null;
        let modelAccessTier = 'free';
        let rpm = 3;
        if (sessionData.userId) {
            try {
                const { executeQuery } = await import('./oracle.js');
                const r = await executeQuery(`
                    SELECT u.*, us.tier_id, st.name AS tier_name, st.model_access_tier, st.rpm_normal
                    FROM users u
                    LEFT JOIN user_subscriptions us ON us.user_id = u.id
                    LEFT JOIN subscription_tiers st ON st.id = us.tier_id
                    WHERE u.id = :id AND u.is_deleted = 0
                `, { id: sessionData.userId });
                if (r.rows.length) {
                    user = r.rows[0];
                    tierId = user.TIER_ID;
                    tierName = user.TIER_NAME;
                    modelAccessTier = user.MODEL_ACCESS_TIER || 'free';
                    rpm = user.RPM_NORMAL || 3;
                }
            } catch { /* use session data fallback */ }
        }
        return {
            authenticated: true, type: 'session',
            userId: sessionData.userId, isAdmin: sessionData.isAdmin || false,
            session: sessionData, user,
            tierId, tierName, modelAccessTier, rpm,
        };
    }

    // 4. Anonymous
    return { authenticated: false, type: 'anonymous' };
}

// ── Misc ────────────────────────────────────────────────────────────────────

export function generateUuid() {
    return randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

export function inferPlatform(req) {
    const ua = (req.headers?.['user-agent'] || '').toLowerCase();
    if (/mobile|android|iphone|ipad/.test(ua)) return 'web_mobile';
    return 'web_desktop';
}
