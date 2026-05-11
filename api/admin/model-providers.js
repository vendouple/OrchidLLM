/**
 * /api/admin/model-providers — Model↔Provider mapping CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;
    const modelId = req.query?.model_id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery(`
                SELECT mp.*, p.name AS provider_name, p.base_url, m.display_name AS model_name
                FROM model_providers mp
                JOIN providers p ON p.id = mp.provider_id
                JOIN models m ON m.id = mp.model_id
                WHERE mp.id = :id`, { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const sql = modelId
            ? `SELECT mp.*, p.name AS provider_name FROM model_providers mp JOIN providers p ON p.id = mp.provider_id WHERE mp.model_id = :modelId ORDER BY mp.speed_priority ASC`
            : `SELECT mp.*, p.name AS provider_name, m.display_name AS model_name FROM model_providers mp JOIN providers p ON p.id = mp.provider_id JOIN models m ON m.id = mp.model_id ORDER BY m.model_slug, mp.speed_priority ASC`;
        const r = await executeQuery(sql, modelId ? { modelId } : {});
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.model_id || !b.provider_id || !b.provider_model_id)
            return sendError(res, 400, 'missing_field', 'model_id, provider_id, provider_model_id required.');
        const r = await executeQuery(`
            INSERT INTO model_providers (model_id, provider_id, provider_model_id, speed_priority,
                context_limit, supports_params, max_concurrent, status, notes, is_active)
            VALUES (:modelId, :providerId, :provModelId, :speed, :ctxLimit, :params, :maxConc, :status, :notes, :active)
            RETURNING id INTO :outId
        `, {
            modelId: b.model_id, providerId: b.provider_id,
            provModelId: b.provider_model_id, speed: b.speed_priority ?? 0,
            ctxLimit: b.context_limit || null,
            params: JSON.stringify(b.supports_params || {}),
            maxConc: b.max_concurrent ?? 5, status: b.status || 'active',
            notes: b.notes || null, active: b.is_active !== false ? 1 : 0,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Model-provider mapping created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        for (const [col, bind] of Object.entries({
            provider_model_id:'pmi', speed_priority:'sp', context_limit:'cl',
            max_concurrent:'mc', status:'st', notes:'nt', is_active:'ia'
        })) {
            if (b[col] !== undefined) {
                binds[bind] = col === 'is_active' ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        if (b.supports_params !== undefined) {
            binds.sp2 = JSON.stringify(b.supports_params);
            sets.push('supports_params = :sp2');
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        await executeQuery(`UPDATE model_providers SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Mapping updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE model_providers SET is_active = 0 WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Mapping deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
