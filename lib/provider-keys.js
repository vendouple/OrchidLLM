/**
 * Provider-key resolution and usage accounting.
 *
 * Supports:
 * - Environment fallback key per provider
 * - Multiple provider keys from DB (provider_keys table)
 * - Per-key counters and limit-aware key selection
 */

import { executeQuery, isDbConfigured } from './oracle.js';
import { getProviderDefinition } from './provider-registry.js';

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function parseNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function resolveProviderEnvKey(providerDefinition) {
    if (!providerDefinition?.envKeyCandidates) {
        return null;
    }

    for (const envName of providerDefinition.envKeyCandidates) {
        const value = process.env[envName];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

async function resetExpiredProviderKeyCountersIfNeeded(rows) {
    const now = Date.now();

    for (const row of rows) {
        if (!row.RESETS_AT) continue;

        const resetAtMs = new Date(row.RESETS_AT).getTime();
        if (!Number.isFinite(resetAtMs) || resetAtMs > now) continue;

        try {
            await executeQuery(
                `UPDATE provider_keys
                 SET requests_today = 0,
                     tokens_today = 0,
                     units_today = 0,
                     resets_at = CASE
                         WHEN NVL(reset_interval, 'daily') = 'daily' THEN TRUNC(SYSDATE) + 1
                         ELSE resets_at
                     END
                 WHERE id = :id`,
                { id: row.ID }
            );

            row.REQUESTS_TODAY = 0;
            row.TOKENS_TODAY = 0;
            row.UNITS_TODAY = 0;
        } catch (error) {
            console.error('[provider-keys] failed to reset counters:', error.message);
        }
    }
}

async function hasMinuteCapacity(row) {
    const minuteLimit = parseNumber(row.MINUTE_LIMIT, -1);
    if (minuteLimit === -1) return true;

    try {
        const result = await executeQuery(
            `SELECT COUNT(*) AS count
             FROM provider_usage_logs
             WHERE provider_key_id = :providerKeyId
               AND created_at >= SYSTIMESTAMP - NUMTODSINTERVAL(1, 'MINUTE')`,
            { providerKeyId: row.ID }
        );

        const count = parseNumber(result.rows[0]?.COUNT, 0);
        return count < minuteLimit;
    } catch (error) {
        if (isMissingTableError(error)) {
            // If provider_usage_logs does not exist yet, fail open.
            return true;
        }
        console.error('[provider-keys] minute-limit check failed:', error.message);
        return true;
    }
}

function hasDailyCapacity(row) {
    const dailyLimit = parseNumber(row.DAILY_LIMIT, -1);
    const tokensDailyLimit = parseNumber(row.TOKENS_DAILY_LIMIT, -1);
    const unitsDailyLimit = parseNumber(row.UNITS_DAILY_LIMIT, -1);

    if (dailyLimit !== -1 && parseNumber(row.REQUESTS_TODAY, 0) >= dailyLimit) {
        return false;
    }

    if (tokensDailyLimit !== -1 && parseNumber(row.TOKENS_TODAY, 0) >= tokensDailyLimit) {
        return false;
    }

    if (unitsDailyLimit !== -1 && parseNumber(row.UNITS_TODAY, 0) >= unitsDailyLimit) {
        return false;
    }

    return true;
}

function mapDbRowToCredential(providerId, row) {
    return {
        providerId,
        keyId: row.ID,
        keyName: row.KEY_NAME || `${providerId}-key-${row.ID}`,
        apiKey: row.API_KEY,
        source: 'db',
        usageCounterType: row.USAGE_COUNTER_TYPE || null,
        limits: {
            dailyLimit: parseNumber(row.DAILY_LIMIT, -1),
            minuteLimit: parseNumber(row.MINUTE_LIMIT, -1),
            tokensDailyLimit: parseNumber(row.TOKENS_DAILY_LIMIT, -1),
            unitsDailyLimit: parseNumber(row.UNITS_DAILY_LIMIT, -1),
            requestsToday: parseNumber(row.REQUESTS_TODAY, 0),
            tokensToday: parseNumber(row.TOKENS_TODAY, 0),
            unitsToday: parseNumber(row.UNITS_TODAY, 0),
            resetsAt: row.RESETS_AT || null
        }
    };
}

async function resolveDbProviderCredential(providerDefinition) {
    const rowsResult = await executeQuery(
        `SELECT
            id, provider_name, key_name, api_key, is_active, priority,
            daily_limit, minute_limit, tokens_daily_limit, units_daily_limit,
            usage_counter_type, requests_today, tokens_today, units_today,
            reset_interval, resets_at, last_used
         FROM provider_keys
         WHERE provider_name = :providerName
           AND is_active = 1
         ORDER BY priority DESC,
                  NVL(last_used, TO_TIMESTAMP('1970-01-01', 'YYYY-MM-DD')) ASC,
                  id ASC`,
        { providerName: providerDefinition.id }
    );

    const rows = rowsResult.rows || [];
    if (rows.length === 0) return null;

    await resetExpiredProviderKeyCountersIfNeeded(rows);

    for (const row of rows) {
        if (!hasDailyCapacity(row)) continue;
        if (!(await hasMinuteCapacity(row))) continue;
        return mapDbRowToCredential(providerDefinition.id, row);
    }

    return null;
}

export async function resolveProviderCredential(providerId, options = {}) {
    const providerDefinition = getProviderDefinition(providerId);
    if (!providerDefinition) return null;

    const byopKey = options.byopKey;
    if (byopKey && providerDefinition.id === 'pollinations') {
        return {
            providerId: providerDefinition.id,
            keyId: null,
            keyName: 'BYOP',
            apiKey: byopKey,
            source: 'byop',
            usageCounterType: 'none',
            limits: {
                dailyLimit: -1,
                minuteLimit: -1,
                tokensDailyLimit: -1,
                unitsDailyLimit: -1,
                requestsToday: 0,
                tokensToday: 0,
                unitsToday: 0,
                resetsAt: null
            }
        };
    }

    if (options.allowDb !== false && isDbConfigured()) {
        try {
            const dbCredential = await resolveDbProviderCredential(providerDefinition);
            if (dbCredential) return dbCredential;
        } catch (error) {
            if (!isMissingTableError(error)) {
                console.error('[provider-keys] DB credential lookup failed:', error.message);
            }
        }
    }

    const envKey = resolveProviderEnvKey(providerDefinition);
    if (!envKey) return null;

    return {
        providerId: providerDefinition.id,
        keyId: null,
        keyName: `${providerDefinition.id}-env`,
        apiKey: envKey,
        source: 'env',
        usageCounterType: providerDefinition.usageCounterType || 'tokens',
        limits: {
            dailyLimit: -1,
            minuteLimit: -1,
            tokensDailyLimit: -1,
            unitsDailyLimit: -1,
            requestsToday: 0,
            tokensToday: 0,
            unitsToday: 0,
            resetsAt: null
        }
    };
}

export async function recordProviderUsage({
    providerId,
    credential,
    endpoint,
    model,
    statusCode,
    usage,
    errorMessage = null,
    identifier = null,
    apiKeyId = null
}) {
    if (!providerId || !usage) return;

    const promptTokens = parseNumber(usage.promptTokens, 0);
    const completionTokens = parseNumber(usage.completionTokens, 0);
    const totalTokens = parseNumber(usage.totalTokens, promptTokens + completionTokens);
    const usageUnits = parseNumber(usage.providerUnits, totalTokens);
    const counterType = usage.counterType || credential?.usageCounterType || 'tokens';
    const rateLimitSnapshot = usage.rateLimitSnapshot
        ? JSON.stringify(usage.rateLimitSnapshot)
        : null;

    if (credential?.source === 'db' && credential.keyId) {
        try {
            await executeQuery(
                `UPDATE provider_keys
                 SET requests_today = NVL(requests_today, 0) + 1,
                     tokens_today = NVL(tokens_today, 0) + :totalTokens,
                     units_today = NVL(units_today, 0) + :usageUnits,
                     last_used = CURRENT_TIMESTAMP,
                     last_error = :lastError,
                     last_rate_limit_json = :rateLimit
                 WHERE id = :id`,
                {
                    id: credential.keyId,
                    totalTokens,
                    usageUnits,
                    lastError: errorMessage,
                    rateLimit: rateLimitSnapshot
                }
            );
        } catch (error) {
            if (!isMissingTableError(error)) {
                console.error('[provider-keys] failed to update provider_keys counters:', error.message);
            }
        }
    }

    try {
        await executeQuery(
            `INSERT INTO provider_usage_logs (
                provider_name,
                provider_key_id,
                key_name,
                endpoint,
                model,
                status_code,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                usage_units,
                usage_counter_type,
                rate_limit_snapshot,
                identifier,
                api_key_id,
                error_message
            ) VALUES (
                :providerName,
                :providerKeyId,
                :keyName,
                :endpoint,
                :model,
                :statusCode,
                :promptTokens,
                :completionTokens,
                :totalTokens,
                :usageUnits,
                :counterType,
                :rateLimitSnapshot,
                :identifier,
                :apiKeyId,
                :errorMessage
            )`,
            {
                providerName: providerId,
                providerKeyId: credential?.keyId || null,
                keyName: credential?.keyName || null,
                endpoint: endpoint || '/chat/completions',
                model: model || null,
                statusCode: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
                promptTokens,
                completionTokens,
                totalTokens,
                usageUnits,
                counterType,
                rateLimitSnapshot,
                identifier,
                apiKeyId,
                errorMessage
            }
        );
    } catch (error) {
        if (!isMissingTableError(error)) {
            console.error('[provider-keys] failed to insert provider_usage_logs:', error.message);
        }
    }
}

export default {
    resolveProviderCredential,
    recordProviderUsage
};
