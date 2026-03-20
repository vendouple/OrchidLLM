// Backend-facing helpers and API calls

export const POLL_BASE = 'https://gen.pollinations.ai';
export const DEMO_API_KEY = 'pk_BU8jPqG7RBj8yOxh';
export const DEFAULT_BYOP_KEY = 'pk_dfgOjlw1zrrhB5eZ';

export function getActiveApiKey(apiMode = 'demo', byopKey = '') {
  if (apiMode === 'byop') {
    return (byopKey || DEFAULT_BYOP_KEY).trim();
  }
  return DEMO_API_KEY;
}

export function getAuthHeaders(apiMode = 'demo', byopKey = '') {
  const key = getActiveApiKey(apiMode, byopKey);
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export function getImageUrl(prompt, modelId, extras = {}, apiMode = 'demo', byopKey = '') {
  const encoded = encodeURIComponent(prompt || '');
  const params = new URLSearchParams({ model: modelId, nologo: 'true', ...extras });
  const key = getActiveApiKey(apiMode, byopKey);
  if (key) params.set('key', key);
  return `${POLL_BASE}/image/${encoded}?${params.toString()}`;
}

export async function fetchModelCatalog() {
  const fetchOptions = location.protocol === 'file:' ? {} : { cache: 'no-cache' };
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
  const res = await fetch(`${POLL_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(apiMode, byopKey) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchImageGeneration(body, apiMode, byopKey) {
  const res = await fetch(`${POLL_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(apiMode, byopKey) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchVideoGeneration(body, apiMode, byopKey) {
  const res = await fetch(`${POLL_BASE}/v1/video/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(apiMode, byopKey) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchAudioGeneration(body, apiMode, byopKey) {
  const res = await fetch(`${POLL_BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(apiMode, byopKey) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.blob();
}

export async function fetchTranscription(body, apiMode, byopKey) {
  const isFormData = body instanceof FormData;
  const res = await fetch(`${POLL_BASE}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: isFormData ? { ...getAuthHeaders(apiMode, byopKey) } : { 'Content-Type': 'application/json', ...getAuthHeaders(apiMode, byopKey) },
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
