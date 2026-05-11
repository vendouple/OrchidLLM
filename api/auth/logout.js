/**
 * POST /api/auth/logout — Destroy session
 */
import { clearSessionCookie } from '../../lib/auth.js';
import { applyCors, sendJson } from '../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

    clearSessionCookie(res);
    return sendJson(res, 200, { success: true });
}
