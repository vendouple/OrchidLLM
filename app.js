const STORAGE_KEYS = {
  chats: "onellm_chats_v1",
  settings: "onellm_settings_v1",
  usage: "onellm_demo_usage_v1"
};

const MODEL_GROUPS = {
  Text: ["GPT-4.1 Mini", "Claude 3.7 Sonnet", "Llama 3.3 70B"],
  Image: ["Flux Schnell", "SDXL Turbo", "Pollinations Image"],
  "Audio In": ["Whisper V3", "Gemini Audio", "Deepgram Nova"],
  "Audio Out": ["Eleven Turbo", "OpenVoice V2", "StyleTTS 2"],
  Transcription: ["Whisper Large", "Nemo Transcribe", "AssemblyAI"],
  Video: ["LTX Video", "Runway Gen-3", "Pika 2.2"]
};

const state = {
  chats: [],
  currentChatId: null,
  tempMode: false,
  mobileSidebarOpen: false,
  attachedFiles: [],
  selectedModel: { type: "Text", name: "GPT-4.1 Mini" },
  settings: {
    systemPrompt: "You are a helpful, concise assistant.",
    demoMode: false,
    theme: "light"
  }
};

const el = {
  root: document.documentElement,
  sidebarToggle: document.getElementById("sidebarToggle"),
  historySidebar: document.getElementById("historySidebar"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  newChatBtn: document.getElementById("newChatBtn"),
  tempModeToggle: document.getElementById("tempModeToggle"),
  activeChatTitle: document.getElementById("activeChatTitle"),
  activeModelLabel: document.getElementById("activeModelLabel"),
  messageList: document.getElementById("messageList"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  attachFileBtn: document.getElementById("attachFileBtn"),
  fileInput: document.getElementById("fileInput"),
  filePills: document.getElementById("filePills"),
  chatModelDropupBtn: document.getElementById("chatModelDropupBtn"),
  modelDropup: document.getElementById("modelDropup"),
  modelGroups: document.getElementById("modelGroups"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsClose: document.getElementById("settingsClose"),
  systemPromptInput: document.getElementById("systemPromptInput"),
  demoModeToggle: document.getElementById("demoModeToggle"),
  themeToggle: document.getElementById("themeToggle"),
  settingsThemeToggle: document.getElementById("settingsThemeToggle"),
  exportHistoryBtn: document.getElementById("exportHistoryBtn"),
  importHistoryBtn: document.getElementById("importHistoryBtn"),
  importFileInput: document.getElementById("importFileInput"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  demoBadge: document.getElementById("demoBadge"),
  demoRemaining: document.getElementById("demoRemaining"),
  messageTemplate: document.getElementById("messageTemplate")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function truncate(text, len = 48) {
  return text.length > len ? `${text.slice(0, len - 1)}...` : text;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getUsageState() {
  const raw = localStorage.getItem(STORAGE_KEYS.usage);
  const today = new Date().toISOString().slice(0, 10);
  const parsed = raw ? JSON.parse(raw) : { date: today, count: 0 };
  if (parsed.date !== today) {
    return { date: today, count: 0 };
  }
  return parsed;
}

function setUsageState(value) {
  localStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(value));
}

function incrementUsage() {
  const usage = getUsageState();
  usage.count += 1;
  setUsageState(usage);
}

function remainingDemoRequests() {
  const usage = getUsageState();
  return Math.max(0, 20 - usage.count);
}

function activeChat() {
  return state.chats.find((chat) => chat.id === state.currentChatId) || null;
}

function saveChats() {
  const persistable = state.chats.filter((chat) => !chat.temporary);
  localStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(persistable));
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function applyTheme(theme) {
  state.settings.theme = theme;
  el.root.setAttribute("data-theme", theme);
  const icon = el.themeToggle.querySelector(".material-symbols-rounded");
  if (icon) {
    icon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
  }
  el.settingsThemeToggle.checked = theme === "dark";
  saveSettings();
}

function renderHistory() {
  el.historyList.innerHTML = "";
  const sorted = [...state.chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  for (const chat of sorted) {
    const item = document.createElement("button");
    item.className = "history-item";
    if (chat.id === state.currentChatId) item.classList.add("active");

    const tempMark = chat.temporary ? "Temp" : chat.model?.type || "Text";
    item.innerHTML = `
      <div class="history-title">${escapeHtml(chat.title || "New Conversation")}</div>
      <div class="history-meta">
        <span>${escapeHtml(tempMark)}</span>
        <span>${escapeHtml(formatTime(chat.updatedAt))}</span>
      </div>
    `;

    item.addEventListener("click", () => {
      state.currentChatId = chat.id;
      state.selectedModel = chat.model || state.selectedModel;
      renderAll();
    });

    el.historyList.appendChild(item);
  }

  el.historyCount.textContent = `${sorted.length} ${sorted.length === 1 ? "chat" : "chats"}`;
}

function renderMessages() {
  const chat = activeChat();
  el.messageList.innerHTML = "";

  if (!chat || chat.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "message-bubble card round-xl";
    empty.textContent = "Start a conversation. Model controls, file uploads, and mode switches are ready.";
    el.messageList.appendChild(empty);
    return;
  }

  for (const message of chat.messages) {
    const frag = el.messageTemplate.content.cloneNode(true);
    const row = frag.querySelector(".message-row");
    const bubble = frag.querySelector(".message-bubble");

    row.classList.add(message.role);
    bubble.textContent = message.content;
    frag.querySelector(".avatar").textContent = message.role === "user" ? "U" : "AI";

    el.messageList.appendChild(frag);
  }

  el.messageList.scrollTop = el.messageList.scrollHeight;
}

function renderActiveChatHeader() {
  const chat = activeChat();
  if (!chat) {
    el.activeChatTitle.textContent = "New Conversation";
    el.activeModelLabel.textContent = `${state.selectedModel.type} • ${state.selectedModel.name}`;
    return;
  }

  const title = chat.title || "New Conversation";
  const tempTag = chat.temporary ? " • Temporary" : "";
  el.activeChatTitle.textContent = title;
  el.activeModelLabel.textContent = `${chat.model.type} • ${chat.model.name}${tempTag}`;
}

function renderModelDropup() {
  el.modelGroups.innerHTML = "";
  const chat = activeChat();
  const selected = chat?.model || state.selectedModel;

  Object.entries(MODEL_GROUPS).forEach(([group, options]) => {
    const card = document.createElement("section");
    card.className = "model-group";

    const title = document.createElement("h6");
    title.textContent = group;
    card.appendChild(title);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "model-options";

    options.forEach((name) => {
      const chip = document.createElement("button");
      chip.className = "model-option";
      chip.textContent = name;
      if (selected.type === group && selected.name === name) {
        chip.classList.add("active");
      }
      chip.addEventListener("click", () => {
        chooseModel(group, name);
      });
      optionsWrap.appendChild(chip);
    });

    card.appendChild(optionsWrap);
    el.modelGroups.appendChild(card);
  });
}

function renderTempMode() {
  el.tempModeToggle.setAttribute("aria-pressed", String(state.tempMode));
}

function renderDemoBadge() {
  const isDemo = state.settings.demoMode;
  el.demoBadge.classList.toggle("hidden", !isDemo);
  el.demoRemaining.textContent = String(remainingDemoRequests());
}

function renderFiles() {
  el.filePills.innerHTML = "";
  state.attachedFiles.forEach((file) => {
    const pill = document.createElement("span");
    pill.className = "file-pill";
    pill.textContent = truncate(file.name, 24);
    el.filePills.appendChild(pill);
  });
}

function renderAll() {
  renderHistory();
  renderMessages();
  renderActiveChatHeader();
  renderModelDropup();
  renderTempMode();
  renderFiles();
  renderDemoBadge();
}

function makeChat({ temporary }) {
  return {
    id: uid(),
    title: "New Conversation",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    temporary,
    model: { ...state.selectedModel },
    messages: []
  };
}

function ensureChat() {
  let chat = activeChat();
  if (!chat) {
    chat = makeChat({ temporary: state.tempMode });
    state.chats.push(chat);
    state.currentChatId = chat.id;
  }
  return chat;
}

function chooseModel(type, name) {
  state.selectedModel = { type, name };
  const chat = activeChat();
  if (chat) {
    chat.model = { type, name };
    chat.updatedAt = nowIso();
    if (!chat.temporary) saveChats();
  }
  renderAll();
}

function addMessage(role, content) {
  const chat = ensureChat();
  chat.messages.push({
    id: uid(),
    role,
    content,
    timestamp: nowIso(),
    files: state.attachedFiles.map((f) => f.name)
  });

  if (chat.title === "New Conversation" && role === "user") {
    chat.title = truncate(content, 42);
  }

  chat.updatedAt = nowIso();
  if (!chat.temporary) saveChats();
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessageInputHeight() {
  el.messageInput.style.height = "auto";
  el.messageInput.style.height = `${Math.min(180, el.messageInput.scrollHeight)}px`;
}

function fakeAssistantReply(userText) {
  const chat = activeChat();
  const model = chat?.model || state.selectedModel;
  const filesNote = state.attachedFiles.length
    ? `\n\nAttached files: ${state.attachedFiles.map((f) => f.name).join(", ")}`
    : "";
  return `Model: ${model.type} • ${model.name}\nSystem: ${state.settings.systemPrompt}\n\nYou said: "${userText}"${filesNote}\n\nFrontend-only demo response.`;
}

function sendMessage() {
  const text = el.messageInput.value.trim();
  if (!text) return;

  if (state.settings.demoMode && remainingDemoRequests() <= 0) {
    alert("Demo limit reached: 20 requests/day. Disable demo mode in Settings to continue.");
    return;
  }

  addMessage("user", text);

  if (state.settings.demoMode) {
    incrementUsage();
  }

  const reply = fakeAssistantReply(text);
  addMessage("assistant", reply);

  state.attachedFiles = [];
  el.fileInput.value = "";
  el.messageInput.value = "";
  setMessageInputHeight();

  renderAll();
}

function newChat() {
  const chat = makeChat({ temporary: state.tempMode });
  state.chats.push(chat);
  state.currentChatId = chat.id;
  if (!chat.temporary) saveChats();
  renderAll();
  el.messageInput.focus();
}

function toggleSettings(open) {
  el.settingsPanel.classList.toggle("open", open);
  el.settingsPanel.setAttribute("aria-hidden", String(!open));
  if (open) {
    el.systemPromptInput.value = state.settings.systemPrompt;
    el.demoModeToggle.checked = state.settings.demoMode;
    el.settingsThemeToggle.checked = state.settings.theme === "dark";
  }
}

function exportData() {
  const data = {
    chats: state.chats.filter((c) => !c.temporary),
    settings: state.settings,
    exportedAt: nowIso()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `onellm-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.chats)) {
        throw new Error("Invalid import file");
      }
      state.chats = parsed.chats;
      if (parsed.settings && typeof parsed.settings === "object") {
        state.settings = {
          ...state.settings,
          ...parsed.settings
        };
      }
      state.currentChatId = state.chats[0]?.id || null;
      saveChats();
      saveSettings();
      applyTheme(state.settings.theme);
      renderAll();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  const ok = confirm("Clear all saved chats and reset demo usage? This cannot be undone.");
  if (!ok) return;

  state.chats = [];
  state.currentChatId = null;
  localStorage.removeItem(STORAGE_KEYS.chats);
  localStorage.removeItem(STORAGE_KEYS.usage);
  newChat();
  renderAll();
}

function loadState() {
  const savedChats = localStorage.getItem(STORAGE_KEYS.chats);
  const savedSettings = localStorage.getItem(STORAGE_KEYS.settings);

  if (savedChats) {
    try {
      state.chats = JSON.parse(savedChats);
    } catch {
      state.chats = [];
    }
  }

  if (savedSettings) {
    try {
      state.settings = {
        ...state.settings,
        ...JSON.parse(savedSettings)
      };
    } catch {
      // Ignore invalid persisted settings and continue with defaults.
    }
  }

  applyTheme(state.settings.theme);
  state.currentChatId = state.chats[0]?.id || null;

  if (!state.currentChatId) {
    newChat();
  }
}

function bindEvents() {
  el.sidebarToggle.addEventListener("click", () => {
    const isMobile = window.matchMedia("(max-width: 960px)").matches;
    if (isMobile) {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
      el.historySidebar.classList.toggle("mobile-open", state.mobileSidebarOpen);
    } else {
      el.historySidebar.classList.toggle("collapsed");
    }
  });

  el.newChatBtn.addEventListener("click", newChat);

  el.tempModeToggle.addEventListener("click", () => {
    state.tempMode = !state.tempMode;
    renderTempMode();
  });

  el.chatModelDropupBtn.addEventListener("click", () => {
    const isOpen = el.modelDropup.classList.toggle("open");
    el.chatModelDropupBtn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!el.modelDropup.contains(event.target) && !el.chatModelDropupBtn.contains(event.target)) {
      el.modelDropup.classList.remove("open");
      el.chatModelDropupBtn.setAttribute("aria-expanded", "false");
    }
  });

  el.messageInput.addEventListener("input", setMessageInputHeight);
  el.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  el.sendBtn.addEventListener("click", sendMessage);

  el.attachFileBtn.addEventListener("click", () => {
    el.fileInput.click();
  });

  el.fileInput.addEventListener("change", () => {
    state.attachedFiles = Array.from(el.fileInput.files || []);
    renderFiles();
  });

  el.themeToggle.addEventListener("click", () => {
    const next = state.settings.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  el.settingsToggle.addEventListener("click", () => toggleSettings(true));
  el.settingsClose.addEventListener("click", () => toggleSettings(false));

  el.settingsPanel.addEventListener("click", (event) => {
    if (event.target === el.settingsPanel) {
      toggleSettings(false);
    }
  });

  el.systemPromptInput.addEventListener("change", () => {
    state.settings.systemPrompt = el.systemPromptInput.value.trim() || "You are a helpful, concise assistant.";
    saveSettings();
    renderAll();
  });

  el.demoModeToggle.addEventListener("change", () => {
    state.settings.demoMode = el.demoModeToggle.checked;
    saveSettings();
    renderDemoBadge();
  });

  el.settingsThemeToggle.addEventListener("change", () => {
    applyTheme(el.settingsThemeToggle.checked ? "dark" : "light");
  });

  el.exportHistoryBtn.addEventListener("click", exportData);

  el.importHistoryBtn.addEventListener("click", () => {
    el.importFileInput.click();
  });

  el.importFileInput.addEventListener("change", () => {
    const file = el.importFileInput.files?.[0];
    if (file) importData(file);
    el.importFileInput.value = "";
  });

  el.clearHistoryBtn.addEventListener("click", clearAll);

  window.addEventListener("resize", () => {
    const isMobile = window.matchMedia("(max-width: 960px)").matches;
    if (!isMobile) {
      state.mobileSidebarOpen = false;
      el.historySidebar.classList.remove("mobile-open");
    }
  });
}

function init() {
  loadState();
  bindEvents();
  renderAll();
  setMessageInputHeight();
}

init();
