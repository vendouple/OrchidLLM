// js/ui.js
import { state, deleteChat, createNewChat, saveState } from './state.js';
import { TAG_LABELS } from './api.js';

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

  modelBrowserBtn: document.getElementById('model-browser-btn'),
  modelBrowserPanel: document.getElementById('model-browser-panel'),
  modelTypeList: document.getElementById('model-type-list'),
  modelList: document.getElementById('model-list'),
  selectedModeLabel: document.getElementById('selected-mode-label'),
  selectedModelLabel: document.getElementById('selected-model-label'),
  modelTagsContainer: document.getElementById('model-tags-container'),
  generationControls: document.getElementById('generation-controls'),

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

const TYPE_LABELS = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  music: 'Music',
  video: 'Video',
  transcription: 'Transcription'
};

const TYPE_ICONS = {
  text: 'edit_document',
  image: 'image',
  audio: 'record_voice_over',
  music: 'music_note',
  video: 'movie',
  transcription: 'subtitles'
};

const MODE_ORDER = ['text', 'audio', 'music', 'video', 'image', 'transcription'];

export function updateAuthDisplay() {
  if (state.authMode === 'demo') {
    dom.modeBadge.textContent = 'Demo Mode';
    dom.quotaDisplay.textContent = `Demo: ${state.demoQuota} left`;
    dom.quotaDisplay.hidden = false;
  } else {
    dom.modeBadge.textContent = 'BYOP Mode';
    dom.quotaDisplay.hidden = true;
  }
}

export function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-leave');
    setTimeout(() => toast.remove(), 280);
  }, 2600);
}

export function updateSidebar() {
  dom.chatHistoryList.innerHTML = '';

  state.chats.forEach((chat) => {
    if (chat.isTemporary) return;

    const item = document.createElement('div');
    item.className = `chat-history-item ${chat.id === state.currentChatId ? 'active' : ''}`;

    item.innerHTML = `
      <span class="material-symbols-rounded">${TYPE_ICONS[chat.type] || 'chat'}</span>
      <div class="chat-history-content">
        <span class="chat-history-title">${chat.title}</span>
        <span class="chat-history-date">${new Date(chat.date).toLocaleDateString()}</span>
      </div>
      <button class="btn-icon btn-text small delete-chat-btn" aria-label="Delete">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;

    item.addEventListener('click', (event) => {
      if (event.target.closest('.delete-chat-btn')) {
        event.stopPropagation();
        deleteChat(chat.id);
        updateSidebar();
        if (state.chats.length === 0) {
          createNewChat('text');
        }
        const next = state.chats.find((entry) => entry.id === state.currentChatId) || state.chats[0];
        if (next) loadChat(next.id);
      } else {
        loadChat(chat.id);
        updateSidebar();
      }
    });

    dom.chatHistoryList.appendChild(item);
  });
}

function renderModeList() {
  dom.modelTypeList.innerHTML = '';

  MODE_ORDER.forEach((mode) => {
    const button = document.createElement('button');
    button.className = `model-type-item ${state.currentMode === mode ? 'active' : ''}`;
    button.type = 'button';
    button.dataset.mode = mode;
    button.innerHTML = `
      <span class="material-symbols-rounded">${TYPE_ICONS[mode]}</span>
      <span>${TYPE_LABELS[mode]}</span>
    `;

    button.addEventListener('mouseenter', () => {
      if (window.matchMedia('(pointer: fine)').matches) {
        requestModeSwitch(mode);
      }
    });

    button.addEventListener('click', () => {
      requestModeSwitch(mode);
      dom.modelBrowserPanel.hidden = false;
    });

    dom.modelTypeList.appendChild(button);
  });
}

function normalizeActiveModel(mode) {
  const models = state.availableModels[mode] || [];
  if (!models.length) {
    state.currentModel = { name: 'default', description: 'Default model', tags: ['unrecognized'] };
    return;
  }

  const currentName = typeof state.currentModel === 'object' ? state.currentModel?.name : state.currentModel;
  const matched = models.find((m) => m.name === currentName);
  if (matched) {
    state.currentModel = matched;
  } else {
    state.currentModel = models[0];
  }
}

function renderModelList() {
  normalizeActiveModel(state.currentMode);
  const models = state.availableModels[state.currentMode] || [];

  dom.modelList.innerHTML = '';

  models.forEach((model) => {
    const active = model.name === state.currentModel?.name;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `model-row ${active ? 'active' : ''}`;

    const paidTag = model.paid ? '<span class="model-inline-tag">Paid</span>' : '';
    const unknownTag = (model.tags || []).includes('unrecognized') ? '<span class="model-inline-tag unknown">Unrecognized</span>' : '';

    row.innerHTML = `
      <span class="model-main">
        <span class="model-name">${model.name}</span>
        ${paidTag}
        ${unknownTag}
      </span>
      <span class="model-description">${model.description || model.name}</span>
    `;

    row.addEventListener('click', () => {
      state.currentModel = model;
      updateModelDisplay();
      renderModelList();
      saveState();
      dom.modelBrowserPanel.hidden = true;
      dom.modelBrowserBtn.setAttribute('aria-expanded', 'false');
    });

    dom.modelList.appendChild(row);
  });
}

function updateModelDisplay() {
  if (!state.currentModel) return;

  dom.selectedModeLabel.textContent = TYPE_LABELS[state.currentMode];
  dom.selectedModelLabel.textContent = state.currentModel.name;

  dom.modelTagsContainer.innerHTML = '';
  const tags = Array.isArray(state.currentModel.tags) ? state.currentModel.tags : [];

  if (!tags.length) {
    const muted = document.createElement('span');
    muted.className = 'tag-badge muted';
    muted.textContent = 'No capability tags';
    dom.modelTagsContainer.appendChild(muted);
    return;
  }

  tags.forEach((tag) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.textContent = TAG_LABELS[tag] || tag;
    dom.modelTagsContainer.appendChild(badge);
  });
}

function renderGenerationControls() {
  const mode = state.currentMode;
  const modelName = state.currentModel?.name || '';

  dom.generationControls.innerHTML = '';

  if (mode === 'audio') {
    dom.generationControls.innerHTML = `
      <label class="tiny-field">
        <span>Voice</span>
        <select id="control-voice">
          <option value="nova">nova</option>
          <option value="alloy">alloy</option>
          <option value="echo">echo</option>
          <option value="shimmer">shimmer</option>
        </select>
      </label>
    `;
  }

  if (mode === 'music') {
    if (modelName === 'suno') {
      dom.generationControls.innerHTML = `
        <label class="tiny-field grow-control">
          <span>Suno style</span>
          <input id="control-style" type="text" placeholder="e.g. cinematic, lo-fi, upbeat" />
        </label>
        <label class="tiny-field">
          <span>Duration</span>
          <input id="control-duration" type="number" min="5" max="180" value="30" />
        </label>
      `;
    } else {
      dom.generationControls.innerHTML = `
        <label class="tiny-field">
          <span>Duration</span>
          <input id="control-duration" type="number" min="5" max="180" value="30" />
        </label>
      `;
    }
  }

  if (mode === 'video') {
    dom.generationControls.innerHTML = `
      <label class="tiny-field">
        <span>Duration</span>
        <input id="control-duration" type="number" min="1" max="10" value="3" />
      </label>
      <label class="tiny-field">
        <span>Aspect</span>
        <select id="control-aspect-ratio">
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
        </select>
      </label>
      <label class="tiny-toggle">
        <input id="control-audio" type="checkbox" />
        <span>Audio</span>
      </label>
    `;
  }

  if (mode === 'image') {
    dom.generationControls.innerHTML = `
      <label class="tiny-toggle">
        <input id="control-enhance" type="checkbox" />
        <span>Enhance Prompt</span>
      </label>
    `;
  }
}

export function getGenerationOptions() {
  return {
    voice: document.getElementById('control-voice')?.value,
    style: document.getElementById('control-style')?.value?.trim(),
    duration: Number(document.getElementById('control-duration')?.value || 0) || undefined,
    aspectRatio: document.getElementById('control-aspect-ratio')?.value,
    audio: Boolean(document.getElementById('control-audio')?.checked),
    enhance: Boolean(document.getElementById('control-enhance')?.checked)
  };
}

export function updateInputToolbar() {
  renderModeList();
  renderModelList();
  updateModelDisplay();
  renderGenerationControls();

  dom.attachmentPreview.hidden = true;
  state.pendingFile = null;
  dom.attachmentInput.value = '';

  if (state.currentMode === 'transcription') {
    dom.attachmentBtn.hidden = false;
    dom.attachmentInput.accept = 'audio/*,video/*,.mp3,.mp4,.wav';
    dom.chatInput.placeholder = 'Upload a file to transcribe...';
    dom.chatInput.disabled = true;
  } else if (state.currentMode === 'text') {
    dom.attachmentBtn.hidden = false;
    dom.attachmentInput.accept = 'image/*';
    dom.chatInput.disabled = false;
    dom.chatInput.placeholder = 'Send a message...';
  } else {
    dom.attachmentBtn.hidden = true;
    dom.chatInput.disabled = false;
    dom.chatInput.placeholder = `Describe the ${TYPE_LABELS[state.currentMode].toLowerCase()} to generate...`;
  }
}

export function appendMessageUI(msg) {
  const welcome = dom.chatMessages.querySelector('.welcome-placeholder');
  if (welcome) welcome.remove();

  const container = document.createElement('div');
  container.className = `chat-bubble-container ${msg.role}`;

  let innerHtml = `<div class="chat-bubble ${msg.role}">`;

  if (msg.role === 'user') {
    innerHtml += msg.content || '';
    if (msg.attachmentName) {
      innerHtml += `<div class="chat-bubble-meta"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">attachment</span> ${msg.attachmentName}</div>`;
    }
  } else {
    if (msg.type === 'text') {
      innerHtml += (msg.content || '').replace(/\n/g, '<br/>');
    } else if (msg.type === 'image') {
      innerHtml += `<img src="${msg.url}" alt="Generated image" loading="lazy" />`;
    } else if (msg.type === 'audio' || msg.type === 'music') {
      innerHtml += `<audio controls src="${msg.url}"></audio>`;
    } else if (msg.type === 'video') {
      innerHtml += `<video controls src="${msg.url}"></video>`;
    } else if (msg.type === 'transcription') {
      innerHtml += `<strong>Transcription:</strong><br/>${msg.content || ''}`;
    }
  }

  innerHtml += '</div>';
  container.innerHTML = innerHtml;

  dom.chatMessages.appendChild(container);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function setModeInCurrentChat(newMode) {
  const chat = state.chats.find((entry) => entry.id === state.currentChatId);
  if (!chat) return;
  chat.type = newMode;
  chat.title = `New ${TYPE_LABELS[newMode]} Chat`;
  state.currentMode = newMode;
  saveState();
}

export function requestModeSwitch(newMode) {
  const chat = state.chats.find((entry) => entry.id === state.currentChatId);

  if (!chat || chat.type === newMode) {
    state.currentMode = newMode;
    updateInputToolbar();
    return;
  }

  if (chat.messages.length > 0) {
    pendingModeSwitch = newMode;
    dom.modeSwitchDialog.showModal();
    return;
  }

  setModeInCurrentChat(newMode);
  loadChat(chat.id);
}

export function performModeSwitch() {
  if (!pendingModeSwitch) return;
  const newChat = createNewChat(pendingModeSwitch);
  pendingModeSwitch = null;
  loadChat(newChat.id);
  updateSidebar();
}

export function loadChat(chatId) {
  state.currentChatId = chatId;
  const chat = state.chats.find((entry) => entry.id === chatId);
  if (!chat) return;

  state.currentMode = chat.type;

  dom.currentChatTitle.textContent = chat.title;
  dom.currentModeIndicator.textContent = `${TYPE_LABELS[chat.type]} Mode`;

  dom.chatMessages.innerHTML = '';

  if (!chat.messages.length) {
    dom.chatMessages.innerHTML = `
      <div class="welcome-placeholder">
        <span class="material-symbols-rounded display-icon text-primary">${TYPE_ICONS[chat.type]}</span>
        <h3 class="headline-sm">New ${TYPE_LABELS[chat.type]} Chat</h3>
        <p class="body-lg text-variant">Type below to start</p>
      </div>
    `;
  } else {
    chat.messages.forEach((message) => appendMessageUI(message));
  }

  updateInputToolbar();
}
