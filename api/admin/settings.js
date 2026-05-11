/**
 * /api/admin/settings — System Settings CRUD
 */
import { withAdmin } from '../../lib/middleware.js';
import { executeQuery } from '../../lib/oracle.js';
import { sendJson, sendError, readJsonBody } from '../../lib/api-helpers.js';

async function handler(req, res) {
    const key = req.query?.key;

    if (req.method === 'GET') {
        if (key) {
            const r = await executeQuery(
                'SELECT * FROM system_settings WHERE setting_key = :key', { key });
            if (!r.rows.length) return sendError(res, 404, 'not_found', 'Setting not found.');
            return sendJson(res, 200, r.rows[0]);
        }
        const r = await executeQuery('SELECT * FROM system_settings ORDER BY setting_key ASC');
        return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'POST') {
        const b = await readJsonBody(req);
        if (!b.setting_key) return sendError(res, 400, 'missing_field', 'setting_key required.');
        await executeQuery(`
            INSERT INTO system_settings (setting_key, setting_value, description, is_active, updated_by)
            VALUES (:key, :val, :desc, 1, :updatedBy)
        `, {
            key: b.setting_key, val: b.setting_value || null,
            desc: b.description || null, updatedBy: req.auth?.userId || null
        });
        return sendJson(res, 201, { message: 'Setting created.' });
    }

    if (req.method === 'PUT') {
        if (!key) return sendError(res, 400, 'missing_key', 'key query param required.');
        const b = await readJsonBody(req);
        const sets = ['updated_at = CURRENT_TIMESTAMP', 'updated_by = :updatedBy'];
        const binds = { key, updatedBy: req.auth?.userId || null };
        if (b.setting_value !== undefined) { binds.val = b.setting_value; sets.push('setting_value = :val'); }
        if (b.description !== undefined) { binds.desc = b.description; sets.push('description = :desc'); }
        if (b.is_active !== undefined) { binds.ia = b.is_active ? 1 : 0; sets.push('is_active = :ia'); }
        await executeQuery(
            `UPDATE system_settings SET ${sets.join(', ')} WHERE setting_key = :key`, binds);
        return sendJson(res, 200, { message: 'Setting updated.' });
    }

    if (req.method === 'DELETE') {
        if (!key) return sendError(res, 400, 'missing_key', 'key required.');
        await executeQuery(
            'UPDATE system_settings SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE setting_key = :key',
            { key });
        return sendJson(res, 200, { message: 'Setting deactivated.' });
    }

    return sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
}

export default withAdmin(handler);
