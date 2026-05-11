/**
 * /api/admin/logs — Request + Routing Log Viewer
 * GET → query logs with filters
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');

    const type = req.query?.type || 'request'; // request | routing
    const userId = req.query?.user_id;
    const limit = Math.min(Number(req.query?.limit || 50), 500);
    const offset = Number(req.query?.offset || 0);

    if (type === 'routing') {
        let sql = 'SELECT * FROM routing_logs';
        const binds = {};
        if (userId) { sql += ' WHERE user_id = :userId'; binds.userId = userId; }
        sql += ' ORDER BY created_at DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';
        binds.offset = offset; binds.limit = limit;
        const r = await executeQuery(sql, binds);
        return sendJson(res, 200, { data: r.rows, type: 'routing' });
    }

    let sql = `SELECT rl.*, m.display_name AS model_name, m.model_slug
        FROM request_logs rl LEFT JOIN models m ON m.id = rl.model_id`;
    const binds = {};
    if (userId) { sql += ' WHERE rl.user_id = :userId'; binds.userId = userId; }
    sql += ' ORDER BY rl.created_at DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';
    binds.offset = offset; binds.limit = limit;
    const r = await executeQuery(sql, binds);
    return sendJson(res, 200, { data: r.rows, type: 'request' });
}

export default withAdmin(handler);
