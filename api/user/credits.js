/**
 * /api/user/credits — Credit State
 * GET → full credit breakdown (standard, fast, rollover, reserved, boosters)
 */
import { withAuth } from '../../lib/middleware.js';
import { getCreditState, totalAvailable, isExhausted } from '../../lib/billing.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID in session.');

    const state = await getCreditState(userId);
    return sendJson(res, 200, {
        credits: {
            standard: state.standard,
            fast: state.fast,
            rollover: state.rollover,
            reserved: state.reserved,
        },
        boosters: state.boosters,
        totalAvailable: totalAvailable(state),
        isExhausted: isExhausted(state),
    });
}

export default withAuth(handler);
