/**
 * Backward-compatible provider registry wrapper.
 *
 * Provider modules now live in /providers/<provider-id>/ and are managed by
 * the aggregator in /providers/aggregator.js.
 *
 * Admin provider names are derived from .env.example when available, with a
 * conservative fallback list matching the same file so dropdowns do not drift
 * into stale hardcoded providers.
 */

import fs from 'fs';
import path from 'path';
import {
    PROVIDER_ENDPOINTS,
    normalizeProviderName as normalizeRegisteredProviderName,
    listProviderIds,
    listProviderDefinitions,
    getProviderDefinition,
    supportsProviderEndpoint,
    getProviderOrder,
    getProviderMaxConcurrency,
    isProviderEnabled,
    resolveExplicitProviderFromModel,
    buildProviderCandidates,
    getProviderRouteModel,
    executeProviderEndpoint,
    fetchProviderModels
} from '../providers/aggregator.js';

const ENV_EXAMPLE_FALLBACK_PROVIDER_NAMES = [
    'pollinations',
    'nvidia',
    'mistral',
    'cerebras',
    'voidai',
    'navy',
    'groq',
    'google_ai_studio',
    'cohere',
    'openrouter',
    'electronhub',
    'mnn_ai',
    'nagaai',
    'ohmygpt',
    'llm_gateway',
    'llm7',
    'zanity_ai',
    'apertis',
    'a4f',
    'pydantic_ai_gateway',
    'requesty',
    'xeven_worker',
    'studiolm',
    'hubs02225',
    'seraphyn',
    'friendli',
    'infip',
    'routeway',
    'scitely',
    'awanllm',
    'subnp',
    'vercel_ai_gateway',
    'opencode_zen',
    'github_models',
    'zai',
    'meganova',
    'ibm_watsonx',
    'ai_horde',
    'mistral_codestral',
    'evolvex',
    'cloudflare',
    'ollama',
    'paxsenix',
    'lite_router',
    'aquadevs',
    'aihubmix'
];

const PROVIDER_NAME_ALIASES = {
    pollination: 'pollinations',
    google: 'google_ai_studio',
    google_ai: 'google_ai_studio',
    googleaistudio: 'google_ai_studio',
    google_ai_studio: 'google_ai_studio',
    ai_studio: 'google_ai_studio',
    mnn: 'mnn_ai',
    mnnai: 'mnn_ai',
    zanity: 'zanity_ai',
    pydantic_gateway: 'pydantic_ai_gateway',
    pydantic_ai: 'pydantic_ai_gateway',
    xeven: 'xeven_worker',
    vercel: 'vercel_ai_gateway',
    vercel_ai: 'vercel_ai_gateway',
    opencode: 'opencode_zen',
    github: 'github_models',
    github_model: 'github_models',
    watsonx: 'ibm_watsonx',
    ibm: 'ibm_watsonx',
    horde: 'ai_horde',
    mistral_code: 'mistral_codestral',
    codestral: 'mistral_codestral',
    lite: 'lite_router',
    literouter: 'lite_router',
    lite_router: 'lite_router',
    ai_hub_mix: 'aihubmix',
    aihubmix: 'aihubmix',
    navyai: 'navy'
};

let cachedSupportedProviderNames = null;

function normalizeProviderIdCandidate(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function providerNameFromApiKeyEnv(envKeyName) {
    const key = String(envKeyName || '').trim().toUpperCase();
    if (!key.endsWith('_API_KEY')) return null;
    if (key.startsWith('GITHUB_') || key.startsWith('ORACLE_')) return null;

    return normalizeProviderIdCandidate(key.slice(0, -'_API_KEY'.length));
}

function providerNameFromProviderAttributeEnv(envKeyName) {
    const match = String(envKeyName || '').trim().toUpperCase().match(/^PROVIDER_(.+?)_(?:SPEED_TIER|ENABLE_FREE_TIER|MAX_CONCURRENCY)$/);
    if (!match) return null;
    return normalizeProviderIdCandidate(match[1]);
}

function readEnvExampleProviderNames() {
    try {
        const envPath = path.join(process.cwd(), '.env.example');
        const contents = fs.readFileSync(envPath, 'utf8');
        const providerNames = [];

        for (const rawLine of contents.split(/\r?\n/)) {
            const line = rawLine.trim().replace(/^#\s*/, '');
            const key = line.split('=')[0]?.trim();
            if (!key) continue;

            const providerName = providerNameFromApiKeyEnv(key) || providerNameFromProviderAttributeEnv(key);
            if (providerName) providerNames.push(providerName);
        }

        return providerNames;
    } catch (error) {
        return [];
    }
}

function uniqueProviderNames(names) {
    const seen = new Set();
    const result = [];

    for (const rawName of names) {
        const normalized = normalizeProviderIdCandidate(rawName);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}

/**
 * Get the list of supported provider names.
 * @returns {string[]}
 */
export function getSupportedProviderNames() {
    if (!cachedSupportedProviderNames) {
        cachedSupportedProviderNames = uniqueProviderNames([
            ...readEnvExampleProviderNames(),
            ...ENV_EXAMPLE_FALLBACK_PROVIDER_NAMES,
            ...listProviderIds()
        ]);
    }

    return [...cachedSupportedProviderNames];
}

export function normalizeProviderName(name) {
    const registered = normalizeRegisteredProviderName(name);
    if (registered) return registered;

    const normalized = normalizeProviderIdCandidate(name);
    if (!normalized) return null;

    const aliased = PROVIDER_NAME_ALIASES[normalized] || normalized;
    return getSupportedProviderNames().includes(aliased) ? aliased : null;
}

export {
    PROVIDER_ENDPOINTS,
    listProviderIds,
    listProviderDefinitions,
    getProviderDefinition,
    supportsProviderEndpoint,
    getProviderOrder,
    getProviderMaxConcurrency,
    isProviderEnabled,
    resolveExplicitProviderFromModel,
    buildProviderCandidates,
    getProviderRouteModel,
    executeProviderEndpoint,
    fetchProviderModels
};

export default {
    PROVIDER_ENDPOINTS,
    normalizeProviderName,
    listProviderIds,
    listProviderDefinitions,
    getProviderDefinition,
    supportsProviderEndpoint,
    getProviderOrder,
    getProviderMaxConcurrency,
    isProviderEnabled,
    resolveExplicitProviderFromModel,
    buildProviderCandidates,
    getProviderRouteModel,
    executeProviderEndpoint,
    fetchProviderModels,
    getSupportedProviderNames
};
