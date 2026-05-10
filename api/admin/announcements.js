/**
 * /api/admin/announcements
 * Full CRUD with isBanner, isUrgent, dismissible flags.
 * Includes read/dismiss endpoints for per-user tracking.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

function safeJson(val, fallback = []) {
    try { return JSON.parse(val); } catch { return fallback; }
}

function toJsonStr(val) {
    if (!val) return null;
    if (typeof val === 'string') {
        try { JSON.parse(val); return val; } catch { return null; }
    }
    return JSON.stringify(val);
}

function parseDateOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

const ALLOWED_TYPES = new Set(['info', 'warning', 'error', 'success']);

export default async function handler(req, res) {
    try {
        const url = new URL(req.url || `http://localhost${req.query ? '' : ''}`, 'http://localhost');
        const pathParts = url.pathname.split('/').filter(Boolean);
        const maybeAction = pathParts[pathParts.length - 1];
        const idFromPath = pathParts.length >= 3 && !isNaN(Number(pathParts[pathParts.length - 2]))
            ? Number(pathParts[pathParts.length - 2])
            : null;

        // ── POST /api/admin/announcements/:id/read ──────────────────────────
        if (req.method === 'POST' && (maybeAction === 'read' || maybeAction === 'dismiss') && idFromPath) {
            const sessionId = getSessionFromCookie(req);
            const session = await validateSession(sessionId);
            if (!session || !session.githubId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const result = await executeQuery(
                `SELECT read_by FROM announcements WHERE id = :id`,
                { id: idFromPath }
            );
            if (!result.rows || result.rows.length === 0) {
                return res.status(404).json({ error: 'Announcement not found' });
            }

            const readBy = safeJson(result.rows[0].READ_BY, []);
            const githubId = String(session.githubId);
            if (!readBy.includes(githubId)) {
                readBy.push(githubId);
                await executeQuery(
                    `UPDATE announcements SET read_by = :read_by WHERE id = :id`,
                    { read_by: toJsonStr(readBy), id: idFromPath }
                );
            }
            return res.status(200).json({ success: true });
        }

        const session = await requireAdmin(req, res);
        if (!session) return;

        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT
                    id, title, content, type,
                    is_active, is_banner, is_urgent, dismissible,
                    expires_at, read_by, created_at, created_by
                FROM announcements
                ORDER BY is_urgent DESC, is_banner DESC, created_at DESC
            `);
            const rows = (result.rows || []).map(r => ({
                id: r.ID,
                title: r.TITLE,
                content: r.CONTENT,
                type: r.TYPE,
                isActive: r.IS_ACTIVE === 1,
                isBanner: r.IS_BANNER === 1,
                isUrgent: r.IS_URGENT === 1,
                dismissible: r.DISMISSIBLE === 1,
                expiresAt: r.EXPIRES_AT,
                readBy: safeJson(r.READ_BY, []),
                createdAt: r.CREATED_AT,
                createdBy: r.CREATED_BY
            }));
            return res.status(200).json(rows);
        }

        if (req.method === 'POST') {
            const body = req.body || {};
            if (!body.title || !body.content) {
                return res.status(400).json({ error: 'title and content are required' });
            }
            const type = ALLOWED_TYPES.has(body.type) ? body.type : 'info';
            const expiresAt = parseDateOrNull(body.expiresAt);

            await executeQuery(`
                INSERT INTO announcements (
                    title, content, type,
                    is_active, is_banner, is_urgent, dismissible,
                    expires_at, read_by, created_by
                ) VALUES (
                    :title, :content, :type,
                    :is_active, :is_banner, :is_urgent, :dismissible,
                    :expires_at, :read_by, :created_by
                )
            `, {
                title: body.title,
                content: body.content,
                type,
                is_active: body.isActive !== false ? 1 : 0,
                is_banner: body.isBanner ? 1 : 0,
                is_urgent: body.isUrgent ? 1 : 0,
                dismissible: body.dismissible !== false ? 1 : 0,
                expires_at: expiresAt,
                read_by: '[]',
                created_by: session.githubUsername || 'admin'
            });
            return res.status(201).json({ success: true });
        }

        if (req.method === 'PUT') {
            const { id, ...body } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });
            const type = ALLOWED_TYPES.has(body.type) ? body.type : 'info';
            const expiresAt = parseDateOrNull(body.expiresAt);

            await executeQuery(`
                UPDATE announcements SET
                    title = :title,
                    content = :content,
                    type = :type,
                    is_active = :is_active,
                    is_banner = :is_banner,
                    is_urgent = :is_urgent,
                    dismissible = :dismissible,
                    expires_at = :expires_at
                WHERE id = :id
            `, {
                id,
                title: body.title,
                content: body.content,
                type,
                is_active: body.isActive ? 1 : 0,
                is_banner: body.isBanner ? 1 : 0,
                is_urgent: body.isUrgent ? 1 : 0,
                dismissible: body.dismissible !== false ? 1 : 0,
                expires_at: expiresAt
            });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const id = req.query.id || (req.body || {}).id;
            if (!id) return res.status(400).json({ error: 'id required' });
            await executeQuery(`
                UPDATE announcements SET is_active = 0 WHERE id = :id
            `, { id });
            return res.status(200).json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({ error: 'announcements table not found. Run migrations first.' });
        }
        console.error('[admin/announcements] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
