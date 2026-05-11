/**
 * /api/admin/announcements — Announcement & Changelog CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery('SELECT * FROM announcements WHERE id = :id', { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM announcements ORDER BY created_at DESC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.title) return sendError(res, 400, 'missing_field', 'title required.');
        const r = await executeQuery(`
            INSERT INTO announcements (title, description, type, tone, version_tag,
                related_announcement_id, is_banner, banner_expires_at, is_active, created_by)
            VALUES (:title, :desc, :type, :tone, :versionTag,
                :relatedId, :isBanner, :bannerExpires, :isActive, :createdBy)
            RETURNING id INTO :outId
        `, {
            title: b.title, desc: b.description || null,
            type: b.type || 'announcement', tone: b.tone || 'info',
            versionTag: b.version_tag || null,
            relatedId: b.related_announcement_id || null,
            isBanner: b.is_banner ? 1 : 0,
            bannerExpires: b.banner_expires_at || null,
            isActive: b.is_active !== false ? 1 : 0,
            createdBy: req.auth?.userId || null,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Announcement created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        for (const [col, bind] of Object.entries({
            title:'t', description:'d', type:'tp', tone:'tn', version_tag:'vt',
            related_announcement_id:'ri', is_banner:'ib', banner_expires_at:'be', is_active:'ia'
        })) {
            if (b[col] !== undefined) {
                const boolCols = ['is_banner', 'is_active'];
                binds[bind] = boolCols.includes(col) ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        await executeQuery(`UPDATE announcements SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Announcement updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE announcements SET is_active = 0 WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Announcement deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
