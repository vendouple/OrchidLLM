/**
 * lib/auth.js — GitHub OAuth + Session Management
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { appendSetCookie, serializeCookie } from './api-helpers.js';

const SESSION_SECRET = () => process.env.SESSION_SECRET || 'dev-fallback-secret-change-me';

// ── OAuth Helpers ───────────────────────────────────────────────────────────

export function generateState() {
    return randomBytes(20).toString('hex');
}

export function getBaseUrl(req) {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const proto = req.headers?.['x-forwarded-proto'] || 'http';
    const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000';
    return `${proto}://${host}`;
}

export function getGitHubAuthUrl(state, req) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) throw new Error('GITHUB_CLIENT_ID not set');
    const redirectUri = `${getBaseUrl(req)}/api/auth/callback/github`;
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=read:user,user:email`;
}

export async function exchangeCodeForToken(code) {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }),
    });
    return resp.json();
}

export async function getGitHubUser(accessToken) {
    const resp = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
    const user = await resp.json();
    // Fetch primary email if not public
    if (!user.email) {
        try {
            const emailResp = await fetch('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
            });
            const emails = await emailResp.json();
            const primary = emails.find(e => e.primary) || emails[0];
            if (primary) user.email = primary.email;
        } catch { /* email optional */ }
    }
    return user;
}

// ── User Persistence ────────────────────────────────────────────────────────

export async function findOrCreateUserFromGitHub(ghUser) {
    const { executeQuery } = await import('./oracle.js');
    const adminHandles = (process.env.ADMIN_GITHUB_HANDLES || '').split(',').map(h => h.trim().toLowerCase());
    const isAdmin = adminHandles.includes((ghUser.login || '').toLowerCase());

    // Check if user exists via auth provider
    const existing = await executeQuery(`
        SELECT u.* FROM users u
        JOIN user_auth_providers uap ON uap.user_id = u.id
        WHERE uap.provider = 'github' AND uap.provider_user_id = :ghId
    `, { ghId: String(ghUser.id) });

    if (existing.rows.length) {
        const user = existing.rows[0];
        // Update avatar/email if changed
        await executeQuery(`
            UPDATE users SET avatar_url = :avatar, email = COALESCE(:email, email),
                role = CASE WHEN :isAdmin = 1 THEN 'admin' ELSE role END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        `, { avatar: ghUser.avatar_url, email: ghUser.email, isAdmin: isAdmin ? 1 : 0, id: user.ID });
        return { ...user, id: user.ID, isAdmin: isAdmin || user.ROLE === 'admin' };
    }

    // Create new user
    const referralCode = randomBytes(8).toString('hex');
    const result = await executeQuery(`
        INSERT INTO users (username, display_name, email, avatar_url, role, referral_code)
        VALUES (:username, :displayName, :email, :avatar, :role, :referralCode)
        RETURNING id INTO :outId
    `, {
        username: ghUser.login,
        displayName: ghUser.name || ghUser.login,
        email: ghUser.email || null,
        avatar: ghUser.avatar_url || null,
        role: isAdmin ? 'admin' : 'user',
        referralCode,
        outId: { dir: 'out', type: 'NUMBER' },
    });
    const userId = Array.isArray(result.outBinds?.outId) ? result.outBinds.outId[0] : result.outBinds?.outId;

    // Link auth provider
    await executeQuery(`
        INSERT INTO user_auth_providers (user_id, provider, provider_user_id, email)
        VALUES (:userId, 'github', :ghId, :email)
    `, { userId, ghId: String(ghUser.id), email: ghUser.email || null });

    // Assign default tier
    try {
        const tierSetting = await executeQuery(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'default_signup_tier' AND is_active = 1");
        const tierName = tierSetting.rows[0]?.SETTING_VALUE || 'Free';
        const tier = await executeQuery('SELECT id FROM subscription_tiers WHERE name = :name AND is_active = 1', { name: tierName });
        if (tier.rows.length) {
            await executeQuery(`
                INSERT INTO user_subscriptions (user_id, tier_id, status, billing_cycle, current_period_end)
                VALUES (:userId, :tierId, 'active', 'monthly', ADD_MONTHS(CURRENT_TIMESTAMP, 1))
            `, { userId, tierId: tier.rows[0].ID });
            // Init credits
            await executeQuery(`
                INSERT INTO user_credits (user_id, credits_standard, credits_fast)
                SELECT :userId, st.credits_standard_monthly, st.credits_fast_monthly
                FROM subscription_tiers st WHERE st.id = :tierId
            `, { userId, tierId: tier.rows[0].ID });
        }
    } catch (err) { console.error('[auth] Default tier assignment error:', err.message); }

    return { id: userId, isAdmin };
}

// ── Session Management ──────────────────────────────────────────────────────

export function createSession(ghUser, dbUserId, opts = {}) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const payload = {
        userId: dbUserId,
        githubUsername: ghUser.login,
        githubAvatar: ghUser.avatar_url,
        isAdmin: opts.isAdmin || false,
        exp: expiresAt,
        iat: Date.now(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', SESSION_SECRET()).update(payloadB64).digest('hex');
    return { sessionId: `${payloadB64}.${sig}`, expiresAt };
}

export function setSessionCookie(res, sessionId, expiresAt) {
    appendSetCookie(res, serializeCookie('orchid_session', sessionId, {
        maxAge: Math.floor((expiresAt - Date.now()) / 1000),
        httpOnly: true,
        sameSite: 'lax',
    }));
}

export function clearSessionCookie(res) {
    appendSetCookie(res, serializeCookie('orchid_session', '', { maxAge: 0 }));
}

export function sendRedirect(res, url) {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
}
