/**
 * lib/router.js — Provider Routing & Health Tracking
 *
 * Routing decision tree (§6):
 * 1. Filter model_providers by model_slug, status=active, context_limit
 * 2. Resolve provider speed from `<PROVIDER_ENV>_SPEED` env var, falling back to DB speed_priority
 * 3. Paid/fast traffic prefers higher speed; free/demo traffic prefers lower speed
 * 4. Pick first with available concurrency
 */
import { executeQuery } from './oracle.js';

const ACCESS_TIER_ORDER = ['demo', 'free', 'standard', 'premium', 'premium+', 'max', 'elite', 'admin'];

/**
 * Select the best provider for a model request.
 */
export async function selectProvider(modelSlug, inputTokens, opts = {}) {
    const r = await executeQuery(`
        SELECT mp.id, mp.model_id, mp.provider_id, mp.provider_model_id,
            mp.speed_priority, mp.context_limit, mp.supports_params, mp.max_concurrent,
            mp.status, mp.rate_limit_until,
            p.base_url, p.env_key_prefix, p.auth_key_env, p.auth_type,
            (SELECT COUNT(*) FROM request_queue rq
             WHERE rq.provider_id = mp.provider_id AND rq.status = 'in_flight') AS current_in_flight
        FROM model_providers mp
        JOIN providers p ON p.id = mp.provider_id
        JOIN models m ON m.id = mp.model_id
        WHERE m.model_slug = :slug
            AND mp.is_active = 1
            AND mp.status = 'active'
            AND p.status = 'active'
            AND (mp.rate_limit_until IS NULL OR mp.rate_limit_until < CURRENT_TIMESTAMP)
            AND (mp.context_limit IS NULL OR mp.context_limit >= :tokens)
            AND (mp.max_concurrent = -1 OR mp.max_concurrent IS NULL OR
                (SELECT COUNT(*) FROM request_queue rq
                 WHERE rq.provider_id = mp.provider_id AND rq.status = 'in_flight') < mp.max_concurrent)
        ORDER BY mp.id ASC
    `, { slug: modelSlug, tokens: inputTokens || 0 });

    if (!r.rows.length) return null;

    const requiredParams = Array.isArray(opts.requiredParams) ? opts.requiredParams : [];

    const speedDirection = opts.preferFastProviders === false ? 'asc' : 'desc';

    // Strict params filtering
    if (opts.strictParams && requiredParams.length) {
        const ranked = r.rows
            .filter(row => {
                const params = safeJson(row.SUPPORTS_PARAMS, {});
                return requiredParams.every(p => params[p] === true);
            })
            .sort((a, b) => compareProviderSpeed(a, b, speedDirection));
        return ranked.length ? formatProvider(ranked[0], []) : null;
    }

    if (!opts.strictParams && requiredParams.length) {
        const ranked = r.rows.map(row => {
            const params = safeJson(row.SUPPORTS_PARAMS, {});
            const dropped = requiredParams.filter(p => params[p] !== true);
            return { row, dropped, supportedCount: requiredParams.length - dropped.length };
        }).sort((a, b) => {
            if (b.supportedCount !== a.supportedCount) return b.supportedCount - a.supportedCount;
            return compareProviderSpeed(a.row, b.row, speedDirection);
        });
        return formatProvider(ranked[0].row, ranked[0].dropped);
    }

    const ranked = [...r.rows].sort((a, b) => compareProviderSpeed(a, b, speedDirection));
    return formatProvider(ranked[0], []);
}

function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function getProviderSpeed(row) {
    const envKey = row.AUTH_KEY_ENV || row.ENV_KEY_PREFIX;
    const envValue = envKey ? process.env[`${envKey}_SPEED`] : undefined;
    const parsedEnv = envValue === undefined || envValue === '' ? NaN : Number(envValue);
    if (Number.isFinite(parsedEnv)) return parsedEnv;

    const parsedDb = Number(row.SPEED_PRIORITY);
    return Number.isFinite(parsedDb) ? parsedDb : 0;
}

function compareProviderSpeed(a, b, direction = 'desc') {
    const speedDelta = getProviderSpeed(a) - getProviderSpeed(b);
    if (speedDelta !== 0) return direction === 'asc' ? speedDelta : -speedDelta;
    return (a.ID || 0) - (b.ID || 0);
}

function formatProvider(row, droppedParams = []) {
    return {
        id: row.ID,
        providerId: row.PROVIDER_ID,
        providerModelId: row.PROVIDER_MODEL_ID,
        baseUrl: row.BASE_URL,
        authKeyEnv: row.AUTH_KEY_ENV || row.ENV_KEY_PREFIX,
        authType: row.AUTH_TYPE || 'bearer',
        speedPriority: row.SPEED_PRIORITY,
        providerSpeed: getProviderSpeed(row),
        contextLimit: row.CONTEXT_LIMIT,
        maxConcurrent: row.MAX_CONCURRENT,
        currentInFlight: row.CURRENT_IN_FLIGHT || 0,
        droppedParams,
    };
}

/**
 * Get token multipliers for a model at a given token count.
 */
export async function getMultipliers(modelSlug, inputTokens) {
    const r = await executeQuery(`
        SELECT mtm.* FROM model_token_multipliers mtm
        JOIN models m ON m.id = mtm.model_id
        WHERE m.model_slug = :slug
            AND mtm.context_tier_min <= :tokens
            AND (mtm.context_tier_max IS NULL OR mtm.context_tier_max >= :tokens)
        ORDER BY mtm.context_tier_min DESC
        FETCH FIRST 1 ROWS ONLY
    `, { slug: modelSlug, tokens: inputTokens || 0 });

    if (!r.rows.length) return { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 };
    const m = r.rows[0];
    return {
        input: m.MULTIPLIER_INPUT || 1,
        output: m.MULTIPLIER_OUTPUT || 1,
        cacheRead: m.MULTIPLIER_CACHE_READ || 1,
        cacheWrite: m.MULTIPLIER_CACHE_WRITE || 1,
    };
}

/**
 * Calculate credit cost from usage and multipliers.
 */
export function calculateCost(usage, multipliers) {
    if (!usage) return 0;
    return Math.ceil(
        (usage.input || usage.prompt_tokens || 0) * (multipliers.input || 1) +
        (usage.output || usage.completion_tokens || 0) * (multipliers.output || 1) +
        (usage.cache_read || 0) * (multipliers.cacheRead || 1) +
        (usage.cache_write || 0) * (multipliers.cacheWrite || 1)
    );
}

/**
 * Handle provider failure — update status based on HTTP status code.
 */
export async function handleProviderFailure(modelProviderId, httpStatus) {
    if (httpStatus === 429) {
        const backoffMinutes = 2;
        await executeQuery(`
            UPDATE model_providers SET status = 'rate_limited',
                rate_limit_until = CURRENT_TIMESTAMP + INTERVAL '${backoffMinutes}' MINUTE
            WHERE id = :id
        `, { id: modelProviderId });
    } else if (httpStatus === 402) {
        await executeQuery("UPDATE model_providers SET status = 'out_of_credits' WHERE id = :id",
            { id: modelProviderId });
        // Create admin notification
        await executeQuery(`
            INSERT INTO admin_notifications (type, severity, title, message, entity_type, entity_id)
            VALUES ('provider', 'error', 'Provider out of credits',
                'Model provider ID ' || :id || ' returned 402. Check provider balance.',
                'model_provider', :idStr)
        `, { id: modelProviderId, idStr: String(modelProviderId) }).catch(() => {});
    } else if (httpStatus >= 500) {
        await executeQuery("UPDATE model_providers SET status = 'dead' WHERE id = :id",
            { id: modelProviderId });
    }
}
