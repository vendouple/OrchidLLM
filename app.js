
/* ══════════════════════════════════════════════
   DATA — MODELS
══════════════════════════════════════════════ */
const CATS = [
  { id:'text', label:'Text', icon:'chat', badge:'cb-text' },
  { id:'image', label:'Image', icon:'image', badge:'cb-image' },
  { id:'video', label:'Video', icon:'videocam', badge:'cb-video' },
  { id:'audio-out', label:'Audio Out', icon:'volume_up', badge:'cb-audio' },
  { id:'audio-in', label:'Audio In', icon:'mic', badge:'cb-audio' },
  { id:'transcription', label:'Transcribe', icon:'mic_external_on', badge:'cb-transcription' },
];

const MODELS = {
  text: [
    { id:'openai', name:'openai', desc:'GPT-4o via Pollinations', caps:['vision','reasoning'] },
    { id:'openai-large', name:'openai-large', desc:'GPT-4o large context', caps:['vision','reasoning','code'] },
    { id:'openai-reasoning', name:'openai-reasoning', desc:'o3-mini — reasoning model', caps:['reasoning','code'] },
    { id:'mistral', name:'mistral', desc:'Mistral Large latest', caps:[] },
    { id:'llama', name:'llama', desc:'Meta Llama 3.3 70B', caps:['reasoning'] },
    { id:'llama-large', name:'llama-large', desc:'Llama 3.1 405B', caps:['reasoning'] },
    { id:'gemini', name:'gemini', desc:'Google Gemini 2.0 Flash', caps:['vision','search'] },
    { id:'gemini-thinking', name:'gemini-thinking', desc:'Gemini 2.0 Flash Thinking', caps:['reasoning','search'] },
    { id:'deepseek', name:'deepseek', desc:'DeepSeek V3', caps:['reasoning','code'] },
    { id:'deepseek-r1', name:'deepseek-r1', desc:'DeepSeek R1 — thinking', caps:['reasoning','code'] },
    { id:'qwen-coder', name:'qwen-coder', desc:'Qwen 2.5 Coder 32B', caps:['code'] },
    { id:'claude-hybridspace', name:'claude-hybridspace', desc:'Claude Hybridspace', caps:['vision','reasoning'] },
  ],
  image: [
    { id:'flux', name:'flux', desc:'FLUX.1 — high quality', caps:['vision'] },
    { id:'flux-realism', name:'flux-realism', desc:'FLUX Realism LoRA', caps:[] },
    { id:'flux-anime', name:'flux-anime', desc:'FLUX Anime style', caps:[] },
    { id:'flux-3d', name:'flux-3d', desc:'FLUX 3D rendering', caps:[] },
    { id:'flux-pro', name:'flux-pro', desc:'FLUX Pro — premium', caps:[] },
    { id:'turbo', name:'turbo', desc:'Fast SDXL Turbo', caps:[] },
    { id:'gptimage', name:'gptimage', desc:'GPT Image Generation', caps:['vision'] },
  ],
  video: [
    { id:'video-soon', name:'Video Models', desc:'Coming soon — stay tuned!', caps:[], disabled:true },
  ],
  'audio-out': [
    { id:'audio-out-soon', name:'TTS Models', desc:'Text-to-speech coming soon', caps:[], disabled:true },
  ],
  'audio-in': [
    { id:'audio-in-soon', name:'Audio Input', desc:'Audio input models coming soon', caps:[], disabled:true },
  ],
  transcription: [
    { id:'transcription-soon', name:'Transcription', desc:'Whisper & more coming soon', caps:[], disabled:true },
  ],
};

const CAPS_META = {
  vision:    { label:'Vision',    icon:'visibility' },
  reasoning: { label:'Reasoning', icon:'psychology' },
  search:    { label:'Search',    icon:'search' },
  code:      { label:'Code',      icon:'code' },
  'audio-in':  { label:'Audio In',  icon:'mic' },
  'audio-out': { label:'Audio Out', icon:'volume_up' },
};

const TEXT_MODEL_IDS = MODELS.text.map(m => m.id);
const SIDEBAR_BREAKPOINT = 1100;
const TEMP_MODEL_PRESETS = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'creative', label: 'Creative' },
  { id: 'precise', label: 'Precise' },
  { id: 'coder', label: 'Coder' },
  { id: 'vision', label: 'Vision+' },
];

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let S = {
  theme: 'light',
  sideOpen: true,
  isMobile: window.innerWidth <= SIDEBAR_BREAKPOINT,
  demoMode: false,
  demoCount: 0,  // used today
  demoUiMode: false,
  systemPrompt: '',
  enhanceModel: 'openai',
  selectedCat: 'text',
  selectedModel: MODELS.text[0],
  currentChatId: null,
  isTempChat: false,
  tempModelPreset: 'balanced',
  chats: {},       // { [id]: {id,title,messages,createdAt} }
  attachments: [], // [{name,type,size,data,icon}]
  enhancedPrompt: null,
  demoSnapshot: null,
};

/* ══════════════════════════════════════════════
   LOCAL STORAGE
══════════════════════════════════════════════ */
function loadState() {
  try {
    const raw = localStorage.getItem('onellm_state');
    if (raw) {
      const saved = JSON.parse(raw);
      S.theme = saved.theme || 'light';
      S.demoMode = saved.demoMode || false;
      S.demoCount = saved.demoCount || 0;
      S.systemPrompt = saved.systemPrompt || '';
      S.enhanceModel = saved.enhanceModel || 'openai';
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

/* ══════════════════════════════════════════════
   THEME
══════════════════════════════════════════════ */
function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  const icon = t==='dark' ? 'dark_mode' : 'light_mode';
  document.getElementById('theme-icon').textContent = icon;
  document.getElementById('topbar-theme-icon').textContent = icon;
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
  document.getElementById('temp-model-row').classList.toggle('show', S.isTempChat);
  document.getElementById('temp-model-row').setAttribute('aria-hidden', String(!S.isTempChat));
  renderTempModelPresets();
  toast(S.isTempChat ? 'Temporary chat on — won\'t be saved' : 'Temporary chat off', 'schedule');
}

function renderTempModelPresets() {
  const list = document.getElementById('temp-model-list');
  list.innerHTML = TEMP_MODEL_PRESETS.map((preset) => {
    const active = preset.id === S.tempModelPreset ? 'active' : '';
    return `<button type="button" class="temp-model-chip ${active}" onclick="selectTempModelPreset('${preset.id}')">${preset.label}</button>`;
  }).join('');
}

function selectTempModelPreset(id) {
  S.tempModelPreset = id;
  renderTempModelPresets();
  const label = TEMP_MODEL_PRESETS.find((preset) => preset.id === id)?.label || 'Preset';
  toast(`Temporary preset: ${label}`, 'tune');
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
    const caps = m.caps.map(c => {
      const cm = CAPS_META[c]; if (!cm) return '';
      return `<span class="cap-chip"><span class="ms">${cm.icon}</span>${cm.label}</span>`;
    }).join('');
    const disabled = m.disabled ? 'style="opacity:.5;pointer-events:none"' : '';
    return `
      <div class="model-item ${sel}" onclick="selectModel('${S.selectedCat}','${m.id}')" ${disabled}>
        <div class="mi-info">
          <div class="mi-name">${escHtml(m.name)}</div>
          <div class="mi-desc">${escHtml(m.desc)}</div>
          ${caps ? `<div class="mi-caps">${caps}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function selectModel(catId, modelId, options = {}) {
  const models = MODELS[catId] || [];
  const model = models.find(m => m.id === modelId);
  if (!model || model.disabled) return;
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
  closeDropup();
  if (!silent) toast(`Model: ${model.name}`, 'check_circle');
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
    const isImg = S.selectedCat === 'image';
    if (isImg) {
      await callImageAPI(chatId, text);
    } else if (isTextCat(S.selectedCat)) {
      if (S.isTempChat) {
        const presetLabel = TEMP_MODEL_PRESETS.find((preset) => preset.id === S.tempModelPreset)?.label || 'Balanced';
        await simulateResponse(chatId, `[Temp ${presetLabel}] Preview response for temporary chat mode. Use this to evaluate UI state before backend wiring.`);
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
    messages,
    model: S.selectedModel.id,
    seed: -1,
    stream: false,
  };
  if (S.systemPrompt) body.system = S.systemPrompt;

  const res = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const text = await res.text();

  removeTyping();
  const aiMsg = { role:'assistant', content: text.trim(), time: ts(), model: S.selectedModel.name };
  addMessage(chatId, aiMsg);
  addMsgToView(aiMsg);
}

async function callImageAPI(chatId, prompt) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=${S.selectedModel.id}&nologo=true&width=1024&height=1024&seed=${Math.floor(Math.random()*9999)}`;
  
  // Pre-load image
  await new Promise((res, rej) => {
    const img = new Image();
    img.onload = res; img.onerror = () => rej(new Error('Image generation failed'));
    img.src = url;
  });

  removeTyping();
  const aiMsg = { role:'assistant', imageUrl: url, time: ts(), model: S.selectedModel.name };
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
  document.getElementById('s-demo-tog').classList.toggle('on', S.demoMode);
  document.getElementById('s-demo-ui-tog').classList.toggle('on', S.demoUiMode);
  document.getElementById('demo-ui-note').style.display = S.demoUiMode ? '' : 'none';
  renderEnhanceModelList('s-eml', S.enhanceModel);
  openDlg('settings-dlg');
}

function saveSettings() {
  S.systemPrompt = document.getElementById('sys-prompt').value;
  saveState();
  toast('Settings saved', 'check_circle');
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
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
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
// Theme
document.getElementById('theme-btn').addEventListener('click', toggleTheme);
document.getElementById('topbar-theme-btn').addEventListener('click', toggleTheme);
// Settings
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => {
  saveSettings(); closeDlg('settings-dlg');
});
document.getElementById('s-dark-tog').addEventListener('click', e => {
  const on = e.target.classList.toggle('on');
  applyTheme(on ? 'dark' : 'light');
});
document.getElementById('s-demo-tog').addEventListener('click', e => {
  S.demoMode = e.target.classList.toggle('on');
  updateDemoBanner(); saveState();
  toast(S.demoMode ? 'Demo mode on (20 RPD)' : 'Demo mode off', 'bolt');
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
// Input
document.getElementById('msg-input').addEventListener('input', e => {
  autoResize(e.target); updateSendBtn();
});
document.getElementById('msg-input').addEventListener('keydown', e => {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.getElementById('send-btn').addEventListener('click', sendMessage);
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
      document.getElementById('topbar-theme-btn').style.display = '';
    } else {
      setSidebar(true);
      document.getElementById('topbar-theme-btn').style.display = 'none';
    }
  }
}
window.addEventListener('resize', checkMobile);

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
function init() {
  loadState();
  applyTheme(S.theme);

  checkMobile();
  if (!S.isMobile) setSidebar(true);
  else setSidebar(false);

  renderHistory();
  updateDemoBanner();
  renderTempModelPresets();
  document.getElementById('temp-model-row').classList.toggle('show', S.isTempChat);
  document.getElementById('temp-model-row').setAttribute('aria-hidden', String(!S.isTempChat));

  // Ensure the starting model chip is synced in UI.
  selectModel(S.selectedCat, S.selectedModel.id, { silent: true });

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

