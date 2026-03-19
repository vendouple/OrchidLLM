// js/api.js
import { state } from './state.js';

const PUBLIC_API_KEY = "pk_BU8jPqG7RBj8yOxh";

export function getApiKey() {
  return state.authMode === "demo" ? PUBLIC_API_KEY : state.apiKey;
}

export async function fetchModels() {
  try {
    const [textRes, imageRes] = await Promise.all([
      fetch("https://text.pollinations.ai/models"),
      fetch("https://image.pollinations.ai/models")
    ]);
    
    if (textRes.ok) {
      state.availableModels.text = await textRes.json();
    }
    if (imageRes.ok) {
      const imgData = await imageRes.json();
      state.availableModels.image = imgData.map(m => typeof m === 'string' ? { name: m, display: m } : m);
    }
    return true;
  } catch(e) {
    console.error("Fetch models failed", e);
    // fallback
    state.availableModels.text = [{name: "openai", tools: true, reasoning: false}];
    state.availableModels.image = [{name: "flux"}];
    return false;
  }
}

export async function validatePollenKey(key) {
  try {
    const res = await fetch("https://gen.pollinations.ai/models", {
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

  const res = await fetch("https://text.pollinations.ai/v1/chat/completions", {
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
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&seed=${seed}&nologo=true&private=true&key=${encodeURIComponent(apiKey)}`;
  
  // preload check
  await fetch(url, { method: 'GET' }); 
  return url;
}

export async function generateAudio(text) {
  const apiKey = getApiKey();
  const res = await fetch("https://gen.pollinations.ai/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "parler-tts", input: text })
  });
  if (!res.ok) throw new Error(res.statusText);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function generateMusic(prompt) {
  const apiKey = getApiKey();
  const seed = Math.floor(Math.random() * 1000000);
  return `https://gen.pollinations.ai/audio/${encodeURIComponent(prompt)}?duration=30&seed=${seed}&key=${encodeURIComponent(apiKey)}`;
}

export async function generateVideo(prompt) {
  const apiKey = getApiKey();
  const seed = Math.floor(Math.random() * 1000000);
  return `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?duration=3&seed=${seed}&key=${encodeURIComponent(apiKey)}`;
}

export async function transcribeMedia(file) {
  const apiKey = getApiKey();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3");

  const res = await fetch("https://gen.pollinations.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return data.text;
}