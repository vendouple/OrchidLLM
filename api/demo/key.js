/**
 * /api/demo/key — Demo Key Management
 * GET  → get or create a demo key for unauthenticated visitors
 * POST → same as GET (for flexibility)
 */
import { executeQuery, isDbConfigured } from '../../lib/oracle.js';
import { applyCors, sendJson, sendError, parseCookies, serializeCookie, appendSetCookie, inferPlatform, generateUuid } from '../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (!isDbConfigured()) return sendError(res, 503, 'db_unavailable', 'Database not configured.');

    const cookies = parseCookies(req);
    const existingKey = cookies.orchid_demo_key || req.headers['x-orchid-demo-key'];
    const platform = inferPlatform(req);

    const cookieOptions = {
        maxAge: 30 * 24 * 60 * 60,
        httpOnly: false, // readable by JS for localStorage sync
        sameSite: 'strict',
    };

    // Try existing key and refresh rolling cookie expiry.
    if (existingKey) {
        const r = await executeQuery('SELECT id FROM demo_keys WHERE id = :id', { id: existingKey });
        if (r.rows.length) {
            await executeQuery(`
                UPDATE demo_keys
                SET platform = :platform,
                    last_used_at = CURRENT_TIMESTAMP
                WHERE id = :id
            `, { id: existingKey, platform }).catch(() => {});
            appendSetCookie(res, serializeCookie('orchid_demo_key', existingKey, cookieOptions));
            return sendJson(res, 200, { demo_key: existingKey, existing: true });
        }
    }

    // Create new demo key
    const newKey = generateUuid();
    await executeQuery(`
        INSERT INTO demo_keys (id, platform, requests_today, total_requests)
        VALUES (:id, :platform, 0, 0)
    `, { id: newKey, platform });

    // Set cookie (30-day rolling expiry)
    appendSetCookie(res, serializeCookie('orchid_demo_key', newKey, cookieOptions));

    return sendJson(res, 201, { demo_key: newKey, existing: false });
}
