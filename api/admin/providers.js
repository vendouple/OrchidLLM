/**
 * /api/admin/providers — Provider CRUD
 * GET    → list | GET?id → single
 * POST   → create | PUT?id → update | DELETE?id → deactivate
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery('SELECT * FROM providers WHERE id = :id', { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Provider not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM providers ORDER BY name ASC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.name || !b.base_url) return sendError(res, 400, 'missing_field', 'name and base_url required.');
        const r = await executeQuery(`
            INSERT INTO providers (name, base_url, auth_type, env_key_prefix, auth_key_env, status, notes)
            VALUES (:name, :baseUrl, :authType, :envKeyPrefix, :authKeyEnv, :status, :notes)
            RETURNING id INTO :outId
        `, {
            name: b.name,
            baseUrl: b.base_url,
            authType: b.auth_type || 'bearer',
            envKeyPrefix: b.env_key_prefix || null,
            authKeyEnv: b.auth_key_env || null,
            status: b.status || 'active',
            notes: b.notes || null,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Provider created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        const fields = { name:'name', base_url:'baseUrl', auth_type:'authType',
            env_key_prefix:'envKeyPrefix', auth_key_env:'authKeyEnv',
            status:'status', notes:'notes' };
        for (const [col, bind] of Object.entries(fields)) {
            if (b[col] !== undefined) { binds[bind] = b[col]; sets.push(`${col} = :${bind}`); }
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await executeQuery(`UPDATE providers SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Provider updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery("UPDATE providers SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = :id", { id });
        return sendJson(res, 200, { message: 'Provider disabled.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
