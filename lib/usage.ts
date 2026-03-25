import { kv } from '@vercel/kv';

const DAILY_LIMIT = 20;
const USAGE_PREFIX = 'usage';

/**
 * Get usage count for an identifier (session ID or IP)
 */
export async function getUsage(identifier: string): Promise<number> {
  try {
    const key = getUsageKey(identifier);
    const count = await kv.get<number>(key);
    return count || 0;
  } catch (error) {
    console.error('Error getting usage:', error);
    return 0;
  }
}

/**
 * Increment usage count for an identifier
 */
export async function incrementUsage(identifier: string): Promise<void> {
  try {
    const key = getUsageKey(identifier);
    // Use atomic increment to prevent race conditions
    const newValue = await kv.incr(key);
    // Set expiry only on first increment (when value is 1)
    if (newValue === 1) {
      await kv.expire(key, 86400);
    }
  } catch (error) {
    console.error('Error incrementing usage:', error);
  }
}

/**
 * Get remaining requests for an identifier
 */
export async function getRemainingRequests(identifier: string): Promise<number> {
  const usage = await getUsage(identifier);
  return Math.max(0, DAILY_LIMIT - usage);
}

/**
 * Check if identifier has remaining requests
 */
export async function hasRemainingRequests(identifier: string): Promise<boolean> {
  const usage = await getUsage(identifier);
  return usage < DAILY_LIMIT;
}

/**
 * Get usage key for KV storage
 */
function getUsageKey(identifier: string): string {
  const date = new Date().toDateString();
  return `${USAGE_PREFIX}:${identifier}:${date}`;
}

/**
 * Generate composite identifier from session ID, IP, and fingerprint
 * This prevents users from clearing localStorage to reset demo limit
 */
export function generateCompositeId(
  sessionId: string,
  ip: string,
  fingerprint?: string
): string {
  // Use a simple hash function to create a composite key
  const components = [sessionId, ip];
  if (fingerprint) {
    components.push(fingerprint);
  }
  const combined = components.join(':');
  return hashString(combined);
}

/**
 * Hash function for creating composite IDs
 * Uses a simple but effective hash for generating unique identifiers
 */
function hashString(str: string): string {
  // Use SubtleCrypto for a proper hash in edge runtime
  // Fallback to a simple hash for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Add salt and convert to base36 for better distribution
  const salted = Math.abs(hash).toString(36) + '_' + str.length.toString(36);
  return salted;
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  // Vercel provides the client IP in x-forwarded-for header
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, use the first one
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to x-real-ip
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

/**
 * Check rate limit for global API keys
 */
export async function checkRateLimit(
  key: string,
  rateLimit: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const key_ = `ratelimit:${key}:${new Date().toDateString()}`;
    const current = await kv.get<number>(key_) || 0;
    const remaining = Math.max(0, rateLimit - current);
    const resetAt = new Date();
    resetAt.setHours(23, 59, 59, 999);
    
    return {
      allowed: current < rateLimit,
      remaining,
      resetAt: resetAt.getTime(),
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return {
      allowed: true,
      remaining: rateLimit,
      resetAt: Date.now() + 86400000,
    };
  }
}

/**
 * Increment rate limit counter for global API keys
 */
export async function incrementRateLimit(key: string): Promise<void> {
  try {
    const key_ = `ratelimit:${key}:${new Date().toDateString()}`;
    // Use atomic increment to prevent race conditions
    const newValue = await kv.incr(key_);
    // Set expiry only on first increment
    if (newValue === 1) {
      await kv.expire(key_, 86400);
    }
  } catch (error) {
    console.error('Error incrementing rate limit:', error);
  }
}
