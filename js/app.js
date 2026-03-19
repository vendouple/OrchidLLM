// js/app.js
import {
  state,
  loadState,
  saveState,
  checkQuota,
  createNewChat,
  addMessageToCurrentChat,
  importData,
  exportData,
  decrementQuota
} from './state.js';
import {
  validatePollenKey,
  fetchModels,
  generateText,
  generateImage,
  generateAudio,
  generateMusic,
  generateVideo,
  transcribeMedia
} from './api.js';
import {
  dom,
  updateAuthDisplay,
  updateSidebar,
  loadChat,
  updateInputToolbar,
  requestModeSwitch,
  performModeSwitch,
  appendMessageUI,
  showToast,
  getGenerationOptions
} from './ui.js';

async function init() {
  loadState();
  updateAuthDisplay();

  document.documentElement.setAttribute('data-theme', state.theme);
  const toggleIcons = dom.themeToggle.querySelectorAll('span');
  if (toggleIcons[0]) toggleIcons[0].textContent = state.theme === 'dark' ? 'light_mode' : 'dark_mode';

  fetchModels().then(() => {
    updateInputToolbar();
  });

  if (state.authMode) {
    dom.loginOverlay.style.display = 'none';
  }

  if (state.chats.length === 0) {
    const chat = createNewChat('text');
    loadChat(chat.id);
  } else {
    const current = state.chats.find((chat) => chat.id === state.currentChatId) || state.chats[0];
    loadChat(current.id);
  }

  updateSidebar();
  bindEvents();
}

function bindEvents() {
  dom.modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.mode === 'demo') {
        state.authMode = 'demo';
        saveState();
        dom.loginOverlay.style.display = 'none';
        updateAuthDisplay();
        return;
      }

      dom.byopDialog.showModal();
      dom.byopError.hidden = true;
    });
  });

  dom.byopCancel.addEventListener('click', () => {
    dom.byopDialog.close();
  });

  dom.byopSubmit.addEventListener('click', async () => {
    const key = dom.byopKeyInput.value.trim();
    if (!key) {
      dom.byopError.textContent = 'Please enter your Pollinations key.';
      dom.byopError.hidden = false;
      return;
    }

    dom.byopSubmit.disabled = true;
    dom.byopSubmit.textContent = 'Verifying...';

    const isValid = await validatePollenKey(key);

    dom.byopSubmit.disabled = false;
    dom.byopSubmit.textContent = 'Continue';

    if (!isValid) {
      dom.byopError.textContent = 'Invalid key or key has no balance. Please check enter.pollinations.ai';
      dom.byopError.hidden = false;
      return;
    }

    state.apiKey = key;
    state.authMode = 'byop';
    saveState();
    dom.byopDialog.close();
    dom.loginOverlay.style.display = 'none';
    updateAuthDisplay();
  });

  dom.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    const icons = dom.themeToggle.querySelectorAll('span');
    if (icons[0]) icons[0].textContent = state.theme === 'dark' ? 'light_mode' : 'dark_mode';
    saveState();
  });

  dom.logoutBtn.addEventListener('click', () => {
    state.authMode = null;
    state.apiKey = null;
    saveState();
    location.reload();
  });

  dom.newChatBtn.addEventListener('click', () => {
    requestModeSwitch(state.currentMode);
  });

  dom.tempChatBtn.addEventListener('click', () => {
    const chat = createNewChat(state.currentMode, true);
    chat.title = `Temp: ${chat.title}`;
    loadChat(chat.id);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#mode-model-selector')) {
      dom.modelBrowserPanel.hidden = true;
      dom.modelBrowserBtn.setAttribute('aria-expanded', 'false');
    }
  });

  dom.modelBrowserBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dom.modelBrowserPanel.hidden;
    dom.modelBrowserPanel.hidden = !open;
    dom.modelBrowserBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  dom.modeSwitchCancel.addEventListener('click', () => dom.modeSwitchDialog.close());
  dom.modeSwitchConfirm.addEventListener('click', () => {
    dom.modeSwitchDialog.close();
    performModeSwitch();
  });

  dom.attachmentBtn.addEventListener('click', () => dom.attachmentInput.click());

  dom.attachmentInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    state.pendingFile = file;
    dom.attachmentName.textContent = file.name;
    dom.attachmentPreview.hidden = false;

    if (state.currentMode === 'transcription') {
      dom.chatInput.value = `Transcribe ${file.name}`;
    }
  });

  dom.removeAttachment.addEventListener('click', () => {
    state.pendingFile = null;
    dom.attachmentInput.value = '';
    dom.attachmentPreview.hidden = true;
    if (state.currentMode === 'transcription') {
      dom.chatInput.value = '';
    }
  });

  dom.sendBtn.addEventListener('click', handleSend);

  dom.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  dom.exportBtn.addEventListener('click', exportData);
  dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
  dom.importFileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importData(file);
    setTimeout(() => {
      updateSidebar();
      if (state.chats.length > 0) {
        loadChat(state.chats[0].id);
      }
    }, 180);
  });
}

async function handleSend() {
  const content = dom.chatInput.value.trim();
  if (!content && !state.pendingFile) return;

  if (state.authMode === 'demo' && !checkQuota()) {
    showToast('Demo quota exceeded. Switch to BYOP.');
    dom.loginOverlay.style.display = 'flex';
    return;
  }

  const userMessage = {
    role: 'user',
    content,
    attachmentName: state.pendingFile ? state.pendingFile.name : null
  };

  addMessageToCurrentChat(userMessage, true);
  appendMessageUI(userMessage);

  dom.chatInput.value = '';
  dom.attachmentPreview.hidden = true;

  const attachedFile = state.pendingFile;
  state.pendingFile = null;
  dom.attachmentInput.value = '';

  const typingBubble = { role: 'assistant', type: 'text', content: 'Generating...' };
  appendMessageUI(typingBubble);

  try {
    const mode = state.currentMode;
    const modelName = state.currentModel?.name || 'default';
    const options = getGenerationOptions();
    const currentChat = state.chats.find((chat) => chat.id === state.currentChatId);
    const history = (currentChat?.messages || [])
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .slice(-8);

    let responseData;

    if (mode === 'text') {
      const responseText = await generateText(
        content,
        modelName,
        'You are OneLLM, a helpful assistant inside a unified Pollinations playground.',
        history
      );
      responseData = { role: 'assistant', type: 'text', content: responseText };
    } else if (mode === 'image') {
      const imageUrl = await generateImage(content, modelName, options);
      responseData = { role: 'assistant', type: 'image', url: imageUrl };
    } else if (mode === 'audio') {
      const audioUrl = await generateAudio(content, modelName, options);
      responseData = { role: 'assistant', type: 'audio', url: audioUrl };
    } else if (mode === 'music') {
      const musicUrl = await generateMusic(content, modelName, options);
      responseData = { role: 'assistant', type: 'music', url: musicUrl };
    } else if (mode === 'video') {
      const videoUrl = await generateVideo(content, modelName, options);
      responseData = { role: 'assistant', type: 'video', url: videoUrl };
    } else if (mode === 'transcription') {
      if (!attachedFile) {
        throw new Error('Please attach a file to transcribe.');
      }
      const text = await transcribeMedia(attachedFile, modelName);
      responseData = { role: 'assistant', type: 'transcription', content: text };
    }

    decrementQuota();
    updateAuthDisplay();

    if (dom.chatMessages.lastChild) {
      dom.chatMessages.lastChild.remove();
    }

    addMessageToCurrentChat(responseData);
    appendMessageUI(responseData);
    updateSidebar();
  } catch (error) {
    console.error(error);
    if (dom.chatMessages.lastChild) {
      dom.chatMessages.lastChild.remove();
    }
    showToast(`Error: ${error.message}`);
  }
}

init();
