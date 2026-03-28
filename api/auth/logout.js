/**
 * /api/auth/logout - Logout
 * 
 * Clears the stateless HMAC session cookie.
 */

import { deleteSession, getSessionFromCookie, clearSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Get session from cookie (no-op for stateless sessions)
        const sessionId = getSessionFromCookie(req);
        if (sessionId) {
            await deleteSession(sessionId);
        }
        
        // Clear session cookie
        clearSessionCookie(res);
        
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}