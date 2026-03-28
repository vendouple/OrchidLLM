/**
 * API Key Validation and Management
 * 
 * Handles detection and validation of different key types:
 * - Demo keys: nobindes_<timestamp>_<random>
 * - Global keys: nobindes_<32-byte-hex>
 * - BYOP keys: BYOP_<sk_xxx or pk_xxx> (stored locally, not in DB)
 */

import { executeQuery } from './oracle.js';
import crypto from 'crypto';

const POLLINATIONS_KEY_ENV_CANDIDATES = [
    'POLLINATIONS_API_KEY',
    'POLLINATION_API_KEY',
    'POLLINATIONS_KEY',
    'POLLINATIONS_TOKEN'
];

/**
 * Resolve the server-side Pollinations key from environment variables.
 * @returns {string|null}
 */
export function getPollinationsServerKey() {
    for (const envName of POLLINATIONS_KEY_ENV_CANDIDATES) {
        const value = process.env[envName];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

/**
 * Detect the type of API key
 * @param {string} apiKey - The API key to detect
 * @returns {{type: string, actualKey?: string, bypassLimits?: boolean, needsDbValidation?: boolean}}
 */
export function detectKeyType(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return { type: 'unknown' };
    }
    
    // BYOP: User's own Pollinations key
    // Format: BYOP_sk_xxx or BYOP_pk_xxx
    if (apiKey.startsWith('BYOP_')) {
        const actualKey = apiKey.replace('BYOP_', '');
        return {
            type: 'byop',
            actualKey,
            bypassLimits: true
        };
    }
    
    // nobindes keys
    if (apiKey.startsWith('nobindes_')) {
        const keyBody = apiKey.replace('nobindes_', '');
        
        // Demo session: short format with underscore (timestamp_random)
        // Example: nobindes_1712345678901_abc123
        if (keyBody.includes('_') && keyBody.length < 30) {
            return { 
                type: 'demo', 
                needsDbValidation: true 
            };
        }
        
        // Global API key: long format (64+ chars after prefix)
        // Example: nobindes_abc123def456... (32 bytes = 64 hex chars)
        if (keyBody.length >= 32) {
            return { 
                type: 'global', 
                needsDbValidation: true 
            };
        }
        
        // Unknown nobindes format
        return { type: 'unknown' };
    }
    
    // Legacy: direct Pollinations key (sk_ or pk_ prefix)
    if (apiKey.startsWith('sk_') || apiKey.startsWith('pk_')) {
        return {
            type: 'byop',
            actualKey: apiKey,
            bypassLimits: true
        };
    }
    
    return { type: 'unknown' };
}

/**
 * Validate an API key against the database
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<object|null>} - Key info or null if invalid
 */
export async function validateApiKey(apiKey) {
    const keyType = detectKeyType(apiKey);
    
    // BYOP keys don't need DB validation
    if (keyType.type === 'byop') {
        return {
            id: null,
            type: 'byop',
            actualKey: keyType.actualKey,
            bypassLimits: true,
            rpm: -1,
            rpd: -1,
            inputTokenLimit: -1,
            outputTokenLimit: -1,
            queuePriority: -1
        };
    }
    
    // Unknown key type
    if (keyType.type === 'unknown') {
        return null;
    }
    
    // Validate against database
    try {
        const result = await executeQuery(
            `SELECT 
                id, 
                key_type, 
                name,
                rpm, 
                rpd, 
                input_token_limit, 
                output_token_limit, 
                queue_priority,
                providers,
                allowed_models,
                expires_at,
                is_active,
                total_input_tokens,
                total_output_tokens,
                usage_count
            FROM api_keys 
            WHERE key = :key`,
            { key: apiKey }
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        
        // Check if key is active
        if (!row.IS_ACTIVE) {
            return null;
        }
        
        // Check expiration
        if (row.EXPIRES_AT && new Date(row.EXPIRES_AT) < new Date()) {
            return null;
        }
        
        // Parse JSON fields
        let providers = ['pollinations'];
        let allowedModels = ['*'];
        
        try {
            if (row.PROVIDERS) {
                providers = JSON.parse(row.PROVIDERS);
            }
        } catch (e) {
            // Keep default
        }
        
        try {
            if (row.ALLOWED_MODELS) {
                allowedModels = JSON.parse(row.ALLOWED_MODELS);
            }
        } catch (e) {
            // Keep default
        }
        
        return {
            id: row.ID,
            type: row.KEY_TYPE,
            name: row.NAME,
            rpm: row.RPM,
            rpd: row.RPD,
            inputTokenLimit: row.INPUT_TOKEN_LIMIT,
            outputTokenLimit: row.OUTPUT_TOKEN_LIMIT,
            queuePriority: row.QUEUE_PRIORITY,
            providers,
            allowedModels,
            totalInputTokens: row.TOTAL_INPUT_TOKENS,
            totalOutputTokens: row.TOTAL_OUTPUT_TOKENS,
            usageCount: row.USAGE_COUNT
        };
    } catch (error) {
        console.error('Error validating API key:', error);
        return null;
    }
}

/**
 * Generate a new API key
 * @param {string} keyType - 'demo' or 'global'
 * @returns {string} - Generated key
 */
export function generateKey(keyType = 'global') {
    if (keyType === 'demo') {
        // Demo key format: nobindes_<timestamp>_<random>
        const timestamp = Date.now();
        const random = crypto.randomBytes(6).toString('hex');
        return `nobindes_${timestamp}_${random}`;
    } else {
        // Global key format: nobindes_<32-byte-hex>
        const randomBytes = crypto.randomBytes(32).toString('hex');
        return `nobindes_${randomBytes}`;
    }
}

/**
 * Create a new demo key in the database
 * @param {string} compositeHash - The composite hash for tracking
 * @returns {Promise<{key: string, keyInfo: object}>}
 */
export async function createDemoKey(compositeHash) {
    const key = generateKey('demo');
    const name = 'Default API Key';
    
    try {
        await executeQuery(
            `INSERT INTO api_keys (
                key, name, key_type, rpm, rpd, 
                input_token_limit, output_token_limit, 
                queue_priority, created_by
            ) VALUES (
                :key, :name, 'demo', 5, 20, 
                10000, -1, 
                0, :createdBy
            )`,
            { 
                key, 
                name, 
                createdBy: compositeHash.substring(0, 32) 
            }
        );
        
        return {
            key,
            keyInfo: {
                type: 'demo',
                name,
                rpm: 5,
                rpd: 20,
                inputTokenLimit: 10000,
                outputTokenLimit: -1,
                queuePriority: 0
            }
        };
    } catch (error) {
        console.error('Error creating demo key:', error);
        throw error;
    }
}

/**
 * Update key last used timestamp
 * @param {number} keyId - The key ID
 */
export async function updateKeyLastUsed(keyId) {
    if (!keyId) return;
    
    try {
        await executeQuery(
            `UPDATE api_keys 
             SET last_used = CURRENT_TIMESTAMP, 
                 usage_count = usage_count + 1 
             WHERE id = :id`,
            { id: keyId }
        );
    } catch (error) {
        console.error('Error updating key last used:', error);
    }
}

/**
 * Check if a model is allowed for a key
 * @param {object} keyInfo - Key info from validateApiKey
 * @param {string} model - Model name to check
 * @returns {boolean}
 */
export function isModelAllowed(keyInfo, model) {
    if (!keyInfo || !keyInfo.allowedModels) {
        return true; // Default allow if no restrictions
    }
    
    // Wildcard allows all
    if (keyInfo.allowedModels.includes('*')) {
        return true;
    }
    
    // Check if model is in allowed list
    return keyInfo.allowedModels.some(allowed => {
        // Support wildcards like 'nvidia/*' or 'gpt-*'
        if (allowed.endsWith('*')) {
            return model.startsWith(allowed.slice(0, -1));
        }
        return model === allowed;
    });
}

/**
 * Check if a provider is allowed for a key
 * @param {object} keyInfo - Key info from validateApiKey
 * @param {string} provider - Provider name (pollinations, nvidia, etc.)
 * @returns {boolean}
 */
export function isProviderAllowed(keyInfo, provider) {
    if (!keyInfo || !keyInfo.providers) {
        return true; // Default allow if no restrictions
    }
    
    return keyInfo.providers.includes(provider);
}

export default {
    detectKeyType,
    validateApiKey,
    generateKey,
    createDemoKey,
    updateKeyLastUsed,
    getPollinationsServerKey,
    isModelAllowed,
    isProviderAllowed
};
