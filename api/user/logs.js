/**
 * /api/user/logs — User Request History (30 day)
 * GET → paginated request logs (no routing detail)
 */
import { withAuth } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID.');

    const limit = Math.min(Number(req.query?.limit || 50), 200);
    const offset = Number(req.query?.offset || 0);

    const r = await executeQuery(`
        SELECT rl.id, rl.endpoint, rl.status, rl.credits_charged, rl.created_at,
            m.display_name AS model_name, m.model_slug, mm.name AS maker_name
        FROM request_logs rl
        LEFT JOIN models m ON m.id = rl.model_id
        LEFT JOIN model_makers mm ON mm.id = m.model_maker_id
        WHERE rl.user_id = :userId
        ORDER BY rl.created_at DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, { userId, offset, limit });

    return sendJson(res, 200, { data: r.rows, offset, limit });
}

export default withAuth(handler);
