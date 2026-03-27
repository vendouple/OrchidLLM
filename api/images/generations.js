/**
 * /api/images/generations - Image Generation Proxy
 * 
 * Handles image generation requests through Pollinations API
 */

import { detectKeyType, validateApiKey } from '../../lib/keys.js';
import { checkRateLimit, logUsage, checkDemoSession } from '../../lib/usage.js';
import { generateCompositeHash } from '../../lib/fingerprint.js';
import { closePool } from '../../lib/oracle.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const sessionId = req.headers['x-session-id'];
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader?.replace('Bearer ', '');
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const fingerprintStr = req.headers['x-fingerprint'];
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    try {
        let keyInfo = null;
        let identifier = null;
        
        if (apiKey) {
            const keyType = detectKeyType(apiKey);
            
            if (keyType.type === 'byop') {
                keyInfo = {
                    type: 'byop',
                    actualKey: keyType.actualKey,
                    bypassLimits: true
                };
                identifier = `byop:${apiKey.substring(0, 20)}`;
            } else if (keyType.needsDbValidation) {
                keyInfo = await validateApiKey(apiKey);
                if (!keyInfo) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                identifier = `key:${apiKey}`;
            } else {
                return res.status(401).json({ error: 'Unknown key format' });
            }
        } else {
            const fingerprint = fingerprintStr ? JSON.parse(fingerprintStr) : {};
            const compositeHash = generateCompositeHash(fingerprint, clientIP, userAgent);
            
            const demoSession = await checkDemoSession(compositeHash, fingerprint, clientIP, userAgent);
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
        
        if (!keyInfo.bypassLimits) {
            const rateLimitResult = await checkRateLimit(identifier, keyInfo.rpm, keyInfo.rpd);
            if (!rateLimitResult.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    resetAt: rateLimitResult.resetAt
                });
            }
        }
        
        const body = req.body;
        const { prompt, model, n, size } = body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }
        
        const targetKey = keyInfo.type === 'byop' 
            ? keyInfo.actualKey 
            : process.env.POLLINATIONS_API_KEY;
        
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
                message: errorData.error?.message || 'Unknown error'
            });
        }
        
        const data = await response.json();
        
        await logUsage({
            identifier,
            apiKeyId: keyInfo.id,
            endpoint: '/images/generations',
            model: model || 'default',
            inputTokens: 0,
            outputTokens: 0,
            ip: clientIP,
            userAgent
        });
        
        res.status(200).json(data);
        
    } catch (error) {
        console.error('Image generations error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
