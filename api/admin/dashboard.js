/**
 * /api/admin/dashboard - Admin dashboard stats.
 * Returns statistics, key management data, user/tier summaries, queue stats,
 * model stats, and announcement summaries without depending on provider_keys.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';
import { getSupportedProviderNames } from '../../lib/provider-registry.js';

function isMissingTableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('ora-00942') || message.includes('table or view does not exist');
}

async function safeQuery(sql, binds = {}, fallback = []) {
    try {
        const result = await executeQuery(sql, binds);
        return result.rows || fallback;
    } catch (error) {
        if (isMissingTableError(error)) return fallback;
        throw error;
    }
}

async function safeSingleRow(sql, binds = {}, fallback = {}) {
    const rows = await safeQuery(sql, binds, []);
    return rows[0] || fallback;
}

async function canonicalTablesAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM canonical_models WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

async function adminAuditTablesAvailable() {
    try {
        await executeQuery(`SELECT 1 FROM admin_user_operation_batches WHERE 1 = 0`);
        return true;
    } catch (error) {
        if (isMissingTableError(error)) return false;
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const sessionId = getSessionFromCookie(req);
        const session = await validateSession(sessionId);

        if (!session || !session.isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const useCanonicalModels = await canonicalTablesAvailable();
        const hasAdminAuditTables = await adminAuditTablesAvailable();

        const stats = await safeSingleRow(`
            SELECT
                (SELECT COUNT(*) FROM api_keys WHERE is_active = 1) AS active_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'demo' AND is_active = 1) AS demo_keys,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'global' AND is_active = 1) AS global_keys,
                (SELECT COUNT(*) FROM usage_logs WHERE TRUNC(created_at) = TRUNC(SYSDATE)) AS requests_today,
                (SELECT NVL(SUM(input_tokens + output_tokens), 0) FROM usage_logs) AS total_tokens,
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 0) AS active_demo_sessions,
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 0 AND last_seen >= SYSDATE - 1) AS demo_active_24h,
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 0 AND last_seen >= SYSDATE - 7) AS demo_active_7d,
                (SELECT COUNT(*) FROM demo_sessions WHERE is_blocked = 1) AS blocked_sessions,
                (SELECT COUNT(*) FROM api_keys WHERE key_type = 'demo' AND is_active = 1 AND (last_used IS NULL OR last_used < SYSDATE - 30)) AS demo_keys_purge_eligible
            FROM DUAL
        `, {}, {
            ACTIVE_KEYS: 0,
            DEMO_KEYS: 0,
            GLOBAL_KEYS: 0,
            REQUESTS_TODAY: 0,
            TOTAL_TOKENS: 0,
            ACTIVE_DEMO_SESSIONS: 0,
            DEMO_ACTIVE_24H: 0,
            DEMO_ACTIVE_7D: 0,
            BLOCKED_SESSIONS: 0,
            DEMO_KEYS_PURGE_ELIGIBLE: 0
        });

        const keys = await safeQuery(`
            SELECT
                id, key, name, key_type, rpm, rpd,
                input_token_limit, output_token_limit, queue_priority,
                providers, allowed_models,
                usage_count, total_input_tokens, total_output_tokens,
                created_at, created_by, last_used, is_active, expires_at
            FROM api_keys
            ORDER BY created_at DESC
            FETCH FIRST 200 ROWS ONLY
        `);

        const usageLogs = await safeQuery(`
            SELECT
                ul.identifier,
                ul.endpoint,
                ul.model,
                ul.input_tokens,
                ul.output_tokens,
                ul.ip_address,
                ul.fingerprint_hash,
                ul.created_at
            FROM usage_logs ul
            ORDER BY ul.created_at DESC
            FETCH FIRST 200 ROWS ONLY
        `);

        const demoSessions = await safeQuery(`
            SELECT
                ds.id,
                ds.composite_hash,
                ds.fingerprint_hash,
                ds.ip_address,
                ds.user_agent,
                ds.first_seen,
                ds.last_seen,
                ds.request_count,
                ds.is_blocked,
                ak.key AS api_key,
                ak.id AS api_key_id,
                ak.is_active AS key_is_active,
                ak.usage_count AS key_usage_count,
                ak.total_input_tokens,
                ak.total_output_tokens,
                TRUNC(SYSDATE) - TRUNC(NVL(ds.last_seen, ds.first_seen)) AS days_inactive
            FROM demo_sessions ds
            LEFT JOIN api_keys ak ON ds.api_key_id = ak.id
            ORDER BY NVL(ds.last_seen, ds.first_seen) DESC NULLS LAST
            FETCH FIRST 500 ROWS ONLY
        `);

        const chartData = await safeQuery(`
            SELECT
                TRUNC(created_at) AS day,
                COUNT(*) AS requests,
                NVL(SUM(input_tokens + output_tokens), 0) AS tokens
            FROM usage_logs
            WHERE created_at >= SYSDATE - 14
            GROUP BY TRUNC(created_at)
            ORDER BY day ASC
        `);

        const userStats = await safeSingleRow(`
            SELECT
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM users WHERE created_at >= SYSDATE - 7) AS new_users_7d,
                (SELECT COUNT(*) FROM users WHERE created_at >= SYSDATE - 30) AS new_users_30d,
                (SELECT COUNT(*) FROM users WHERE is_banned = 1) AS banned_users,
                (SELECT COUNT(*) FROM users WHERE is_admin = 1) AS admin_users
            FROM DUAL
        `, {}, {
            TOTAL_USERS: 0,
            NEW_USERS_7D: 0,
            NEW_USERS_30D: 0,
            BANNED_USERS: 0,
            ADMIN_USERS: 0
        });

        const announcements = await safeQuery(`
            SELECT id, title, type, is_banner, is_urgent, created_at
            FROM announcements
            WHERE is_active = 1
            ORDER BY is_urgent DESC, is_banner DESC, created_at DESC
        `);

        const tiers = await safeQuery(`
            SELECT
                t.id,
                t.name,
                t.tier_name,
                t.tier_level,
                t.tier_code,
                t.sort_order,
                t.monthly_credits,
                t.price_idr,
                td.tier_name AS canonical_tier_name,
                td.tier_code AS canonical_tier_code,
                td.sort_order AS canonical_sort_order
            FROM tiers t
            LEFT JOIN tier_definitions td ON td.id = t.tier_definition_id
            ORDER BY NVL(td.sort_order, t.sort_order) ASC, t.tier_name ASC
        `);

        const queueStats = await safeSingleRow(`
            SELECT
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status = 'completed' AND TRUNC(created_at) = TRUNC(SYSDATE) THEN 1 ELSE 0 END) AS completed_today
            FROM request_queue
        `, {}, { QUEUED: 0, PROCESSING: 0, FAILED: 0, COMPLETED_TODAY: 0 });

        const recentQueue = await safeQuery(`
            SELECT
                id,
                endpoint,
                identifier,
                model,
                priority,
                provider_name,
                status,
                status_code,
                error_message,
                created_at,
                started_at,
                finished_at,
                heartbeat_at
            FROM request_queue
            ORDER BY created_at DESC
            FETCH FIRST 100 ROWS ONLY
        `);

        const modelStats = useCanonicalModels
            ? await safeSingleRow(`
                SELECT
                    (SELECT COUNT(*) FROM canonical_models) AS total_models,
                    (SELECT COUNT(*) FROM canonical_models WHERE is_active = 1) AS active_models,
                    (SELECT COUNT(*) FROM canonical_models WHERE is_active = 1 AND deprecation_date IS NOT NULL AND deprecation_date <= CURRENT_TIMESTAMP) AS deprecated_models,
                    (SELECT COUNT(*) FROM canonical_model_provider_routes WHERE is_active = 1) AS total_mappings,
                    (SELECT COUNT(*) FROM canonical_model_aliases WHERE is_active = 1) AS total_aliases
                FROM DUAL
            `, {}, { TOTAL_MODELS: 0, ACTIVE_MODELS: 0, DEPRECATED_MODELS: 0, TOTAL_MAPPINGS: 0, TOTAL_ALIASES: 0 })
            : await safeSingleRow(`
                SELECT
                    (SELECT COUNT(*) FROM model_catalog) AS total_models,
                    (SELECT COUNT(*) FROM model_catalog WHERE is_active = 1) AS active_models,
                    (SELECT COUNT(*) FROM model_catalog WHERE is_active = 1 AND deprecation_date IS NOT NULL AND deprecation_date <= CURRENT_TIMESTAMP) AS deprecated_models,
                    (SELECT COUNT(*) FROM model_provider_mappings WHERE is_active = 1) AS total_mappings,
                    0 AS total_aliases
                FROM DUAL
            `, {}, { TOTAL_MODELS: 0, ACTIVE_MODELS: 0, DEPRECATED_MODELS: 0, TOTAL_MAPPINGS: 0, TOTAL_ALIASES: 0 });

        const providerStats = getSupportedProviderNames().map(providerName => ({
            PROVIDER_NAME: providerName,
            CONFIG_SOURCE: 'env',
            IS_CONFIGURED: true
        }));

        const providerRecentUsage = await safeQuery(`
            SELECT
                provider_name,
                endpoint,
                model,
                status_code,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                usage_units,
                usage_counter_type,
                created_at,
                error_message
            FROM provider_usage_logs
            ORDER BY created_at DESC
            FETCH FIRST 200 ROWS ONLY
        `);

        const providerKeys = [];

        const recentAdminOperations = hasAdminAuditTables
            ? await safeQuery(`
                SELECT
                    id,
                    operation_type,
                    reason,
                    created_by,
                    created_at
                FROM admin_user_operation_batches
                ORDER BY created_at DESC
                FETCH FIRST 50 ROWS ONLY
            `)
            : [];

        res.status(200).json({
            stats,
            keys,
            usageLogs,
            recentUsage: usageLogs,
            demoSessions,
            chartData,
            providerStats,
            providerRecentUsage,
            providerKeys,
            queueStats,
            recentQueue,
            userStats,
            announcements,
            tiers,
            modelStats,
            recentAdminOperations,
            providerConfigMode: 'env'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
