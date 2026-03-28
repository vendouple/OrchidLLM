/**
 * /api/admin/demo-sessions - Demo Session Management
 *
 * CRUD operations for demo sessions (admin only):
 *   GET    - List with optional filters
 *   PUT    - Update (block/unblock)
 *   DELETE - Hard-delete a specific session row
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

/** GET - list demo sessions with optional ?filter= active|blocked|expired */
async function handleGet(req, res) {
    if (!await requireAdmin(req, res)) return;

    const filter = req.query.filter || 'all';

    let whereClause = '';
    if (filter === 'active')  whereClause = 'WHERE ds.is_blocked = 0 AND ak.is_active = 1';
    if (filter === 'blocked') whereClause = 'WHERE ds.is_blocked = 1';
    if (filter === 'expired') whereClause = `WHERE ds.is_blocked = 0 AND ds.last_seen < SYSDATE - 15`;

    const result = await executeQuery(`
        SELECT
            ds.id, ds.composite_hash, ds.fingerprint_hash,
            ds.ip_address, ds.user_agent,
            ds.first_seen, ds.last_seen,
            ds.request_count, ds.is_blocked,
            ak.key AS api_key, ak.id AS api_key_id,
            ak.is_active AS key_is_active,
            ak.usage_count AS key_usage_count,
            ak.total_input_tokens, ak.total_output_tokens,
            ROUND(SYSDATE - NVL(ds.last_seen, ds.first_seen)) AS days_inactive
        FROM demo_sessions ds
        LEFT JOIN api_keys ak ON ds.api_key_id = ak.id
        ${whereClause}
        ORDER BY NVL(ds.last_seen, ds.first_seen) DESC NULLS LAST
        FETCH FIRST 500 ROWS ONLY
    `);

    res.status(200).json(result.rows);
}

/** PUT - block/unblock a session (and optionally its linked key) */
async function handlePut(req, res) {
    if (!await requireAdmin(req, res)) return;

    const { sessionId, isBlocked, blockKey } = req.body;

    if (sessionId == null) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    // Update demo_session
    await executeQuery(
        `UPDATE demo_sessions SET is_blocked = :blocked WHERE id = :id`,
        { blocked: isBlocked ? 1 : 0, id: sessionId }
    );

    // Optionally cascade to the linked api_key
    if (blockKey) {
        await executeQuery(
            `UPDATE api_keys SET is_active = :active
             WHERE id = (SELECT api_key_id FROM demo_sessions WHERE id = :id)`,
            { active: isBlocked ? 0 : 1, id: sessionId }
        );
    }

    res.status(200).json({ success: true });
}

/** DELETE - hard delete a demo session row (doesn't delete the api_key) */
async function handleDelete(req, res) {
    if (!await requireAdmin(req, res)) return;

    const { sessionId } = req.query;
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    await executeQuery(
        `DELETE FROM demo_sessions WHERE id = :id`,
        { id: sessionId }
    );

    res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':    await handleGet(req, res);    break;
            case 'PUT':    await handlePut(req, res);    break;
            case 'DELETE': await handleDelete(req, res); break;
            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('[admin/demo-sessions] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
