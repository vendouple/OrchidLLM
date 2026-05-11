/**
 * lib/billing.js — Credit Engine
 *
 * Credit pool depletion order (§7):
 * 1. Booster fast credits (highest priority pack first)
 * 2. Booster standard credits
 * 3. Rollover credits
 * 4. Subscription fast credits
 * 5. Subscription standard credits
 */
import { executeQuery } from './oracle.js';

/**
 * Get full credit state for a user.
 */
export async function getCreditState(userId) {
    const credits = await executeQuery('SELECT * FROM user_credits WHERE user_id = :userId', { userId });
    const boosters = await executeQuery(`
        SELECT ubp.*, bp.name, bp.queue_priority_fast, bp.queue_priority_standard
        FROM user_booster_packs ubp
        JOIN booster_packs bp ON bp.id = ubp.pack_id
        WHERE ubp.user_id = :userId AND ubp.is_active = 1
            AND (ubp.expires_at IS NULL OR ubp.expires_at > CURRENT_TIMESTAMP)
        ORDER BY bp.queue_priority_fast DESC
    `, { userId });

    const row = credits.rows[0] || {};
    return {
        standard: row.CREDITS_STANDARD || 0,
        fast: row.CREDITS_FAST || 0,
        rollover: row.CREDITS_ROLLOVER || 0,
        reserved: row.CREDITS_RESERVED || 0,
        boosters: boosters.rows.map(b => ({
            id: b.ID, packId: b.PACK_ID, name: b.NAME,
            standardRemaining: b.CREDITS_STANDARD_REMAINING || 0,
            fastRemaining: b.CREDITS_FAST_REMAINING || 0,
            priorityFast: b.QUEUE_PRIORITY_FAST || 0,
            priorityStandard: b.QUEUE_PRIORITY_STANDARD || 0,
            expiresAt: b.EXPIRES_AT,
        })),
    };
}

export function totalAvailable(state) {
    const boosterTotal = state.boosters.reduce((s, b) => s + b.standardRemaining + b.fastRemaining, 0);
    return state.standard + state.fast + state.rollover + boosterTotal - state.reserved;
}

export function isExhausted(state) {
    return totalAvailable(state) <= 0;
}

/**
 * Reserve estimated credits before queuing.
 * @returns {boolean} true if reservation successful
 */
export async function reserveCredits(userId, amount) {
    if (amount <= 0) return true;
    const state = await getCreditState(userId);
    if (totalAvailable(state) < amount) return false;

    await executeQuery(`
        UPDATE user_credits SET credits_reserved = credits_reserved + :amount,
            last_updated = CURRENT_TIMESTAMP
        WHERE user_id = :userId
    `, { userId, amount });

    await executeQuery(`
        INSERT INTO user_credit_ledger (user_id, source, amount, balance_after, notes)
        VALUES (:userId, 'reservation', :amount, :bal, 'Credit reservation')
    `, { userId, amount: -amount, bal: totalAvailable(state) - amount });

    return true;
}

/**
 * Reconcile actual cost against reservation.
 */
export async function reconcileCredits(userId, estimatedCost, actualCost) {
    const delta = estimatedCost - actualCost;

    // Release reservation
    await executeQuery(`
        UPDATE user_credits SET credits_reserved = GREATEST(credits_reserved - :estimated, 0),
            last_updated = CURRENT_TIMESTAMP
        WHERE user_id = :userId
    `, { userId, estimated: estimatedCost });

    // Deduct actual cost from pools in priority order
    if (actualCost > 0) {
        let remaining = actualCost;

        // 1. Booster fast credits
        const boosters = await executeQuery(`
            SELECT ubp.id, ubp.credits_fast_remaining, ubp.credits_standard_remaining, bp.queue_priority_fast
            FROM user_booster_packs ubp JOIN booster_packs bp ON bp.id = ubp.pack_id
            WHERE ubp.user_id = :userId AND ubp.is_active = 1
                AND (ubp.expires_at IS NULL OR ubp.expires_at > CURRENT_TIMESTAMP)
            ORDER BY bp.queue_priority_fast DESC
        `, { userId });

        for (const b of boosters.rows) {
            if (remaining <= 0) break;
            const fastAvail = b.CREDITS_FAST_REMAINING || 0;
            if (fastAvail > 0) {
                const deduct = Math.min(remaining, fastAvail);
                await executeQuery('UPDATE user_booster_packs SET credits_fast_remaining = credits_fast_remaining - :d WHERE id = :id',
                    { d: deduct, id: b.ID });
                remaining -= deduct;
            }
        }

        // 2. Booster standard credits
        for (const b of boosters.rows) {
            if (remaining <= 0) break;
            const stdAvail = b.CREDITS_STANDARD_REMAINING || 0;
            if (stdAvail > 0) {
                const deduct = Math.min(remaining, stdAvail);
                await executeQuery('UPDATE user_booster_packs SET credits_standard_remaining = credits_standard_remaining - :d WHERE id = :id',
                    { d: deduct, id: b.ID });
                remaining -= deduct;
            }
        }

        // 3. Rollover → 4. Fast → 5. Standard
        if (remaining > 0) {
            const pools = ['credits_rollover', 'credits_fast', 'credits_standard'];
            for (const pool of pools) {
                if (remaining <= 0) break;
                const cur = await executeQuery(`SELECT ${pool} AS val FROM user_credits WHERE user_id = :userId`, { userId });
                const avail = cur.rows[0]?.VAL || 0;
                if (avail > 0) {
                    const deduct = Math.min(remaining, avail);
                    await executeQuery(`UPDATE user_credits SET ${pool} = ${pool} - :d, last_updated = CURRENT_TIMESTAMP WHERE user_id = :userId`,
                        { d: deduct, userId });
                    remaining -= deduct;
                }
            }
        }

        await executeQuery(`
            INSERT INTO user_credit_ledger (user_id, source, amount, balance_after, notes)
            VALUES (:userId, 'reconcile', :amount, 0, 'Actual cost reconciliation')
        `, { userId, amount: -actualCost });
    }
}

/**
 * Release a full reservation (on failure — no charge).
 */
export async function releaseReservation(userId, amount) {
    await executeQuery(`
        UPDATE user_credits SET credits_reserved = GREATEST(credits_reserved - :amount, 0),
            last_updated = CURRENT_TIMESTAMP
        WHERE user_id = :userId
    `, { userId, amount });
}

/**
 * Get effective queue priority for a user.
 */
export async function getEffectivePriority(userId, tierId) {
    const tier = await executeQuery('SELECT queue_priority_standard, queue_priority_fast FROM subscription_tiers WHERE id = :tierId', { tierId });
    const base = tier.rows[0]?.QUEUE_PRIORITY_STANDARD || 0;

    // Check for active booster with higher priority
    const boosters = await executeQuery(`
        SELECT MAX(bp.queue_priority_fast) AS max_fast, MAX(bp.queue_priority_standard) AS max_std
        FROM user_booster_packs ubp JOIN booster_packs bp ON bp.id = ubp.pack_id
        WHERE ubp.user_id = :userId AND ubp.is_active = 1
            AND (ubp.expires_at IS NULL OR ubp.expires_at > CURRENT_TIMESTAMP)
            AND (ubp.credits_fast_remaining > 0 OR ubp.credits_standard_remaining > 0)
    `, { userId });

    const boosterFast = boosters.rows[0]?.MAX_FAST || 0;
    const boosterStd = boosters.rows[0]?.MAX_STD || 0;
    return Math.max(base, boosterFast, boosterStd);
}

/**
 * Process rollover for a user at end of billing cycle.
 */
export async function processRollover(userId) {
    const sub = await executeQuery(`
        SELECT us.tier_id, st.supports_rollover, st.rollover_percentage, st.rollover_max_cap
        FROM user_subscriptions us JOIN subscription_tiers st ON st.id = us.tier_id
        WHERE us.user_id = :userId AND us.status = 'active'
    `, { userId });
    if (!sub.rows.length) return;
    const tier = sub.rows[0];
    if (!tier.SUPPORTS_ROLLOVER) return;

    const credits = await executeQuery('SELECT credits_standard, credits_rollover FROM user_credits WHERE user_id = :userId', { userId });
    if (!credits.rows.length) return;
    const { CREDITS_STANDARD: remaining, CREDITS_ROLLOVER: currentRollover } = credits.rows[0];

    const rolloverAmount = Math.min(
        Math.floor(remaining * (tier.ROLLOVER_PERCENTAGE || 0)),
        Math.max(0, (tier.ROLLOVER_MAX_CAP || 0) - (currentRollover || 0))
    );

    if (rolloverAmount > 0) {
        await executeQuery(`
            UPDATE user_credits SET credits_rollover = credits_rollover + :amount, last_updated = CURRENT_TIMESTAMP
            WHERE user_id = :userId
        `, { userId, amount: rolloverAmount });

        await executeQuery(`
            INSERT INTO user_credit_ledger (user_id, source, amount, balance_after, notes)
            VALUES (:userId, 'rollover', :amount, 0, 'End-of-cycle rollover')
        `, { userId, amount: rolloverAmount });
    }
}
