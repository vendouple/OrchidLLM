/**
 * Shared HTTP helpers for provider adapters.
 */

export function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function buildAuthHeaders({ credential, additionalAuthHeaders } = {}) {
    const headers = {
        'Content-Type': 'application/json'
    };

    const apiKey = credential?.apiKey;
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    if (typeof additionalAuthHeaders === 'function') {
        const extraHeaders = additionalAuthHeaders(apiKey, credential);
        if (extraHeaders && typeof extraHeaders === 'object') {
            Object.assign(headers, extraHeaders);
        }
    }

    return headers;
}

export async function parseErrorResponse(response) {
    const text = await response.text().catch(() => '');
    const parsed = safeJsonParse(text);

    return {
        status: response.status,
        message:
            parsed?.error?.message ||
            parsed?.message ||
            parsed?.error ||
            response.statusText ||
            'Upstream error',
        raw: parsed || text || null
    };
}
