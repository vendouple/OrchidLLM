/**
 * /api/cron/queue-worker — Process pending queue items
 * Schedule: every 5 minutes
 */
import { withCron } from '../../lib/middleware.js';
import { executeQuery, isDbConfigured } from '../../lib/oracle.js';
import { sendJson } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (!isDbConfigured()) return sendJson(res, 200, { processed: 0, message: 'DB not configured.' });

    // Reset stale in-flight items. Keep interval numeric to avoid SQL injection via env.
    const staleSeconds = Math.max(1, Math.min(86400, Number.parseInt(process.env.QUEUE_STALE_SECONDS || '120', 10) || 120));
    await executeQuery(`
        UPDATE request_queue SET status = 'failed', completed_at = CURRENT_TIMESTAMP
        WHERE status = 'in_flight'
          AND dispatched_at < CURRENT_TIMESTAMP - NUMTODSINTERVAL(:staleSeconds, 'SECOND')
    `, { staleSeconds }).catch(() => {});

    // Clean completed items older than 24h
    await executeQuery(`
        DELETE FROM request_queue
        WHERE status IN ('completed', 'failed')
          AND completed_at < CURRENT_TIMESTAMP - INTERVAL '1' DAY
    `).catch(() => {});

    // Count current state
    const stats = await executeQuery(`
        SELECT status, COUNT(*) AS cnt FROM request_queue GROUP BY status
    `).catch(() => ({ rows: [] }));

    const pending = await executeQuery(`
        SELECT id, priority, created_at
        FROM request_queue
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        FETCH FIRST 20 ROWS ONLY
    `).catch(() => ({ rows: [] }));

    return sendJson(res, 200, {
        processed: true,
        staleSeconds,
        stats: stats.rows,
        pending: pending.rows,
    });
}

export default withCron(handler);
