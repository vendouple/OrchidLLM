/**
 * /api/admin/model-mappings - Model provider mapping management (admin only)
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { normalizeProviderName } from '../../lib/provider-registry.js';
import { invalidateModelCatalogCache } from '../../lib/model-catalog.js';

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

async function resolveModelCatalogId(modelCatalogId, modelId) {
    if (modelCatalogId) {
        return Number(modelCatalogId);
    }

    const normalizedModelId = String(modelId || '').trim();
    if (!normalizedModelId) {
        return null;
    }

    const result = await executeQuery(
        `SELECT id
         FROM model_catalog
         WHERE model_id = :modelId
           AND is_active = 1
         FETCH FIRST 1 ROWS ONLY`,
        { modelId: normalizedModelId }
    );

    if (!result.rows.length) {
        return null;
    }

    return Number(result.rows[0].ID);
}

function normalizeMetadataJson(metadata) {
    if (metadata === undefined) return undefined;
    if (metadata === null || metadata === '') return null;

    if (typeof metadata === 'string') {
        const trimmed = metadata.trim();
        return trimmed || null;
    }

    try {
        return JSON.stringify(metadata);
    } catch {
        return null;
    }
}

async function handleGet(req, res) {
    if (!await requireAdmin(req, res)) return;

    try {
        const result = await executeQuery(`
            SELECT
                m.id,
                m.model_catalog_id,
                c.model_id,
                c.display_name,
                c.category,
                m.provider_name,
                m.provider_model_id,
                m.provider_context_window,
                m.metadata_json,
                m.priority,
                m.is_active,
                m.created_at,
                m.updated_at,
                m.created_by,
                m.updated_by
            FROM model_provider_mappings m
            JOIN model_catalog c
              ON c.id = m.model_catalog_id
            ORDER BY c.model_id ASC,
                     m.provider_name ASC,
                     m.priority DESC,
                     m.id ASC
        `);

        const rows = (result.rows || []).map(row => {
            let metadata = null;
            if (row.METADATA_JSON) {
                try {
                    metadata = JSON.parse(row.METADATA_JSON);
                } catch {
                    metadata = row.METADATA_JSON;
                }
            }

            return {
                ...row,
                METADATA: metadata
            };
        });

        res.status(200).json(rows);
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
        modelCatalogId,
        modelId,
        providerName,
        providerModelId,
        providerContextWindow = null,
        metadata = null,
        priority = 0,
        isActive = true
    } = req.body || {};

    const resolvedModelCatalogId = await resolveModelCatalogId(modelCatalogId, modelId);
    if (!resolvedModelCatalogId) {
        return res.status(400).json({ error: 'A valid modelCatalogId or modelId is required' });
    }

    const normalizedProviderName = normalizeProviderName(providerName);
    if (!normalizedProviderName) {
        return res.status(400).json({ error: 'Invalid providerName' });
    }

    const normalizedProviderModelId = String(providerModelId || '').trim();
    if (!normalizedProviderModelId) {
        return res.status(400).json({ error: 'providerModelId is required' });
    }

    const metadataJson = normalizeMetadataJson(metadata);

    try {
        await executeQuery(
            `INSERT INTO model_provider_mappings (
                model_catalog_id,
                provider_name,
                provider_model_id,
                provider_context_window,
                metadata_json,
                priority,
                is_active,
                created_by,
                updated_by
            ) VALUES (
                :modelCatalogId,
                :providerName,
                :providerModelId,
                :providerContextWindow,
                :metadataJson,
                :priority,
                :isActive,
                :createdBy,
                :updatedBy
            )`,
            {
                modelCatalogId: resolvedModelCatalogId,
                providerName: normalizedProviderName,
                providerModelId: normalizedProviderModelId,
                providerContextWindow: providerContextWindow == null ? null : String(providerContextWindow),
                metadataJson,
                priority: Number(priority) || 0,
                isActive: isActive ? 1 : 0,
                createdBy: session.githubUsername || 'admin',
                updatedBy: session.githubUsername || 'admin'
            }
        );

        invalidateModelCatalogCache();
        res.status(201).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_provider_mappings table not found. Run db/migrate_provider_queue.sql first.'
            });
        }

        if (isUniqueConstraintError(error)) {
            return res.status(409).json({
                error: 'A mapping with the same model/provider/providerModelId already exists.'
            });
        }

        throw error;
    }
}

async function handlePut(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const {
        mappingId,
        modelCatalogId,
        modelId,
        providerName,
        providerModelId,
        providerContextWindow,
        metadata,
        priority,
        isActive
    } = req.body || {};

    if (!mappingId) {
        return res.status(400).json({ error: 'mappingId is required' });
    }

    const setParts = [
        'updated_at = CURRENT_TIMESTAMP',
        'updated_by = :updatedBy'
    ];

    const binds = {
        id: mappingId,
        updatedBy: session.githubUsername || 'admin'
    };

    if (modelCatalogId !== undefined || modelId !== undefined) {
        const resolvedModelCatalogId = await resolveModelCatalogId(modelCatalogId, modelId);
        if (!resolvedModelCatalogId) {
            return res.status(400).json({ error: 'A valid modelCatalogId or modelId is required' });
        }

        setParts.push('model_catalog_id = :modelCatalogId');
        binds.modelCatalogId = resolvedModelCatalogId;
    }

    if (providerName !== undefined) {
        const normalizedProviderName = normalizeProviderName(providerName);
        if (!normalizedProviderName) {
            return res.status(400).json({ error: 'Invalid providerName' });
        }

        setParts.push('provider_name = :providerName');
        binds.providerName = normalizedProviderName;
    }

    if (providerModelId !== undefined) {
        const normalizedProviderModelId = String(providerModelId || '').trim();
        if (!normalizedProviderModelId) {
            return res.status(400).json({ error: 'providerModelId cannot be empty' });
        }

        setParts.push('provider_model_id = :providerModelId');
        binds.providerModelId = normalizedProviderModelId;
    }

    if (providerContextWindow !== undefined) {
        setParts.push('provider_context_window = :providerContextWindow');
        binds.providerContextWindow = providerContextWindow == null ? null : String(providerContextWindow);
    }

    if (metadata !== undefined) {
        setParts.push('metadata_json = :metadataJson');
        binds.metadataJson = normalizeMetadataJson(metadata);
    }

    if (priority !== undefined) {
        setParts.push('priority = :priority');
        binds.priority = Number(priority) || 0;
    }

    if (isActive !== undefined) {
        setParts.push('is_active = :isActive');
        binds.isActive = isActive ? 1 : 0;
    }

    if (setParts.length === 2) {
        return res.status(400).json({ error: 'No updates provided' });
    }

    try {
        await executeQuery(
            `UPDATE model_provider_mappings
             SET ${setParts.join(', ')}
             WHERE id = :id`,
            binds
        );

        invalidateModelCatalogCache();
        res.status(200).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_provider_mappings table not found. Run db/migrate_provider_queue.sql first.'
            });
        }

        if (isUniqueConstraintError(error)) {
            return res.status(409).json({
                error: 'A mapping with the same model/provider/providerModelId already exists.'
            });
        }

        throw error;
    }
}

async function handleDelete(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const mappingId = req.query.mappingId;
    if (!mappingId) {
        return res.status(400).json({ error: 'mappingId is required' });
    }

    try {
        await executeQuery(
            `UPDATE model_provider_mappings
             SET is_active = 0,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = :updatedBy
             WHERE id = :id`,
            {
                id: mappingId,
                updatedBy: session.githubUsername || 'admin'
            }
        );

        invalidateModelCatalogCache();
        res.status(200).json({ success: true });
    } catch (error) {
        if (isMissingTableError(error)) {
            return res.status(400).json({
                error: 'model_provider_mappings table not found. Run db/migrate_provider_queue.sql first.'
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
        console.error('[admin/model-mappings] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
