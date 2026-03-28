/**
 * /api/auth/session - Session Check
 * 
 * Returns current session info if authenticated.
 * Validates the HMAC-signed session cookie — no DB required.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Get session from cookie
        const sessionId = getSessionFromCookie(req);
        
        if (!sessionId) {
            return res.status(200).json({ 
                authenticated: false,
                message: 'No session found'
            });
        }
        
        // Validate session (stateless — no DB lookup)
        const session = await validateSession(sessionId);
        
        if (!session) {
            return res.status(200).json({ 
                authenticated: false,
                message: 'Session expired or invalid'
            });
        }
        
        res.status(200).json({
            authenticated: true,
            isAdmin: session.isAdmin,
            user: {
                username: session.githubUsername,
                avatar: session.githubAvatar
            },
            expiresAt: session.expiresAt
        });
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}