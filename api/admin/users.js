/**
 * /api/admin/users — User Management
 * GET         → list users (paginated)
 * GET?id=N    → single user with subscription + credits
 * PUT?id=N    → update user (role, tier, credits, suspend)
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const id = req.query?.id;
    const search = req.query?.search;
    const limit = Math.min(Number(req.query?.limit || 50), 200);
    const offset = Number(req.query?.offset || 0);

    if (req.method === 'GET') {
        if (id) {
            const r = await executeQuery(`
                SELECT u.*, us.tier_id, us.status AS sub_status, us.billing_cycle,
                    us.current_period_start, us.current_period_end, us.pending_tier_id,
                    st.name AS tier_name, st.model_access_tier,
                    uc.credits_standard, uc.credits_fast, uc.credits_rollover, uc.credits_reserved
                FROM users u
                LEFT JOIN user_subscriptions us ON us.user_id = u.id
                LEFT JOIN subscription_tiers st ON st.id = us.tier_id
                LEFT JOIN user_credits uc ON uc.user_id = u.id
                WHERE u.id = :id
            `, { id });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'User not found.');
            return sendJson(res, 200, r.rows[0]);
        }

        let sql = `SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.role,
            u.is_deleted, u.created_at, st.name AS tier_name
            FROM users u
            LEFT JOIN user_subscriptions us ON us.user_id = u.id
            LEFT JOIN subscription_tiers st ON st.id = us.tier_id`;
        const binds = {};

        if (search) {
            sql += ` WHERE LOWER(u.username) LIKE :search OR LOWER(u.email) LIKE :search`;
            binds.search = `%${search.toLowerCase()}%`;
        }
        sql += ` ORDER BY u.created_at DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
        binds.offset = offset;
        binds.limit = limit;

        const r = await executeQuery(sql, binds);
        return sendJson(res, 200, { data: r.rows, offset, limit });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);

        // Update user fields
        if (b.role !== undefined) {
            await executeQuery('UPDATE users SET role = :role, updated_at = CURRENT_TIMESTAMP WHERE id = :id',
                { id, role: b.role });
        }

        // Manual tier change
        if (b.tier_id !== undefined) {
            const existing = await executeQuery(
                'SELECT id FROM user_subscriptions WHERE user_id = :id', { id });
            if (existing.rows.length) {
                await executeQuery(`UPDATE user_subscriptions SET tier_id = :tierId,
                    status = 'active', current_period_start = CURRENT_TIMESTAMP,
                    current_period_end = ADD_MONTHS(CURRENT_TIMESTAMP, 1)
                    WHERE user_id = :id`, { id, tierId: b.tier_id });
            } else {
                await executeQuery(`INSERT INTO user_subscriptions (user_id, tier_id, status, billing_cycle, current_period_end)
                    VALUES (:id, :tierId, 'active', 'monthly', ADD_MONTHS(CURRENT_TIMESTAMP, 1))`,
                    { id, tierId: b.tier_id });
            }
        }

        // Credit adjustments
        if (b.credits_standard !== undefined || b.credits_fast !== undefined || b.credits_rollover !== undefined) {
            const sets = ['last_updated = CURRENT_TIMESTAMP'];
            const binds2 = { id };
            if (b.credits_standard !== undefined) { binds2.cs = b.credits_standard; sets.push('credits_standard = :cs'); }
            if (b.credits_fast !== undefined) { binds2.cf = b.credits_fast; sets.push('credits_fast = :cf'); }
            if (b.credits_rollover !== undefined) { binds2.cr = b.credits_rollover; sets.push('credits_rollover = :cr'); }

            const exists = await executeQuery('SELECT 1 FROM user_credits WHERE user_id = :id', { id });
            if (exists.rows.length) {
                await executeQuery(`UPDATE user_credits SET ${sets.join(', ')} WHERE user_id = :id`, binds2);
            } else {
                await executeQuery(`INSERT INTO user_credits (user_id, credits_standard, credits_fast, credits_rollover)
                    VALUES (:id, :cs, :cf, :cr)`, { id, cs: b.credits_standard ?? 0, cf: b.credits_fast ?? 0, cr: b.credits_rollover ?? 0 });
            }
        }

        // Suspend / unsuspend
        if (b.is_deleted !== undefined) {
            await executeQuery(`UPDATE users SET is_deleted = :del,
                deleted_at = CASE WHEN :del = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
                { id, del: b.is_deleted ? 1 : 0 });
        }

        return sendJson(res, 200, { message: 'User updated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
