/**
 * /api/admin/tiers
 * Full CRUD for subscription tiers.
 * Supports: USD pricing, billing periods (monthly/quarterly/yearly),
 * disable_buying, fast_credits, standard_credits, rollover_pct, rollover_cap.
 * Changes apply at next billing cycle for existing users.
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

function isMissingTableError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('ora-00942') || msg.includes('table or view does not exist');
}

function isUniqueConstraintError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('ora-00001') || msg.includes('unique constraint');
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function slugifyTierCode(value) {
    return normalizeString(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || null;
}

function normalizeBillingPeriods(value) {
    const valid = ['monthly', 'quarterly', 'yearly'];
    if (Array.isArray(value)) {
        const filtered = value.filter(v => valid.includes(v));
        return filtered.length > 0 ? JSON.stringify(filtered) : '["monthly"]';
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return normalizeBillingPeriods(parsed);
        } catch { /* ignore */ }
    }
    return '["monthly"]';
}

function normalizeAccessLevel(value) {
    const v = normalizeString(value).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return v || null;
}

async function tierDefinitionsAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM tier_definitions WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

async function ensureTierDefinition({ tierName, tierCode, sortOrder }) {
    const existing = await executeQuery(
        `SELECT id, tier_code, sort_order FROM tier_definitions WHERE tier_name = :tierName`,
        { tierName }
    );
    if (existing.rows && existing.rows.length > 0) {
        const row = existing.rows[0];
        await executeQuery(`
            UPDATE tier_definitions
            SET tier_code = :tierCode, sort_order = :sortOrder,
                is_active = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        `, { id: row.ID, tierCode: tierCode || row.TIER_CODE, sortOrder: sortOrder ?? row.SORT_ORDER ?? 0 });
        return row.ID;
    }
    const ins = await executeQuery(`
        INSERT INTO tier_definitions (tier_name, tier_code, sort_order, is_active, created_at, updated_at)
        VALUES (:tierName, :tierCode, :sortOrder, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO :new_id
    `, { tierName, tierCode, sortOrder: sortOrder ?? 0, new_id: { dir: 'out', type: 'NUMBER' } });
    return ins?.outBinds?.new_id?.[0];
}

function buildTierBinds(body, { name, tierName, tierLevel, tierCode, sortOrder, tierDefinitionId }) {
    return {
        name,
        tier_name: tierName,
        tier_level: tierLevel,
        tier_code: tierCode,
        tier_definition_id: tierDefinitionId,
        sort_order: sortOrder,
        price_idr: normalizeNumber(body.priceIdr, 0),
        price_usd: normalizeNumber(body.priceUsd, 0),
        monthly_credits: normalizeNumber(body.monthlyCredits, 0),
        fast_credits: normalizeNumber(body.fastCredits, 0),
        standard_credits: normalizeNumber(body.standardCredits, normalizeNumber(body.monthlyCredits, 0)),
        rollover_pct: normalizeNumber(body.rolloverPct, null),
        rollover_cap: normalizeNumber(body.rolloverCap, null),
        rollover_months: normalizeNumber(body.rolloverMonths, null),
        billing_periods: normalizeBillingPeriods(body.billingPeriods),
        queue_priority_fast: normalizeNumber(body.queuePriorityFast, 0),
        queue_priority_std: normalizeNumber(body.queuePriorityStd, 0),
        queue_priority_exhausted: normalizeNumber(body.queuePriorityExhausted, 0),
        concurrent_requests: normalizeNumber(body.concurrentRequests, 1),
        concurrent_batches: normalizeNumber(body.concurrentBatches, 0),
        batch_discount_pct: normalizeNumber(body.batchDiscountPct, null),
        model_access_level: normalizeAccessLevel(body.modelAccessLevel),
        disable_buying: body.disableBuying ? 1 : 0,
        is_active: body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1
    };
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        const hasTierDefinitions = await tierDefinitionsAvailable();

        // ── GET ─────────────────────────────────────────────────────────────
        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT
                    t.id,
                    t.name,
                    t.tier_name,
                    t.tier_level,
                    t.tier_code,
                    t.tier_definition_id,
                    t.sort_order,
                    t.price_idr,
                    t.price_usd,
                    t.monthly_credits,
                    t.fast_credits,
                    t.standard_credits,
                    t.rollover_pct,
                    t.rollover_cap,
                    t.rollover_months,
                    t.billing_periods,
                    t.queue_priority_fast,
                    t.queue_priority_std,
                    t.queue_priority_exhausted,
                    t.concurrent_requests,
                    t.concurrent_batches,
                    t.batch_discount_pct,
                    t.model_access_level,
                    t.disable_buying,
                    t.is_active,
                    t.created_at,
                    td.tier_name  AS definition_tier_name,
                    td.tier_code  AS definition_tier_code,
                    td.sort_order AS definition_sort_order
                FROM tiers t
                LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                ORDER BY NVL(td.sort_order, t.sort_order) ASC, t.tier_name ASC
            `);
            const rows = (result.rows || []).map(r => ({
                id: r.ID, name: r.NAME, tierName: r.TIER_NAME, tierLevel: r.TIER_LEVEL,
                tierCode: r.TIER_CODE, tierDefinitionId: r.TIER_DEFINITION_ID, sortOrder: r.SORT_ORDER,
                priceIdr: r.PRICE_IDR, priceUsd: r.PRICE_USD,
                monthlyCredits: r.MONTHLY_CREDITS, fastCredits: r.FAST_CREDITS, standardCredits: r.STANDARD_CREDITS,
                rolloverPct: r.ROLLOVER_PCT, rolloverCap: r.ROLLOVER_CAP, rolloverMonths: r.ROLLOVER_MONTHS,
                billingPeriods: r.BILLING_PERIODS, queuePriorityFast: r.QUEUE_PRIORITY_FAST,
                queuePriorityStd: r.QUEUE_PRIORITY_STD, queuePriorityExhausted: r.QUEUE_PRIORITY_EXHAUSTED,
                concurrentRequests: r.CONCURRENT_REQUESTS, concurrentBatches: r.CONCURRENT_BATCHES,
                batchDiscountPct: r.BATCH_DISCOUNT_PCT, modelAccessLevel: r.MODEL_ACCESS_LEVEL,
                disableBuying: r.DISABLE_BUYING, isActive: r.IS_ACTIVE, createdAt: r.CREATED_AT,
                definitionTierName: r.DEFINITION_TIER_NAME, definitionTierCode: r.DEFINITION_TIER_CODE
            }));
            return res.status(200).json(rows);
        }

        // ── POST ─────────────────────────────────────────────────────────────
        if (req.method === 'POST') {
            const body = req.body || {};
            const tierName = normalizeString(body.tierName || body.name);
            const displayName = normalizeString(body.name || tierName);
            const tierLevel = normalizeString(body.tierLevel || tierName);
            const tierCode = slugifyTierCode(body.tierCode || tierName || tierLevel);
            const sortOrder = normalizeNumber(body.sortOrder, 0);

            if (!displayName || !tierName) {
                return res.status(400).json({ error: 'name and tierName required' });
            }

            const existing = await executeQuery(
                `SELECT 1 FROM tiers WHERE name = :displayName OR tier_name = :tierName OR tier_level = :tierLevel`,
                { displayName, tierName, tierLevel }
            );
            if (existing.rows && existing.rows.length > 0) {
                return res.status(409).json({ error: 'Tier name, tier_name, and tier_level must all be unique' });
            }

            let tierDefinitionId = null;
            if (hasTierDefinitions) {
                tierDefinitionId = await ensureTierDefinition({ tierName, tierCode, sortOrder });
            }

            const binds = buildTierBinds(body, { name: displayName, tierName, tierLevel, tierCode, sortOrder, tierDefinitionId });

            await executeQuery(`
                INSERT INTO tiers (
                    name, tier_name, tier_level, tier_code, tier_definition_id, sort_order,
                    price_idr, price_usd,
                    monthly_credits, fast_credits, standard_credits,
                    rollover_pct, rollover_cap, rollover_months,
                    billing_periods,
                    queue_priority_fast, queue_priority_std, queue_priority_exhausted,
                    concurrent_requests, concurrent_batches, batch_discount_pct,
                    model_access_level, disable_buying, is_active
                ) VALUES (
                    :name, :tier_name, :tier_level, :tier_code, :tier_definition_id, :sort_order,
                    :price_idr, :price_usd,
                    :monthly_credits, :fast_credits, :standard_credits,
                    :rollover_pct, :rollover_cap, :rollover_months,
                    :billing_periods,
                    :queue_priority_fast, :queue_priority_std, :queue_priority_exhausted,
                    :concurrent_requests, :concurrent_batches, :batch_discount_pct,
                    :model_access_level, :disable_buying, :is_active
                )
            `, binds);
            return res.status(201).json({ success: true });
        }

        // ── PUT ─────────────────────────────────────────────────────────────
        if (req.method === 'PUT') {
            const { id, ...body } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });

            const tierName = normalizeString(body.tierName || body.name);
            const displayName = normalizeString(body.name || tierName);
            const tierLevel = normalizeString(body.tierLevel || tierName);
            const tierCode = slugifyTierCode(body.tierCode || tierName || tierLevel);
            const sortOrder = normalizeNumber(body.sortOrder, 0);

            const dup = await executeQuery(
                `SELECT 1 FROM tiers WHERE (tier_name = :tierName OR tier_level = :tierLevel) AND id != :id`,
                { tierName, tierLevel, id }
            );
            if (dup.rows && dup.rows.length > 0) {
                return res.status(409).json({ error: 'tierName and tierLevel must be unique' });
            }

            let tierDefinitionId = null;
            if (hasTierDefinitions) {
                tierDefinitionId = await ensureTierDefinition({ tierName, tierCode, sortOrder });
            }

            const binds = { id, ...buildTierBinds(body, { name: displayName, tierName, tierLevel, tierCode, sortOrder, tierDefinitionId }) };

            await executeQuery(`
                UPDATE tiers SET
                    name = :name,
                    tier_name = :tier_name,
                    tier_level = :tier_level,
                    tier_code = :tier_code,
                    tier_definition_id = :tier_definition_id,
                    sort_order = :sort_order,
                    price_idr = :price_idr,
                    price_usd = :price_usd,
                    monthly_credits = :monthly_credits,
                    fast_credits = :fast_credits,
                    standard_credits = :standard_credits,
                    rollover_pct = :rollover_pct,
                    rollover_cap = :rollover_cap,
                    rollover_months = :rollover_months,
                    billing_periods = :billing_periods,
                    queue_priority_fast = :queue_priority_fast,
                    queue_priority_std = :queue_priority_std,
                    queue_priority_exhausted = :queue_priority_exhausted,
                    concurrent_requests = :concurrent_requests,
                    concurrent_batches = :concurrent_batches,
                    batch_discount_pct = :batch_discount_pct,
                    model_access_level = :model_access_level,
                    disable_buying = :disable_buying,
                    is_active = :is_active
                WHERE id = :id
            `, binds);
            return res.status(200).json({ success: true });
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const id = req.query.id || req.body?.id;
            if (!id) return res.status(400).json({ error: 'id required' });

            const userCheck = await executeQuery(
                `SELECT COUNT(*) AS cnt FROM users WHERE tier_id = :id`,
                { id }
            );
            const userCount = userCheck.rows?.[0]?.CNT || 0;
            if (userCount > 0) {
                return res.status(409).json({
                    error: 'Cannot delete tier: users are assigned to it',
                    userCount
                });
            }

            // Soft delete: is_active=0 means invisible to users
            await executeQuery(`UPDATE tiers SET is_active = 0 WHERE id = :id`, { id });
            return res.status(200).json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({ error: 'tiers table not found. Run migrations first.' });
        }
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'A tier with this name, code, or level already exists.' });
        }
        console.error('[admin/tiers] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
