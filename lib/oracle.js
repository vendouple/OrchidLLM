/**
 * Oracle DB Connection Pool for Vercel Serverless Functions
 *
 * Uses node-oracledb with connection pooling optimized for serverless.
 * Simplified TLS connection (no mTLS wallet required).
 *
 * Required environment variables:
 * - ORACLE_DB_USER: Database username (e.g., ADMIN)
 * - ORACLE_DB_PASSWORD: Database password
 * - ORACLE_DB_CONNECTION_STRING: Full connection string with TLS
 *   Format: (description=(retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=...))(connect_data=(service_name=...))(security=(ssl_server_dn_match=yes)))
 */

import oracledb from 'oracledb';

// Configure for serverless
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.poolIncrement = 0; // Don't auto-increment pool
oracledb.poolMin = 0; // Allow pool to drain
oracledb.poolMax = 4; // Max connections per function instance
oracledb.queueTimeout = 5000; // 5 second queue timeout

const CONNECT_TIMEOUT_SECONDS = Number(process.env.ORACLE_DB_CONNECT_TIMEOUT_SECONDS || 10);
const CALL_TIMEOUT_MS = Number(process.env.ORACLE_DB_CALL_TIMEOUT_MS || 8000);

// Apply network timeout globally (milliseconds). This is what actually prevents
oracledb.networkTimeout = CONNECT_TIMEOUT_SECONDS * 1000;

let pool = null;

/**
 * Synchronous check — returns true only when ALL required env vars are present.
 * Call this BEFORE any oracledb operation to avoid triggering the native TCP
 * stack when Oracle isn't configured.
 */
export function isDbConfigured() {
    // Primary set
    if (process.env.ORACLE_DB_USER &&
        process.env.ORACLE_DB_PASSWORD &&
        process.env.ORACLE_DB_CONNECTION_STRING) {
        return true;
    }
    // Legacy set
    if (process.env.ORACLE_USER &&
        process.env.ORACLE_PASSWORD &&
        process.env.ORACLE_CONNECT_STRING) {
        return true;
    }
    return false;
}

/**
 * Get connection configuration from environment variables
 */
function getConnectionConfig() {
  // Primary: Use separate DB variables (Oracle Cloud TLS format)
  if (process.env.ORACLE_DB_USER && process.env.ORACLE_DB_PASSWORD && process.env.ORACLE_DB_CONNECTION_STRING) {
    return {
      user: process.env.ORACLE_DB_USER,
      password: process.env.ORACLE_DB_PASSWORD,
      connectString: process.env.ORACLE_DB_CONNECTION_STRING
    };
  }

  // Legacy: Combined connection string format
  if (process.env.ORACLE_DB_CONNECTION_STRING) {
    const connStr = process.env.ORACLE_DB_CONNECTION_STRING;
    const match = connStr.match(/^([^/]+)\/([^@]+)@(.+)$/);

    if (match) {
      return {
        user: match[1],
        password: match[2],
        connectString: match[3]
      };
    }
  }

  // Fallback: Old variable names
  return {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING
  };
}

/**
 * Get or create connection pool
 * @returns {Promise<oracledb.Pool>}
 */
export async function getPool() {
  if (!pool) {
    const config = getConnectionConfig();

    if (!config.user || !config.password || !config.connectString) {
      throw new Error('Missing Oracle DB credentials. Set ORACLE_DB_USER, ORACLE_DB_PASSWORD, and ORACLE_DB_CONNECTION_STRING');
    }

    console.log(`Creating Oracle connection pool (networkTimeout=${oracledb.networkTimeout}ms)...`);

    const poolPromise = oracledb.createPool(config);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Oracle pool creation timed out after ${CONNECT_TIMEOUT_SECONDS}s. Check host/port, firewall, and TLS settings.`)),
        CONNECT_TIMEOUT_SECONDS * 1000
      )
    );
    pool = await Promise.race([poolPromise, timeoutPromise]);
  }

  return pool;
}

/**
 * Get a connection from the pool
 * @returns {Promise<oracledb.Connection>}
 */
export async function getConnection() {
    const pool = await getPool();
    return pool.getConnection();
}

/**
 * Close the connection pool (call at end of request in serverless)
 * In Vercel serverless, this is optional as the container will be recycled
 */
export async function closePool() {
    // Only close if the pool was actually created (avoid triggering init)
    if (pool) {
        try {
            await pool.close(0); // Immediate close
            pool = null;
            console.log('Oracle connection pool closed');
        } catch (error) {
            console.error('Error closing pool:', error);
            pool = null; // Reset so next request can try again
        }
    }
}

/**
 * Returns true if the pool has been initialised (non-blocking).
 */
export function isPoolReady() {
    return pool !== null;
}

/**
 * Execute a query with automatic connection management
 * @param {string} sql - SQL query
 * @param {object} binds - Bind parameters
 * @param {object} options - Query options
 * @returns {Promise<{rows: Array, rowsAffected: number}>}
 */
export async function executeQuery(sql, binds = {}, options = {}) {
    if (!isDbConfigured()) {
        throw new Error('Database not configured — set ORACLE_DB_USER, ORACLE_DB_PASSWORD, and ORACLE_DB_CONNECTION_STRING');
    }
    let connection;
    try {
        connection = await getConnection();
    const executeOptions = {
      autoCommit: options.autoCommit !== false,
      ...options,
      callTimeout: options.callTimeout ?? CALL_TIMEOUT_MS
    };
        const result = await connection.execute(sql, binds, {
      ...executeOptions
        });
        return {
            rows: result.rows,
            rowsAffected: result.rowsAffected || 0
        };
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

/**
 * Execute multiple statements in a transaction
 * @param {Array<{sql: string, binds: object}>} statements
 * @returns {Promise<Array>}
 */
export async function executeTransaction(statements) {
    let connection;
    try {
        connection = await getConnection();
        const results = [];
        
        for (const { sql, binds } of statements) {
            const result = await connection.execute(sql, binds || {});
            results.push(result);
        }
        
        await connection.commit();
        return results;
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Export oracledb for direct use if needed
export { oracledb };
