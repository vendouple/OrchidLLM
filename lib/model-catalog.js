/**
 * DB-backed model catalog + provider routing resolver with in-process cache.
 * Supports canonical model tables introduced by migrations while preserving
 * compatibility with legacy model_catalog/model_provider_mappings tables.
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

function parseJsonObject(value, fallback = null) {
    if (!value) return fallback;

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
        return parsed;
    } catch {
        return fallback;
    }
}

function toIsoDateOrNull(value) {
    if (!value) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString();
}

function normalizeCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'text';
}

function normalizeTierName(value) {
    return String(value || '').trim();
}

function normalizeParamName(value) {
    return String(value || '').trim();
}

function normalizeAlias(value) {
    return String(value || '').trim();
}

function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function toNumberOrDefault(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function buildWhitelistObject(entries) {
    const whitelist = {};

    for (const entry of entries || []) {
        const paramName = normalizeParamName(entry.PARAM_NAME || entry.paramName);
        if (!paramName) continue;

        if (!Array.isArray(whitelist[paramName])) {
            whitelist[paramName] = [];
        }

        const value = String(entry.ALLOWED_VALUE || entry.allowedValue || '').trim();
        if (value && !whitelist[paramName].includes(value)) {
            whitelist[paramName].push(value);
        }
    }

    return Object.keys(whitelist).length > 0 ? whitelist : null;
}

function buildRouteAllowedParams(entries) {
    const allowed = {};

    for (const entry of entries || []) {
        const paramName = normalizeParamName(entry.PARAM_NAME || entry.paramName);
        if (!paramName) continue;

        const supportMode = String(entry.SUPPORT_MODE || entry.supportMode || 'inherit').trim().toLowerCase();
        const allowedValue = String(entry.ALLOWED_VALUE || entry.allowedValue || '').trim();

        if (!allowed[paramName]) {
            allowed[paramName] = {
                supportMode,
                allowedValues: []
            };
        }

        allowed[paramName].supportMode = supportMode;
        if (allowedValue && !allowed[paramName].allowedValues.includes(allowedValue)) {
            allowed[paramName].allowedValues.push(allowedValue);
        }
    }

    return Object.keys(allowed).length > 0 ? allowed : null;
}

function toFrontendModelFromCanonical(model) {
    return {
        id: model.modelId,
        name: model.displayName || model.modelId,
        desc: model.description || 'Model',
        context: model.contextWindow || '-',
        capabilities: model.capabilities || [],
        pro: false,
        caching: model.supportsCaching === true,
        providers: model.compatibleProviders || [],
        tags: model.tags || [],
        timeoutMs: model.timeoutMs == null ? null : Number(model.timeoutMs),
        deprecatesAt: model.deprecationDate || model.expiresAt || null,
        deprecationNote: model.deprecationNote || null,
        modelAccessLevel: model.modelAccessLevel || null,
        inMultiplier: model.inMultiplier == null ? 1.0 : Number(model.inMultiplier),
        outMultiplier: model.outMultiplier == null ? 1.0 : Number(model.outMultiplier),
        cacheReadMultiplier: model.cacheReadMultiplier == null ? 1.0 : Number(model.cacheReadMultiplier),
        cacheWriteMultiplier: model.cacheWriteMultiplier == null ? 1.0 : Number(model.cacheWriteMultiplier),
        supportsBatch: model.supportsBatch === true,
        supportedParameters: model.supportedParameters || [],
        parameterWhitelist: model.parameterWhitelist || null,
        availableTiers: model.availableTiers || [],
        deprecationDate: model.deprecationDate || null,
        aliases: model.aliases || [],
        routes: model.routes || []
    };
}

function toFrontendModelFromLegacy(row) {
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
        deprecatesAt: toIsoDateOrNull(row.DEPRECATES_AT || row.DEPRECATION_DATE),
        deprecationNote: row.DEPRECATION_NOTE || null,
        modelAccessLevel: row.MODEL_ACCESS_LEVEL || null,
        inMultiplier: row.IN_MULTIPLIER == null ? 1.0 : Number(row.IN_MULTIPLIER),
        outMultiplier: row.OUT_MULTIPLIER == null ? 1.0 : Number(row.OUT_MULTIPLIER),
        cacheReadMultiplier: row.CACHE_READ_MULTIPLIER == null ? 1.0 : Number(row.CACHE_READ_MULTIPLIER),
        cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER == null ? 1.0 : Number(row.CACHE_WRITE_MULTIPLIER),
        supportsBatch: row.SUPPORTS_BATCH === 1,
        supportedParameters: parseJsonArray(row.SUPPORTED_PARAMETERS),
        parameterWhitelist: parseJsonObject(row.PARAMETER_WHITELIST, null),
        availableTiers: parseJsonArray(row.AVAILABLE_TIERS),
        deprecationDate: toIsoDateOrNull(row.DEPRECATION_DATE),
        aliases: [],
        routes: []
    };
}

async function loadCanonicalCatalogSnapshot() {
    const modelResult = await executeQuery(`
        SELECT
            cm.id,
            cm.category,
            cm.model_slug AS model_id,
            cm.display_name,
            cm.description,
            cm.context_window AS default_context_window,
            cm.timeout_ms,
            cm.supports_caching,
            cm.supports_batch,
            cm.in_multiplier,
            cm.out_multiplier,
            cm.cache_read_multiplier,
            cm.cache_write_multiplier,
            cm.deprecates_at AS deprecation_date,
            cm.deprecation_note,
            cm.expires_at,
            cm.is_active,
            cm.created_at,
            cm.updated_at,
            cm.created_by,
            cm.updated_by
        FROM canonical_models cm
        WHERE cm.is_active = 1
          AND (cm.expires_at IS NULL OR cm.expires_at > CURRENT_TIMESTAMP)
          AND (cm.deprecates_at IS NULL OR cm.deprecates_at > CURRENT_TIMESTAMP)
        ORDER BY cm.category ASC, cm.display_name ASC, cm.model_slug ASC
    `);

    const models = modelResult.rows || [];
    if (models.length === 0) {
        return {
            loadedAt: Date.now(),
            categories: createEmptyCategories(),
            modelsById: new Map(),
            aliasesById: new Map(),
            canonicalByDbId: new Map()
        };
    }

    const ids = models.map(row => row.ID);
    const bindVars = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
    const placeholders = ids.map((_, index) => `:id${index}`).join(', ');

    const [tierResult, paramResult, whitelistResult, routeResult, routeParamResult, aliasResult] = await Promise.all([
        executeQuery(`
            SELECT cmt.canonical_model_id, td.tier_name
            FROM canonical_model_tiers cmt
            JOIN tier_definitions td ON td.id = cmt.tier_definition_id
            WHERE cmt.canonical_model_id IN (${placeholders})
              AND cmt.is_active = 1
              AND td.is_active = 1
            ORDER BY td.sort_order ASC, td.tier_name ASC
        `, bindVars),
        executeQuery(`
            SELECT canonical_model_id, param_name
            FROM canonical_model_supported_params
            WHERE canonical_model_id IN (${placeholders})
              AND is_active = 1
            ORDER BY sort_order ASC, param_name ASC
        `, bindVars),
        executeQuery(`
            SELECT canonical_model_id, param_name, allowed_value
            FROM canonical_model_param_whitelist
            WHERE canonical_model_id IN (${placeholders})
              AND is_active = 1
            ORDER BY param_name ASC, sort_order ASC, allowed_value ASC
        `, bindVars),
        executeQuery(`
            SELECT
                id,
                canonical_model_id,
                provider_name,
                provider_model_id,
                route_label,
                provider_context_window AS context_window,
                timeout_ms,
                priority,
                supports_batch,
                supports_caching,
                in_multiplier,
                out_multiplier,
                cache_read_multiplier,
                cache_write_multiplier,
                is_active,
                metadata_json,
                expires_at,
                NULL AS deprecation_date,
                NULL AS deprecation_note
            FROM canonical_model_provider_routes
            WHERE canonical_model_id IN (${placeholders})
              AND is_active = 1
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ORDER BY canonical_model_id ASC, priority DESC, provider_context_window ASC NULLS LAST, id ASC
        `, bindVars),
        executeQuery(`
            SELECT provider_route_id AS canonical_route_id, param_name, override_type AS support_mode, override_enum_values_json AS allowed_value
            FROM canonical_model_route_params
            WHERE provider_route_id IN (
                SELECT id
                FROM canonical_model_provider_routes
                WHERE canonical_model_id IN (${placeholders})
            )
            ORDER BY provider_route_id ASC, param_name ASC
        `, bindVars),
        executeQuery(`
            SELECT canonical_model_id, alias_value AS alias_model_id, is_primary AS is_primary_alias, notes
            FROM canonical_model_aliases
            WHERE canonical_model_id IN (${placeholders})
              AND is_active = 1
            ORDER BY is_primary DESC, alias_value ASC
        `, bindVars)
    ]);

    const tiersByModel = new Map();
    for (const row of tierResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!tiersByModel.has(modelId)) tiersByModel.set(modelId, []);
        const tierName = normalizeTierName(row.TIER_NAME);
        if (tierName && !tiersByModel.get(modelId).includes(tierName)) {
            tiersByModel.get(modelId).push(tierName);
        }
    }

    const paramsByModel = new Map();
    for (const row of paramResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!paramsByModel.has(modelId)) paramsByModel.set(modelId, []);
        const paramName = normalizeParamName(row.PARAM_NAME);
        if (paramName && !paramsByModel.get(modelId).includes(paramName)) {
            paramsByModel.get(modelId).push(paramName);
        }
    }

    const whitelistByModel = new Map();
    for (const row of whitelistResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!whitelistByModel.has(modelId)) whitelistByModel.set(modelId, []);
        whitelistByModel.get(modelId).push(row);
    }

    const routeParamsByRoute = new Map();
    for (const row of routeParamResult.rows || []) {
        const routeId = row.CANONICAL_ROUTE_ID;
        if (!routeParamsByRoute.has(routeId)) routeParamsByRoute.set(routeId, []);
        routeParamsByRoute.get(routeId).push(row);
    }

    const routesByModel = new Map();
    for (const row of routeResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!routesByModel.has(modelId)) routesByModel.set(modelId, []);

        routesByModel.get(modelId).push({
            id: row.ID,
            canonicalModelId: modelId,
            providerName: String(row.PROVIDER_NAME || '').trim().toLowerCase(),
            providerModelId: String(row.PROVIDER_MODEL_ID || '').trim(),
            backendModelId: String(row.PROVIDER_MODEL_ID || '').trim(),
            routeLabel: row.ROUTE_LABEL || null,
            contextWindow: row.CONTEXT_WINDOW || null,
            timeoutMs: row.TIMEOUT_MS == null ? null : Number(row.TIMEOUT_MS),
            priority: Number(row.PRIORITY || 0),
            supportsBatch: row.SUPPORTS_BATCH === 1,
            supportsCaching: row.SUPPORTS_CACHING === 1,
            inMultiplier: row.IN_MULTIPLIER == null ? null : Number(row.IN_MULTIPLIER),
            outMultiplier: row.OUT_MULTIPLIER == null ? null : Number(row.OUT_MULTIPLIER),
            cacheReadMultiplier: row.CACHE_READ_MULTIPLIER == null ? null : Number(row.CACHE_READ_MULTIPLIER),
            cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER == null ? null : Number(row.CACHE_WRITE_MULTIPLIER),
            metadata: parseJsonObject(row.METADATA_JSON, null),
            expiresAt: toIsoDateOrNull(row.EXPIRES_AT),
            deprecationDate: toIsoDateOrNull(row.DEPRECATION_DATE),
            deprecationNote: row.DEPRECATION_NOTE || null,
            allowedParams: buildRouteAllowedParams(routeParamsByRoute.get(row.ID) || [])
        });
    }

    const aliasesByModel = new Map();
    const aliasesById = new Map();
    for (const row of aliasResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!aliasesByModel.has(modelId)) aliasesByModel.set(modelId, []);

        const alias = {
            aliasModelId: normalizeAlias(row.ALIAS_MODEL_ID),
            isPrimaryAlias: row.IS_PRIMARY_ALIAS === 1,
            notes: row.NOTES || null
        };

        if (!alias.aliasModelId) continue;
        aliasesByModel.get(modelId).push(alias);
        aliasesById.set(alias.aliasModelId, modelId);
    }

    const categories = createEmptyCategories();
    const modelsById = new Map();
    const canonicalByDbId = new Map();

    for (const row of models) {
        const normalizedCategory = normalizeCategory(row.CATEGORY);
        if (!Array.isArray(categories[normalizedCategory])) {
            categories[normalizedCategory] = [];
        }

        const metadata = parseJsonObject(row.METADATA_JSON, {});
        const compatibleProviders = Array.from(new Set((routesByModel.get(row.ID) || []).map(route => route.providerName).filter(Boolean)));

        const model = {
            id: row.ID,
            category: normalizedCategory,
            modelId: String(row.MODEL_ID || '').trim(),
            displayName: row.DISPLAY_NAME || row.MODEL_ID,
            description: row.DESCRIPTION || null,
            contextWindow: row.DEFAULT_CONTEXT_WINDOW || null,
            timeoutMs: row.TIMEOUT_MS == null ? null : Number(row.TIMEOUT_MS),
            supportsCaching: row.SUPPORTS_CACHING === 1,
            supportsBatch: row.SUPPORTS_BATCH === 1,
            inMultiplier: row.IN_MULTIPLIER == null ? 1.0 : Number(row.IN_MULTIPLIER),
            outMultiplier: row.OUT_MULTIPLIER == null ? 1.0 : Number(row.OUT_MULTIPLIER),
            cacheReadMultiplier: row.CACHE_READ_MULTIPLIER == null ? 1.0 : Number(row.CACHE_READ_MULTIPLIER),
            cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER == null ? 1.0 : Number(row.CACHE_WRITE_MULTIPLIER),
            deprecationDate: toIsoDateOrNull(row.DEPRECATION_DATE),
            deprecationNote: row.DEPRECATION_NOTE || null,
            expiresAt: toIsoDateOrNull(row.EXPIRES_AT),
            createdAt: row.CREATED_AT,
            updatedAt: row.UPDATED_AT,
            createdBy: row.CREATED_BY,
            updatedBy: row.UPDATED_BY,
            capabilities: parseJsonArray(metadata.capabilities),
            tags: parseJsonArray(metadata.tags),
            compatibleProviders,
            supportedParameters: paramsByModel.get(row.ID) || [],
            parameterWhitelist: buildWhitelistObject(whitelistByModel.get(row.ID) || []),
            availableTiers: tiersByModel.get(row.ID) || [],
            aliases: aliasesByModel.get(row.ID) || [],
            routes: routesByModel.get(row.ID) || [],
            modelAccessLevel: null
        };

        const frontendModel = toFrontendModelFromCanonical(model);
        categories[normalizedCategory].push(frontendModel);
        modelsById.set(model.modelId, { ...model });
        canonicalByDbId.set(row.ID, { ...model });

        for (const alias of model.aliases) {
            modelsById.set(alias.aliasModelId, {
                ...model,
                requestedModelId: alias.aliasModelId,
                canonicalModelId: model.modelId,
                isAlias: true,
                aliasModelId: alias.aliasModelId
            });
        }
    }

    return {
        loadedAt: Date.now(),
        categories,
        modelsById,
        aliasesById,
        canonicalByDbId
    };
}

async function loadLegacyCatalogSnapshot() {
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
            deprecation_date,
            deprecation_note,
            is_pro,
            supports_caching,
            model_access_level,
            in_multiplier,
            out_multiplier,
            cache_read_multiplier,
            cache_write_multiplier,
            supports_batch,
            supported_parameters,
            parameter_whitelist,
            available_tiers
        FROM model_catalog
        WHERE is_active = 1
          AND (deprecates_at IS NULL OR deprecates_at > CURRENT_TIMESTAMP)
          AND (deprecation_date IS NULL OR deprecation_date > CURRENT_TIMESTAMP)
        ORDER BY category ASC, display_name ASC
    `);

    const categories = createEmptyCategories();
    const modelsById = new Map();

    for (const row of result.rows || []) {
        const normalizedCategory = normalizeCategory(row.CATEGORY);
        if (!Array.isArray(categories[normalizedCategory])) {
            categories[normalizedCategory] = [];
        }

        const frontendModel = toFrontendModelFromLegacy(row);
        categories[normalizedCategory].push(frontendModel);

        modelsById.set(frontendModel.id, {
            id: row.ID,
            category: normalizedCategory,
            modelId: frontendModel.id,
            displayName: frontendModel.name,
            description: row.DESCRIPTION || null,
            contextWindow: row.CONTEXT_WINDOW || null,
            compatibleProviders: frontendModel.providers,
            timeoutMs: frontendModel.timeoutMs,
            supportsCaching: frontendModel.caching,
            modelAccessLevel: frontendModel.modelAccessLevel,
            inMultiplier: frontendModel.inMultiplier,
            outMultiplier: frontendModel.outMultiplier,
            cacheReadMultiplier: frontendModel.cacheReadMultiplier,
            cacheWriteMultiplier: frontendModel.cacheWriteMultiplier,
            supportsBatch: frontendModel.supportsBatch,
            supportedParameters: frontendModel.supportedParameters,
            parameterWhitelist: frontendModel.parameterWhitelist,
            availableTiers: frontendModel.availableTiers,
            deprecationDate: frontendModel.deprecationDate,
            aliases: [],
            routes: []
        });
    }

    return {
        loadedAt: Date.now(),
        categories,
        modelsById,
        aliasesById: new Map(),
        canonicalByDbId: new Map()
    };
}

async function loadCatalogSnapshot() {
    if (!isDbConfigured()) {
        throw createError('DB_NOT_CONFIGURED', 'Database is not configured.');
    }

    try {
        return await loadCanonicalCatalogSnapshot();
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    try {
        return await loadLegacyCatalogSnapshot();
    } catch (error) {
        if (isMissingTableError(error)) {
            throw createError('MODEL_CATALOG_TABLE_MISSING', 'Model catalog tables are missing. Run migrations first.');
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

async function loadCanonicalMappingSnapshot() {
    const result = await executeQuery(`
        SELECT
            cm.model_slug AS model_id,
            route.id,
            route.canonical_model_id,
            LOWER(route.provider_name) AS provider_name,
            route.provider_model_id,
            route.provider_context_window AS context_window,
            route.timeout_ms,
            route.priority,
            route.supports_batch,
            route.supports_caching,
            route.in_multiplier,
            route.out_multiplier,
            route.cache_read_multiplier,
            route.cache_write_multiplier,
            route.metadata_json,
            route.route_label,
            NULL AS deprecation_date,
            route.expires_at,
            cm.context_window AS default_context_window,
            cm.timeout_ms AS model_timeout_ms,
            cm.in_multiplier AS model_in_multiplier,
            cm.out_multiplier AS model_out_multiplier,
            cm.cache_read_multiplier AS model_cache_read_multiplier,
            cm.cache_write_multiplier AS model_cache_write_multiplier
        FROM canonical_model_provider_routes route
        JOIN canonical_models cm ON cm.id = route.canonical_model_id
        WHERE route.is_active = 1
          AND cm.is_active = 1
          AND (route.expires_at IS NULL OR route.expires_at > CURRENT_TIMESTAMP)
          AND (cm.expires_at IS NULL OR cm.expires_at > CURRENT_TIMESTAMP)
          AND (cm.deprecates_at IS NULL OR cm.deprecates_at > CURRENT_TIMESTAMP)
        ORDER BY cm.model_slug ASC,
                 LOWER(route.provider_name) ASC,
                 route.priority DESC,
                 route.provider_context_window ASC NULLS LAST,
                 route.id ASC
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
            canonicalModelId: row.CANONICAL_MODEL_ID,
            modelId,
            providerName,
            providerModelId,
            backendModelId: providerModelId,
            providerContextWindow: row.CONTEXT_WINDOW || null,
            globalContextWindow: row.DEFAULT_CONTEXT_WINDOW || null,
            timeoutMs: row.TIMEOUT_MS == null ? (row.MODEL_TIMEOUT_MS == null ? null : Number(row.MODEL_TIMEOUT_MS)) : Number(row.TIMEOUT_MS),
            priority: Number(row.PRIORITY || 0),
            supportsBatch: row.SUPPORTS_BATCH === 1,
            supportsCaching: row.SUPPORTS_CACHING === 1,
            metadataJson: row.METADATA_JSON || null,
            routeLabel: row.ROUTE_LABEL || null,
            mappingMultipliers: {
                inMultiplier: row.IN_MULTIPLIER == null ? (row.MODEL_IN_MULTIPLIER == null ? 1.0 : Number(row.MODEL_IN_MULTIPLIER)) : Number(row.IN_MULTIPLIER),
                outMultiplier: row.OUT_MULTIPLIER == null ? (row.MODEL_OUT_MULTIPLIER == null ? 1.0 : Number(row.MODEL_OUT_MULTIPLIER)) : Number(row.OUT_MULTIPLIER),
                cacheReadMultiplier: row.CACHE_READ_MULTIPLIER == null ? (row.MODEL_CACHE_READ_MULTIPLIER == null ? 1.0 : Number(row.MODEL_CACHE_READ_MULTIPLIER)) : Number(row.CACHE_READ_MULTIPLIER),
                cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER == null ? (row.MODEL_CACHE_WRITE_MULTIPLIER == null ? 1.0 : Number(row.MODEL_CACHE_WRITE_MULTIPLIER)) : Number(row.CACHE_WRITE_MULTIPLIER)
            }
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
}

async function loadLegacyMappingSnapshot() {
    const result = await executeQuery(`
        SELECT
            m.id,
            m.model_catalog_id,
            LOWER(m.provider_name) AS provider_name,
            m.provider_model_id,
            m.backend_model_id,
            m.provider_context_window,
            m.priority,
            m.metadata_json,
            m.mapping_multipliers,
            m.is_active,
            c.model_id,
            c.context_window
        FROM model_provider_mappings m
        JOIN model_catalog c
          ON c.id = m.model_catalog_id
        WHERE m.is_active = 1
          AND c.is_active = 1
          AND (c.deprecates_at IS NULL OR c.deprecates_at > CURRENT_TIMESTAMP)
          AND (c.deprecation_date IS NULL OR c.deprecation_date > CURRENT_TIMESTAMP)
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
        const providerModelId = String(row.BACKEND_MODEL_ID || row.PROVIDER_MODEL_ID || '').trim();

        if (!modelId || !providerName || !providerModelId) {
            continue;
        }

        const mapping = {
            id: row.ID,
            modelCatalogId: row.MODEL_CATALOG_ID,
            modelId,
            providerName,
            providerModelId,
            backendModelId: row.BACKEND_MODEL_ID || row.PROVIDER_MODEL_ID || null,
            providerContextWindow: row.PROVIDER_CONTEXT_WINDOW || null,
            globalContextWindow: row.CONTEXT_WINDOW || null,
            priority: Number(row.PRIORITY || 0),
            metadataJson: row.METADATA_JSON || null,
            mappingMultipliers: parseJsonObject(row.MAPPING_MULTIPLIERS, null)
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
}

async function loadMappingSnapshot() {
    if (!isDbConfigured()) {
        throw createError('DB_NOT_CONFIGURED', 'Database is not configured.');
    }

    try {
        return await loadCanonicalMappingSnapshot();
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    try {
        return await loadLegacyMappingSnapshot();
    } catch (error) {
        if (isMissingTableError(error)) {
            throw createError('MODEL_PROVIDER_MAPPINGS_TABLE_MISSING', 'Model provider mapping tables are missing. Run migrations first.');
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

export async function mapProviderCandidatesForModel(modelId, providerCandidates, options = {}) {
    const normalizedModelId = String(modelId || '').trim();
    const requestedContextWindow = toNumberOrNull(options.requestedContextWindow);

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

        const effectiveContextWindow = mapping.providerContextWindow || model.contextWindow || null;
        const numericContextWindow = toNumberOrNull(effectiveContextWindow);

        if (requestedContextWindow != null && numericContextWindow != null && numericContextWindow < requestedContextWindow) {
            continue;
        }

        mappedCandidates.push({
            ...candidate,
            upstreamModel: mapping.providerModelId,
            backendModelId: mapping.backendModelId || mapping.providerModelId,
            globalModelId: model.modelId,
            modelCatalogId: model.id,
            mappingId: mapping.id,
            effectiveContextWindow,
            timeoutMs: mapping.timeoutMs || model.timeoutMs || null,
            mappingMultipliers: mapping.mappingMultipliers || null,
            routeLabel: mapping.routeLabel || null
        });
    }

    mappedCandidates.sort((a, b) => {
        const aContext = toNumberOrDefault(a.effectiveContextWindow, Number.MAX_SAFE_INTEGER);
        const bContext = toNumberOrDefault(b.effectiveContextWindow, Number.MAX_SAFE_INTEGER);
        if (aContext !== bContext) return aContext - bContext;

        const aPriority = toNumberOrDefault(a.priority, 0);
        const bPriority = toNumberOrDefault(b.priority, 0);
        return bPriority - aPriority;
    });

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
