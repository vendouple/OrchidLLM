/**
 * /api/admin/models — Model Catalog CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery(`
                SELECT m.*, mm.name AS maker_name, mm.slug AS maker_slug, mm.icon_url AS maker_icon_url
                FROM models m LEFT JOIN model_makers mm ON mm.id = m.model_maker_id
                WHERE m.id = :id`, { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Model not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery(`
            SELECT m.*, mm.name AS maker_name, mm.slug AS maker_slug
            FROM models m LEFT JOIN model_makers mm ON mm.id = m.model_maker_id
            ORDER BY m.model_slug ASC`);
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.display_name || !b.model_slug) return sendError(res, 400, 'missing_field', 'display_name and model_slug required.');
        const r = await executeQuery(`
            INSERT INTO models (
                display_name, model_maker_id, model_slug, access_tier, modality,
                context_window_tiers, supports_streaming, supports_vision, supports_reasoning,
                supports_search, supports_caching, supports_function_calling,
                max_output_tokens, public_description, deprecation_date, is_active
            ) VALUES (
                :displayName, :makerId, :slug, :accessTier, :modality,
                :contextTiers, :streaming, :vision, :reasoning,
                :search, :caching, :funcCall,
                :maxOutput, :description, :deprecation, :isActive
            ) RETURNING id INTO :outId
        `, {
            displayName: b.display_name,
            makerId: b.model_maker_id || null,
            slug: b.model_slug,
            accessTier: b.access_tier || 'free',
            modality: b.modality || 'text',
            contextTiers: JSON.stringify(b.context_window_tiers || []),
            streaming: b.supports_streaming !== false ? 1 : 0,
            vision: b.supports_vision ? 1 : 0,
            reasoning: b.supports_reasoning ? 1 : 0,
            search: b.supports_search ? 1 : 0,
            caching: b.supports_caching ? 1 : 0,
            funcCall: b.supports_function_calling ? 1 : 0,
            maxOutput: b.max_output_tokens || null,
            description: b.public_description || null,
            deprecation: b.deprecation_date || null,
            isActive: b.is_active !== false ? 1 : 0,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Model created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        const fields = {
            display_name:'dn', model_maker_id:'mm', model_slug:'slug', access_tier:'at',
            modality:'mod', max_output_tokens:'maxOut', public_description:'desc',
            deprecation_date:'dep', is_active:'active'
        };
        const boolFields = { supports_streaming:'str', supports_vision:'vis',
            supports_reasoning:'reas', supports_search:'srch',
            supports_caching:'cache', supports_function_calling:'fc' };
        for (const [col, bind] of Object.entries(fields)) {
            if (b[col] !== undefined) {
                binds[bind] = col === 'is_active' ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        for (const [col, bind] of Object.entries(boolFields)) {
            if (b[col] !== undefined) { binds[bind] = b[col] ? 1 : 0; sets.push(`${col} = :${bind}`); }
        }
        if (b.context_window_tiers !== undefined) {
            binds.ctxTiers = JSON.stringify(b.context_window_tiers);
            sets.push('context_window_tiers = :ctxTiers');
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await executeQuery(`UPDATE models SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Model updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE models SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Model deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
