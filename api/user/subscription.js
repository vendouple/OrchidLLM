/**
 * /api/user/subscription — Subscription Info
 * GET → current subscription details
 */
import { withAuth } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID.');

    const r = await executeQuery(`
        SELECT us.*, st.name AS tier_name, st.display_color_token,
            st.credits_standard_monthly, st.credits_fast_monthly,
            st.model_access_tier, st.supports_rollover, st.supports_compression,
            st.rpm_normal, st.max_concurrent_requests, st.max_api_keys,
            pt.name AS pending_tier_name
        FROM user_subscriptions us
        JOIN subscription_tiers st ON st.id = us.tier_id
        LEFT JOIN subscription_tiers pt ON pt.id = us.pending_tier_id
        WHERE us.user_id = :userId
    `, { userId });

    if (!r.rows.length) return sendJson(res, 200, { subscription: null });
    return sendJson(res, 200, { subscription: r.rows[0] });
}

export default withAuth(handler);
