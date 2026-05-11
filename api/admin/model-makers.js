/**
 * /api/admin/model-makers — Model Maker CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery('SELECT * FROM model_makers WHERE id = :id', { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Maker not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM model_makers ORDER BY sort_order ASC, name ASC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.name || !b.slug) return sendError(res, 400, 'missing_field', 'name and slug required.');
        const r = await executeQuery(`
            INSERT INTO model_makers (name, slug, icon_url, description, website_url, sort_order, is_active)
            VALUES (:name, :slug, :iconUrl, :desc, :website, :sortOrder, :isActive)
            RETURNING id INTO :outId
        `, {
            name: b.name, slug: b.slug, iconUrl: b.icon_url || null,
            desc: b.description || null, website: b.website_url || null,
            sortOrder: b.sort_order ?? 0, isActive: b.is_active !== false ? 1 : 0,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Maker created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        for (const [col, bind] of Object.entries({
            name:'n', slug:'s', icon_url:'iu', description:'d',
            website_url:'wu', sort_order:'so', is_active:'ia'
        })) {
            if (b[col] !== undefined) {
                binds[bind] = col === 'is_active' ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await executeQuery(`UPDATE model_makers SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Maker updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE model_makers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Maker deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
