/**
 * /api/announcements
 * User-facing announcements endpoint.
 * Returns active announcements for the current user, filtering read status,
 * plus a compatibility flat list for older clients.
 */

import { validateSession, getSessionFromCookie } from '../lib/auth.js';
import { executeQuery, closePool } from '../lib/oracle.js';

function safeJson(val, fallback = []) {
    try { return JSON.parse(val); } catch { return fallback; }
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function normalizeAnnouncementRow(row, githubId) {
    const readBy = safeJson(row.READ_BY, []);
    const isRead = githubId ? readBy.includes(githubId) : false;

    return {
        id: row.ID,
        title: row.TITLE,
        content: row.CONTENT,
        type: row.TYPE,
        isBanner: row.IS_BANNER === 1,
        isUrgent: row.IS_URGENT === 1,
        dismissible: row.DISMISSIBLE === 1,
        expiresAt: row.EXPIRES_AT,
        createdAt: row.CREATED_AT,
        isRead
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);
        const githubId = session?.githubId ? String(session.githubId) : null;

        let maxBanners = 3;
        try {
            const settingResult = await executeQuery(
                `SELECT setting_value FROM system_settings WHERE setting_key = 'max_banners'`
            );
            if (settingResult.rows && settingResult.rows.length > 0) {
                maxBanners = Number(settingResult.rows[0].SETTING_VALUE) || 3;
            }
        } catch {
            // optional table; ignore
        }

        const result = await executeQuery(`
            SELECT
                id,
                title,
                content,
                type,
                is_active,
                is_banner,
                is_urgent,
                dismissible,
                expires_at,
                read_by,
                created_at
            FROM announcements
            WHERE is_active = 1
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ORDER BY is_urgent DESC, is_banner DESC, created_at DESC
        `);

        const banners = [];
        const announcements = [];

        for (const row of result.rows || []) {
            const item = normalizeAnnouncementRow(row, githubId);

            if (item.isRead && !item.isUrgent && !item.isBanner) {
                continue;
            }

            if (item.isBanner) {
                banners.push(item);
            } else {
                announcements.push(item);
            }
        }

        const limitedBanners = banners.slice(0, maxBanners);
        const unreadCount = announcements.filter(item => !item.isRead).length + limitedBanners.filter(item => !item.isRead).length;
        const all = [...limitedBanners, ...announcements];

        return res.status(200).json({
            banners: limitedBanners,
            announcements,
            unreadCount,
            all
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(200).json({ banners: [], announcements: [], unreadCount: 0, all: [] });
        }
        console.error('[announcements] error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await closePool();
    }
}
