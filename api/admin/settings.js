/**
 * /api/admin/settings
 * GET/PUT system_settings key-value pairs.
 */

import { validateSession, getSessionFromCookie } from '../../lib/auth.js';
import { executeQuery, closePool } from '../../lib/oracle.js';

async function requireAdmin(req, res) {
    const sessionId = getSessionFromCookie(req);
    const session = await validateSession(sessionId);
    if (!session || !session.isAdmin) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}

export default async function handler(req, res) {
    try {
        const session = await requireAdmin(req, res);
        if (!session) return;

        if (req.method === 'GET') {
            const key = req.query.key;
            if (key) {
                const result = await executeQuery(
                    `SELECT setting_key, setting_value, description FROM system_settings WHERE setting_key = :key`,
                    { key }
                );
                if (!result.rows || result.rows.length === 0) {
                    return res.status(200).json({ key, value: null });
                }
                const row = result.rows[0];
                return res.status(200).json({
                    key: row.SETTING_KEY,
                    value: row.SETTING_VALUE,
                    description: row.DESCRIPTION
                });
            }
            // Return all settings
            const result = await executeQuery(
                `SELECT setting_key, setting_value, description, is_active FROM system_settings ORDER BY setting_key`
            );
            return res.status(200).json((result.rows || []).map(r => ({
                key: r.SETTING_KEY,
                value: r.SETTING_VALUE,
                description: r.DESCRIPTION,
                isActive: r.IS_ACTIVE === 1
            })));
        }

        if (req.method === 'PUT') {
            const { key, value } = req.body || {};
            if (!key) return res.status(400).json({ error: 'key required' });

            // Upsert
            const existing = await executeQuery(
                `SELECT id FROM system_settings WHERE setting_key = :key`, { key }
            );
            if (existing.rows && existing.rows.length > 0) {
                await executeQuery(
                    `UPDATE system_settings SET setting_value = :value, updated_at = CURRENT_TIMESTAMP, updated_by = :updatedBy WHERE setting_key = :key`,
                    { value: value !== undefined ? String(value ?? '') : null, key, updatedBy: session.githubUsername || 'admin' }
                );
            } else {
                await executeQuery(
                    `INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (:key, :value, :updatedBy)`,
                    { key, value: value !== undefined ? String(value ?? '') : null, updatedBy: session.githubUsername || 'admin' }
                );
            }
            return res.status(200).json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[admin/settings] error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
        await closePool();
    }
}
