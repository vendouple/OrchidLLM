/**
 * /api/user/announcements — User Announcements
 * GET → active announcements/changelogs (excluding dismissed)
 * POST?action=dismiss&id=N → dismiss an announcement
 */
import { withAuth } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID.');

    if (req.method === 'GET') {
        const r = await executeQuery(`
            SELECT a.* FROM announcements a
            WHERE a.is_active = 1
              AND a.id NOT IN (SELECT announcement_id FROM user_dismissed_announcements WHERE user_id = :userId)
            ORDER BY a.created_at DESC
        `, { userId });

        // Separate banners (max 3) from rest
        const banners = r.rows.filter(a => a.IS_BANNER === 1).slice(0, 3);
        const items = r.rows;
        return sendJson(res, 200, { banners, items });
    }

    if (req.method === 'POST' && req.query?.action === 'dismiss') {
        const annId = req.query?.id;
        if (!annId) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery(`
            INSERT INTO user_dismissed_announcements (user_id, announcement_id)
            SELECT :userId, :annId FROM dual
            WHERE NOT EXISTS (SELECT 1 FROM user_dismissed_announcements WHERE user_id = :userId AND announcement_id = :annId)
        `, { userId, annId }).catch(() => {});
        return sendJson(res, 200, { message: 'Dismissed.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAuth(handler);
