/**
 * lib/oracle.js — Oracle DB Connection Pool (Thin Mode)
 *
 * Singleton pool with auto-reconnect. All queries go through executeQuery().
 * LOB columns (CLOB) are auto-read to strings.
 */
import oracledb from 'oracledb';

// Thin mode — no Oracle Instant Client needed
try { oracledb.initOracleClient(); } catch { /* thin mode default */ }

// Force fetch-as-string for common types
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

let _pool = null;

export function isDbConfigured() {
    return !!(process.env.ORACLE_DB_CONNECTION_STRING && process.env.ORACLE_DB_USER);
}

async function getPool() {
    if (_pool) {
        try { await _pool.getConnection().then(c => c.close()); return _pool; } catch { _pool = null; }
    }
    if (!isDbConfigured()) throw new Error('Oracle DB not configured. Set ORACLE_DB_* env vars.');
    _pool = await oracledb.createPool({
        user: process.env.ORACLE_DB_USER,
        password: process.env.ORACLE_DB_PASSWORD,
        connectString: process.env.ORACLE_DB_CONNECTION_STRING,
        poolMin: 1,
        poolMax: 4,
        poolIncrement: 1,
        poolTimeout: 300,
        queueTimeout: 30000,
        enableStatistics: false,
    });
    return _pool;
}

/**
 * Execute a SQL query with bind parameters.
 * @param {string} sql
 * @param {object} binds
 * @param {object} [options]
 * @returns {Promise<{rows: object[], rowsAffected: number, outBinds: object}>}
 */
export async function executeQuery(sql, binds = {}, options = {}) {
    const pool = await getPool();
    let conn;
    try {
        conn = await pool.getConnection();
        const opts = {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: options.autoCommit !== false,
            ...options,
        };
        // Process OUT binds
        const processedBinds = {};
        for (const [k, v] of Object.entries(binds)) {
            if (v && typeof v === 'object' && v.dir === 'out') {
                const typeMap = { 'NUMBER': oracledb.NUMBER, 'STRING': oracledb.STRING, 'DATE': oracledb.DATE };
                processedBinds[k] = { dir: oracledb.BIND_OUT, type: typeMap[v.type] || oracledb.NUMBER };
            } else {
                processedBinds[k] = v;
            }
        }
        const result = await conn.execute(sql, processedBinds, opts);
        // Sanitize LOBs in rows
        if (result.rows) {
            for (const row of result.rows) {
                for (const [key, val] of Object.entries(row)) {
                    if (val && typeof val === 'object' && typeof val.getData === 'function') {
                        try { row[key] = await val.getData(); } catch { row[key] = null; }
                    }
                }
            }
        }
        return {
            rows: result.rows || [],
            rowsAffected: result.rowsAffected || 0,
            outBinds: result.outBinds || {},
            metaData: result.metaData || [],
        };
    } finally {
        if (conn) try { await conn.close(); } catch { /* ignore */ }
    }
}

/**
 * Run multiple statements in a transaction.
 * @param {function} fn - receives conn, returns result
 */
export async function withTransaction(fn) {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        try { await conn.close(); } catch { /* ignore */ }
    }
}

export default { executeQuery, withTransaction, isDbConfigured };
