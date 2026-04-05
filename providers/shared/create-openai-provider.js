import {
    executeOpenAiProviderEndpoint,
    listOpenAiProviderModels
} from './openai-compatible.js';

function normalizeAliases(id, aliases = []) {
    const aliasSet = new Set([
        id,
        ...aliases
    ].map(alias => String(alias || '').trim().toLowerCase()).filter(Boolean));

    return Array.from(aliasSet);
}

export function createOpenAiProvider({
    id,
    displayName,
    aliases = [],
    baseUrl,
    resolveBaseUrl,
    envKeyCandidates = [],
    usageCounterType = 'tokens',
    endpoints = {},
    additionalAuthHeaders,
    speedTier = 3, // 1 = Ultra Fast, 2 = Fast, 3 = Standard, 4 = Slow, 5 = Ultra Slow
    enableFreeTier = false
}) {
    const normalizedAliases = normalizeAliases(id, aliases);

    function getDefinition() {
        const resolvedBaseUrl = typeof resolveBaseUrl === 'function'
            ? resolveBaseUrl()
            : baseUrl;

        const envSpeedTier = process.env[`PROVIDER_${id.toUpperCase()}_SPEED_TIER`];
        const actualSpeedTier = envSpeedTier ? Number(envSpeedTier) : speedTier;

        const envFreeTier = process.env[`PROVIDER_${id.toUpperCase()}_ENABLE_FREE_TIER`];
        const actualEnableFreeTier = envFreeTier !== undefined 
            ? String(envFreeTier).toLowerCase() === 'true' 
            : enableFreeTier;

        return {
            id,
            displayName,
            mode: 'openai-compatible',
            baseUrl: resolvedBaseUrl,
            modelPrefix: id,
            envKeyCandidates: [...envKeyCandidates],
            usageCounterType,
            speedTier: actualSpeedTier,
            enableFreeTier: actualEnableFreeTier,
            endpoints: {
                ...endpoints
            }
        };
    }

    return {
        id,
        aliases: normalizedAliases,
        getDefinition,
        supports(endpointKey) {
            const definition = getDefinition();
            return Boolean(definition.endpoints?.[endpointKey]);
        },
        execute({ endpointKey, upstreamModel, requestBody, credential, signal }) {
            const definition = getDefinition();
            return executeOpenAiProviderEndpoint({
                providerDefinition: definition,
                endpointKey,
                upstreamModel,
                requestBody,
                credential,
                signal,
                additionalAuthHeaders
            });
        },
        listModels({ credential, signal } = {}) {
            const definition = getDefinition();
            return listOpenAiProviderModels({
                providerDefinition: definition,
                credential,
                signal,
                additionalAuthHeaders
            });
        }
    };
}
