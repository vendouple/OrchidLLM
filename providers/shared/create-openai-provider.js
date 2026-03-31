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
    additionalAuthHeaders
}) {
    const normalizedAliases = normalizeAliases(id, aliases);

    function getDefinition() {
        const resolvedBaseUrl = typeof resolveBaseUrl === 'function'
            ? resolveBaseUrl()
            : baseUrl;

        return {
            id,
            displayName,
            mode: 'openai-compatible',
            baseUrl: resolvedBaseUrl,
            modelPrefix: id,
            envKeyCandidates: [...envKeyCandidates],
            usageCounterType,
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
