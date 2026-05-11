/**
 * /api/admin/sql — Direct SQL Query Tool (Admin only)
 * POST { query: "SELECT ..." }
 * Destructive queries require ?override=1
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

const DESTRUCTIVE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|MERGE)\b/i;

async function handler(req, res) {
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'POST only.');

    const b = await readJsonBody(req);
    if (!b.query || typeof b.query !== 'string') return sendError(res, 400, 'missing_field', 'query required.');

    const isDestructive = DESTRUCTIVE_PATTERN.test(b.query);
    const override = req.query?.override === '1' || b.override === true;

    if (isDestructive && !override) {
        return sendError(res, 403, 'destructive_blocked',
            'Destructive query detected. Set override=1 to execute.');
    }

    const startMs = Date.now();
    try {
        const result = await executeQuery(b.query, b.binds || {}, { autoCommit: !isDestructive || override });
        const durationMs = Date.now() - startMs;

        // Log query
        await executeQuery(`
            INSERT INTO admin_sql_query_logs (admin_user_id, query_text, destructive_override, row_count, duration_ms)
            VALUES (:adminId, :queryText, :destructive, :rowCount, :duration)
        `, {
            adminId: req.auth?.userId || null,
            queryText: b.query.substring(0, 4000),
            destructive: isDestructive ? 1 : 0,
            rowCount: result.rows?.length ?? result.rowsAffected ?? 0,
            duration: durationMs
        }).catch(() => {});

        return sendJson(res, 200, {
            rows: result.rows || [],
            rowsAffected: result.rowsAffected || 0,
            durationMs,
            destructive: isDestructive,
        });
    } catch (err) {
        return sendError(res, 400, 'query_error', err.message);
    }
}

export default withAdmin(handler);
