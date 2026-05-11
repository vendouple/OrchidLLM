/**
 * lib/tokenizer.js — Token Counting
 *
 * Uses tiktoken for accurate counting. Falls back to character-based estimate.
 */

let _encoder = null;

async function getEncoder() {
    if (_encoder) return _encoder;
    try {
        const { encoding_for_model } = await import('tiktoken');
        _encoder = encoding_for_model('gpt-4o');
        return _encoder;
    } catch {
        try {
            const { get_encoding } = await import('tiktoken');
            _encoder = get_encoding('cl100k_base');
            return _encoder;
        } catch {
            return null;
        }
    }
}

/**
 * Count tokens in a message array.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<number>}
 */
export async function countMessagesTokens(messages) {
    if (!messages?.length) return 0;
    const enc = await getEncoder();
    let total = 0;
    for (const msg of messages) {
        total += 4; // per-message overhead
        const content = typeof msg.content === 'string' ? msg.content
            : Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join(' ')
            : '';
        if (enc) {
            try { total += enc.encode(content).length; } catch { total += Math.ceil(content.length / 4); }
        } else {
            total += Math.ceil(content.length / 4);
        }
        if (msg.role) total += 1;
        if (msg.name) total += 1;
    }
    total += 2; // reply priming
    return total;
}

/**
 * Estimate output tokens (rough heuristic).
 */
export function estimateOutputTokens(inputTokens, modelSlug) {
    // Conservative: assume ~25% of input as output, min 100
    return Math.max(100, Math.ceil(inputTokens * 0.25));
}
