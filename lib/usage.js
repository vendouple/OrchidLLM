/**
 * Usage Tracking and Rate Limiting
 * 
 * Handles:
 * - Rate limit checking (RPM/RPD)
 * - Usage logging
 * - Demo session management
 * - Token tracking
 */

import { executeQuery, getConnection } from './oracle.js';
import { generateCompositeHash, generateFingerprintHash, checkSuspiciousFingerprint } from './fingerprint.js';
import { createDemoKey } from './keys.js';

/**
 * Check rate limit for an identifier
 * @param {string} identifier - Session ID, API key, or composite hash
 * @param {number} rpm - Requests per minute limit
 * @param {number} rpd - Requests per day limit
 * @returns {Promise<{allowed: boolean, resetAt?: string, remaining?: number}>}
 */
export async function checkRateLimit(identifier, rpm = 5, rpd = 20) {
    // -1 means unlimited
    if (rpm === -1 && rpd === -1) {
        return { allowed: true, remaining: -1 };
    }
    
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    try {
        // Check minute limit (RPM)
        if (rpm !== -1) {
            const minuteResult = await executeQuery(
                `SELECT COUNT(*) as count FROM usage_logs
                 WHERE identifier = :identifier 
                 AND created_at > :oneMinuteAgo`,
                { identifier, oneMinuteAgo }
            );
            
            const minuteCount = minuteResult.rows[0]?.COUNT || 0;
            if (minuteCount >= rpm) {
                const resetAt = new Date(now.getTime() + 60000);
                return {
                    allowed: false,
                    reason: 'rpm_exceeded',
                    resetAt: resetAt.toISOString(),
                    remaining: 0
                };
            }
        }
        
        // Check day limit (RPD)
        if (rpd !== -1) {
            const dayResult = await executeQuery(
                `SELECT COUNT(*) as count FROM usage_logs
                 WHERE identifier = :identifier 
                 AND created_at > :startOfDay`,
                { identifier, startOfDay }
            );
            
            const dayCount = dayResult.rows[0]?.COUNT || 0;
            if (dayCount >= rpd) {
                const resetAt = new Date(startOfDay);
                resetAt.setDate(resetAt.getDate() + 1);
                return {
                    allowed: false,
                    reason: 'rpd_exceeded',
                    resetAt: resetAt.toISOString(),
                    remaining: 0
                };
            }
            
            return {
                allowed: true,
                remaining: rpd - dayCount
            };
        }
        
        return { allowed: true, remaining: -1 };
    } catch (error) {
        console.error('Error checking rate limit:', error);
        // On error, allow the request (fail open)
        return { allowed: true, remaining: 0 };
    }
}

/**
 * Log usage to the database
 * @param {object} params - Usage log parameters
 */
export async function logUsage({
    identifier,
    apiKeyId,
    endpoint,
    model,
    inputTokens = 0,
    outputTokens = 0,
    ip,
    fingerprintHash,
    userAgent
}) {
    try {
        await executeQuery(
            `INSERT INTO usage_logs (
                identifier, api_key_id, endpoint, model,
                input_tokens, output_tokens,
                ip_address, fingerprint_hash, user_agent
            ) VALUES (
                :identifier, :apiKeyId, :endpoint, :model,
                :inputTokens, :outputTokens,
                :ip, :fingerprintHash, :userAgent
            )`,
            {
                identifier,
                apiKeyId: apiKeyId || null,
                endpoint,
                model: model || null,
                inputTokens,
                outputTokens,
                ip: ip || null,
                fingerprintHash: fingerprintHash || null,
                userAgent: userAgent || null
            }
        );
        
        // Update key's last_used and token totals
        if (apiKeyId) {
            await executeQuery(
                `UPDATE api_keys 
                 SET last_used = CURRENT_TIMESTAMP,
                     usage_count = usage_count + 1,
                     total_input_tokens = total_input_tokens + :inputTokens,
                     total_output_tokens = total_output_tokens + :outputTokens
                 WHERE id = :id`,
                { id: apiKeyId, inputTokens, outputTokens }
            );
        }
    } catch (error) {
        console.error('Error logging usage:', error);
        // Don't throw - logging failure shouldn't block requests
    }
}

/**
 * Check or create a demo session
 * @param {string} compositeHash - The composite hash
 * @param {object} fingerprint - Browser fingerprint
 * @param {string} ip - Client IP
 * @param {string} userAgent - User agent
 * @returns {Promise<{isBlocked: boolean, apiKeyId?: number, key?: string}>}
 */
export async function checkDemoSession(compositeHash, fingerprint, ip, userAgent) {
    try {
        // Check for existing session
        const existingSession = await executeQuery(
            `SELECT ds.id, ds.is_blocked, ds.api_key_id, ak.key
             FROM demo_sessions ds
             LEFT JOIN api_keys ak ON ds.api_key_id = ak.id
             WHERE ds.composite_hash = :hash`,
            { hash: compositeHash }
        );
        
        if (existingSession.rows.length > 0) {
            const session = existingSession.rows[0];
            
            // Check if blocked
            if (session.IS_BLOCKED) {
                return { isBlocked: true };
            }
            
            // Update last_seen
            await executeQuery(
                `UPDATE demo_sessions 
                 SET last_seen = CURRENT_TIMESTAMP,
                     request_count = request_count + 1
                 WHERE id = :id`,
                { id: session.ID }
            );
            
            return {
                isBlocked: false,
                apiKeyId: session.API_KEY_ID,
                key: session.KEY
            };
        }
        
        // Check for suspicious fingerprint
        const suspiciousCheck = checkSuspiciousFingerprint(fingerprint);
        if (suspiciousCheck.isSuspicious) {
            console.log('Suspicious fingerprint detected:', suspiciousCheck.reasons);
            // Still allow but log
        }
        
        // Create new demo key
        const { key, keyInfo } = await createDemoKey(compositeHash);
        
        // Get the key ID
        const keyResult = await executeQuery(
            `SELECT id FROM api_keys WHERE key = :key`,
            { key }
        );
        const apiKeyId = keyResult.rows[0]?.ID;
        
        // Create demo session
        const fingerprintHash = generateFingerprintHash(fingerprint);
        await executeQuery(
            `INSERT INTO demo_sessions (
                composite_hash, fingerprint_hash, ip_address, 
                user_agent, api_key_id
            ) VALUES (
                :compositeHash, :fingerprintHash, :ip,
                :userAgent, :apiKeyId
            )`,
            {
                compositeHash,
                fingerprintHash,
                ip,
                userAgent,
                apiKeyId
            }
        );
        
        return {
            isBlocked: false,
            apiKeyId,
            key
        };
    } catch (error) {
        console.error('Error checking demo session:', error);
        throw error;
    }
}

/**
 * Get remaining requests for an identifier
 * @param {string} identifier - Session ID or API key
 * @param {number} limit - Daily limit
 * @returns {Promise<number>}
 */
export async function getRemainingRequests(identifier, limit = 20) {
    if (limit === -1) return -1;
    
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const result = await executeQuery(
            `SELECT COUNT(*) as count FROM usage_logs
             WHERE identifier = :identifier 
             AND created_at > :startOfDay`,
            { identifier, startOfDay }
        );
        
        const count = result.rows[0]?.COUNT || 0;
        return Math.max(0, limit - count);
    } catch (error) {
        console.error('Error getting remaining requests:', error);
        return 0;
    }
}

/**
 * Get usage stats for an identifier
 * @param {string} identifier - Session ID or API key
 * @param {number} days - Number of days to look back
 * @returns {Promise<object>}
 */
export async function getUsageStats(identifier, days = 7) {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const result = await executeQuery(
            `SELECT 
                TRUNC(created_at) as date,
                endpoint,
                COUNT(*) as request_count,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens
             FROM usage_logs
             WHERE identifier = :identifier
             AND created_at > :startDate
             GROUP BY TRUNC(created_at), endpoint
             ORDER BY date DESC`,
            { identifier, startDate }
        );
        
        return result.rows;
    } catch (error) {
        console.error('Error getting usage stats:', error);
        return [];
    }
}

/**
 * Check token limits for a key
 * @param {object} keyInfo - Key info from validateApiKey
 * @param {number} inputTokens - Input tokens to check
 * @param {number} estimatedOutputTokens - Estimated output tokens
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkTokenLimits(keyInfo, inputTokens, estimatedOutputTokens = 0) {
    // BYOP has no limits
    if (!keyInfo || keyInfo.inputTokenLimit === -1) {
        return { allowed: true };
    }
    
    // Check input limit
    if (keyInfo.inputTokenLimit !== -1) {
        if (inputTokens > keyInfo.inputTokenLimit) {
            return {
                allowed: false,
                reason: `Input exceeds limit: ${inputTokens} > ${keyInfo.inputTokenLimit} tokens`
            };
        }
        
        // Check cumulative usage
        const totalUsed = (keyInfo.totalInputTokens || 0) + inputTokens;
        if (totalUsed > keyInfo.inputTokenLimit) {
            return {
                allowed: false,
                reason: `Cumulative input limit exceeded: ${totalUsed} > ${keyInfo.inputTokenLimit}`
            };
        }
    }
    
    // Check output limit
    if (keyInfo.outputTokenLimit !== -1 && estimatedOutputTokens > 0) {
        const totalOutput = (keyInfo.totalOutputTokens || 0) + estimatedOutputTokens;
        if (totalOutput > keyInfo.outputTokenLimit) {
            return {
                allowed: false,
                reason: `Output limit would be exceeded`
            };
        }
    }
    
    return { allowed: true };
}

export default {
    checkRateLimit,
    logUsage,
    checkDemoSession,
    getRemainingRequests,
    getUsageStats,
    checkTokenLimits
};
