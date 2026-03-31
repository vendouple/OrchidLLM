import { buildAuthHeaders, parseErrorResponse } from '../shared/http.js';
import { toModelCard } from '../shared/model-card.js';

const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';

function normalizeOllamaBaseUrl(baseUrl) {
    const normalized = String(baseUrl || '').trim();
    if (!normalized) return OLLAMA_CLOUD_BASE_URL;
    return normalized.replace(/\/+$/, '');
}

function isOllamaCloudBaseUrl(baseUrl) {
    return /(^|\.)ollama\.com$/i.test(String(baseUrl || '').replace(/^https?:\/\//i, '').split('/')[0]);
}

function buildOllamaEndpointUrl(baseUrl, endpointPath) {
    const normalizedBase = normalizeOllamaBaseUrl(baseUrl);
    const normalizedPath = String(endpointPath || '').startsWith('/')
        ? String(endpointPath || '')
        : `/${String(endpointPath || '')}`;

    // Accept both base URLs: https://ollama.com and https://ollama.com/api.
    if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
        return `${normalizedBase}${normalizedPath.slice('/api'.length)}`;
    }

    return `${normalizedBase}${normalizedPath}`;
}

function mapOllamaDoneReason(payload) {
    if (payload?.done_reason) return payload.done_reason;
    if (payload?.done === true) return 'stop';
    return null;
}

export function adaptOllamaToOpenAi(payload, upstreamModel) {
    const promptTokens = Number(payload?.prompt_eval_count || 0);
    const completionTokens = Number(payload?.eval_count || 0);
    const totalTokens = promptTokens + completionTokens;

    return {
        id: `chatcmpl-ollama-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: `ollama/${upstreamModel}`,
        choices: [
            {
                index: 0,
                finish_reason: mapOllamaDoneReason(payload) || 'stop',
                message: {
                    role: 'assistant',
                    content: payload?.message?.content || ''
                }
            }
        ],
        usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens
        }
    };
}

function getDefinition() {
    return {
        id: 'ollama',
        displayName: 'Ollama',
        mode: 'ollama-native',
        baseUrl: normalizeOllamaBaseUrl(process.env.OLLAMA_BASE_URL || OLLAMA_CLOUD_BASE_URL),
        modelPrefix: 'ollama',
        envKeyCandidates: ['OLLAMA_API_KEY'],
        usageCounterType: 'tokens',
        endpoints: {
            'chat.completions': '/api/chat',
            'models.list': '/api/tags'
        }
    };
}

async function executeChatCompletion({ upstreamModel, requestBody, credential, signal }) {
    const providerDefinition = getDefinition();
    const model = upstreamModel || requestBody?.model;

    if (!model) {
        const error = new Error('Missing upstream model for Ollama request');
        error.status = 400;
        throw error;
    }

    // Ollama stream chunks are not OpenAI-compatible by default,
    // so normalize through the non-stream response shape.
    const payload = {
        model,
        messages: requestBody?.messages || [],
        stream: false,
        options: {
            temperature: requestBody?.temperature,
            top_p: requestBody?.top_p,
            num_predict: requestBody?.max_tokens
        }
    };

    const response = await fetch(buildOllamaEndpointUrl(providerDefinition.baseUrl, providerDefinition.endpoints['chat.completions']), {
        method: 'POST',
        headers: buildAuthHeaders({ credential }),
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

    let ollamaData;
    try {
        ollamaData = await response.json();
    } catch {
        ollamaData = {};
    }

    return {
        mode: 'json',
        response,
        normalizedData: adaptOllamaToOpenAi(ollamaData, model)
    };
}

async function listModels({ credential, signal } = {}) {
    const providerDefinition = getDefinition();
    const headers = buildAuthHeaders({ credential });
    delete headers['Content-Type'];

    const response = await fetch(buildOllamaEndpointUrl(providerDefinition.baseUrl, providerDefinition.endpoints['models.list']), {
        headers,
        signal
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.models) ? data.models : [];

    return models
        .map(item => {
            const modelId = item?.name;
            if (!modelId) return null;

            return toModelCard(providerDefinition, modelId, {
                name: item?.name,
                description: item?.details?.family || (isOllamaCloudBaseUrl(providerDefinition.baseUrl) ? 'Ollama cloud model' : 'Ollama local model'),
                capabilities: ['tools']
            });
        })
        .filter(Boolean);
}

const ollamaProvider = {
    id: 'ollama',
    aliases: ['ollama'],
    getDefinition,
    supports(endpointKey) {
        const definition = getDefinition();
        return Boolean(definition.endpoints?.[endpointKey]);
    },
    execute({ endpointKey, upstreamModel, requestBody, credential, signal }) {
        if (endpointKey !== 'chat.completions') {
            const error = new Error(`Provider does not support endpoint: ${endpointKey}`);
            error.status = 400;
            throw error;
        }

        return executeChatCompletion({
            upstreamModel,
            requestBody,
            credential,
            signal
        });
    },
    listModels
};

export default ollamaProvider;
