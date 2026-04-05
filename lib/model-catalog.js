/**
 * DB-backed model catalog + provider mapping resolver with in-process cache.
 */

import { executeQuery, isDbConfigured } from './oracle.js';

const MODEL_CACHE_TTL_MS = Number(process.env.MODEL_CATALOG_CACHE_TTL_MS || 30000);
const DEFAULT_CATEGORIES = ['text', 'image', 'video', 'audio', 'transcription'];

const catalogCache = {
    expiresAt: 0,
    snapshot: null,
    inFlight: null
};

const mappingCache = {
    expiresAt: 0,
    snapshot: null,
    inFlight: null
};

function createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function cloneJsonValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function createEmptyCategories() {
    const categories = {};

    for (const category of DEFAULT_CATEGORIES) {
        categories[category] = [];
    }

    return categories;
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

function toIsoDateOrNull(value) {
    if (!value) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString();
}

function toFrontendModel(row) {
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
        deprecatesAt: toIsoDateOrNull(row.DEPRECATES_AT),
        deprecationNote: row.DEPRECATION_NOTE || null
    };
}

async function loadCatalogSnapshot() {
    if (!isDbConfigured()) {
        throw createError('DB_NOT_CONFIGURED', 'Database is not configured.');
    }

    try {
        const result = await executeQuery(`
            SELECT
                id,
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

        const categories = createEmptyCategories();
        const modelsById = new Map();

        for (const row of result.rows || []) {
            const normalizedCategory = String(row.CATEGORY || '').trim().toLowerCase();
            if (!normalizedCategory) continue;

            if (!Array.isArray(categories[normalizedCategory])) {
                categories[normalizedCategory] = [];
            }

            const frontendModel = toFrontendModel(row);
            categories[normalizedCategory].push(frontendModel);

            modelsById.set(frontendModel.id, {
                id: row.ID,
                category: normalizedCategory,
                modelId: frontendModel.id,
                displayName: frontendModel.name,
                contextWindow: row.CONTEXT_WINDOW || null,
                compatibleProviders: frontendModel.providers,
                timeoutMs: frontendModel.timeoutMs,
                isPro: frontendModel.pro,
                supportsCaching: frontendModel.caching
            });
        }

        return {
            loadedAt: Date.now(),
            categories,
            modelsById
        };
    } catch (error) {
        if (isMissingTableError(error)) {
            throw createError('MODEL_CATALOG_TABLE_MISSING', 'model_catalog table is missing. Run db/migrate_provider_queue.sql first.');
        }

        throw error;
    }
}

async function getCatalogSnapshot({ forceRefresh = false } = {}) {
    const now = Date.now();

    if (!forceRefresh && catalogCache.snapshot && catalogCache.expiresAt > now) {
        return catalogCache.snapshot;
    }

    if (catalogCache.inFlight) {
        return catalogCache.inFlight;
    }

    catalogCache.inFlight = loadCatalogSnapshot()
        .then(snapshot => {
            catalogCache.snapshot = snapshot;
            catalogCache.expiresAt = Date.now() + MODEL_CACHE_TTL_MS;
            return snapshot;
        })
        .finally(() => {
            catalogCache.inFlight = null;
        });

    return catalogCache.inFlight;
}

async function loadMappingSnapshot() {
    if (!isDbConfigured()) {
        throw createError('DB_NOT_CONFIGURED', 'Database is not configured.');
    }

    try {
        const result = await executeQuery(`
            SELECT
                m.id,
                m.model_catalog_id,
                LOWER(m.provider_name) AS provider_name,
                m.provider_model_id,
                m.provider_context_window,
                m.priority,
                m.metadata_json,
                c.model_id,
                c.context_window
            FROM model_provider_mappings m
            JOIN model_catalog c
              ON c.id = m.model_catalog_id
            WHERE m.is_active = 1
              AND c.is_active = 1
              AND (c.deprecates_at IS NULL OR c.deprecates_at > CURRENT_TIMESTAMP)
            ORDER BY c.model_id ASC,
                     LOWER(m.provider_name) ASC,
                     m.priority DESC,
                     m.id ASC
        `);

        const mappingsByModelProvider = new Map();
        const mappingsByModelId = new Map();

        for (const row of result.rows || []) {
            const modelId = String(row.MODEL_ID || '').trim();
            const providerName = String(row.PROVIDER_NAME || '').trim().toLowerCase();
            const providerModelId = String(row.PROVIDER_MODEL_ID || '').trim();

            if (!modelId || !providerName || !providerModelId) {
                continue;
            }

            const mapping = {
                id: row.ID,
                modelCatalogId: row.MODEL_CATALOG_ID,
                modelId,
                providerName,
                providerModelId,
                providerContextWindow: row.PROVIDER_CONTEXT_WINDOW || null,
                globalContextWindow: row.CONTEXT_WINDOW || null,
                priority: Number(row.PRIORITY || 0),
                metadataJson: row.METADATA_JSON || null
            };

            const mapKey = `${modelId}::${providerName}`;

            if (!mappingsByModelProvider.has(mapKey)) {
                mappingsByModelProvider.set(mapKey, mapping);
            }

            if (!mappingsByModelId.has(modelId)) {
                mappingsByModelId.set(modelId, []);
            }

            mappingsByModelId.get(modelId).push(mapping);
        }

        return {
            loadedAt: Date.now(),
            mappingsByModelProvider,
            mappingsByModelId
        };
    } catch (error) {
        if (isMissingTableError(error)) {
            throw createError('MODEL_PROVIDER_MAPPINGS_TABLE_MISSING', 'model_provider_mappings table is missing. Run db/migrate_provider_queue.sql first.');
        }

        throw error;
    }
}

async function getMappingSnapshot({ forceRefresh = false } = {}) {
    const now = Date.now();

    if (!forceRefresh && mappingCache.snapshot && mappingCache.expiresAt > now) {
        return mappingCache.snapshot;
    }

    if (mappingCache.inFlight) {
        return mappingCache.inFlight;
    }

    mappingCache.inFlight = loadMappingSnapshot()
        .then(snapshot => {
            mappingCache.snapshot = snapshot;
            mappingCache.expiresAt = Date.now() + MODEL_CACHE_TTL_MS;
            return snapshot;
        })
        .finally(() => {
            mappingCache.inFlight = null;
        });

    return mappingCache.inFlight;
}

export function invalidateModelCatalogCache() {
    catalogCache.expiresAt = 0;
    catalogCache.snapshot = null;
    catalogCache.inFlight = null;

    mappingCache.expiresAt = 0;
    mappingCache.snapshot = null;
    mappingCache.inFlight = null;
}

export async function getActiveModelCatalogCategories() {
    const snapshot = await getCatalogSnapshot();
    return cloneJsonValue(snapshot.categories);
}

export async function getActiveModelById(modelId) {
    const normalizedModelId = String(modelId || '').trim();
    if (!normalizedModelId) return null;

    const snapshot = await getCatalogSnapshot();
    const entry = snapshot.modelsById.get(normalizedModelId);
    return entry ? { ...entry } : null;
}

export async function mapProviderCandidatesForModel(modelId, providerCandidates) {
    const normalizedModelId = String(modelId || '').trim();

    if (!normalizedModelId) {
        return {
            reason: 'model_not_found',
            model: null,
            candidates: []
        };
    }

    const catalogSnapshot = await getCatalogSnapshot();
    const model = catalogSnapshot.modelsById.get(normalizedModelId);

    if (!model) {
        return {
            reason: 'model_not_found',
            model: null,
            candidates: []
        };
    }

    let mappingSnapshot;

    try {
        mappingSnapshot = await getMappingSnapshot();
    } catch (error) {
        if (error?.code === 'MODEL_PROVIDER_MAPPINGS_TABLE_MISSING') {
            return {
                reason: 'mapping_table_missing',
                model: { ...model },
                candidates: []
            };
        }

        throw error;
    }

    const mappedCandidates = [];

    for (const candidate of providerCandidates || []) {
        const providerName = String(candidate?.providerId || '').trim().toLowerCase();
        if (!providerName) continue;

        const mapKey = `${model.modelId}::${providerName}`;
        const mapping = mappingSnapshot.mappingsByModelProvider.get(mapKey);
        if (!mapping) continue;

        mappedCandidates.push({
            ...candidate,
            upstreamModel: mapping.providerModelId,
            globalModelId: model.modelId,
            modelCatalogId: model.id,
            mappingId: mapping.id,
            effectiveContextWindow: mapping.providerContextWindow || model.contextWindow || null
        });
    }

    return {
        reason: mappedCandidates.length > 0 ? null : 'mapping_missing',
        model: { ...model },
        candidates: mappedCandidates
    };
}

export default {
    invalidateModelCatalogCache,
    getActiveModelCatalogCategories,
    getActiveModelById,
    mapProviderCandidatesForModel
};
