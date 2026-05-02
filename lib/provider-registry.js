/**
 * Backward-compatible provider registry wrapper.
 *
 * Provider modules now live in /providers/<provider-id>/ and are managed by
 * the aggregator in /providers/aggregator.js.
 *
 * Updated to include getSupportedProviderNames for admin dropdown.
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
 */
const SUPPORTED_PROVIDER_NAMES = [
    'pollinations',
    'nvidia',
    'cerebras',
    'mistral',
    'navy',
    'voidai',
    'cloudflare',
    'ollama',
    'openai',
    'anthropic',
    'azure',
    'groq',
    'openrouter',
    'google',
    'cohere',
    'xai',
    'deepseek',
    'together',
    'fireworks',
    'perplexity',
    'ai21',
    'elevenlabs',
    'stability'
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
