/**
 * GET /api/auth/session — Check current session status
 *
 * Returns user info if authenticated, or { authenticated: false }.
 */
import { resolveAuthContext, applyCors, sendJson } from '../../lib/api-helpers.js';

export default async function handler(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

    const auth = await resolveAuthContext(req);

    if (!auth.authenticated || auth.type === 'anonymous') {
        return sendJson(res, 200, { authenticated: false });
    }

    const payload = {
        authenticated: true,
        type: auth.type,
        isAdmin: auth.isAdmin || false,
        modelAccessTier: auth.modelAccessTier || 'free',
    };

    if (auth.type === 'session' && auth.user) {
        payload.user = {
            id: auth.user.ID,
            username: auth.user.USERNAME,
            displayName: auth.user.DISPLAY_NAME,
            email: auth.user.EMAIL,
            avatarUrl: auth.user.AVATAR_URL,
            role: auth.user.ROLE,
            tierId: auth.tierId,
            tierName: auth.tierName,
        };
    } else if (auth.type === 'session' && auth.session) {
        payload.user = {
            githubUsername: auth.session.githubUsername,
            avatarUrl: auth.session.githubAvatar,
            isAdmin: auth.session.isAdmin,
        };
    }

    return sendJson(res, 200, payload);
}
