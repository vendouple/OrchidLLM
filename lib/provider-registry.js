/**
 * Backward-compatible provider registry wrapper.
 *
 * Provider modules now live in /providers/<provider-id>/ and are managed by
 * the aggregator in /providers/aggregator.js.
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
    fetchProviderModels
};
