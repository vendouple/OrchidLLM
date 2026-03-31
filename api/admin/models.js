/**
 * /api/admin/models - Model catalog management (admin only)
 *
 * CRUD for admin-managed model metadata stored in model_catalog.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

const ALLOWED_CATEGORIES = new Set(['text', 'image', 'video', 'audio', 'transcription']);

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

function isUniqueConstraintError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00001') || message.includes('unique constraint');
}

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);

    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    return session;
}

function normalizeCategory(value) {
    const category = String(value || '').trim().toLowerCase();
    if (!category) return null;

    if (ALLOWED_CATEGORIES.has(category)) {
        return category;
    }

    return null;
}

function toArray(input) {
    if (Array.isArray(input)) {
        return input
            .map(item => String(item || '').trim())
            .filter(Boolean);
    }

    if (typeof input === 'string') {
        return input
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    return [];
}

function toJsonArrayString(input) {
    return JSON.stringify(toArray(input));
}

function parseNumberOrNull(value, { min = null, max = null } = {}) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    if (min !== null && parsed < min) return null;
    if (max !== null && parsed > max) return null;
    return Math.floor(parsed);
}

function parseDateOrNull(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

async function handleGet(req, res) {
    if (!await requireAdmin(req, res)) return;

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
                supports_caching,
                is_active,
                created_at,
                updated_at,
                created_by,
                updated_by,
                CASE
                    WHEN deprecates_at IS NOT NULL AND deprecates_at <= CURRENT_TIMESTAMP THEN 1
                    ELSE 0
                END AS is_deprecated
            FROM model_catalog
            ORDER BY category ASC, display_name ASC
        `);

        res.status(200).json(result.rows || []);
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(200).json([]);
        }
        throw error;
    }
}

async function handlePost(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const {
        category,
        modelId,
        displayName,
        description = null,
        contextWindow = null,
        capabilities = [],
        tags = [],
        compatibleProviders = [],
        timeoutMs = 60000,
        deprecatesAt = null,
        deprecationNote = null,
        isPro = false,
        supportsCaching = false,
        isActive = true
    } = req.body || {};

    const normalizedCategory = normalizeCategory(category);
    if (!normalizedCategory) {
        return res.status(400).json({
            error: 'Invalid category',
            allowed: Array.from(ALLOWED_CATEGORIES)
        });
    }

    const normalizedModelId = String(modelId || '').trim();
    if (!normalizedModelId) {
        return res.status(400).json({ error: 'modelId is required' });
    }

    const normalizedDisplayName = String(displayName || '').trim();
    if (!normalizedDisplayName) {
        return res.status(400).json({ error: 'displayName is required' });
    }

    const normalizedTimeout = parseNumberOrNull(timeoutMs, { min: 1 });
    const normalizedDeprecationDate = parseDateOrNull(deprecatesAt);

    if (timeoutMs !== null && timeoutMs !== '' && normalizedTimeout === null) {
        return res.status(400).json({ error: 'timeoutMs must be a positive integer or empty' });
    }

    if (deprecatesAt !== null && deprecatesAt !== '' && normalizedDeprecationDate === null) {
        return res.status(400).json({ error: 'deprecatesAt must be a valid date-time or empty' });
    }

    try {
        await executeQuery(
            `INSERT INTO model_catalog (
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
                supports_caching,
                is_active,
                created_by,
                updated_by
            ) VALUES (
                :category,
                :modelId,
                :displayName,
                :description,
                :contextWindow,
                :capabilitiesJson,
                :tagsJson,
                :providersJson,
                :timeoutMs,
                :deprecatesAt,
                :deprecationNote,
                :isPro,
                :supportsCaching,
                :isActive,
                :createdBy,
                :updatedBy
            )`,
            {
                category: normalizedCategory,
                modelId: normalizedModelId,
                displayName: normalizedDisplayName,
                description: description == null ? null : String(description),
                contextWindow: contextWindow == null ? null : String(contextWindow),
                capabilitiesJson: toJsonArrayString(capabilities),
                tagsJson: toJsonArrayString(tags),
                providersJson: toJsonArrayString(compatibleProviders),
                timeoutMs: normalizedTimeout,
                deprecatesAt: normalizedDeprecationDate,
                deprecationNote: deprecationNote == null ? null : String(deprecationNote),
                isPro: isPro ? 1 : 0,
                supportsCaching: supportsCaching ? 1 : 0,
                isActive: isActive ? 1 : 0,
                createdBy: session.githubUsername || 'admin',
                updatedBy: session.githubUsername || 'admin'
            }
        );

        res.status(201).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_catalog table not found. Run db/migrate_provider_queue.sql first.'
            });
        }

        if (isUniqueConstraintError(error)) {
            return res.status(409).json({
                error: 'A model with the same category and modelId already exists.'
            });
        }

        throw error;
    }
}

async function handlePut(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const { modelEntryId, ...updates } = req.body || {};

    if (!modelEntryId) {
        return res.status(400).json({ error: 'modelEntryId is required' });
    }

    const setParts = [
        'updated_at = CURRENT_TIMESTAMP',
        'updated_by = :updatedBy'
    ];

    const binds = {
        id: modelEntryId,
        updatedBy: session.githubUsername || 'admin'
    };

    if (updates.category !== undefined) {
        const normalizedCategory = normalizeCategory(updates.category);
        if (!normalizedCategory) {
            return res.status(400).json({
                error: 'Invalid category',
                allowed: Array.from(ALLOWED_CATEGORIES)
            });
        }

        setParts.push('category = :category');
        binds.category = normalizedCategory;
    }

    if (updates.modelId !== undefined) {
        const normalizedModelId = String(updates.modelId || '').trim();
        if (!normalizedModelId) {
            return res.status(400).json({ error: 'modelId cannot be empty' });
        }

        setParts.push('model_id = :modelId');
        binds.modelId = normalizedModelId;
    }

    if (updates.displayName !== undefined) {
        const normalizedDisplayName = String(updates.displayName || '').trim();
        if (!normalizedDisplayName) {
            return res.status(400).json({ error: 'displayName cannot be empty' });
        }

        setParts.push('display_name = :displayName');
        binds.displayName = normalizedDisplayName;
    }

    if (updates.description !== undefined) {
        setParts.push('description = :description');
        binds.description = updates.description == null ? null : String(updates.description);
    }

    if (updates.contextWindow !== undefined) {
        setParts.push('context_window = :contextWindow');
        binds.contextWindow = updates.contextWindow == null ? null : String(updates.contextWindow);
    }

    if (updates.capabilities !== undefined) {
        setParts.push('capabilities_json = :capabilitiesJson');
        binds.capabilitiesJson = toJsonArrayString(updates.capabilities);
    }

    if (updates.tags !== undefined) {
        setParts.push('tags_json = :tagsJson');
        binds.tagsJson = toJsonArrayString(updates.tags);
    }

    if (updates.compatibleProviders !== undefined) {
        setParts.push('compatible_providers_json = :providersJson');
        binds.providersJson = toJsonArrayString(updates.compatibleProviders);
    }

    if (updates.timeoutMs !== undefined) {
        const normalizedTimeout = parseNumberOrNull(updates.timeoutMs, { min: 1 });
        if (updates.timeoutMs !== null && updates.timeoutMs !== '' && normalizedTimeout === null) {
            return res.status(400).json({ error: 'timeoutMs must be a positive integer or empty' });
        }

        setParts.push('timeout_ms = :timeoutMs');
        binds.timeoutMs = normalizedTimeout;
    }

    if (updates.deprecatesAt !== undefined) {
        const normalizedDate = parseDateOrNull(updates.deprecatesAt);
        if (updates.deprecatesAt !== null && updates.deprecatesAt !== '' && normalizedDate === null) {
            return res.status(400).json({ error: 'deprecatesAt must be a valid date-time or empty' });
        }

        setParts.push('deprecates_at = :deprecatesAt');
        binds.deprecatesAt = normalizedDate;
    }

    if (updates.deprecationNote !== undefined) {
        setParts.push('deprecation_note = :deprecationNote');
        binds.deprecationNote = updates.deprecationNote == null ? null : String(updates.deprecationNote);
    }

    if (updates.isPro !== undefined) {
        setParts.push('is_pro = :isPro');
        binds.isPro = updates.isPro ? 1 : 0;
    }

    if (updates.supportsCaching !== undefined) {
        setParts.push('supports_caching = :supportsCaching');
        binds.supportsCaching = updates.supportsCaching ? 1 : 0;
    }

    if (updates.isActive !== undefined) {
        setParts.push('is_active = :isActive');
        binds.isActive = updates.isActive ? 1 : 0;
    }

    if (setParts.length === 2) {
        return res.status(400).json({ error: 'No updates provided' });
    }

    try {
        await executeQuery(
            `UPDATE model_catalog
             SET ${setParts.join(', ')}
             WHERE id = :id`,
            binds
        );

        res.status(200).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_catalog table not found. Run db/migrate_provider_queue.sql first.'
            });
        }

        if (isUniqueConstraintError(error)) {
            return res.status(409).json({
                error: 'A model with the same category and modelId already exists.'
            });
        }

        throw error;
    }
}

async function handleDelete(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const modelEntryId = req.query.modelEntryId;
    if (!modelEntryId) {
        return res.status(400).json({ error: 'modelEntryId is required' });
    }

    try {
        await executeQuery(
            `UPDATE model_catalog
             SET is_active = 0,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = :updatedBy
             WHERE id = :id`,
            {
                id: modelEntryId,
                updatedBy: session.githubUsername || 'admin'
            }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_catalog table not found. Run db/migrate_provider_queue.sql first.'
            });
        }

        throw error;
    }
}

export default async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':
                await handleGet(req, res);
                break;
            case 'POST':
                await handlePost(req, res);
                break;
            case 'PUT':
                await handlePut(req, res);
                break;
            case 'DELETE':
                await handleDelete(req, res);
                break;
            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('[admin/models] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
