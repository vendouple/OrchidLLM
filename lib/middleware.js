/**
 * lib/middleware.js — Shared Vercel Serverless Middleware
 *
 * Provides wrapper functions for auth and admin checks.
 * Usage: export default withAdmin(handler) or withAuth(handler)
 */

import { resolveAuthContext, applyCors, sendError } from './api-helpers.js';

/**
 * Wrap a handler with CORS + OPTIONS handling.
 */
export function withCors(handler) {
    return async (req, res) => {
        applyCors(req, res);
        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
        }
        return handler(req, res);
    };
}

/**
 * Wrap a handler with authentication requirement.
 * Sets req.auth with the resolved auth context.
 */
export function withAuth(handler) {
    return withCors(async (req, res) => {
        const auth = await resolveAuthContext(req);
        if (!auth.authenticated) {
            return sendError(res, 401, 'unauthorized', 'Authentication required.');
        }
        req.auth = auth;
        return handler(req, res);
    });
}

/**
 * Wrap a handler with admin role requirement.
 */
export function withAdmin(handler) {
    return withCors(async (req, res) => {
        const auth = await resolveAuthContext(req);
        if (!auth.authenticated) {
            return sendError(res, 401, 'unauthorized', 'Authentication required.');
        }
        if (!auth.isAdmin) {
            return sendError(res, 403, 'forbidden', 'Admin access required.');
        }
        req.auth = auth;
        return handler(req, res);
    });
}

/**
 * Wrap a handler with cron secret verification.
 */
export function withCron(handler) {
    return async (req, res) => {
        const expected = process.env.CRON_SECRET;
        const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
        if (isProd && !expected) {
            return sendError(res, 500, 'config_error', 'CRON_SECRET not configured.');
        }
        if (expected) {
            const auth = req.headers?.authorization || '';
            const cronHeader = req.headers?.['x-cron-secret'];
            if (auth !== `Bearer ${expected}` && cronHeader !== expected) {
                return sendError(res, 401, 'unauthorized', 'Invalid cron secret.');
            }
        }
        return handler(req, res);
    };
}
