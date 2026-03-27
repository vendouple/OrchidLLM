/**
 * /api/admin/dashboard - Admin Dashboard Stats
 * 
 * Returns statistics and key management data for admin
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Verify admin session
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);
        
        if (!session || !session.isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        // Get stats
        const statsResult = await executeQuery(`
            SELECT 
                (SELECT COUNT(*) FROM api_keys WHERE is_active = 1) as active_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'demo' AND is_active = 1) as demo_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'global' AND is_active = 1) as global_keys,
                (SELECT COUNT(*) FROM usage_logs WHERE TRUNC(created_at) = TRUNC(SYSDATE)) as requests_today,
                (SELECT SUM(input_tokens + output_tokens) FROM usage_logs) as total_tokens
            FROM DUAL
        `);
        
        // Get all keys
        const keysResult = await executeQuery(`
            SELECT 
                id, key, name, key_type, rpm, rpd, 
                input_token_limit, output_token_limit, queue_priority,
                usage_count, total_input_tokens, total_output_tokens,
                created_at, last_used, is_active
            FROM api_keys
            ORDER BY created_at DESC
            FETCH FIRST 100 ROWS ONLY
        `);
        
        // Get recent usage
        const usageResult = await executeQuery(`
            SELECT 
                identifier, endpoint, model, 
                input_tokens, output_tokens, 
                created_at
            FROM usage_logs
            ORDER BY created_at DESC
            FETCH FIRST 50 ROWS ONLY
        `);
        
        res.status(200).json({
            stats: statsResult.rows[0] || {},
            keys: keysResult.rows,
            recentUsage: usageResult.rows
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}