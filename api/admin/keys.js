/**
 * /api/admin/keys - API Key Management
 *
 * CRUD operations for API keys (admin only).
 * DELETE is a hard delete (removes the row).
 * Special action=purge-inactive-demo deletes demo keys inactive 30+ days,
 * cascading to their demo_sessions rows.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { generateKey } from '../../lib/keys.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

/**
 * GET - List all keys (or preview purge count)
 */
async function handleGet(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);

    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Preview: count how many demo keys would be purged
    if (req.query.action === 'preview-purge') {
        const result = await executeQuery(`
            SELECT COUNT(*) AS purge_count
            FROM api_keys
            WHERE key_type = 'demo'
              AND (last_used IS NULL OR last_used < SYSDATE - 30)
        `);
        return res.status(200).json({ purgeCount: result.rows[0]?.PURGE_COUNT ?? 0 });
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
 * POST - Create new global key
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

    if (!name || !String(name).trim()) {
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
            name: String(name).trim(),
            rpm: Number(rpm) || 5,
            rpd: Number(rpd) || 20,
            inputLimit: Number(inputTokenLimit) || 10000,
            outputLimit: Number(outputTokenLimit) ?? -1,
            queue: Number(queuePriority) || 0,
            providers: JSON.stringify(Array.isArray(providers) ? providers : ['pollinations']),
            models: JSON.stringify(Array.isArray(allowedModels) ? allowedModels : ['*']),
            expiresIn: expiresInDays ? Number(expiresInDays) : null,
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

    // Build dynamic update — only whitelisted fields
    const setClauses = [];
    const bindVars = { id: Number(keyId) };

    if (updates.name !== undefined) {
        setClauses.push('name = :name');
        bindVars.name = String(updates.name).trim();
    }
    if (updates.rpm !== undefined) {
        setClauses.push('rpm = :rpm');
        bindVars.rpm = Number(updates.rpm) || 5;
    }
    if (updates.rpd !== undefined) {
        setClauses.push('rpd = :rpd');
        bindVars.rpd = Number(updates.rpd) || 20;
    }
    if (updates.inputTokenLimit !== undefined) {
        setClauses.push('input_token_limit = :itl');
        bindVars.itl = Number(updates.inputTokenLimit);
    }
    if (updates.outputTokenLimit !== undefined) {
        setClauses.push('output_token_limit = :otl');
        bindVars.otl = Number(updates.outputTokenLimit);
    }
    if (updates.queuePriority !== undefined) {
        setClauses.push('queue_priority = :qp');
        bindVars.qp = Number(updates.queuePriority) || 0;
    }
    if (updates.providers !== undefined) {
        setClauses.push('providers = :providers');
        bindVars.providers = JSON.stringify(
            Array.isArray(updates.providers) ? updates.providers : []
        );
    }
    if (updates.allowedModels !== undefined) {
        setClauses.push('allowed_models = :models');
        bindVars.models = JSON.stringify(
            Array.isArray(updates.allowedModels) ? updates.allowedModels : ['*']
        );
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
 * DELETE - Hard delete a key (or purge all 30-day inactive demo keys)
 */
async function handleDelete(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);

    if (!session || !session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Special action: purge all demo keys inactive for 30+ days
    if (req.query.action === 'purge-inactive-demo') {
        // 1. Delete demo_sessions linked to these keys
        await executeQuery(`
            DELETE FROM demo_sessions
            WHERE api_key_id IN (
                SELECT id FROM api_keys
                WHERE key_type = 'demo'
                  AND (last_used IS NULL OR last_used < SYSDATE - 30)
            )
        `);

        // 2. Delete the usage_logs linked to these keys
        await executeQuery(`
            DELETE FROM usage_logs
            WHERE api_key_id IN (
                SELECT id FROM api_keys
                WHERE key_type = 'demo'
                  AND (last_used IS NULL OR last_used < SYSDATE - 30)
            )
        `);

        // 3. Hard-delete the demo keys
        const result = await executeQuery(`
            DELETE FROM api_keys
            WHERE key_type = 'demo'
              AND (last_used IS NULL OR last_used < SYSDATE - 30)
        `);

        return res.status(200).json({
            success: true,
            deleted: result.rowsAffected ?? 0
        });
    }

    // Single key hard delete
    const { keyId } = req.query;

    if (!keyId) {
        return res.status(400).json({ error: 'keyId is required' });
    }

    const id = Number(keyId);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid keyId' });
    }

    // Cascade: delete linked demo_sessions and usage_logs first
    await executeQuery(`DELETE FROM demo_sessions WHERE api_key_id = :id`, { id });
    await executeQuery(`DELETE FROM usage_logs WHERE api_key_id = :id`, { id });
    await executeQuery(`DELETE FROM request_queue WHERE api_key_id = :id`, { id });
    await executeQuery(`DELETE FROM api_keys WHERE id = :id`, { id });

    res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':    await handleGet(req, res);    break;
            case 'POST':   await handlePost(req, res);   break;
            case 'PUT':    await handlePut(req, res);    break;
            case 'DELETE': await handleDelete(req, res); break;
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