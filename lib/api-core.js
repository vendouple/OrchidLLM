/**
 * lib/api-core.js — Core API Utilities
 *
 * Model access checks, logging, and normalization.
 */
import { executeQuery } from './oracle.js';
import { createHash } from 'crypto';

const ACCESS_TIER_ORDER = ['demo', 'free', 'standard', 'premium', 'premium+', 'max', 'elite', 'admin'];

function tierLevel(tier) {
    const idx = ACCESS_TIER_ORDER.indexOf(tier);
    return idx >= 0 ? idx : 0;
}

/**
 * Get model record by slug.
 */
export async function getModelRecord(slug) {
    const r = await executeQuery(`
        SELECT m.*, mm.name AS maker_name, mm.slug AS maker_slug
        FROM models m LEFT JOIN model_makers mm ON mm.id = m.model_maker_id
        WHERE m.model_slug = :slug AND m.is_active = 1
    `, { slug });
    return r.rows[0] || null;
}

/**
 * Check if user's plan allows access to this model.
 */
export function checkModelAccess(auth, modelRow) {
    if (!modelRow) return { allowed: false, status: 404, code: 'model_not_found', message: 'Model not found.' };
    const userTier = tierLevel(auth.modelAccessTier || 'free');
    const modelTier = tierLevel(modelRow.ACCESS_TIER || 'free');
    if (userTier < modelTier) {
        return { allowed: false, status: 403, code: 'model_not_allowed',
            message: `This model requires ${modelRow.ACCESS_TIER} tier access. Upgrade your plan.` };
    }
    // Check API key whitelist
    if (auth.apiKey?.modelWhitelist && !auth.apiKey.modelWhitelist.includes(modelRow.MODEL_SLUG)) {
        return { allowed: false, status: 403, code: 'key_model_restricted',
            message: 'This API key does not have access to this model.' };
    }
    return { allowed: true };
}

/**
 * Check context window access for the user's plan.
 */
export function checkContextAccess(auth, modelRow, inputTokens) {
    if (!modelRow || !inputTokens) return { allowed: true };
    let contextTiers;
    try { contextTiers = JSON.parse(modelRow.CONTEXT_WINDOW_TIERS || '[]'); } catch { contextTiers = []; }
    if (!contextTiers.length) return { allowed: true };

    // Find which tier this token count falls into
    for (const tier of contextTiers) {
        if (inputTokens >= (tier.tokens || 0)) {
            const requiredPlan = tier.required_plan || 'free';
            const userTier = tierLevel(auth.modelAccessTier || 'free');
            const requiredLevel = tierLevel(requiredPlan);
            if (userTier < requiredLevel) {
                return { allowed: false, status: 403, code: 'context_limit_exceeded',
                    message: `Context limit exceeded. ${inputTokens} tokens requires ${requiredPlan} plan. Upgrade to unlock.` };
            }
        }
    }
    return { allowed: true };
}

function parseJsonField(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function normalizeModelForApi(m) {
    return {
        id: m.MODEL_SLUG,
        object: 'model',
        created: 0,
        owned_by: m.MAKER_SLUG || 'orchidllm',
        display_name: m.DISPLAY_NAME,
        access_tier: m.ACCESS_TIER,
        modality: m.MODALITY,
        maker: { name: m.MAKER_NAME, slug: m.MAKER_SLUG, icon: m.MAKER_ICON || null },
        capabilities: {
            streaming: !!m.SUPPORTS_STREAMING,
            vision: !!m.SUPPORTS_VISION,
            reasoning: !!m.SUPPORTS_REASONING,
            search: !!m.SUPPORTS_SEARCH,
            caching: !!m.SUPPORTS_CACHING,
            function_calling: !!m.SUPPORTS_FUNCTION_CALLING,
        },
        context_window_tiers: parseJsonField(m.CONTEXT_WINDOW_TIERS, []),
        max_output_tokens: m.MAX_OUTPUT_TOKENS,
        description: m.PUBLIC_DESCRIPTION,
        deprecated: m.DEPRECATION_DATE ? new Date(m.DEPRECATION_DATE) < new Date() : false,
    };
}

/**
 * List models accessible to the given auth context.
 */
export async function listAccessibleModels(auth) {
    const userTier = tierLevel(auth.modelAccessTier || 'free');
    const r = await executeQuery(`
        SELECT m.id, m.display_name, m.model_slug, m.access_tier, m.modality,
            m.context_window_tiers, m.supports_streaming, m.supports_vision, m.supports_reasoning,
            m.supports_search, m.supports_caching, m.supports_function_calling,
            m.max_output_tokens, m.public_description, m.deprecation_date,
            mm.name AS maker_name, mm.slug AS maker_slug, mm.icon_url AS maker_icon
        FROM models m
        LEFT JOIN model_makers mm ON mm.id = m.model_maker_id
        WHERE m.is_active = 1
        ORDER BY mm.sort_order ASC, m.display_name ASC
    `);

    return r.rows
        .filter(m => tierLevel(m.ACCESS_TIER || 'free') <= userTier)
        .map(normalizeModelForApi);
}

/**
 * Get one model if accessible to the given auth context.
 */
export async function getAccessibleModel(modelSlug, auth) {
    const modelRow = await getModelRecord(modelSlug);
    const access = checkModelAccess(auth, modelRow);
    if (!access.allowed) return { access, model: null };
    return { access, model: normalizeModelForApi(modelRow) };
}

/**
 * Enforce demo key daily request limit and UTC-day reset.
 */
export async function checkDemoKeyLimit(demoKeyId) {
    if (!demoKeyId) return { allowed: false, limit: 0, used: 0 };
    const limit = Number(process.env.DEMO_REQUESTS_PER_DAY || 20);

    await executeQuery(`
        UPDATE demo_keys
        SET requests_today = 0,
            last_request_day = TRUNC(SYS_EXTRACT_UTC(SYSTIMESTAMP))
        WHERE id = :id
          AND (last_request_day IS NULL OR last_request_day < TRUNC(SYS_EXTRACT_UTC(SYSTIMESTAMP)))
    `, { id: demoKeyId }).catch(() => {});

    const r = await executeQuery('SELECT requests_today FROM demo_keys WHERE id = :id', { id: demoKeyId });
    const used = r.rows[0]?.REQUESTS_TODAY || 0;
    return { allowed: used < limit, limit, used };
}

/**
 * Touch demo key usage counters.
 */
export async function touchDemoKey(demoKeyId) {
    if (!demoKeyId) return;
    await executeQuery(`
        UPDATE demo_keys SET requests_today = requests_today + 1, total_requests = total_requests + 1,
            last_request_day = TRUNC(SYS_EXTRACT_UTC(SYSTIMESTAMP)),
            last_used_at = CURRENT_TIMESTAMP
        WHERE id = :id
    `, { id: demoKeyId }).catch(() => {});
}

/**
 * Touch API key usage counters.
 */
export async function touchApiKeyUsage(keyId, creditsUsed) {
    await executeQuery(`
        UPDATE api_keys SET credit_used_today = credit_used_today + :credits,
            credit_used_total = credit_used_total + :credits,
            last_used_at = CURRENT_TIMESTAMP
        WHERE id = :id
    `, { id: keyId, credits: creditsUsed || 0 }).catch(() => {});
}

/**
 * Log a request to request_logs.
 */
export async function logRequest({ userId, apiKeyId, modelId, providerId, endpoint, status, creditsCharged }) {
    await executeQuery(`
        INSERT INTO request_logs (user_id, api_key_id, model_id, provider_id, endpoint, status, credits_charged)
        VALUES (:userId, :apiKeyId, :modelId, :providerId, :endpoint, :status, :credits)
    `, {
        userId: userId || null, apiKeyId: apiKeyId || null,
        modelId: modelId || null, providerId: providerId || null,
        endpoint: endpoint || '/chat/completions',
        status: status || 'success', credits: creditsCharged || 0,
    }).catch(e => console.error('[logRequest]', e.message));
}

/**
 * Log routing detail to routing_logs.
 */
export async function logRouting({ requestId, userId, keyRefHash, providersAttempted, paramsStripped, finalProviderId, routingReason, queueWaitMs, ttftMs }) {
    await executeQuery(`
        INSERT INTO routing_logs (request_id, user_id, key_ref_hash, providers_attempted, params_stripped, final_provider_id, routing_reason, queue_wait_ms, ttft_ms)
        VALUES (:reqId, :userId, :keyHash, :providers, :paramsStripped, :finalId, :reason, :queueWait, :ttft)
    `, {
        reqId: requestId, userId: userId || null,
        keyHash: keyRefHash || null,
        providers: JSON.stringify(providersAttempted || []),
        paramsStripped: JSON.stringify(paramsStripped || []),
        finalId: finalProviderId || null,
        reason: routingReason || null,
        queueWait: queueWaitMs || 0,
        ttft: ttftMs || null,
    }).catch(e => console.error('[logRouting]', e.message));
}

/**
 * Generate obfuscated key reference hash for routing logs.
 */
export function makeKeyRefHash(auth) {
    if (!auth) return null;
    const raw = auth.apiKey?.id ? `apikey:${auth.apiKey.id}` : auth.demoKey?.demoKeyId ? `demo:${auth.demoKey.demoKeyId}` : `session:${auth.userId}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
