import pollinationsProvider from './pollinations/index.js';
import nvidiaProvider from './nvidia/index.js';
import cerebrasProvider from './cerebras/index.js';
import cloudflareProvider from './cloudflare/index.js';
import mistralProvider from './mistral/index.js';
import navyProvider from './navy/index.js';
import voidAiProvider from './voidai/index.js';
import ollamaProvider from './ollama/index.js';

export const PROVIDER_ENDPOINTS = {
    CHAT_COMPLETIONS: 'chat.completions',
    IMAGE_GENERATIONS: 'images.generations',
    MODELS_LIST: 'models.list'
};

const PROVIDER_MODULES = [
    pollinationsProvider,
    nvidiaProvider,
    cerebrasProvider,
    mistralProvider,
    navyProvider,
    voidAiProvider,
    cloudflareProvider,
    ollamaProvider
];

const PROVIDER_MODULE_BY_ID = new Map();
const PROVIDER_ALIAS_MAP = Object.create(null);

for (const providerModule of PROVIDER_MODULES) {
    PROVIDER_MODULE_BY_ID.set(providerModule.id, providerModule);

    for (const alias of providerModule.aliases || [providerModule.id]) {
        const normalizedAlias = String(alias || '').trim().toLowerCase();
        if (!normalizedAlias) continue;
        PROVIDER_ALIAS_MAP[normalizedAlias] = providerModule.id;
    }
}

const DEFAULT_PROVIDER_ORDER = [
    'pollinations',
    'nvidia',
    'cerebras',
    'mistral',
    'navy',
    'voidai',
    'cloudflare',
    'ollama'
].filter(providerId => PROVIDER_MODULE_BY_ID.has(providerId));

function getProviderModule(providerId) {
    const normalized = normalizeProviderName(providerId);
    if (!normalized) return null;
    return PROVIDER_MODULE_BY_ID.get(normalized) || null;
}

function cloneDefinition(definition) {
    if (!definition) return null;

    return {
        ...definition,
        envKeyCandidates: Array.isArray(definition.envKeyCandidates)
            ? [...definition.envKeyCandidates]
            : [],
        endpoints: {
            ...(definition.endpoints || {})
        }
    };
}

function isProviderAllowedByKey(providerId, allowedProviders) {
    if (!Array.isArray(allowedProviders) || allowedProviders.length === 0) {
        return true;
    }

    if (allowedProviders.includes('*')) {
        return true;
    }

    return allowedProviders.some(entry => normalizeProviderName(entry) === providerId);
}

function getBaseProviderOrder() {
    const allProviderIds = listProviderIds();
    return [
        ...DEFAULT_PROVIDER_ORDER,
        ...allProviderIds.filter(providerId => !DEFAULT_PROVIDER_ORDER.includes(providerId))
    ];
}

export function normalizeProviderName(name) {
    if (!name || typeof name !== 'string') return null;
    const normalized = name.trim().toLowerCase();
    return PROVIDER_ALIAS_MAP[normalized] || null;
}

export function listProviderIds() {
    return Array.from(PROVIDER_MODULE_BY_ID.keys());
}

export function listProviderDefinitions() {
    return listProviderIds()
        .map(providerId => getProviderDefinition(providerId))
        .filter(Boolean);
}

export function getProviderDefinition(providerId) {
    const providerModule = getProviderModule(providerId);
    if (!providerModule) return null;

    const definition = providerModule.getDefinition();
    return cloneDefinition(definition);
}

export function supportsProviderEndpoint(providerId, endpointKey) {
    const providerModule = getProviderModule(providerId);
    if (!providerModule || !endpointKey) return false;
    return Boolean(providerModule.supports(endpointKey));
}

export function getProviderOrder() {
    const fallbackOrder = getBaseProviderOrder();
    const rawOrder = process.env.PROVIDER_FALLBACK_ORDER;

    if (!rawOrder || !String(rawOrder).trim()) {
        return fallbackOrder;
    }

    const parsed = String(rawOrder)
        .split(',')
        .map(item => normalizeProviderName(item))
        .filter(Boolean);

    if (parsed.length === 0) {
        return fallbackOrder;
    }

    for (const providerId of fallbackOrder) {
        if (!parsed.includes(providerId)) {
            parsed.push(providerId);
        }
    }

    return parsed;
}

export function getProviderMaxConcurrency(providerId) {
    const normalized = normalizeProviderName(providerId);
    if (!normalized) return 1;

    const envName = `PROVIDER_${normalized.toUpperCase()}_MAX_CONCURRENCY`;
    const fromEnv = Number(process.env[envName]);

    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return Math.floor(fromEnv);
    }

    return 1;
}

export function isProviderEnabled(providerId, endpointKey = null) {
    const providerDefinition = getProviderDefinition(providerId);
    if (!providerDefinition) return false;

    const hasBaseUrl = Boolean(providerDefinition.baseUrl && String(providerDefinition.baseUrl).trim());
    if (!hasBaseUrl) {
        return false;
    }

    if (!endpointKey) {
        return true;
    }

    return supportsProviderEndpoint(providerDefinition.id, endpointKey);
}

export function resolveExplicitProviderFromModel(model) {
    if (!model || typeof model !== 'string') {
        return { providerId: null, upstreamModel: model };
    }

    const separatorIndex = model.indexOf('/');
    if (separatorIndex === -1) {
        return { providerId: null, upstreamModel: model };
    }

    const maybeProvider = model.slice(0, separatorIndex);
    const providerId = normalizeProviderName(maybeProvider);
    if (!providerId) {
        return { providerId: null, upstreamModel: model };
    }

    const upstreamModel = model.slice(separatorIndex + 1);
    return { providerId, upstreamModel };
}

export function buildProviderCandidates({
    model,
    requestedProvider,
    allowedProviders = [],
    endpointKey = null
}) {
    const candidates = [];
    const normalizedModel = typeof model === 'string' && model.trim()
        ? model.trim()
        : null;

    const explicitProviderFromBody = normalizeProviderName(requestedProvider);
    const explicitFromModel = normalizedModel
        ? resolveExplicitProviderFromModel(normalizedModel)
        : { providerId: null, upstreamModel: null };

    if (explicitProviderFromBody) {
        if (!isProviderAllowedByKey(explicitProviderFromBody, allowedProviders)) {
            return [];
        }

        if (endpointKey && !supportsProviderEndpoint(explicitProviderFromBody, endpointKey)) {
            return [];
        }

        candidates.push({
            providerId: explicitProviderFromBody,
            upstreamModel: explicitFromModel.providerId
                ? explicitFromModel.upstreamModel
                : normalizedModel,
            explicit: true
        });

        return candidates;
    }

    if (explicitFromModel.providerId) {
        if (!isProviderAllowedByKey(explicitFromModel.providerId, allowedProviders)) {
            return [];
        }

        if (endpointKey && !supportsProviderEndpoint(explicitFromModel.providerId, endpointKey)) {
            return [];
        }

        candidates.push({
            providerId: explicitFromModel.providerId,
            upstreamModel: explicitFromModel.upstreamModel,
            explicit: true
        });

        return candidates;
    }

    for (const providerId of getProviderOrder()) {
        if (!isProviderAllowedByKey(providerId, allowedProviders)) continue;
        if (endpointKey && !supportsProviderEndpoint(providerId, endpointKey)) continue;

        candidates.push({
            providerId,
            upstreamModel: normalizedModel,
            explicit: false
        });
    }

    return candidates;
}

export function getProviderRouteModel(providerId, upstreamModel) {
    const provider = getProviderDefinition(providerId);
    if (!provider) return upstreamModel;
    return `${provider.id}/${upstreamModel}`;
}

export async function executeProviderEndpoint({
    providerId,
    endpointKey,
    upstreamModel,
    requestBody,
    credential,
    signal
}) {
    const providerModule = getProviderModule(providerId);
    const providerDefinition = getProviderDefinition(providerId);

    if (!providerModule || !providerDefinition) {
        throw new Error(`Unknown provider: ${providerId}`);
    }

    if (!providerDefinition.baseUrl) {
        throw new Error(`Provider is missing base URL configuration: ${providerId}`);
    }

    if (!providerModule.supports(endpointKey)) {
        const error = new Error(`Provider does not support endpoint: ${endpointKey}`);
        error.status = 400;
        throw error;
    }

    const result = await providerModule.execute({
        endpointKey,
        upstreamModel,
        requestBody,
        credential,
        signal
    });

    return {
        ...result,
        providerDefinition
    };
}

export async function fetchProviderModels({
    providerId,
    credential,
    signal
}) {
    const providerModule = getProviderModule(providerId);
    const providerDefinition = getProviderDefinition(providerId);

    if (!providerModule || !providerDefinition) {
        return [];
    }

    if (!isProviderEnabled(providerId, PROVIDER_ENDPOINTS.MODELS_LIST)) {
        return [];
    }

    if (typeof providerModule.listModels !== 'function') {
        return [];
    }

    return providerModule.listModels({
        credential,
        signal
    });
}

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
    fetchProviderModels
};
