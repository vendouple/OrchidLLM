/**
 * /api/user/keys
 * Manage personal API keys.
 * Supports: name, allowed_models (from catalog by model_id or 'all'),
 * credit_cap_amount + credit_cap_period (daily/weekly/monthly/none).
 * 'none' = cap is set but NEVER auto-refreshes (user must manually reset).
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import crypto from 'crypto';

const MAX_KEYS = 5;

function normalizeNumber(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeCapPeriod(value) {
    const valid = ['daily', 'weekly', 'monthly', 'none'];
    const v = String(value || '').trim().toLowerCase();
    return valid.includes(v) ? v : 'none';
}

function normalizeAllowedModels(value) {
    if (!value || value === 'all' || value === '*') return '*';
    if (Array.isArray(value)) {
        const ids = value.map(v => String(v || '').trim()).filter(Boolean);
        return ids.length > 0 ? JSON.stringify(ids) : '*';
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return normalizeAllowedModels(parsed);
        } catch { /* ignore */ }
        return value.trim() || '*';
    }
    return '*';
}

export default async function handler(req, res) {
    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // ── GET ──────────────────────────────────────────────────────────────
        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT
                    id, key, name, is_active,
                    daily_credit_limit, monthly_credit_limit, overall_credit_limit,
                    credit_cap_amount, credit_cap_period, credit_cap_reset_at,
                    allowed_models,
                    created_at, last_used, usage_count,
                    total_input_tokens, total_output_tokens
                FROM api_keys
                WHERE user_id = :userId
                ORDER BY created_at DESC
            `, { userId: session.userId });

            const rows = (result.rows || []).map(row => ({
                id: row.ID,
                key: row.KEY,
                name: row.NAME,
                isActive: row.IS_ACTIVE === 1,
                dailyCreditLimit: row.DAILY_CREDIT_LIMIT,
                monthlyCreditLimit: row.MONTHLY_CREDIT_LIMIT,
                overallCreditLimit: row.OVERALL_CREDIT_LIMIT,
                creditCapAmount: row.CREDIT_CAP_AMOUNT,
                creditCapPeriod: row.CREDIT_CAP_PERIOD || 'none',
                creditCapResetAt: row.CREDIT_CAP_RESET_AT,
                allowedModels: row.ALLOWED_MODELS === '*' ? 'all' : row.ALLOWED_MODELS,
                createdAt: row.CREATED_AT,
                lastUsed: row.LAST_USED,
                usageCount: row.USAGE_COUNT,
                totalInputTokens: row.TOTAL_INPUT_TOKENS,
                totalOutputTokens: row.TOTAL_OUTPUT_TOKENS
            }));

            return res.status(200).json(rows);
        }

        // ── POST ─────────────────────────────────────────────────────────────
        if (req.method === 'POST') {
            const countResult = await executeQuery(
                `SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = :userId AND is_active = 1`,
                { userId: session.userId }
            );
            if ((countResult.rows?.[0]?.CNT || 0) >= MAX_KEYS) {
                return res.status(400).json({ error: `Maximum of ${MAX_KEYS} active personal keys allowed` });
            }

            const body = req.body || {};
            const {
                name,
                allowedModels,
                creditCapAmount,
                creditCapPeriod,
                dailyLimit,
                monthlyLimit,
                overallLimit
            } = body;

            const rawKey = 'sk-' + crypto.randomBytes(24).toString('hex');
            const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

            await executeQuery(`
                INSERT INTO api_keys (
                    key, name, key_type, user_id,
                    daily_credit_limit, monthly_credit_limit, overall_credit_limit,
                    credit_cap_amount, credit_cap_period,
                    allowed_models,
                    is_active, created_by
                ) VALUES (
                    :keyHash, :name, 'user', :userId,
                    :dailyLimit, :monthlyLimit, :overallLimit,
                    :creditCapAmount, :creditCapPeriod,
                    :allowedModels,
                    1, :createdBy
                )
            `, {
                keyHash,
                name: String(name || 'My Key').trim().slice(0, 100),
                userId: session.userId,
                dailyLimit: normalizeNumber(dailyLimit, -1),
                monthlyLimit: normalizeNumber(monthlyLimit, -1),
                overallLimit: normalizeNumber(overallLimit, -1),
                creditCapAmount: normalizeNumber(creditCapAmount, -1),
                creditCapPeriod: normalizeCapPeriod(creditCapPeriod),
                allowedModels: normalizeAllowedModels(allowedModels),
                createdBy: session.githubUsername
            });

            return res.status(201).json({ success: true, key: rawKey });
        }

        // ── PUT ─────────────────────────────────────────────────────────────
        if (req.method === 'PUT') {
            const {
                id,
                name,
                allowedModels,
                creditCapAmount,
                creditCapPeriod,
                dailyLimit,
                monthlyLimit,
                overallLimit
            } = req.body || {};
            if (!id) return res.status(400).json({ error: 'id required' });

            await executeQuery(`
                UPDATE api_keys SET
                    name = :name,
                    daily_credit_limit = :dailyLimit,
                    monthly_credit_limit = :monthlyLimit,
                    overall_credit_limit = :overallLimit,
                    credit_cap_amount = :creditCapAmount,
                    credit_cap_period = :creditCapPeriod,
                    allowed_models = :allowedModels
                WHERE id = :id AND user_id = :userId
            `, {
                id,
                userId: session.userId,
                name: String(name || 'My Key').trim().slice(0, 100),
                dailyLimit: normalizeNumber(dailyLimit, -1),
                monthlyLimit: normalizeNumber(monthlyLimit, -1),
                overallLimit: normalizeNumber(overallLimit, -1),
                creditCapAmount: normalizeNumber(creditCapAmount, -1),
                creditCapPeriod: normalizeCapPeriod(creditCapPeriod),
                allowedModels: normalizeAllowedModels(allowedModels)
            });

            return res.status(200).json({ success: true });
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const id = req.query.id || req.body?.id;
            if (!id) return res.status(400).json({ error: 'id required' });

            await executeQuery(
                `UPDATE api_keys SET is_active = 0 WHERE id = :id AND user_id = :userId`,
                { id, userId: session.userId }
            );
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
