/**
 * /api/admin/catalog
 * Unified admin CRUD for canonical models, provider routes, aliases, and
 * compatibility fallback to legacy model_catalog/model_provider_mappings.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { invalidateModelCatalogCache } from '../../lib/model-catalog.js';
import { getSupportedProviderNames } from '../../lib/provider-registry.js';

const ALLOWED_CATEGORIES = ['text', 'image', 'video', 'audio', 'transcription'];

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

function safeJson(val, fallback = null) {
    try { return JSON.parse(val); } catch { return fallback; }
}

function toJsonStr(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') {
        try {
            JSON.parse(val);
            return val;
        } catch {
            return JSON.stringify(val);
        }
    }
    return JSON.stringify(val);
}

function parseDateOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function isUniqueConstraintError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00001') || message.includes('unique constraint');
}

function normalizeCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized;
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeBooleanFlag(value, fallback = false) {
    if (value === undefined) return fallback;
    return value ? 1 : 0;
}

function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function normalizeWhitelist(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const normalized = {};

    for (const [key, rawValues] of Object.entries(value)) {
        const paramName = normalizeString(key);
        if (!paramName) continue;

        const values = Array.isArray(rawValues)
            ? rawValues.map(item => String(item || '').trim()).filter(Boolean)
            : [];

        if (values.length > 0) {
            normalized[paramName] = Array.from(new Set(values));
        }
    }

    return normalized;
}

function normalizeRoutes(routes) {
    if (!Array.isArray(routes)) return [];

    return routes
        .map(route => ({
            id: route?.id ? Number(route.id) : null,
            providerName: normalizeString(route?.providerName).toLowerCase(),
            providerModelId: normalizeString(route?.providerModelId || route?.backendModelId),
            backendModelId: normalizeString(route?.backendModelId || route?.providerModelId),
            routeLabel: normalizeString(route?.routeLabel) || null,
            contextWindow: normalizeNumber(route?.contextWindow ?? route?.providerContextWindow, null),
            timeoutMs: normalizeNumber(route?.timeoutMs, null),
            priority: normalizeNumber(route?.priority, 0),
            supportsBatch: !!route?.supportsBatch,
            supportsCaching: !!route?.supportsCaching,
            inMultiplier: normalizeNumber(route?.inMultiplier, null),
            outMultiplier: normalizeNumber(route?.outMultiplier, null),
            cacheReadMultiplier: normalizeNumber(route?.cacheReadMultiplier, null),
            cacheWriteMultiplier: normalizeNumber(route?.cacheWriteMultiplier, null),
            metadata: route?.metadata && typeof route.metadata === 'object' && !Array.isArray(route.metadata) ? route.metadata : null,
            allowedParams: route?.allowedParams && typeof route.allowedParams === 'object' && !Array.isArray(route.allowedParams) ? route.allowedParams : null,
            expiresAt: parseDateOrNull(route?.expiresAt),
            deprecationDate: parseDateOrNull(route?.deprecationDate),
            deprecationNote: normalizeString(route?.deprecationNote) || null,
            isActive: route?.isActive !== false
        }))
        .filter(route => route.providerName && route.providerModelId);
}

function normalizeAliases(aliases) {
    if (!Array.isArray(aliases)) return [];

    return aliases
        .map(alias => ({
            id: alias?.id ? Number(alias.id) : null,
            aliasModelId: normalizeString(alias?.aliasModelId || alias?.modelId),
            isPrimaryAlias: !!alias?.isPrimaryAlias,
            notes: normalizeString(alias?.notes) || null,
            isActive: alias?.isActive !== false
        }))
        .filter(alias => alias.aliasModelId);
}

function normalizeModelPayload(body) {
    const category = normalizeCategory(body.category);
    const modelId = normalizeString(body.modelId);
    const displayName = normalizeString(body.displayName);

    return {
        category,
        modelId,
        displayName,
        description: normalizeString(body.description) || null,
        contextWindow: normalizeNumber(body.contextWindow, null),
        capabilities: normalizeArray(body.capabilities),
        tags: normalizeArray(body.tags),
        supportedParameters: normalizeArray(body.supportedParameters),
        parameterWhitelist: normalizeWhitelist(body.parameterWhitelist),
        availableTiers: normalizeArray(body.availableTiers),
        inMultiplier: normalizeNumber(body.inMultiplier, 1.0),
        outMultiplier: normalizeNumber(body.outMultiplier, 1.0),
        cacheReadMultiplier: normalizeNumber(body.cacheReadMultiplier, 1.0),
        cacheWriteMultiplier: normalizeNumber(body.cacheWriteMultiplier, 1.0),
        supportsCaching: !!body.supportsCaching,
        supportsBatch: !!body.supportsBatch,
        timeoutMs: normalizeNumber(body.timeoutMs, 60000),
        deprecationDate: parseDateOrNull(body.deprecationDate),
        deprecationNote: normalizeString(body.deprecationNote) || null,
        expiresAt: parseDateOrNull(body.expiresAt),
        isActive: body.isActive !== false,
        aliasFor: normalizeString(body.aliasFor) || null,
        targetTier: normalizeString(body.targetTier) || null,
        providersConfig: Array.isArray(body.providersConfig) ? body.providersConfig : []
    };
}

function validateModelPayload(payload) {
    if (!payload.modelId || !payload.displayName || !payload.category) {
        return 'modelId, displayName, category required';
    }
    if (!ALLOWED_CATEGORIES.includes(payload.category)) {
        return `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`;
    }
    return null;
}

async function canonicalTablesAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM canonical_models WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

async function fetchCanonicalModels(targetId = null) {
    const modelResult = await executeQuery(`
        SELECT
            cm.id,
            cm.category,
            NVL(cm.model_slug, cm.model_id) AS model_id,
            NVL(cm.display_name, cm.name) AS display_name,
            cm.description,
            NVL(cm.default_context_window, cm.context_window) AS default_context_window,
            cm.timeout_ms,
            cm.supports_caching,
            cm.supports_batch,
            cm.in_multiplier,
            cm.out_multiplier,
            cm.cache_read_multiplier,
            cm.cache_write_multiplier,
            NVL(cm.deprecates_at, cm.deprecation_date) AS deprecation_date,
            cm.deprecation_note,
            cm.expires_at,
            cm.is_active,
            cm.created_at,
            cm.updated_at,
            cm.created_by,
            cm.updated_by,
            cm.metadata_json
        FROM canonical_models cm
        WHERE cm.is_active = 1
          ${targetId ? 'AND cm.id = :targetId' : ''}
        ORDER BY cm.category ASC, NVL(cm.model_slug, cm.model_id) ASC
    `, targetId ? { targetId: Number(targetId) } : {});

    const models = modelResult.rows || [];
    if (models.length === 0) return targetId ? null : [];

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
                context_window,
                timeout_ms,
                priority,
                supports_batch,
                supports_caching,
                in_multiplier,
                out_multiplier,
                cache_read_multiplier,
                cache_write_multiplier,
                metadata_json,
                expires_at,
                deprecation_date,
                deprecation_note,
                is_active
            FROM canonical_model_provider_routes
            WHERE canonical_model_id IN (${placeholders})
            ORDER BY canonical_model_id ASC, priority DESC, context_window ASC NULLS LAST, id ASC
        `, bindVars),
        executeQuery(`
            SELECT canonical_route_id, param_name, support_mode, allowed_value
            FROM canonical_model_route_params
            WHERE canonical_route_id IN (
                SELECT id FROM canonical_model_provider_routes WHERE canonical_model_id IN (${placeholders})
            )
              AND is_active = 1
            ORDER BY canonical_route_id ASC, param_name ASC, sort_order ASC, allowed_value ASC
        `, bindVars),
        executeQuery(`
            SELECT id, canonical_model_id, alias_model_id, is_primary_alias, notes, is_active
            FROM canonical_model_aliases
            WHERE canonical_model_id IN (${placeholders})
            ORDER BY canonical_model_id ASC, is_primary_alias DESC, alias_model_id ASC
        `, bindVars)
    ]);

    const tiersByModel = new Map();
    for (const row of tierResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!tiersByModel.has(modelId)) tiersByModel.set(modelId, []);
        const tierName = normalizeString(row.TIER_NAME);
        if (tierName && !tiersByModel.get(modelId).includes(tierName)) {
            tiersByModel.get(modelId).push(tierName);
        }
    }

    const paramsByModel = new Map();
    for (const row of paramResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!paramsByModel.has(modelId)) paramsByModel.set(modelId, []);
        const paramName = normalizeString(row.PARAM_NAME);
        if (paramName && !paramsByModel.get(modelId).includes(paramName)) {
            paramsByModel.get(modelId).push(paramName);
        }
    }

    const whitelistByModel = new Map();
    for (const row of whitelistResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!whitelistByModel.has(modelId)) whitelistByModel.set(modelId, {});
        const paramName = normalizeString(row.PARAM_NAME);
        const allowedValue = normalizeString(row.ALLOWED_VALUE);
        if (!paramName || !allowedValue) continue;
        if (!Array.isArray(whitelistByModel.get(modelId)[paramName])) {
            whitelistByModel.get(modelId)[paramName] = [];
        }
        if (!whitelistByModel.get(modelId)[paramName].includes(allowedValue)) {
            whitelistByModel.get(modelId)[paramName].push(allowedValue);
        }
    }

    const routeParamsByRoute = new Map();
    for (const row of routeParamResult.rows || []) {
        const routeId = row.CANONICAL_ROUTE_ID;
        if (!routeParamsByRoute.has(routeId)) routeParamsByRoute.set(routeId, {});
        const paramName = normalizeString(row.PARAM_NAME);
        const supportMode = normalizeString(row.SUPPORT_MODE || 'inherit').toLowerCase();
        const allowedValue = normalizeString(row.ALLOWED_VALUE);
        if (!paramName) continue;
        if (!routeParamsByRoute.get(routeId)[paramName]) {
            routeParamsByRoute.get(routeId)[paramName] = { supportMode, allowedValues: [] };
        }
        routeParamsByRoute.get(routeId)[paramName].supportMode = supportMode;
        if (allowedValue && !routeParamsByRoute.get(routeId)[paramName].allowedValues.includes(allowedValue)) {
            routeParamsByRoute.get(routeId)[paramName].allowedValues.push(allowedValue);
        }
    }

    const routesByModel = new Map();
    for (const row of routeResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!routesByModel.has(modelId)) routesByModel.set(modelId, []);
        routesByModel.get(modelId).push({
            id: row.ID,
            providerName: normalizeString(row.PROVIDER_NAME).toLowerCase(),
            providerModelId: normalizeString(row.PROVIDER_MODEL_ID),
            backendModelId: normalizeString(row.PROVIDER_MODEL_ID),
            routeLabel: row.ROUTE_LABEL || null,
            contextWindow: row.CONTEXT_WINDOW,
            timeoutMs: row.TIMEOUT_MS,
            priority: row.PRIORITY,
            supportsBatch: row.SUPPORTS_BATCH === 1,
            supportsCaching: row.SUPPORTS_CACHING === 1,
            inMultiplier: row.IN_MULTIPLIER,
            outMultiplier: row.OUT_MULTIPLIER,
            cacheReadMultiplier: row.CACHE_READ_MULTIPLIER,
            cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER,
            metadata: safeJson(row.METADATA_JSON, null),
            allowedParams: routeParamsByRoute.get(row.ID) || null,
            expiresAt: row.EXPIRES_AT,
            deprecationDate: row.DEPRECATION_DATE,
            deprecationNote: row.DEPRECATION_NOTE || null,
            isActive: row.IS_ACTIVE === 1
        });
    }

    const aliasesByModel = new Map();
    for (const row of aliasResult.rows || []) {
        const modelId = row.CANONICAL_MODEL_ID;
        if (!aliasesByModel.has(modelId)) aliasesByModel.set(modelId, []);
        aliasesByModel.get(modelId).push({
            id: row.ID,
            aliasModelId: normalizeString(row.ALIAS_MODEL_ID),
            isPrimaryAlias: row.IS_PRIMARY_ALIAS === 1,
            notes: row.NOTES || null,
            isActive: row.IS_ACTIVE === 1
        });
    }

    const combined = models.map(row => {
        const metadata = safeJson(row.METADATA_JSON, {});
        const routes = routesByModel.get(row.ID) || [];
        const compatibleProviders = Array.from(new Set(routes.map(route => route.providerName).filter(Boolean)));

        return {
            id: row.ID,
            category: row.CATEGORY,
            modelId: row.MODEL_ID,
            displayName: row.DISPLAY_NAME,
            description: row.DESCRIPTION,
            contextWindow: row.DEFAULT_CONTEXT_WINDOW,
            timeoutMs: row.TIMEOUT_MS,
            capabilities: Array.isArray(metadata?.capabilities) ? metadata.capabilities : [],
            tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
            compatibleProviders,
            supportedParameters: paramsByModel.get(row.ID) || [],
            parameterWhitelist: whitelistByModel.get(row.ID) || {},
            availableTiers: tiersByModel.get(row.ID) || [],
            inMultiplier: row.IN_MULTIPLIER,
            outMultiplier: row.OUT_MULTIPLIER,
            cacheReadMultiplier: row.CACHE_READ_MULTIPLIER,
            cacheWriteMultiplier: row.CACHE_WRITE_MULTIPLIER,
            supportsCaching: row.SUPPORTS_CACHING === 1,
            supportsBatch: row.SUPPORTS_BATCH === 1,
            deprecationDate: row.DEPRECATION_DATE,
            deprecationNote: row.DEPRECATION_NOTE,
            expiresAt: row.EXPIRES_AT,
            isActive: row.IS_ACTIVE === 1,
            createdAt: row.CREATED_AT,
            updatedAt: row.UPDATED_AT,
            createdBy: row.CREATED_BY,
            updatedBy: row.UPDATED_BY,
            aliases: aliasesByModel.get(row.ID) || [],
            routes,
            mappings: routes
        };
    });

    return targetId ? combined[0] || null : combined;
}

async function fetchLegacyModels(targetId = null) {
    const modelResult = await executeQuery(`
        SELECT
            mc.id, mc.category, mc.model_id, mc.display_name, mc.description,
            mc.context_window, mc.timeout_ms, mc.capabilities_json, mc.tags_json,
            mc.compatible_providers_json,
            mc.supported_parameters, mc.parameter_whitelist, mc.available_tiers,
            mc.in_multiplier, mc.out_multiplier,
            mc.cache_read_multiplier, mc.cache_write_multiplier,
            mc.supports_caching, mc.supports_batch,
            mc.deprecation_date, mc.deprecation_note,
            mc.is_active, mc.created_at, mc.updated_at,
            mc.created_by, mc.updated_by
        FROM model_catalog mc
        WHERE mc.is_active = 1
          ${targetId ? 'AND mc.id = :targetId' : ''}
        ORDER BY mc.category ASC, mc.model_id ASC
    `, targetId ? { targetId: Number(targetId) } : {});

    const models = modelResult.rows || [];
    if (models.length === 0) return targetId ? null : [];

    const ids = models.map(m => m.ID);
    const idPlaceholders = ids.map((_, i) => `:id${i}`).join(',');
    const bindVars = Object.fromEntries(ids.map((idVal, i) => [`id${i}`, idVal]));

    const mappingResult = await executeQuery(`
        SELECT
            mpm.id, mpm.model_catalog_id, mpm.provider_name,
            mpm.backend_model_id, mpm.provider_context_window,
            mpm.priority, mpm.is_active, mpm.supports_batch,
            mpm.mapping_multipliers, mpm.allowed_params_json,
            mpm.metadata_json, mpm.created_at, mpm.updated_at
        FROM model_provider_mappings mpm
        WHERE mpm.model_catalog_id IN (${idPlaceholders})
        ORDER BY mpm.priority DESC, mpm.id ASC
    `, bindVars);

    const mappingsByModel = {};
    for (const mapping of mappingResult.rows || []) {
        const mid = mapping.MODEL_CATALOG_ID;
        if (!mappingsByModel[mid]) mappingsByModel[mid] = [];
        mappingsByModel[mid].push({
            id: mapping.ID,
            providerName: mapping.PROVIDER_NAME,
            providerModelId: mapping.BACKEND_MODEL_ID,
            backendModelId: mapping.BACKEND_MODEL_ID,
            providerContextWindow: mapping.PROVIDER_CONTEXT_WINDOW,
            contextWindow: mapping.PROVIDER_CONTEXT_WINDOW,
            priority: mapping.PRIORITY,
            isActive: mapping.IS_ACTIVE === 1,
            supportsBatch: mapping.SUPPORTS_BATCH === 1,
            mappingMultipliers: safeJson(mapping.MAPPING_MULTIPLIERS, null),
            allowedParams: safeJson(mapping.ALLOWED_PARAMS_JSON, null),
            metadata: safeJson(mapping.METADATA_JSON, null),
            createdAt: mapping.CREATED_AT,
            updatedAt: mapping.UPDATED_AT
        });
    }

    const combined = models.map(m => ({
        id: m.ID,
        category: m.CATEGORY,
        modelId: m.MODEL_ID,
        displayName: m.DISPLAY_NAME,
        description: m.DESCRIPTION,
        contextWindow: m.CONTEXT_WINDOW,
        timeoutMs: m.TIMEOUT_MS,
        capabilities: safeJson(m.CAPABILITIES_JSON, []),
        tags: safeJson(m.TAGS_JSON, []),
        compatibleProviders: safeJson(m.COMPATIBLE_PROVIDERS_JSON, []),
        supportedParameters: safeJson(m.SUPPORTED_PARAMETERS, []),
        parameterWhitelist: safeJson(m.PARAMETER_WHITELIST, {}),
        availableTiers: safeJson(m.AVAILABLE_TIERS, []),
        inMultiplier: m.IN_MULTIPLIER,
        outMultiplier: m.OUT_MULTIPLIER,
        cacheReadMultiplier: m.CACHE_READ_MULTIPLIER,
        cacheWriteMultiplier: m.CACHE_WRITE_MULTIPLIER,
        supportsCaching: m.SUPPORTS_CACHING === 1,
        supportsBatch: m.SUPPORTS_BATCH === 1,
        deprecationDate: m.DEPRECATION_DATE,
        deprecationNote: m.DEPRECATION_NOTE,
        isActive: m.IS_ACTIVE === 1,
        createdAt: m.CREATED_AT,
        updatedAt: m.UPDATED_AT,
        createdBy: m.CREATED_BY,
        updatedBy: m.UPDATED_BY,
        aliases: [],
        routes: mappingsByModel[m.ID] || [],
        mappings: mappingsByModel[m.ID] || []
    }));

    return targetId ? combined[0] || null : combined;
}

async function replaceCanonicalModelRelations(modelId, payload) {
    await executeQuery(`DELETE FROM canonical_model_tiers WHERE canonical_model_id = :id`, { id: modelId });
    await executeQuery(`DELETE FROM canonical_model_supported_params WHERE canonical_model_id = :id`, { id: modelId });
    await executeQuery(`DELETE FROM canonical_model_param_whitelist WHERE canonical_model_id = :id`, { id: modelId });
    await executeQuery(`DELETE FROM canonical_model_aliases WHERE canonical_model_id = :id`, { id: modelId });

    const existingRoutes = await executeQuery(
        `SELECT id FROM canonical_model_provider_routes WHERE canonical_model_id = :id`,
        { id: modelId }
    );
    for (const row of existingRoutes.rows || []) {
        await executeQuery(`DELETE FROM canonical_model_route_params WHERE canonical_route_id = :routeId`, { routeId: row.ID });
    }
    await executeQuery(`DELETE FROM canonical_model_provider_routes WHERE canonical_model_id = :id`, { id: modelId });

    for (const tierName of payload.availableTiers) {
        await executeQuery(`
            INSERT INTO canonical_model_tiers (canonical_model_id, tier_definition_id, is_active)
            SELECT :modelId, td.id, 1
            FROM tier_definitions td
            WHERE td.tier_name = :tierName
              AND td.is_active = 1
        `, { modelId, tierName });
    }

    let paramSort = 0;
    for (const paramName of payload.supportedParameters) {
        await executeQuery(`
            INSERT INTO canonical_model_supported_params (
                canonical_model_id, param_name, sort_order, is_active
            ) VALUES (
                :modelId, :paramName, :sortOrder, 1
            )
        `, {
            modelId,
            paramName,
            sortOrder: paramSort++
        });
    }

    for (const [paramName, values] of Object.entries(payload.parameterWhitelist)) {
        let whitelistSort = 0;
        for (const allowedValue of values) {
            await executeQuery(`
                INSERT INTO canonical_model_param_whitelist (
                    canonical_model_id, param_name, allowed_value, sort_order, is_active
                ) VALUES (
                    :modelId, :paramName, :allowedValue, :sortOrder, 1
                )
            `, {
                modelId,
                paramName,
                allowedValue,
                sortOrder: whitelistSort++
            });
        }
    }

    const supportedProviders = getSupportedProviderNames();
    let routeIndex = 0;
    for (const route of payload.routes) {
        if (!supportedProviders.includes(route.providerName)) {
            throw new Error(`Invalid providerName: ${route.providerName}`);
        }

        const routeInsert = await executeQuery(`
            INSERT INTO canonical_model_provider_routes (
                canonical_model_id,
                provider_name,
                provider_model_id,
                route_label,
                context_window,
                timeout_ms,
                priority,
                supports_batch,
                supports_caching,
                in_multiplier,
                out_multiplier,
                cache_read_multiplier,
                cache_write_multiplier,
                metadata_json,
                expires_at,
                deprecation_date,
                deprecation_note,
                is_active,
                created_by,
                updated_by
            ) VALUES (
                :canonical_model_id,
                :provider_name,
                :provider_model_id,
                :route_label,
                :context_window,
                :timeout_ms,
                :priority,
                :supports_batch,
                :supports_caching,
                :in_multiplier,
                :out_multiplier,
                :cache_read_multiplier,
                :cache_write_multiplier,
                :metadata_json,
                :expires_at,
                :deprecation_date,
                :deprecation_note,
                :is_active,
                :created_by,
                :updated_by
            ) RETURNING id INTO :new_id
        `, {
            canonical_model_id: modelId,
            provider_name: route.providerName,
            provider_model_id: route.providerModelId,
            route_label: route.routeLabel,
            context_window: route.contextWindow,
            timeout_ms: route.timeoutMs,
            priority: route.priority ?? routeIndex,
            supports_batch: route.supportsBatch ? 1 : 0,
            supports_caching: route.supportsCaching ? 1 : 0,
            in_multiplier: route.inMultiplier,
            out_multiplier: route.outMultiplier,
            cache_read_multiplier: route.cacheReadMultiplier,
            cache_write_multiplier: route.cacheWriteMultiplier,
            metadata_json: toJsonStr(route.metadata),
            expires_at: route.expiresAt,
            deprecation_date: route.deprecationDate,
            deprecation_note: route.deprecationNote,
            is_active: route.isActive ? 1 : 0,
            created_by: 'admin',
            updated_by: 'admin',
            new_id: { dir: 'out', type: 'NUMBER' }
        });

        const routeId = routeInsert?.outBinds?.new_id?.[0];
        const allowedParams = route.allowedParams && typeof route.allowedParams === 'object' ? route.allowedParams : {};
        for (const [paramName, config] of Object.entries(allowedParams)) {
            const supportMode = normalizeString(config?.supportMode || 'inherit').toLowerCase() || 'inherit';
            const allowedValues = Array.isArray(config?.allowedValues) ? config.allowedValues : [];

            if (allowedValues.length === 0) {
                await executeQuery(`
                    INSERT INTO canonical_model_route_params (
                        canonical_route_id, param_name, support_mode, allowed_value, sort_order, is_active
                    ) VALUES (
                        :routeId, :paramName, :supportMode, NULL, 0, 1
                    )
                `, { routeId, paramName, supportMode });
                continue;
            }

            let routeParamSort = 0;
            for (const allowedValue of allowedValues) {
                await executeQuery(`
                    INSERT INTO canonical_model_route_params (
                        canonical_route_id, param_name, support_mode, allowed_value, sort_order, is_active
                    ) VALUES (
                        :routeId, :paramName, :supportMode, :allowedValue, :sortOrder, 1
                    )
                `, {
                    routeId,
                    paramName,
                    supportMode,
                    allowedValue: normalizeString(allowedValue),
                    sortOrder: routeParamSort++
                });
            }
        }

        routeIndex += 1;
    }

    let aliasIndex = 0;
    for (const alias of payload.aliases) {
        await executeQuery(`
            INSERT INTO canonical_model_aliases (
                canonical_model_id, alias_model_id, is_primary_alias, notes, sort_order, is_active
            ) VALUES (
                :canonical_model_id, :alias_model_id, :is_primary_alias, :notes, :sort_order, :is_active
            )
        `, {
            canonical_model_id: modelId,
            alias_model_id: alias.aliasModelId,
            is_primary_alias: alias.isPrimaryAlias ? 1 : 0,
            notes: alias.notes,
            sort_order: aliasIndex++,
            is_active: alias.isActive ? 1 : 0
        });
    }
}

async function handleCanonicalGet(req, res) {
    const { modelId, id } = req.query;
    const targetId = id || modelId;
    const data = await fetchCanonicalModels(targetId ? Number(targetId) : null);
    return res.status(200).json(data);
}

async function handleLegacyGet(req, res) {
    const { modelId, id } = req.query;
    const targetId = id || modelId;
    const data = await fetchLegacyModels(targetId ? Number(targetId) : null);
    return res.status(200).json(data);
}

async function handleCanonicalPost(req, res, session) {
    const payload = normalizeModelPayload(req.body || {});
    const validationError = validateModelPayload(payload);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const insertResult = await executeQuery(`
        INSERT INTO canonical_models (
            category,
            model_id,
            model_slug,
            name,
            display_name,
            description,
            context_window,
            default_context_window,
            timeout_ms,
            supports_caching,
            supports_batch,
            in_multiplier,
            out_multiplier,
            cache_read_multiplier,
            cache_write_multiplier,
            deprecation_date,
            deprecates_at,
            deprecation_note,
            expires_at,
            metadata_json,
            is_active,
            created_by,
            updated_by
        ) VALUES (
            :category,
            :model_id,
            :model_id,
            :display_name,
            :display_name,
            :description,
            :default_context_window,
            :default_context_window,
            :timeout_ms,
            :supports_caching,
            :supports_batch,
            :in_multiplier,
            :out_multiplier,
            :cache_read_multiplier,
            :cache_write_multiplier,
            :deprecation_date,
            :deprecation_date,
            :deprecation_note,
            :expires_at,
            :metadata_json,
            :is_active,
            :created_by,
            :updated_by
        ) RETURNING id INTO :new_id
    `, {
        category: payload.category,
        model_id: payload.modelId,
        display_name: payload.displayName,
        description: payload.description,
        default_context_window: payload.contextWindow,
        timeout_ms: payload.timeoutMs,
        supports_caching: payload.supportsCaching ? 1 : 0,
        supports_batch: payload.supportsBatch ? 1 : 0,
        in_multiplier: payload.inMultiplier,
        out_multiplier: payload.outMultiplier,
        cache_read_multiplier: payload.cacheReadMultiplier,
        cache_write_multiplier: payload.cacheWriteMultiplier,
        deprecation_date: payload.deprecationDate,
        deprecation_note: payload.deprecationNote,
        expires_at: payload.expiresAt,
        metadata_json: toJsonStr({ capabilities: payload.capabilities, tags: payload.tags }),
        is_active: payload.isActive ? 1 : 0,
        created_by: session.githubUsername || 'admin',
        updated_by: session.githubUsername || 'admin',
        new_id: { dir: 'out', type: 'NUMBER' }
    });

    const newModelId = insertResult?.outBinds?.new_id?.[0];
    await replaceCanonicalModelRelations(newModelId, payload);
    await invalidateModelCatalogCache();
    return res.status(201).json({ success: true, id: newModelId });
}

async function handleLegacyPost(req, res, session) {
    const body = req.body || {};
    if (!body.modelId || !body.displayName || !body.category) {
        return res.status(400).json({ error: 'modelId, displayName, category required' });
    }
    if (!ALLOWED_CATEGORIES.includes(body.category)) {
        return res.status(400).json({ error: 'Invalid category', allowed: ALLOWED_CATEGORIES });
    }

    const deprecationDate = parseDateOrNull(body.deprecationDate);

    const insertResult = await executeQuery(`
        INSERT INTO model_catalog (
            category, model_id, display_name, description, context_window,
            timeout_ms, capabilities_json, tags_json, compatible_providers_json,
            supported_parameters, parameter_whitelist, available_tiers,
            in_multiplier, out_multiplier,
            cache_read_multiplier, cache_write_multiplier,
            supports_caching, supports_batch,
            deprecation_date, deprecation_note,
            is_active, created_by, updated_by
        ) VALUES (
            :category, :model_id, :display_name, :description, :context_window,
            :timeout_ms, :capabilities_json, :tags_json, :compatible_providers_json,
            :supported_parameters, :parameter_whitelist, :available_tiers,
            :in_mult, :out_mult,
            :cr_mult, :cw_mult,
            :supports_caching, :supports_batch,
            :deprecation_date, :deprecation_note,
            :is_active, :created_by, :updated_by
        ) RETURNING id INTO :new_id
    `, {
        category: body.category,
        model_id: body.modelId,
        display_name: body.displayName,
        description: body.description || null,
        context_window: body.contextWindow || null,
        timeout_ms: Number(body.timeoutMs) || 60000,
        capabilities_json: toJsonStr(body.capabilities || []),
        tags_json: toJsonStr(body.tags || []),
        compatible_providers_json: toJsonStr(body.compatibleProviders || []),
        supported_parameters: toJsonStr(body.supportedParameters || []),
        parameter_whitelist: toJsonStr(body.parameterWhitelist || {}),
        available_tiers: toJsonStr(body.availableTiers || []),
        in_mult: Number(body.inMultiplier) || 1.0,
        out_mult: Number(body.outMultiplier) || 1.0,
        cr_mult: Number(body.cacheReadMultiplier) || 1.0,
        cw_mult: Number(body.cacheWriteMultiplier) || 1.0,
        supports_caching: body.supportsCaching ? 1 : 0,
        supports_batch: body.supportsBatch ? 1 : 0,
        deprecation_date: deprecationDate,
        deprecation_note: body.deprecationNote || null,
        is_active: body.isActive !== false ? 1 : 0,
        created_by: session.githubUsername || 'admin',
        updated_by: session.githubUsername || 'admin',
        new_id: { dir: 'out', type: 'NUMBER' }
    });

    const newModelId = insertResult?.outBinds?.new_id?.[0];
    const routes = normalizeRoutes(body.routes || (body.mapping ? [body.mapping] : []));
    const supportedProviders = getSupportedProviderNames();

    for (const route of routes) {
        if (!supportedProviders.includes(route.providerName)) {
            return res.status(400).json({ error: 'Invalid providerName', allowed: supportedProviders });
        }
        await executeQuery(`
            INSERT INTO model_provider_mappings (
                model_catalog_id, provider_name, backend_model_id,
                provider_context_window, priority, is_active, supports_batch,
                mapping_multipliers, allowed_params_json, created_by, updated_by
            ) VALUES (
                :model_catalog_id, :provider_name, :backend_model_id,
                :provider_ctx, :priority, :is_active, :supports_batch,
                :mapping_multipliers, :allowed_params, :created_by, :updated_by
            )
        `, {
            model_catalog_id: newModelId,
            provider_name: route.providerName,
            backend_model_id: route.backendModelId,
            provider_ctx: route.contextWindow || null,
            priority: Number(route.priority) || 0,
            is_active: route.isActive !== false ? 1 : 0,
            supports_batch: route.supportsBatch ? 1 : 0,
            mapping_multipliers: toJsonStr({
                inMultiplier: route.inMultiplier,
                outMultiplier: route.outMultiplier,
                cacheReadMultiplier: route.cacheReadMultiplier,
                cacheWriteMultiplier: route.cacheWriteMultiplier
            }),
            allowed_params: toJsonStr(route.allowedParams),
            created_by: session.githubUsername || 'admin',
            updated_by: session.githubUsername || 'admin'
        });
    }

    await invalidateModelCatalogCache();
    return res.status(201).json({ success: true, id: newModelId });
}

async function handleCanonicalPut(req, res, session) {
    const { id, ...body } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const payload = normalizeModelPayload(body);
    const validationError = validateModelPayload(payload);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    await executeQuery(`
        UPDATE canonical_models SET
            category = :category,
            model_id = :model_id,
            model_slug = :model_id,
            name = :display_name,
            display_name = :display_name,
            description = :description,
            context_window = :default_context_window,
            default_context_window = :default_context_window,
            timeout_ms = :timeout_ms,
            supports_caching = :supports_caching,
            supports_batch = :supports_batch,
            in_multiplier = :in_multiplier,
            out_multiplier = :out_multiplier,
            cache_read_multiplier = :cache_read_multiplier,
            cache_write_multiplier = :cache_write_multiplier,
            deprecation_date = :deprecation_date,
            deprecates_at = :deprecation_date,
            deprecation_note = :deprecation_note,
            expires_at = :expires_at,
            metadata_json = :metadata_json,
            is_active = :is_active,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = :updated_by
        WHERE id = :id
    `, {
        id,
        category: payload.category,
        model_id: payload.modelId,
        display_name: payload.displayName,
        description: payload.description,
        default_context_window: payload.contextWindow,
        timeout_ms: payload.timeoutMs,
        supports_caching: payload.supportsCaching ? 1 : 0,
        supports_batch: payload.supportsBatch ? 1 : 0,
        in_multiplier: payload.inMultiplier,
        out_multiplier: payload.outMultiplier,
        cache_read_multiplier: payload.cacheReadMultiplier,
        cache_write_multiplier: payload.cacheWriteMultiplier,
        deprecation_date: payload.deprecationDate,
        deprecation_note: payload.deprecationNote,
        expires_at: payload.expiresAt,
        metadata_json: toJsonStr({ capabilities: payload.capabilities, tags: payload.tags }),
        is_active: payload.isActive ? 1 : 0,
        updated_by: session.githubUsername || 'admin'
    });

    await replaceCanonicalModelRelations(id, payload);
    await invalidateModelCatalogCache();
    return res.status(200).json({ success: true });
}

async function handleLegacyPut(req, res, session) {
    const body = req.body || {};
    const { action } = req.query;
    const supportedProviders = getSupportedProviderNames();

    if (action === 'add-mapping') {
        const m = body;
        if (!m.modelCatalogId || !m.providerName || !m.backendModelId) {
            return res.status(400).json({ error: 'modelCatalogId, providerName, backendModelId required' });
        }
        if (!supportedProviders.includes(m.providerName)) {
            return res.status(400).json({ error: 'Invalid providerName', allowed: supportedProviders });
        }
        await executeQuery(`
            INSERT INTO model_provider_mappings (
                model_catalog_id, provider_name, backend_model_id,
                provider_context_window, priority, is_active, supports_batch,
                mapping_multipliers, allowed_params_json, created_by, updated_by
            ) VALUES (
                :model_catalog_id, :provider_name, :backend_model_id,
                :provider_ctx, :priority, :is_active, :supports_batch,
                :mapping_multipliers, :allowed_params, :created_by, :updated_by
            )
        `, {
            model_catalog_id: m.modelCatalogId,
            provider_name: m.providerName,
            backend_model_id: m.backendModelId,
            provider_ctx: m.providerContextWindow || m.contextWindow || null,
            priority: Number(m.priority) || 0,
            is_active: m.isActive !== false ? 1 : 0,
            supports_batch: m.supportsBatch ? 1 : 0,
            mapping_multipliers: toJsonStr(m.mappingMultipliers || null),
            allowed_params: toJsonStr(m.allowedParams || null),
            created_by: session.githubUsername || 'admin',
            updated_by: session.githubUsername || 'admin'
        });
        await invalidateModelCatalogCache();
        return res.status(200).json({ success: true });
    }

    if (action === 'update-mapping') {
        const m = body;
        if (!m.id) return res.status(400).json({ error: 'mapping id required' });
        if (m.providerName && !supportedProviders.includes(m.providerName)) {
            return res.status(400).json({ error: 'Invalid providerName', allowed: supportedProviders });
        }
        await executeQuery(`
            UPDATE model_provider_mappings SET
                provider_name = :provider_name,
                backend_model_id = :backend_model_id,
                provider_context_window = :provider_ctx,
                priority = :priority,
                is_active = :is_active,
                supports_batch = :supports_batch,
                mapping_multipliers = :mapping_multipliers,
                allowed_params_json = :allowed_params,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = :updated_by
            WHERE id = :id
        `, {
            id: m.id,
            provider_name: m.providerName,
            backend_model_id: m.backendModelId,
            provider_ctx: m.providerContextWindow || m.contextWindow || null,
            priority: Number(m.priority) || 0,
            is_active: m.isActive ? 1 : 0,
            supports_batch: m.supportsBatch ? 1 : 0,
            mapping_multipliers: toJsonStr(m.mappingMultipliers || null),
            allowed_params: toJsonStr(m.allowedParams || null),
            updated_by: session.githubUsername || 'admin'
        });
        await invalidateModelCatalogCache();
        return res.status(200).json({ success: true });
    }

    if (action === 'delete-mapping') {
        const { mappingId } = body;
        if (!mappingId) return res.status(400).json({ error: 'mappingId required' });
        await executeQuery(`
            UPDATE model_provider_mappings
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = :updated_by
            WHERE id = :id
        `, { id: mappingId, updated_by: session.githubUsername || 'admin' });
        await invalidateModelCatalogCache();
        return res.status(200).json({ success: true });
    }

    const { id, ...data } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const deprecationDate = parseDateOrNull(data.deprecationDate);

    await executeQuery(`
        UPDATE model_catalog SET
            category = :category,
            model_id = :model_id,
            display_name = :display_name,
            description = :description,
            context_window = :context_window,
            timeout_ms = :timeout_ms,
            capabilities_json = :capabilities_json,
            tags_json = :tags_json,
            compatible_providers_json = :compatible_providers_json,
            supported_parameters = :supported_parameters,
            parameter_whitelist = :parameter_whitelist,
            available_tiers = :available_tiers,
            in_multiplier = :in_mult,
            out_multiplier = :out_mult,
            cache_read_multiplier = :cr_mult,
            cache_write_multiplier = :cw_mult,
            supports_caching = :supports_caching,
            supports_batch = :supports_batch,
            deprecation_date = :deprecation_date,
            deprecation_note = :deprecation_note,
            is_active = :is_active,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = :updated_by
        WHERE id = :id
    `, {
        id,
        category: data.category,
        model_id: data.modelId,
        display_name: data.displayName,
        description: data.description || null,
        context_window: data.contextWindow || null,
        timeout_ms: Number(data.timeoutMs) || 60000,
        capabilities_json: toJsonStr(data.capabilities || []),
        tags_json: toJsonStr(data.tags || []),
        compatible_providers_json: toJsonStr(data.compatibleProviders || []),
        supported_parameters: toJsonStr(data.supportedParameters || []),
        parameter_whitelist: toJsonStr(data.parameterWhitelist || {}),
        available_tiers: toJsonStr(data.availableTiers || []),
        in_mult: Number(data.inMultiplier) || 1.0,
        out_mult: Number(data.outMultiplier) || 1.0,
        cr_mult: Number(data.cacheReadMultiplier) || 1.0,
        cw_mult: Number(data.cacheWriteMultiplier) || 1.0,
        supports_caching: data.supportsCaching ? 1 : 0,
        supports_batch: data.supportsBatch ? 1 : 0,
        deprecation_date: deprecationDate,
        deprecation_note: data.deprecationNote || null,
        is_active: data.isActive ? 1 : 0,
        updated_by: session.githubUsername || 'admin'
    });

    const routes = normalizeRoutes(data.routes || []);
    if (routes.length > 0) {
        await executeQuery(`UPDATE model_provider_mappings SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = :updated_by WHERE model_catalog_id = :id`, {
            id,
            updated_by: session.githubUsername || 'admin'
        });

        for (const route of routes) {
            if (!supportedProviders.includes(route.providerName)) {
                return res.status(400).json({ error: 'Invalid providerName', allowed: supportedProviders });
            }
            await executeQuery(`
                INSERT INTO model_provider_mappings (
                    model_catalog_id, provider_name, backend_model_id,
                    provider_context_window, priority, is_active, supports_batch,
                    mapping_multipliers, allowed_params_json, created_by, updated_by
                ) VALUES (
                    :model_catalog_id, :provider_name, :backend_model_id,
                    :provider_ctx, :priority, :is_active, :supports_batch,
                    :mapping_multipliers, :allowed_params, :created_by, :updated_by
                )
            `, {
                model_catalog_id: id,
                provider_name: route.providerName,
                backend_model_id: route.backendModelId,
                provider_ctx: route.contextWindow || null,
                priority: Number(route.priority) || 0,
                is_active: route.isActive !== false ? 1 : 0,
                supports_batch: route.supportsBatch ? 1 : 0,
                mapping_multipliers: toJsonStr({
                    inMultiplier: route.inMultiplier,
                    outMultiplier: route.outMultiplier,
                    cacheReadMultiplier: route.cacheReadMultiplier,
                    cacheWriteMultiplier: route.cacheWriteMultiplier
                }),
                allowed_params: toJsonStr(route.allowedParams || null),
                created_by: session.githubUsername || 'admin',
                updated_by: session.githubUsername || 'admin'
            });
        }
    }

    await invalidateModelCatalogCache();
    return res.status(200).json({ success: true });
}

async function handleCanonicalDelete(req, res, session) {
    const id = req.query.id || (req.body || {}).id;
    if (!id) return res.status(400).json({ error: 'id required' });

    await executeQuery(`
        UPDATE canonical_models
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = :updated_by
        WHERE id = :id
    `, { id, updated_by: session.githubUsername || 'admin' });

    await executeQuery(`UPDATE canonical_model_provider_routes SET is_active = 0, updated_by = :updated_by WHERE canonical_model_id = :id`, {
        id,
        updated_by: session.githubUsername || 'admin'
    });
    await executeQuery(`UPDATE canonical_model_aliases SET is_active = 0 WHERE canonical_model_id = :id`, { id });
    await executeQuery(`UPDATE canonical_model_tiers SET is_active = 0 WHERE canonical_model_id = :id`, { id });
    await executeQuery(`UPDATE canonical_model_supported_params SET is_active = 0 WHERE canonical_model_id = :id`, { id });
    await executeQuery(`UPDATE canonical_model_param_whitelist SET is_active = 0 WHERE canonical_model_id = :id`, { id });

    await invalidateModelCatalogCache();
    return res.status(200).json({ success: true });
}

async function handleLegacyDelete(req, res, session) {
    const id = req.query.id || (req.body || {}).id;
    if (!id) return res.status(400).json({ error: 'id required' });

    await executeQuery(`
        UPDATE model_catalog
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = :updated_by
        WHERE id = :id
    `, { id, updated_by: session.githubUsername || 'admin' });

    await executeQuery(`
        UPDATE model_provider_mappings
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = :updated_by
        WHERE model_catalog_id = :id
    `, { id, updated_by: session.githubUsername || 'admin' });

    await invalidateModelCatalogCache();
    return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        const useCanonical = await canonicalTablesAvailable();

        if (req.method === 'GET') {
            return useCanonical
                ? await handleCanonicalGet(req, res)
                : await handleLegacyGet(req, res);
        }

        if (req.method === 'POST') {
            return useCanonical
                ? await handleCanonicalPost(req, res, session)
                : await handleLegacyPost(req, res, session);
        }

        if (req.method === 'PUT') {
            return useCanonical
                ? await handleCanonicalPut(req, res, session)
                : await handleLegacyPut(req, res, session);
        }

        if (req.method === 'DELETE') {
            return useCanonical
                ? await handleCanonicalDelete(req, res, session)
                : await handleLegacyDelete(req, res, session);
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({ error: 'Required model tables not found. Run migrations first.' });
        }
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'A model or alias with the same identifier already exists.' });
        }
        console.error('[admin/catalog] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
