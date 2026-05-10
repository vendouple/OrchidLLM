/**
 * /api/admin/recharge-packages
 * Full CRUD for recharge packages with named-tier targeting, expiry, discount
 * windows, and compatibility with tier_definitions when available.
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

function parseDateOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
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

async function resolveTierDefinitionId(targetTierName) {
    if (!targetTierName) return null;

    const result = await executeQuery(`
        SELECT id
        FROM tier_definitions
        WHERE tier_name = :tierName
          AND is_active = 1
    `, { tierName: targetTierName });

    return result.rows?.[0]?.ID || null;
}

async function validateTargetTierName(targetTierName, hasTierDefinitions) {
    if (!targetTierName) return { ok: true, tierDefinitionId: null };

    const tierCheck = await executeQuery(
        `SELECT 1 FROM tiers WHERE tier_name = :tierName AND is_active = 1`,
        { tierName: targetTierName }
    );
    if (!tierCheck.rows || tierCheck.rows.length === 0) {
        return { ok: false, error: 'targetTierName does not exist in tiers' };
    }

    if (!hasTierDefinitions) {
        return { ok: true, tierDefinitionId: null };
    }

    const tierDefinitionId = await resolveTierDefinitionId(targetTierName);
    if (!tierDefinitionId) {
        return { ok: false, error: 'targetTierName does not exist in tier_definitions' };
    }

    return { ok: true, tierDefinitionId };
}

function mapRechargeRow(row) {
    const now = new Date();
    const expiryDate = row.EXPIRY_DATE ? new Date(row.EXPIRY_DATE) : null;
    const isExpired = expiryDate ? now > expiryDate : false;
    const discountStart = row.DISCOUNT_START_DATE ? new Date(row.DISCOUNT_START_DATE) : null;
    const discountEnd = row.DISCOUNT_END_DATE ? new Date(row.DISCOUNT_END_DATE) : null;
    const isDiscountActive = Number(row.DISCOUNT_PCT || 0) > 0 &&
        (!discountStart || now >= discountStart) &&
        (!discountEnd || now <= discountEnd);

    return {
        id: row.ID,
        name: row.NAME,
        description: row.DESCRIPTION,
        credits: row.CREDITS,
        fastCredits: row.FAST_CREDITS || 0,
        standardCredits: row.STANDARD_CREDITS || 0,
        priceIdr: row.PRICE_IDR,
        originalPriceIdr: row.ORIGINAL_PRICE_IDR,
        discountPct: row.DISCOUNT_PCT,
        targetTierName: row.TARGET_TIER_NAME,
        targetTierDefinitionId: row.TARGET_TIER_DEFINITION_ID,
        expiryDate: row.EXPIRY_DATE,
        isDisabled: row.IS_DISABLED === 1,
        discountStartDate: row.DISCOUNT_START_DATE,
        discountEndDate: row.DISCOUNT_END_DATE,
        isActive: row.IS_ACTIVE === 1,
        createdAt: row.CREATED_AT,
        tierDisplayName: row.TIER_DISPLAY_NAME || row.TARGET_TIER_NAME || null,
        isExpired,
        isDiscountActive
    };
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        const hasTierDefinitions = await tierDefinitionsAvailable();

        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT
                    rp.id,
                    rp.name,
                    rp.description,
                    rp.credits,
                    rp.fast_credits,
                    rp.standard_credits,
                    rp.price_idr,
                    rp.original_price_idr,
                    rp.discount_pct,
                    rp.target_tier_name,
                    rp.target_tier_definition_id,
                    rp.expiry_date,
                    rp.is_disabled,
                    rp.discount_start_date,
                    rp.discount_end_date,
                    rp.is_active,
                    rp.created_at,
                    COALESCE(td.tier_name, t.tier_name) AS tier_display_name
                FROM recharge_packages rp
                LEFT JOIN tier_definitions td ON td.id = rp.target_tier_definition_id
                LEFT JOIN tiers t ON t.tier_name = rp.target_tier_name
                ORDER BY COALESCE(td.sort_order, t.sort_order, 999999) ASC, rp.price_idr ASC, rp.id ASC
            `);

            return res.status(200).json((result.rows || []).map(mapRechargeRow));
        }

        if (req.method === 'POST') {
            const body = req.body || {};
            if (!body.name || !body.credits || body.priceIdr === undefined) {
                return res.status(400).json({ error: 'name, credits, priceIdr required' });
            }

            const targetTierName = normalizeString(body.targetTierName) || null;
            const tierValidation = await validateTargetTierName(targetTierName, hasTierDefinitions);
            if (!tierValidation.ok) {
                return res.status(400).json({ error: tierValidation.error });
            }

            const expiryDate = parseDateOrNull(body.expiryDate);
            const discountStartDate = parseDateOrNull(body.discountStartDate);
            const discountEndDate = parseDateOrNull(body.discountEndDate);
            const discountPct = normalizeNumber(body.discountPct, 0) || 0;
            const priceIdr = normalizeNumber(body.priceIdr, 0) || 0;
            const originalPriceIdr = discountPct > 0 && priceIdr > 0
                ? Math.round(priceIdr / (1 - discountPct / 100))
                : null;

            await executeQuery(`
                INSERT INTO recharge_packages (
                    name,
                    description,
                    credits,
                    fast_credits,
                    standard_credits,
                    price_idr,
                    original_price_idr,
                    discount_pct,
                    target_tier_name,
                    target_tier_definition_id,
                    expiry_date,
                    is_disabled,
                    discount_start_date,
                    discount_end_date,
                    is_active,
                    created_at,
                    updated_at,
                    created_by,
                    updated_by
                ) VALUES (
                    :name,
                    :description,
                    :credits,
                    :fast_credits,
                    :standard_credits,
                    :price_idr,
                    :original_price_idr,
                    :discount_pct,
                    :target_tier_name,
                    :target_tier_definition_id,
                    :expiry_date,
                    :is_disabled,
                    :discount_start_date,
                    :discount_end_date,
                    :is_active,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    :created_by,
                    :updated_by
                )
            `, {
                name: normalizeString(body.name),
                description: normalizeString(body.description) || null,
                credits: normalizeNumber(body.credits, 0),
                fast_credits: normalizeNumber(body.fastCredits, 0),
                standard_credits: normalizeNumber(body.standardCredits, 0),
                price_idr: priceIdr,
                original_price_idr: originalPriceIdr,
                discount_pct: discountPct,
                target_tier_name: targetTierName,
                target_tier_definition_id: tierValidation.tierDefinitionId,
                expiry_date: expiryDate,
                is_disabled: body.isDisabled ? 1 : 0,
                discount_start_date: discountStartDate,
                discount_end_date: discountEndDate,
                is_active: body.isActive !== false ? 1 : 0,
                created_by: session.githubUsername || 'admin',
                updated_by: session.githubUsername || 'admin'
            });
            return res.status(201).json({ success: true });
        }

        if (req.method === 'PUT') {
            const { id, ...body } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });

            const targetTierName = normalizeString(body.targetTierName) || null;
            const tierValidation = await validateTargetTierName(targetTierName, hasTierDefinitions);
            if (!tierValidation.ok) {
                return res.status(400).json({ error: tierValidation.error });
            }

            const expiryDate = parseDateOrNull(body.expiryDate);
            const discountStartDate = parseDateOrNull(body.discountStartDate);
            const discountEndDate = parseDateOrNull(body.discountEndDate);
            const discountPct = normalizeNumber(body.discountPct, 0) || 0;
            const priceIdr = normalizeNumber(body.priceIdr, 0) || 0;
            const originalPriceIdr = discountPct > 0 && priceIdr > 0
                ? Math.round(priceIdr / (1 - discountPct / 100))
                : null;

            await executeQuery(`
                UPDATE recharge_packages SET
                    name = :name,
                    description = :description,
                    credits = :credits,
                    fast_credits = :fast_credits,
                    standard_credits = :standard_credits,
                    price_idr = :price_idr,
                    original_price_idr = :original_price_idr,
                    discount_pct = :discount_pct,
                    target_tier_name = :target_tier_name,
                    target_tier_definition_id = :target_tier_definition_id,
                    expiry_date = :expiry_date,
                    is_disabled = :is_disabled,
                    discount_start_date = :discount_start_date,
                    discount_end_date = :discount_end_date,
                    is_active = :is_active,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updated_by
                WHERE id = :id
            `, {
                id,
                name: normalizeString(body.name),
                description: normalizeString(body.description) || null,
                credits: normalizeNumber(body.credits, 0),
                fast_credits: normalizeNumber(body.fastCredits, 0),
                standard_credits: normalizeNumber(body.standardCredits, 0),
                price_idr: priceIdr,
                original_price_idr: originalPriceIdr,
                discount_pct: discountPct,
                target_tier_name: targetTierName,
                target_tier_definition_id: tierValidation.tierDefinitionId,
                expiry_date: expiryDate,
                is_disabled: body.isDisabled ? 1 : 0,
                discount_start_date: discountStartDate,
                discount_end_date: discountEndDate,
                is_active: body.isActive ? 1 : 0,
                updated_by: session.githubUsername || 'admin'
            });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const id = req.query.id || (req.body || {}).id;
            if (!id) return res.status(400).json({ error: 'id required' });
            await executeQuery(`
                UPDATE recharge_packages
                SET is_disabled = 1,
                    is_active = 0,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updated_by
                WHERE id = :id
            `, {
                id,
                updated_by: session.githubUsername || 'admin'
            });
            return res.status(200).json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({ error: 'recharge_packages table not found. Run migrations first.' });
        }
        console.error('[admin/recharge-packages] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
