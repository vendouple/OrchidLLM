/**
 * /api/admin/providers
 * Returns provider names for admin dropdowns and manages provider context
 * multipliers used by credit calculation.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { getSupportedProviderNames, normalizeProviderName } from '../../lib/provider-registry.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function isUniqueConstraintError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00001') || message.includes('unique constraint');
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeBooleanFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    return fallback;
}

function normalizeMultiplierPayload(body = {}) {
    const providerName = normalizeProviderName(body.providerName || body.provider_name);
    const contextThresholdTokens = Math.floor(normalizeNumber(
        body.contextThresholdTokens ?? body.context_threshold_tokens,
        -1
    ));

    return {
        id: normalizeNumber(body.id, null),
        providerName,
        contextThresholdTokens,
        multiplierIn: normalizeNumber(body.multiplierIn ?? body.multiplier_in, 1),
        multiplierOut: normalizeNumber(body.multiplierOut ?? body.multiplier_out, 1),
        multiplierCacheRead: normalizeNumber(body.multiplierCacheRead ?? body.multiplier_cache_read, 1),
        multiplierCacheWrite: normalizeNumber(body.multiplierCacheWrite ?? body.multiplier_cache_write, 1),
        isActive: normalizeBooleanFlag(body.isActive ?? body.is_active, true)
    };
}

function validateMultiplierPayload(payload, requireProvider = true) {
    if (requireProvider && !payload.providerName) return 'Invalid providerName';
    if (!Number.isFinite(payload.contextThresholdTokens) || payload.contextThresholdTokens < 0) {
        return 'contextThresholdTokens must be a non-negative number';
    }
    for (const field of ['multiplierIn', 'multiplierOut', 'multiplierCacheRead', 'multiplierCacheWrite']) {
        if (!Number.isFinite(payload[field]) || payload[field] < 0) {
            return `${field} must be a non-negative number`;
        }
    }
    return null;
}

function mapMultiplierRow(row) {
    return {
        id: row.ID,
        providerName: row.PROVIDER_NAME,
        contextThresholdTokens: row.CONTEXT_THRESHOLD_TOKENS,
        multiplierIn: row.MULTIPLIER_IN,
        multiplierOut: row.MULTIPLIER_OUT,
        multiplierCacheRead: row.MULTIPLIER_CACHE_READ,
        multiplierCacheWrite: row.MULTIPLIER_CACHE_WRITE,
        isActive: row.IS_ACTIVE === 1,
        createdAt: row.CREATED_AT,
        updatedAt: row.UPDATED_AT,
        createdBy: row.CREATED_BY,
        updatedBy: row.UPDATED_BY
    };
}

async function listDbProviders() {
    const providers = new Set();

    const queries = [
        `SELECT DISTINCT LOWER(provider_name) AS provider_name FROM provider_keys WHERE provider_name IS NOT NULL`,
        `SELECT DISTINCT LOWER(provider_name) AS provider_name FROM canonical_model_provider_routes WHERE provider_name IS NOT NULL`,
        `SELECT DISTINCT LOWER(provider_name) AS provider_name FROM model_provider_mappings WHERE provider_name IS NOT NULL`,
        `SELECT DISTINCT LOWER(provider_name) AS provider_name FROM provider_context_multipliers WHERE provider_name IS NOT NULL`
    ];

    for (const sql of queries) {
        try {
            const result = await executeQuery(sql);
            for (const row of result.rows || []) {
                const providerName = normalizeProviderName(row.PROVIDER_NAME || row.provider_name) || String(row.PROVIDER_NAME || '').trim().toLowerCase();
                if (providerName) providers.add(providerName);
            }
        } catch (error) {
            if (!isMissingTableError(error)) throw error;
        }
    }

    return Array.from(providers);
}

async function getProviders() {
    const knownProviders = getSupportedProviderNames();
    const dbProviders = await listDbProviders();
    const merged = [];
    const seen = new Set();

    for (const provider of [...knownProviders, ...dbProviders]) {
        const normalized = normalizeProviderName(provider) || String(provider || '').trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        merged.push(normalized);
    }

    return merged;
}

async function listMultipliers(req, res) {
    const providers = await getProviders();
    let rows = [];

    try {
        const result = await executeQuery(`
            SELECT
                id,
                LOWER(provider_name) AS provider_name,
                context_threshold_tokens,
                multiplier_in,
                multiplier_out,
                multiplier_cache_read,
                multiplier_cache_write,
                is_active,
                created_at,
                updated_at,
                created_by,
                updated_by
            FROM provider_context_multipliers
            ORDER BY LOWER(provider_name) ASC, context_threshold_tokens ASC, id ASC
        `);
        rows = (result.rows || []).map(mapMultiplierRow);
    } catch (error) {
        if (!isMissingTableError(error)) throw error;
    }

    return res.status(200).json({ providers, multipliers: rows });
}

async function upsertMultiplier(req, res, session) {
    const payload = normalizeMultiplierPayload(req.body || {});
    const validationError = validateMultiplierPayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const actor = session.githubUsername || 'admin';

    if (payload.id) {
        await executeQuery(`
            UPDATE provider_context_multipliers SET
                provider_name = :providerName,
                context_threshold_tokens = :contextThresholdTokens,
                multiplier_in = :multiplierIn,
                multiplier_out = :multiplierOut,
                multiplier_cache_read = :multiplierCacheRead,
                multiplier_cache_write = :multiplierCacheWrite,
                is_active = :isActive,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = :updatedBy
            WHERE id = :id
        `, {
            id: payload.id,
            providerName: payload.providerName,
            contextThresholdTokens: payload.contextThresholdTokens,
            multiplierIn: payload.multiplierIn,
            multiplierOut: payload.multiplierOut,
            multiplierCacheRead: payload.multiplierCacheRead,
            multiplierCacheWrite: payload.multiplierCacheWrite,
            isActive: payload.isActive ? 1 : 0,
            updatedBy: actor
        });

        return res.status(200).json({ success: true, id: payload.id });
    }

    const result = await executeQuery(`
        MERGE INTO provider_context_multipliers pcm
        USING (
            SELECT :providerName AS provider_name,
                   :contextThresholdTokens AS context_threshold_tokens
            FROM dual
        ) src
        ON (
            pcm.provider_name = src.provider_name
            AND pcm.context_threshold_tokens = src.context_threshold_tokens
        )
        WHEN MATCHED THEN UPDATE SET
            multiplier_in = :multiplierIn,
            multiplier_out = :multiplierOut,
            multiplier_cache_read = :multiplierCacheRead,
            multiplier_cache_write = :multiplierCacheWrite,
            is_active = :isActive,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = :updatedBy
        WHEN NOT MATCHED THEN INSERT (
            provider_name,
            context_threshold_tokens,
            multiplier_in,
            multiplier_out,
            multiplier_cache_read,
            multiplier_cache_write,
            is_active,
            created_by,
            updated_by
        ) VALUES (
            :providerName,
            :contextThresholdTokens,
            :multiplierIn,
            :multiplierOut,
            :multiplierCacheRead,
            :multiplierCacheWrite,
            :isActive,
            :createdBy,
            :updatedBy
        )
    `, {
        providerName: payload.providerName,
        contextThresholdTokens: payload.contextThresholdTokens,
        multiplierIn: payload.multiplierIn,
        multiplierOut: payload.multiplierOut,
        multiplierCacheRead: payload.multiplierCacheRead,
        multiplierCacheWrite: payload.multiplierCacheWrite,
        isActive: payload.isActive ? 1 : 0,
        createdBy: actor,
        updatedBy: actor
    });

    return res.status(200).json({ success: true, rowsAffected: result.rowsAffected || 0 });
}

async function deleteMultiplier(req, res, session) {
    const id = normalizeNumber(req.query.id || (req.body || {}).id, null);
    if (!id) return res.status(400).json({ error: 'id required' });

    await executeQuery(`
        UPDATE provider_context_multipliers
        SET is_active = 0,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = :updatedBy
        WHERE id = :id
    `, { id, updatedBy: session.githubUsername || 'admin' });

    return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        if (req.method === 'GET') {
            const action = String(req.query.action || '').toLowerCase();
            if (action === 'multipliers') return await listMultipliers(req, res);

            const providers = await getProviders();
            return res.status(200).json({ providers });
        }

        if (req.method === 'POST' || req.method === 'PUT') {
            return await upsertMultiplier(req, res, session);
        }

        if (req.method === 'DELETE') {
            return await deleteMultiplier(req, res, session);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({ error: 'provider_context_multipliers table not found. Run migration 012_provider_context_multipliers.sql first.' });
        }
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'A multiplier already exists for this provider and threshold.' });
        }
        console.error('[admin/providers] error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
