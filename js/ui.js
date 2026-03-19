// js/ui.js
import { state, deleteChat, addMessageToCurrentChat, createNewChat, STORAGE_KEYS, saveState } from './state.js';
import { getApiKey, fetchModels, generateText, generateImage, generateAudio, generateMusic, generateVideo, transcribeMedia, validatePollenKey } from './api.js';

export const dom = {
  loginOverlay: document.getElementById('login-overlay'),
  modeCards: document.querySelectorAll('[data-mode]'),
  
  byopDialog: document.getElementById('byop-dialog'),
  byopKeyInput: document.getElementById('byop-key-input'),
  byopError: document.getElementById('byop-error'),
  byopSubmit: document.getElementById('byop-submit'),
  byopCancel: document.getElementById('byop-cancel'),
  
  quotaDisplay: document.getElementById('quota-display'),
  modeBadge: document.getElementById('mode-badge'),
  
  chatHistoryList: document.getElementById('chat-history-list'),
  newChatBtn: document.getElementById('new-chat-btn'),
  tempChatBtn: document.getElementById('temp-chat-btn'),
  currentChatTitle: document.getElementById('current-chat-title'),
  currentModeIndicator: document.getElementById('current-mode-indicator'),
  chatMessages: document.getElementById('chat-messages'),
  
  modeSelectorBtn: document.getElementById('mode-selector-btn'),
  modeDropdownList: document.getElementById('mode-dropdown-list'),
  modeIcon: document.getElementById('mode-icon'),
  modeLabel: document.getElementById('mode-label'),
  
  modelSelectorBtn: document.getElementById('model-selector-btn'),
  modelDropdownList: document.getElementById('model-dropdown-list'),
  modelLabel: document.getElementById('model-label'),
  modelTagsContainer: document.getElementById('model-tags-container'),
  
  attachmentBtn: document.getElementById('attachment-btn'),
  attachmentInput: document.getElementById('attachment-input'),
  attachmentPreview: document.getElementById('attachment-preview'),
  attachmentName: document.getElementById('attachment-name'),
  removeAttachment: document.getElementById('remove-attachment'),
  
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  
  toastContainer: document.getElementById('toast-container'),
  modeSwitchDialog: document.getElementById('mode-switch-dialog'),
  modeSwitchConfirm: document.getElementById('mode-switch-confirm'),
  modeSwitchCancel: document.getElementById('mode-switch-cancel'),
  
  themeToggle: document.getElementById('theme-toggle'),
  logoutBtn: document.getElementById('logout-btn'),
  importBtn: document.getElementById('import-btn'),
  importFileInput: document.getElementById('import-file-input'),
  exportBtn: document.getElementById('export-btn')
};

let pendingModeSwitch = null;

export function updateAuthDisplay() {
  if (state.authMode === "demo") {
    dom.modeBadge.textContent = "Demo Mode";
    dom.quotaDisplay.textContent = `Demo: ${state.demoQuota} left`;
    dom.quotaDisplay.hidden = false;
  } else {
    dom.modeBadge.textContent = "BYOP Mode";
    dom.quotaDisplay.hidden = true;
  }
}

export function showToast(message) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  dom.toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

const TYPE_ICONS = {
  text: 'edit_document',
  image: 'image',
  audio: 'record_voice_over',
  music: 'music_note',
  video: 'movie',
  transcription: 'transcribe'
};

const TYPE_LABELS = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  music: 'Music',
  video: 'Video',
  transcription: 'Transcribe'
};

export function updateSidebar() {
  dom.chatHistoryList.innerHTML = '';
  state.chats.forEach(chat => {
    if (chat.isTemporary) return;
    
    const div = document.createElement('div');
    div.className = `chat-history-item ${chat.id === state.currentChatId ? 'active' : ''}`;
    
    div.innerHTML = `
      <span class="material-symbols-rounded">${TYPE_ICONS[chat.type] || 'chat'}</span>
      <div class="chat-history-content">
        <span class="chat-history-title">${chat.title}</span>
        <span class="chat-history-date">${new Date(chat.date).toLocaleDateString()}</span>
      </div>
      <button class="btn-icon btn-text small delete-chat-btn" aria-label="Delete">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;
    
    div.addEventListener('click', (e) => {
      if (e.target.closest('.delete-chat-btn')) {
        e.stopPropagation();
        deleteChat(chat.id);
        updateSidebar();
        if (state.chats.length === 0) {
           createNewChat("text");
        } else if (!state.chats.find(c => c.id === state.currentChatId)) {
           state.currentChatId = state.chats[0].id;
        }
        loadChat(state.currentChatId);
      } else {
        loadChat(chat.id);
        updateSidebar();
      }
    });
    
    dom.chatHistoryList.appendChild(div);
  });
}

function loadChat(chatId) {
  state.currentChatId = chatId;
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  
  state.currentMode = chat.type;
  
  // UI updates
  dom.currentChatTitle.textContent = chat.title;
  dom.currentModeIndicator.textContent = TYPE_LABELS[chat.type] + ' Mode';
  
  // Render messages
  dom.chatMessages.innerHTML = '';
  if (chat.messages.length === 0) {
    dom.chatMessages.innerHTML = `
      <div class="welcome-placeholder">
        <span class="material-symbols-rounded display-icon text-primary">${TYPE_ICONS[chat.type]}</span>
        <h3 class="headline-sm">New ${TYPE_LABELS[chat.type]} Chat</h3>
        <p class="body-lg text-variant">Type below to start</p>
      </div>
    `;
  } else {
    chat.messages.forEach(msg => appendMessageUI(msg));
  }
  
  updateInputToolbar();
}

export function appendMessageUI(msg) {
  // Remove welcome if present
  const welcome = dom.chatMessages.querySelector('.welcome-placeholder');
  if (welcome) welcome.remove();

  const container = document.createElement('div');
  container.className = `chat-bubble-container ${msg.role}`;
  
  let innerHtml = `<div class="chat-bubble ${msg.role}">`;
  
  if (msg.role === "user") {
    innerHtml += msg.content || "";
    if (msg.attachmentName) {
      innerHtml += `<div class="chat-bubble-meta"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">attachment</span> ${msg.attachmentName}</div>`;
    }
  } else {
    if (msg.type === "text") {
      innerHtml += msg.content?.replace(/\n/g, '<br/>');
    } else if (msg.type === "image") {
      innerHtml += `<img src="${msg.url}" alt="Generated Image" loading="lazy" />`;
    } else if (msg.type === "audio" || msg.type === "music") {
      innerHtml += `<audio controls src="${msg.url}"></audio>`;
    } else if (msg.type === "video") {
      innerHtml += `<video controls src="${msg.url}"></video>`;
    } else if (msg.type === "transcription") {
      innerHtml += `<strong>Transcription:</strong><br/>${msg.content}`;
    }
  }
  
  innerHtml += `</div>`;
  container.innerHTML = innerHtml;
  
  dom.chatMessages.appendChild(container);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

export function updateInputToolbar() {
  const mode = state.currentMode;
  dom.modeLabel.textContent = TYPE_LABELS[mode];
  dom.modeIcon.textContent = TYPE_ICONS[mode];
  
  [...dom.modeDropdownList.querySelectorAll('li')].forEach(li => {
    li.classList.toggle('selected', li.dataset.value === mode);
  });
  
  // Ensure model exists
  let models = state.availableModels[mode] || [];
  if (models.length === 0) {
    if(mode === "text") models = [{name: 'openai'}];
    else if(mode === "image") models = [{name: 'flux'}];
    else models = [mode === "transcription" ? "whisper-large-v3" : "default"];
  }
  
  dom.modelDropdownList.innerHTML = '';
  models.forEach((m, idx) => {
    const isObj = typeof m === 'object';
    const val = isObj ? m.name : m;
    const desc = isObj && m.description ? m.description : val;
    const li = document.createElement('li');
    li.dataset.value = val;
    li.innerHTML = `<span>${desc}</span>`;
    
    li.addEventListener('click', () => {
      state.currentModel = m;
      updateModelDisplay();
      dom.modelDropdownList.hidden = true;
    });
    
    dom.modelDropdownList.appendChild(li);
    if (idx === 0) state.currentModel = m; 
  });
  
  updateModelDisplay();
  
  // Attachments rule
  dom.attachmentPreview.hidden = true;
  state.pendingFile = null;
  dom.attachmentInput.value = "";
  
  if (mode === "transcription") {
    dom.attachmentBtn.hidden = false;
    dom.attachmentInput.accept = "audio/*,video/*,.mp3,.mp4,.wav";
    dom.chatInput.placeholder = "Upload a file to transcribe...";
    dom.chatInput.disabled = true;
  } else if (mode === "text") {
    // some models support vision
    dom.attachmentBtn.hidden = false;
    dom.attachmentInput.accept = "image/*";
    dom.chatInput.disabled = false;
    dom.chatInput.placeholder = "Send a message...";
  } else {
    dom.attachmentBtn.hidden = true;
    dom.chatInput.disabled = false;
    dom.chatInput.placeholder = `Describe the ${mode} to generate...`;
  }
}

function updateModelDisplay() {
  if (!state.currentModel) return;
  const isObj = typeof state.currentModel === 'object';
  dom.modelLabel.textContent = isObj ? state.currentModel.name : state.currentModel;
  
  dom.modelTagsContainer.innerHTML = '';
  if (isObj) {
    if (state.currentModel.reasoning) {
      dom.modelTagsContainer.innerHTML += `<span class="tag-badge"><span class="material-symbols-rounded" style="font-size:12px">psychology</span> Thinking</span>`;
    }
    if (state.currentModel.tools) {
      dom.modelTagsContainer.innerHTML += `<span class="tag-badge"><span class="material-symbols-rounded" style="font-size:12px">build</span> Tools</span>`;
    }
    if (state.currentModel.vision) {
      dom.modelTagsContainer.innerHTML += `<span class="tag-badge"><span class="material-symbols-rounded" style="font-size:12px">visibility</span> Vision</span>`;
    }
  }
}

// Dialog flows
export function requestModeSwitch(newMode) {
  const chat = state.chats.find(c => c.id === state.currentChatId);
  if (chat && chat.messages.length > 0 && chat.type !== newMode) {
    pendingModeSwitch = newMode;
    dom.modeSwitchDialog.showModal();
  } else if (chat && chat.messages.length === 0) {
    chat.type = newMode;
    chat.title = "New " + TYPE_LABELS[newMode] + " Chat";
    loadChat(chat.id);
    saveState();
  } else {
    pendingModeSwitch = newMode;
    performModeSwitch();
  }
}

export function performModeSwitch() {
  if (pendingModeSwitch) {
    const newChat = createNewChat(pendingModeSwitch);
    loadChat(newChat.id);
    updateSidebar();
    pendingModeSwitch = null;
  }
}

export { loadChat };