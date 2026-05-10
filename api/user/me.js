/**
 * /api/user/me
 * Get current user profile and credit state
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { getUserCredits } from '../../lib/credits.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const credits = await getUserCredits(session.userId);

        if (!credits) {
            return res.status(404).json({ error: 'User not found in DB' });
        }

        res.status(200).json({
            user: {
                id: credits.USER_ID,
                username: session.githubUsername,
                avatar: session.githubAvatar,
                isAdmin: session.isAdmin,
                is_admin: session.isAdmin === true
            },
            tier: {
                id: credits.TIER_ID,
                name: credits.TIER_NAME,
                tierName: credits.TIER_NAME,
                level: credits.TIER_LEVEL,
                monthlyCredits: credits.MONTHLY_CREDITS,
                modelAccessLevel: credits.MODEL_ACCESS_LEVEL,
                sortOrder: credits.SORT_ORDER,
                effectiveSortOrder: credits.CANONICAL_SORT_ORDER ?? credits.SORT_ORDER
            },
            credits: {
                balance: credits.CREDITS_BALANCE,
                rollover: credits.CREDITS_ROLLOVER,
                billingCycleStart: credits.BILLING_CYCLE_START,
                billingCycleEnd: credits.BILLING_CYCLE_END,
                billingPeriod: credits.BILLING_PERIOD || 'monthly',
                rechargeBalances: credits.recharge_balances.map(rb => ({
                    id: rb.ID,
                    tierId: rb.TIER_ID,
                    tierName: rb.TIER_NAME,
                    tierLevel: rb.TIER_LEVEL,
                    remaining: rb.CREDITS_REMAINING,
                    expiresAt: rb.EXPIRES_AT
                }))
            }
        });
    } catch (error) {
        console.error('[user/me] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
