/**
 * lib/keys.js — API Key Generation & Validation
 */
import { createHash, randomBytes } from 'crypto';
import { executeQuery } from './oracle.js';

/**
 * Generate a new API key with hash and preview.
 * @param {string} [userPrefix] — optional user-defined prefix (sanitized)
 */
export function generateApiKey(userPrefix) {
    const random = randomBytes(32).toString('hex');
    const prefix = userPrefix ? userPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) + '-' : '';
    const key = `sk-orch-${prefix}${random}`;
    const hash = createHash('sha256').update(key).digest('hex');
    const preview = key.slice(0, 12) + '...' + key.slice(-4);
    return { key, hash, preview };
}

/**
 * Hash a plaintext key for lookup.
 */
export function hashKey(key) {
    return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key and return key data with user/tier info.
 * @param {string} plainKey — the plaintext key
 * @returns {Promise<object|null>}
 */
function isBeforeUtcDay(value) {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return d.getTime() < todayUtc;
}

export async function validateApiKey(plainKey) {
    const hash = hashKey(plainKey);
    const r = await executeQuery(`
        SELECT ak.*, u.role, u.is_deleted, u.strict_params,
            us.tier_id, st.name AS tier_name, st.model_access_tier, st.rpm_normal,
            st.max_concurrent_requests, st.queue_priority_standard, st.queue_priority_fast,
            st.strict_params_option
        FROM api_keys ak
        JOIN users u ON u.id = ak.user_id
        LEFT JOIN user_subscriptions us ON us.user_id = u.id
        LEFT JOIN subscription_tiers st ON st.id = us.tier_id
        WHERE ak.key_hash = :hash
    `, { hash });

    if (!r.rows.length) return null;
    const row = r.rows[0];

    // Check key validity
    if (!row.IS_ACTIVE) return null;
    if (row.IS_DELETED) return null;
    if (row.EXPIRES_AT && new Date(row.EXPIRES_AT) < new Date()) return null;

    // Reset per-day usage counters on first use of a new UTC day.
    if ((row.CREDIT_LIMIT_RESET || 'daily') === 'daily' && isBeforeUtcDay(row.LAST_USED_AT)) {
        await executeQuery(`
            UPDATE api_keys
            SET credit_used_today = 0
            WHERE id = :id
        `, { id: row.ID }).catch(() => {});
        row.CREDIT_USED_TODAY = 0;
    }

    // Check daily limit. Null or negative means unlimited.
    if (row.CREDIT_LIMIT_DAILY != null && row.CREDIT_LIMIT_DAILY >= 0 && row.CREDIT_USED_TODAY >= row.CREDIT_LIMIT_DAILY) return null;

    // Check total limit. Null or negative means unlimited.
    if (row.CREDIT_LIMIT_TOTAL != null && row.CREDIT_LIMIT_TOTAL >= 0 && row.CREDIT_USED_TOTAL >= row.CREDIT_LIMIT_TOTAL) return null;

    return {
        id: row.ID,
        userId: row.USER_ID,
        label: row.LABEL,
        isActive: !!row.IS_ACTIVE,
        creditLimitTotal: row.CREDIT_LIMIT_TOTAL,
        creditLimitDaily: row.CREDIT_LIMIT_DAILY,
        creditUsedToday: row.CREDIT_USED_TODAY,
        creditUsedTotal: row.CREDIT_USED_TOTAL,
        modelWhitelist: row.MODEL_WHITELIST ? JSON.parse(row.MODEL_WHITELIST) : null,
        exposeBalance: !!row.EXPOSE_BALANCE,
        tierId: row.TIER_ID,
        tierName: row.TIER_NAME,
        modelAccessTier: row.MODEL_ACCESS_TIER || 'free',
        rpm: row.RPM_NORMAL || 3,
        maxConcurrent: row.MAX_CONCURRENT_REQUESTS || 1,
        strictParamsEnabled: !!row.STRICT_PARAMS && !!row.STRICT_PARAMS_OPTION,
        strictParamsOption: !!row.STRICT_PARAMS_OPTION,
        queuePriorityStandard: row.QUEUE_PRIORITY_STANDARD || 0,
        queuePriorityFast: row.QUEUE_PRIORITY_FAST || 0,
    };
}
