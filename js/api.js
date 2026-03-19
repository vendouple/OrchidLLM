// js/api.js
import { state } from './state.js';

const API_BASE = 'https://gen.pollinations.ai';

const TEXT_MODEL_CATALOG = [
  { name: 'openai', description: 'OpenAI GPT-5 Mini - Fast and balanced', tags: ['tools'] },
  { name: 'openai-fast', description: 'OpenAI GPT-5 Nano - Ultra fast', tags: ['tools'] },
  { name: 'openai-large', description: 'OpenAI GPT-5.2 - Most capable', tags: ['tools', 'reasoning'], paid: true },
  { name: 'qwen-coder', description: 'Qwen3 Coder 30B', tags: ['tools'] },
  { name: 'mistral', description: 'Mistral Small 3.2', tags: ['tools'] },
  { name: 'openai-audio', description: 'GPT-4o Mini Audio', tags: ['tools', 'audio-in', 'audio-out'] },
  { name: 'gemini', description: 'Gemini 3 Flash', tags: ['tools', 'search', 'code-exec'], paid: true },
  { name: 'gemini-fast', description: 'Gemini 2.5 Flash Lite', tags: ['tools', 'search', 'code-exec'] },
  { name: 'deepseek', description: 'DeepSeek V3.2', tags: ['tools', 'reasoning'] },
  { name: 'grok', description: 'Grok 4 Fast', tags: ['tools'], paid: true },
  { name: 'gemini-search', description: 'Gemini with Google Search', tags: ['search', 'code-exec'] },
  { name: 'midijourney', description: 'MIDIjourney', tags: ['tools'] },
  { name: 'claude-fast', description: 'Claude Haiku 4.5', tags: ['tools'] },
  { name: 'claude', description: 'Claude Sonnet 4.6', tags: ['tools'], paid: true },
  { name: 'claude-large', description: 'Claude Opus 4.6', tags: ['tools'], paid: true },
  { name: 'perplexity-fast', description: 'Perplexity Sonar', tags: ['search'] },
  { name: 'perplexity-reasoning', description: 'Perplexity Sonar Reasoning', tags: ['reasoning', 'search'] },
  { name: 'kimi', description: 'Moonshot Kimi K2.5', tags: ['tools', 'reasoning', 'vision'] },
  { name: 'gemini-large', description: 'Gemini 3.1 Pro', tags: ['tools', 'reasoning', 'search'], paid: true },
  { name: 'nova-fast', description: 'Amazon Nova Micro', tags: ['tools'] },
  { name: 'glm', description: 'Z.ai GLM-5', tags: ['tools', 'reasoning'] },
  { name: 'minimax', description: 'MiniMax M2.5', tags: ['tools', 'reasoning'] },
  { name: 'nomnom', description: 'NomNom (alpha)', tags: ['tools', 'reasoning', 'search'] },
  { name: 'polly', description: 'Polly (alpha)', tags: ['tools', 'reasoning', 'search', 'code-exec'] },
  { name: 'qwen-safety', description: 'Qwen3Guard 8B', tags: [] },
  { name: 'step-3.5-flash', description: 'Step 3.5 Flash (alpha)', tags: ['reasoning'] },
  { name: 'qwen-character', description: 'Qwen Character (alpha)', tags: [] },
  { name: 'claude-airforce', description: 'Claude Sonnet 4.6 (airforce alpha)', tags: ['tools'] },
  { name: 'openai-seraphyn', description: 'GPT-5.4 via seraphyn (alpha)', tags: ['tools'] }
];

const IMAGE_MODEL_CATALOG = [
  { name: 'kontext', description: 'FLUX.1 Kontext', tags: ['vision'], paid: true },
  { name: 'nanobanana', description: 'NanoBanana', tags: ['vision'], paid: true },
  { name: 'nanobanana-2', description: 'NanoBanana 2', tags: ['vision'], paid: true },
  { name: 'nanobanana-pro', description: 'NanoBanana Pro', tags: ['vision'], paid: true },
  { name: 'seedream5', description: 'Seedream 5.0 Lite', tags: ['vision', 'search', 'reasoning'], paid: true },
  { name: 'gptimage', description: 'GPT Image 1 Mini', tags: ['vision'] },
  { name: 'gptimage-large', description: 'GPT Image 1.5', tags: ['vision'], paid: true },
  { name: 'flux', description: 'Flux Schnell', tags: [] },
  { name: 'zimage', description: 'Z-Image Turbo', tags: [] },
  { name: 'klein', description: 'FLUX.2 Klein', tags: ['vision'] },
  { name: 'imagen-4', description: 'Imagen 4 (airforce)', tags: [] },
  { name: 'flux-2-dev', description: 'FLUX.2 Dev (airforce)', tags: ['vision'] },
  { name: 'grok-imagine', description: 'Grok Imagine (airforce)', tags: [] },
  { name: 'dirtberry', description: 'Dirtberry', tags: [] },
  { name: 'dirtberry-pro', description: 'Dirtberry Pro', tags: [] },
  { name: 'p-image', description: 'Pruna p-image', tags: [], paid: true },
  { name: 'p-image-edit', description: 'Pruna p-image-edit', tags: ['vision'], paid: true }
];

const VIDEO_MODEL_CATALOG = [
  { name: 'veo', description: 'Veo 3.1 Fast', tags: [], paid: true },
  { name: 'seedance', description: 'Seedance Lite', tags: [], paid: true },
  { name: 'seedance-pro', description: 'Seedance Pro-Fast', tags: [], paid: true },
  { name: 'wan', description: 'Wan 2.6', tags: ['audio-out'], paid: true },
  { name: 'grok-video', description: 'Grok Video', tags: [] },
  { name: 'ltx-2', description: 'LTX-2', tags: ['audio-out'], paid: true },
  { name: 'p-video', description: 'Pruna p-video', tags: [], paid: true }
];

const AUDIO_MODEL_CATALOG = [
  { name: 'elevenlabs', description: 'ElevenLabs v3 TTS', tags: ['audio-out'] },
  { name: 'qwen3-tts', description: 'Qwen3 TTS', tags: ['audio-out'] }
];

const MUSIC_MODEL_CATALOG = [
  { name: 'elevenmusic', description: 'ElevenLabs Music', tags: ['audio-out'] },
  { name: 'suno', description: 'Suno v5', tags: ['audio-out'] }
];

const TRANSCRIPTION_MODEL_CATALOG = [
  { name: 'whisper', description: 'Whisper Large V3', tags: ['audio-in'] },
  { name: 'scribe', description: 'ElevenLabs Scribe v2', tags: ['audio-in'] }
];

export const TAG_LABELS = {
  vision: 'Vision',
  reasoning: 'Reasoning',
  'audio-in': 'Audio In',
  search: 'Search',
  'audio-out': 'Audio Out',
  'code-exec': 'Code Exec',
  tools: 'Tools',
  unrecognized: 'Unrecognized'
};

function buildKnownModelMap() {
  const map = new Map();
  [
    ...TEXT_MODEL_CATALOG,
    ...IMAGE_MODEL_CATALOG,
    ...VIDEO_MODEL_CATALOG,
    ...AUDIO_MODEL_CATALOG,
    ...MUSIC_MODEL_CATALOG,
    ...TRANSCRIPTION_MODEL_CATALOG
  ].forEach((model) => {
    map.set(model.name, model);
  });
  return map;
}

const KNOWN_MODEL_MAP = buildKnownModelMap();

function normalizeModel(modelLike, fallbackType) {
  if (!modelLike) {
    return null;
  }

  if (typeof modelLike === 'string') {
    const known = KNOWN_MODEL_MAP.get(modelLike);
    if (known) {
      return { ...known, type: fallbackType };
    }
    return {
      name: modelLike,
      description: 'Unrecognized model',
      tags: ['unrecognized'],
      type: fallbackType
    };
  }

  const normalizedName = modelLike.name || modelLike.id || modelLike.model;
  if (!normalizedName) {
    return null;
  }

  const known = KNOWN_MODEL_MAP.get(normalizedName);
  if (known) {
    return { ...known, ...modelLike, type: modelLike.type || fallbackType };
  }

  const derivedTags = [];
  const lowered = normalizedName.toLowerCase();
  if (lowered.includes('vision') || lowered.includes('image')) derivedTags.push('vision');
  if (lowered.includes('reason') || lowered.includes('think')) derivedTags.push('reasoning');
  if (lowered.includes('search')) derivedTags.push('search');
  if (lowered.includes('audio') || lowered.includes('tts')) derivedTags.push('audio-out');

  return {
    name: normalizedName,
    description: modelLike.description || modelLike.display_name || 'Unrecognized model',
    tags: derivedTags.length ? derivedTags : ['unrecognized'],
    paid: Boolean(modelLike.paid),
    type: modelLike.type || fallbackType
  };
}

function normalizeModelArray(models, fallbackType) {
  return models
    .map((item) => normalizeModel(item, fallbackType))
    .filter(Boolean);
}

function parsePollinationsErrorBody(payload) {
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  return null;
}

async function throwRequestError(response, fallbackMessage) {
  let message = fallbackMessage;

  try {
    const payload = await response.clone().json();
    const bodyMessage = parsePollinationsErrorBody(payload);
    if (bodyMessage) {
      message = bodyMessage;
    }
  } catch {
    try {
      const text = await response.clone().text();
      if (text) message = text;
    } catch {
      // Ignore body parsing issues.
    }
  }

  if (response.status === 402) {
    throw new Error('Insufficient Pollinations balance for this key (402). Please top up or switch model/key.');
  }
  if (response.status === 401) {
    throw new Error('Invalid or missing Pollinations API key (401).');
  }

  throw new Error(`${fallbackMessage} (${response.status})${message ? `: ${message}` : ''}`);
}

function getAuthorizationHeaders() {
  const headers = {};
  const key = getApiKey();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function appendKeyParam(url) {
  const key = getApiKey();
  if (!key) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set('key', key);
  return parsed.toString();
}

async function fetchBinaryAsObjectUrl(url, fallbackMessage) {
  const response = await fetch(url, { headers: getAuthorizationHeaders() });
  if (!response.ok) {
    await throwRequestError(response, fallbackMessage);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function getApiKey() {
  if (state.authMode !== 'byop') {
    return '';
  }
  return (state.apiKey || '').trim();
}

export async function fetchModels() {
  // Base hardcoded catalog for BYOP and stable UX.
  state.availableModels.text = normalizeModelArray(TEXT_MODEL_CATALOG, 'text');
  state.availableModels.image = normalizeModelArray(IMAGE_MODEL_CATALOG, 'image');
  state.availableModels.audio = normalizeModelArray(AUDIO_MODEL_CATALOG, 'audio');
  state.availableModels.music = normalizeModelArray(MUSIC_MODEL_CATALOG, 'music');
  state.availableModels.video = normalizeModelArray(VIDEO_MODEL_CATALOG, 'video');
  state.availableModels.transcription = normalizeModelArray(TRANSCRIPTION_MODEL_CATALOG, 'transcription');

  try {
    const [textRes, imageRes] = await Promise.all([
      fetch(`${API_BASE}/v1/models`),
      fetch(`${API_BASE}/image/models`)
    ]);

    if (textRes.ok) {
      const textData = await textRes.json();
      const textModels = Array.isArray(textData?.data) ? textData.data : [];
      const normalizedExtra = normalizeModelArray(
        textModels.map((item) => ({ name: item?.id || item?.name, description: item?.description })),
        'text'
      );
      const existing = new Set(state.availableModels.text.map((m) => m.name));
      normalizedExtra.forEach((model) => {
        if (!existing.has(model.name)) {
          state.availableModels.text.push(model);
        }
      });
    }

    if (imageRes.ok) {
      const imageData = await imageRes.json();
      const sourceList = Array.isArray(imageData) ? imageData : imageData?.models || [];
      const normalizedExtra = normalizeModelArray(
        sourceList.map((item) => (typeof item === 'string' ? { name: item } : item)),
        'image'
      );

      const existingImage = new Set(state.availableModels.image.map((m) => m.name));
      const existingVideo = new Set(state.availableModels.video.map((m) => m.name));

      normalizedExtra.forEach((model) => {
        const maybeVideo = ['video', 'veo', 'wan', 'ltx', 'seedance', 'p-video', 'grok-video'].some((token) =>
          model.name.toLowerCase().includes(token)
        );

        if (maybeVideo) {
          if (!existingVideo.has(model.name)) {
            state.availableModels.video.push({ ...model, type: 'video' });
          }
          return;
        }

        if (!existingImage.has(model.name)) {
          state.availableModels.image.push({ ...model, type: 'image' });
        }
      });
    }

    return true;
  } catch (error) {
    console.error('Fetch models failed', error);
    return false;
  }
}

export async function validatePollenKey(key) {
  try {
    const response = await fetch(`${API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function generateText(prompt, model, systemPrompt, chatHistory = []) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  chatHistory.forEach((message) => {
    if (message?.role && typeof message?.content === 'string') {
      messages.push({ role: message.role, content: message.content });
    }
  });

  messages.push({ role: 'user', content: prompt });

  const response = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthorizationHeaders()
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    await throwRequestError(response, 'Text generation failed');
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response content returned.';
}

export async function generateImage(prompt, model, options = {}) {
  const seed = options.seed ?? Math.floor(Math.random() * 1000000);
  const width = options.width ?? 1024;
  const height = options.height ?? 1024;
  const enhance = options.enhance ?? false;
  const nologo = options.nologo ?? true;

  const imageUrl = `${API_BASE}/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&seed=${seed}&width=${width}&height=${height}&enhance=${enhance}&nologo=${nologo}`;
  return fetchBinaryAsObjectUrl(appendKeyParam(imageUrl), 'Image generation failed');
}

export async function generateAudio(text, model = 'elevenlabs', options = {}) {
  const voice = options.voice || 'nova';
  const body = {
    model,
    input: text,
    voice
  };

  const response = await fetch(`${API_BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthorizationHeaders()
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    await throwRequestError(response, 'Audio generation failed');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function generateMusic(prompt, model = 'elevenmusic', options = {}) {
  const duration = Number(options.duration ?? 30);
  const style = options.style || '';
  const seed = options.seed ?? Math.floor(Math.random() * 1000000);
  const finalPrompt = style ? `${prompt}. Style: ${style}` : prompt;
  const musicUrl = `${API_BASE}/audio/${encodeURIComponent(finalPrompt)}?model=${encodeURIComponent(model)}&duration=${duration}&seed=${seed}`;
  return fetchBinaryAsObjectUrl(appendKeyParam(musicUrl), 'Music generation failed');
}

export async function generateVideo(prompt, model = 'veo', options = {}) {
  const duration = Number(options.duration ?? 3);
  const audio = options.audio ?? false;
  const aspectRatio = options.aspectRatio || '16:9';
  const seed = options.seed ?? Math.floor(Math.random() * 1000000);

  // Pollinations uses /image for both image and video generation.
  const videoUrl = `${API_BASE}/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&duration=${duration}&aspectRatio=${encodeURIComponent(aspectRatio)}&audio=${audio}&seed=${seed}`;
  return fetchBinaryAsObjectUrl(appendKeyParam(videoUrl), 'Video generation failed');
}

export async function transcribeMedia(file, model = 'whisper') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);

  const response = await fetch(`${API_BASE}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      ...getAuthorizationHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    await throwRequestError(response, 'Transcription failed');
  }

  const data = await response.json();
  return data?.text || '';
}
