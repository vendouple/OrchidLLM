/**
 * /api/admin/keys - API Key Management
 * 
 * CRUD operations for API keys (admin only)
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { generateKey } from '../../lib/keys.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

/**
 * GET - List all keys
 */
async function handleGet(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    
    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const result = await executeQuery(`
        SELECT 
            id, key, name, key_type, rpm, rpd, 
            input_token_limit, output_token_limit, queue_priority,
            providers, allowed_models, expires_at,
            usage_count, total_input_tokens, total_output_tokens,
            created_at, created_by, last_used, is_active
        FROM api_keys
        ORDER BY created_at DESC
    `);
    
    res.status(200).json(result.rows);
}

/**
 * POST - Create new key
 */
async function handlePost(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    
    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { 
        name, 
        rpm = 5, 
        rpd = 20, 
        inputTokenLimit = 10000, 
        outputTokenLimit = -1, 
        queuePriority = 0, 
        providers = ['pollinations'], 
        allowedModels = ['*'], 
        expiresInDays 
    } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const key = generateKey('global');
    
    await executeQuery(
        `INSERT INTO api_keys (
            key, name, key_type, rpm, rpd, 
            input_token_limit, output_token_limit, queue_priority,
            providers, allowed_models, expires_at, created_by
        ) VALUES (
            :key, :name, 'global', :rpm, :rpd,
            :inputLimit, :outputLimit, :queue,
            :providers, :models,
            CASE WHEN :expiresIn IS NOT NULL THEN SYSDATE + :expiresIn ELSE NULL END,
            :createdBy
        )`,
        {
            key,
            name,
            rpm,
            rpd,
            inputLimit: inputTokenLimit,
            outputLimit: outputTokenLimit,
            queue: queuePriority,
            providers: JSON.stringify(providers),
            models: JSON.stringify(allowedModels),
            expiresIn: expiresInDays || null,
            createdBy: session.githubUsername
        }
    );
    
    res.status(201).json({ 
        key, 
        name,
        rpm,
        rpd,
        inputTokenLimit,
        outputTokenLimit,
        queuePriority
    });
}

/**
 * PUT - Update key
 */
async function handlePut(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    
    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { keyId, ...updates } = req.body;
    
    if (!keyId) {
        return res.status(400).json({ error: 'keyId is required' });
    }
    
    // Build dynamic update
    const setClauses = [];
    const bindVars = { id: keyId };
    
    if (updates.name !== undefined) {
        setClauses.push('name = :name');
        bindVars.name = updates.name;
    }
    if (updates.rpm !== undefined) {
        setClauses.push('rpm = :rpm');
        bindVars.rpm = updates.rpm;
    }
    if (updates.rpd !== undefined) {
        setClauses.push('rpd = :rpd');
        bindVars.rpd = updates.rpd;
    }
    if (updates.inputTokenLimit !== undefined) {
        setClauses.push('input_token_limit = :itl');
        bindVars.itl = updates.inputTokenLimit;
    }
    if (updates.outputTokenLimit !== undefined) {
        setClauses.push('output_token_limit = :otl');
        bindVars.otl = updates.outputTokenLimit;
    }
    if (updates.queuePriority !== undefined) {
        setClauses.push('queue_priority = :qp');
        bindVars.qp = updates.queuePriority;
    }
    if (updates.providers !== undefined) {
        setClauses.push('providers = :providers');
        bindVars.providers = JSON.stringify(updates.providers);
    }
    if (updates.allowedModels !== undefined) {
        setClauses.push('allowed_models = :models');
        bindVars.models = JSON.stringify(updates.allowedModels);
    }
    if (updates.isActive !== undefined) {
        setClauses.push('is_active = :active');
        bindVars.active = updates.isActive ? 1 : 0;
    }
    
    if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }
    
    await executeQuery(
        `UPDATE api_keys SET ${setClauses.join(', ')} WHERE id = :id`,
        bindVars
    );
    
    res.status(200).json({ success: true });
}

/**
 * DELETE - Revoke key
 */
async function handleDelete(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    
    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { keyId } = req.query;
    
    if (!keyId) {
        return res.status(400).json({ error: 'keyId is required' });
    }
    
    // Soft delete - mark as inactive
    await executeQuery(
        `UPDATE api_keys SET is_active = 0 WHERE id = :id`,
        { id: keyId }
    );
    
    res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':
                await handleGet(req, res);
                break;
            case 'POST':
                await handlePost(req, res);
                break;
            case 'PUT':
                await handlePut(req, res);
                break;
            case 'DELETE':
                await handleDelete(req, res);
                break;
            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Admin keys error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}