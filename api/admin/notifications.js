/**
 * /api/admin/notifications — Admin Notification Bell
 * GET      → list notifications (optionally ?unread=1)
 * PUT?id=N → mark as read
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        const unreadOnly = req.query?.unread === '1';
        const sql = unreadOnly
            ? 'SELECT * FROM admin_notifications WHERE is_read = 0 ORDER BY created_at DESC FETCH FIRST 50 ROWS ONLY'
            : 'SELECT * FROM admin_notifications ORDER BY created_at DESC FETCH FIRST 100 ROWS ONLY';
        const r = await executeQuery(sql);
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'PUT' && id) {
        await executeQuery(
            'UPDATE admin_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP, read_by = :readBy WHERE id = :id',
            { id, readBy: req.auth?.userId || null });
        return sendJson(res, 200, { message: 'Notification marked as read.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
