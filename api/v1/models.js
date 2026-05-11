/**
 * /api/v1/models — List models (requires auth, plan-filtered)
 */
import { withCors } from '../../lib/middleware.js';
import { resolveAuthContext, sendJson, sendError } from '../../lib/api-helpers.js';
import { listAccessibleModels, getAccessibleModel } from '../../lib/api-core.js';

async function handler(req, res) {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');

    const auth = await resolveAuthContext(req);
    if (!auth.authenticated) {
        return sendError(res, 401, 'unauthorized', 'API key required. Use Authorization: Bearer sk-orch-...');
    }

    const modelId = req.query?.model_id || req.query?.id;
    if (modelId) {
        const { access, model } = await getAccessibleModel(modelId, auth);
        if (!access.allowed) return sendError(res, access.status, access.code, access.message);
        return sendJson(res, 200, model);
    }

    const models = await listAccessibleModels(auth);
    return sendJson(res, 200, { object: 'list', data: models });
}

export default withCors(handler);
