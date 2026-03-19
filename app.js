// =========================================================
// OneLLM Playground - Multi-Modal AI Generation App
// Powered by Pollinations.ai
// =========================================================

// Constants
const PUBLIC_API_KEY = "";
const MAX_DEMO_REQUESTS_PER_DAY = 15;
const POLLINATIONS_BASE_URL = "https://pollinations.ai";
const POLLINATIONS_GEN_URL = "https://gen.pollinations.ai";

const STORAGE_KEYS = {
  authMode: "onellm-auth-mode",
  apiKey: "onellm-api-key",
  customUrl: "onellm-custom-url",
  theme: "onellm-theme",
  history: "onellm-history",
  demoQuota: "onellm-demo-quota",
  quotaDate: "onellm-quota-date",
};

// State management
const state = {
  theme: "dark",
  authMode: null, // 'demo', 'byop', 'byok'
  apiKey: null,
  customUrl: null,
  currentGenMode: null, // 'image', 'text', 'audio', 'music', 'video', 'transcription'
  history: [],
  availableModels: {},
  demoQuota: MAX_DEMO_REQUESTS_PER_DAY,
  isBusy: false,
};

// DOM references
const dom = {
  // Pages
  loginPage: document.getElementById("login-page"),
  playgroundPage: document.getElementById("playground-page"),

  // Login page elements
  modeCards: document.querySelectorAll(".mode-card"),

  // Dialogs
  byopDialog: document.getElementById("byop-dialog"),
  byopKeyInput: document.getElementById("byop-key-input"),
  byopCancel: document.getElementById("byop-cancel"),
  byopSubmit: document.getElementById("byop-submit"),
  byopError: document.getElementById("byop-error"),

  byokDialog: document.getElementById("byok-dialog"),
  byokUrlInput: document.getElementById("byok-url-input"),
  byokKeyInput: document.getElementById("byok-key-input"),
  byokCancel: document.getElementById("byok-cancel"),
  byokSubmit: document.getElementById("byok-submit"),
  byokError: document.getElementById("byok-error"),

  // Playground elements
  themeToggle: document.getElementById("theme-toggle"),
  historyToggle: document.getElementById("history-toggle"),
  historyPopup: document.getElementById("history-popup"),
  historyBackdrop: document.getElementById("history-backdrop"),
  historyClose: document.getElementById("history-close"),
  historyList: document.getElementById("history-list"),
  clearHistory: document.getElementById("clear-history"),
  exportBtn: document.getElementById("export-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  modeBadge: document.getElementById("mode-badge"),
  quotaDisplay: document.getElementById("quota-display"),

  // Generation modes
  genModeButtons: document.querySelectorAll(".gen-mode-btn"),
  generationContainer: document.getElementById("generation-container"),

  // Toast
  toast: document.getElementById("toast"),
};

// =========================================================
// Utility Functions
// =========================================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function showToast(message, duration = 3000) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, duration);
}

function resetDemoQuotaIfNeeded() {
  const today = new Date().toDateString();
  const lastQuotaDate = localStorage.getItem(STORAGE_KEYS.quotaDate);

  if (lastQuotaDate !== today) {
    state.demoQuota = MAX_DEMO_REQUESTS_PER_DAY;
    localStorage.setItem(STORAGE_KEYS.demoQuota, state.demoQuota.toString());
    localStorage.setItem(STORAGE_KEYS.quotaDate, today);
  } else {
    const savedQuota = localStorage.getItem(STORAGE_KEYS.demoQuota);
    state.demoQuota = savedQuota ? parseInt(savedQuota, 10) : MAX_DEMO_REQUESTS_PER_DAY;
  }
}

function decrementDemoQuota() {
  if (state.authMode === "demo") {
    state.demoQuota = Math.max(0, state.demoQuota - 1);
    localStorage.setItem(STORAGE_KEYS.demoQuota, state.demoQuota.toString());
    updateQuotaDisplay();
  }
}

function updateQuotaDisplay() {
  if (state.authMode === "demo") {
    dom.quotaDisplay.textContent = `${state.demoQuota} requests left`;
    dom.quotaDisplay.hidden = false;
  } else {
    dom.quotaDisplay.hidden = true;
  }
}

// =========================================================
// Storage Functions
// =========================================================

function saveAuthMode() {
  if (state.authMode) {
    localStorage.setItem(STORAGE_KEYS.authMode, state.authMode);
  }
  if (state.apiKey) {
    localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
  }
  if (state.customUrl) {
    localStorage.setItem(STORAGE_KEYS.customUrl, state.customUrl);
  }
}

function loadAuthMode() {
  state.authMode = localStorage.getItem(STORAGE_KEYS.authMode);
  state.apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  state.customUrl = localStorage.getItem(STORAGE_KEYS.customUrl);

  return state.authMode !== null;
}

function clearAuthMode() {
  state.authMode = null;
  state.apiKey = null;
  state.customUrl = null;
  localStorage.removeItem(STORAGE_KEYS.authMode);
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  localStorage.removeItem(STORAGE_KEYS.customUrl);
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
  } catch (err) {
    console.error("Failed to save history:", err);
  }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.history);
    state.history = saved ? JSON.parse(saved) : [];
  } catch (err) {
    console.error("Failed to load history:", err);
    state.history = [];
  }
}

function addToHistory(entry) {
  state.history.unshift(entry);
  // Keep only last 100 entries
  if (state.history.length > 100) {
    state.history = state.history.slice(0, 100);
  }
  saveHistory();
  renderHistory();
}

function clearHistoryData() {
  if (confirm("Are you sure you want to clear all history? This cannot be undone.")) {
    state.history = [];
    saveHistory();
    renderHistory();
    showToast("History cleared");
  }
}

function exportHistory() {
  const disclaimer = "Note: Data is saved locally in your browser. Processing is done via Pollinations.ai API only.";
  const exportData = {
    disclaimer,
    exportDate: new Date().toISOString(),
    history: state.history
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `onellm-history-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("History exported");
}

// =========================================================
// Theme Functions
// =========================================================

function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  state.theme = saved || "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
}

// =========================================================
// API Functions
// =========================================================

function getApiKey() {
  if (state.authMode === "demo") {
    return "";
  }
  return state.apiKey || "";
}

function getBaseUrl() {
  if (state.authMode === "byok" && state.customUrl) {
    return state.customUrl;
  }
  return POLLINATIONS_GEN_URL;
}

async function fetchAvailableModels() {
  try {
    const baseUrl = getBaseUrl();
    const apiKey = getApiKey();

    let textModels = [];
    let imageModels = [];

    // For Pollinations, fetch from specific endpoints
    if (baseUrl.includes("pollinations.ai")) {
      try {
        const [textRes, imageRes] = await Promise.all([
          fetch(`https://text.pollinations.ai/models`),
          fetch(`https://image.pollinations.ai/models`)
        ]);

        if (textRes.ok) {
          const textData = await textRes.json();
          textModels = textData.map(m => m.name || m.id);
        }
        if (imageRes.ok) {
          const imageData = await imageRes.json();
          imageModels = imageData;
        }
      } catch (err) {
        console.error("Failed to fetch Pollinations models:", err);
      }
    } else {
      // For BYOK (OpenAI compatible)
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Assuming OpenAI format where 'data' is an array of objects with 'id'
        const models = (data.data || []).map(m => m.id);
        textModels = models;
        imageModels = models; // Since we don't know which is which, put them in both
      }
    }

    const defaultModels = getDefaultModels();
    
    state.availableModels = {
      image: imageModels.length > 0 ? imageModels : defaultModels.image,
      text: textModels.length > 0 ? textModels : defaultModels.text,
      audio: defaultModels.audio,
      music: defaultModels.music,
      video: defaultModels.video,
      transcription: defaultModels.transcription
    };

    return state.availableModels;
  } catch (err) {
    console.error("Failed to fetch models:", err);
    state.availableModels = getDefaultModels();
    return state.availableModels;
  }
}

function getDefaultModels() {
  return {
    image: ["flux", "flux-realism", "flux-cablyai", "flux-anime", "flux-3d", "turbo"],
    text: ["openai", "gemini-fast", "claude-sonnet", "llama-v3p1-405b"],
    audio: ["parler-tts"],
    music: ["music"],
    video: ["video"],
    transcription: ["whisper-large-v3"],
  };
}

async function validateByopKey(apiKey) {
  try {
    const response = await fetch(`${POLLINATIONS_GEN_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function validateByokEndpoint(url, apiKey) {
  try {
    const response = await fetch(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}

// =========================================================
// Generation API Functions
// =========================================================

async function generateImage(prompt, model = "flux") {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  // Pollinations direct image generation
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true&private=true&key=${encodeURIComponent(apiKey)}`;

  return {
    type: "image",
    url: imageUrl,
    prompt,
    model,
    timestamp: Date.now(),
  };
}

async function generateText(prompt, model = "openai", systemPrompt = "") {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  return {
    type: "text",
    text,
    prompt,
    model,
    timestamp: Date.now(),
  };
}

async function generateAudio(text, model = "parler-tts", voice = "default") {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);

  return {
    type: "audio",
    url: audioUrl,
    text,
    model,
    timestamp: Date.now(),
  };
}

async function generateMusic(prompt, duration = 30) {
  const apiKey = getApiKey();

  // Pollinations music generation endpoint
  const musicUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(prompt)}?duration=${duration}&seed=${Math.floor(Math.random() * 1000000)}&key=${encodeURIComponent(apiKey)}`;

  return {
    type: "music",
    url: musicUrl,
    prompt,
    duration,
    timestamp: Date.now(),
  };
}

async function generateVideo(prompt, duration = 5) {
  const apiKey = getApiKey();

  // Pollinations video generation endpoint
  const videoUrl = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?duration=${duration}&seed=${Math.floor(Math.random() * 1000000)}&key=${encodeURIComponent(apiKey)}`;

  return {
    type: "video",
    url: videoUrl,
    prompt,
    duration,
    timestamp: Date.now(),
  };
}

async function transcribeAudio(file) {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3");

  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    type: "transcription",
    text: data.text || "",
    filename: file.name,
    timestamp: Date.now(),
  };
}

// =========================================================
// Page Navigation
// =========================================================

function showLoginPage() {
  dom.loginPage.hidden = false;
  dom.playgroundPage.hidden = true;
}

function showPlaygroundPage() {
  dom.loginPage.hidden = true;
  dom.playgroundPage.hidden = false;

  // Update UI based on auth mode
  if (state.authMode === "demo") {
    dom.modeBadge.textContent = "Demo Mode";
  } else if (state.authMode === "byop") {
    dom.modeBadge.textContent = "BYOP";
  } else if (state.authMode === "byok") {
    dom.modeBadge.textContent = "BYOK";
  }

  updateQuotaDisplay();
}

// =========================================================
// Auth Mode Handlers
// =========================================================

async function handleDemoMode() {
  state.authMode = "demo";
  state.apiKey = "";
  resetDemoQuotaIfNeeded();
  saveAuthMode();

  showToast("Demo mode activated");
  await fetchAvailableModels();
  showPlaygroundPage();
  if (!state.currentGenMode) {
    dom.genModeButtons[0].click();
  } else {
    renderGenerationPanel(state.currentGenMode);
  }
}

async function handleByopMode() {
  dom.byopDialog.showModal();
}

async function handleByokMode() {
  showToast("BYOK mode coming soon");
}

async function submitByop() {
  const apiKey = dom.byopKeyInput.value.trim();

  if (!apiKey) {
    dom.byopError.textContent = "Please enter an API key";
    dom.byopError.hidden = false;
    return;
  }

  // Validate the key
  showToast("Validating API key...");
  const isValid = await validateByopKey(apiKey);

  if (!isValid) {
    dom.byopError.textContent = "Invalid API key. Please check and try again.";
    dom.byopError.hidden = false;
    return;
  }

  state.authMode = "byop";
  state.apiKey = apiKey;
  saveAuthMode();

  dom.byopDialog.close();
  dom.byopKeyInput.value = "";
  dom.byopError.hidden = true;

  showToast("BYOP mode activated");
  await fetchAvailableModels();
  showPlaygroundPage();
  if (!state.currentGenMode) {
    dom.genModeButtons[0].click();
  } else {
    renderGenerationPanel(state.currentGenMode);
  }
}

function cancelByop() {
  dom.byopDialog.close();
  dom.byopKeyInput.value = "";
  dom.byopError.hidden = true;
}

function handleLogout() {
  if (confirm("Are you sure you want to logout?")) {
    clearAuthMode();
    showLoginPage();
    showToast("Logged out");
  }
}

// =========================================================
// Generation Mode Panels
// =========================================================

function createImagePanel() {
  const models = state.availableModels?.image || getDefaultModels().image;
  const optionsHtml = models.map(m => `<option value="${m}">${m}</option>`).join("");

  return `
    <div class="gen-panel card" data-panel="image">
      <h2 class="gen-panel-title">Image Generation</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">Prompt</span>
          <textarea
            id="image-prompt"
            class="gen-textarea"
            placeholder="Describe the image you want to generate..."
            rows="4"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">Model</span>
          <select id="image-model" class="gen-select">
            ${optionsHtml}
          </select>
        </label>

        <button id="generate-image" class="cta-btn">Generate Image</button>
      </div>

      <div id="image-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Generated Image</h3>
          <button class="ghost-btn" id="download-image">Download</button>
        </div>
        <img id="image-output" class="gen-image" alt="Generated image" />
      </div>
    </div>
  `;
}

function createTextPanel() {
  const models = state.availableModels?.text || getDefaultModels().text;
  const optionsHtml = models.map(m => `<option value="${m}">${m}</option>`).join("");

  return `
    <div class="gen-panel card" data-panel="text">
      <h2 class="gen-panel-title">Text Completion</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">System Prompt (Optional)</span>
          <textarea
            id="text-system"
            class="gen-textarea"
            placeholder="You are a helpful assistant..."
            rows="2"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">User Prompt</span>
          <textarea
            id="text-prompt"
            class="gen-textarea"
            placeholder="Ask anything..."
            rows="4"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">Model</span>
          <select id="text-model" class="gen-select">
            ${optionsHtml}
          </select>
        </label>

        <button id="generate-text" class="cta-btn">Generate Text</button>
      </div>

      <div id="text-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Generated Text</h3>
          <button class="ghost-btn" id="copy-text">Copy</button>
        </div>
        <div id="text-output" class="gen-text"></div>
      </div>
    </div>
  `;
}

function createAudioPanel() {
  return `
    <div class="gen-panel card" data-panel="audio">
      <h2 class="gen-panel-title">Audio Generation (Text-to-Speech)</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">Text</span>
          <textarea
            id="audio-text"
            class="gen-textarea"
            placeholder="Enter text to convert to speech..."
            rows="4"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">Voice</span>
          <select id="audio-voice" class="gen-select">
            <option value="default">Default</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>

        <button id="generate-audio" class="cta-btn">Generate Audio</button>
      </div>

      <div id="audio-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Generated Audio</h3>
          <button class="ghost-btn" id="download-audio">Download</button>
        </div>
        <audio id="audio-output" class="gen-audio" controls></audio>
      </div>
    </div>
  `;
}

function createMusicPanel() {
  return `
    <div class="gen-panel card" data-panel="music">
      <h2 class="gen-panel-title">Music Generation</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">Prompt</span>
          <textarea
            id="music-prompt"
            class="gen-textarea"
            placeholder="Describe the music you want to generate..."
            rows="4"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">Duration (seconds)</span>
          <input
            id="music-duration"
            type="number"
            class="gen-input"
            value="30"
            min="5"
            max="120" />
        </label>

        <button id="generate-music" class="cta-btn">Generate Music</button>
      </div>

      <div id="music-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Generated Music</h3>
          <button class="ghost-btn" id="download-music">Download</button>
        </div>
        <audio id="music-output" class="gen-audio" controls></audio>
      </div>
    </div>
  `;
}

function createVideoPanel() {
  return `
    <div class="gen-panel card" data-panel="video">
      <h2 class="gen-panel-title">Video Generation</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">Prompt</span>
          <textarea
            id="video-prompt"
            class="gen-textarea"
            placeholder="Describe the video you want to generate..."
            rows="4"></textarea>
        </label>

        <label class="gen-field">
          <span class="gen-label">Duration (seconds)</span>
          <input
            id="video-duration"
            type="number"
            class="gen-input"
            value="5"
            min="3"
            max="10" />
        </label>

        <button id="generate-video" class="cta-btn">Generate Video</button>
      </div>

      <div id="video-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Generated Video</h3>
          <button class="ghost-btn" id="download-video">Download</button>
        </div>
        <video id="video-output" class="gen-video" controls></video>
      </div>
    </div>
  `;
}

function createTranscriptionPanel() {
  return `
    <div class="gen-panel card" data-panel="transcription">
      <h2 class="gen-panel-title">Audio/Video Transcription</h2>
      <div class="gen-form">
        <label class="gen-field">
          <span class="gen-label">Upload Audio/Video File</span>
          <input
            id="transcription-file"
            type="file"
            class="gen-file-input"
            accept="audio/*,video/*,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm" />
        </label>

        <button id="generate-transcription" class="cta-btn" disabled>Transcribe</button>
      </div>

      <div id="transcription-result" class="gen-result" hidden>
        <div class="gen-result-head">
          <h3 class="gen-result-title">Transcription Result</h3>
          <button class="ghost-btn" id="copy-transcription">Copy</button>
        </div>
        <div id="transcription-output" class="gen-text"></div>
      </div>
    </div>
  `;
}

function renderGenerationPanel(mode) {
  let panelHtml = "";

  switch (mode) {
    case "image":
      panelHtml = createImagePanel();
      break;
    case "text":
      panelHtml = createTextPanel();
      break;
    case "audio":
      panelHtml = createAudioPanel();
      break;
    case "music":
      panelHtml = createMusicPanel();
      break;
    case "video":
      panelHtml = createVideoPanel();
      break;
    case "transcription":
      panelHtml = createTranscriptionPanel();
      break;
    default:
      panelHtml = "<p>Select a generation mode to get started</p>";
  }

  dom.generationContainer.innerHTML = panelHtml;
  bindGenerationEvents(mode);
}

// =========================================================
// Generation Event Handlers
// =========================================================

function bindGenerationEvents(mode) {
  switch (mode) {
    case "image":
      document.getElementById("generate-image")?.addEventListener("click", handleImageGeneration);
      document.getElementById("download-image")?.addEventListener("click", downloadImage);
      break;
    case "text":
      document.getElementById("generate-text")?.addEventListener("click", handleTextGeneration);
      document.getElementById("copy-text")?.addEventListener("click", copyText);
      break;
    case "audio":
      document.getElementById("generate-audio")?.addEventListener("click", handleAudioGeneration);
      document.getElementById("download-audio")?.addEventListener("click", downloadAudio);
      break;
    case "music":
      document.getElementById("generate-music")?.addEventListener("click", handleMusicGeneration);
      document.getElementById("download-music")?.addEventListener("click", downloadMusic);
      break;
    case "video":
      document.getElementById("generate-video")?.addEventListener("click", handleVideoGeneration);
      document.getElementById("download-video")?.addEventListener("click", downloadVideo);
      break;
    case "transcription":
      document.getElementById("transcription-file")?.addEventListener("change", handleTranscriptionFileSelect);
      document.getElementById("generate-transcription")?.addEventListener("click", handleTranscriptionGeneration);
      document.getElementById("copy-transcription")?.addEventListener("click", copyTranscription);
      break;
  }
}

async function handleImageGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const prompt = document.getElementById("image-prompt").value.trim();
  const model = document.getElementById("image-model").value;

  if (!prompt) {
    showToast("Please enter a prompt");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Generating image...");

    const result = await generateImage(prompt, model);

    document.getElementById("image-output").src = result.url;
    document.getElementById("image-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Image generated successfully");
  } catch (err) {
    console.error("Image generation error:", err);
    showToast("Failed to generate image: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

async function handleTextGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const prompt = document.getElementById("text-prompt").value.trim();
  const systemPrompt = document.getElementById("text-system").value.trim();
  const model = document.getElementById("text-model").value;

  if (!prompt) {
    showToast("Please enter a prompt");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Generating text...");

    const result = await generateText(prompt, model, systemPrompt);

    document.getElementById("text-output").textContent = result.text;
    document.getElementById("text-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Text generated successfully");
  } catch (err) {
    console.error("Text generation error:", err);
    showToast("Failed to generate text: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

async function handleAudioGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const text = document.getElementById("audio-text").value.trim();
  const voice = document.getElementById("audio-voice").value;

  if (!text) {
    showToast("Please enter text");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Generating audio...");

    const result = await generateAudio(text, "parler-tts", voice);

    document.getElementById("audio-output").src = result.url;
    document.getElementById("audio-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Audio generated successfully");
  } catch (err) {
    console.error("Audio generation error:", err);
    showToast("Failed to generate audio: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

async function handleMusicGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const prompt = document.getElementById("music-prompt").value.trim();
  const duration = parseInt(document.getElementById("music-duration").value, 10);

  if (!prompt) {
    showToast("Please enter a prompt");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Generating music...");

    const result = await generateMusic(prompt, duration);

    document.getElementById("music-output").src = result.url;
    document.getElementById("music-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Music generated successfully");
  } catch (err) {
    console.error("Music generation error:", err);
    showToast("Failed to generate music: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

async function handleVideoGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const prompt = document.getElementById("video-prompt").value.trim();
  const duration = parseInt(document.getElementById("video-duration").value, 10);

  if (!prompt) {
    showToast("Please enter a prompt");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Generating video...");

    const result = await generateVideo(prompt, duration);

    document.getElementById("video-output").src = result.url;
    document.getElementById("video-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Video generated successfully");
  } catch (err) {
    console.error("Video generation error:", err);
    showToast("Failed to generate video: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

function handleTranscriptionFileSelect(e) {
  const file = e.target.files?.[0];
  const btn = document.getElementById("generate-transcription");
  if (file) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

async function handleTranscriptionGeneration() {
  if (state.authMode === "demo" && state.demoQuota <= 0) {
    showToast("Demo quota exceeded. Please come back tomorrow or use BYOP mode.");
    return;
  }

  const fileInput = document.getElementById("transcription-file");
  const file = fileInput.files?.[0];

  if (!file) {
    showToast("Please select a file");
    return;
  }

  try {
    state.isBusy = true;
    showToast("Transcribing...");

    const result = await transcribeAudio(file);

    document.getElementById("transcription-output").textContent = result.text;
    document.getElementById("transcription-result").hidden = false;

    decrementDemoQuota();
    addToHistory({ ...result, id: generateId() });

    showToast("Transcription completed");
  } catch (err) {
    console.error("Transcription error:", err);
    showToast("Failed to transcribe: " + err.message);
  } finally {
    state.isBusy = false;
  }
}

// Download handlers
function downloadImage() {
  const img = document.getElementById("image-output");
  const link = document.createElement("a");
  link.href = img.src;
  link.download = `onellm-image-${Date.now()}.png`;
  link.click();
}

function downloadAudio() {
  const audio = document.getElementById("audio-output");
  const link = document.createElement("a");
  link.href = audio.src;
  link.download = `onellm-audio-${Date.now()}.mp3`;
  link.click();
}

function downloadMusic() {
  const audio = document.getElementById("music-output");
  const link = document.createElement("a");
  link.href = audio.src;
  link.download = `onellm-music-${Date.now()}.mp3`;
  link.click();
}

function downloadVideo() {
  const video = document.getElementById("video-output");
  const link = document.createElement("a");
  link.href = video.src;
  link.download = `onellm-video-${Date.now()}.mp4`;
  link.click();
}

// Copy handlers
function copyText() {
  const text = document.getElementById("text-output").textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Text copied to clipboard");
  });
}

function copyTranscription() {
  const text = document.getElementById("transcription-output").textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Transcription copied to clipboard");
  });
}

// =========================================================
// History Functions
// =========================================================

function renderHistory() {
  if (state.history.length === 0) {
    dom.historyList.innerHTML = '<p class="history-empty">Your generations will appear here.</p>';
    return;
  }

  const html = state.history.map((entry) => {
    const typeLabel = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
    const preview = getHistoryPreview(entry);

    return `
      <div class="history-item" data-id="${entry.id}">
        <div class="history-item-head">
          <span class="history-item-type">${typeLabel}</span>
          <span class="history-item-date">${formatDate(entry.timestamp)}</span>
        </div>
        <div class="history-item-preview">${preview}</div>
      </div>
    `;
  }).join("");

  dom.historyList.innerHTML = html;
}

function getHistoryPreview(entry) {
  switch (entry.type) {
    case "image":
      return entry.prompt || "Image generation";
    case "text":
      return entry.prompt || "Text completion";
    case "audio":
      return entry.text?.slice(0, 50) + "..." || "Audio generation";
    case "music":
      return entry.prompt || "Music generation";
    case "video":
      return entry.prompt || "Video generation";
    case "transcription":
      return entry.text?.slice(0, 50) + "..." || "Transcription";
    default:
      return "Unknown";
  }
}

function toggleHistory() {
  const isOpen = dom.historyPopup.getAttribute("aria-hidden") === "false";

  if (isOpen) {
    dom.historyPopup.setAttribute("aria-hidden", "true");
    dom.historyBackdrop.setAttribute("aria-hidden", "true");
    dom.historyToggle.setAttribute("aria-expanded", "false");
  } else {
    dom.historyPopup.setAttribute("aria-hidden", "false");
    dom.historyBackdrop.setAttribute("aria-hidden", "false");
    dom.historyToggle.setAttribute("aria-expanded", "true");
  }
}

// =========================================================
// Event Bindings
// =========================================================

function bindEvents() {
  // Login page - mode selection
  dom.modeCards.forEach((card) => {
    card.addEventListener("click", async () => {
      const mode = card.dataset.mode;
      if (mode === "demo") {
        await handleDemoMode();
      } else if (mode === "byop") {
        await handleByopMode();
      } else if (mode === "byok") {
        await handleByokMode();
      }
    });
  });

  // BYOP dialog
  dom.byopSubmit.addEventListener("click", submitByop);
  dom.byopCancel.addEventListener("click", cancelByop);
  dom.byopKeyInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      submitByop();
    }
  });

  // Theme toggle
  dom.themeToggle?.addEventListener("click", toggleTheme);

  // History
  dom.historyToggle?.addEventListener("click", toggleHistory);
  dom.historyClose?.addEventListener("click", toggleHistory);
  dom.historyBackdrop?.addEventListener("click", toggleHistory);
  dom.clearHistory?.addEventListener("click", clearHistoryData);

  // Export
  dom.exportBtn?.addEventListener("click", exportHistory);

  // Logout
  dom.logoutBtn?.addEventListener("click", handleLogout);

  // Generation mode buttons
  dom.genModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.genMode;
      state.currentGenMode = mode;

      // Update active state
      dom.genModeButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      // Render panel
      renderGenerationPanel(mode);
    });
  });
}

// =========================================================
// Initialization
// =========================================================

async function init() {
  // Load theme
  loadTheme();

  // Load history
  loadHistory();

  // Check if already authenticated
  const hasAuth = loadAuthMode();

  if (hasAuth) {
    // User is already authenticated, go to playground
    resetDemoQuotaIfNeeded();
    await fetchAvailableModels();
    showPlaygroundPage();
    renderHistory();
    if (!state.currentGenMode) {
      dom.genModeButtons[0].click();
    } else {
      renderGenerationPanel(state.currentGenMode);
    }
  } else {
    // Show login page
    showLoginPage();
  }

  // Bind all events
  bindEvents();
}

// Start the app
init();
