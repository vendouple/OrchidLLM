/**
 * /api/admin/tiers — Subscription Tier CRUD
 * GET    → list all tiers
 * GET?id → single tier
 * POST   → create tier
 * PUT?id → update tier
 * DELETE?id → soft-delete tier
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery('SELECT * FROM subscription_tiers WHERE id = :id', { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Tier not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM subscription_tiers ORDER BY sort_order ASC, id ASC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.name) return sendError(res, 400, 'missing_field', 'name is required.');
        const r = await executeQuery(`
            INSERT INTO subscription_tiers (
                name, display_color_token, sort_order,
                price_idr_monthly, price_usd_monthly, price_idr_yearly, price_usd_yearly,
                credits_standard_monthly, credits_fast_monthly,
                queue_priority_standard, queue_priority_fast, queue_priority_exhausted,
                rpm_normal, rpm_exhausted,
                max_concurrent_requests, max_concurrent_exhausted,
                batch_queue_slots, max_api_keys,
                supports_rollover, rollover_percentage, rollover_max_cap,
                supports_compression, strict_params_option,
                model_access_tier, supports_monthly_billing, supports_yearly_billing,
                exhaustion_model_access, exhaustion_context_lock, exhaustion_batch_access,
                exhaustion_message, is_active
            ) VALUES (
                :name, :displayColor, :sortOrder,
                :priceIdrM, :priceUsdM, :priceIdrY, :priceUsdY,
                :creditsStd, :creditsFast,
                :qpStd, :qpFast, :qpExhausted,
                :rpm, :rpmExhausted,
                :maxConc, :maxConcExhausted,
                :batchSlots, :maxKeys,
                :rollover, :rolloverPct, :rolloverCap,
                :compression, :strictParams,
                :modelAccess, :monthlyBilling, :yearlyBilling,
                :exhModelAccess, :exhContextLock, :exhBatchAccess,
                :exhMessage, :isActive
            ) RETURNING id INTO :outId
        `, {
            name: b.name,
            displayColor: b.display_color_token || null,
            sortOrder: b.sort_order ?? 0,
            priceIdrM: b.price_idr_monthly ?? 0,
            priceUsdM: b.price_usd_monthly ?? 0,
            priceIdrY: b.price_idr_yearly ?? 0,
            priceUsdY: b.price_usd_yearly ?? 0,
            creditsStd: b.credits_standard_monthly ?? 0,
            creditsFast: b.credits_fast_monthly ?? 0,
            qpStd: b.queue_priority_standard ?? 0,
            qpFast: b.queue_priority_fast ?? 0,
            qpExhausted: b.queue_priority_exhausted ?? 0,
            rpm: b.rpm_normal ?? 3,
            rpmExhausted: b.rpm_exhausted ?? 0,
            maxConc: b.max_concurrent_requests ?? 1,
            maxConcExhausted: b.max_concurrent_exhausted ?? 0,
            batchSlots: b.batch_queue_slots ?? 0,
            maxKeys: b.max_api_keys ?? 1,
            rollover: b.supports_rollover ? 1 : 0,
            rolloverPct: b.rollover_percentage ?? 0,
            rolloverCap: b.rollover_max_cap ?? 0,
            compression: b.supports_compression ? 1 : 0,
            strictParams: b.strict_params_option ? 1 : 0,
            modelAccess: b.model_access_tier || 'free',
            monthlyBilling: b.supports_monthly_billing !== false ? 1 : 0,
            yearlyBilling: b.supports_yearly_billing ? 1 : 0,
            exhModelAccess: b.exhaustion_model_access || 'locked',
            exhContextLock: b.exhaustion_context_lock || 'lock_to_base',
            exhBatchAccess: b.exhaustion_batch_access ? 1 : 0,
            exhMessage: b.exhaustion_message || null,
            isActive: b.is_active !== false ? 1 : 0,
            outId: { dir: 'out', type: 'NUMBER' }
        });
        const newId = Array.isArray(r.outBinds?.outId) ? r.outBinds.outId[0] : r.outBinds?.outId;
        return sendJson(res, 201, { id: newId, message: 'Tier created.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id query param required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id };
        const map = {
            name: 'name', display_color_token: 'displayColor', sort_order: 'sortOrder',
            price_idr_monthly: 'priceIdrM', price_usd_monthly: 'priceUsdM',
            price_idr_yearly: 'priceIdrY', price_usd_yearly: 'priceUsdY',
            credits_standard_monthly: 'creditsStd', credits_fast_monthly: 'creditsFast',
            queue_priority_standard: 'qpStd', queue_priority_fast: 'qpFast',
            queue_priority_exhausted: 'qpExhausted',
            rpm_normal: 'rpm', rpm_exhausted: 'rpmExhausted',
            max_concurrent_requests: 'maxConc', max_concurrent_exhausted: 'maxConcExhausted',
            batch_queue_slots: 'batchSlots', max_api_keys: 'maxKeys',
            supports_rollover: 'rollover', rollover_percentage: 'rolloverPct',
            rollover_max_cap: 'rolloverCap',
            supports_compression: 'compression', strict_params_option: 'strictParams',
            model_access_tier: 'modelAccess',
            supports_monthly_billing: 'monthlyBilling', supports_yearly_billing: 'yearlyBilling',
            exhaustion_model_access: 'exhModelAccess', exhaustion_context_lock: 'exhContextLock',
            exhaustion_batch_access: 'exhBatchAccess', exhaustion_message: 'exhMessage',
            is_active: 'isActive'
        };
        for (const [col, bind] of Object.entries(map)) {
            if (b[col] !== undefined) {
                const boolCols = ['supports_rollover','supports_compression','strict_params_option',
                    'supports_monthly_billing','supports_yearly_billing','exhaustion_batch_access','is_active'];
                binds[bind] = boolCols.includes(col) ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await executeQuery(`UPDATE subscription_tiers SET ${sets.join(', ')} WHERE id = :id`, binds);
        return sendJson(res, 200, { message: 'Tier updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id query param required.');
        await executeQuery('UPDATE subscription_tiers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = :id', { id });
        return sendJson(res, 200, { message: 'Tier deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
