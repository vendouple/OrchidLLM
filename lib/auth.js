/**
 * GitHub OAuth Authentication
 * 
 * Handles:
 * - OAuth flow with GitHub
 * - Session management
 * - Admin-only access (vendouple)
 */

import { executeQuery } from './oracle.js';
import crypto from 'crypto';

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;
const VERCEL_URL = process.env.VERCEL_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key';

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

// Admin users (only these can sign in)
const ADMIN_USERS = ['vendouple'];

/**
 * Generate a secure session token
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
        redirect_uri: `${baseUrl}/api/auth/callback`,
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
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code
        })
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
    const response = await fetch('https://api.github.com/user', {
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

/**
 * Create a session in the database
 * @param {object} user - GitHub user object
 * @returns {Promise<{sessionId: string, expiresAt: Date}>}
 */
export async function createSession(user) {
    const sessionId = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await executeQuery(
        `INSERT INTO sessions (id, github_id, github_username, github_avatar, is_admin, expires_at)
         VALUES (:id, :githubId, :username, :avatar, :isAdmin, :expiresAt)`,
        {
            id: sessionId,
            githubId: user.id,
            username: user.login,
            avatar: user.avatar_url,
            isAdmin: isAdmin(user.login) ? 1 : 0,
            expiresAt
        }
    );
    
    return { sessionId, expiresAt };
}

/**
 * Validate a session
 * @param {string} sessionId - Session token
 * @returns {Promise<object|null>}
 */
export async function validateSession(sessionId) {
    if (!sessionId) return null;
    
    try {
        const result = await executeQuery(
            `SELECT id, github_id, github_username, github_avatar, is_admin, 
                    created_at, expires_at, last_accessed
             FROM sessions 
             WHERE id = :id AND expires_at > CURRENT_TIMESTAMP`,
            { id: sessionId }
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const session = result.rows[0];
        
        // Update last_accessed
        await executeQuery(
            `UPDATE sessions SET last_accessed = CURRENT_TIMESTAMP WHERE id = :id`,
            { id: sessionId }
        );
        
        return {
            id: session.ID,
            githubId: session.GITHUB_ID,
            githubUsername: session.GITHUB_USERNAME,
            githubAvatar: session.GITHUB_AVATAR,
            isAdmin: session.IS_ADMIN === 1,
            createdAt: session.CREATED_AT,
            expiresAt: session.EXPIRES_AT
        };
    } catch (error) {
        console.error('Error validating session:', error);
        return null;
    }
}

/**
 * Delete a session (logout)
 * @param {string} sessionId - Session token
 */
export async function deleteSession(sessionId) {
    if (!sessionId) return;
    
    try {
        await executeQuery(
            `DELETE FROM sessions WHERE id = :id`,
            { id: sessionId }
        );
    } catch (error) {
        console.error('Error deleting session:', error);
    }
}

/**
 * Clean up expired sessions
 * Should be called periodically
 */
export async function cleanupExpiredSessions() {
    try {
        const result = await executeQuery(
            `DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`
        );
        return result.rowsAffected;
    } catch (error) {
        console.error('Error cleaning up sessions:', error);
        return 0;
    }
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
 * @param {string} sessionId - Session token
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
