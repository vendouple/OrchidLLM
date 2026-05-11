/**
 * /api/admin/demo-keys — Demo Key Management
 * GET    → list demo keys
 * DELETE?id=UUID → hard delete (purge)
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method === 'GET') {
        const r = await executeQuery(
            'SELECT * FROM demo_keys ORDER BY last_used_at DESC FETCH FIRST 200 ROWS ONLY');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'DELETE') {
        const id = req.query?.id;
        if (!id) return sendError(res, 400, 'missing_id', 'id (UUID) required.');
        await executeQuery('DELETE FROM demo_keys WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Demo key purged.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
