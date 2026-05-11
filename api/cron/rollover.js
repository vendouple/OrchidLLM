/**
 * /api/cron/rollover — End-of-cycle credit rollover
 * Processes all users whose billing cycle ends today.
 * Schedule: daily at 04:00 UTC
 */
import { withCron } from '../../lib/middleware.js';
import { executeQuery, isDbConfigured } from '../../lib/oracle.js';
import { processRollover } from '../../lib/billing.js';
import { sendJson } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (!isDbConfigured()) return sendJson(res, 200, { processed: 0 });

    // Find users whose billing cycle ended
    const users = await executeQuery(`
        SELECT us.user_id FROM user_subscriptions us
        WHERE us.status = 'active'
          AND us.current_period_end <= CURRENT_TIMESTAMP
    `);

    let processed = 0;
    for (const row of users.rows) {
        try {
            await processRollover(row.USER_ID);

            // Reset credits to tier defaults and advance billing period
            await executeQuery(`
                UPDATE user_credits uc SET
                    credits_standard = (SELECT st.credits_standard_monthly FROM user_subscriptions us
                        JOIN subscription_tiers st ON st.id = us.tier_id WHERE us.user_id = uc.user_id),
                    credits_fast = (SELECT st.credits_fast_monthly FROM user_subscriptions us
                        JOIN subscription_tiers st ON st.id = us.tier_id WHERE us.user_id = uc.user_id),
                    credits_reserved = 0,
                    last_updated = CURRENT_TIMESTAMP
                WHERE user_id = :userId
            `, { userId: row.USER_ID });

            await executeQuery(`
                UPDATE user_subscriptions SET
                    current_period_start = CURRENT_TIMESTAMP,
                    current_period_end = ADD_MONTHS(CURRENT_TIMESTAMP, 1)
                WHERE user_id = :userId AND status = 'active'
            `, { userId: row.USER_ID });

            processed++;
        } catch (err) {
            console.error(`[cron/rollover] Failed for user ${row.USER_ID}:`, err.message);
        }
    }

    console.log(`[cron/rollover] Processed ${processed}/${users.rows.length} users.`);
    return sendJson(res, 200, { processed, total: users.rows.length });
}

export default withCron(handler);
