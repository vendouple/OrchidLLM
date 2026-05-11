/**
 * /api/admin/keys — Platform-wide API Key Oversight
 * GET → list all keys (filterable by user_id, status)
 * PUT?id=N → suspend/enable key
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method === 'GET') {
        const userId = req.query?.user_id;
        let sql = `SELECT ak.id, ak.user_id, ak.key_preview, ak.label, ak.is_active,
            ak.credit_limit_total, ak.credit_limit_daily, ak.credit_used_today, ak.credit_used_total,
            ak.created_at, ak.last_used_at, ak.expires_at,
            u.username FROM api_keys ak JOIN users u ON u.id = ak.user_id`;
        const binds = {};
        if (userId) { sql += ' WHERE ak.user_id = :userId'; binds.userId = userId; }
        sql += ' ORDER BY ak.created_at DESC FETCH FIRST 200 ROWS ONLY';
        const r = await executeQuery(sql, binds);
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'PUT') {
        const id = req.query?.id;
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        if (b.is_active !== undefined) {
            await executeQuery('UPDATE api_keys SET is_active = :active WHERE id = :id',
                { id, active: b.is_active ? 1 : 0 });
        }
        return sendJson(res, 200, { message: 'Key updated.' });
    }

    if (req.method === 'DELETE') {
        const id = req.query?.id;
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE api_keys SET is_active = 0 WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Key revoked.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
