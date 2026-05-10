/**
 * /api/user/catalog
 * Public model catalog for authenticated users.
 * Returns text models with filterable capabilities (vision, reasoning, etc.)
 * Tier access is shown so users know what they can use.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { getCatalogSnapshot } from '../../lib/model-catalog.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { category = 'text', capability, search } = req.query;

        const snapshot = await getCatalogSnapshot();
        const models = snapshot?.categories?.[category] || [];

        let filtered = models;

        // Filter by capability (e.g. vision, reasoning, code)
        if (capability) {
            const cap = capability.toLowerCase();
            filtered = filtered.filter(m =>
                Array.isArray(m.capabilities) &&
                m.capabilities.some(c => String(c).toLowerCase().includes(cap))
            );
        }

        // Filter by search term
        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(m =>
                m.id?.toLowerCase().includes(q) ||
                m.name?.toLowerCase().includes(q) ||
                m.desc?.toLowerCase().includes(q)
            );
        }

        const result = filtered.map(m => ({
            id: m.id,
            name: m.name,
            description: m.desc,
            category,
            contextWindow: m.context,
            capabilities: m.capabilities || [],
            tags: m.tags || [],
            availableTiers: m.availableTiers || [],
            modelAccessLevel: m.modelAccessLevel || 'free',
            supportsCaching: m.caching || false,
            providers: m.providers || []
        }));

        return res.status(200).json({ models: result, total: result.length });
    } catch (error) {
        console.error('[user/catalog] error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
