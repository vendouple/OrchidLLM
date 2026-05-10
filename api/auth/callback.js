/**
 * /api/auth/callback - GitHub OAuth Callback
 * 
 * Handles the OAuth callback from GitHub.
 * Only allows @vendouple to sign in.
 * Uses stateless HMAC-signed session cookies — no DB required.
 */

import { 
    exchangeCodeForToken, 
    getGitHubUser, 
    isAdmin, 
    createSession,
    setSessionCookie,
    clearSessionCookie,
    sendRedirect
} from '../../lib/auth.js';
import { executeQuery } from '../../lib/oracle.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { code, state } = req.query;
    
    // Validate required parameters
    if (!code) {
        return sendRedirect(res, '/?error=no_code');
    }
    
    // Validate state (CSRF protection)
    const cookies = req.headers.cookie || '';
    const stateMatch = cookies.match(/oauth_state=([^;]+)/);
    const storedState = stateMatch ? decodeURIComponent(stateMatch[1]) : null;
    
    if (!storedState || storedState !== state) {
        console.error('State mismatch:', { storedState, receivedState: state });
        return sendRedirect(res, '/?error=invalid_state');
    }
    
    // Clear the oauth_state cookie immediately
    res.setHeader('Set-Cookie', [
        'oauth_state=',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Max-Age=0'
    ].join('; '));

    try {
        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code);
        
        if (tokenData.error) {
            console.error('Token exchange error:', tokenData.error, tokenData.error_description);
            return sendRedirect(res, `/?error=${encodeURIComponent(tokenData.error)}`);
        }
        
        if (!tokenData.access_token) {
            return sendRedirect(res, '/?error=no_access_token');
        }

        // Get user info
        const user = await getGitHubUser(tokenData.access_token);
        
        // Ensure user exists in DB and get their DB ID
        let dbUserId = null;
        try {
            const githubId = user?.id == null ? null : String(user.id);
            const login = typeof user?.login === 'string' ? user.login : null;
            const avatar = typeof user?.avatar_url === 'string' ? user.avatar_url : null;
            const isUserAdmin = login ? (isAdmin(login) ? 1 : 0) : 0;

            // Resolve default tier for new users from system_settings
            let tierId = null;
            try {
                if (isUserAdmin) {
                    // Admin: use highest sort_order tier
                    const adminTierRes = await executeQuery(
                        `SELECT id FROM tiers WHERE is_active = 1 ORDER BY sort_order DESC FETCH FIRST 1 ROWS ONLY`
                    );
                    tierId = adminTierRes.rows?.[0]?.ID ?? null;
                    // Admin fallback: if no tier found by sort_order, use any active tier
                    if (!tierId) {
                        const anyTierRes = await executeQuery(
                            `SELECT id FROM tiers WHERE is_active = 1 FETCH FIRST 1 ROWS ONLY`
                        );
                        tierId = anyTierRes.rows?.[0]?.ID ?? null;
                    }
                } else {
                    // Try system_settings default_signup_tier_id first
                    const settingRes = await executeQuery(
                        `SELECT setting_value FROM system_settings WHERE setting_key = 'default_signup_tier_id' AND is_active = 1 FETCH FIRST 1 ROWS ONLY`
                    );
                    const settingVal = settingRes.rows?.[0]?.SETTING_VALUE ?? null;
                    if (settingVal != null && String(settingVal).trim() !== '' && !isNaN(Number(settingVal))) {
                        // Verify the configured tier exists and is active
                        const verifyRes = await executeQuery(
                            `SELECT id FROM tiers WHERE id = :id AND is_active = 1 FETCH FIRST 1 ROWS ONLY`,
                            { id: Number(settingVal) }
                        );
                        tierId = verifyRes.rows?.[0]?.ID ?? null;
                        if (!tierId) {
                            console.warn(`[auth/callback] default_signup_tier_id=${settingVal} not found or inactive, falling back`);
                        }
                    }
                    // Fall back to lowest sort_order active tier
                    if (!tierId) {
                        const fallbackRes = await executeQuery(
                            `SELECT id FROM tiers WHERE is_active = 1 ORDER BY sort_order ASC FETCH FIRST 1 ROWS ONLY`
                        );
                        tierId = fallbackRes.rows?.[0]?.ID ?? null;
                    }
                }
            } catch (tierErr) {
                console.error('[auth/callback] Could not resolve tier:', tierErr.message);
                // Last-resort fallback: try to get any active tier
                try {
                    const rescueRes = await executeQuery(
                        `SELECT id FROM tiers WHERE is_active = 1 ORDER BY sort_order ASC FETCH FIRST 1 ROWS ONLY`
                    );
                    tierId = rescueRes.rows?.[0]?.ID ?? null;
                } catch (rescueErr) {
                    console.error('[auth/callback] Rescue tier query also failed:', rescueErr.message);
                }
            }


            // Try to find existing user first
            const existingUserResult = await executeQuery(
                `SELECT id, billing_cycle_end FROM users WHERE github_id = :githubId`,
                { githubId }
            );

            if (existingUserResult.rows && existingUserResult.rows.length > 0) {
                const existingUser = existingUserResult.rows[0];
                dbUserId = existingUser.ID;

                // Update existing user
                // If billing cycle has ended, we might need to reset cycle, but we'll leave that to the credits engine or a middleware.
                // For now, just update login info.
                await executeQuery(
                    `UPDATE users 
                     SET github_username = :login, 
                         github_avatar = :avatar, 
                         last_seen = CURRENT_TIMESTAMP
                     WHERE id = :id`,
                    {
                        login,
                        avatar,
                        id: dbUserId
                    }
                );
            } else {
                // New user - tierId already resolved above
                if (!tierId) {
                    console.error('[auth/callback] Cannot create new user: no active tiers available for signup');
                    return sendRedirect(res, '/?error=no_active_tiers');
                }

                await executeQuery(
                    `INSERT INTO users (
                        github_id, github_username, github_avatar, tier_id, is_admin,
                        billing_cycle_start, billing_cycle_end
                    ) VALUES (
                        :githubId, :login, :avatar, :tierId, :isAdmin,
                        CURRENT_TIMESTAMP, ADD_MONTHS(CURRENT_TIMESTAMP, 1)
                    )`,
                    {
                        githubId,
                        login,
                        avatar,
                        tierId,
                        isAdmin: isUserAdmin
                    }
                );

                // Retrieve the newly inserted user's ID
                const newUserResult = await executeQuery(
                    `SELECT id FROM users WHERE github_id = :githubId`,
                    { githubId }
                );
                if (newUserResult.rows && newUserResult.rows.length > 0) {
                    dbUserId = newUserResult.rows[0].ID;
                }
            }
        } catch (dbError) {
            console.error('Failed to upsert user in DB:', dbError);
            // We can still proceed with stateless session, but won't have dbUserId
        }
        
        // Create stateless session token (with DB ID if we have it)
        const { sessionId, expiresAt } = await createSession(user, dbUserId);
        
        // Set session cookie
        setSessionCookie(res, sessionId, expiresAt);
        
        // Redirect to home
        sendRedirect(res, '/');
    } catch (error) {
        console.error('OAuth callback error:', error);
        sendRedirect(res, `/?error=${encodeURIComponent(error.message)}`);
    }
}
