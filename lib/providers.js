/**
 * Provider execution and response normalization facade.
 *
 * Actual provider endpoint translation now lives in /providers/<provider>/.
 */

import {
    executeProviderEndpoint,
    PROVIDER_ENDPOINTS
} from '../providers/aggregator.js';
import { adaptOllamaToOpenAi } from '../providers/ollama/index.js';

export { adaptOllamaToOpenAi };

export async function executeProviderChatCompletion({
    providerId,
    upstreamModel,
    requestBody,
    credential,
    signal
}) {
    return executeProviderEndpoint({
        providerId,
        endpointKey: PROVIDER_ENDPOINTS.CHAT_COMPLETIONS,
        upstreamModel,
        requestBody,
        credential,
        signal
    });
}

export async function executeProviderImageGeneration({
    providerId,
    upstreamModel,
    requestBody,
    credential,
    signal
}) {
    return executeProviderEndpoint({
        providerId,
        endpointKey: PROVIDER_ENDPOINTS.IMAGE_GENERATIONS,
        upstreamModel,
        requestBody,
        credential,
        signal
    });
}

function readHeaderValue(headers, key) {
    if (!headers) return null;
    return headers.get(key) || headers.get(key.toLowerCase()) || null;
}

export function extractProviderUsage({
    providerId,
    providerDefinition,
    credential,
    responseHeaders,
    responseData,
    fallbackPromptTokens = 0,
    fallbackCompletionTokens = 0
}) {
    const usage = responseData?.usage || {};

    const promptTokens = Number(
        usage.prompt_tokens ??
        usage.input_tokens ??
        responseData?.prompt_eval_count ??
        fallbackPromptTokens ??
        0
    );

    const completionTokens = Number(
        usage.completion_tokens ??
        usage.output_tokens ??
        responseData?.eval_count ??
        fallbackCompletionTokens ??
        0
    );

    const totalTokens = Number(
        usage.total_tokens ??
        promptTokens + completionTokens
    );

    const rateLimitSnapshot = {
        requestLimitDay: readHeaderValue(responseHeaders, 'x-ratelimit-limit-requests-day'),
        requestRemainingDay: readHeaderValue(responseHeaders, 'x-ratelimit-remaining-requests-day'),
        requestResetDaySeconds: readHeaderValue(responseHeaders, 'x-ratelimit-reset-requests-day'),
        tokensLimitMinute: readHeaderValue(responseHeaders, 'x-ratelimit-limit-tokens-minute'),
        tokensRemainingMinute: readHeaderValue(responseHeaders, 'x-ratelimit-remaining-tokens-minute'),
        tokensResetMinuteSeconds: readHeaderValue(responseHeaders, 'x-ratelimit-reset-tokens-minute')
    };

    const counterType =
        credential?.usageCounterType ||
        providerDefinition?.usageCounterType ||
        'tokens';

    let providerUnits = totalTokens;
    if (counterType === 'requests') {
        providerUnits = 1;
    } else if (counterType === 'pollinations-pollen') {
        const fromHeaders = Number(
            readHeaderValue(responseHeaders, 'x-pollen-used') ||
            readHeaderValue(responseHeaders, 'x-usage-units') ||
            0
        );
        const fromBody = Number(responseData?.usage?.pollen || 0);
        providerUnits = Number.isFinite(fromBody) && fromBody > 0
            ? fromBody
            : (Number.isFinite(fromHeaders) && fromHeaders > 0 ? fromHeaders : totalTokens);
    }

    return {
        providerId,
        counterType,
        promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
        completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
        totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
        providerUnits: Number.isFinite(providerUnits) ? providerUnits : 0,
        rateLimitSnapshot
    };
}

export default {
    executeProviderChatCompletion,
    executeProviderImageGeneration,
    adaptOllamaToOpenAi,
    extractProviderUsage
};
