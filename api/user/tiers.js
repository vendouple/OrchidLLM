/**
 * /api/user/tiers
 * User-facing subscription tiers and simple authenticated plan selection.
 *
 * GET returns active tiers plus the authenticated user's current tier/cycle so
 * the UI can compare lower sort order = lower tier, higher sort order = higher tier.
 * POST/PUT immediately updates users.tier_id and billing_period as a temporary
 * no-payment choose-plan flow. No admin notification or payment provider is used.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

const VALID_BILLING_PERIODS = ['monthly', 'quarterly', 'yearly'];
const BILLING_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

function isMissingTableError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('ora-00942') || msg.includes('table or view does not exist');
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeBillingPeriod(value) {
    return VALID_BILLING_PERIODS.includes(value) ? value : 'monthly';
}

function parseBillingPeriods(value) {
    if (Array.isArray(value)) {
        const filtered = value.filter(v => VALID_BILLING_PERIODS.includes(v));
        return filtered.length ? filtered : ['monthly'];
    }
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return parseBillingPeriods(parsed);
        } catch {
            if (VALID_BILLING_PERIODS.includes(value)) return [value];
        }
    }
    return ['monthly'];
}

function mapTier(row) {
    const effectiveSortOrder = normalizeNumber(row.EFFECTIVE_SORT_ORDER ?? row.SORT_ORDER ?? row.ID, row.ID) || row.ID;
    return {
        id: row.ID,
        name: row.NAME || row.TIER_NAME,
        tierName: row.TIER_NAME,
        tierCode: row.TIER_CODE,
        sortOrder: row.SORT_ORDER,
        effectiveSortOrder,
        priceIdr: row.PRICE_IDR,
        priceUsd: row.PRICE_USD,
        monthlyCredits: row.MONTHLY_CREDITS,
        fastCredits: row.FAST_CREDITS,
        standardCredits: row.STANDARD_CREDITS,
        rolloverCap: row.ROLLOVER_CAP,
        billingPeriods: parseBillingPeriods(row.BILLING_PERIODS),
        modelAccessLevel: row.MODEL_ACCESS_LEVEL,
        disableBuying: row.DISABLE_BUYING === 1,
        isActive: row.IS_ACTIVE === 1
    };
}

async function getCurrentTier(userId) {
    const result = await executeQuery(`
        SELECT
            u.tier_id,
            u.billing_period,
            t.id,
            t.name,
            t.tier_name,
            t.tier_code,
            t.sort_order,
            NVL(td.sort_order, t.sort_order) AS effective_sort_order,
            t.billing_periods
        FROM users u
        LEFT JOIN tiers t ON t.id = u.tier_id
        LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
        WHERE u.id = :userId
    `, { userId });

    const row = result.rows?.[0];
    if (!row) return null;

    return {
        id: row.ID || row.TIER_ID,
        name: row.NAME || row.TIER_NAME,
        tierName: row.TIER_NAME,
        tierCode: row.TIER_CODE,
        sortOrder: row.SORT_ORDER,
        effectiveSortOrder: normalizeNumber(row.EFFECTIVE_SORT_ORDER ?? row.SORT_ORDER ?? row.TIER_ID, row.TIER_ID) || row.TIER_ID,
        billingPeriod: normalizeBillingPeriod(row.BILLING_PERIOD || 'monthly'),
        billingPeriods: parseBillingPeriods(row.BILLING_PERIODS)
    };
}

async function getActiveTiers() {
    const result = await executeQuery(`
        SELECT
            t.id,
            t.name,
            t.tier_name,
            t.tier_code,
            t.sort_order,
            NVL(td.sort_order, t.sort_order) AS effective_sort_order,
            t.price_idr,
            t.price_usd,
            t.monthly_credits,
            t.fast_credits,
            t.standard_credits,
            t.rollover_cap,
            t.billing_periods,
            t.model_access_level,
            t.disable_buying,
            t.is_active
        FROM tiers t
        LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
        WHERE t.is_active = 1
        ORDER BY NVL(td.sort_order, t.sort_order) ASC, t.id ASC
    `);

    return (result.rows || []).map(mapTier);
}

function compareTierSort(currentTier, selectedTier) {
    const currentSort = normalizeNumber(currentTier?.effectiveSortOrder ?? currentTier?.sortOrder ?? currentTier?.id, 0) || 0;
    const selectedSort = normalizeNumber(selectedTier?.effectiveSortOrder ?? selectedTier?.sortOrder ?? selectedTier?.id, 0) || 0;
    if (selectedSort > currentSort) return 'upgrade';
    if (selectedSort < currentSort) return 'downgrade';
    return 'same';
}

export default async function handler(req, res) {
    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (req.method === 'GET') {
            const [tiers, currentTier] = await Promise.all([
                getActiveTiers(),
                getCurrentTier(session.userId)
            ]);

            return res.status(200).json({
                tiers,
                currentTier,
                billingPeriods: VALID_BILLING_PERIODS
            });
        }

        if (req.method === 'POST' || req.method === 'PUT') {
            const tierId = normalizeNumber(req.body?.tierId ?? req.body?.id, null);
            const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod || 'monthly');
            if (!tierId) return res.status(400).json({ error: 'tierId required' });

            const tiers = await getActiveTiers();
            const selectedTier = tiers.find(t => Number(t.id) === Number(tierId));
            if (!selectedTier || selectedTier.disableBuying) {
                return res.status(404).json({ error: 'Plan not available' });
            }
            if (!selectedTier.billingPeriods.includes(billingPeriod)) {
                return res.status(400).json({ error: `Selected plan does not support ${billingPeriod} billing` });
            }

            const currentTier = await getCurrentTier(session.userId);
            const changeType = compareTierSort(currentTier, selectedTier);
            const cycleMonths = BILLING_MONTHS[billingPeriod] || 1;

            // Temporary no-payment behavior: apply the plan/cycle immediately while
            // surfacing next-cycle wording in the UI. No admin notification is created.
            await executeQuery(`
                UPDATE users
                SET tier_id = :tierId,
                    billing_period = :billingPeriod,
                    billing_cycle_start = NVL(billing_cycle_start, CURRENT_TIMESTAMP),
                    billing_cycle_end = ADD_MONTHS(CURRENT_TIMESTAMP, :cycleMonths),
                    next_billing_date = ADD_MONTHS(CURRENT_TIMESTAMP, :cycleMonths),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :userId
            `, {
                tierId,
                billingPeriod,
                cycleMonths,
                userId: session.userId
            });

            return res.status(200).json({
                success: true,
                appliedImmediately: true,
                changeType,
                billingPeriod,
                selectedTier,
                previousTier: currentTier
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(200).json(req.method === 'GET' ? { tiers: [], currentTier: null, billingPeriods: VALID_BILLING_PERIODS } : { error: 'tiers table not found' });
        }
        console.error('[user/tiers] error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
