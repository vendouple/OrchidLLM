/**
 * Token Counting using Tiktoken
 * 
 * Provides accurate token counting for API key limits.
 * Uses cl100k_base encoding (GPT-4/ChatGPT compatible).
 */

import { get_encoding } from 'tiktoken';

let encoder = null;

/**
 * Get or initialize the tokenizer encoder
 * Uses cl100k_base encoding which is compatible with most modern models
 */
function getEncoder() {
    if (!encoder) {
        // cl100k_base is used by GPT-4, GPT-3.5-turbo, and many other models
        encoder = get_encoding('cl100k_base');
    }
    return encoder;
}

/**
 * Count tokens in a text string
 * @param {string} text - Text to count tokens in
 * @returns {Promise<number>} - Number of tokens
 */
export async function countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
}

/**
 * Count tokens in a chat messages array
 * Accounts for message overhead and role tokens
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @returns {Promise<number>} - Total token count
 */
export async function countMessagesTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;
    
    const enc = getEncoder();
    let total = 0;
    
    for (const msg of messages) {
        // Message overhead: ~4 tokens per message (formatting, separators)
        total += 4;
        
        // Role tokens
        if (msg.role) {
            total += enc.encode(msg.role).length;
        }
        
        // Content tokens
        if (msg.content) {
            if (typeof msg.content === 'string') {
                total += enc.encode(msg.content).length;
            } else if (Array.isArray(msg.content)) {
                // Handle multi-modal content (text + images)
                for (const part of msg.content) {
                    if (part.type === 'text' && part.text) {
                        total += enc.encode(part.text).length;
                    } else if (part.type === 'image_url') {
                        // Image tokens: roughly 85-1105 tokens depending on detail level
                        // Using 85 as minimum (low detail) estimate
                        total += 85;
                    }
                }
            }
        }
        
        // Name field if present
        if (msg.name) {
            total += enc.encode(msg.name).length;
        }
    }
    
    // Reply priming (assistant message start)
    total += 3;
    
    return total;
}

/**
 * Estimate output tokens based on input and model
 * This is a rough estimate for pre-request validation
 * @param {number} inputTokens - Number of input tokens
 * @param {string} model - Model name
 * @returns {number} - Estimated output tokens
 */
export function estimateOutputTokens(inputTokens, model = 'default') {
    // Most models have context windows between 4k-128k
    // Typical responses are 100-2000 tokens
    // We estimate based on input length
    
    const modelLimits = {
        'gpt-4': { maxOutput: 4096, typicalRatio: 0.5 },
        'gpt-3.5-turbo': { maxOutput: 4096, typicalRatio: 0.5 },
        'claude': { maxOutput: 4096, typicalRatio: 0.5 },
        'default': { maxOutput: 2048, typicalRatio: 0.3 }
    };
    
    const limits = modelLimits[model] || modelLimits.default;
    
    // Estimate: min of (input * ratio, maxOutput)
    return Math.min(Math.floor(inputTokens * limits.typicalRatio), limits.maxOutput);
}

/**
 * Free encoder on process exit
 * Important for proper cleanup
 */
export function freeEncoder() {
    if (encoder) {
        encoder.free();
        encoder = null;
    }
}

// Setup cleanup on process exit
process.on('beforeExit', freeEncoder);

export default {
    countTokens,
    countMessagesTokens,
    estimateOutputTokens,
    freeEncoder
};
