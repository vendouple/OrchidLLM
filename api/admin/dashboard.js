/**
 * /api/admin/dashboard - Admin Dashboard Stats
 *
 * Returns statistics and key management data for admin.
 * Includes demo session analytics for insight into anonymous users.
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

        // ── Overview stats ──────────────────────────────────────────────────
        const statsResult = await executeQuery(`
            SELECT
                (SELECT COUNT(*) FROM api_keys WHERE is_active = 1)                        AS active_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'demo'  AND is_active = 1) AS demo_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'global' AND is_active = 1) AS global_keys,
                (SELECT COUNT(*) FROM usage_logs WHERE TRUNC(created_at) = TRUNC(SYSDATE)) AS requests_today,
                (SELECT NVL(SUM(input_tokens + output_tokens), 0) FROM usage_logs)          AS total_tokens,
                -- Demo-session specific stats
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 0)                  AS active_demo_sessions,
                (SELECT COUNT(*) FROM demo_sessions
                 WHERE is_blocked = 0
                   AND last_seen >= SYSDATE - 1)                                           AS demo_active_24h,
                (SELECT COUNT(*) FROM demo_sessions
                 WHERE is_blocked = 0
                   AND last_seen >= SYSDATE - 7)                                           AS demo_active_7d,
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 1)                  AS blocked_sessions
            FROM DUAL
        `);

        // ── All API keys ────────────────────────────────────────────────────
        const keysResult = await executeQuery(`
            SELECT
                id, key, name, key_type, rpm, rpd,
                input_token_limit, output_token_limit, queue_priority,
                usage_count, total_input_tokens, total_output_tokens,
                created_at, last_used, is_active, expires_at
            FROM api_keys
            ORDER BY created_at DESC
            FETCH FIRST 100 ROWS ONLY
        `);

        // ── Recent usage logs ───────────────────────────────────────────────
        const usageResult = await executeQuery(`
            SELECT
                ul.identifier, ul.endpoint, ul.model,
                ul.input_tokens, ul.output_tokens,
                ul.ip_address, ul.fingerprint_hash,
                ul.created_at
            FROM usage_logs ul
            ORDER BY ul.created_at DESC
            FETCH FIRST 100 ROWS ONLY
        `);

        // ── Demo sessions list ──────────────────────────────────────────────
        const demoSessionsResult = await executeQuery(`
            SELECT
                ds.id, ds.composite_hash, ds.fingerprint_hash,
                ds.ip_address, ds.user_agent,
                ds.first_seen, ds.last_seen,
                ds.request_count, ds.is_blocked,
                ak.key AS api_key, ak.id AS api_key_id,
                ak.usage_count AS key_usage_count,
                ak.total_input_tokens, ak.total_output_tokens,
                -- Days since last activity (TRUNC both sides → plain NUMBER, avoids ORA-00932)
                TRUNC(SYSDATE) - TRUNC(NVL(ds.last_seen, ds.first_seen)) AS days_inactive
            FROM demo_sessions ds
            LEFT JOIN api_keys ak ON ds.api_key_id = ak.id
            ORDER BY NVL(ds.last_seen, ds.first_seen) DESC NULLS LAST
            FETCH FIRST 200 ROWS ONLY
        `);

        // ── Daily request chart data (last 14 days) ─────────────────────────
        const chartResult = await executeQuery(`
            SELECT
                TRUNC(created_at) AS day,
                COUNT(*) AS requests,
                NVL(SUM(input_tokens + output_tokens), 0) AS tokens
            FROM usage_logs
            WHERE created_at >= SYSDATE - 14
            GROUP BY TRUNC(created_at)
            ORDER BY day ASC
        `);

        res.status(200).json({
            stats:        statsResult.rows[0]     || {},
            keys:         keysResult.rows,
            recentUsage:  usageResult.rows,
            demoSessions: demoSessionsResult.rows,
            chartData:    chartResult.rows
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}