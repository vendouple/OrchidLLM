/**
 * /api/queue/status - Request queue status lookup
 *
 * Supports:
 * - /api/queue/status?id=<queueId>
 * - /api/queue/<queueId> (via vercel route rewrite)
 */

import { getQueueStatus } from '../../lib/queue.js';
import { closePool } from '../../lib/oracle.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const queueId = req.query.id || req.query.queueId;
    if (!queueId) {
        return res.status(400).json({
            error: 'Missing queue id',
            message: 'Pass ?id=<queueId> or call /api/queue/<queueId>'
        });
    }

    try {
        const status = await getQueueStatus(queueId);
        if (!status) {
            return res.status(404).json({ error: 'Queue item not found' });
        }

        return res.status(200).json(status);
    } catch (error) {
        console.error('[queue/status] error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    } finally {
        await closePool();
    }
}
