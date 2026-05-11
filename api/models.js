/**
 * /api/models — Frontend model catalog (legacy endpoint for index.html)
 * Returns all active models (no auth required for public catalog)
 */
import { applyCors, sendJson, sendError } from '../lib/api-helpers.js';
import { listAccessibleModels } from '../lib/api-core.js';
import { isDbConfigured } from '../lib/oracle.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');

    if (!isDbConfigured()) {
        // Fallback: serve models.json
        return sendJson(res, 200, { object: 'list', data: [], fallback: true });
    }

    const models = await listAccessibleModels({ authenticated: false, modelAccessTier: 'demo' });
    return sendJson(res, 200, { object: 'list', data: models });
}
