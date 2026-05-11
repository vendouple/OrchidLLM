/**
 * lib/providers.js — Upstream Provider HTTP Facade
 *
 * All outbound requests go through this module.
 * Provider headers stripped, responses normalized.
 */

/**
 * Resolve the API key from .env using the env key prefix.
 * Supports multi-key rotation: OPENAI_KEY_1, OPENAI_KEY_2, etc.
 */
function resolveProviderKey(envKeyPrefix) {
    if (!envKeyPrefix) return null;

    // Try exact match first
    if (process.env[envKeyPrefix]) return process.env[envKeyPrefix];

    // Try numbered keys (round-robin via random selection for now)
    const keys = [];
    for (let i = 1; i <= 20; i++) {
        const k = process.env[`${envKeyPrefix}_${i}`];
        if (k) keys.push(k);
        const k2 = process.env[`${envKeyPrefix}_KEY_${i}`];
        if (k2) keys.push(k2);
    }
    // Also check PROVIDER_API_KEY pattern
    const apiKey = process.env[`${envKeyPrefix}_API_KEY`];
    if (apiKey) keys.push(apiKey);

    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
}

/**
 * Forward a chat completion request to an upstream provider.
 * @returns {Response} raw fetch Response object
 */
export async function forwardChatCompletion({ baseUrl, authKeyEnv, providerModelId, requestBody }) {
    const apiKey = resolveProviderKey(authKeyEnv);
    if (!apiKey) throw new Error(`No API key found for provider env prefix: ${authKeyEnv}`);

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = { ...requestBody, model: providerModelId };

    // Strip internal fields
    delete body._requiredParams;
    delete body._orchidMeta;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    const timeout = Number(process.env.PROVIDER_TIMEOUT_MS || 60000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        return resp;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Extract usage stats from a provider response.
 */
export function extractUsage(data) {
    if (!data?.usage) return { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    return {
        input: data.usage.prompt_tokens || 0,
        output: data.usage.completion_tokens || 0,
        cache_read: data.usage.cache_read_tokens || data.usage.prompt_tokens_details?.cached_tokens || 0,
        cache_write: data.usage.cache_creation_input_tokens || 0,
    };
}
