/**
 * /api/auth/callback - GitHub OAuth Callback
 * 
 * Handles the OAuth callback from GitHub.
 * Only allows @vendouple to sign in.
 * Uses stateless HMAC-signed session cookies — no DB required.
 */

import { 
    exchangeCodeForToken, 
    getGitHubUser, 
    isAdmin, 
    createSession,
    setSessionCookie,
    clearSessionCookie,
    sendRedirect
} from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { code, state } = req.query;
    
    // Validate required parameters
    if (!code) {
        return sendRedirect(res, '/?error=no_code');
    }
    
    // Validate state (CSRF protection)
    const cookies = req.headers.cookie || '';
    const stateMatch = cookies.match(/oauth_state=([^;]+)/);
    const storedState = stateMatch ? decodeURIComponent(stateMatch[1]) : null;
    
    if (!storedState || storedState !== state) {
        console.error('State mismatch:', { storedState, receivedState: state });
        return sendRedirect(res, '/?error=invalid_state');
    }
    
    // Clear the oauth_state cookie immediately
    res.setHeader('Set-Cookie', [
        'oauth_state=',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Max-Age=0'
    ].join('; '));

    try {
        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code);
        
        if (tokenData.error) {
            console.error('Token exchange error:', tokenData.error, tokenData.error_description);
            return sendRedirect(res, `/?error=${encodeURIComponent(tokenData.error)}`);
        }
        
        if (!tokenData.access_token) {
            return sendRedirect(res, '/?error=no_access_token');
        }

        // Get user info
        const user = await getGitHubUser(tokenData.access_token);
        
        // Check if user is admin (only vendouple allowed)
        if (!isAdmin(user.login)) {
            clearSessionCookie(res);
            return sendRedirect(res, '/?error=signin_unavailable');
        }
        
        // Create stateless session token (no DB needed)
        const { sessionId, expiresAt } = await createSession(user);
        
        // Set session cookie
        setSessionCookie(res, sessionId, expiresAt);
        
        // Redirect to home
        sendRedirect(res, '/');
    } catch (error) {
        console.error('OAuth callback error:', error);
        sendRedirect(res, `/?error=${encodeURIComponent(error.message)}`);
    }
}
