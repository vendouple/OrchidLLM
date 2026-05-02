/**
 * Dynamic Context Routing Engine
 */

import { executeQuery } from './oracle.js';
import { countMessagesTokens } from './tokenizer.js';
import { getActiveModelById } from './model-catalog.js';

export async function routeRequest({ messages, modelRow, userId }) {
    if (!messages || !Array.isArray(messages)) {
        return { action: 'RAW', multiplier: 1.0, messages };
    }

    const tokenCount = await countMessagesTokens(messages);
    
    // Check if within normal limits
    if (!modelRow.heavyThresholdTokens || tokenCount <= modelRow.heavyThresholdTokens) {
        return { action: 'RAW', multiplier: 1.0, messages };
    }
    
    // It's heavy or massive. Look up user preference.
    let isMassive = modelRow.massiveThresholdTokens && tokenCount > modelRow.massiveThresholdTokens;
    let action = isMassive ? 'BLOCK' : 'RAW';
    let workerModelId = null;
    let customPrompt = null;
    let multiplier = isMassive ? Number(modelRow.massiveMultiplier || 2.0) : Number(modelRow.heavyMultiplier || 1.5);
    
    if (userId) {
        try {
            const prefResult = await executeQuery(`
                SELECT heavy_action, massive_action, worker_model_id, compression_prompt
                FROM user_model_preferences
                WHERE user_id = :userId AND model_id = :modelId
            `, { userId, modelId: modelRow.modelId });
            
            if (prefResult.rows && prefResult.rows.length > 0) {
                const pref = prefResult.rows[0];
                action = isMassive ? pref.MASSIVE_ACTION : pref.HEAVY_ACTION;
                workerModelId = pref.WORKER_MODEL_ID;
                customPrompt = pref.COMPRESSION_PROMPT;
            }
        } catch (err) {
            console.error('Error fetching user preferences:', err);
        }
    }
    
    if (action === 'BLOCK') {
        return { action: 'BLOCK', reason: isMassive ? 'massive_context' : 'heavy_context' };
    }
    
    if (action === 'RAW') {
        return { action: 'RAW', multiplier, messages };
    }
    
    if (action === 'COMPRESS') {
        if (!workerModelId) {
            return { action: 'RAW', multiplier, messages, warning: 'No worker model configured for compression, falling back to RAW.' };
        }
        
        const workerModel = await getActiveModelById(workerModelId);
        if (!workerModel) {
            return { action: 'RAW', multiplier, messages, warning: `Worker model ${workerModelId} not found, falling back to RAW.` };
        }
        
        // Very basic context window check. Assuming context window is stored as string like "128K"
        if (workerModel.contextWindow) {
            const match = workerModel.contextWindow.match(/(\d+)K/i);
            if (match) {
                const limitTokens = parseInt(match[1]) * 1024;
                if (tokenCount > limitTokens) {
                    return { action: 'RAW', multiplier, messages, warning: `Worker model ${workerModelId} cannot fit context (${tokenCount} > ${limitTokens}), falling back to RAW.` };
                }
            }
        }
        
        // Build compression payload
        const defaultPrompt = "You are a message summarization expert. Summarize all the messages below:\n";
        const prefix = customPrompt ? `${defaultPrompt}\n${customPrompt}\n` : defaultPrompt;
        
        const serialized = messages.map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');
        
        const compressionRequest = [
            { role: 'system', content: prefix },
            { role: 'user', content: serialized }
        ];
        
        return { 
            action: 'COMPRESS', 
            compressedMessages: compressionRequest, 
            workerModel,
            multiplier: 1.0 // Initial compression call might have cost, but we return 1.0 for the routed cost. Wait, cost is handled in completions flow.
        };
    }
    
    // Fallback
    return { action: 'RAW', multiplier, messages };
}

export default {
    routeRequest
};
