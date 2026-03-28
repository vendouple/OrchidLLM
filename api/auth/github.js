/**
 * /api/auth/github - GitHub OAuth Initiation
 * 
 * GET without code: Redirects to GitHub for authentication
 */

import { 
    generateState, 
    getGitHubAuthUrl,
    sendRedirect
} from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
            return res.status(500).json({ 
                error: 'GitHub OAuth not configured',
                message: 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in Vercel environment variables.'
            });
        }

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
    }
}
