/**
 * Quick Oracle connection test — reads .env automatically.
 * Run: node test-oracle.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
try {
    const text = readFileSync(resolve(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
    }
} catch { console.warn('Could not read .env'); }

const { executeQuery, isDbConfigured, getConnection } = await import('./lib/oracle.js');

console.log('\n=== Oracle Connection Test ===');
console.log('isDbConfigured():', isDbConfigured());

if (!isDbConfigured()) {
    console.error('❌  Missing env vars. Set ORACLE_DB_USER, ORACLE_DB_PASSWORD, ORACLE_DB_CONNECTION_STRING');
    process.exit(1);
}

try {
    console.log('\n1. Testing getConnection()...');
    const conn = await getConnection();
    console.log('   ✅ Connection opened');
    await conn.close();
    console.log('   ✅ Connection closed');

    console.log('\n2. Testing executeQuery() with SELECT 1+1 FROM DUAL...');
    const { rows } = await executeQuery('SELECT 1+1 AS RESULT FROM DUAL');
    console.log('   ✅ Result:', rows);

    console.log('\n🎉  All good!\n');
} catch (err) {
    console.error('\n❌  Error:', err.message);
    process.exit(1);
}
