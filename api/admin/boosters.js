/**
 * /api/admin/boosters — Booster Pack CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery('SELECT * FROM booster_packs WHERE id = :id', { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM booster_packs ORDER BY name ASC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.name) return sendError(res, 400, 'missing_field', 'name required.');
        const r = await executeQuery(`
            INSERT INTO booster_packs (name, description, eligible_tiers, price_idr, price_usd,
                credits_standard, credits_fast, queue_priority_standard, queue_priority_fast,
                model_access_tier, context_unlock_tiers, duration_days, is_permanent,
                permanent_base_tier_id, ignore_plan_lock, max_purchases_per_user,
                max_total_purchases, available_from, available_until, is_active)
            VALUES (:name, :desc, :eligibleTiers, :priceIdr, :priceUsd,
                :creditsStd, :creditsFast, :qpStd, :qpFast,
                :modelAccess, :ctxUnlock, :duration, :isPerm,
                :permBase, :ignoreLock, :maxPerUser,
                :maxTotal, :availFrom, :availUntil, :isActive)
            RETURNING id INTO :outId
        `, {
            name: b.name, desc: b.description || null,
            eligibleTiers: JSON.stringify(b.eligible_tiers || []),
            priceIdr: b.price_idr ?? 0, priceUsd: b.price_usd ?? 0,
            creditsStd: b.credits_standard ?? 0, creditsFast: b.credits_fast ?? 0,
            qpStd: b.queue_priority_standard ?? 0, qpFast: b.queue_priority_fast ?? 0,
            modelAccess: b.model_access_tier || 'free',
            ctxUnlock: JSON.stringify(b.context_unlock_tiers || []),
            duration: b.duration_days ?? -1, isPerm: b.is_permanent ? 1 : 0,
            permBase: b.permanent_base_tier_id || null,
            ignoreLock: b.ignore_plan_lock ? 1 : 0,
            maxPerUser: b.max_purchases_per_user ?? -1,
            maxTotal: b.max_total_purchases ?? -1,
            availFrom: b.available_from || null, availUntil: b.available_until || null,
            isActive: b.is_active !== false ? 1 : 0,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Booster pack created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        const simple = { name:'n', description:'d', price_idr:'pi', price_usd:'pu',
            credits_standard:'cs', credits_fast:'cf', queue_priority_standard:'qs',
            queue_priority_fast:'qf', model_access_tier:'ma', duration_days:'dd',
            permanent_base_tier_id:'pb', max_purchases_per_user:'mpu',
            max_total_purchases:'mtp', available_from:'af', available_until:'au' };
        const bools = { is_permanent:'ip', ignore_plan_lock:'il', is_active:'ia' };
        const jsons = { eligible_tiers:'et', context_unlock_tiers:'cu' };
        for (const [col, bind] of Object.entries(simple)) {
            if (b[col] !== undefined) { binds[bind] = b[col]; sets.push(`${col} = :${bind}`); }
        }
        for (const [col, bind] of Object.entries(bools)) {
            if (b[col] !== undefined) { binds[bind] = b[col] ? 1 : 0; sets.push(`${col} = :${bind}`); }
        }
        for (const [col, bind] of Object.entries(jsons)) {
            if (b[col] !== undefined) { binds[bind] = JSON.stringify(b[col]); sets.push(`${col} = :${bind}`); }
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        await executeQuery(`UPDATE booster_packs SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Booster pack updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('UPDATE booster_packs SET is_active = 0 WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Booster pack deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
