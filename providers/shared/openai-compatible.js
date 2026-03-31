import { buildAuthHeaders, parseErrorResponse } from './http.js';
import { toModelCard } from './model-card.js';

function getEndpointPath(providerDefinition, endpointKey) {
    return providerDefinition?.endpoints?.[endpointKey] || null;
}

function buildEndpointPayload(endpointKey, upstreamModel, requestBody) {
    const payload = {
        ...(requestBody || {})
    };

    if (endpointKey === 'chat.completions') {
        if (!upstreamModel) {
            const error = new Error('Missing upstream model for chat completion');
            error.status = 400;
            throw error;
        }

        payload.model = upstreamModel;
    }

    if (endpointKey === 'images.generations' && upstreamModel) {
        payload.model = upstreamModel;
    }

    return payload;
}

export async function executeOpenAiProviderEndpoint({
    providerDefinition,
    endpointKey,
    upstreamModel,
    requestBody,
    credential,
    signal,
    additionalAuthHeaders
}) {
    const endpointPath = getEndpointPath(providerDefinition, endpointKey);
    if (!endpointPath) {
        const error = new Error(`Provider does not support endpoint: ${endpointKey}`);
        error.status = 400;
        throw error;
    }

    if (!providerDefinition?.baseUrl) {
        const error = new Error(`Provider is missing base URL configuration: ${providerDefinition?.id || 'unknown'}`);
        error.status = 500;
        throw error;
    }

    const payload = buildEndpointPayload(endpointKey, upstreamModel, requestBody);

    const response = await fetch(`${providerDefinition.baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: buildAuthHeaders({ credential, additionalAuthHeaders }),
        body: JSON.stringify(payload),
        signal
    });

    if (!response.ok) {
        const parsed = await parseErrorResponse(response);
        const error = new Error(parsed.message);
        error.status = parsed.status;
        error.raw = parsed.raw;
        throw error;
    }

    if (endpointKey === 'chat.completions' && requestBody?.stream) {
        return {
            mode: 'stream',
            response,
            normalizedData: null
        };
    }

    let data;
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    return {
        mode: 'json',
        response,
        normalizedData: data
    };
}

export async function listOpenAiProviderModels({
    providerDefinition,
    credential,
    signal,
    additionalAuthHeaders
}) {
    const modelsPath = getEndpointPath(providerDefinition, 'models.list');
    if (!modelsPath || !providerDefinition?.baseUrl) {
        return [];
    }

    const headers = buildAuthHeaders({ credential, additionalAuthHeaders });
    delete headers['Content-Type'];

    const response = await fetch(`${providerDefinition.baseUrl}${modelsPath}`, {
        headers,
        signal
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json().catch(() => ({}));

    const modelItems = Array.isArray(data?.data)
        ? data.data
        : (Array.isArray(data) ? data : []);

    return modelItems
        .map(item => {
            const modelId = item?.id || item?.name;
            if (!modelId) return null;

            return toModelCard(providerDefinition, modelId, {
                name: item?.name,
                description: item?.description,
                capabilities: item?.capabilities,
                pro: item?.premium || item?.paid_only,
                caching: item?.caching
            });
        })
        .filter(Boolean);
}
