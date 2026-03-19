// js/state.js
export const STORAGE_KEYS = {
  authMode: "onellm-auth-mode",
  apiKey: "onellm-api-key",
  theme: "onellm-theme",
  chats: "onellm-chats",
  demoQuota: "onellm-demo-quota",
  quotaDate: "onellm-quota-date",
};

export const state = {
  theme: "dark",
  authMode: null, // 'demo', 'byop'
  apiKey: null,
  
  chats: [], // array of { id, title, type (text, image, etc), messages: [{ role, content, type, url }], date }
  currentChatId: null,
  currentMode: "text", // 'text', 'image', 'audio', 'music', 'video', 'transcription'
  currentModel: null,
  
  availableModels: {
    text: [],
    image: [],
    audio: ["parler-tts"],
    music: ["music"],
    video: ["video"],
    transcription: ["whisper-large-v3"]
  },
  
  demoQuota: 15,
  isBusy: false,
};

export function saveState() {
  localStorage.setItem(STORAGE_KEYS.authMode, state.authMode || "");
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey || "");
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
  // Only save non-temporary chats
  const savableChats = state.chats.filter(c => !c.isTemporary);
  localStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(savableChats));
}

export function loadState() {
  state.authMode = localStorage.getItem(STORAGE_KEYS.authMode) || null;
  state.apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || null;
  state.theme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
  try {
    const savedChats = localStorage.getItem(STORAGE_KEYS.chats);
    if (savedChats) state.chats = JSON.parse(savedChats);
  } catch(e) {}
  
  const today = new Date().toDateString();
  const lastDate = localStorage.getItem(STORAGE_KEYS.quotaDate);
  if (lastDate !== today) {
    state.demoQuota = 15;
    localStorage.setItem(STORAGE_KEYS.demoQuota, "15");
    localStorage.setItem(STORAGE_KEYS.quotaDate, today);
  } else {
    state.demoQuota = parseInt(localStorage.getItem(STORAGE_KEYS.demoQuota) || "15", 10);
  }
}

export function decrementQuota() {
  if (state.authMode === "demo") {
    state.demoQuota = Math.max(0, state.demoQuota - 1);
    localStorage.setItem(STORAGE_KEYS.demoQuota, state.demoQuota.toString());
  }
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createNewChat(mode = "text", isTemporary = false) {
  const newChat = {
    id: generateId(),
    title: "New " + mode.charAt(0).toUpperCase() + mode.slice(1) + " Chat",
    type: mode,
    isTemporary,
    messages: [],
    date: Date.now()
  };
  state.chats.unshift(newChat);
  state.currentChatId = newChat.id;
  state.currentMode = mode;
  saveState();
  return newChat;
}

export function addMessageToCurrentChat(message, replaceTitle = false) {
  const chat = state.chats.find(c => c.id === state.currentChatId);
  if (chat) {
    chat.messages.push({
      ...message,
      timestamp: Date.now()
    });
    
    if (replaceTitle && chat.messages.length === 2 && message.content && typeof message.content === 'string') {
      // Auto-generate title from first user prompt
      chat.title = message.content.slice(0, 30) + (message.content.length > 30 ? "..." : "");
    }
    saveState();
  }
}

export function deleteChat(id) {
  state.chats = state.chats.filter(c => c.id !== id);
  if (state.currentChatId === id) {
    state.currentChatId = state.chats.length > 0 ? state.chats[0].id : null;
  }
  saveState();
}

export function checkQuota() {
  return state.demoQuota > 0;
}

export function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.chats) {
        state.chats = data.chats;
        saveState();
      }
    } catch (err) {
      console.error('Failed to import', err);
    }
  };
  reader.readAsText(file);
}

export function exportData() {
  const dataStr = JSON.stringify({ chats: state.chats }, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OneLLM_Export_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}