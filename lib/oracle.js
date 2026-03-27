/**
 * Oracle DB Connection Pool for Vercel Serverless Functions
 * 
 * Uses node-oracledb with connection pooling optimized for serverless.
 * Handles Oracle Cloud wallet setup for Autonomous DB connections.
 */

import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure for serverless
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.poolIncrement = 0;  // Don't auto-increment pool
oracledb.poolMin = 0;        // Allow pool to drain
oracledb.poolMax = 4;        // Max connections per function instance
oracledb.queueTimeout = 5000; // 5 second timeout

let pool = null;
let walletSetupComplete = false;

/**
 * Setup Oracle Cloud wallet from environment variables
 * The wallet files are stored as base64-encoded JSON in ORACLE_WALLET_BASE64
 */
async function setupWallet() {
    if (walletSetupComplete) return;
    
    if (process.env.ORACLE_WALLET_BASE64) {
        const walletDir = '/tmp/oracle-wallet';
        
        if (!fs.existsSync(walletDir)) {
            fs.mkdirSync(walletDir, { recursive: true });
            
            try {
                // Decode wallet files from base64 JSON
                const walletFiles = JSON.parse(
                    Buffer.from(process.env.ORACLE_WALLET_BASE64, 'base64').toString('utf8')
                );
                
                for (const [filename, content] of Object.entries(walletFiles)) {
                    fs.writeFileSync(
                        path.join(walletDir, filename),
                        Buffer.from(content, 'base64')
                    );
                }
                
                console.log('Oracle wallet extracted to:', walletDir);
            } catch (error) {
                console.error('Failed to extract Oracle wallet:', error);
                throw error;
            }
        }
        
        // Set TNS_ADMIN to wallet directory
        process.env.TNS_ADMIN = walletDir;
    }
    
    walletSetupComplete = true;
}

/**
 * Get or create connection pool
 * @returns {Promise<oracledb.Pool>}
 */
export async function getPool() {
    if (!pool) {
        await setupWallet();
        
        const config = {
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING,
        };
        
        // Add wallet location if using Oracle Cloud
        if (process.env.TNS_ADMIN) {
            config.walletLocation = process.env.TNS_ADMIN;
        }
        
        console.log('Creating Oracle connection pool...');
        pool = await oracledb.createPool(config);
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
    if (pool) {
        try {
            await pool.close(0); // Immediate close
            pool = null;
            console.log('Oracle connection pool closed');
        } catch (error) {
            console.error('Error closing pool:', error);
        }
    }
}

/**
 * Execute a query with automatic connection management
 * @param {string} sql - SQL query
 * @param {object} binds - Bind parameters
 * @param {object} options - Query options
 * @returns {Promise<{rows: Array, rowsAffected: number}>}
 */
export async function executeQuery(sql, binds = {}, options = {}) {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(sql, binds, {
            autoCommit: options.autoCommit !== false,
            ...options
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
