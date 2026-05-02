/**
 * /api/user/recharge
 * List and purchase recharge packages using named-tier targeting.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { applyRecharge } from '../../lib/credits.js';

function normalizeString(value) {
    return String(value || '').trim();
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

function mapPackageRow(row) {
    const now = new Date();
    const expiryDate = row.EXPIRY_DATE ? new Date(row.EXPIRY_DATE) : null;
    const discountStart = row.DISCOUNT_START_DATE ? new Date(row.DISCOUNT_START_DATE) : null;
    const discountEnd = row.DISCOUNT_END_DATE ? new Date(row.DISCOUNT_END_DATE) : null;
    const isExpired = expiryDate ? now > expiryDate : false;
    const isDiscountActive = Number(row.DISCOUNT_PCT || 0) > 0 &&
        (!discountStart || now >= discountStart) &&
        (!discountEnd || now <= discountEnd);

    return {
        id: row.ID,
        name: row.NAME,
        description: row.DESCRIPTION,
        credits: row.CREDITS,
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
        isExpired,
        isDiscountActive,
        tierDisplayName: row.TIER_DISPLAY_NAME || row.TARGET_TIER_NAME || null
    };
}

export default async function handler(req, res) {
    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const hasTierDefinitions = await tierDefinitionsAvailable();

        if (req.method === 'GET') {
            const userRes = await executeQuery(`
                SELECT
                    u.id,
                    u.tier_id,
                    t.tier_name,
                    t.tier_level,
                    t.sort_order,
                    td.id AS tier_definition_id,
                    td.tier_name AS canonical_tier_name,
                    td.sort_order AS canonical_sort_order
                FROM users u
                JOIN tiers t ON u.tier_id = t.id
                LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                WHERE u.id = :userId
            `, { userId: session.userId });

            if (!userRes.rows || userRes.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = userRes.rows[0];
            const userSortOrder = Number(user.CANONICAL_SORT_ORDER ?? user.SORT_ORDER ?? 0);
            const userTierNames = new Set([
                normalizeString(user.CANONICAL_TIER_NAME),
                normalizeString(user.TIER_NAME),
                normalizeString(user.TIER_LEVEL)
            ].filter(Boolean));

            const result = await executeQuery(`
                SELECT
                    rp.id,
                    rp.name,
                    rp.description,
                    rp.credits,
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
                    COALESCE(td.tier_name, t.tier_name) AS tier_display_name,
                    COALESCE(td.sort_order, t.sort_order, 0) AS target_sort_order
                FROM recharge_packages rp
                LEFT JOIN tier_definitions td ON td.id = rp.target_tier_definition_id
                LEFT JOIN tiers t ON t.tier_name = rp.target_tier_name
                WHERE rp.is_active = 1
                  AND rp.is_disabled = 0
                  AND (rp.expiry_date IS NULL OR rp.expiry_date > CURRENT_TIMESTAMP)
                ORDER BY COALESCE(td.sort_order, t.sort_order, 999999) ASC, rp.price_idr ASC, rp.id ASC
            `);

            const packages = (result.rows || []).filter(row => {
                const targetTierName = normalizeString(row.TARGET_TIER_NAME || row.TIER_DISPLAY_NAME);
                const targetSortOrder = Number(row.TARGET_SORT_ORDER ?? 0);

                if (!targetTierName && !row.TARGET_TIER_DEFINITION_ID) {
                    return true;
                }

                if (hasTierDefinitions && row.TARGET_TIER_DEFINITION_ID && user.TIER_DEFINITION_ID) {
                    return targetSortOrder <= userSortOrder;
                }

                if (targetTierName && userTierNames.has(targetTierName)) {
                    return true;
                }

                return targetSortOrder <= userSortOrder;
            }).map(mapPackageRow);

            return res.status(200).json(packages);
        }

        if (req.method === 'POST') {
            const { packageId } = req.body || {};
            if (!packageId) return res.status(400).json({ error: 'packageId is required' });

            const userRes = await executeQuery(`
                SELECT
                    u.id,
                    u.tier_id,
                    t.tier_name,
                    t.tier_level,
                    t.sort_order,
                    td.id AS tier_definition_id,
                    td.tier_name AS canonical_tier_name,
                    td.sort_order AS canonical_sort_order
                FROM users u
                JOIN tiers t ON u.tier_id = t.id
                LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                WHERE u.id = :userId
            `, { userId: session.userId });

            if (!userRes.rows || userRes.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = userRes.rows[0];
            const userSortOrder = Number(user.CANONICAL_SORT_ORDER ?? user.SORT_ORDER ?? 0);
            const userTierNames = new Set([
                normalizeString(user.CANONICAL_TIER_NAME),
                normalizeString(user.TIER_NAME),
                normalizeString(user.TIER_LEVEL)
            ].filter(Boolean));

            const packRes = await executeQuery(`
                SELECT
                    rp.id,
                    rp.target_tier_name,
                    rp.target_tier_definition_id,
                    rp.expiry_date,
                    rp.is_disabled,
                    rp.is_active,
                    COALESCE(td.tier_name, t.tier_name) AS tier_display_name,
                    COALESCE(td.sort_order, t.sort_order, 0) AS target_sort_order
                FROM recharge_packages rp
                LEFT JOIN tier_definitions td ON td.id = rp.target_tier_definition_id
                LEFT JOIN tiers t ON t.tier_name = rp.target_tier_name
                WHERE rp.id = :packageId
            `, { packageId });

            if (!packRes.rows || packRes.rows.length === 0) {
                return res.status(404).json({ error: 'Package not found' });
            }

            const pack = packRes.rows[0];
            if (pack.IS_ACTIVE !== 1 || pack.IS_DISABLED === 1) {
                return res.status(404).json({ error: 'Package not found or inactive' });
            }
            if (pack.EXPIRY_DATE && new Date(pack.EXPIRY_DATE) <= new Date()) {
                return res.status(403).json({ error: 'Package has expired' });
            }

            const targetTierName = normalizeString(pack.TARGET_TIER_NAME || pack.TIER_DISPLAY_NAME);
            const targetSortOrder = Number(pack.TARGET_SORT_ORDER ?? 0);
            const allowed = (!targetTierName && !pack.TARGET_TIER_DEFINITION_ID)
                || (hasTierDefinitions && pack.TARGET_TIER_DEFINITION_ID && user.TIER_DEFINITION_ID ? targetSortOrder <= userSortOrder : false)
                || userTierNames.has(targetTierName)
                || targetSortOrder <= userSortOrder;

            if (!allowed) {
                return res.status(403).json({ error: 'Package not available for your current tier' });
            }

            await applyRecharge(session.userId, packageId);
            return res.status(200).json({ success: true, message: 'Recharge applied successfully' });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[user/recharge] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
