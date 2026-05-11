/**
 * /api/admin/stats — Platform Statistics
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery, isDbConfigured } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');
    if (!isDbConfigured()) return sendJson(res, 200, { db: false });

    const [users, subs, providers, models, keys, demoKeys, recentRequests] = await Promise.all([
        executeQuery('SELECT COUNT(*) AS cnt FROM users WHERE is_deleted = 0').catch(() => ({ rows: [{ CNT: 0 }] })),
        executeQuery(`SELECT st.name, COUNT(*) AS cnt FROM user_subscriptions us
            JOIN subscription_tiers st ON st.id = us.tier_id
            WHERE us.status = 'active' GROUP BY st.name ORDER BY cnt DESC`).catch(() => ({ rows: [] })),
        executeQuery(`SELECT status, COUNT(*) AS cnt FROM providers GROUP BY status`).catch(() => ({ rows: [] })),
        executeQuery('SELECT COUNT(*) AS cnt FROM models WHERE is_active = 1').catch(() => ({ rows: [{ CNT: 0 }] })),
        executeQuery('SELECT COUNT(*) AS cnt FROM api_keys WHERE is_active = 1').catch(() => ({ rows: [{ CNT: 0 }] })),
        executeQuery('SELECT COUNT(*) AS cnt FROM demo_keys').catch(() => ({ rows: [{ CNT: 0 }] })),
        executeQuery(`SELECT COUNT(*) AS cnt FROM request_logs
            WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24' HOUR`).catch(() => ({ rows: [{ CNT: 0 }] })),
    ]);

    return sendJson(res, 200, {
        db: true,
        totalUsers: users.rows[0]?.CNT || 0,
        subscriptionBreakdown: subs.rows,
        providerStatus: providers.rows,
        activeModels: models.rows[0]?.CNT || 0,
        activeApiKeys: keys.rows[0]?.CNT || 0,
        activeDemoKeys: demoKeys.rows[0]?.CNT || 0,
        requestsLast24h: recentRequests.rows[0]?.CNT || 0,
    });
}

export default withAdmin(handler);
