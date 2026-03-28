/**
 * /api/auth/callback - GitHub OAuth Callback
 * 
 * Handles the OAuth callback from GitHub
 * Only allows @vendouple to sign in
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
import { closePool } from '../../lib/oracle.js';

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
    const storedState = stateMatch ? stateMatch[1] : null;
    
    if (!storedState || storedState !== state) {
        return sendRedirect(res, '/?error=invalid_state');
    }
    
    try {
        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code);
        
        if (tokenData.error) {
            return sendRedirect(res, `/?error=${tokenData.error}`);
        }
        
        // Get user info
        const user = await getGitHubUser(tokenData.access_token);
        
        // Check if user is admin (only vendouple allowed)
        if (!isAdmin(user.login)) {
            // Not authorized - sign out immediately
            clearSessionCookie(res);
            return sendRedirect(res, '/?error=signin_unavailable');
        }
        
        // Create session
        const { sessionId, expiresAt } = await createSession(user);
        
        // Set session cookie
        setSessionCookie(res, sessionId, expiresAt);
        
        // Redirect to home
        sendRedirect(res, '/');
    } catch (error) {
        console.error('OAuth callback error:', error);
        sendRedirect(res, `/?error=${encodeURIComponent(error.message)}`);
    } finally {
        await closePool();
    }
}
