/**
 * GitHub OAuth Authentication
 * 
 * Handles:
 * - OAuth flow with GitHub
 * - Stateless HMAC-signed session cookies (no DB required)
 * - Admin-only access (vendouple)
 */

import crypto from 'crypto';

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;
const VERCEL_URL = process.env.VERCEL_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-change-me';
const GITHUB_FETCH_TIMEOUT_MS = Number(process.env.GITHUB_FETCH_TIMEOUT_MS || 10000);

// Session duration: 7 days
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Resolve application base URL for OAuth callbacks.
 * Priority: BASE_URL env -> request host/proto -> VERCEL_URL -> legacy fallback
 * @param {object} req - Vercel request object
 * @returns {string}
 */
export function getBaseUrl(req) {
    if (BASE_URL && BASE_URL.trim()) {
        return BASE_URL.trim().replace(/\/$/, '');
    }

    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    const proto = (typeof forwardedProto === 'string' && forwardedProto)
        ? forwardedProto.split(',')[0].trim()
        : 'https';
    const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;

    if (host && typeof host === 'string') {
        return `${proto}://${host}`.replace(/\/$/, '');
    }

    if (VERCEL_URL && VERCEL_URL.trim()) {
        return `https://${VERCEL_URL.trim()}`.replace(/\/$/, '');
    }

    return 'https://orchidllm.vercel.app';
}

/**
 * Send a redirect response without relying on framework-specific helpers.
 * @param {object} res - Vercel response object
 * @param {string} location - Redirect target
 * @param {number} statusCode - HTTP status code
 */
export function sendRedirect(res, location, statusCode = 302) {
    res.statusCode = statusCode;
    res.setHeader('Location', location);
    res.end();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GITHUB_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

// Admin users (only these can sign in)
const ADMIN_USERS = ['vendouple'];

/**
 * Generate a secure random token
 * @returns {string}
 */
export function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate state for CSRF protection
 * @returns {string}
 */
export function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Get GitHub OAuth authorization URL
 * @param {string} state - CSRF state
 * @param {object} req - Vercel request object
 * @returns {string}
 */
export function getGitHubAuthUrl(state, req) {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        throw new Error('GitHub OAuth is not configured. Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET.');
    }

    const baseUrl = getBaseUrl(req);

    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: `${baseUrl}/api/auth/callback/github`,
        scope: 'read:user user:email',
        state
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange code for access token
 * @param {string} code - OAuth code from GitHub
 * @returns {Promise<{access_token: string, token_type: string}>}
 */
export async function exchangeCodeForToken(code) {
    const response = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code
        }).toString()
    });
    
    if (!response.ok) {
        throw new Error('Failed to exchange code for token');
    }
    
    return response.json();
}

/**
 * Get GitHub user info
 * @param {string} accessToken - GitHub access token
 * @returns {Promise<object>}
 */
export async function getGitHubUser(accessToken) {
    const response = await fetchWithTimeout('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to get GitHub user');
    }
    
    return response.json();
}

/**
 * Check if user is admin
 * @param {string} username - GitHub username
 * @returns {boolean}
 */
export function isAdmin(username) {
    return ADMIN_USERS.includes(username);
}

// ─── Stateless HMAC Session (no DB required) ─────────────────────────────────

/**
 * Sign a payload with HMAC-SHA256 and return a compact token string.
 * Format: base64url(payload)|base64url(sig)
 */
function signSessionPayload(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(data)
        .digest('base64url');
    return `${data}.${sig}`;
}

/**
 * Verify and decode a signed session token.
 * Returns the payload or null if invalid/expired.
 */
function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) return null;

    const data = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    const expectedSig = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(data)
        .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Create a stateless session token for a GitHub user.
 * No DB write required.
 * @param {object} user - GitHub user object
 * @returns {{ sessionId: string, expiresAt: Date }}
 */
export async function createSession(user) {
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    const payload = {
        sub: String(user.id),
        login: user.login,
        avatar: user.avatar_url,
        admin: isAdmin(user.login),
        iat: Date.now(),
        exp: expiresAt.getTime()
    };

    const sessionId = signSessionPayload(payload);
    return { sessionId, expiresAt };
}

/**
 * Validate a session token (stateless — no DB lookup).
 * @param {string} sessionId - The signed session token
 * @returns {object|null}
 */
export async function validateSession(sessionId) {
    const payload = verifySessionToken(sessionId);
    if (!payload) return null;

    return {
        id: payload.sub,
        githubId: payload.sub,
        githubUsername: payload.login,
        githubAvatar: payload.avatar,
        isAdmin: payload.admin === true,
        createdAt: new Date(payload.iat),
        expiresAt: new Date(payload.exp)
    };
}

/**
 * Delete a session — with stateless tokens we just clear the cookie.
 * @param {string} sessionId - Session token (ignored, no DB)
 */
export async function deleteSession(sessionId) {
    // No-op: stateless sessions are invalidated by clearing the cookie
}

/**
 * Clean up expired sessions — no-op for stateless sessions.
 */
export async function cleanupExpiredSessions() {
    return 0;
}

/**
 * Get session from request cookies
 * @param {object} req - Vercel request object
 * @returns {string|null}
 */
export function getSessionFromCookie(req) {
    const cookies = req.headers.cookie;
    if (!cookies) return null;

    const match = cookies.match(/session=([^;]+)/);
    return match ? match[1] : null;
}

/**
 * Set session cookie
 * @param {object} res - Vercel response object
 * @param {string} sessionId - Signed session token
 * @param {Date} expiresAt - Expiration date
 */
export function setSessionCookie(res, sessionId, expiresAt) {
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    res.setHeader('Set-Cookie', [
        `session=${sessionId}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        `Max-Age=${maxAge}`
    ].join('; '));
}

/**
 * Clear session cookie
 * @param {object} res - Vercel response object
 */
export function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', [
        'session=',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Max-Age=0'
    ].join('; '));
}

export default {
    generateSessionToken,
    generateState,
    getGitHubAuthUrl,
    exchangeCodeForToken,
    getGitHubUser,
    isAdmin,
    createSession,
    validateSession,
    deleteSession,
    cleanupExpiredSessions,
    getSessionFromCookie,
    setSessionCookie,
    clearSessionCookie
};
