/**
 * /api/cron/cleanup-demo — Clean up stale demo keys
 * Deletes demo keys with no requests for 20+ days.
 * Schedule: daily at 03:00 UTC
 */
import { withCron } from '../../lib/middleware.js';
import { executeQuery, isDbConfigured } from '../../lib/oracle.js';
import { sendJson, sendError } from '../../lib/api-helpers.js';

async function handler(req, res) {
    if (!isDbConfigured()) return sendJson(res, 200, { purged: 0, message: 'DB not configured.' });

    const result = await executeQuery(`
        DELETE FROM demo_keys
        WHERE last_used_at < CURRENT_TIMESTAMP - INTERVAL '20' DAY
    `);

    console.log(`[cron/cleanup-demo] Purged ${result.rowsAffected} stale demo keys.`);
    return sendJson(res, 200, { purged: result.rowsAffected });
}

export default withCron(handler);
