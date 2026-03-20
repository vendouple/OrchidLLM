
import {
  DEMO_API_KEY,
  DEFAULT_BYOP_KEY,
  POLL_BASE,
  fetchAudioGeneration,
  fetchImageGeneration,
  fetchModelCatalog,
  fetchSuggestions,
  fetchTextCompletion,
  fetchTranscription,
  fetchVideoGeneration,
} from './app.js';

/* ══════════════════════════════════════════════
   DATA — MODELS
══════════════════════════════════════════════ */
const CATS = [
  { id:'text', label:'Text', icon:'chat', badge:'cb-text' },
  { id:'image', label:'Image', icon:'image', badge:'cb-image' },
  { id:'video', label:'Video', icon:'videocam', badge:'cb-video' },
  { id:'audio', label:'Audio', icon:'volume_up', badge:'cb-audio' },
  { id:'transcription', label:'Transcribe', icon:'mic_external_on', badge:'cb-transcription' },
];

const MODELS = {
  text: [],
  image: [],
  video: [],
  audio: [],
  transcription: [],
};

const CAPS_META = {
  vision:    { label:'Vision',    icon:'visibility' },
  reasoning: { label:'Reasoning', icon:'psychology' },
  tools:     { label:'Tools',     icon:'build' },
  search:    { label:'Search',    icon:'search' },
  code:      { label:'Code',      icon:'code' },
  'code-exec': { label:'Code Exec', icon:'terminal' },
  caching:   { label:'Caching',   icon:'memory' },
  'audio-in':  { label:'Audio In',  icon:'mic' },
  'audio-out': { label:'Audio Out', icon:'volume_up' },
};
const SIDEBAR_BREAKPOINT = 1200;

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let S = {
  theme: 'light',
  sideOpen: true,
  isMobile: window.innerWidth <= SIDEBAR_BREAKPOINT,
  demoMode: true,
  demoCount: 0,  // used today
  demoUiMode: false,
  apiMode: 'demo',
  byopKey: '',
  systemPrompt: '',
  enhanceModel: 'openai',
  selectedCat: 'text',
  selectedModel: { id: 'openai', name: 'openai', desc: 'Default model', caps: ['tools'], pro: false, caching: false },
  currentChatId: null,
  isTempChat: false,
  composerExpanded: false,
  quickMode: 'voice',
  activeToolCat: 'image',
  textTools: {
    image: true,
    video: false,
    audio: false,
    web: false,
  },
  textToolModels: {
    image: 'openai',
    video: 'openai',
    audio: 'openai',
  },
  toolsModel: 'openai',
  chats: {},       // { [id]: {id,title,messages,createdAt} }
  attachments: [], // [{name,type,size,data,icon}]
  enhancedPrompt: null,
  demoSnapshot: null,
  pwaNudgeDismissed: false,
  suggestions: null,  // { text:[], image:[], video:[] }
  palette: null,      // { hueP, hueS, hueT } or null for default
};

let deferredInstallPrompt = null;
const IMG_VIEWER = {
  scale: 1,
  src: '',
};
let suggestionInterval = null;

/* ══════════════════════════════════════════════
   LOCAL STORAGE
══════════════════════════════════════════════ */
function loadState() {
  try {
    const raw = localStorage.getItem('onellm_state');
    if (raw) {
      const saved = JSON.parse(raw);
      S.theme = saved.theme || 'light';
      S.demoMode = typeof saved.demoMode === 'boolean' ? saved.demoMode : true;
      S.demoCount = saved.demoCount || 0;
      S.systemPrompt = saved.systemPrompt || '';
      S.enhanceModel = saved.enhanceModel || 'openai';
      S.apiMode = saved.apiMode || 'demo';
      S.byopKey = saved.byopKey || '';
      S.demoUiMode = saved.demoUiMode || false;
      S.pwaNudgeDismissed = saved.pwaNudgeDismissed || false;
      S.quickMode = saved.quickMode || 'voice';
      S.activeToolCat = saved.activeToolCat || 'image';
      S.textTools = {
        image: typeof saved?.textTools?.image === 'boolean' ? saved.textTools.image : true,
        video: typeof saved?.textTools?.video === 'boolean' ? saved.textTools.video : false,
        audio: typeof saved?.textTools?.audio === 'boolean' ? saved.textTools.audio : false,
        web: typeof saved?.textTools?.web === 'boolean' ? saved.textTools.web : false,
      };
      S.textToolModels = {
        image: saved?.textToolModels?.image || 'openai',
        video: saved?.textToolModels?.video || 'openai',
        audio: saved?.textToolModels?.audio || 'openai',
      };
      S.toolsModel = saved.toolsModel || 'openai';
      S.chats = saved.chats || {};
      S.palette = saved.palette || null;
      // Reset daily demo count if new day
      if (saved.demoDate !== new Date().toDateString()) {
        S.demoCount = 0;
      }
    }
  } catch(e) {}
}
function saveState() {
  try {
    localStorage.setItem('onellm_state', JSON.stringify({
      theme: S.theme,
      demoMode: S.demoMode,
      demoCount: S.demoCount,
      demoDate: new Date().toDateString(),
      systemPrompt: S.systemPrompt,
      enhanceModel: S.enhanceModel,
      apiMode: S.apiMode,
      byopKey: S.byopKey,
      demoUiMode: S.demoUiMode,
      pwaNudgeDismissed: S.pwaNudgeDismissed,
      quickMode: S.quickMode,
      activeToolCat: S.activeToolCat,
      textTools: S.textTools,
      textToolModels: S.textToolModels,
      toolsModel: S.toolsModel,
      chats: S.chats,
      palette: S.palette,
    }));
  } catch(e) {}
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function ts() {
  return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function groupChats() {
  const now = new Date(); const today = now.toDateString();
  const yest = new Date(now - 864e5).toDateString();
  const week = new Date(now - 7*864e5);
  const groups = { Today:[], Yesterday:[], 'This week':[], Older:[] };
  Object.values(S.chats).sort((a,b)=>b.createdAt-a.createdAt).forEach(c => {
    const d = new Date(c.createdAt);
    if (d.toDateString()===today) groups['Today'].push(c);
    else if (d.toDateString()===yest) groups['Yesterday'].push(c);
    else if (d > week) groups['This week'].push(c);
    else groups['Older'].push(c);
  });
  return groups;
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
  return el;
}
function onAll(selector, event, handler) {
  document.querySelectorAll(selector).forEach((el) => el.addEventListener(event, handler));
}

function getCatInfo(catId) { return CATS.find(c=>c.id===catId)||CATS[0]; }
function isTextCat(catId) { return catId==='text'; }
function demoRemaining() { return Math.max(0, 20 - S.demoCount); }

async function loadLocalModelCatalog() {
  try {
    const payload = await fetchModelCatalog();
    const categories = payload?.categories || {};

    const normalize = (entry) => ({
      id: entry.id,
      name: entry.name || entry.id,
      desc: entry.desc || 'Model',
      context: entry.context || '-',
      caps: Array.isArray(entry.capabilities) ? entry.capabilities : [],
      pro: Boolean(entry.pro),
      caching: Boolean(entry.caching),
      disabled: Boolean(entry.disabled),
    });

    Object.keys(MODELS).forEach((category) => {
      MODELS[category] = Array.isArray(categories[category])
        ? categories[category].filter((entry) => entry?.id).map(normalize)
        : [];
    });

    const keepModel = (MODELS[S.selectedCat] || []).some((m) => m.id === S.selectedModel.id);
    if (!keepModel) {
      S.selectedCat = 'text';
      S.selectedModel = MODELS.text[0] || S.selectedModel;
    }

    ['image', 'video', 'audio'].forEach((cat) => {
      const candidates = MODELS[cat] || [];
      const fallback = candidates[0];
      const current = S.textToolModels[cat];
      const keepToolModel = candidates.some((m) => m.id === current);
      if (!keepToolModel && fallback) {
        S.textToolModels[cat] = fallback.id;
      }
    });

    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
    syncTextToolsUI();
  } catch (error) {
    toast(`Model catalog load failed: ${error.message}`, 'error');
  }
}

/* ══════════════════════════════════════════════
   THEME
══════════════════════════════════════════════ */
function applyTheme(theme) {
  S.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  document.getElementById('app').setAttribute('color-scheme', theme);
  const tog = document.getElementById('s-dark-tog');
  if (tog) tog.checked = (theme === 'dark');
  
  if (S.palette && S.palette.variantId) {
    // We have a stored variant. Apply the dark or light version of it!
    const palId = theme + S.palette.variantId;
    // STATIC_PALETTES might be parsed later in file, so we safely resolve it
    if (typeof STATIC_PALETTES !== 'undefined' && STATIC_PALETTES[palId]) {
      const p = STATIC_PALETTES[palId];
      S.palette = { hueP: p.hueP, hueS: p.hueS, hueT: p.hueT, variantId: S.palette.variantId };
      applyPalette(S.palette);
    }
  } else if (S.palette) {
    applyPalette(S.palette);
  }
  paintPaletteSwatches();
  saveState();
}
function toggleTheme() { applyTheme(S.theme==='dark'?'light':'dark'); }

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function setSidebar(open) {
  S.sideOpen = open;
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('side-ov');
  
  if (S.isMobile) {
    sb.classList.remove('desktop-collapsed');
    sb.classList.toggle('closed', !open);
    ov.classList.toggle('show', open);
  } else {
    ov.classList.remove('show');
    sb.classList.remove('closed');
    sb.classList.toggle('desktop-collapsed', !open);
  }
}
function toggleSidebar() { setSidebar(!S.sideOpen); }

/* ══════════════════════════════════════════════
   TEMP CHAT
══════════════════════════════════════════════ */
function toggleTemp() {
  S.isTempChat = !S.isTempChat;
  syncTempUi();
  toast(S.isTempChat ? 'Temporary chat on — won\'t be saved' : 'Temporary chat off', 'schedule');
}

function syncTempUi() {
  const tempBtn = document.getElementById('temp-btn');
  if (tempBtn) {
    tempBtn.selected = S.isTempChat;
    tempBtn.toggleAttribute('selected', S.isTempChat);
    tempBtn.classList.toggle('active', S.isTempChat);
    tempBtn.setAttribute('aria-pressed', String(S.isTempChat));
  }
  const mobileTemp = document.getElementById('mobile-temp-btn');
  if (mobileTemp) {
    mobileTemp.selected = S.isTempChat;
    mobileTemp.toggleAttribute('selected', S.isTempChat);
    mobileTemp.classList.toggle('active', S.isTempChat);
    mobileTemp.setAttribute('aria-pressed', String(S.isTempChat));
  }
  const tempPill = document.getElementById('temp-pill');
  if (tempPill) tempPill.classList.toggle('show', S.isTempChat);
  const tempModePill = document.getElementById('temp-mode-pill');
  if (tempModePill) tempModePill.classList.toggle('show', S.isTempChat);
}

function showComingSoon(label) {
  toast(`${label} is coming soon`, 'hourglass_top');
}

function supportsToolCalling(model) {
  return Array.isArray(model?.caps) && model.caps.includes('tools');
}

function syncQuickModeUI() {
  document.querySelectorAll('[data-qmode]').forEach((button) => {
    button.classList.remove('active');
    button.disabled = true;
  });
}

function toggleTextTool(tool) {
  if (!['image', 'video', 'audio'].includes(tool)) return;
  S.textTools[tool] = !S.textTools[tool];
  saveState();
  syncTextToolsUI();
}

function syncTextToolsUI() {
  renderToolsNav();
  renderToolsModelList();
}

function setActiveToolCat(cat) {
  S.activeToolCat = cat;
  renderToolsNav();
  renderToolsModelList();
}

function setToolModel(cat, modelId) {
  if (!cat || !modelId) return;
  S.textToolModels[cat] = modelId;
  saveState();
  renderToolsModelList();
}

function renderToolsNav() {
  const nav = document.getElementById('tools-nav');
  if (!nav) return;
  const toolCats = ['image', 'video', 'audio'];
  nav.innerHTML = toolCats.map((cat) => {
    const info = getCatInfo(cat);
    const enabled = Boolean(S.textTools[cat]);
    const active = S.activeToolCat === cat;
    return `
      <button class="tool-nav-item ${active ? 'active' : ''}" data-tool="${cat}">
        <div class="tool-nav-meta">
          <span class="ms sm">${info?.icon || 'tune'}</span>
          <div class="tool-nav-titles">
            <div class="tool-nav-title">${info?.label || cat}</div>
            <div class="tool-nav-sub">${enabled ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
        <m3e-switch data-tool-toggle="${cat}" aria-label="Toggle ${info?.label || cat}" ${enabled ? 'selected' : ''}></m3e-switch>
      </button>
    `;
  }).join('');

  nav.querySelectorAll('.tool-nav-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      // Don't close popup or change active when clicking the switch
      if (event.target.tagName === 'M3E-SWITCH' || event.target.closest('m3e-switch')) {
        event.stopPropagation();
        return;
      }
      setActiveToolCat(item.dataset.tool);
    });
  });
  nav.querySelectorAll('m3e-switch[data-tool-toggle]').forEach((sw) => {
    sw.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleTextTool(sw.dataset.toolToggle);
    });
  });
}

function renderToolsModelList() {
  const list = document.getElementById('tools-model-list');
  const title = document.getElementById('tools-models-title');
  if (!list) return;
  const cat = S.activeToolCat || 'image';
  const models = MODELS[cat] || [];
  const enabled = Boolean(S.textTools[cat]);
  if (title) title.textContent = `Models for ${getCatInfo(cat).label}`;

  if (!enabled) {
    list.innerHTML = `<div class="tool-model-empty">Enable ${getCatInfo(cat).label} tool to pick a model.</div>`;
    return;
  }
  if (!models.length) {
    list.innerHTML = `<div class="tool-model-empty">No models available for ${getCatInfo(cat).label}.</div>`;
    return;
  }

  const current = S.textToolModels[cat];
  list.innerHTML = models.map((m) => {
    const selected = current === m.id;
    return `
      <button class="tool-model-row ${selected ? 'sel' : ''}" data-tool-model="${m.id}">
        <div class="tool-model-main">
          <div class="tool-model-name">${escHtml(m.name)}</div>
          <div class="tool-model-desc">${escHtml(m.desc)}</div>
        </div>
        <span class="tool-model-badge">${m.context || '—'}</span>
      </button>
    `;
  }).join('');

  list.querySelectorAll('[data-tool-model]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      setToolModel(cat, btn.dataset.toolModel);
    });
  });
}

function closeToolsPop() {
  const pop = document.getElementById('tools-pop');
  if (!pop) return;
  pop.classList.remove('open');
  pop.setAttribute('aria-hidden', 'true');
}

function openToolsPop() {
  const pop = document.getElementById('tools-pop');
  if (!pop) return;
  if (!S.activeToolCat) S.activeToolCat = 'image';
  renderToolsNav();
  renderToolsModelList();
  pop.classList.add('open');
  pop.setAttribute('aria-hidden', 'false');
}

function toggleToolsPop() {
  const pop = document.getElementById('tools-pop');
  if (!pop) return;
  if (pop.classList.contains('open')) closeToolsPop();
  else openToolsPop();
}

function syncComposerModeControls() {
  const enhanceWrap = document.getElementById('enhance-wrap');
  const toolsWrap = document.getElementById('tools-wrap');
  if (!enhanceWrap || !toolsWrap) return;

  const cat = S.selectedCat;
  const supportsTools = supportsToolCalling(S.selectedModel);
  const showEnhance = cat === 'image' || cat === 'video' || cat === 'audio';
  const showTools = cat === 'text' && supportsTools;

  enhanceWrap.classList.toggle('show', showEnhance);
  toolsWrap.classList.toggle('show', showTools);

  if (!showTools) closeToolsPop();
}

function openImageViewer(src) {
  const viewer = document.getElementById('img-viewer');
  const img = document.getElementById('img-viewer-img');
  const download = document.getElementById('img-download-btn');
  if (!viewer || !img || !download) return;

  IMG_VIEWER.scale = 1;
  IMG_VIEWER.src = src;
  img.src = src;
  img.style.transform = 'scale(1)';
  download.href = src;
  document.getElementById('img-zoom-label').textContent = '100%';
  viewer.classList.add('open');
  viewer.setAttribute('aria-hidden', 'false');
}

function closeImageViewer() {
  const viewer = document.getElementById('img-viewer');
  if (!viewer) return;
  viewer.classList.remove('open');
  viewer.setAttribute('aria-hidden', 'true');
}

function adjustImageZoom(delta) {
  IMG_VIEWER.scale = Math.max(0.5, Math.min(4, Number((IMG_VIEWER.scale + delta).toFixed(2))));
  const img = document.getElementById('img-viewer-img');
  if (img) img.style.transform = `scale(${IMG_VIEWER.scale})`;
  const label = document.getElementById('img-zoom-label');
  if (label) label.textContent = `${Math.round(IMG_VIEWER.scale * 100)}%`;
}

/* ══════════════════════════════════════════════
   CHAT MANAGEMENT
══════════════════════════════════════════════ */
function newChat() {
  S.currentChatId = null;
  S.attachments = [];
  renderChat([]);
  renderHistory();
  document.getElementById('chat-title').textContent = 'New Conversation';
  document.getElementById('msg-input').value = '';
  updateSendBtn();
  clearAttachPreview();
}

function loadChat(id) {
  const chat = S.chats[id];
  if (!chat) return;
  S.currentChatId = id;
  S.attachments = [];
  renderChat(chat.messages || []);
  renderHistory();
  document.getElementById('chat-title').textContent = chat.title || 'Conversation';
  clearAttachPreview();
  if (S.isMobile) setSidebar(false);
}

function deleteChat(id, e) {
  if (e) { e.stopPropagation(); }
  delete S.chats[id];
  if (S.currentChatId === id) newChat();
  else renderHistory();
  saveState();
  toast('Chat deleted', 'delete');
}

function ensureCurrentChat(firstMsg) {
  if (S.isTempChat) return '__temp__';
  if (!S.currentChatId) {
    const id = uid();
    S.chats[id] = {
      id, createdAt: Date.now(), messages: [],
      title: firstMsg.substring(0,36) + (firstMsg.length>36?'…':''),
    };
    S.currentChatId = id;
    renderHistory();
  }
  return S.currentChatId;
}

function addMessage(chatId, msg) {
  if (chatId === '__temp__') return; // don't persist
  if (!S.chats[chatId]) return;
  S.chats[chatId].messages.push(msg);
  saveState();
}

/* ══════════════════════════════════════════════
   RENDER HISTORY
══════════════════════════════════════════════ */
function renderHistory() {
  const el = document.getElementById('hist-scroll');
  const groups = groupChats();
  let html = '';
  let hasAny = false;
  for (const [grp, chats] of Object.entries(groups)) {
    if (!chats.length) continue;
    hasAny = true;
    html += `<div class="hist-label">${grp}</div>`;
    chats.forEach(c => {
      const active = c.id === S.currentChatId ? 'active' : '';
      html += `
        <div class="hist-item ${active}" onclick="loadChat('${c.id}')">
          <div class="hi-icon"><span class="ms sm">chat_bubble</span></div>
          <span class="hi-title">${escHtml(c.title||'Untitled')}</span>
          <button class="hi-del" onclick="deleteChat('${c.id}',event)" title="Delete">
            <span class="ms">close</span>
          </button>
        </div>`;
    });
  }
  if (!hasAny) html = `<div class="hist-empty"><span class="ms lg" style="color:var(--out-v);display:block;margin-bottom:8px">history</span>No chats yet.<br>Start a conversation!</div>`;
  el.innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER CHAT
══════════════════════════════════════════════ */
function renderChat(messages) {
  const inner = document.getElementById('chat-inner');
  const welcome = document.getElementById('welcome');
  if (!messages.length) {
    inner.innerHTML = '';
    inner.appendChild(welcome);
    return;
  }
  inner.innerHTML = '';
  messages.forEach(m => inner.appendChild(buildMsgEl(m)));
  scrollToBottom();
}

function buildMsgEl(msg) {
  const row = document.createElement('div');
  row.className = `msg-row ${msg.role}`;
  const isUser = msg.role === 'user';

  let bubbleContent = '';
  if (msg.attachments && msg.attachments.length) {
    msg.attachments.forEach(a => {
      if (a.type && a.type.startsWith('image/') && a.data) {
        bubbleContent += `<img src="${a.data}" class="msg-img" alt="${escHtml(a.name)}" loading="lazy">`;
      } else {
        bubbleContent += `<div class="msg-attach-chip"><span class="ms">attach_file</span>${escHtml(a.name)}</div>`;
      }
    });
  }

  if (msg.imageUrl) {
    bubbleContent += `<img src="${escHtml(msg.imageUrl)}" class="msg-img" alt="Generated image" loading="lazy" onerror="this.style.display='none'">`;
  } else if (msg.videoUrl) {
    bubbleContent += `<video class="msg-img" controls playsinline src="${escHtml(msg.videoUrl)}"></video>`;
  } else if (msg.audioUrl) {
    bubbleContent += `<audio controls src="${escHtml(msg.audioUrl)}" style="width:100%"></audio>`;
  } else if (msg.content) {
    bubbleContent += escHtml(msg.content);
  }

  const avatar = isUser
    ? `<div class="avatar user-av">U</div>`
    : `<div class="avatar ai-av"><span class="ms sm fill">auto_awesome</span></div>`;

  const modelTag = msg.model ? ` · ${msg.model}` : '';
  const meta = `<div class="msg-meta">${msg.time || ts()}${modelTag}</div>`;

  if (isUser) {
    row.innerHTML = `${avatar}<div class="bubble">${bubbleContent}${meta}</div>`;
  } else {
    row.innerHTML = `${avatar}<div class="bubble">${bubbleContent}${meta}</div>`;
  }
  return row;
}

function addMsgToView(msg) {
  const inner = document.getElementById('chat-inner');
  const welcome = document.getElementById('welcome');
  if (inner.contains(welcome)) inner.innerHTML = '';
  inner.appendChild(buildMsgEl(msg));
  scrollToBottom();
}

function showTyping() {
  const inner = document.getElementById('chat-inner');
  const el = document.createElement('div');
  el.id = 'typing-row';
  el.className = 'typing-row';
  el.innerHTML = `
    <div class="avatar ai-av"><span class="ms sm fill">auto_awesome</span></div>
    <m3e-loading-indicator aria-label="Loading response"></m3e-loading-indicator>`;
  inner.appendChild(el);
  scrollToBottom();
}

function removeTyping() {
  const el = document.getElementById('typing-row');
  if (el) el.remove();
}

function scrollToBottom() {
  const w = document.getElementById('chat-wrap');
  requestAnimationFrame(() => w.scrollTop = w.scrollHeight);
}

/* ══════════════════════════════════════════════
   MODEL DROPUP
══════════════════════════════════════════════ */
function openDropup() {
  renderDropup();
  document.getElementById('dropup-wrap').classList.add('open');
}
function closeDropup() {
  document.getElementById('dropup-wrap').classList.remove('open');
}

function renderDropup() {
  // Categories
  const catsEl = document.getElementById('du-cats');
  catsEl.innerHTML = CATS.map(c => `
    <div class="du-cat ${S.selectedCat===c.id?'active':''}" onclick="selectCat('${c.id}')">
      <span class="ms sm">${c.icon}</span>${c.label}
    </div>`).join('');
  renderModelList();
}

function selectCat(id) {
  S.selectedCat = id;
  renderDropup();
  document.getElementById('model-search').value = '';
}

function renderModelList(filter='') {
  const list = document.getElementById('du-list');
  const models = (MODELS[S.selectedCat] || []).filter(m =>
    !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.desc.toLowerCase().includes(filter.toLowerCase())
  );
  if (!models.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--out);font-size:13px">No models found</div>`;
    return;
  }
  list.innerHTML = models.map(m => {
    const sel = S.selectedModel.id === m.id ? 'sel' : '';
    const isProBlocked = S.demoMode && m.pro;
    const proBadge = m.pro ? `<span class="cap-chip" style="background:linear-gradient(135deg,var(--p),var(--t));color:#fff;font-weight:800;"><span class="ms">star</span>Pro</span>` : '';
    const caps = (m.caps || []).map(c => {
      const cm = CAPS_META[c]; if (!cm) return '';
      return `<span class="cap-chip"><span class="ms">${cm.icon}</span>${cm.label}</span>`;
    }).join('');
    const metaParts = [];
    if (m.context) metaParts.push(`<span class="cap-chip"><span class="ms">data_object</span>${escHtml(String(m.context))}</span>`);
    if (m.caching) metaParts.push(`<span class="cap-chip"><span class="ms">memory</span>Caching</span>`);
    const meta = metaParts.join('');
    const disabled = (m.disabled || isProBlocked) ? 'style="opacity:.45;pointer-events:none;filter:grayscale(0.25)"' : '';
    const lockLine = isProBlocked ? `<div class="mi-desc" style="color:var(--t)">Pro model unavailable in Demo Mode</div>` : '';
    return `
      <div class="model-item ${sel}" onclick="selectModel('${S.selectedCat}','${m.id}')" ${disabled}>
        <div class="mi-info">
          <div class="mi-name">${escHtml(m.name)}</div>
          <div class="mi-desc">${escHtml(m.desc)}</div>
          ${lockLine}
          ${meta || proBadge ? `<div class="mi-caps">${proBadge}${meta}</div>` : ''}
          ${caps ? `<div class="mi-caps">${caps}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function selectModel(catId, modelId, options = {}) {
  const models = MODELS[catId] || [];
  const model = models.find(m => m.id === modelId);
  if (!model || model.disabled) return;
  if (S.demoMode && model.pro) return;
  const { silent = false } = options;
  S.selectedCat = catId;
  S.selectedModel = model;
  // Update button
  const cat = getCatInfo(catId);
  document.getElementById('cat-badge').textContent = cat.label;
  document.getElementById('cat-badge').className = `cat-badge ${cat.badge}`;
  document.getElementById('model-name-display').textContent = model.name;
  syncComposerModeControls();
  updateInputModeUI();
  closeDropup();
  if (!silent) toast(`Model: ${model.name}`, 'check_circle');
  renderWelcomeSuggestions();
  startSuggestionRotation();
}

function updateInputModeUI() {
  const isTranscription = S.selectedCat === 'transcription';
  const input = document.getElementById('msg-input');
  const attachBtn = document.getElementById('attach-btn');
  const expandBtn = document.getElementById('composer-expand-btn');

  document.body.classList.toggle('transcription-mode', isTranscription);
  input.disabled = isTranscription;
  input.placeholder = isTranscription ? 'Upload audio for transcription.' : 'Message OrchidLLM.';

  if (isTranscription) {
    input.value = '';
    autoResize(input);
    attachBtn.title = 'Upload audio for transcription';
    if (S.composerExpanded) toggleComposerExpanded(false);
    expandBtn.disabled = true;
  } else {
    attachBtn.title = 'Attach file';
    expandBtn.disabled = false;
  }

  syncComposerModeControls();
  updateSendBtn();
}

on('model-search', 'input', e => {
  renderModelList(e.target.value);
});

/* ══════════════════════════════════════════════
   SEND MESSAGE
══════════════════════════════════════════════ */
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text && !S.attachments.length) return;

  // Demo UI mode — intercept with canned response
  if (S.demoUiMode) {
    const userMsg = { role: 'user', content: text || 'Demo input', time: ts() };
    addMsgToView(userMsg);
    input.value = ''; autoResize(input);
    S.attachments = []; clearAttachPreview();
    updateSendBtn();
    showTyping();
    await new Promise(r => setTimeout(r, 800));
    removeTyping();
    const aiMsg = { role: 'assistant', content: getDemoCannedResponse(), time: ts(), model: S.selectedModel.name };
    addMsgToView(aiMsg);
    return;
  }

  // Demo mode check
  if (S.demoMode && demoRemaining() <= 0) {
    toast('Demo limit reached (20/day). Disable demo mode in settings.', 'error');
    return;
  }

  // Prepare user message
  const userMsg = {
    role: 'user', content: text,
    attachments: S.attachments.length ? [...S.attachments] : undefined,
    time: ts(),
  };

  // Ensure chat
  const chatId = ensureCurrentChat(text || 'Untitled');
  addMessage(chatId, userMsg);
  addMsgToView(userMsg);

  // Clear input
  input.value = ''; autoResize(input);
  S.attachments = []; clearAttachPreview();
  updateSendBtn();

  // Update title
  if (!S.isTempChat && S.chats[chatId]) {
    document.getElementById('chat-title').textContent = S.chats[chatId].title;
  }

  // Demo count
  if (S.demoMode) {
    S.demoCount++;
    updateDemoBanner();
    saveState();
  }

  showTyping();
  try {
    S.isGenerating = true;
    updateSendBtn();
    if (S.selectedCat === 'image') {
      await callImageAPI(chatId, text);
    } else if (S.selectedCat === 'video') {
      await callVideoAPI(chatId, text);
    } else if (S.selectedCat === 'audio') {
      await callAudioOutAPI(chatId, text);
    } else if (S.selectedCat === 'transcription') {
      await callTranscriptionAPI(chatId, userMsg.attachments || []);
    } else if (isTextCat(S.selectedCat)) {
      if (S.isTempChat) {
        await simulateResponse(chatId, 'Temporary chat mode is active. This conversation is not saved to history.');
      } else {
        await callTextAPI(chatId, text, userMsg);
      }
    } else {
      // Placeholder for other model types
      await simulateResponse(chatId, `[${S.selectedModel.name}] This model type (${S.selectedCat}) will be available soon. Powered by pollinations.ai.`);
    }
  } catch(err) {
    removeTyping();
    const errMsg = { role:'assistant', content:`⚠️ Error: ${err.message}`, time: ts(), model: S.selectedModel.name };
    addMessage(chatId, errMsg);
    addMsgToView(errMsg);
  } finally {
    S.isGenerating = false;
    updateSendBtn();
  }
}

/* ══════════════════════════════════════════════
   SUGGESTION STRIP
══════════════════════════════════════════════ */
async function loadSuggestions() {
  try {
    S.suggestions = await fetchSuggestions();
    renderWelcomeSuggestions();
    startSuggestionRotation();
  } catch (e) {
    // Fallback — keep hardcoded chips
  }
}

function startSuggestionRotation() {
  if (suggestionInterval) clearInterval(suggestionInterval);
  suggestionInterval = setInterval(() => renderWelcomeSuggestions(), 9000);
}

function renderWelcomeSuggestions() {
  const container = document.querySelector('.w-chips');
  if (!container || !S.suggestions) return;
  const cat = S.selectedCat;
  const pool = S.suggestions[cat];
  if (!pool || !pool.length) return;
  // Pick 4 random
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 4);
  container.innerHTML = picks.map((p) => {
    const emoji = p.emoji || '✨';
    const title = p.title || (p.prompt && p.prompt.length > 40 ? p.prompt.slice(0, 40) + '…' : p.prompt);
    const prompt = p.prompt || p;
    return `<m3e-assist-chip onclick="setInputVal('${escHtml(String(prompt).replace(/'/g, "\\'"))}')">` +
      `${escHtml(emoji)} ${escHtml(title)}</m3e-assist-chip>`;
  }).join('');
}

async function callTextAPI(chatId, userText, userMsg) {
  // Build messages array from history
  let messages = [];
  if (!S.isTempChat && S.chats[chatId]) {
    messages = (S.chats[chatId].messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        const fallback = m.imageUrl
          ? '[Image response]'
          : m.videoUrl
            ? '[Video response]'
            : m.audioUrl
              ? '[Audio response]'
              : '';
        return { role: m.role, content: (m.content || fallback || '').trim() };
      })
      .filter((m) => m.content.length > 0);
  } else {
    messages = [{ role: 'user', content: userText }];
  }

  const body = {
    model: S.selectedModel.id,
    messages,
    seed: -1,
    stream: false,
    temperature: 0.7,
  };
  if (supportsToolCalling(S.selectedModel)) {
    const enabledTools = Object.entries(S.textTools)
      .filter(([k, v]) => k !== 'web' && v)
      .map(([k]) => k);
    if (enabledTools.length) {
      const modelMap = enabledTools.map((tool) => `${tool}:${S.textToolModels[tool] || 'default'}`).join(', ');
      body.messages.unshift({ role: 'system', content: `Enabled tools in UI: ${modelMap}.` });
    }
  }
  if (S.systemPrompt) body.system = S.systemPrompt;

  const payload = await fetchTextCompletion(body, S.apiMode, S.byopKey);
  const text = payload?.choices?.[0]?.message?.content || 'No response content.';

  removeTyping();
  const aiMsg = { role:'assistant', content: text.trim(), time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callImageAPI(chatId, prompt) {
  const payload = await fetchImageGeneration({
    model: S.selectedModel.id,
    prompt: prompt || 'Generate an image',
    size: '1024x1024',
    response_format: 'url',
    seed: -1,
    enhance: false,
    nologo: true,
  }, S.apiMode, S.byopKey);
  const url = payload?.data?.[0]?.url;
  if (!url) throw new Error('No image URL returned');

  removeTyping();
  const aiMsg = { role:'assistant', imageUrl: url, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callVideoAPI(chatId, prompt) {
  const payload = await fetchVideoGeneration({
    model: S.selectedModel.id,
    prompt: prompt || 'Generate a short video scene',
    size: '1280x720',
    response_format: 'url',
    duration: 4,
    aspectRatio: '16:9',
    audio: true,
    seed: -1,
    nologo: true,
  }, S.apiMode, S.byopKey);
  const url = payload?.data?.[0]?.url;
  if (!url) throw new Error('No video URL returned');

  removeTyping();
  const aiMsg = { role:'assistant', videoUrl: url, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callAudioOutAPI(chatId, text) {
  const payload = await fetchAudioGeneration({
    model: S.selectedModel.id || 'elevenlabs',
    voice: 'nova',
    input: text || 'Hello from OrchidLLM',
  }, S.apiMode, S.byopKey);

  let url = null;
  if (payload instanceof Blob) {
    url = URL.createObjectURL(payload);
  } else if (payload?.url) {
    url = payload.url;
  }
  if (!url) throw new Error('No audio returned');

  removeTyping();
  const aiMsg = {
    role: 'assistant',
    audioUrl: url,
    content: `Generated audio with ${S.selectedModel.name} (voice: nova).`,
    time: ts(),
    model: S.selectedModel.name,
  };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callTranscriptionAPI(chatId, attachments) {
  const audioAttachment = (attachments || []).find((a) => a.type?.startsWith('audio/'));
  if (!audioAttachment || !audioAttachment.data) {
    removeTyping();
    throw new Error('Attach an audio file for transcription.');
  }

  const blob = await fetch(audioAttachment.data).then((res) => res.blob());
  const form = new FormData();
  form.append('file', new File([blob], audioAttachment.name || 'audio.wav', { type: blob.type || 'audio/wav' }));
  form.append('model', S.selectedModel.id === 'scribe' ? 'scribe' : 'whisper-large-v3');

  const payload = await fetchTranscription(form, S.apiMode, S.byopKey);
  const transcript = payload?.text || payload?.transcript || 'Transcription complete.';

  removeTyping();
  const aiMsg = { role: 'assistant', content: transcript, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function simulateResponse(chatId, text) {
  await new Promise(r => setTimeout(r, 1200));
  removeTyping();
  const aiMsg = { role:'assistant', content: text, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

/* ══════════════════════════════════════════════
   ENHANCE
══════════════════════════════════════════════ */
function openEnhanceDialog() {
  const input = document.getElementById('msg-input').value.trim();
  if (!input) { toast('Enter a prompt first', 'info'); return; }
  document.getElementById('orig-preview').textContent = input;
  document.getElementById('enhanced-sec').style.display = 'none';
  document.getElementById('use-enhanced-btn').style.display = 'none';
  if (S.demoBlock) {
    document.getElementById('send-btn').disabled = true;
  }
  S.enhancedPrompt = null;
  renderEnhanceModelList('enh-eml', S.enhanceModel);
  openDlg('enhance-dlg');
}

async function doEnhance() {
  const orig = document.getElementById('orig-preview').textContent;
  const model = S.enhanceModel;
  const btn = document.getElementById('do-enhance-btn');
  btn.disabled = true; btn.innerHTML = '<span class="ms">hourglass_empty</span> Enhancing…';

  try {
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        messages:[{role:'user',content:`Rewrite and enhance this AI image/media generation prompt to be more detailed, vivid, and effective. Return only the enhanced prompt, no explanations:\n\n${orig}`}],
        model, seed:-1, stream:false,
      }),
    });
    if (!res.ok) throw new Error('API error');
    const text = (await res.text()).trim();
    S.enhancedPrompt = text;
    document.getElementById('enh-preview').textContent = text;
    document.getElementById('enhanced-sec').style.display = '';
    if (S.demoBlock) {
      document.getElementById('send-btn').disabled = true;
    } else {
      document.getElementById('send-btn').disabled = false;
      document.getElementById('use-enhanced-btn').style.display = 'flex';
    }
  } catch(e) {
    toast('Enhancement failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<span class="ms">auto_awesome</span> Enhance';
  }
}

function useEnhanced() {
  if (!S.enhancedPrompt) return;
  document.getElementById('msg-input').value = S.enhancedPrompt;
  autoResize(document.getElementById('msg-input'));
  updateSendBtn();
  closeDlg('enhance-dlg');
  toast('Enhanced prompt applied ✨', 'auto_awesome');
}

function renderEnhanceModelList(elId, current) {
  const el = document.getElementById(elId);
  el.innerHTML = MODELS.text.slice(0,6).map(m => `
    <div class="em-opt ${current===m.id?'sel':''}" onclick="selectEnhanceModel('${elId}','${m.id}')">
      <span class="ms sm">psychology</span>
      <span>${m.name}</span>
      <span style="font-size:11px;color:var(--out);margin-left:auto">${m.desc.split(' ').slice(0,3).join(' ')}</span>
    </div>`).join('');
}

function selectEnhanceModel(listId, id) {
  S.enhanceModel = id;
  renderEnhanceModelList(listId, id);
  // also sync settings list
  if (listId==='enh-eml') renderEnhanceModelList('s-eml', id);
  else renderEnhanceModelList('enh-eml', id);
  saveState();
}

/* ══════════════════════════════════════════════
   FILE ATTACHMENTS
══════════════════════════════════════════════ */
function handleFiles(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      S.attachments.push({
        name: file.name, type: file.type,
        size: file.size, data: e.target.result,
        icon: file.type.startsWith('image/') ? 'image' :
              file.type.startsWith('audio/') ? 'audio_file' :
              file.type.startsWith('video/') ? 'video_file' : 'description',
      });
      renderAttachPreview();
      updateSendBtn();
      if (S.selectedCat === 'transcription' && file.type.startsWith('audio/')) {
        sendMessage();
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderAttachPreview() {
  const el = document.getElementById('attach-preview');
  el.innerHTML = S.attachments.map((a, i) => `
    <div class="att-chip">
      <span class="ms">${a.icon}</span>
      ${escHtml(a.name.length>20?a.name.slice(0,20)+'…':a.name)}
      <button class="att-chip-del" onclick="removeAttach(${i})">×</button>
    </div>`).join('');
}

function removeAttach(i) {
  S.attachments.splice(i,1);
  renderAttachPreview();
  updateSendBtn();
}

function clearAttachPreview() {
  S.attachments = [];
  document.getElementById('attach-preview').innerHTML = '';
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
function openSettings() {
  document.getElementById('sys-prompt').value = S.systemPrompt;
  const darkTog = document.getElementById('s-dark-tog');
  if (darkTog) darkTog.checked = (S.theme === 'dark');
  const demoTog = document.getElementById('s-demo-ui-tog');
  if (demoTog) demoTog.checked = S.demoUiMode;
  document.getElementById('demo-ui-note').style.display = S.demoUiMode ? '' : 'none';
  document.getElementById('byop-key-input').value = S.byopKey;
  syncApiModeUI();
  openDlg('settings-dlg');
}

function saveSettings() {
  S.systemPrompt = document.getElementById('sys-prompt').value;
  S.byopKey = document.getElementById('byop-key-input').value.trim() || DEFAULT_BYOP_KEY;
  saveState();
  toast('Settings saved', 'check_circle');
}

function syncApiModeUI() {
  const chip = document.getElementById('active-key-chip');
  const byopInput = document.getElementById('byop-key-input');
  const cards = document.querySelectorAll('.mode-card[data-mode-card]');
  const radios = document.querySelectorAll('input[name="api-mode"]');

  cards.forEach((card) => {
    const active = card.dataset.modeCard === S.apiMode;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
  });

  radios.forEach((radio) => {
    radio.checked = radio.value === S.apiMode;
  });

  if (S.apiMode === 'byop') {
    if (chip) chip.textContent = 'BYOP Mode Active';
    byopInput.disabled = false;
    S.demoMode = false;
  } else {
    if (chip) chip.textContent = 'Demo Mode Active';
    byopInput.disabled = true;
    S.demoMode = true;
  }

  updateDemoBanner();
}

function setApiMode(mode, options = {}) {
  const { silent = false } = options;
  S.apiMode = mode === 'byop' ? 'byop' : 'demo';
  syncApiModeUI();
  saveState();
}

function syncSettingsSectionNav(section = 'general') {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const sections = document.querySelectorAll('.settings-section');
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.section === section));
  sections.forEach((panel) => panel.classList.toggle('active', panel.dataset.section === section));
}

function dismissPwaNudge() {
  S.pwaNudgeDismissed = true;
  const nudge = document.getElementById('pwa-nudge');
  nudge.style.display = 'none';
  saveState();
}

function maybeShowPwaNudge() {
  const nudge = document.getElementById('pwa-nudge');
  if (S.pwaNudgeDismissed) {
    nudge.style.display = 'none';
    return;
  }
  nudge.style.display = 'flex';
}

async function triggerInstallPrompt() {
  if (!deferredInstallPrompt) {
    toast('Install prompt unavailable. Use your browser menu: Add to Home Screen.', 'download');
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    toast('App install started', 'download_done');
  }
  deferredInstallPrompt = null;
  dismissPwaNudge();
}

/* ══════════════════════════════════════════════
   COLOR PALETTE RANDOMIZER
══════════════════════════════════════════════ */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const STATIC_PALETTES = {
  light1: { theme: 'light', hueP: 285, hueS: 320, hueT: 260 },
  light2: { theme: 'light', hueP: 330, hueS: 350, hueT: 310 },
  light3: { theme: 'light', hueP: 260, hueS: 280, hueT: 230 },
  dark1: { theme: 'dark', hueP: 285, hueS: 320, hueT: 260 },
  dark2: { theme: 'dark', hueP: 330, hueS: 350, hueT: 310 },
  dark3: { theme: 'dark', hueP: 260, hueS: 280, hueT: 230 },
};

function applyPalette(palette) {
  if (!palette) return;
  const root = document.documentElement;
  const isDark = S.theme === 'dark';

  // Primary
  root.style.setProperty('--p', hslToHex(palette.hueP, isDark ? 65 : 72, isDark ? 78 : 42));
  root.style.setProperty('--on-p', isDark ? '#000' : '#fff');
  root.style.setProperty('--pc', hslToHex(palette.hueP, isDark ? 30 : 80, isDark ? 18 : 93));
  root.style.setProperty('--on-pc', hslToHex(palette.hueP, 60, isDark ? 88 : 22));

  // Secondary
  root.style.setProperty('--s', hslToHex(palette.hueS, isDark ? 60 : 68, isDark ? 75 : 40));
  root.style.setProperty('--on-s', isDark ? '#000' : '#fff');
  root.style.setProperty('--sc', hslToHex(palette.hueS, isDark ? 30 : 75, isDark ? 16 : 92));
  root.style.setProperty('--on-sc', hslToHex(palette.hueS, 55, isDark ? 85 : 20));

  // Tertiary
  root.style.setProperty('--t', hslToHex(palette.hueT, isDark ? 55 : 70, isDark ? 72 : 44));
  root.style.setProperty('--on-t', isDark ? '#000' : '#fff');
  root.style.setProperty('--tc', hslToHex(palette.hueT, isDark ? 28 : 75, isDark ? 15 : 92));
  root.style.setProperty('--on-tc', hslToHex(palette.hueT, 55, isDark ? 85 : 20));
}

function applySeamlessVariant(id) {
  const palId = S.theme + id; 
  const p = STATIC_PALETTES[palId];
  if (!p) return;
  S.palette = { hueP: p.hueP, hueS: p.hueS, hueT: p.hueT, variantId: id };
  applyPalette(S.palette);
  saveState();
  toast('Orchid variant ' + id + ' applied 🎨', 'palette');
}

function paintPaletteSwatches() {
  ['1', '2', '3'].forEach((id) => {
    const pal = STATIC_PALETTES[`${S.theme}${id}`];
    const el = document.getElementById(`pal-var-${id}`);
    if (!pal || !el) return;
    const primary = hslToHex(pal.hueP, S.theme === 'dark' ? 65 : 72, S.theme === 'dark' ? 78 : 42);
    const secondary = hslToHex(pal.hueS, S.theme === 'dark' ? 60 : 68, S.theme === 'dark' ? 75 : 40);
    const tertiary = hslToHex(pal.hueT, S.theme === 'dark' ? 55 : 70, S.theme === 'dark' ? 72 : 44);
    el.style.background = `linear-gradient(135deg, ${primary}, ${secondary}, ${tertiary})`;
  });
}

function randomizePalette() {
  const palette = {
    hueP: Math.floor(Math.random() * 360),
    hueS: Math.floor(Math.random() * 360),
    hueT: Math.floor(Math.random() * 360),
  };
  S.palette = palette;
  applyPalette(palette);
  saveState();
  toast('Palette randomized', 'auto_awesome');
}

function clearPalette() {
  const root = document.documentElement;
  ['--p','--on-p','--pc','--on-pc','--s','--on-s','--sc','--on-sc','--t','--on-t','--tc','--on-tc']
    .forEach(v => root.style.removeProperty(v));
  S.palette = null;
  saveState();
  toast('Colors reset to default', 'restart_alt');
}

function exportHistory() {
  const data = JSON.stringify(S.chats, null, 2);
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
  a.download = `onellm-history-${Date.now()}.json`;
  a.click();
  toast('History exported', 'download');
}

function importHistory(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (typeof data === 'object') {
        Object.assign(S.chats, data);
        saveState();
        toast('History imported! Reloading...', 'upload');
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch { toast('Invalid file format', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearHistory() {
  const dlg = document.getElementById('clear-confirm-dlg');
  if (dlg && typeof dlg.show === 'function') {
    dlg.show();
    // Listen for closed event
    const handler = () => {
      if (dlg.returnValue === 'clear') _doClearHistory();
      dlg.removeEventListener('closed', handler);
    };
    dlg.addEventListener('closed', handler);
  } else {
    _doClearHistory();
  }
}
function _doClearHistory() {
  S.chats = {}; S.currentChatId = null;
  saveState(); renderHistory(); newChat();
  toast('History cleared', 'delete_sweep');
}

function updateDemoBanner() {
  const b = document.getElementById('demo-banner');
  b.classList.toggle('show', S.demoMode);
  document.getElementById('demo-counter').textContent = `${demoRemaining()} left`;
  const demoPill = document.getElementById('demo-mode-pill');
  if (demoPill) demoPill.classList.toggle('show', S.demoMode);
}

function applyDemoUiMode(on) {
  const note = document.getElementById('demo-ui-note');
  const banner = document.getElementById('demo-data-banner');
  S.demoUiMode = on;
  note.style.display = on ? '' : 'none';
  banner.classList.toggle('show', on);

  if (on) {
    if (!S.demoSnapshot) {
      S.demoSnapshot = {
        chats: structuredClone(S.chats),
        currentChatId: S.currentChatId,
        selectedCat: S.selectedCat,
        selectedModel: { ...S.selectedModel },
      };
    }

    const now = Date.now();
    S.chats = {
      demo1: {
        id: 'demo1',
        createdAt: now - 1000 * 60 * 15,
        title: 'Launch plan for OrchidLLM',
        messages: [
          { role: 'user', content: 'Build a launch checklist for OrchidLLM', time: ts() },
          { role: 'assistant', content: 'Here is a launch-ready checklist with milestones, owners, and quality gates.', time: ts(), model: 'openai' },
        ],
      },
      demo2: {
        id: 'demo2',
        createdAt: now - 1000 * 60 * 60 * 3,
        title: 'Image prompt exploration',
        messages: [
          { role: 'user', content: 'Create a cinematic city-at-night prompt', time: ts() },
          { role: 'assistant', content: 'Drafted in three styles: realistic, anime, and neon noir.', time: ts(), model: 'flux' },
        ],
      },
      demo3: {
        id: 'demo3',
        createdAt: now - 1000 * 60 * 60 * 20,
        title: 'Transcription test thread',
        messages: [
          { role: 'user', content: 'Testing audio + transcript UI states', time: ts() },
          { role: 'assistant', content: 'Placeholder transcript and speaker timeline ready.', time: ts(), model: 'transcription-soon' },
        ],
      },
    };

    S.selectedCat = 'image';
    S.selectedModel = MODELS.image[0] || S.selectedModel;
    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
    loadChat('demo1');
    renderHistory();
    saveState();
    toast('Demonstration UI data loaded', 'theaters');
  } else {
    if (S.demoSnapshot) {
      S.chats = S.demoSnapshot.chats;
      S.currentChatId = S.demoSnapshot.currentChatId;
      S.selectedCat = S.demoSnapshot.selectedCat;
      S.selectedModel = S.demoSnapshot.selectedModel;
      S.demoSnapshot = null;
    }

    // Always clear to welcome screen on demo exit
    newChat();

    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
    renderHistory();
    saveState();
    toast('Demonstration UI mode disabled', 'check_circle');
  }
}

/* Demo UI canned responses */
const DEMO_CANNED = [
  'This is a demo preview — real API calls are paused while demo data is active.',
  'Demo mode is showing sample data. Disable it in Settings > General to chat for real.',
  'Thanks for exploring! This is pre-filled demo content. Turn off demo data to send real messages.',
  'You\'re viewing the demo UI. Head to Settings > General > Demo Mode to exit.',
  'This response is a placeholder — demo data mode is on. Real models aren\'t called right now.',
];

function getDemoCannedResponse() {
  return DEMO_CANNED[Math.floor(Math.random() * DEMO_CANNED.length)];
}

/* ══════════════════════════════════════════════
   DIALOGS
══════════════════════════════════════════════ */
function openDlg(id) {
  const el = document.getElementById(id);
  if (el && typeof el.show === 'function') el.show();
  else if (el) el.classList.add('open');
}
function closeDlg(id) {
  const el = document.getElementById(id);
  if (el && typeof el.hide === 'function') el.hide();
  else if (el) el.classList.remove('open');
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function toast(msg, icon='info') {
  const host = document.getElementById('toast-host');
  if (!host) {
    if (typeof M3eSnackbar !== 'undefined') M3eSnackbar.open(msg);
    return;
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ms">${icon}</span><span>${escHtml(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

/* ══════════════════════════════════════════════
   INPUT UTILITIES
══════════════════════════════════════════════ */
function autoResize(el) {
  const minHeight = 22;
  const maxHeight = S.composerExpanded ? 340 : 110; // ~5 lines
  el.style.height = minHeight + 'px';
  const newHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
  el.style.height = newHeight + 'px';

  // Show expand button only when content exceeds ~5 lines
  const expandBtn = document.getElementById('composer-expand-btn');
  if (expandBtn) {
    if (el.scrollHeight > 110) expandBtn.classList.add('show-expand');
    else if (!S.composerExpanded) expandBtn.classList.remove('show-expand');
  }
}
function updateSendBtn() {
  const input = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  if (S.isGenerating || S.demoBlock) {
    btn.disabled = true;
  } else {
    btn.disabled = !input.value.trim() && !S.attachments.length;
  }
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function setInputVal(val) {
  document.getElementById('msg-input').value = val;
  autoResize(document.getElementById('msg-input'));
  updateSendBtn();
  document.getElementById('msg-input').focus();
}

function toggleComposerExpanded(forceState) {
  const next = typeof forceState === 'boolean' ? forceState : !S.composerExpanded;
  S.composerExpanded = next;
  document.body.classList.toggle('composer-expanded', next);
  document.querySelector('.input-row')?.classList.toggle('expanded', next);
  const icon = document.getElementById('composer-expand-icon');
  const btn = document.getElementById('composer-expand-btn');
  if (icon) icon.textContent = next ? 'close_fullscreen' : 'open_in_full';
  if (btn) btn.title = next ? 'Collapse composer' : 'Expand composer';
  autoResize(document.getElementById('msg-input'));
}

/* ══════════════════════════════════════════════
   EVENT BINDINGS
══════════════════════════════════════════════ */
// Sidebar
on('sidebar-toggle', 'click', toggleSidebar);
on('desktop-menu-btn', 'click', toggleSidebar);
on('rail-menu-tog', 'click', toggleSidebar);
on('side-ov', 'click', () => setSidebar(false));

// New chat
['new-chat-btn', 'mobile-new-chat-btn', 'rail-new-chat-btn'].forEach(id => on(id, 'click', newChat));

// Temp chat
['temp-btn', 'mobile-temp-btn', 'rail-temp-btn'].forEach(id => on(id, 'click', toggleTemp));

// Settings
['settings-btn', 'mobile-settings-btn', 'rail-settings-btn'].forEach(id => on(id, 'click', openSettings));
const settingsDlgEl = document.getElementById('settings-dlg');
if (settingsDlgEl) settingsDlgEl.addEventListener('closed', () => saveSettings());
on('s-dark-tog', 'change', e => applyTheme(e.target.checked ? 'dark' : 'light'));
onAll('.mode-card[data-mode-card]', 'click', (event) => {
  const card = event.currentTarget;
  const mode = card.dataset.modeCard;
  if (mode) setApiMode(mode);
  if (event.target instanceof HTMLInputElement) return;
  const radio = card.querySelector('input[name="api-mode"]');
  if (radio) radio.checked = true;
});
onAll('.mode-card[data-mode-card]', 'keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const card = event.currentTarget;
    const mode = card.dataset.modeCard;
    if (mode) setApiMode(mode);
  }
});
onAll('input[name="api-mode"]', 'change', (event) => {
  if (event.target.checked) setApiMode(event.target.value);
});
on('byop-link-btn', 'click', () => window.open('https://enter.pollinations.ai', '_blank', 'noopener,noreferrer'));
on('byop-key-input', 'input', e => { S.byopKey = e.target.value.trim(); });
on('s-demo-ui-tog', 'change', e => applyDemoUiMode(e.target.checked));
on('export-btn', 'click', exportHistory);
on('import-file', 'change', importHistory);
on('clear-btn', 'click', clearHistory);

// Input
on('msg-input', 'input', e => { autoResize(e.target); updateSendBtn(); });
on('msg-input', 'keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
on('send-btn', 'click', sendMessage);
on('composer-expand-btn', 'click', () => toggleComposerExpanded());

// Attach
on('attach-btn', 'click', () => document.getElementById('file-input')?.click());
on('file-input', 'change', e => handleFiles(e.target.files));

// Drag & drop
on('chat-wrap', 'dragover', e => e.preventDefault());
on('chat-wrap', 'drop', e => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
});

// Model dropup
on('model-split-btn', 'click', openDropup);
on('dropup-bg', 'click', closeDropup);
on('tools-btn', 'click', (event) => { event.stopPropagation(); toggleToolsPop(); });

onAll('[data-qmode]', 'click', (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  S.quickMode = button.dataset.qmode;
  syncQuickModeUI();
  saveState();
  showComingSoon(S.quickMode === 'voice' ? 'Voice Session Mode' : 'Agentic Mode');
});

// Enhance
on('enhance-btn', 'click', openEnhanceDialog);
const enhanceDlgEl = document.getElementById('enhance-dlg');
if (enhanceDlgEl) enhanceDlgEl.addEventListener('closed', () => {});
on('do-enhance-btn', 'click', doEnhance);
on('use-enhanced-btn', 'click', useEnhanced);
on('pwa-dismiss-btn', 'click', dismissPwaNudge);
on('pwa-open-settings-btn', 'click', () => {
  openSettings();
  const installTab = document.querySelector('m3e-tab[for="s-install"]');
  if (installTab) installTab.setAttribute('selected', '');
});
on('demo-data-exit-btn', 'click', () => {
  const tog = document.getElementById('s-demo-ui-tog');
  if (tog) tog.checked = false;
  applyDemoUiMode(false);
});
on('randomize-palette-btn', 'click', randomizePalette);
on('reset-palette-btn', 'click', clearPalette);
on('chat-inner', 'click', (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.classList.contains('msg-img')) {
    openImageViewer(target.src);
  }
});
onAll('#img-viewer .img-viewer-bg', 'click', closeImageViewer);
on('img-close-btn', 'click', closeImageViewer);
on('img-zoom-in', 'click', () => adjustImageZoom(0.15));
on('img-zoom-out', 'click', () => adjustImageZoom(-0.15));
const imgViewerStage = document.getElementById('img-viewer-stage');
if (imgViewerStage) {
  imgViewerStage.addEventListener('wheel', (event) => {
    event.preventDefault();
    adjustImageZoom(event.deltaY < 0 ? 0.08 : -0.08);
  }, { passive: false });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  maybeShowPwaNudge();
});
// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    closeDlg('settings-dlg'); closeDlg('enhance-dlg'); closeDropup();
    closeToolsPop();
    closeImageViewer();
  }
});
document.addEventListener('click', (event) => {
  const toolsWrap = document.getElementById('tools-wrap');
  if (toolsWrap && !toolsWrap.contains(event.target)) {
    closeToolsPop();
  }
});
// Paste images
document.getElementById('msg-input').addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) handleFiles([file]);
    }
  }
});

/* ══════════════════════════════════════════════
   RESPONSIVE CHECK
══════════════════════════════════════════════ */
function checkMobile() {
  const mobile = window.innerWidth <= SIDEBAR_BREAKPOINT;
  if (S.isMobile !== mobile) {
    S.isMobile = mobile;
    if (mobile) {
      if (S.sideOpen) setSidebar(false);
    } else {
      setSidebar(true);
    }
  }
}
window.addEventListener('resize', checkMobile);

Object.assign(window, {
  selectCat,
  selectModel,
  loadChat,
  deleteChat,
  setInputVal,
  applySeamlessVariant,
  clearPalette,
  randomizePalette,
  removeAttach,
  showComingSoon,
});

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function init() {
  loadState();
  applyTheme(S.theme);

  // Force check without relying on state change
  const isNowMobile = window.innerWidth <= SIDEBAR_BREAKPOINT;
  S.isMobile = isNowMobile;
  if (isNowMobile) setSidebar(false);
  else setSidebar(true);

  syncTempUi();
  renderHistory();
  setApiMode(S.apiMode, { silent: true });
  updateDemoBanner();
  syncApiModeUI();
  syncQuickModeUI();
  syncTextToolsUI();
  syncComposerModeControls();
  autoResize(document.getElementById('msg-input'));

  await loadLocalModelCatalog();
  await loadSuggestions();

  // Ensure the starting model chip is synced in UI.
  selectModel(S.selectedCat, S.selectedModel.id, { silent: true });

  if (S.demoUiMode) {
    const demoTog = document.getElementById('s-demo-ui-tog');
    if (demoTog) demoTog.checked = true;
    applyDemoUiMode(true);
  }

  // Apply saved palette
  if (S.palette) applyPalette(S.palette);

  maybeShowPwaNudge();

  // System prompt sync
  document.getElementById('sys-prompt').addEventListener('input', e => {
    S.systemPrompt = e.target.value;
  });

  // Enhance model list in settings saves on click
  // (handled in selectEnhanceModel)

  // Focus input
  setTimeout(() => document.getElementById('msg-input').focus(), 100);
}

init();
