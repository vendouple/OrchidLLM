/**
 * Normalized model card helper for upstream providers.
 */

export function toModelCard(providerDefinition, modelId, modelMeta = {}) {
    const capabilities = Array.isArray(modelMeta.capabilities)
        ? modelMeta.capabilities
        : (modelMeta.tools ? ['tools'] : []);

    return {
        id: `${providerDefinition.id}/${modelId}`,
        name: `${providerDefinition.displayName} ${modelMeta.name || modelId}`,
        desc: modelMeta.description || `${providerDefinition.displayName} model`,
        context: modelMeta.context || '-',
        capabilities,
        pro: Boolean(modelMeta.pro || modelMeta.paid || false),
        caching: Boolean(modelMeta.caching || false),
        provider: providerDefinition.id
    };
}
