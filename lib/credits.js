/**
 * Core credit deduction engine for OrchidLLM.
 * Updated for named-tier access control, canonical tier definitions, and
 * recharge package targeting by tier name/definition.
 */

import { executeQuery, isDbConfigured } from './oracle.js';
import { normalizeProviderName } from './provider-registry.js';

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

async function getProviderContextMultiplier(providerName, contextSizeTokens) {
    const normalizedProvider = normalizeProviderName(providerName);
    const normalizedContextSize = Math.max(0, Math.floor(normalizeNumber(contextSizeTokens, 0) || 0));

    if (!normalizedProvider) {
        return null;
    }

    try {
        const result = await executeQuery(`
            SELECT
                provider_name,
                context_threshold_tokens,
                multiplier_in,
                multiplier_out,
                multiplier_cache_read,
                multiplier_cache_write
            FROM provider_context_multipliers
            WHERE LOWER(provider_name) = :providerName
              AND is_active = 1
              AND context_threshold_tokens <= :contextSizeTokens
            ORDER BY context_threshold_tokens DESC
            FETCH FIRST 1 ROWS ONLY
        `, {
            providerName: normalizedProvider,
            contextSizeTokens: normalizedContextSize
        });

        const row = result.rows?.[0];
        if (!row) return null;

        return {
            providerName: row.PROVIDER_NAME,
            contextThresholdTokens: normalizeNumber(row.CONTEXT_THRESHOLD_TOKENS, 0) || 0,
            multiplierIn: normalizeNumber(row.MULTIPLIER_IN, 1) || 1,
            multiplierOut: normalizeNumber(row.MULTIPLIER_OUT, 1) || 1,
            multiplierCacheRead: normalizeNumber(row.MULTIPLIER_CACHE_READ, 1) || 1,
            multiplierCacheWrite: normalizeNumber(row.MULTIPLIER_CACHE_WRITE, 1) || 1
        };
    } catch (error) {
        if (isMissingTableError(error)) {
            return null;
        }
        throw error;
    }
}

async function tierDefinitionsAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM tier_definitions WHERE 1 = 0`);
        return true;
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('ora-00942') || message.includes('table or view does not exist')) {
            return false;
        }
        throw error;
    }
}

export async function getUserCredits(userId) {
    if (!isDbConfigured()) return null;

    try {
        const result = await executeQuery(`
            SELECT
                u.id AS user_id,
                u.credits_balance,
                u.credits_rollover,
                u.billing_cycle_start,
                u.billing_cycle_end,
                u.billing_period,
                u.is_banned,
                t.id AS tier_id,
                t.name AS tier_name,
                t.tier_name AS tier_display_name,
                t.tier_level,
                t.tier_code,
                t.sort_order,
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
                td.id AS tier_definition_id,
                td.tier_name AS canonical_tier_name,
                td.tier_code AS canonical_tier_code,
                td.sort_order AS canonical_sort_order
            FROM users u
            LEFT JOIN tiers t ON u.tier_id = t.id
            LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
            WHERE u.id = :userId
        `, { userId });

        if (!result.rows || result.rows.length === 0) return null;

        const user = result.rows[0];

        const rechargeResult = await executeQuery(`
            SELECT
                r.id,
                r.tier_id,
                t.tier_name,
                t.tier_level,
                t.tier_code,
                t.sort_order,
                t.queue_priority_fast,
                t.queue_priority_std,
                t.queue_priority_exhausted,
                t.model_access_level,
                td.id AS tier_definition_id,
                td.tier_name AS canonical_tier_name,
                td.tier_code AS canonical_tier_code,
                td.sort_order AS canonical_sort_order,
                r.credits_remaining,
                r.expires_at
            FROM user_recharge_balances r
            JOIN tiers t ON r.tier_id = t.id
            LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
            WHERE r.user_id = :userId
              AND r.credits_remaining > 0
              AND (r.expires_at IS NULL OR r.expires_at > CURRENT_TIMESTAMP)
            ORDER BY NVL(td.sort_order, t.sort_order) ASC, r.expires_at ASC, r.id ASC
        `, { userId });

        return {
            ...user,
            recharge_balances: rechargeResult.rows || []
        };
    } catch (err) {
        console.error('Error fetching user credits:', err);
        return null;
    }
}

function getUserTierNames(userState) {
    const names = new Set();
    const candidates = [
        userState?.CANONICAL_TIER_NAME,
        userState?.TIER_DISPLAY_NAME,
        userState?.TIER_NAME,
        userState?.TIER_LEVEL
    ];

    for (const candidate of candidates) {
        const normalized = normalizeString(candidate);
        if (normalized) names.add(normalized);
    }

    return Array.from(names);
}

function checkTierAccess(userState, modelRow) {
    if (!modelRow.availableTiers || !Array.isArray(modelRow.availableTiers) || modelRow.availableTiers.length === 0) {
        return { allowed: true };
    }

    const userTierNames = getUserTierNames(userState);
    if (userTierNames.length === 0) {
        return { allowed: false, reason: 'User has no tier assigned' };
    }

    const allowed = modelRow.availableTiers.some(tierName => userTierNames.includes(normalizeString(tierName)));
    if (!allowed) {
        return {
            allowed: false,
            reason: `Model not available for your tier (${userTierNames[0]}). Required tiers: ${modelRow.availableTiers.join(', ')}`
        };
    }

    return { allowed: true };
}

export async function deductCredits({ userId, promptTokens, completionTokens, modelRow, isBatch, isCached, providerName = null, contextSizeTokens = null }) {
    const userState = await getUserCredits(userId);
    if (!userState) throw new Error('User not found or DB not configured');

    if (userState.IS_BANNED === 1) {
        return {
            allowed: false,
            reason: 'user_banned',
            message: 'Your account is suspended.',
            cost: 0
        };
    }

    const tierAccess = checkTierAccess(userState, modelRow);
    if (!tierAccess.allowed) {
        return {
            allowed: false,
            reason: 'tier_not_allowed',
            message: tierAccess.reason,
            cost: 0
        };
    }

    let inMult = Number(modelRow.inMultiplier || 1.0);
    let outMult = Number(modelRow.outMultiplier || 1.0);
    let providerContextMultiplier = null;

    if (isCached) {
        inMult = Number(modelRow.cacheReadMultiplier || 1.0);
        outMult = Number(modelRow.cacheWriteMultiplier || 1.0);
    }

    providerContextMultiplier = await getProviderContextMultiplier(
        providerName,
        contextSizeTokens ?? promptTokens
    );

    if (providerContextMultiplier) {
        if (isCached) {
            inMult *= providerContextMultiplier.multiplierCacheRead;
            outMult *= providerContextMultiplier.multiplierCacheWrite;
        } else {
            inMult *= providerContextMultiplier.multiplierIn;
            outMult *= providerContextMultiplier.multiplierOut;
        }
    }

    let baseCost = Math.ceil((promptTokens * inMult) + (completionTokens * outMult));
    let finalCost = baseCost;

    if (isBatch && userState.BATCH_DISCOUNT_PCT) {
        const discount = Number(userState.BATCH_DISCOUNT_PCT) / 100.0;
        finalCost = Math.floor(finalCost * (1 - discount));
    }

    let remainingToDeduct = finalCost;
    let source = null;
    let effectiveQueuePriority = userState.QUEUE_PRIORITY_FAST;
    const userSortOrder = normalizeNumber(userState.CANONICAL_SORT_ORDER ?? userState.SORT_ORDER, 0) || 0;

    for (const rb of userState.recharge_balances) {
        if (remainingToDeduct <= 0) break;
        const rechargeSortOrder = normalizeNumber(rb.CANONICAL_SORT_ORDER ?? rb.SORT_ORDER, 0) || 0;
        if (rechargeSortOrder < userSortOrder) {
            const deduction = Math.min(rb.CREDITS_REMAINING, remainingToDeduct);
            remainingToDeduct -= deduction;

            await executeQuery(
                `UPDATE user_recharge_balances SET credits_remaining = credits_remaining - :amt WHERE id = :id`,
                { amt: deduction, id: rb.ID }
            );

            if (!source) {
                source = 'lower_tier_recharge';
                effectiveQueuePriority = rb.QUEUE_PRIORITY_FAST;
            }
        }
    }

    if (remainingToDeduct > 0 && userState.CREDITS_ROLLOVER > 0) {
        const deduction = Math.min(userState.CREDITS_ROLLOVER, remainingToDeduct);
        remainingToDeduct -= deduction;

        await executeQuery(
            `UPDATE users SET credits_rollover = credits_rollover - :amt WHERE id = :id`,
            { amt: deduction, id: userId }
        );

        if (!source) source = 'rollover';
    }

    if (remainingToDeduct > 0 && userState.CREDITS_BALANCE > 0) {
        const deduction = Math.min(userState.CREDITS_BALANCE, remainingToDeduct);
        remainingToDeduct -= deduction;

        await executeQuery(
            `UPDATE users SET credits_balance = credits_balance - :amt WHERE id = :id`,
            { amt: deduction, id: userId }
        );

        if (!source) source = 'monthly';
    }

    if (remainingToDeduct > 0) {
        for (const rb of userState.recharge_balances) {
            if (remainingToDeduct <= 0) break;
            if (rb.TIER_ID === userState.TIER_ID) {
                const deduction = Math.min(rb.CREDITS_REMAINING, remainingToDeduct);
                remainingToDeduct -= deduction;

                await executeQuery(
                    `UPDATE user_recharge_balances SET credits_remaining = credits_remaining - :amt WHERE id = :id`,
                    { amt: deduction, id: rb.ID }
                );

                if (!source) source = 'current_recharge';
            }
        }
    }

    if (remainingToDeduct > 0) {
        effectiveQueuePriority = userState.QUEUE_PRIORITY_EXHAUSTED;
        source = 'exhausted';

        if (effectiveQueuePriority === 0 || effectiveQueuePriority === null) {
            return {
                allowed: false,
                reason: 'insufficient_credits',
                cost: finalCost
            };
        }

        await executeQuery(
            `UPDATE users SET credits_balance = credits_balance - :amt WHERE id = :id`,
            { amt: remainingToDeduct, id: userId }
        );
    }

    return {
        allowed: true,
        cost: finalCost,
        queuePriority: effectiveQueuePriority,
        source: source || 'monthly',
        providerContextMultiplier
    };
}

export async function resetMonthlyCycle(userId) {
    const user = await getUserCredits(userId);
    if (!user) return;

    let newRollover = user.CREDITS_ROLLOVER + user.CREDITS_BALANCE;
    if (newRollover < 0) newRollover = 0;

    if (user.ROLLOVER_CAP === -1) {
        newRollover = 0;
    } else if (user.ROLLOVER_CAP !== null && newRollover > user.ROLLOVER_CAP) {
        newRollover = user.ROLLOVER_CAP;
    }

    await executeQuery(`
        UPDATE users
        SET credits_balance = :monthlyCredits,
            credits_rollover = :newRollover,
            billing_cycle_start = CURRENT_TIMESTAMP,
            billing_cycle_end = ADD_MONTHS(CURRENT_TIMESTAMP, 1)
        WHERE id = :id
    `, {
        monthlyCredits: user.MONTHLY_CREDITS,
        newRollover,
        id: userId
    });
}

export async function expireRechargesOnDowngrade(userId, newTierName) {
    const normalizedTierName = normalizeString(newTierName);
    if (!normalizedTierName) return;

    const hasTierDefinitions = await tierDefinitionsAvailable();

    if (hasTierDefinitions) {
        const tierResult = await executeQuery(`
            SELECT td.sort_order
            FROM tiers t
            JOIN tier_definitions td ON td.id = t.tier_definition_id
            WHERE t.tier_name = :tierName
        `, { tierName: normalizedTierName });

        if (!tierResult.rows || tierResult.rows.length === 0) return;
        const newSortOrder = tierResult.rows[0].SORT_ORDER;

        await executeQuery(`
            DELETE FROM user_recharge_balances
            WHERE user_id = :userId
              AND tier_id IN (
                  SELECT t.id
                  FROM tiers t
                  JOIN tier_definitions td ON td.id = t.tier_definition_id
                  WHERE td.sort_order > :newSortOrder
              )
        `, { userId, newSortOrder });
        return;
    }

    const tierResult = await executeQuery(
        `SELECT sort_order FROM tiers WHERE tier_name = :tierName`,
        { tierName: normalizedTierName }
    );
    if (!tierResult.rows || tierResult.rows.length === 0) return;
    const newSortOrder = tierResult.rows[0].SORT_ORDER;

    await executeQuery(`
        DELETE FROM user_recharge_balances
        WHERE user_id = :userId
          AND tier_id IN (SELECT id FROM tiers WHERE sort_order > :newSortOrder)
    `, { userId, newSortOrder });
}

export async function applyRecharge(userId, packageId) {
    const hasTierDefinitions = await tierDefinitionsAvailable();

    const packResult = await executeQuery(`
        SELECT
            credits,
            target_tier_name,
            target_tier_definition_id,
            expiry_date,
            is_disabled,
            is_active
        FROM recharge_packages
        WHERE id = :id
    `, { id: packageId });

    if (!packResult.rows || packResult.rows.length === 0) {
        throw new Error('Package not found');
    }

    const pack = packResult.rows[0];
    if (pack.IS_DISABLED === 1 || pack.IS_ACTIVE !== 1) {
        throw new Error('Package not found or disabled');
    }
    if (pack.EXPIRY_DATE && new Date(pack.EXPIRY_DATE) <= new Date()) {
        throw new Error('Package has expired');
    }

    const credits = pack.CREDITS;
    const targetTierName = normalizeString(pack.TARGET_TIER_NAME);
    const targetTierDefinitionId = pack.TARGET_TIER_DEFINITION_ID;

    const userResult = await executeQuery(`SELECT tier_id FROM users WHERE id = :id`, { id: userId });
    if (!userResult.rows || userResult.rows.length === 0) throw new Error('User not found');
    const currentTierId = userResult.rows[0].TIER_ID;

    let rechargeTierId = currentTierId;

    if (hasTierDefinitions && targetTierDefinitionId) {
        const targetTierResult = await executeQuery(`
            SELECT id
            FROM tiers
            WHERE tier_definition_id = :tierDefinitionId
              AND is_active = 1
            ORDER BY sort_order ASC, id ASC
            FETCH FIRST 1 ROWS ONLY
        `, { tierDefinitionId: targetTierDefinitionId });

        if (targetTierResult.rows && targetTierResult.rows.length > 0) {
            rechargeTierId = targetTierResult.rows[0].ID;
        }
    } else if (targetTierName) {
        const targetTierResult = await executeQuery(
            `SELECT id FROM tiers WHERE tier_name = :tierName AND is_active = 1`,
            { tierName: targetTierName }
        );
        if (targetTierResult.rows && targetTierResult.rows.length > 0) {
            rechargeTierId = targetTierResult.rows[0].ID;
        }
    }

    const tierResult = await executeQuery(`SELECT rollover_months FROM tiers WHERE id = :id`, { id: rechargeTierId });
    const rolloverMonths = tierResult.rows?.[0]?.ROLLOVER_MONTHS;

    let expiryExpr = 'NULL';
    if (rolloverMonths) {
        expiryExpr = `ADD_MONTHS(CURRENT_TIMESTAMP, ${Number(rolloverMonths)})`;
    }

    await executeQuery(`
        INSERT INTO user_recharge_balances (user_id, tier_id, credits_remaining, expires_at)
        VALUES (:userId, :tierId, :credits, ${expiryExpr})
    `, { userId, tierId: rechargeTierId, credits });
}

export async function bulkAdjustCredits({
    actorUsername,
    reason,
    tierNames = [],
    createdBefore = null,
    createdAfter = null,
    setCreditsBalance = null,
    setCreditsRollover = null,
    deltaCreditsBalance = null,
    deltaCreditsRollover = null,
    resetRechargeBalances = false,
    operationType = 'credit_adjustment'
}) {
    const hasTierDefinitions = await tierDefinitionsAvailable();
    const normalizedTierNames = Array.isArray(tierNames)
        ? tierNames.map(normalizeString).filter(Boolean)
        : [];

    const batchInsert = await executeQuery(`
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
        reason: normalizeString(reason) || 'Administrative bulk adjustment',
        filters_json: JSON.stringify({ tierNames: normalizedTierNames, createdBefore, createdAfter }),
        payload_json: JSON.stringify({ setCreditsBalance, setCreditsRollover, deltaCreditsBalance, deltaCreditsRollover, resetRechargeBalances }),
        created_by: actorUsername || 'admin',
        new_id: { dir: 'out', type: 'NUMBER' }
    });

    const batchId = batchInsert?.outBinds?.new_id?.[0];

    const binds = {
        createdBefore: createdBefore ? new Date(createdBefore) : null,
        createdAfter: createdAfter ? new Date(createdAfter) : null
    };

    let tierFilterSql = '';
    if (normalizedTierNames.length > 0) {
        const placeholders = normalizedTierNames.map((_, index) => `:tierName${index}`).join(', ');
        normalizedTierNames.forEach((tierName, index) => {
            binds[`tierName${index}`] = tierName;
        });

        tierFilterSql = hasTierDefinitions
            ? `AND COALESCE(td.tier_name, t.tier_name) IN (${placeholders})`
            : `AND t.tier_name IN (${placeholders})`;
    }

    const usersResult = await executeQuery(`
        SELECT
            u.id,
            u.github_username,
            u.credits_balance,
            u.credits_rollover,
            COALESCE(td.tier_name, t.tier_name) AS effective_tier_name
        FROM users u
        LEFT JOIN tiers t ON t.id = u.tier_id
        LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
        WHERE 1 = 1
          ${createdBefore ? 'AND u.created_at <= :createdBefore' : ''}
          ${createdAfter ? 'AND u.created_at >= :createdAfter' : ''}
          ${tierFilterSql}
        ORDER BY u.id ASC
    `, binds);

    let affectedUsers = 0;

    for (const user of usersResult.rows || []) {
        const nextCreditsBalance = setCreditsBalance !== null && setCreditsBalance !== undefined
            ? Number(setCreditsBalance)
            : Number(user.CREDITS_BALANCE || 0) + Number(deltaCreditsBalance || 0);
        const nextCreditsRollover = setCreditsRollover !== null && setCreditsRollover !== undefined
            ? Number(setCreditsRollover)
            : Number(user.CREDITS_ROLLOVER || 0) + Number(deltaCreditsRollover || 0);

        await executeQuery(`
            UPDATE users
            SET credits_balance = :creditsBalance,
                credits_rollover = :creditsRollover
            WHERE id = :userId
        `, {
            userId: user.ID,
            creditsBalance: nextCreditsBalance,
            creditsRollover: nextCreditsRollover
        });

        if (resetRechargeBalances) {
            await executeQuery(`DELETE FROM user_recharge_balances WHERE user_id = :userId`, { userId: user.ID });
        }

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
                'completed',
                :message,
                CURRENT_TIMESTAMP
            )
        `, {
            batch_id: batchId,
            user_id: user.ID,
            operation_type: operationType,
            previous_tier_name: user.EFFECTIVE_TIER_NAME,
            new_tier_name: user.EFFECTIVE_TIER_NAME,
            previous_credits_balance: user.CREDITS_BALANCE,
            new_credits_balance: nextCreditsBalance,
            previous_credits_rollover: user.CREDITS_ROLLOVER,
            new_credits_rollover: nextCreditsRollover,
            message: normalizeString(reason) || 'Administrative bulk adjustment'
        });

        affectedUsers += 1;
    }

    return {
        batchId,
        affectedUsers
    };
}

export default {
    getUserCredits,
    deductCredits,
    resetMonthlyCycle,
    expireRechargesOnDowngrade,
    applyRecharge,
    bulkAdjustCredits
};
