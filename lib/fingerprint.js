/**
 * Browser Fingerprinting for Anti-Abuse
 * 
 * Generates composite hashes from fingerprint + IP + date
 * for robust tracking that survives localStorage clearing.
 */

import crypto from 'crypto';

/**
 * Generate composite hash for tracking
 * Combines fingerprint + IP + date for robust tracking
 * 
 * @param {object} fingerprint - Browser fingerprint object from client
 * @param {string} ip - Client IP address
 * @param {string} userAgent - User agent string
 * @returns {string} - SHA-256 hash
 */
export function generateCompositeHash(fingerprint, ip, userAgent) {
    // Extract stable components from fingerprint
    const stableComponents = {
        // Canvas fingerprint (very stable)
        canvas: fingerprint?.canvas ? hashString(fingerprint.canvas.substring(0, 100)) : null,
        
        // WebGL renderer (stable per device)
        webgl: fingerprint?.webgl?.renderer || null,
        
        // Screen dimensions (stable per device)
        screen: fingerprint?.screen 
            ? `${fingerprint.screen.width}x${fingerprint.screen.height}` 
            : null,
        
        // Timezone (stable per location)
        timezone: fingerprint?.timezone || null,
        
        // IP address (changes with VPN, but combined with fingerprint)
        ip: ip || 'unknown',
        
        // Date changes daily, so same device gets fresh limit each day
        date: new Date().toDateString()
    };
    
    // Create deterministic string for hashing
    const hashInput = JSON.stringify(stableComponents, Object.keys(stableComponents).sort());
    
    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Generate fingerprint hash (without IP/date)
 * Used for identifying devices across sessions
 * 
 * @param {object} fingerprint - Browser fingerprint object
 * @returns {string} - SHA-256 hash
 */
export function generateFingerprintHash(fingerprint) {
    if (!fingerprint) return null;
    
    const components = {
        canvas: fingerprint.canvas ? hashString(fingerprint.canvas.substring(0, 100)) : null,
        webgl: fingerprint.webgl?.renderer || null,
        screen: fingerprint.screen 
            ? `${fingerprint.screen.width}x${fingerprint.screen.height}x${fingerprint.screen.colorDepth}`
            : null,
        timezone: fingerprint.timezone || null,
        language: fingerprint.language || null,
        platform: fingerprint.platform || null,
        hardwareConcurrency: fingerprint.hardwareConcurrency || null
    };
    
    const hashInput = JSON.stringify(components, Object.keys(components).sort());
    return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Simple string hash for truncating long values
 * @param {string} str - String to hash
 * @returns {string} - First 16 chars of MD5 hash
 */
function hashString(str) {
    if (!str) return null;
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

/**
 * Validate fingerprint structure
 * @param {object} fp - Fingerprint object to validate
 * @returns {boolean} - Whether fingerprint is valid
 */
export function validateFingerprint(fp) {
    if (!fp || typeof fp !== 'object') return false;
    
    // At minimum, we need some identifying information
    const hasCanvas = fp.canvas && typeof fp.canvas === 'string';
    const hasWebGL = fp.webgl && typeof fp.webgl === 'object';
    const hasScreen = fp.screen && typeof fp.screen === 'object';
    
    return hasCanvas || hasWebGL || hasScreen;
}

/**
 * Check if fingerprint indicates a bot/automation
 * This is a basic check - more sophisticated detection can be added
 * @param {object} fp - Fingerprint object
 * @returns {object} - { isSuspicious: boolean, reasons: string[] }
 */
export function checkSuspiciousFingerprint(fp) {
    const reasons = [];
    
    // Check for headless browser indicators
    if (fp.webdriver === true) {
        reasons.push('webdriver_detected');
    }
    
    // Check for missing common properties
    if (!fp.language || !fp.platform) {
        reasons.push('missing_common_properties');
    }
    
    // Check for unrealistic screen dimensions
    if (fp.screen) {
        if (fp.screen.width < 100 || fp.screen.height < 100) {
            reasons.push('unrealistic_screen_dimensions');
        }
    }
    
    // Check for missing canvas (could indicate canvas blocking)
    if (!fp.canvas) {
        reasons.push('canvas_blocked');
    }
    
    return {
        isSuspicious: reasons.length > 0,
        reasons
    };
}

export default {
    generateCompositeHash,
    generateFingerprintHash,
    validateFingerprint,
    checkSuspiciousFingerprint
};
