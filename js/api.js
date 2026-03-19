// js/api.js
import { state } from './state.js';

const PUBLIC_API_KEY = "pk_BU8jPqG7RBj8yOxh";

export function getApiKey() {
  return state.authMode === "demo" ? PUBLIC_API_KEY : state.apiKey;
}

export async function fetchModels() {
  try {
    const [textRes, imageRes] = await Promise.all([
      fetch("https://gen.pollinations.ai/v1/models"),
      fetch("https://gen.pollinations.ai/image/models")
    ]);

    if (textRes.ok) {
      const textData = await textRes.json();
      state.availableModels.text = textData.data || textData;
    }
    if (imageRes.ok) {
      const imgData = await imageRes.json();
      state.availableModels.image = imgData.map(m => typeof m === 'string' ? { name: m, display: m } : m);
    }
    return true;
  } catch(e) {
    console.error("Fetch models failed", e);
    // fallback
    state.availableModels.text = [{id: "openai", name: "openai"}];
    state.availableModels.image = [{name: "flux"}];
    return false;
  }
}

export async function validatePollenKey(key) {
  try {
    const res = await fetch("https://gen.pollinations.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` }
    });
    return res.ok;
  } catch(e) {
    return false;
  }
}

export async function generateText(prompt, model, systemPrompt, chatHistory = []) {
  const apiKey = getApiKey();
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

  // Format history for context
  for (const msg of chatHistory) {
      if (msg.type === "text") {
         messages.push({ role: msg.role, content: msg.content });
      }
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages })
  });

  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function generateImage(prompt, model) {
  const apiKey = getApiKey();
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&seed=${seed}&nologo=true&enhance=false&key=${encodeURIComponent(apiKey)}`;

  // preload check
  await fetch(url, { method: 'GET' });
  return url;
}

export async function generateAudio(text, voice = "nova") {
  const apiKey = getApiKey();
  const res = await fetch("https://gen.pollinations.ai/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "elevenlabs", input: text, voice })
  });
  if (!res.ok) throw new Error(res.statusText);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function generateMusic(prompt, duration = 30) {
  const apiKey = getApiKey();
  const seed = Math.floor(Math.random() * 1000000);
  return `https://gen.pollinations.ai/audio/${encodeURIComponent(prompt)}?model=elevenmusic&duration=${duration}&seed=${seed}&key=${encodeURIComponent(apiKey)}`;
}

export async function generateVideo(prompt, duration = 3) {
  const apiKey = getApiKey();
  const seed = Math.floor(Math.random() * 1000000);
  return `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=wan&duration=${duration}&seed=${seed}&key=${encodeURIComponent(apiKey)}`;
}

export async function transcribeMedia(file) {
  const apiKey = getApiKey();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "scribe");

  const res = await fetch("https://gen.pollinations.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return data.text;
}