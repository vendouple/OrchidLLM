export const DEMO_API_KEY = 'demo';
export const DEFAULT_BYOP_KEY = '';
export const POLL_BASE = 'https://image.pollinations.ai';

const SAMPLE_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const MOCK_CATALOG = {
  text: [
    {
      id: 'openai',
      name: 'OpenAI Chat',
      desc: 'General-purpose stub chat model with tool support.',
      context: '128k',
      capabilities: ['tools', 'reasoning', 'code'],
      pro: false,
      caching: true,
      providers: ['stub'],
      tags: ['default', 'chat'],
      timeoutMs: 120000,
    },
    {
      id: 'claude-sonnet',
      name: 'Claude Sonnet',
      desc: 'Balanced reasoning model for conversational tasks.',
      context: '200k',
      capabilities: ['reasoning', 'tools', 'search'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['reasoning'],
      timeoutMs: 120000,
    },
  ],
  image: [
    {
      id: 'openai-image',
      name: 'OpenAI Image',
      desc: 'Stub image generator that returns a local SVG preview.',
      context: '32k',
      capabilities: ['vision'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['image'],
    },
  ],
  video: [
    {
      id: 'openai-video',
      name: 'OpenAI Video',
      desc: 'Stub video generator backed by a sample remote clip.',
      context: '32k',
      capabilities: ['vision'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['video'],
    },
  ],
  audio: [
    {
      id: 'openai-audio',
      name: 'OpenAI Voice',
      desc: 'Stub text-to-speech model that returns a silent WAV.',
      context: '32k',
      capabilities: ['audio-out'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['audio'],
    },
  ],
  transcription: [
    {
      id: 'scribe',
      name: 'Scribe',
      desc: 'Stub transcription model for audio uploads.',
      context: '64k',
      capabilities: ['audio-in'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['transcribe'],
    },
  ],
  tts: [
    {
      id: 'eleven-multilingual',
      name: 'ElevenLabs Multilingual v2',
      desc: 'High-fidelity text-to-speech with selectable voices (stubbed as WAV).',
      context: '32k',
      capabilities: ['audio-out', 'voices'],
      pro: true,
      caching: false,
      providers: ['stub'],
      tags: ['tts', 'voice'],
      voices: ['Rachel', 'Adam', 'Bella', 'Antoni', 'Elli'],
    },
    {
      id: 'eleven-turbo',
      name: 'ElevenLabs Turbo',
      desc: 'Low-latency TTS for realtime narration (stubbed as WAV).',
      context: '32k',
      capabilities: ['audio-out', 'voices'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['tts', 'voice'],
      voices: ['Rachel', 'Josh', 'Domi'],
    },
  ],
  music: [
    {
      id: 'suno-v4',
      name: 'Suno v4',
      desc: 'Prompt-to-song generation with a generated cover (stubbed audio).',
      context: '32k',
      capabilities: ['audio-out', 'music'],
      pro: false,
      caching: false,
      providers: ['stub'],
      tags: ['music', 'song'],
    },
  ],
};

const MOCK_SUGGESTIONS = {
  text: [
    { emoji: '✨', title: 'Draft a launch checklist', prompt: 'Create a concise launch checklist for OrchidLLM with owners and milestones.' },
    { emoji: '🧭', title: 'Map the product flow', prompt: 'Outline the main user journey from sign in to dashboard navigation.' },
    { emoji: '🛠️', title: 'Write a support reply', prompt: 'Draft a friendly support response for a user who cannot sign in.' },
  ],
  image: [
    { emoji: '🎨', title: 'Orchid poster', prompt: 'Create a vibrant orchid-themed poster with soft gradients and glassmorphism.' },
    { emoji: '🌙', title: 'Neon skyline', prompt: 'A cinematic neon skyline at night with rain reflections and glowing windows.' },
  ],
  video: [
    { emoji: '🎥', title: 'Product teaser', prompt: 'Storyboard a short product teaser with smooth camera motion and clean captions.' },
    { emoji: '🚀', title: 'Launch reel', prompt: 'Generate a launch reel concept with bold typography and energetic cuts.' },
  ],
  audio: [
    { emoji: '🎧', title: 'Calm narration', prompt: 'Write a calm, warm narration script for a product walkthrough.' },
    { emoji: '🔊', title: 'Audio demo', prompt: 'Create a short voice demo line with a clear, friendly tone.' },
  ],
  transcription: [
    { emoji: '📝', title: 'Meeting notes', prompt: 'Transcribe this meeting audio and summarize the key action items.' },
    { emoji: '🎙️', title: 'Voice memo', prompt: 'Convert this voice memo into clean, readable notes.' },
  ],
  tts: [
    { emoji: '🗣️', title: 'Product intro', prompt: 'Welcome to OrchidLLM — your unified gateway to the best AI models.' },
    { emoji: '📣', title: 'Ad read', prompt: 'Upgrade to Premium today and unlock 1M-token context windows.' },
  ],
  music: [
    { emoji: '🎵', title: 'Lo-fi beat', prompt: 'A chill lo-fi hip-hop beat with mellow piano and vinyl crackle.' },
    { emoji: '🎸', title: 'Upbeat anthem', prompt: 'An energetic indie-rock anthem with bright guitars and big drums.' },
  ],
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function makeStubImageDataUrl(prompt, model) {
  const title = escapeXml(truncate(prompt || 'OrchidLLM stub image', 52));
  const subtitle = escapeXml(model ? `Model: ${model}` : 'Local stub response');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2340"/>
      <stop offset="50%" stop-color="#3d2a68"/>
      <stop offset="100%" stop-color="#8f5cf7"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.45)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/>
  <circle cx="220" cy="180" r="220" fill="url(#glow)" opacity="0.55"/>
  <circle cx="980" cy="180" r="260" fill="rgba(255,255,255,0.12)"/>
  <rect x="72" y="560" width="1056" height="168" rx="36" fill="rgba(10,12,24,0.42)"/>
  <text x="96" y="628" fill="#fff" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="56" font-weight="800">OrchidLLM Stub</text>
  <text x="96" y="688" fill="rgba(255,255,255,0.9)" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="30" font-weight="500">${title}</text>
  <text x="96" y="732" fill="rgba(255,255,255,0.75)" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="22">${subtitle}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

function createSilentWavBlob(durationSeconds = 1, sampleRate = 8000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const samples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: 'audio/wav' });
}

export function getImageUrl(prompt, model, options = {}, apiMode = 'demo', byopKey = '') {
  return makeStubImageDataUrl(prompt, model || 'openai');
}

export async function fetchModelCatalog() {
  return { categories: MOCK_CATALOG };
}

export async function fetchSuggestions() {
  return MOCK_SUGGESTIONS;
}

export async function fetchTextCompletion(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = [...messages].reverse().find((message) => message && message.role === 'user');
  const prompt = String(lastUserMessage?.content || 'your request').trim();
  const model = body.model || 'openai';
  const content = `Stub response from ${model}: ${truncate(prompt, 240)}`;

  return {
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  };
}

export async function fetchImageGeneration(body = {}, apiMode = 'demo', byopKey = '') {
  return {
    data: [
      {
        url: getImageUrl(body.prompt || 'OrchidLLM stub image', body.model || 'openai'),
      },
    ],
  };
}

export async function fetchVideoGeneration(body = {}, apiMode = 'demo', byopKey = '') {
  return {
    data: [
      {
        url: SAMPLE_VIDEO_URL,
      },
    ],
  };
}

export async function fetchAudioGeneration(body = {}, apiMode = 'demo', byopKey = '') {
  return createSilentWavBlob();
}

export async function fetchTranscription(form = new FormData(), apiMode = 'demo', byopKey = '') {
  const file = typeof form?.get === 'function' ? form.get('file') : null;
  const fileName = file && typeof file.name === 'string' ? file.name : 'audio-file';
  return {
    text: `Stub transcription for ${fileName}.`,
  };
}