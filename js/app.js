/**
 * Main Application initialization and event binding
 */
import { state, loadState, saveState, checkQuota, createNewChat, addMessageToCurrentChat, importData, exportData, decrementQuota } from './state.js';
import { validatePollenKey, fetchModels, generateText, generateImage, generateAudio, generateMusic, generateVideo, transcribeMedia } from './api.js';
import { dom, updateAuthDisplay, updateSidebar, loadChat, updateInputToolbar, requestModeSwitch, performModeSwitch, appendMessageUI, showToast } from './ui.js';

async function init() {
  loadState();
  updateAuthDisplay();
  
  // Theme
  document.body.setAttribute('data-theme', state.theme);
  dom.themeToggle.querySelector('span').textContent = state.theme === 'dark' ? 'light_mode' : 'dark_mode';
  
  // Populate Models (fire and forget)
  fetchModels().then(() => {
    updateInputToolbar();
  });

  if (state.authMode) {
    dom.loginOverlay.style.display = 'none';
  }

  if (state.chats.length === 0) {
    const c = createNewChat("text");
    loadChat(c.id);
  } else {
    // try to load last
    const c = state.chats.find(c => c.id === state.currentChatId) || state.chats[0];
    loadChat(c.id);
  }
  updateSidebar();
  
  bindEvents();
}

function bindEvents() {
  // Login modes
  dom.modeCards.forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.mode === 'demo') {
        state.authMode = 'demo';
        saveState();
        dom.loginOverlay.style.display = 'none';
        updateAuthDisplay();
      } else {
        dom.byopDialog.showModal();
        dom.byopError.hidden = true;
      }
    });
  });

  dom.byopCancel.addEventListener('click', () => {
    dom.byopDialog.close();
  });

  dom.byopSubmit.addEventListener('click', async () => {
    const key = dom.byopKeyInput.value.trim();
    if (!key) return;
    
    dom.byopSubmit.disabled = true;
    dom.byopSubmit.textContent = "Verifying...";
    const valid = await validatePollenKey(key);
    dom.byopSubmit.disabled = false;
    dom.byopSubmit.textContent = "Start Building";
    
    if (valid) {
      state.apiKey = key;
      state.authMode = "byop";
      saveState();
      dom.byopDialog.close();
      dom.loginOverlay.style.display = 'none';
      updateAuthDisplay();
    } else {
      dom.byopError.textContent = "Invalid API Key. Check Pollinations.ai";
      dom.byopError.hidden = false;
    }
  });

  // Theme
  dom.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', state.theme);
    dom.themeToggle.querySelector('span').textContent = state.theme === 'dark' ? 'light_mode' : 'dark_mode';
    saveState();
  });

  // Auth / Logout
  dom.logoutBtn.addEventListener('click', () => {
    state.authMode = null;
    state.apiKey = null;
    saveState();
    location.reload();
  });

  // Sidebar Chats
  dom.newChatBtn.addEventListener('click', () => {
    requestModeSwitch(state.currentMode);
  });
  dom.tempChatBtn.addEventListener('click', () => {
     const c = createNewChat(state.currentMode);
     c.title = "Temp: " + c.title;
     c.isTemporary = true;
     loadChat(c.id);
  });

  // Dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
      dom.modeDropdownList.hidden = true;
      dom.modelDropdownList.hidden = true;
    }
  });

  dom.modeSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.modelDropdownList.hidden = true;
    dom.modeDropdownList.hidden = !dom.modeDropdownList.hidden;
  });

  dom.modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.modeDropdownList.hidden = true;
    dom.modelDropdownList.hidden = !dom.modelDropdownList.hidden;
  });

  dom.modeDropdownList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.dataset.value) {
      requestModeSwitch(li.dataset.value);
      dom.modeDropdownList.hidden = true;
    }
  });

  // Mode Switch Dialog
  dom.modeSwitchCancel.addEventListener('click', () => dom.modeSwitchDialog.close());
  dom.modeSwitchConfirm.addEventListener('click', () => {
    dom.modeSwitchDialog.close();
    performModeSwitch();
  });

  // File Attachments
  dom.attachmentBtn.addEventListener('click', () => dom.attachmentInput.click());
  dom.attachmentInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    state.pendingFile = file;
    dom.attachmentName.textContent = file.name;
    dom.attachmentPreview.hidden = false;
    
    // Auto-transcribe assumption if audio
    if (state.currentMode === "transcription" && file) {
       dom.chatInput.value = "Transcribe " + file.name;
    }
  });
  dom.removeAttachment.addEventListener('click', () => {
    state.pendingFile = null;
    dom.attachmentInput.value = "";
    dom.attachmentPreview.hidden = true;
    if (state.currentMode === "transcription") dom.chatInput.value = "";
  });

  // Sending Messages
  dom.sendBtn.addEventListener('click', handleSend);
  dom.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Import / Export
  dom.exportBtn.addEventListener('click', exportData);
  dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
  dom.importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importData(file);
      setTimeout(() => {
        updateSidebar();
        if (state.chats.length > 0) loadChat(state.chats[0].id);
      }, 200);
    }
  });
}

async function handleSend() {
  const content = dom.chatInput.value.trim();
  if (!content && !state.pendingFile) return;

  if (state.authMode === "demo" && !checkQuota()) {
    showToast("Demo quota exceeded!");
    dom.loginOverlay.style.display = 'flex';
    return;
  }

  // Build msg
  const userMsg = {
    role: 'user',
    content: content,
    attachmentName: state.pendingFile ? state.pendingFile.name : null
  };

  addMessageToCurrentChat(userMsg);
  appendMessageUI(userMsg);
  
  // File upload logic proxy
  let fileBase64 = null;
  if (state.pendingFile) {
     fileBase64 = await toBase64(state.pendingFile);
  }

  dom.chatInput.value = '';
  dom.attachmentPreview.hidden = true;
  const fileRef = state.pendingFile;
  state.pendingFile = null;
  dom.attachmentInput.value = "";

  // Temporary UI loading
  const typingBubble = { role: 'assistant', type: 'text', content: '...' };
  appendMessageUI(typingBubble);
  
  // Call API depending on mode
  const mode = state.currentMode;
  let responseData;
  const sysPrompt = "You are OneLLM. A helpful assistant inside a unified API platform.";

  try {
    if (mode === "text") {
      let promptArr = [{ role: 'system', content: sysPrompt }];
      // Grab last 5 history
      const history = state.chats.find(c => c.id === state.currentChatId).messages.slice(0, -1).slice(-5);
      promptArr = promptArr.concat(history.map(m => ({role: m.role, content: m.content || m.attachmentName})));
      promptArr.push({role: 'user', content });

      const modelName = typeof state.currentModel === 'object' ? state.currentModel.name : state.currentModel;
      const resText = await generateText(modelName, promptArr);
      responseData = { role: 'assistant', type: 'text', content: resText };
    } 
    else if (mode === "image") {
      const modelName = typeof state.currentModel === 'object' ? state.currentModel.name : state.currentModel;
      const url = await generateImage(content, modelName);
      responseData = { role: 'assistant', type: 'image', url };
    }
    else if (mode === "audio") {
      const url = await generateAudio(content, "nova");
      responseData = { role: 'assistant', type: 'audio', url };
    }
    else if (mode === "music") {
      const url = await generateMusic(content, 30);
      responseData = { role: 'assistant', type: 'music', url };
    }
    else if (mode === "video") {
      const url = await generateVideo(content, 3);
      responseData = { role: 'assistant', type: 'video', url };
    }
    else if (mode === "transcription") {
      if (!fileRef) throw new Error("File required for transcription.");
      const text = await transcribeMedia(fileRef);
      responseData = { role: 'assistant', type: 'transcription', content: text };
    }

    decrementQuota();
    // Refresh quota display
    updateAuthDisplay();
    
    // Replace typing buble with actual
    dom.chatMessages.lastChild.remove();
    
    addMessageToCurrentChat(responseData);
    appendMessageUI(responseData);
    updateSidebar(); 
    
  } catch (err) {
    console.error(err);
    dom.chatMessages.lastChild.remove();
    showToast("Error: " + err.message);
  }
}

// Convert file to b64 generic async
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

// Run
init();
