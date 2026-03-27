/**
 * /api/auth/github - GitHub OAuth Initiation
 * 
 * Redirects to GitHub for authentication
 */

import { generateState, getGitHubAuthUrl } from '../../lib/auth.js';
import { closePool } from '../../lib/oracle.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
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
        const authUrl = getGitHubAuthUrl(state);
        res.redirect(authUrl);
    } catch (error) {
        console.error('GitHub auth error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
