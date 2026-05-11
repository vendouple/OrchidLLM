/**
 * GET /api/auth/github — Initiate GitHub OAuth flow
 */
import { generateState, getGitHubAuthUrl, sendRedirect } from '../../lib/auth.js';
import { applyCors, serializeCookie, appendSetCookie } from '../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

    try {
        const state = generateState();
        appendSetCookie(res, serializeCookie('oauth_state', state, { maxAge: 600 }));
        const authUrl = getGitHubAuthUrl(state, req);
        sendRedirect(res, authUrl);
    } catch (err) {
        console.error('[auth/github]', err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: { message: 'OAuth configuration error.' } }));
    }
}
