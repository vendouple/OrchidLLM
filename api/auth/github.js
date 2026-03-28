/**
 * /api/auth/github - GitHub OAuth Initiation & Callback
 * 
 * Handles both:
 * - GET without code: Redirects to GitHub for authentication
 * - GET with code: Handles OAuth callback from GitHub
 */

import { 
    generateState, 
    getGitHubAuthUrl,
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
    
    // If no code, this is an initiation request
    if (!code) {
        try {
            // Generate state for CSRF protection
            const state = generateState();
            
            // Store state in a cookie for validation
            res.setHeader('Set-Cookie', [
                `oauth_state=${state}`,
                'Path=/',
                'HttpOnly',
                'Secure',
                'SameSite=Lax',
                'Max-Age=600' // 10 minutes
            ].join('; '));
            
            // Redirect to GitHub
            const authUrl = getGitHubAuthUrl(state, req);
            sendRedirect(res, authUrl);
        } catch (error) {
            console.error('GitHub auth error:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        } finally {
            await closePool();
        }
        return;
    }
    
    // If code is present, this is a callback
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
        
        // Check if user is admin
        if (!isAdmin(user.login)) {
            // Not authorized - sign out immediately
            clearSessionCookie(res);
            return sendRedirect(res, '/?error=signin_unavailable');
        }
        
        // Create session
        const { sessionId, expiresAt } = await createSession(user);
        
        // Set session cookie
        setSessionCookie(res, sessionId, expiresAt);
        
        // Redirect to admin dashboard
        sendRedirect(res, '/admin.html');
    } catch (error) {
        console.error('OAuth callback error:', error);
        sendRedirect(res, `/?error=${encodeURIComponent(error.message)}`);
    } finally {
        await closePool();
    }
}
