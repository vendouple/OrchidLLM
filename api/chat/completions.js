/**
 * /api/chat/completions - Chat Completions Proxy
 * 
 * Handles:
 * - Demo mode with fingerprint tracking (DB optional — fails open)
 * - BYOP mode (bypass all limits, no DB access)
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
// How long to wait for DB operations before giving up and falling back
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 12000);

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

/**
 * Wraps a DB promise so it times out and falls back gracefully.
 * On timeout, returns `fallback` instead of throwing.
 */
async function withDbTimeout(promise, fallback, label = 'DB operation') {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => {
            console.warn(`${label} timed out after ${DB_TIMEOUT_MS}ms — using fallback`);
            resolve(fallback);
        }, DB_TIMEOUT_MS))
    ]);
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get identifiers
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader?.replace('Bearer ', '').trim();
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    let usedDb = false; // track whether we actually touched Oracle

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
                // ── BYOP FAST PATH: zero DB interaction ──
                keyInfo = {
                    type: 'byop',
                    actualKey: keyType.actualKey,
                    bypassLimits: true
                };
                identifier = `byop:${apiKey.substring(0, 20)}`;

            } else if (keyType.needsDbValidation) {
                // Global/Demo key — validate in DB with timeout
                usedDb = true;
                const validated = await withDbTimeout(
                    validateApiKey(apiKey),
                    null,
                    'validateApiKey'
                );
                if (!validated) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                keyInfo = validated;
                identifier = `key:${apiKey}`;
            } else {
                return res.status(401).json({ error: 'Unknown key format' });
            }
        } else {
            // No API key — demo mode with anti-abuse fingerprinting
            fingerprint = fingerprint || {};
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);
            
            // Check/create demo session — with timeout fallback so slow DB never blocks users
            usedDb = true;
            const demoSession = await withDbTimeout(
                checkDemoSession(compositeHash, fingerprint, clientIP, userAgent),
                { isBlocked: false, apiKeyId: null, key: null }, // fail open: allow the request
                'checkDemoSession'
            );

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
        if (!keyInfo.bypassLimits && usedDb) {
            const rateLimitResult = await withDbTimeout(
                checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd),
                { allowed: true, remaining: -1 }, // fail open on timeout
                'checkRateLimit'
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
        
        // Check model/provider access (skip for BYOP and demo)
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
        const requestBody = { ...body }; // Clone to avoid mutating req.body
        if (model.startsWith('nvidia/')) {
            targetUrl = NVIDIA_BASE;
            targetKey = process.env.NVIDIA_API_KEY;
            requestBody.model = model.replace('nvidia/', '');
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
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: 'Upstream API error',
                status: response.status,
                message: errorData.error?.message || errorData.message || 'Unknown error'
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
            
            // Log usage after stream completes (best-effort, don't block)
            if (usedDb) {
                logUsage({
                    identifier,
                    apiKeyId: keyInfo.id,
                    endpoint: '/chat/completions',
                    model,
                    inputTokens,
                    outputTokens,
                    ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }
        } else {
            // Non-streaming response
            const data = await response.json();
            
            // Get actual token usage from response
            const outputTokens = data.usage?.completion_tokens || 0;
            const actualInputTokens = data.usage?.prompt_tokens || inputTokens;
            
            // Log usage (best-effort)
            if (usedDb) {
                logUsage({
                    identifier,
                    apiKeyId: keyInfo.id,
                    endpoint: '/chat/completions',
                    model,
                    inputTokens: actualInputTokens,
                    outputTokens,
                    ip: clientIP,
                    fingerprintHash: identifier.startsWith('demo:') ? identifier.replace('demo:', '') : null,
                    userAgent
                }).catch(() => {});
            }
            
            res.status(200).json(data);
        }
        
    } catch (error) {
        console.error('Chat completions error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    } finally {
        // Only close pool if we actually used it
        if (usedDb) {
            await closePool();
        }
    }
}
