/**
 * Backward-compatible provider registry wrapper.
 *
 * Provider modules now live in /providers/<provider-id>/ and are managed by
 * the aggregator in /providers/aggregator.js.
 *
 * Updated to include getSupportedProviderNames for admin dropdown.
 * Provider list is derived from .env.example – the single source of truth.
 */

import {
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
    fetchProviderModels
} from '../providers/aggregator.js';

/**
 * Canonical list of supported provider names for admin dropdowns.
 * This is the single source of truth for valid provider_name values.
 * Derived from the API keys defined in .env.example.
 */
const SUPPORTED_PROVIDER_NAMES = [
    // Active providers (have API keys in .env.example)
    'pollinations',
    'nvidia',
    'mistral',
    'cerebras',
    'voidai',
    'navy',
    // Free / local providers (no API key needed)
    'cloudflare',
    'ollama',
    // Future providers (API keys in .env.example, empty by default)
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
    // Providers mentioned in provider attributes section
    'paxsenix',
    'lite_router',
    'aquadevs',
    'aihubmix'
];

/**
 * Get the list of supported provider names.
 * @returns {string[]}
 */
export function getSupportedProviderNames() {
    return [...SUPPORTED_PROVIDER_NAMES];
}

export {
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
