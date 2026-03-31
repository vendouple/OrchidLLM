/**
 * DB-backed priority queue primitives.
 */

import crypto from 'crypto';
import { executeQuery, isDbConfigured } from './oracle.js';

const STALE_PROCESSING_SECONDS = Number(process.env.QUEUE_STALE_PROCESSING_SECONDS || 120);

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

export function normalizeQueuePriority(value) {
    const priority = Number(value);
    if (!Number.isFinite(priority)) return 0;
    if (priority === -1) return -1;
    if (priority < 0) return 0;
    return Math.floor(priority);
}

function queueSortPriorityExpression(columnName = 'priority') {
    return `CASE WHEN ${columnName} = -1 THEN 1000000 ELSE ${columnName} END`;
}

export async function enqueueRequest({
    endpoint,
    identifier,
    apiKeyId,
    model,
    priority = 0
}) {
    if (!isDbConfigured()) {
        return { id: null, enabled: false };
    }

    const queueId = `q_${crypto.randomUUID()}`;
    const normalizedPriority = normalizeQueuePriority(priority);

    try {
        await executeQuery(
            `INSERT INTO request_queue (
                id,
                endpoint,
                identifier,
                api_key_id,
                model,
                priority,
                status,
                heartbeat_at
            ) VALUES (
                :id,
                :endpoint,
                :identifier,
                :apiKeyId,
                :model,
                :priority,
                'queued',
                CURRENT_TIMESTAMP
            )`,
            {
                id: queueId,
                endpoint,
                identifier,
                apiKeyId: apiKeyId || null,
                model: model || null,
                priority: normalizedPriority
            }
        );

        return {
            id: queueId,
            enabled: true,
            priority: normalizedPriority
        };
    } catch (error) {
        if (isMissingTableError(error)) {
            return { id: null, enabled: false };
        }
        throw error;
    }
}

async function recycleStaleProcessingItems() {
    if (!isDbConfigured()) return;

    try {
        await executeQuery(
            `UPDATE request_queue
             SET status = 'queued',
                 provider_name = NULL,
                 started_at = NULL,
                 heartbeat_at = CURRENT_TIMESTAMP,
                 error_message = 'stale_processing_requeued'
             WHERE status = 'processing'
               AND NVL(heartbeat_at, NVL(started_at, created_at)) <
                   SYSTIMESTAMP - NUMTODSINTERVAL(:staleSeconds, 'SECOND')`,
            { staleSeconds: STALE_PROCESSING_SECONDS }
        );
    } catch (error) {
        if (!isMissingTableError(error)) {
            console.error('[queue] stale processing recycle failed:', error.message);
        }
    }
}

async function hasProviderCapacity(endpoint, providerName, maxConcurrent) {
    if (!isDbConfigured()) return true;
    if (!providerName) return true;

    if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1) {
        return true;
    }

    const result = await executeQuery(
        `SELECT COUNT(*) AS count
         FROM request_queue
         WHERE endpoint = :endpoint
           AND provider_name = :providerName
           AND status = 'processing'
           AND NVL(heartbeat_at, NVL(started_at, created_at)) >=
               SYSTIMESTAMP - NUMTODSINTERVAL(:staleSeconds, 'SECOND')`,
        {
            endpoint,
            providerName,
            staleSeconds: STALE_PROCESSING_SECONDS
        }
    );

    const count = Number(result.rows[0]?.COUNT || 0);
    return count < maxConcurrent;
}

export async function tryAcquireQueueTurn({
    queueId,
    endpoint,
    providerName,
    maxConcurrent = 1
}) {
    if (!isDbConfigured() || !queueId) {
        return { acquired: true, queueDisabled: true };
    }

    await recycleStaleProcessingItems();

    const capacityOk = await hasProviderCapacity(endpoint, providerName, maxConcurrent);
    if (!capacityOk) {
        return { acquired: false, reason: 'provider_busy' };
    }

    const result = await executeQuery(
        `UPDATE request_queue q
         SET q.status = 'processing',
             q.provider_name = :providerName,
             q.started_at = CURRENT_TIMESTAMP,
             q.heartbeat_at = CURRENT_TIMESTAMP,
             q.error_message = NULL
         WHERE q.id = :queueId
           AND q.status = 'queued'
           AND q.id = (
               SELECT id
               FROM (
                   SELECT id
                   FROM request_queue
                   WHERE endpoint = :endpoint
                     AND status = 'queued'
                   ORDER BY ${queueSortPriorityExpression('priority')} DESC, created_at ASC
               )
               WHERE ROWNUM = 1
           )`,
        {
            queueId,
            endpoint,
            providerName
        }
    );

    return {
        acquired: result.rowsAffected === 1
    };
}

export async function heartbeatQueueItem(queueId) {
    if (!isDbConfigured() || !queueId) return;

    try {
        await executeQuery(
            `UPDATE request_queue
             SET heartbeat_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            { id: queueId }
        );
    } catch (error) {
        if (!isMissingTableError(error)) {
            console.error('[queue] heartbeat failed:', error.message);
        }
    }
}

export async function completeQueueItem({
    queueId,
    status = 'done',
    statusCode = 200,
    errorMessage = null
}) {
    if (!isDbConfigured() || !queueId) return;

    try {
        await executeQuery(
            `UPDATE request_queue
             SET status = :status,
                 status_code = :statusCode,
                 error_message = :errorMessage,
                 finished_at = CURRENT_TIMESTAMP,
                 heartbeat_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                id: queueId,
                status,
                statusCode,
                errorMessage
            }
        );
    } catch (error) {
        if (!isMissingTableError(error)) {
            console.error('[queue] complete failed:', error.message);
        }
    }
}

export async function cancelQueueItem(queueId, reason = 'cancelled') {
    return completeQueueItem({
        queueId,
        status: 'cancelled',
        statusCode: null,
        errorMessage: reason
    });
}

export async function getQueueStatus(queueId) {
    if (!isDbConfigured() || !queueId) {
        return null;
    }

    try {
        const result = await executeQuery(
            `SELECT
                id,
                endpoint,
                identifier,
                api_key_id,
                model,
                priority,
                provider_name,
                status,
                status_code,
                error_message,
                created_at,
                started_at,
                finished_at,
                heartbeat_at
             FROM request_queue
             WHERE id = :id`,
            { id: queueId }
        );

        const row = result.rows[0];
        if (!row) return null;

        let position = null;
        if (row.STATUS === 'queued') {
            const posResult = await executeQuery(
                `SELECT COUNT(*) + 1 AS position
                 FROM request_queue
                 WHERE endpoint = :endpoint
                   AND status = 'queued'
                   AND (
                       ${queueSortPriorityExpression('priority')} > ${queueSortPriorityExpression(':priority')}
                       OR (
                           ${queueSortPriorityExpression('priority')} = ${queueSortPriorityExpression(':priority')}
                           AND created_at < :createdAt
                       )
                   )`,
                {
                    endpoint: row.ENDPOINT,
                    priority: row.PRIORITY,
                    createdAt: row.CREATED_AT
                }
            );
            position = Number(posResult.rows[0]?.POSITION || 1);
        }

        return {
            id: row.ID,
            endpoint: row.ENDPOINT,
            identifier: row.IDENTIFIER,
            apiKeyId: row.API_KEY_ID,
            model: row.MODEL,
            priority: row.PRIORITY,
            providerName: row.PROVIDER_NAME,
            status: row.STATUS,
            statusCode: row.STATUS_CODE,
            errorMessage: row.ERROR_MESSAGE,
            position,
            createdAt: row.CREATED_AT,
            startedAt: row.STARTED_AT,
            finishedAt: row.FINISHED_AT,
            heartbeatAt: row.HEARTBEAT_AT
        };
    } catch (error) {
        if (isMissingTableError(error)) {
            return null;
        }
        throw error;
    }
}

export default {
    normalizeQueuePriority,
    enqueueRequest,
    tryAcquireQueueTurn,
    heartbeatQueueItem,
    completeQueueItem,
    cancelQueueItem,
    getQueueStatus
};
