/**
 * /api/admin/tiers
 * Full CRUD for named tiers with compatibility for legacy tier_level consumers.
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
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function isUniqueConstraintError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00001') || message.includes('unique constraint');
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

async function tierDefinitionsAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM tier_definitions WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

async function getTierDefinitionByName(tierName) {
    const result = await executeQuery(`
        SELECT id, tier_name, tier_code, sort_order, is_active
        FROM tier_definitions
        WHERE tier_name = :tierName
    `, { tierName });

    return result.rows?.[0] || null;
}

async function ensureTierDefinition({ tierName, tierCode, sortOrder }) {
    const existing = await getTierDefinitionByName(tierName);
    if (existing) {
        await executeQuery(`
            UPDATE tier_definitions
            SET tier_code = :tierCode,
                sort_order = :sortOrder,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        `, {
            id: existing.ID,
            tierCode: tierCode || existing.TIER_CODE,
            sortOrder: sortOrder ?? existing.SORT_ORDER ?? 0
        });
        return existing.ID;
    }

    const insertResult = await executeQuery(`
        INSERT INTO tier_definitions (
            tier_name,
            tier_code,
            sort_order,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            :tierName,
            :tierCode,
            :sortOrder,
            1,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        ) RETURNING id INTO :new_id
    `, {
        tierName,
        tierCode,
        sortOrder: sortOrder ?? 0,
        new_id: { dir: 'out', type: 'NUMBER' }
    });

    return insertResult?.outBinds?.new_id?.[0];
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        const hasTierDefinitions = await tierDefinitionsAvailable();

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
                    t.monthly_credits,
                    t.rollover_cap,
                    t.rollover_months,
                    t.queue_priority_fast,
                    t.queue_priority_std,
                    t.queue_priority_exhausted,
                    t.concurrent_requests,
                    t.concurrent_batches,
                    t.batch_discount_pct,
                    t.model_access_level,
                    t.is_active,
                    t.created_at,
                    td.tier_name AS definition_tier_name,
                    td.tier_code AS definition_tier_code,
                    td.sort_order AS definition_sort_order
                FROM tiers t
                LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                ORDER BY NVL(td.sort_order, t.sort_order) ASC, t.tier_name ASC
            `);
            return res.status(200).json(result.rows || []);
        }

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
                `SELECT 1 FROM tiers WHERE tier_name = :tierName OR tier_level = :tierLevel`,
                { tierName, tierLevel }
            );
            if (existing.rows && existing.rows.length > 0) {
                return res.status(409).json({ error: 'tierName and tierLevel must be unique' });
            }

            let tierDefinitionId = null;
            if (hasTierDefinitions) {
                tierDefinitionId = await ensureTierDefinition({ tierName, tierCode, sortOrder });
            }

            await executeQuery(`
                INSERT INTO tiers (
                    name,
                    tier_name,
                    tier_level,
                    tier_code,
                    tier_definition_id,
                    sort_order,
                    price_idr,
                    monthly_credits,
                    rollover_cap,
                    rollover_months,
                    queue_priority_fast,
                    queue_priority_std,
                    queue_priority_exhausted,
                    concurrent_requests,
                    concurrent_batches,
                    batch_discount_pct,
                    model_access_level,
                    is_active
                ) VALUES (
                    :name,
                    :tier_name,
                    :tier_level,
                    :tier_code,
                    :tier_definition_id,
                    :sort_order,
                    :price_idr,
                    :monthly_credits,
                    :rollover_cap,
                    :rollover_months,
                    :queue_priority_fast,
                    :queue_priority_std,
                    :queue_priority_exhausted,
                    :concurrent_requests,
                    :concurrent_batches,
                    :batch_discount_pct,
                    :model_access_level,
                    :is_active
                )
            `, {
                name: displayName,
                tier_name: tierName,
                tier_level: tierLevel,
                tier_code: tierCode,
                tier_definition_id: tierDefinitionId,
                sort_order: sortOrder,
                price_idr: normalizeNumber(body.priceIdr, 0),
                monthly_credits: normalizeNumber(body.monthlyCredits, 0),
                rollover_cap: normalizeNumber(body.rolloverCap, null),
                rollover_months: normalizeNumber(body.rolloverMonths, null),
                queue_priority_fast: normalizeNumber(body.queuePriorityFast, 0),
                queue_priority_std: normalizeNumber(body.queuePriorityStd, 0),
                queue_priority_exhausted: normalizeNumber(body.queuePriorityExhausted, 0),
                concurrent_requests: normalizeNumber(body.concurrentRequests, 1),
                concurrent_batches: normalizeNumber(body.concurrentBatches, 0),
                batch_discount_pct: normalizeNumber(body.batchDiscountPct, null),
                model_access_level: normalizeString(body.modelAccessLevel || tierName) || tierName,
                is_active: body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1
            });
            return res.status(201).json({ success: true });
        }

        if (req.method === 'PUT') {
            const { id, ...body } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });

            const tierName = normalizeString(body.tierName || body.name);
            const displayName = normalizeString(body.name || tierName);
            const tierLevel = normalizeString(body.tierLevel || tierName);
            const tierCode = slugifyTierCode(body.tierCode || tierName || tierLevel);
            const sortOrder = normalizeNumber(body.sortOrder, 0);

            const existing = await executeQuery(
                `SELECT 1 FROM tiers WHERE (tier_name = :tierName OR tier_level = :tierLevel) AND id != :id`,
                { tierName, tierLevel, id }
            );
            if (existing.rows && existing.rows.length > 0) {
                return res.status(409).json({ error: 'tierName and tierLevel must be unique' });
            }

            let tierDefinitionId = null;
            if (hasTierDefinitions) {
                tierDefinitionId = await ensureTierDefinition({ tierName, tierCode, sortOrder });
            }

            await executeQuery(`
                UPDATE tiers SET
                    name = :name,
                    tier_name = :tier_name,
                    tier_level = :tier_level,
                    tier_code = :tier_code,
                    tier_definition_id = :tier_definition_id,
                    sort_order = :sort_order,
                    price_idr = :price_idr,
                    monthly_credits = :monthly_credits,
                    rollover_cap = :rollover_cap,
                    rollover_months = :rollover_months,
                    queue_priority_fast = :queue_priority_fast,
                    queue_priority_std = :queue_priority_std,
                    queue_priority_exhausted = :queue_priority_exhausted,
                    concurrent_requests = :concurrent_requests,
                    concurrent_batches = :concurrent_batches,
                    batch_discount_pct = :batch_discount_pct,
                    model_access_level = :model_access_level,
                    is_active = :is_active
                WHERE id = :id
            `, {
                id,
                name: displayName,
                tier_name: tierName,
                tier_level: tierLevel,
                tier_code: tierCode,
                tier_definition_id: tierDefinitionId,
                sort_order: sortOrder,
                price_idr: normalizeNumber(body.priceIdr, 0),
                monthly_credits: normalizeNumber(body.monthlyCredits, 0),
                rollover_cap: normalizeNumber(body.rolloverCap, null),
                rollover_months: normalizeNumber(body.rolloverMonths, null),
                queue_priority_fast: normalizeNumber(body.queuePriorityFast, 0),
                queue_priority_std: normalizeNumber(body.queuePriorityStd, 0),
                queue_priority_exhausted: normalizeNumber(body.queuePriorityExhausted, 0),
                concurrent_requests: normalizeNumber(body.concurrentRequests, 1),
                concurrent_batches: normalizeNumber(body.concurrentBatches, 0),
                batch_discount_pct: normalizeNumber(body.batchDiscountPct, null),
                model_access_level: normalizeString(body.modelAccessLevel || tierName) || tierName,
                is_active: body.isActive ? 1 : 0
            });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const id = req.query.id || req.body?.id;
            if (!id) return res.status(400).json({ error: 'id required' });

            const userCheck = await executeQuery(
                `SELECT COUNT(*) AS cnt FROM users WHERE tier_id = :id`,
                { id }
            );
            const userCount = userCheck.rows?.[0]?.CNT || 0;
            if (userCount > 0) {
                return res.status(409).json({ error: 'Cannot delete tier: users are assigned to it' });
            }

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
