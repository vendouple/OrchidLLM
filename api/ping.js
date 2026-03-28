/**
 * /api/ping - Keep DB Awake + Cleanup
 * 
 * Called daily by Vercel cron to:
 * 1. Keep Oracle DB connection alive
 * 2. Clean up unused demo keys (30+ days inactive)
 * 
 * Returns 503 immediately if Oracle is not configured — no hang.
 */

import { executeQuery, closePool, isDbConfigured } from '../lib/oracle.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Bail out immediately if Oracle isn't configured — avoids a 300 s hang
    if (!isDbConfigured()) {
        return res.status(503).json({
            status: 'no-db',
            message: 'Oracle database is not configured. Set ORACLE_DB_USER, ORACLE_DB_PASSWORD, and ORACLE_DB_CONNECTION_STRING.'
        });
    }

    try {
        // Simple query to keep connection alive
        const result = await executeQuery('SELECT 1 AS alive FROM DUAL');
        
        // Cleanup: Delete demo keys unused for 30+ days with no usage logs
        let deletedKeys = 0;
        try {
            const cleanupResult = await executeQuery(
                `DELETE FROM api_keys 
                 WHERE key_type = 'demo' 
                 AND is_active = 1 
                 AND last_used < SYSDATE - 30
                 AND (SELECT COUNT(*) FROM usage_logs WHERE api_key_id = api_keys.id) = 0`
            );
            deletedKeys = cleanupResult.rowsAffected;
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
        }
        
        // Cleanup orphaned demo sessions
        try {
            await executeQuery(`DELETE FROM demo_sessions WHERE last_seen < SYSDATE - 30`);
        } catch (sessionCleanupError) {
            console.error('Session cleanup error:', sessionCleanupError);
        }
        
        // Cleanup expired sessions
        try {
            await executeQuery(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`);
        } catch (sessionExpireError) {
            console.error('Session expire cleanup error:', sessionExpireError);
        }
        
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            db: result.rows[0],
            cleanup: { deletedKeys }
        });

    } catch (error) {
        console.error('Ping error:', error);
        res.status(500).json({ 
            error: 'Database connection failed',
            message: error.message 
        });
    } finally {
        await closePool();
    }
}
