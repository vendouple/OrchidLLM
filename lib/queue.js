/**
 * lib/queue.js — DB-Backed Priority Request Queue
 */
import { executeQuery } from './oracle.js';
import { randomBytes } from 'crypto';

/**
 * Enqueue a new request.
 */
export async function enqueueRequest({ userId, apiKeyId, modelId, providerId, priority, reservedCredits }) {
    const id = randomBytes(16).toString('hex');
    await executeQuery(`
        INSERT INTO request_queue (id, user_id, api_key_id, model_id, provider_id, priority, status, reserved_credits)
        VALUES (:id, :userId, :apiKeyId, :modelId, :providerId, :priority, 'pending', :reserved)
    `, { id, userId, apiKeyId, modelId, providerId, priority: priority || 0, reserved: reservedCredits || 0 });
    return { id };
}

/**
 * Try to acquire a queue turn while respecting per-user concurrency and
 * priority/age ordering among pending items.
 */
export async function tryAcquireQueueTurn(queueId, opts = {}) {
    const current = await executeQuery(`
        SELECT id, user_id, priority, created_at, status
        FROM request_queue
        WHERE id = :id
    `, { id: queueId });
    const row = current.rows[0];
    if (!row) return { acquired: false, reason: 'not_found' };
    if (row.STATUS !== 'pending') return { acquired: false, reason: 'not_pending' };

    // Check concurrency limit.
    if (opts.userId && opts.maxConcurrent > 0) {
        const inflight = await executeQuery(`
            SELECT COUNT(*) AS cnt FROM request_queue
            WHERE user_id = :userId AND status = 'in_flight'
        `, { userId: opts.userId });
        if ((inflight.rows[0]?.CNT || 0) >= opts.maxConcurrent) {
            return { acquired: false, reason: 'concurrency_limit' };
        }
    }

    // Respect queue priority: higher priority first, then oldest first.
    const ahead = await executeQuery(`
        SELECT COUNT(*) AS cnt
        FROM request_queue
        WHERE status = 'pending'
          AND id <> :id
          AND (
              priority > :priority OR
              (priority = :priority AND created_at < :createdAt)
          )
    `, { id: queueId, priority: row.PRIORITY || 0, createdAt: row.CREATED_AT });
    if ((ahead.rows[0]?.CNT || 0) > 0) {
        return { acquired: false, reason: 'waiting_priority' };
    }

    const r = await executeQuery(`
        UPDATE request_queue SET status = 'in_flight', dispatched_at = CURRENT_TIMESTAMP
        WHERE id = :id AND status = 'pending'
    `, { id: queueId });

    return { acquired: r.rowsAffected > 0, reason: r.rowsAffected > 0 ? 'ok' : 'not_pending' };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait briefly for a queue turn instead of failing immediately at capacity.
 * This keeps the DB-backed queue useful without implementing provider dispatchers.
 */
export async function waitForQueueTurn(queueId, opts = {}) {
    const timeoutMs = Number(opts.timeoutMs ?? process.env.QUEUE_WAIT_TIMEOUT_MS ?? 25000);
    const pollMs = Number(opts.pollMs ?? process.env.QUEUE_POLL_MS ?? 500);
    const startedAt = Date.now();
    let last = { acquired: false, reason: 'timeout' };

    do {
        last = await tryAcquireQueueTurn(queueId, opts);
        if (last.acquired) {
            return { ...last, waitMs: Date.now() - startedAt };
        }
        if (!['concurrency_limit', 'waiting_priority'].includes(last.reason)) {
            return { ...last, waitMs: Date.now() - startedAt };
        }
        await sleep(pollMs);
    } while (Date.now() - startedAt < timeoutMs);

    return { acquired: false, reason: 'queue_timeout', waitMs: Date.now() - startedAt, lastReason: last.reason };
}

/**
 * Mark queue item as completed.
 */
export async function completeQueueItem({ queueId, actualCredits }) {
    await executeQuery(`
        UPDATE request_queue SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
            actual_credits = :actual
        WHERE id = :id
    `, { id: queueId, actual: actualCredits || 0 });
}

/**
 * Mark queue item as failed.
 */
export async function failQueueItem(queueId) {
    await executeQuery(`
        UPDATE request_queue SET status = 'failed', completed_at = CURRENT_TIMESTAMP
        WHERE id = :id
    `, { id: queueId });
}
