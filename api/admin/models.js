/**
 * DEPRECATED: /api/admin/models
 * 
 * This endpoint has been replaced by /api/admin/catalog which provides
 * a unified interface for model + mapping CRUD.
 * 
 * All requests are redirected to /api/admin/catalog.
 */

import catalogHandler from './catalog.js';

export default async function handler(req, res) {
    console.warn('[admin/models] DEPRECATED: Use /api/admin/catalog instead');
    return catalogHandler(req, res);
}
