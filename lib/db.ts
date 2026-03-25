import { connect } from '@planetscale/database';
import { ApiKeyRecord, ApiKeyPermissions, User, CreateUserInput } from './types';
import { v4 as uuidv4 } from 'uuid';

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

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create or update a user from GitHub OAuth
 */
export async function createOrUpdateUser(input: CreateUserInput): Promise<User> {
  try {
    const conn = getConnection();

    // Check if user exists
    const existing = await conn.execute(
      'SELECT * FROM users WHERE github_id = ?',
      [input.githubId]
    );

    if (existing.rows.length > 0) {
      // Update existing user
      await conn.execute(
        `UPDATE users SET
          github_username = ?,
          email = ?,
          name = ?,
          avatar_url = ?,
          last_login = NOW()
        WHERE github_id = ?`,
        [input.githubUsername, input.email, input.name, input.avatarUrl, input.githubId]
      );

      const row = existing.rows[0] as any;
      return {
        id: row.id,
        githubId: row.github_id,
        githubUsername: input.githubUsername,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        isAdmin: row.is_admin === 1 || row.github_username === 'vendouple',
        createdAt: new Date(row.created_at).getTime(),
        lastLogin: Date.now(),
      };
    } else {
      // Create new user
      const id = uuidv4();
      // Auto-grant admin to vendouple
      const isAdmin = input.githubUsername.toLowerCase() === 'vendouple';

      await conn.execute(
        `INSERT INTO users (id, github_id, github_username, email, name, avatar_url, is_admin, last_login)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id, input.githubId, input.githubUsername, input.email, input.name, input.avatarUrl, isAdmin]
      );

      return {
        id,
        githubId: input.githubId,
        githubUsername: input.githubUsername,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        isAdmin,
        createdAt: Date.now(),
        lastLogin: Date.now(),
      };
    }
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw new Error('Database error while managing user');
  }
}

/**
 * Get user by GitHub ID
 */
export async function getUserByGithubId(githubId: string): Promise<User | null> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'SELECT * FROM users WHERE github_id = ?',
      [githubId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      id: row.id,
      githubId: row.github_id,
      githubUsername: row.github_username,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      isAdmin: row.is_admin === 1,
      createdAt: new Date(row.created_at).getTime(),
      lastLogin: row.last_login ? new Date(row.last_login).getTime() : null,
    };
  } catch (error) {
    console.error('Error getting user by GitHub ID:', error);
    return null;
  }
}

/**
 * Get user by internal ID
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      id: row.id,
      githubId: row.github_id,
      githubUsername: row.github_username,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      isAdmin: row.is_admin === 1,
      createdAt: new Date(row.created_at).getTime(),
      lastLogin: row.last_login ? new Date(row.last_login).getTime() : null,
    };
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}

/**
 * List all users (for admin)
 */
export async function listUsers(limit = 100, offset = 0): Promise<User[]> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      githubId: row.github_id,
      githubUsername: row.github_username,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      isAdmin: row.is_admin === 1,
      createdAt: new Date(row.created_at).getTime(),
      lastLogin: row.last_login ? new Date(row.last_login).getTime() : null,
    }));
  } catch (error) {
    console.error('Error listing users:', error);
    return [];
  }
}

/**
 * Update user admin status
 */
export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<boolean> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      'UPDATE users SET is_admin = ? WHERE id = ?',
      [isAdmin, userId]
    );
    return result.rowsAffected > 0;
  } catch (error) {
    console.error('Error updating user admin status:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO KEY CLEANUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get demo keys that have been inactive for N days
 */
export async function getInactiveDemoKeys(daysInactive: number = 30): Promise<ApiKeyRecord[]> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      `SELECT * FROM api_keys
       WHERE is_demo = TRUE
       AND (last_used IS NULL OR last_used < DATE_SUB(NOW(), INTERVAL ? DAY))
       ORDER BY last_used ASC`,
      [daysInactive]
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
    console.error('Error getting inactive demo keys:', error);
    return [];
  }
}

/**
 * Delete demo keys that have been inactive for N days
 */
export async function cleanupInactiveDemoKeys(daysInactive: number = 30): Promise<number> {
  try {
    const conn = getConnection();
    const result = await conn.execute(
      `DELETE FROM api_keys
       WHERE is_demo = TRUE
       AND (last_used IS NULL OR last_used < DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [daysInactive]
    );
    return result.rowsAffected;
  } catch (error) {
    console.error('Error cleaning up inactive demo keys:', error);
    return 0;
  }
}
