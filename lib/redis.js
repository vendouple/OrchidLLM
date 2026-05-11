/**
 * lib/redis.js — Rate Limiting (Upstash Redis with in-memory fallback)
 */

let _redis = null;

async function getRedis() {
    if (_redis) return _redis;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        const { Redis } = await import('@upstash/redis');
        _redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        return _redis;
    }
    return null;
}

// In-memory fallback for dev
const memStore = new Map();

function memGet(key) {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
    return entry.value;
}

function memIncr(key, ttlSeconds) {
    const entry = memStore.get(key);
    if (!entry || (entry.expiresAt && Date.now() > entry.expiresAt)) {
        memStore.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
        return 1;
    }
    entry.value++;
    return entry.value;
}

/**
 * Check rate limit for a key.
 * @param {string} key — rate limit key (e.g. rpm:userId)
 * @param {number} limit — max requests in window
 * @param {number} windowSeconds — window duration
 * @param {object} opts
 * @returns {Promise<{allowed: boolean, remaining: number, current: number}>}
 */
export async function checkRateLimit(key, limit, windowSeconds = 60, opts = {}) {
    const redis = await getRedis();

    if (redis) {
        try {
            const current = await redis.incr(key);
            if (current === 1) await redis.expire(key, windowSeconds);
            return { allowed: current <= limit, remaining: Math.max(0, limit - current), current };
        } catch (err) {
            console.error('[redis] Rate limit check error:', err.message);
            if (opts.requireDurable) return { allowed: false, remaining: 0, current: limit };
        }
    }

    // Memory fallback
    const current = memIncr(key, windowSeconds);
    return { allowed: current <= limit, remaining: Math.max(0, limit - current), current };
}

/**
 * Get a value from Redis/memory.
 */
export async function cacheGet(key) {
    const redis = await getRedis();
    if (redis) {
        try { return await redis.get(key); } catch { /* fallback */ }
    }
    return memGet(key);
}

/**
 * Set a value in Redis/memory.
 */
export async function cacheSet(key, value, ttlSeconds) {
    const redis = await getRedis();
    if (redis) {
        try { await redis.set(key, value, { ex: ttlSeconds }); return; } catch { /* fallback */ }
    }
    memStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}
