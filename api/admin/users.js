/**
 * /api/admin/users
 * Expanded user management with suspend/remove/manage plans/expiry extension and
 * bulk credit reset/refund-style operations with audit logging when available.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { expireRechargesOnDowngrade, bulkAdjustCredits } from '../../lib/credits.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);

    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    return session;
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function parseDateOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

async function adminAuditTablesAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM admin_user_operation_batches WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

async function logAdminUserOperation({
    batchId = null,
    userId,
    operationType,
    previousTierName = null,
    newTierName = null,
    previousCreditsBalance = null,
    newCreditsBalance = null,
    previousCreditsRollover = null,
    newCreditsRollover = null,
    status = 'completed',
    message = null
}) {
    const hasAuditTables = await adminAuditTablesAvailable();
    if (!hasAuditTables) return;

    await executeQuery(`
        INSERT INTO admin_user_operation_logs (
            batch_id,
            user_id,
            operation_type,
            previous_tier_name,
            new_tier_name,
            previous_credits_balance,
            new_credits_balance,
            previous_credits_rollover,
            new_credits_rollover,
            status,
            message,
            created_at
        ) VALUES (
            :batch_id,
            :user_id,
            :operation_type,
            :previous_tier_name,
            :new_tier_name,
            :previous_credits_balance,
            :new_credits_balance,
            :previous_credits_rollover,
            :new_credits_rollover,
            :status,
            :message,
            CURRENT_TIMESTAMP
        )
    `, {
        batch_id: batchId,
        user_id: userId,
        operation_type: operationType,
        previous_tier_name: previousTierName,
        new_tier_name: newTierName,
        previous_credits_balance: previousCreditsBalance,
        new_credits_balance: newCreditsBalance,
        previous_credits_rollover: previousCreditsRollover,
        new_credits_rollover: newCreditsRollover,
        status,
        message
    });
}

async function getUserState(userId) {
    const result = await executeQuery(`
        SELECT
            u.id,
            u.github_id,
            u.github_username,
            u.github_avatar,
            u.tier_id,
            u.is_admin,
            u.credits_balance,
            u.credits_rollover,
            u.billing_cycle_start,
            u.billing_cycle_end,
            u.is_banned,
            u.created_at,
            u.last_seen,
            t.name AS tier_name,
            t.tier_name AS tier_display_name,
            t.tier_level,
            t.tier_code,
            t.sort_order,
            td.tier_name AS canonical_tier_name,
            td.tier_code AS canonical_tier_code,
            td.sort_order AS canonical_sort_order
        FROM users u
        LEFT JOIN tiers t ON u.tier_id = t.id
        LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
        WHERE u.id = :userId
    `, { userId });

    return result.rows?.[0] || null;
}

async function createBatch(operationType, reason, filters, payload, createdBy) {
    const hasAuditTables = await adminAuditTablesAvailable();
    if (!hasAuditTables) return null;

    const insertResult = await executeQuery(`
        INSERT INTO admin_user_operation_batches (
            operation_type,
            reason,
            filters_json,
            payload_json,
            created_by,
            created_at
        ) VALUES (
            :operation_type,
            :reason,
            :filters_json,
            :payload_json,
            :created_by,
            CURRENT_TIMESTAMP
        ) RETURNING id INTO :new_id
    `, {
        operation_type: operationType,
        reason: reason || operationType,
        filters_json: JSON.stringify(filters || {}),
        payload_json: JSON.stringify(payload || {}),
        created_by: createdBy || 'admin',
        new_id: { dir: 'out', type: 'NUMBER' }
    });

    return insertResult?.outBinds?.new_id?.[0] || null;
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        if (req.method === 'GET') {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 50;
            const offset = (page - 1) * limit;

            const result = await executeQuery(`
                SELECT
                    u.id,
                    u.github_id,
                    u.github_username,
                    u.github_avatar,
                    u.tier_id,
                    t.name AS tier_name,
                    t.tier_name AS tier_display_name,
                    t.tier_level,
                    t.tier_code,
                    td.tier_name AS canonical_tier_name,
                    td.tier_code AS canonical_tier_code,
                    u.is_admin,
                    u.credits_balance,
                    u.credits_rollover,
                    u.billing_cycle_start,
                    u.billing_cycle_end,
                    u.is_banned,
                    u.created_at,
                    u.last_seen
                FROM users u
                LEFT JOIN tiers t ON u.tier_id = t.id
                LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                ORDER BY u.created_at DESC
                OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
            `, { offset, limit });

            const countResult = await executeQuery(`SELECT COUNT(*) AS total FROM users`);

            return res.status(200).json({
                users: result.rows || [],
                total: countResult.rows?.[0]?.TOTAL || 0,
                page,
                limit
            });
        }

        if (req.method === 'PUT') {
            const body = req.body || {};
            const action = normalizeString(body.action || 'update-tier').toLowerCase();

            if (action === 'update-tier') {
                const userId = normalizeNumber(body.userId, null);
                const newTierId = normalizeNumber(body.newTierId, null);
                const extendBillingTo = parseDateOrNull(body.extendBillingTo);
                const resetCreditsToMonthly = !!body.resetCreditsToMonthly;

                if (!userId || !newTierId) {
                    return res.status(400).json({ error: 'userId and newTierId required' });
                }

                const currentUser = await getUserState(userId);
                if (!currentUser) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const newTierResult = await executeQuery(`
                    SELECT
                        t.id,
                        t.tier_name,
                        t.monthly_credits,
                        NVL(td.sort_order, t.sort_order) AS effective_sort_order
                    FROM tiers t
                    LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
                    WHERE t.id = :newTierId
                `, { newTierId });

                const newTier = newTierResult.rows?.[0];
                if (!newTier) {
                    return res.status(404).json({ error: 'Target tier not found' });
                }

                await executeQuery(`UPDATE users SET tier_id = :newTierId WHERE id = :userId`, { newTierId, userId });

                const oldSortOrder = Number(currentUser.CANONICAL_SORT_ORDER ?? currentUser.SORT_ORDER ?? 0);
                const newSortOrder = Number(newTier.EFFECTIVE_SORT_ORDER ?? 0);
                if (newSortOrder < oldSortOrder) {
                    await expireRechargesOnDowngrade(userId, newTier.TIER_NAME);
                }

                if (extendBillingTo) {
                    await executeQuery(`UPDATE users SET billing_cycle_end = :billingCycleEnd WHERE id = :userId`, {
                        userId,
                        billingCycleEnd: extendBillingTo
                    });
                }

                if (resetCreditsToMonthly) {
                    await executeQuery(`UPDATE users SET credits_balance = :creditsBalance WHERE id = :userId`, {
                        userId,
                        creditsBalance: Number(newTier.MONTHLY_CREDITS || 0)
                    });
                }

                const updatedUser = await getUserState(userId);
                await logAdminUserOperation({
                    userId,
                    operationType: 'update_tier',
                    previousTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                    newTierName: updatedUser?.CANONICAL_TIER_NAME || updatedUser?.TIER_DISPLAY_NAME || updatedUser?.TIER_NAME,
                    previousCreditsBalance: currentUser.CREDITS_BALANCE,
                    newCreditsBalance: updatedUser?.CREDITS_BALANCE,
                    previousCreditsRollover: currentUser.CREDITS_ROLLOVER,
                    newCreditsRollover: updatedUser?.CREDITS_ROLLOVER,
                    message: `Tier updated by ${session.githubUsername || 'admin'}`
                });

                return res.status(200).json({ success: true });
            }

            if (action === 'adjust-credits') {
                const userId = normalizeNumber(body.userId, null);
                if (!userId) return res.status(400).json({ error: 'userId required' });

                const currentUser = await getUserState(userId);
                if (!currentUser) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const nextCreditsBalance = body.setCreditsBalance !== undefined && body.setCreditsBalance !== null
                    ? Number(body.setCreditsBalance)
                    : Number(currentUser.CREDITS_BALANCE || 0) + Number(body.deltaCreditsBalance || 0);
                const nextCreditsRollover = body.setCreditsRollover !== undefined && body.setCreditsRollover !== null
                    ? Number(body.setCreditsRollover)
                    : Number(currentUser.CREDITS_ROLLOVER || 0) + Number(body.deltaCreditsRollover || 0);

                await executeQuery(`
                    UPDATE users
                    SET credits_balance = :creditsBalance,
                        credits_rollover = :creditsRollover
                    WHERE id = :userId
                `, {
                    userId,
                    creditsBalance: nextCreditsBalance,
                    creditsRollover: nextCreditsRollover
                });

                if (body.resetRechargeBalances) {
                    await executeQuery(`DELETE FROM user_recharge_balances WHERE user_id = :userId`, { userId });
                }

                await logAdminUserOperation({
                    userId,
                    operationType: 'adjust_credits',
                    previousTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                    newTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                    previousCreditsBalance: currentUser.CREDITS_BALANCE,
                    newCreditsBalance: nextCreditsBalance,
                    previousCreditsRollover: currentUser.CREDITS_ROLLOVER,
                    newCreditsRollover: nextCreditsRollover,
                    message: normalizeString(body.reason) || `Credits adjusted by ${session.githubUsername || 'admin'}`
                });

                return res.status(200).json({ success: true });
            }

            if (action === 'extend-expiry') {
                const userId = normalizeNumber(body.userId, null);
                const billingCycleEnd = parseDateOrNull(body.billingCycleEnd);
                if (!userId || !billingCycleEnd) {
                    return res.status(400).json({ error: 'userId and billingCycleEnd required' });
                }

                const currentUser = await getUserState(userId);
                if (!currentUser) {
                    return res.status(404).json({ error: 'User not found' });
                }

                await executeQuery(`UPDATE users SET billing_cycle_end = :billingCycleEnd WHERE id = :userId`, {
                    userId,
                    billingCycleEnd
                });

                await logAdminUserOperation({
                    userId,
                    operationType: 'extend_expiry',
                    previousTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                    newTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                    previousCreditsBalance: currentUser.CREDITS_BALANCE,
                    newCreditsBalance: currentUser.CREDITS_BALANCE,
                    previousCreditsRollover: currentUser.CREDITS_ROLLOVER,
                    newCreditsRollover: currentUser.CREDITS_ROLLOVER,
                    message: `Billing cycle extended to ${billingCycleEnd.toISOString()}`
                });

                return res.status(200).json({ success: true });
            }

            if (action === 'remove-user') {
                const userId = normalizeNumber(body.userId, null);
                if (!userId) return res.status(400).json({ error: 'userId required' });

                await executeQuery(`UPDATE users SET is_banned = 1, tier_id = NULL WHERE id = :userId`, { userId });
                await executeQuery(`UPDATE api_keys SET is_active = 0 WHERE user_id = :userId`, { userId });
                await executeQuery(`DELETE FROM user_recharge_balances WHERE user_id = :userId`, { userId });

                await logAdminUserOperation({
                    userId,
                    operationType: 'remove_user',
                    status: 'completed',
                    message: `User removed/deactivated by ${session.githubUsername || 'admin'}`
                });

                return res.status(200).json({ success: true });
            }

            return res.status(400).json({ error: 'Unsupported action' });
        }

        if (req.method === 'PATCH') {
            const body = req.body || {};
            const userId = normalizeNumber(body.userId, null);
            if (!userId) return res.status(400).json({ error: 'userId required' });

            const currentUser = await getUserState(userId);
            if (!currentUser) {
                return res.status(404).json({ error: 'User not found' });
            }

            const isBanned = body.isBanned ? 1 : 0;
            await executeQuery(`UPDATE users SET is_banned = :isBanned WHERE id = :userId`, {
                isBanned,
                userId
            });

            await logAdminUserOperation({
                userId,
                operationType: isBanned ? 'suspend_user' : 'unsuspend_user',
                previousTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                newTierName: currentUser.CANONICAL_TIER_NAME || currentUser.TIER_DISPLAY_NAME || currentUser.TIER_NAME,
                previousCreditsBalance: currentUser.CREDITS_BALANCE,
                newCreditsBalance: currentUser.CREDITS_BALANCE,
                previousCreditsRollover: currentUser.CREDITS_ROLLOVER,
                newCreditsRollover: currentUser.CREDITS_ROLLOVER,
                message: `User ${isBanned ? 'suspended' : 'unsuspended'} by ${session.githubUsername || 'admin'}`
            });

            return res.status(200).json({ success: true });
        }

        if (req.method === 'POST') {
            const body = req.body || {};
            const action = normalizeString(body.action).toLowerCase();

            if (action !== 'bulk-adjust') {
                return res.status(400).json({ error: 'Unsupported action' });
            }

            const result = await bulkAdjustCredits({
                actorUsername: session.githubUsername || 'admin',
                reason: normalizeString(body.reason) || 'Administrative bulk adjustment',
                tierNames: Array.isArray(body.tierNames) ? body.tierNames : [],
                createdBefore: body.createdBefore || null,
                createdAfter: body.createdAfter || null,
                setCreditsBalance: body.setCreditsBalance,
                setCreditsRollover: body.setCreditsRollover,
                deltaCreditsBalance: body.deltaCreditsBalance,
                deltaCreditsRollover: body.deltaCreditsRollover,
                resetRechargeBalances: !!body.resetRechargeBalances,
                operationType: normalizeString(body.operationType) || 'credit_adjustment'
            });

            return res.status(200).json({ success: true, ...result });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[admin/users] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
