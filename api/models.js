/**
 * /api/models - Model Catalog
 * 
 * Returns admin-managed model catalog from DB only.
 */

import { closePool, isDbConfigured } from '../lib/oracle.js';
import { getActiveModelCatalogCategories } from '../lib/model-catalog.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({
                error: 'Database unavailable',
                message: 'Model catalog is DB-only and requires Oracle DB configuration.'
            });
        }

        const categories = await getActiveModelCatalogCategories();
        res.status(200).json({ categories });
    } catch (error) {
        if (error?.code === 'MODEL_CATALOG_TABLE_MISSING') {
            return res.status(503).json({
                error: 'Model catalog table missing',
                message: 'Run db/migrate_provider_queue.sql to create model_catalog and model_provider_mappings.'
            });
        }

        console.error('Models error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
