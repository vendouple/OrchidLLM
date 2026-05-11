/**
 * /api/video/generations — Video Generation Gateway (stub)
 */
import { applyCors, resolveAuthContext, sendError } from '../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'POST only.');
    const auth = await resolveAuthContext(req, { allowAnonymousDemo: true });
    if (!auth.authenticated) return sendError(res, 401, 'unauthorized', 'Authentication required.');
    return sendError(res, 501, 'not_implemented', 'Video generation is not yet implemented in this backend phase.');
}
