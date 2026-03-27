// Backend-facing helpers and API calls
// Modified to route through Vercel serverless backend

// Backend proxy base URL (same origin)
export const API_BASE = window.location.origin;
export const POLL_BASE = `${API_BASE}/api`;

// Legacy: Direct Pollinations URL (for fallback)
export const POLL_DIRECT = 'https://gen.pollinations.ai';

// Demo key is now managed by backend
export const DEMO_API_KEY = ''; // Empty - backend handles demo mode
export const DEFAULT_BYOP_KEY = '';

// ============================================
// Session Management
// ============================================

const SESSION_KEY = 'orchid_session_id';

export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `nobindes_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ============================================
// Browser Fingerprinting
// ============================================

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    return canvas.toDataURL();
  } catch (e) {
    return null;
  }
}

function getWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return null;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;
    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    };
  } catch (e) {
    return null;
  }
}

export async function getFingerprint() {
  return {
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    webdriver: navigator.webdriver
  };
}

// ============================================
// API Key Helpers
// ============================================

export function getActiveApiKey(apiMode = 'demo', byopKey = '') {
  if (apiMode === 'byop') {
    const key = (byopKey || DEFAULT_BYOP_KEY).trim();
    // Append BYOP_ prefix for backend to recognize
    if (key && (key.startsWith('sk_') || key.startsWith('pk_'))) {
      return `BYOP_${key}`;
    }
    return key;
  }
  // Demo mode - no key needed, backend handles it
  return '';
}

export function getAuthHeaders(apiMode = 'demo', byopKey = '') {
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId()
  };
  
  const key = getActiveApiKey(apiMode, byopKey);
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  
  return headers;
}

// ============================================
// API Calls (routed through backend)
// ============================================

export function getImageUrl(prompt, modelId, extras = {}, apiMode = 'demo', byopKey = '') {
  // Image URLs still go directly to Pollinations (no need for backend proxy)
  const encoded = encodeURIComponent(prompt || '');
  const params = new URLSearchParams({ model: modelId, nologo: 'true', ...extras });
  
  // For BYOP mode, include the key
  if (apiMode === 'byop' && byopKey) {
    params.set('key', byopKey);
  }
  // Demo mode uses the shared key (no key in URL)
  
  return `${POLL_DIRECT}/image/${encoded}?${params.toString()}`;
}

export async function fetchModelCatalog() {
  const fetchOptions = location.protocol === 'file:' ? {} : { cache: 'no-cache' };
  
  // Try backend first, fallback to local
  try {
    const res = await fetch(`${API_BASE}/api/models`, fetchOptions);
    if (res.ok) return res.json();
  } catch (e) {
    // Fallback to local
  }
  
  const res = await fetch('./models.json', fetchOptions);
  if (!res.ok) throw new Error('Unable to read models catalog');
  return res.json();
}

export async function fetchSuggestions() {
  const fetchOpts = location.protocol === 'file:' ? {} : { cache: 'no-cache' };
  const res = await fetch('./suggestionstrip.json', fetchOpts);
  if (!res.ok) throw new Error('Unable to load suggestions');
  return res.json();
}

export async function fetchTextCompletion(body, apiMode, byopKey) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId()
  };
  
  // Add fingerprint for demo mode
  if (apiMode === 'demo') {
    headers['X-Fingerprint'] = JSON.stringify(await getFingerprint());
  }
  
  // Handle BYOP mode
  if (apiMode === 'byop' && byopKey) {
    const prefixedKey = (byopKey.startsWith('sk_') || byopKey.startsWith('pk_'))
      ? `BYOP_${byopKey}`
      : byopKey;
    headers['Authorization'] = `Bearer ${prefixedKey}`;
  }
  
  const res = await fetch(`${API_BASE}/api/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `API error ${res.status}`);
  }
  
  return res.json();
}

export async function fetchImageGeneration(body, apiMode, byopKey) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId()
  };
  
  if (apiMode === 'demo') {
    headers['X-Fingerprint'] = JSON.stringify(await getFingerprint());
  }
  
  if (apiMode === 'byop' && byopKey) {
    const prefixedKey = (byopKey.startsWith('sk_') || byopKey.startsWith('pk_'))
      ? `BYOP_${byopKey}`
      : byopKey;
    headers['Authorization'] = `Bearer ${prefixedKey}`;
  }
  
  const res = await fetch(`${API_BASE}/api/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `API error ${res.status}`);
  }
  
  return res.json();
}

export async function fetchVideoGeneration(body, apiMode, byopKey) {
  // Video generation - route through backend
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId()
  };
  
  if (apiMode === 'demo') {
    headers['X-Fingerprint'] = JSON.stringify(await getFingerprint());
  }
  
  if (apiMode === 'byop' && byopKey) {
    const prefixedKey = (byopKey.startsWith('sk_') || byopKey.startsWith('pk_'))
      ? `BYOP_${byopKey}`
      : byopKey;
    headers['Authorization'] = `Bearer ${prefixedKey}`;
  }
  
  const res = await fetch(`${API_BASE}/api/video/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `API error ${res.status}`);
  }
  
  return res.json();
}

export async function fetchAudioGeneration(body, apiMode, byopKey) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId()
  };
  
  if (apiMode === 'demo') {
    headers['X-Fingerprint'] = JSON.stringify(await getFingerprint());
  }
  
  if (apiMode === 'byop' && byopKey) {
    const prefixedKey = (byopKey.startsWith('sk_') || byopKey.startsWith('pk_'))
      ? `BYOP_${byopKey}`
      : byopKey;
    headers['Authorization'] = `Bearer ${prefixedKey}`;
  }
  
  const res = await fetch(`${API_BASE}/api/audio/speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `API error ${res.status}`);
  }
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.blob();
}

export async function fetchTranscription(body, apiMode, byopKey) {
  const isFormData = body instanceof FormData;
  
  const headers = {
    'X-Session-ID': getSessionId()
  };
  
  if (apiMode === 'demo') {
    headers['X-Fingerprint'] = JSON.stringify(await getFingerprint());
  }
  
  if (apiMode === 'byop' && byopKey) {
    const prefixedKey = (byopKey.startsWith('sk_') || byopKey.startsWith('pk_'))
      ? `BYOP_${byopKey}`
      : byopKey;
    headers['Authorization'] = `Bearer ${prefixedKey}`;
  }
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  const res = await fetch(`${API_BASE}/api/audio/transcriptions`, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `API error ${res.status}`);
  }
  
  return res.json();
}

// ============================================
// Auth Helpers
// ============================================

export async function checkAuthSession() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`);
    return res.json();
  } catch (e) {
    return { authenticated: false };
  }
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  } catch (e) {
    // Ignore
  }
}

export function getLoginUrl() {
  return `${API_BASE}/api/auth/github`;
}
