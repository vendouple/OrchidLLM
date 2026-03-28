/**
 * /api/auth/callback/github - Legacy alias
 *
 * Keeps backward compatibility for previously configured GitHub OAuth
 * callback URLs by delegating to /api/auth/callback.
 */

export { default } from '../callback.js';