
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

const POLL_BASE = 'https://gen.pollinations.ai';
const DEMO_API_KEY = 'pk_BU8jPqG7RBj8yOxh';
const DEFAULT_BYOP_KEY = 'pk_dfgOjlw1zrrhB5eZ';

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
const SIDEBAR_BREAKPOINT = 1100;

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
  chats: {},       // { [id]: {id,title,messages,createdAt} }
  attachments: [], // [{name,type,size,data,icon}]
  enhancedPrompt: null,
  demoSnapshot: null,
  pwaNudgeDismissed: false,
};

let deferredInstallPrompt = null;

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
      S.chats = saved.chats || {};
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
      chats: S.chats,
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

function getCatInfo(catId) { return CATS.find(c=>c.id===catId)||CATS[0]; }
function isTextCat(catId) { return catId==='text'; }
function demoRemaining() { return Math.max(0, 20 - S.demoCount); }

function getActiveApiKey() {
  if (S.apiMode === 'byop') {
    return (S.byopKey || DEFAULT_BYOP_KEY).trim();
  }
  return DEMO_API_KEY;
}

function getAuthHeaders() {
  const key = getActiveApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function getImageUrl(prompt, modelId, extras = {}) {
  const encoded = encodeURIComponent(prompt || '');
  const params = new URLSearchParams({ model: modelId, nologo: 'true', ...extras });
  const key = getActiveApiKey();
  if (key) params.set('key', key);
  return `${POLL_BASE}/image/${encoded}?${params.toString()}`;
}

async function loadLocalModelCatalog() {
  try {
    const res = await fetch('./models.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Unable to read models catalog');
    const payload = await res.json();
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

    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
  } catch (error) {
    toast(`Model catalog load failed: ${error.message}`, 'error');
  }
}

/* ══════════════════════════════════════════════
   THEME
══════════════════════════════════════════════ */
function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  const tog = document.getElementById('s-dark-tog');
  if (tog) tog.classList.toggle('on', t==='dark');
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
  sb.classList.toggle('closed', !open);
  if (S.isMobile) {
    ov.classList.toggle('show', open);
  } else {
    ov.classList.remove('show');
  }
}
function toggleSidebar() { setSidebar(!S.sideOpen); }

/* ══════════════════════════════════════════════
   TEMP CHAT
══════════════════════════════════════════════ */
function toggleTemp() {
  S.isTempChat = !S.isTempChat;
  document.getElementById('temp-btn').classList.toggle('active', S.isTempChat);
  document.getElementById('temp-pill').classList.toggle('show', S.isTempChat);
  toast(S.isTempChat ? 'Temporary chat on — won\'t be saved' : 'Temporary chat off', 'schedule');
}

function showComingSoon(label) {
  toast(`${label} is coming soon`, 'hourglass_top');
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
    <div class="typing-bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
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
          ${meta ? `<div class="mi-caps">${meta}</div>` : ''}
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
  // Show/hide enhance
  document.getElementById('enhance-wrap').classList.toggle('show', !isTextCat(catId));
  updateInputModeUI();
  closeDropup();
  if (!silent) toast(`Model: ${model.name}`, 'check_circle');
}

function updateInputModeUI() {
  const isTranscription = S.selectedCat === 'transcription';
  const input = document.getElementById('msg-input');
  const attachBtn = document.getElementById('attach-btn');
  const expandBtn = document.getElementById('composer-expand-btn');

  document.body.classList.toggle('transcription-mode', isTranscription);
  input.disabled = isTranscription;
  input.placeholder = isTranscription ? 'Upload audio for transcription.' : 'Message OneLLM.';

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

  updateSendBtn();
}

document.getElementById('model-search').addEventListener('input', e => {
  renderModelList(e.target.value);
});

/* ══════════════════════════════════════════════
   SEND MESSAGE
══════════════════════════════════════════════ */
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text && !S.attachments.length) return;

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

  // In temp chat mode we keep the flow clean with no typing spinner.
  if (!S.isTempChat) showTyping();
  try {
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
  }
}

async function callTextAPI(chatId, userText, userMsg) {
  // Build messages array from history
  let messages = [];
  if (!S.isTempChat && S.chats[chatId]) {
    messages = (S.chats[chatId].messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content || '' }));
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
  if (S.systemPrompt) body.system = S.systemPrompt;

  const res = await fetch(`${POLL_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const payload = await res.json();
  const text = payload?.choices?.[0]?.message?.content || 'No response content.';

  removeTyping();
  const aiMsg = { role:'assistant', content: text.trim(), time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callImageAPI(chatId, prompt) {
  const url = getImageUrl(prompt, S.selectedModel.id, {
    width: '1024',
    height: '1024',
    seed: String(Math.floor(Math.random() * 9999)),
    enhance: 'false',
  });

  removeTyping();
  const aiMsg = { role:'assistant', imageUrl: url, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callVideoAPI(chatId, prompt) {
  const url = getImageUrl(prompt, S.selectedModel.id, {
    duration: '4',
    aspectRatio: '16:9',
    audio: 'true',
    seed: String(Math.floor(Math.random() * 9999)),
  });

  removeTyping();
  const aiMsg = { role:'assistant', videoUrl: url, time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callAudioOutAPI(chatId, text) {
  const encoded = encodeURIComponent(text || 'Hello from OneLLM');
  const params = new URLSearchParams({
    model: S.selectedModel.id,
    voice: 'nova',
  });
  const key = getActiveApiKey();
  if (key) params.set('key', key);
  const url = `${POLL_BASE}/audio/${encoded}?${params.toString()}`;

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

  const res = await fetch(`${POLL_BASE}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription error ${res.status}`);
  }

  const payload = await res.json().catch(async () => ({ text: await res.text() }));
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
    const res = await fetch('https://text.pollinations.ai/', {
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
    document.getElementById('use-enhanced-btn').style.display = 'flex';
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
  document.getElementById('s-dark-tog').classList.toggle('on', S.theme==='dark');
  document.getElementById('s-demo-ui-tog').classList.toggle('on', S.demoUiMode);
  document.getElementById('demo-ui-note').style.display = S.demoUiMode ? '' : 'none';
  document.getElementById('byop-key-input').value = S.byopKey;
  syncApiModeUI();
  syncSettingsSectionNav();
  renderEnhanceModelList('s-eml', S.enhanceModel);
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
  if (!silent) {
    toast(S.apiMode === 'byop' ? 'BYOP mode enabled' : 'Demo mode enabled', 'vpn_key');
  }
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
        saveState(); renderHistory();
        toast('History imported!', 'upload');
      }
    } catch { toast('Invalid file format', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearHistory() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  S.chats = {}; S.currentChatId = null;
  saveState(); renderHistory(); newChat();
  toast('History cleared', 'delete_sweep');
}

function updateDemoBanner() {
  const b = document.getElementById('demo-banner');
  b.classList.toggle('show', S.demoMode);
  document.getElementById('demo-counter').textContent = `${demoRemaining()} left`;
}

function applyDemoUiMode(on) {
  const note = document.getElementById('demo-ui-note');
  S.demoUiMode = on;
  note.style.display = on ? '' : 'none';

  if (on) {
    if (!S.demoSnapshot) {
      S.demoSnapshot = {
        chats: structuredClone(S.chats),
        currentChatId: S.currentChatId,
        selectedCat: S.selectedCat,
        selectedModel: S.selectedModel,
      };
    }

    const now = Date.now();
    S.chats = {
      demo1: {
        id: 'demo1',
        createdAt: now - 1000 * 60 * 15,
        title: 'Launch plan for OneLLM',
        messages: [
          { role: 'user', content: 'Build a launch checklist for OneLLM', time: ts() },
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
    S.selectedModel = MODELS.image[0];
    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
    loadChat('demo1');
    renderHistory();
    toast('Demonstration UI data loaded', 'theaters');
  } else {
    if (S.demoSnapshot) {
      S.chats = S.demoSnapshot.chats;
      S.currentChatId = S.demoSnapshot.currentChatId;
      S.selectedCat = S.demoSnapshot.selectedCat;
      S.selectedModel = S.demoSnapshot.selectedModel;
      S.demoSnapshot = null;
    }

    const chatExists = S.currentChatId && S.chats[S.currentChatId];
    if (chatExists) {
      loadChat(S.currentChatId);
    } else {
      newChat();
    }

    selectModel(S.selectedCat, S.selectedModel.id, { silent: true });
    renderHistory();
    toast('Demonstration UI mode disabled', 'check_circle');
  }
}

/* ══════════════════════════════════════════════
   DIALOGS
══════════════════════════════════════════════ */
function openDlg(id) { document.getElementById(id).classList.add('open'); }
function closeDlg(id) { document.getElementById(id).classList.remove('open'); }

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function toast(msg, icon='info') {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ms sm">${icon}</span>${escHtml(msg)}`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

/* ══════════════════════════════════════════════
   INPUT UTILITIES
══════════════════════════════════════════════ */
function autoResize(el) {
  const maxHeight = S.composerExpanded ? Math.floor(window.innerHeight * 0.52) : 96;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
}
function updateSendBtn() {
  const input = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  btn.disabled = !input.value.trim() && !S.attachments.length;
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
document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
document.getElementById('side-ov').addEventListener('click', () => setSidebar(false));
// New chat
document.getElementById('new-chat-btn').addEventListener('click', newChat);
// Temp chat
document.getElementById('temp-btn').addEventListener('click', toggleTemp);
// Settings
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => {
  saveSettings(); closeDlg('settings-dlg');
});
document.getElementById('s-dark-tog').addEventListener('click', e => {
  const on = e.target.classList.toggle('on');
  applyTheme(on ? 'dark' : 'light');
});
document.querySelectorAll('.mode-card[data-mode-card]').forEach((card) => {
  card.addEventListener('click', (event) => {
    const mode = card.dataset.modeCard;
    if (mode) setApiMode(mode);
    if (event.target instanceof HTMLInputElement) return;
    const radio = card.querySelector('input[name="api-mode"]');
    if (radio) radio.checked = true;
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const mode = card.dataset.modeCard;
      if (mode) setApiMode(mode);
    }
  });
});
document.querySelectorAll('input[name="api-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) setApiMode(radio.value);
  });
});
document.getElementById('byop-link-btn').addEventListener('click', () => {
  window.open('https://enter.pollinations.ai', '_blank', 'noopener,noreferrer');
});
document.getElementById('byop-key-input').addEventListener('input', e => {
  S.byopKey = e.target.value.trim();
});
document.getElementById('s-demo-ui-tog').addEventListener('click', e => {
  const enabled = e.target.classList.toggle('on');
  applyDemoUiMode(enabled);
});
document.getElementById('export-btn').addEventListener('click', exportHistory);
document.getElementById('import-file').addEventListener('change', importHistory);
document.getElementById('clear-btn').addEventListener('click', clearHistory);
document.querySelector('#settings-dlg .dlg-bg').addEventListener('click', () => {
  saveSettings(); closeDlg('settings-dlg');
});
document.querySelectorAll('.settings-nav-item').forEach((item) => {
  item.addEventListener('click', () => syncSettingsSectionNav(item.dataset.section));
});
// Input
document.getElementById('msg-input').addEventListener('input', e => {
  autoResize(e.target); updateSendBtn();
});
document.getElementById('msg-input').addEventListener('keydown', e => {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('composer-expand-btn').addEventListener('click', () => toggleComposerExpanded());
// Attach
document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', e => handleFiles(e.target.files));
// Drag & drop
document.getElementById('chat-wrap').addEventListener('dragover', e => e.preventDefault());
document.getElementById('chat-wrap').addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
// Model dropup
document.getElementById('model-btn').addEventListener('click', openDropup);
document.getElementById('dropup-bg').addEventListener('click', closeDropup);
// Enhance
document.getElementById('enhance-btn').addEventListener('click', openEnhanceDialog);
document.getElementById('enhance-close').addEventListener('click', () => closeDlg('enhance-dlg'));
document.querySelector('#enhance-dlg .dlg-bg').addEventListener('click', () => closeDlg('enhance-dlg'));
document.getElementById('do-enhance-btn').addEventListener('click', doEnhance);
document.getElementById('use-enhanced-btn').addEventListener('click', useEnhanced);
document.getElementById('pwa-dismiss-btn').addEventListener('click', dismissPwaNudge);
document.getElementById('pwa-open-settings-btn').addEventListener('click', () => {
  openSettings();
  syncSettingsSectionNav('install');
});
document.getElementById('install-app-btn').addEventListener('click', triggerInstallPrompt);
document.getElementById('install-help-btn').addEventListener('click', () => {
  toast('Open browser menu and choose Install App or Add to Home Screen.', 'help');
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  maybeShowPwaNudge();
});
// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    closeDlg('settings-dlg'); closeDlg('enhance-dlg'); closeDropup();
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

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function init() {
  loadState();
  applyTheme(S.theme);

  checkMobile();
  if (!S.isMobile) setSidebar(true);
  else setSidebar(false);

  renderHistory();
  setApiMode(S.apiMode, { silent: true });
  updateDemoBanner();
  syncApiModeUI();

  await loadLocalModelCatalog();

  // Ensure the starting model chip is synced in UI.
  selectModel(S.selectedCat, S.selectedModel.id, { silent: true });

  if (S.demoUiMode) {
    document.getElementById('s-demo-ui-tog').classList.add('on');
    applyDemoUiMode(true);
  }

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

