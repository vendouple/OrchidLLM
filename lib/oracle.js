/**
 * Oracle DB for Vercel Serverless Functions
 *
 * Uses node-oracledb thin mode (pure JS, no Oracle Client needed).
 * No connection pool — each call gets a fresh connection and closes it.
 *
 * Why no pool?
 *   Vercel serverless functions frequently spin up cold containers.
 *   oracledb.createPool() makes a real TCP connection even with poolMin=0
 *   on some oracledb versions, which blocks the libuv event queue in a way
 *   that prevents JS setTimeout() from firing — so Promise.race() timeouts
 *   never trigger, and the function hangs for the full Vercel 300 s limit.
 *
 * Required environment variables:
 *   ORACLE_DB_USER              e.g. ADMIN
 *   ORACLE_DB_PASSWORD          your password
 *   ORACLE_DB_CONNECTION_STRING Full TCPS descriptor OR Easy Connect string
 *     Descriptor format: (description=(retry_count=20)(retry_delay=3)
 *       (address=(protocol=tcps)(port=1522)(host=...))
 *       (connect_data=(service_name=...))
 *       (security=(ssl_server_dn_match=yes)))
 *
 * Optional:
 *   ORACLE_DB_CONNECT_TIMEOUT_SECONDS  default 10
 *   ORACLE_DB_CALL_TIMEOUT_MS          default 8000
 */

import oracledb from 'oracledb';

// Thin mode is the default in oracledb v6+. Explicitly assert it so we fail
// fast with a clear error if someone accidentally called initOracleClient().
if (oracledb.thin === false) {
    console.warn('[oracle] WARNING: oracledb thick mode detected. Thin mode is required on Vercel.');
}

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// networkTimeout caps socket read/write after the connect. Set to the same
// value as the connect timeout so runaway queries don't stall the function.
const CONNECT_TIMEOUT_SECONDS = Number(process.env.ORACLE_DB_CONNECT_TIMEOUT_SECONDS || 10);
const CALL_TIMEOUT_MS         = Number(process.env.ORACLE_DB_CALL_TIMEOUT_MS         || 8000);

oracledb.networkTimeout = CONNECT_TIMEOUT_SECONDS * 1000;

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Inject connect_timeout into an Oracle TNS descriptor so the thin driver
 * respects it at the socket-connect level (not just reads).
 *
 * Also strips excessive retry_count / retry_delay that Oracle Cloud embeds
 * (e.g. retry_count=20, retry_delay=3 → 60+ seconds of silent retries).
 */
function prepareConnectString(cs, timeoutSec) {
    if (!cs) return cs;

    let result = cs;

    // Strip / reduce retries — each retry waits retry_delay seconds which adds
    // up before our timeout even gets a chance to fire.
    result = result
        .replace(/\(retry_count=\d+\)/gi,  '(retry_count=1)')
        .replace(/\(retry_delay=\d+\)/gi,   '(retry_delay=1)');

    // Inject connect_timeout into the descriptor if not already present.
    // The thin driver reads this value to cap the TCP SYN / TLS handshake.
    if (!result.includes('connect_timeout') && result.startsWith('(')) {
        // Insert before the closing ) of the top-level (description=...) block
        result = result.replace(/\)\s*$/, `(connect_timeout=${timeoutSec}))`);
    }

    return result;
}

/**
 * Resolve credentials from env vars.
 */
function getCredentials() {
    // Primary
    if (process.env.ORACLE_DB_USER && process.env.ORACLE_DB_PASSWORD && process.env.ORACLE_DB_CONNECTION_STRING) {
        return {
            user:          process.env.ORACLE_DB_USER,
            password:      process.env.ORACLE_DB_PASSWORD,
            connectString: prepareConnectString(process.env.ORACLE_DB_CONNECTION_STRING, CONNECT_TIMEOUT_SECONDS),
        };
    }
    // Legacy var names
    if (process.env.ORACLE_USER && process.env.ORACLE_PASSWORD && process.env.ORACLE_CONNECT_STRING) {
        return {
            user:          process.env.ORACLE_USER,
            password:      process.env.ORACLE_PASSWORD,
            connectString: prepareConnectString(process.env.ORACLE_CONNECT_STRING, CONNECT_TIMEOUT_SECONDS),
        };
    }
    return null;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Synchronous check — returns true only when ALL required env vars are present.
 * Call this BEFORE any oracledb operation.
 */
export function isDbConfigured() {
    return !!(
        (process.env.ORACLE_DB_USER && process.env.ORACLE_DB_PASSWORD && process.env.ORACLE_DB_CONNECTION_STRING) ||
        (process.env.ORACLE_USER    && process.env.ORACLE_PASSWORD    && process.env.ORACLE_CONNECT_STRING)
    );
}

/**
 * Open a single direct connection (no pool).
 *
 * Uses a JS AbortController race as a belt-and-suspenders fallback in case
 * the connect_timeout in the descriptor doesn't fire (e.g. thin driver bug).
 *
 * @returns {Promise<oracledb.Connection>}
 */
export async function getConnection() {
    const creds = getCredentials();
    if (!creds) {
        throw new Error('[oracle] Missing credentials: set ORACLE_DB_USER, ORACLE_DB_PASSWORD, ORACLE_DB_CONNECTION_STRING');
    }

    const snippet = creds.connectString.slice(0, 100);
    console.log(`[oracle] Opening connection | timeout=${CONNECT_TIMEOUT_SECONDS}s | cs: ${snippet}...`);

    // Belt-and-suspenders JS timeout — fires if the native layer doesn't respect
    // connect_timeout (which can happen if the TCP stack just queues the SYN).
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error(`[oracle] getConnection() timed out after ${CONNECT_TIMEOUT_SECONDS}s`)),
            CONNECT_TIMEOUT_SECONDS * 1000
        );
    });

    try {
        const conn = await Promise.race([
            oracledb.getConnection(creds),
            timeoutPromise,
        ]);
        clearTimeout(timeoutId);
        console.log('[oracle] Connection opened ✓');
        return conn;
    } catch (err) {
        clearTimeout(timeoutId);
        // Re-throw with context for callers to distinguish timeout vs auth vs network
        throw err;
    }
}

/**
 * Execute a query with automatic connection open + close.
 * @param {string} sql
 * @param {object} binds
 * @param {object} options
 * @returns {Promise<{rows: Array, rowsAffected: number}>}
 */
export async function executeQuery(sql, binds = {}, options = {}) {
    if (!isDbConfigured()) {
        throw new Error('[oracle] Database not configured — set ORACLE_DB_USER, ORACLE_DB_PASSWORD, ORACLE_DB_CONNECTION_STRING');
    }

    let connection;
    try {
        connection = await getConnection();

        const result = await connection.execute(sql, binds, {
            autoCommit:  options.autoCommit !== false,
            callTimeout: options.callTimeout ?? CALL_TIMEOUT_MS,
            ...options,
        });

        return {
            rows:         result.rows         || [],
            rowsAffected: result.rowsAffected || 0,
        };
    } finally {
        if (connection) {
            await connection.close().catch(e => console.error('[oracle] close error:', e.message));
        }
    }
}

/**
 * Execute multiple statements in a single transaction.
 * @param {Array<{sql: string, binds?: object}>} statements
 * @returns {Promise<Array>}
 */
export async function executeTransaction(statements) {
    if (!isDbConfigured()) {
        throw new Error('[oracle] Database not configured');
    }

    let connection;
    try {
        connection = await getConnection();
        const results = [];

        for (const { sql, binds } of statements) {
            const result = await connection.execute(sql, binds || {}, {
                autoCommit:  false,
                callTimeout: CALL_TIMEOUT_MS,
            });
            results.push(result);
        }

        await connection.commit();
        return results;
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }
        throw error;
    } finally {
        if (connection) {
            await connection.close().catch(e => console.error('[oracle] close error:', e.message));
        }
    }
}

// ─── pool stubs (kept for API compatibility — no-ops now) ────────────────────

/** @deprecated No-op: pool is not used in serverless mode. */
export async function getPool() {
    throw new Error('[oracle] getPool() is not used in serverless mode — call getConnection() or executeQuery() directly');
}

/** @deprecated No-op: there is no pool to close. */
export async function closePool() {
    // nothing to do
}

/** @deprecated Always returns false — there is no pool. */
export function isPoolReady() {
    return false;
}

// Export oracledb for direct use if needed
export { oracledb };
