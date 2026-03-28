/**
 * /api/chat/completions - Chat Completions Proxy
 * 
 * Handles:
 * - Demo mode with fingerprint tracking
 * - BYOP mode (bypass all limits)
 * - Global API key validation
 * - Rate limiting (RPM/RPD)
 * - Token limit enforcement
 * - Request proxying to Pollinations/NVIDIA
 */

import { detectKeyType, validateApiKey, isModelAllowed, isProviderAllowed, getPollinationsServerKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession, checkTokenLimits } from '../../lib/usage.js';
import { countMessagesTokens, estimateOutputTokens } from '../../lib/tokenizer.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool } from '../../lib/oracle.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const UPSTREAM_FETCH_TIMEOUT_MS = Number(process.env.UPSTREAM_FETCH_TIMEOUT_MS || 45000);

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get identifiers
    const sessionId = req.headers['x-session-id'];
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader?.replace('Bearer ', '');
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    try {
        let keyInfo = null;
        let identifier = null;
        let fingerprint = null;
        
        // Parse fingerprint if provided
        if (fingerprintStr) {
            try {
                fingerprint = JSON.parse(fingerprintStr);
            } catch (e) {
                // Invalid JSON, ignore
            }
        }
        
        // Determine key type and validate
        if (apiKey) {
            const keyType = detectKeyType(apiKey);
            
            if (keyType.type === 'byop') {
                // BYOP - bypass all limits, direct passthrough
                keyInfo = {
                    type: 'byop',
                    actualKey: keyType.actualKey,
                    bypassLimits: true
                };
                identifier = `byop:${apiKey.substring(0, 20)}`;
            } else if (keyType.needsDbValidation) {
                // Demo or Global key - validate in DB
                keyInfo = await validateApiKey(apiKey);
                if (!keyInfo) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                identifier = `key:${apiKey}`;
            } else {
                return res.status(401).json({ error: 'Unknown key format' });
            }
        } else {
            // No API key - use demo mode with anti-abuse
            fingerprint = fingerprint || {};
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);
            
            // Check/create demo session
            const demoSession = await checkDemoSession(compositeHash, fingerprint, clientIP, userAgent);
            if (demoSession.isBlocked) {
                return res.status(429).json({ 
                    error: 'Session blocked',
                    message: 'Your session has been blocked due to suspicious activity'
                });
            }
            
            keyInfo = {
                type: 'demo',
                id: demoSession.apiKeyId,
                rpm: 5,
                rpd: 20,
                inputTokenLimit: 10000,
                outputTokenLimit: -1,
                bypassLimits: false
            };
            identifier = `demo:${compositeHash}`;
        }
        
        // Check rate limits (skip for BYOP)
        if (!keyInfo.bypassLimits) {
            const rateLimitResult = await checkRateLimit(
                identifier, 
                keyInfo.rpm, 
                keyInfo.rpd
            );
            
            if (!rateLimitResult.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    reason: rateLimitResult.reason,
                    resetAt: rateLimitResult.resetAt,
                    remaining: 0
                });
            }
        }
        
        // Get request body
        const body = req.body;
        const { model, messages, stream } = body;
        
        if (!model || !messages) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                message: 'model and messages are required'
            });
        }
        
        // Check model/provider access (skip for BYOP)
        if (!keyInfo.bypassLimits && keyInfo.type !== 'demo') {
            const provider = model.startsWith('nvidia/') ? 'nvidia' : 'pollinations';
            
            if (!isProviderAllowed(keyInfo, provider)) {
                return res.status(403).json({ 
                    error: 'Provider not allowed',
                    message: `Your key does not have access to ${provider}`
                });
            }
            
            if (!isModelAllowed(keyInfo, model)) {
                return res.status(403).json({ 
                    error: 'Model not allowed',
                    message: `Your key does not have access to ${model}`
                });
            }
        }
        
        // Check token limits (skip for BYOP)
        let inputTokens = 0;
        if (!keyInfo.bypassLimits && keyInfo.inputTokenLimit !== -1) {
            inputTokens = await countMessagesTokens(messages);
            const estimatedOutput = estimateOutputTokens(inputTokens, model);
            
            const tokenCheck = await checkTokenLimits(keyInfo, inputTokens, estimatedOutput);
            if (!tokenCheck.allowed) {
                return res.status(400).json({ 
                    error: 'Token limit exceeded',
                    message: tokenCheck.reason
                });
            }
        }
        
        // Determine target URL and key
        let targetUrl, targetKey;
        if (model.startsWith('nvidia/')) {
            targetUrl = NVIDIA_BASE;
            targetKey = process.env.NVIDIA_API_KEY;
            body.model = model.replace('nvidia/', '');
        } else {
            targetUrl = POLLINATIONS_BASE;
            targetKey = keyInfo.type === 'byop' 
                ? keyInfo.actualKey 
                : getPollinationsServerKey();
        }

        if (!targetKey || (typeof targetKey === 'string' && !targetKey.trim())) {
            return res.status(500).json({
                error: 'Server misconfiguration',
                message: model.startsWith('nvidia/')
                    ? 'Missing NVIDIA API key. Set NVIDIA_API_KEY in Vercel environment variables.'
                    : 'Missing Pollinations API key. Set POLLINATIONS_API_KEY in Vercel environment variables.'
            });
        }
        
        // Forward request to target API
        const response = await fetchWithTimeout(`${targetUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${targetKey}`
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: 'Upstream API error',
                status: response.status,
                message: errorData.error?.message || 'Unknown error'
            });
        }
        
        // Handle streaming vs non-streaming
        if (stream) {
            // Stream response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const reader = response.body.getReader();
            let outputTokens = 0;
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    // Try to count tokens from stream chunks
                    const chunk = new TextDecoder().decode(value);
                    const tokenMatch = chunk.match(/"completion_tokens":\s*(\d+)/);
                    if (tokenMatch) {
                        outputTokens = parseInt(tokenMatch[1]);
                    }
                    
                    res.write(value);
                }
            } finally {
                res.end();
            }
            
            // Log usage after stream completes
            await logUsage({
                identifier,
                apiKeyId: keyInfo.id,
                endpoint: '/chat/completions',
                model,
                inputTokens,
                outputTokens,
                ip: clientIP,
                fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                userAgent
            });
        } else {
            // Non-streaming response
            const data = await response.json();
            
            // Get actual token usage from response
            const outputTokens = data.usage?.completion_tokens || 0;
            const actualInputTokens = data.usage?.prompt_tokens || inputTokens;
            
            // Log usage
            await logUsage({
                identifier,
                apiKeyId: keyInfo.id,
                endpoint: '/chat/completions',
                model,
                inputTokens: actualInputTokens,
                outputTokens,
                ip: clientIP,
                fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                userAgent
            });
            
            res.status(200).json(data);
        }
        
    } catch (error) {
        console.error('Chat completions error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    } finally {
        await closePool();
    }
}
