/**
 * /api/user/keys
 * Manage personal API keys
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT 
                    id, key, name, is_active, daily_credit_limit, monthly_credit_limit, overall_credit_limit,
                    created_at, last_used, usage_count, total_input_tokens, total_output_tokens
                FROM api_keys
                WHERE user_id = :userId
                ORDER BY created_at DESC
            `, { userId: session.userId });

            return res.status(200).json(result.rows || []);
        }

        if (req.method === 'POST') {
            const countResult = await executeQuery(`SELECT COUNT(*) as count FROM api_keys WHERE user_id = :userId`, { userId: session.userId });
            if (countResult.rows[0].COUNT >= 5) {
                return res.status(400).json({ error: 'Maximum of 5 personal keys allowed' });
            }

            const { name, dailyLimit, monthlyLimit, overallLimit } = req.body || {};
            const rawKey = 'sk-' + crypto.randomBytes(24).toString('hex');
            const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

            await executeQuery(`
                INSERT INTO api_keys (
                    key, name, key_type, user_id, 
                    daily_credit_limit, monthly_credit_limit, overall_credit_limit,
                    is_active, created_by
                ) VALUES (
                    :keyHash, :name, 'user', :userId,
                    :dailyLimit, :monthlyLimit, :overallLimit,
                    1, :createdBy
                )
            `, {
                keyHash,
                name: name || 'Personal Key',
                userId: session.userId,
                dailyLimit: dailyLimit !== undefined ? Number(dailyLimit) : -1,
                monthlyLimit: monthlyLimit !== undefined ? Number(monthlyLimit) : -1,
                overallLimit: overallLimit !== undefined ? Number(overallLimit) : -1,
                createdBy: session.githubUsername
            });

            return res.status(201).json({ success: true, key: rawKey });
        }

        if (req.method === 'PUT') {
            const { id, name, dailyLimit, monthlyLimit, overallLimit } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });

            await executeQuery(`
                UPDATE api_keys 
                SET name = :name,
                    daily_credit_limit = :dailyLimit,
                    monthly_credit_limit = :monthlyLimit,
                    overall_credit_limit = :overallLimit
                WHERE id = :id AND user_id = :userId
            `, {
                name,
                dailyLimit: Number(dailyLimit) || -1,
                monthlyLimit: Number(monthlyLimit) || -1,
                overallLimit: Number(overallLimit) || -1,
                id,
                userId: session.userId
            });

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const id = req.query.id || req.body.id;
            if (!id) return res.status(400).json({ error: 'id required' });

            await executeQuery(`DELETE FROM api_keys WHERE id = :id AND user_id = :userId`, { id, userId: session.userId });
            return res.status(200).json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[user/keys] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
