/**
 * /api/user/preferences
 * Get/Update routing preferences
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { getActiveModelById } from '../../lib/model-catalog.js';

export default async function handler(req, res) {
    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (req.method === 'GET') {
            const result = await executeQuery(`
                SELECT model_id, heavy_action, massive_action, worker_model_id, compression_prompt
                FROM user_model_preferences
                WHERE user_id = :userId
            `, { userId: session.userId });

            return res.status(200).json(result.rows || []);
        }

        if (req.method === 'PUT') {
            const { modelId, heavyAction, massiveAction, workerModelId, compressionPrompt } = req.body || {};
            
            if (!modelId) return res.status(400).json({ error: 'modelId is required' });

            const validActions = ['RAW', 'COMPRESS', 'BLOCK'];
            const hAction = validActions.includes(heavyAction) ? heavyAction : 'RAW';
            const mAction = validActions.includes(massiveAction) ? massiveAction : 'BLOCK';

            // Validate worker model if COMPRESS is chosen
            let warning = null;
            if ((hAction === 'COMPRESS' || mAction === 'COMPRESS') && workerModelId) {
                const worker = await getActiveModelById(workerModelId);
                if (!worker) {
                    warning = `Worker model ${workerModelId} not found or inactive.`;
                }
            }

            // Upsert preference
            await executeQuery(`
                MERGE INTO user_model_preferences p
                USING DUAL ON (p.user_id = :userId AND p.model_id = :modelId)
                WHEN MATCHED THEN
                    UPDATE SET heavy_action = :hAction, massive_action = :mAction, worker_model_id = :workerModelId, compression_prompt = :prompt, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (user_id, model_id, heavy_action, massive_action, worker_model_id, compression_prompt)
                    VALUES (:userId, :modelId, :hAction, :mAction, :workerModelId, :prompt)
            `, {
                userId: session.userId,
                modelId,
                hAction,
                mAction,
                workerModelId: workerModelId || null,
                prompt: compressionPrompt || null
            });

            return res.status(200).json({ success: true, warning });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[user/preferences] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
