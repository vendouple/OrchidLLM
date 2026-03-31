/**
 * /api/models - Model Catalog
 * 
 * Returns admin-managed model catalog from DB with local JSON fallback.
 */

import { getBaseUrl } from '../lib/auth.js';
import { executeQuery, isDbConfigured, closePool } from '../lib/oracle.js';

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function parseJsonArray(value) {
    if (!value) return [];

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map(item => String(item || '').trim())
            .filter(Boolean);
    } catch {
        return [];
    }
}

function toFrontendModel(row) {
    let deprecatesAt = null;
    if (row.DEPRECATES_AT) {
        const parsedDate = new Date(row.DEPRECATES_AT);
        if (!Number.isNaN(parsedDate.getTime())) {
            deprecatesAt = parsedDate.toISOString();
        }
    }

    return {
        id: row.MODEL_ID,
        name: row.DISPLAY_NAME || row.MODEL_ID,
        desc: row.DESCRIPTION || 'Model',
        context: row.CONTEXT_WINDOW || '-',
        capabilities: parseJsonArray(row.CAPABILITIES_JSON),
        pro: row.IS_PRO === 1,
        caching: row.SUPPORTS_CACHING === 1,
        providers: parseJsonArray(row.COMPATIBLE_PROVIDERS_JSON),
        tags: parseJsonArray(row.TAGS_JSON),
        timeoutMs: row.TIMEOUT_MS == null ? null : Number(row.TIMEOUT_MS),
        deprecatesAt,
        deprecationNote: row.DEPRECATION_NOTE || null
    };
}

function toCategoryMap(rows) {
    const categories = {
        text: [],
        image: [],
        video: [],
        audio: [],
        transcription: []
    };

    for (const row of rows) {
        const category = String(row.CATEGORY || '').toLowerCase();
        if (!category) continue;

        if (!Array.isArray(categories[category])) {
            categories[category] = [];
        }

        categories[category].push(toFrontendModel(row));
    }

    return categories;
}

async function fetchLocalFallback(req) {
    let localModels = { categories: {} };

    try {
        const baseUrl = getBaseUrl(req);
        const localResponse = await fetch(`${baseUrl}/models.json`);
        if (localResponse.ok) {
            localModels = await localResponse.json();
        }
    } catch {
        console.log('[models] Could not fetch local models.json fallback');
    }

    return localModels?.categories || {};
}

async function fetchDatabaseCatalog() {
    if (!isDbConfigured()) {
        return null;
    }

    try {
        const result = await executeQuery(`
            SELECT
                category,
                model_id,
                display_name,
                description,
                context_window,
                capabilities_json,
                tags_json,
                compatible_providers_json,
                timeout_ms,
                deprecates_at,
                deprecation_note,
                is_pro,
                supports_caching
            FROM model_catalog
            WHERE is_active = 1
              AND (deprecates_at IS NULL OR deprecates_at > CURRENT_TIMESTAMP)
            ORDER BY category ASC, display_name ASC
        `);

        return toCategoryMap(result.rows || []);
    } catch (error) {
        if (isMissingTableError(error)) {
            return null;
        }
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const dbCategories = await fetchDatabaseCatalog();
        const localCategories = await fetchLocalFallback(req);

        const allModels = dbCategories && Object.values(dbCategories).some(items => Array.isArray(items) && items.length > 0)
            ? dbCategories
            : localCategories;
        
        res.status(200).json({ categories: allModels });
    } catch (error) {
        console.error('Models error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
