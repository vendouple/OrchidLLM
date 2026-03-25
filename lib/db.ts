import { connect } from '@planetscale/database';
import { ApiKeyRecord, ApiKeyPermissions } from './types';

// Initialize PlanetScale connection
const getConnection = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return connect({ url });
};

/**
 * Get API key record from database
 */
export async function getApiKeyRecord(key: string): Promise<ApiKeyRecord | null> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'SELECT * FROM api_keys WHERE `key` = ?',
      [key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      key: row.key,
      permissions: {
        providers: JSON.parse(row.providers),
        rateLimit: row.rate_limit,
        models: row.models ? JSON.parse(row.models) : '*',
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      },
      createdAt: new Date(row.created_at).getTime(),
      createdBy: row.created_by,
      lastUsed: row.last_used ? new Date(row.last_used).getTime() : undefined,
      usageCount: row.usage_count || 0,
    };
  } catch (error) {
    console.error('Error getting API key record:', error);
    // Throw error instead of returning null to distinguish between
    // "key not found" and "database error"
    throw new Error('Database error while fetching API key');
  }
}

/**
 * Update last used timestamp and increment usage count
 */
export async function updateKeyUsage(key: string): Promise<void> {
  try {
    const conn = getConnection();
    await conn.execute(
      'UPDATE api_keys SET last_used = NOW(), usage_count = usage_count + 1 WHERE `key` = ?',
      [key]
    );
  } catch (error) {
    console.error('Error updating key usage:', error);
  }
}

/**
 * Create a new API key
 */
export async function createApiKey(
  key: string,
  permissions: ApiKeyPermissions,
  createdBy: string
): Promise<ApiKeyRecord | null> {
  try {
    const conn = getConnection();
    await conn.execute(
      `INSERT INTO api_keys (\`key\`, providers, rate_limit, models, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        key,
        JSON.stringify(permissions.providers),
        permissions.rateLimit,
        permissions.models === '*' ? null : JSON.stringify(permissions.models),
        permissions.expiresAt ? new Date(permissions.expiresAt).toISOString() : null,
        createdBy,
      ]
    );
    
    return {
      key,
      permissions,
      createdAt: Date.now(),
      createdBy,
      usageCount: 0,
    };
  } catch (error) {
    console.error('Error creating API key:', error);
    return null;
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(key: string): Promise<boolean> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'DELETE FROM api_keys WHERE `key` = ?',
      [key]
    );
    return result.rowsAffected > 0;
  } catch (error) {
    console.error('Error deleting API key:', error);
    return false;
  }
}

/**
 * List all API keys (for admin purposes)
 */
export async function listApiKeys(limit = 100, offset = 0): Promise<ApiKeyRecord[]> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'SELECT * FROM api_keys ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    return result.rows.map((row: any) => ({
      key: row.key,
      permissions: {
        providers: JSON.parse(row.providers),
        rateLimit: row.rate_limit,
        models: row.models ? JSON.parse(row.models) : '*',
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      },
      createdAt: new Date(row.created_at).getTime(),
      createdBy: row.created_by,
      lastUsed: row.last_used ? new Date(row.last_used).getTime() : undefined,
      usageCount: row.usage_count || 0,
    }));
  } catch (error) {
    console.error('Error listing API keys:', error);
    return [];
  }
}

/**
 * Check if a key has access to a specific provider
 * Empty providers array means no access (not all access)
 */
export function hasProviderAccess(permissions: ApiKeyPermissions, provider: string): boolean {
  // Empty array means no provider access granted
  if (permissions.providers.length === 0) {
    return false;
  }
  return permissions.providers.includes(provider as any);
}

/**
 * Check if a key has access to a specific model
 */
export function hasModelAccess(permissions: ApiKeyPermissions, model: string): boolean {
  if (permissions.models === '*') {
    return true;
  }
  return permissions.models.includes(model);
}

/**
 * Check if a key is expired
 */
export function isKeyExpired(permissions: ApiKeyPermissions): boolean {
  if (!permissions.expiresAt) {
    return false;
  }
  return Date.now() > permissions.expiresAt;
}
