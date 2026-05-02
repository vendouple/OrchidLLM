/**
 * /api/admin/usage - Admin usage logs.
 * Returns recent usage_logs entries (last 200 rows).
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Auth check
        const cookieHeader = req.headers.cookie || '';
        const sessionId = getSessionFromCookie(cookieHeader);
        if (!sessionId) return res.status(401).json({ error: 'Not authenticated' });

        const session = await validateSession(sessionId);
        if (!session || !session.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Query recent usage logs
        try {
            const result = await executeQuery(
                `SELECT id, identifier, model, input_tokens, output_tokens, ip_address, created_at
                 FROM usage_logs
                 ORDER BY created_at DESC
                 FETCH FIRST 200 ROWS ONLY`
            );
            return res.status(200).json(result.rows || []);
        } catch (error) {
            if (isMissingTableError(error)) {
                return res.status(200).json([]);
            }
            throw error;
        }
    } catch (error) {
        console.error('[admin/usage] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        await closePool();
    }
}
