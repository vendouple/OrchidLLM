/**
 * /api/user/profile — User Profile (read + update)
 * GET  → current user profile
 * PUT  → update username, display_name, email, avatar, notification_prefs
 */
import { withAuth } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID in session.');

    if (req.method === 'GET') {
        const r = await executeQuery(`
            SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.role,
                u.referral_code, u.notification_prefs, u.created_at,
                us.tier_id, us.status AS sub_status, us.billing_cycle,
                us.current_period_start, us.current_period_end,
                st.name AS tier_name, st.display_color_token
            FROM users u
            LEFT JOIN user_subscriptions us ON us.user_id = u.id
            LEFT JOIN subscription_tiers st ON st.id = us.tier_id
            WHERE u.id = :userId AND u.is_deleted = 0
        `, { userId });
        if (!r.rows.length) return sendError(res, 404, 'not_found', 'User not found.');

        // Get linked auth providers
        const providers = await executeQuery(
            'SELECT provider, email, linked_at FROM user_auth_providers WHERE user_id = :userId',
            { userId }).catch(() => ({ rows: [] }));

        const user = r.rows[0];
        user.auth_providers = providers.rows;
        if (user.NOTIFICATION_PREFS) {
            try { user.NOTIFICATION_PREFS = JSON.parse(user.NOTIFICATION_PREFS); } catch { /* keep raw value */ }
        }
        return sendJson(res, 200, user);
    }

    if (req.method === 'PUT') {
        const b = await readJsonBody(req);
        const sets = ['updated_at = CURRENT_TIMESTAMP'];
        const binds = { userId };

        if (b.username !== undefined) {
            if (typeof b.username !== 'string' || b.username.length < 3)
                return sendError(res, 400, 'invalid_username', 'Username must be at least 3 characters.');
            binds.un = b.username; sets.push('username = :un');
        }
        if (b.display_name !== undefined) { binds.dn = b.display_name; sets.push('display_name = :dn'); }
        if (b.email !== undefined) { binds.em = b.email; sets.push('email = :em'); }
        if (b.avatar_url !== undefined) { binds.av = b.avatar_url; sets.push('avatar_url = :av'); }
        if (b.notification_prefs !== undefined) {
            binds.np = JSON.stringify(b.notification_prefs);
            sets.push('notification_prefs = :np');
        }

        await executeQuery(`UPDATE users SET ${sets.join(', ')} WHERE id = :userId`, binds);
        return sendJson(res, 200, { message: 'Profile updated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAuth(handler);
