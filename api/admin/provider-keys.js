/**
 * /api/admin/provider-keys - Provider upstream key management (admin only)
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { normalizeProviderName, getProviderDefinition } from '../../lib/provider-registry.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

function sanitizeCounterType(type, providerId) {
    if (typeof type === 'string' && type.trim()) {
        return type.trim();
    }

    const provider = getProviderDefinition(providerId);
    return provider?.usageCounterType || 'tokens';
}

async function handleGet(req, res) {
    if (!await requireAdmin(req, res)) return;

    const result = await executeQuery(
        `SELECT
            id,
            provider_name,
            key_name,
            is_active,
            priority,
            usage_counter_type,
            daily_limit,
            minute_limit,
            tokens_daily_limit,
            units_daily_limit,
            requests_today,
            tokens_today,
            units_today,
            resets_at,
            reset_interval,
            created_at,
            last_used,
            last_error
         FROM provider_keys
         ORDER BY provider_name ASC, priority DESC, created_at DESC`
    );

    res.status(200).json(result.rows);
}

async function handlePost(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const {
        providerName,
        keyName,
        apiKey,
        priority = 0,
        usageCounterType,
        dailyLimit = -1,
        minuteLimit = -1,
        tokensDailyLimit = -1,
        unitsDailyLimit = -1,
        resetInterval = 'daily'
    } = req.body || {};

    const normalizedProvider = normalizeProviderName(providerName);
    if (!normalizedProvider) {
        return res.status(400).json({ error: 'Invalid providerName' });
    }

    if (!keyName || !String(keyName).trim()) {
        return res.status(400).json({ error: 'keyName is required' });
    }

    if (!apiKey || !String(apiKey).trim()) {
        return res.status(400).json({ error: 'apiKey is required' });
    }

    await executeQuery(
        `INSERT INTO provider_keys (
            provider_name,
            key_name,
            api_key,
            is_active,
            priority,
            usage_counter_type,
            daily_limit,
            minute_limit,
            tokens_daily_limit,
            units_daily_limit,
            requests_today,
            tokens_today,
            units_today,
            reset_interval,
            resets_at,
            created_by
        ) VALUES (
            :providerName,
            :keyName,
            :apiKey,
            1,
            :priority,
            :usageCounterType,
            :dailyLimit,
            :minuteLimit,
            :tokensDailyLimit,
            :unitsDailyLimit,
            0,
            0,
            0,
            :resetInterval,
            CASE
                WHEN :resetInterval = 'daily' THEN TRUNC(SYSDATE) + 1
                ELSE NULL
            END,
            :createdBy
        )`,
        {
            providerName: normalizedProvider,
            keyName: String(keyName).trim(),
            apiKey: String(apiKey).trim(),
            priority: Number(priority) || 0,
            usageCounterType: sanitizeCounterType(usageCounterType, normalizedProvider),
            dailyLimit: Number.isFinite(Number(dailyLimit)) ? Number(dailyLimit) : -1,
            minuteLimit: Number.isFinite(Number(minuteLimit)) ? Number(minuteLimit) : -1,
            tokensDailyLimit: Number.isFinite(Number(tokensDailyLimit)) ? Number(tokensDailyLimit) : -1,
            unitsDailyLimit: Number.isFinite(Number(unitsDailyLimit)) ? Number(unitsDailyLimit) : -1,
            resetInterval: String(resetInterval || 'daily').trim().toLowerCase(),
            createdBy: session.githubUsername || 'admin'
        }
    );

    res.status(201).json({ success: true });
}

async function handlePut(req, res) {
    if (!await requireAdmin(req, res)) return;

    const { keyId, ...updates } = req.body || {};
    if (!keyId) {
        return res.status(400).json({ error: 'keyId is required' });
    }

    const setParts = [];
    const binds = { id: keyId };

    if (updates.providerName !== undefined) {
        const normalized = normalizeProviderName(updates.providerName);
        if (!normalized) {
            return res.status(400).json({ error: 'Invalid providerName' });
        }
        setParts.push('provider_name = :providerName');
        binds.providerName = normalized;
    }

    if (updates.keyName !== undefined) {
        setParts.push('key_name = :keyName');
        binds.keyName = String(updates.keyName || '').trim();
    }

    if (updates.apiKey !== undefined) {
        setParts.push('api_key = :apiKey');
        binds.apiKey = String(updates.apiKey || '').trim();
    }

    if (updates.priority !== undefined) {
        setParts.push('priority = :priority');
        binds.priority = Number(updates.priority) || 0;
    }

    if (updates.usageCounterType !== undefined) {
        setParts.push('usage_counter_type = :usageCounterType');
        binds.usageCounterType = String(updates.usageCounterType || '').trim() || 'tokens';
    }

    if (updates.dailyLimit !== undefined) {
        setParts.push('daily_limit = :dailyLimit');
        binds.dailyLimit = Number.isFinite(Number(updates.dailyLimit)) ? Number(updates.dailyLimit) : -1;
    }

    if (updates.minuteLimit !== undefined) {
        setParts.push('minute_limit = :minuteLimit');
        binds.minuteLimit = Number.isFinite(Number(updates.minuteLimit)) ? Number(updates.minuteLimit) : -1;
    }

    if (updates.tokensDailyLimit !== undefined) {
        setParts.push('tokens_daily_limit = :tokensDailyLimit');
        binds.tokensDailyLimit = Number.isFinite(Number(updates.tokensDailyLimit)) ? Number(updates.tokensDailyLimit) : -1;
    }

    if (updates.unitsDailyLimit !== undefined) {
        setParts.push('units_daily_limit = :unitsDailyLimit');
        binds.unitsDailyLimit = Number.isFinite(Number(updates.unitsDailyLimit)) ? Number(updates.unitsDailyLimit) : -1;
    }

    if (updates.resetInterval !== undefined) {
        const value = String(updates.resetInterval || 'daily').trim().toLowerCase();
        setParts.push('reset_interval = :resetInterval');
        setParts.push(`resets_at = CASE WHEN :resetInterval = 'daily' THEN TRUNC(SYSDATE) + 1 ELSE resets_at END`);
        binds.resetInterval = value;
    }

    if (updates.isActive !== undefined) {
        setParts.push('is_active = :isActive');
        binds.isActive = updates.isActive ? 1 : 0;
    }

    if (updates.resetCounters === true) {
        setParts.push('requests_today = 0');
        setParts.push('tokens_today = 0');
        setParts.push('units_today = 0');
        setParts.push('last_error = NULL');
    }

    if (setParts.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }

    await executeQuery(
        `UPDATE provider_keys
         SET ${setParts.join(', ')}
         WHERE id = :id`,
        binds
    );

    res.status(200).json({ success: true });
}

async function handleDelete(req, res) {
    if (!await requireAdmin(req, res)) return;

    const keyId = req.query.keyId;
    if (!keyId) {
        return res.status(400).json({ error: 'keyId is required' });
    }

    await executeQuery(
        `UPDATE provider_keys
         SET is_active = 0
         WHERE id = :id`,
        { id: keyId }
    );

    res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':
                await handleGet(req, res);
                break;
            case 'POST':
                await handlePost(req, res);
                break;
            case 'PUT':
                await handlePut(req, res);
                break;
            case 'DELETE':
                await handleDelete(req, res);
                break;
            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('[admin/provider-keys] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
