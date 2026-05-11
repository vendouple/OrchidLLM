/**
 * /api/user/keys — API Key Management
 * GET    → list user's keys
 * POST   → create new key
 * PUT?id → update key (label, limits, whitelist, toggles)
 * DELETE?id → delete key
 * POST?action=rotate&id=N → rotate key
 */
import { withAuth } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { generateApiKey } from '../../lib/keys.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const userId = req.auth?.userId;
    if (!userId) return sendError(res, 401, 'no_user', 'No user ID.');
    const id = req.query?.id;

    if (req.method === 'GET') {
        const r = await executeQuery(`
            SELECT id, key_preview, label, is_active, credit_limit_total, credit_limit_daily,
                credit_limit_reset, credit_used_today, credit_used_total, model_whitelist,
                expose_balance, created_at, last_used_at, expires_at
            FROM api_keys WHERE user_id = :userId ORDER BY created_at DESC
        `, { userId });
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const action = req.query?.action;

        if (action === 'rotate' && id) {
            // Rotate: generate new key, keep config
            const existing = await executeQuery(
                'SELECT label, credit_limit_total, credit_limit_daily, credit_limit_reset, model_whitelist, expose_balance FROM api_keys WHERE id = :id AND user_id = :userId',
                { id, userId });
            if (!existing.rows.length) return sendError(res, 404, 'not_found', 'Key not found.');
            const row = existing.rows[0];
            const { key, hash, preview } = generateApiKey();
            await executeQuery(`
                UPDATE api_keys SET key_hash = :hash, key_preview = :preview,
                    credit_used_today = 0, last_used_at = NULL
                WHERE id = :id AND user_id = :userId
            `, { hash, preview, id, userId });
            return sendJson(res, 200, { key, preview, message: 'Key rotated. Save this — it won\'t be shown again.' });
        }

        // Check key limit
        const tierRes = await executeQuery(`
            SELECT st.max_api_keys FROM user_subscriptions us
            JOIN subscription_tiers st ON st.id = us.tier_id
            WHERE us.user_id = :userId AND us.status = 'active'
        `, { userId });
        const maxKeys = tierRes.rows[0]?.MAX_API_KEYS ?? 3;
        const countRes = await executeQuery(
            'SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = :userId AND is_active = 1',
            { userId });
        if ((countRes.rows[0]?.CNT || 0) >= maxKeys) {
            return sendError(res, 403, 'key_limit', `Your plan allows ${maxKeys} active keys.`);
        }

        const b = await readJsonBody(req);
        const { key, hash, preview } = generateApiKey(b.prefix);
        await executeQuery(`
            INSERT INTO api_keys (user_id, key_hash, key_preview, label, credit_limit_total,
                credit_limit_daily, credit_limit_reset, model_whitelist, expose_balance, expires_at)
            VALUES (:userId, :hash, :preview, :label, :limitTotal, :limitDaily, :limitReset,
                :whitelist, :expose, :expires)
        `, {
            userId, hash, preview,
            label: b.label || 'My Key',
            limitTotal: b.credit_limit_total ?? null,
            limitDaily: b.credit_limit_daily ?? null,
            limitReset: b.credit_limit_reset || 'daily',
            whitelist: b.model_whitelist ? JSON.stringify(b.model_whitelist) : null,
            expose: b.expose_balance ? 1 : 0,
            expires: b.expires_at || null,
        });
        return sendJson(res, 201, { key, preview, message: 'Key created. Save this — it won\'t be shown again.' });
    }

    if (req.method === 'PUT') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        const b = await readJsonBody(req);
        const sets = [];
        const binds = { id, userId };
        const fields = { label:'lb', credit_limit_total:'clt', credit_limit_daily:'cld',
            credit_limit_reset:'clr', expose_balance:'eb', expires_at:'ea' };
        for (const [col, bind] of Object.entries(fields)) {
            if (b[col] !== undefined) {
                binds[bind] = col === 'expose_balance' ? (b[col] ? 1 : 0) : b[col];
                sets.push(`${col} = :${bind}`);
            }
        }
        if (b.model_whitelist !== undefined) {
            binds.mw = b.model_whitelist ? JSON.stringify(b.model_whitelist) : null;
            sets.push('model_whitelist = :mw');
        }
        if (b.is_active !== undefined) { binds.ia = b.is_active ? 1 : 0; sets.push('is_active = :ia'); }
        if (!sets.length) return sendError(res, 400, 'no_fields', 'No fields to update.');
        await executeQuery(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = :id AND user_id = :userId`, binds);
        return sendJson(res, 200, { message: 'Key updated.' });
    }

    if (req.method === 'DELETE') {
        if (!id) return sendError(res, 400, 'missing_id', 'id required.');
        await executeQuery('DELETE FROM api_keys WHERE id = :id AND user_id = :userId', { id, userId });
        return sendJson(res, 200, { message: 'Key deleted.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAuth(handler);
