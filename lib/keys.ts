import { KeyType, KeyDetectionResult, ApiKeyPermissions, ApiKeyRecord } from './types';

// API endpoints
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';

// Demo key format: nobindes_1712345678901_abc123 (short, with underscore)
const DEMO_KEY_PATTERN = /^nobindes_\d+_[a-zA-Z0-9]+$/;

// Global key format: nobindes_64charhex... (long, no underscore after prefix)
const GLOBAL_KEY_PATTERN = /^nobindes_[a-f0-9]{64,}$/;

// BPOLLY key format: BPOLLYKEY_sk_...
const BPOLLY_KEY_PATTERN = /^BPOLLYKEY_(.+)$/;

// Legacy Pollinations key format: sk_...
const LEGACY_POLL_KEY_PATTERN = /^sk_(.+)$/;

/**
 * Detect the type of API key
 */
export function detectKeyType(apiKey: string): KeyDetectionResult {
  if (!apiKey || typeof apiKey !== 'string') {
    return { type: 'unknown' };
  }

  // BPOLLYKEY: User's own Pollinations key
  if (BPOLLY_KEY_PATTERN.test(apiKey)) {
    return {
      type: 'bpolly',
      actualKey: apiKey.replace('BPOLLYKEY_', ''),
    };
  }

  // nobindes keys
  if (apiKey.startsWith('nobindes_')) {
    const keyBody = apiKey.replace('nobindes_', '');

    // Demo session: short format with underscore (timestamp_random)
    if (DEMO_KEY_PATTERN.test(apiKey)) {
      return { type: 'demo' };
    }

    // Global API key: long format, needs database lookup
    if (GLOBAL_KEY_PATTERN.test(apiKey)) {
      // Return 'global' type - actual validation happens in API route
      return { type: 'global' };
    }
  }

  // Legacy: direct Pollinations key
  if (LEGACY_POLL_KEY_PATTERN.test(apiKey)) {
    return {
      type: 'bpolly',
      actualKey: apiKey,
    };
  }

  return { type: 'unknown' };
}

/**
 * Generate a demo session key
 */
export function generateDemoKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 15);
  return `nobindes_${timestamp}_${random}`;
}

/**
 * Generate a global API key
 */
export function generateGlobalKey(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `nobindes_${hex}`;
}

/**
 * Check if a key is a demo key
 */
export function isDemoKey(key: string): boolean {
  return DEMO_KEY_PATTERN.test(key);
}

/**
 * Check if a key is a global key
 */
export function isGlobalKey(key: string): boolean {
  return GLOBAL_KEY_PATTERN.test(key);
}

/**
 * Check if a key is a BPOLLY key
 */
export function isBpollyKey(key: string): boolean {
  return BPOLLY_KEY_PATTERN.test(key) || LEGACY_POLL_KEY_PATTERN.test(key);
}

/**
 * Get the actual Pollinations key from BPOLLY key
 */
export function extractPollinationsKey(bpollyKey: string): string {
  if (BPOLLY_KEY_PATTERN.test(bpollyKey)) {
    return bpollyKey.replace('BPOLLYKEY_', '');
  }
  return bpollyKey;
}

/**
 * Validate global API key against database
 * This function should be called from API routes
 */
export async function validateGlobalKey(key: string): Promise<ApiKeyRecord | null> {
  // This will be implemented with actual database connection
  // For now, return null to indicate the key needs database validation
  if (!GLOBAL_KEY_PATTERN.test(key)) {
    return null;
  }
  
  // Database lookup will be implemented in the API route
  return null;
}

/**
 * Get the appropriate API base URL for a model
 */
export function getApiBaseUrl(model: string): string {
  if (model.startsWith('nvidia/')) {
    return NVIDIA_BASE;
  }
  return POLLINATIONS_BASE;
}

/**
 * Strip provider prefix from model name
 */
export function getActualModel(model: string): string {
  if (model.startsWith('nvidia/')) {
    return model.replace('nvidia/', '');
  }
  if (model.startsWith('pollinations/')) {
    return model.replace('pollinations/', '');
  }
  return model;
}

/**
 * Check if model is an NVIDIA model
 */
export function isNvidiaModel(model: string): boolean {
  return model.startsWith('nvidia/');
}

/**
 * Check if model is a Pollinations model
 */
export function isPollinationsModel(model: string): boolean {
  return !model.startsWith('nvidia/') || model.startsWith('pollinations/');
}
