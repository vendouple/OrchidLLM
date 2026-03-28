/**
 * /api/images/generations - Image Generation Proxy
 * 
 * Handles image generation requests through Pollinations API.
 * BYOP mode is a zero-DB fast path.
 * Demo mode uses DB with timeout fallback (fail open).
 */

import { detectKeyType, validateApiKey, getPollinationsServerKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession } from '../../lib/usage.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool } from '../../lib/oracle.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 12000);

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader?.replace('Bearer ', '').trim();
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    let usedDb = false;

    try {
        let keyInfo = null;
        let identifier = null;
        
        if (apiKey) {
            const keyType = detectKeyType(apiKey);
            
            if (keyType.type === 'byop') {
                // ── BYOP FAST PATH: zero DB ──
                keyInfo = {
                    type: 'byop',
                    actualKey: keyType.actualKey,
                    bypassLimits: true
                };
                identifier = `byop:${apiKey.substring(0, 20)}`;

            } else if (keyType.needsDbValidation) {
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
            // Demo mode
            const fingerprint = fingerprintStr ? (() => { try { return JSON.parse(fingerprintStr); } catch { return {}; } })() : {};
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);
            
            usedDb = true;
            const demoSession = await withDbTimeout(
                checkDemoSession(compositeHash, fingerprint, clientIP, userAgent),
                { isBlocked: false, apiKeyId: null, key: null },
                'checkDemoSession'
            );

            if (demoSession.isBlocked) {
                return res.status(429).json({ error: 'Session blocked' });
            }
            
            keyInfo = {
                type: 'demo',
                id: demoSession.apiKeyId,
                rpm: 5,
                rpd: 20,
                bypassLimits: false
            };
            identifier = `demo:${compositeHash}`;
        }
        
        if (!keyInfo.bypassLimits && usedDb) {
            const rateLimitResult = await withDbTimeout(
                checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd),
                { allowed: true, remaining: -1 },
                'checkRateLimit'
            );
            if (!rateLimitResult.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    resetAt: rateLimitResult.resetAt
                });
            }
        }
        
        const body = req.body;
        const { prompt, model } = body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }
        
        const targetKey = keyInfo.type === 'byop' 
            ? keyInfo.actualKey 
            : getPollinationsServerKey();

        if (!targetKey || (typeof targetKey === 'string' && !targetKey.trim())) {
            return res.status(500).json({
                error: 'Server misconfiguration',
                message: 'Missing Pollinations API key. Set POLLINATIONS_API_KEY in Vercel environment variables.'
            });
        }
        
        const response = await fetch(`${POLLINATIONS_BASE}/images/generations`, {
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
                message: errorData.error?.message || errorData.message || 'Unknown error'
            });
        }
        
        const data = await response.json();
        
        // Log usage best-effort
        if (usedDb) {
            logUsage({
                identifier,
                apiKeyId: keyInfo.id,
                endpoint: '/images/generations',
                model: model || 'default',
                inputTokens: 0,
                outputTokens: 0,
                ip: clientIP,
                userAgent
            }).catch(() => {});
        }
        
        res.status(200).json(data);
        
    } catch (error) {
        console.error('Image generations error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        if (usedDb) {
            await closePool();
        }
    }
}
