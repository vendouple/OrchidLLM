/**
 * GET /api/auth/callback/github — GitHub OAuth callback
 *
 * Exchanges code for token, creates/updates user, sets session cookie.
 */
import {
    exchangeCodeForToken, getGitHubUser, findOrCreateUserFromGitHub,
    createSession, setSessionCookie, getBaseUrl, sendRedirect
} from '../../../lib/auth.js';
import { parseCookies, applyCors, serializeCookie, appendSetCookie } from '../../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);

    const baseUrl = getBaseUrl(req);
    const { code, state } = req.query || {};
    const cookies = parseCookies(req);

    if (!code) {
        return sendRedirect(res, `${baseUrl}/?error=no_code`);
    }
    if (!state || state !== cookies.oauth_state) {
        return sendRedirect(res, `${baseUrl}/?error=invalid_state`);
    }

    try {
        const tokenData = await exchangeCodeForToken(code);
        if (!tokenData?.access_token) throw new Error('No access token returned');

        const githubUser = await getGitHubUser(tokenData.access_token);
        const dbUser = await findOrCreateUserFromGitHub(githubUser);

        const { sessionId, expiresAt } = await createSession(
            githubUser, dbUser?.id, { isAdmin: dbUser?.isAdmin }
        );
        setSessionCookie(res, sessionId, expiresAt);

        // Clear OAuth state cookie
        appendSetCookie(res, serializeCookie('oauth_state', '', { maxAge: 0 }));

        sendRedirect(res, `${baseUrl}/`);
    } catch (err) {
        console.error('[auth/callback/github]', err);
        sendRedirect(res, `${baseUrl}/?error=auth_failed`);
    }
}
