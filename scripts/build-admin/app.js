/* OrchidLLM Admin Panel — Material 3 Expressive */
let _recharges = [];
let _announcements = [];
const API_BASE = window.location.origin;

/* ── State ── */
let currentView = 'admin';
let currentPage = 'overview';
let sessionUser = null;
let toastTimer = null;

/* ── Auth ── */
async function initAuth() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`);
    const data = await res.json();
    if (data.authenticated) {
      sessionUser = data;
      document.getElementById('sb-login').style.display = 'none';
      document.getElementById('sb-user').style.display = 'flex';
      document.getElementById('sb-username').textContent = data.githubUsername || 'User';
      document.getElementById('sb-role').textContent = data.isAdmin ? 'Admin' : 'User';
      document.getElementById('sb-avatar').src = data.githubAvatar || '';
      if (!data.isAdmin) {
        // Non-admin: hide the entire view-switch pill bar and show user nav
        document.querySelector('.view-switch').style.display = 'none';
        document.getElementById('admin-nav').style.display = 'none';
        document.getElementById('user-nav').style.display = 'block';
        go('u-overview');
      }
      loadUnreadAnnouncements();
    } else {
      document.getElementById('sb-login').style.display = 'block';
      document.getElementById('sb-user').style.display = 'none';
    }
  } catch (e) {
    document.getElementById('sb-login').style.display = 'block';
  }
}

async function doLogout() {
  await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  location.reload();
}

/* ── View Switch ── */
function switchView(view) {
  if (view === 'user') {
    // Navigate to the dedicated user dashboard
    window.location.href = '/user.html';
    return;
  }
  // Admin view: stay on admin.html, show admin nav
  currentView = 'admin';
  document.getElementById('vbtn-admin').classList.add('active');
  document.getElementById('vbtn-user').classList.remove('active');
  document.getElementById('admin-nav').style.display = 'block';
  document.getElementById('user-nav').style.display = 'none';
  go('overview');
}

/* ── Navigation ── */
function go(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  // Load data
  if (page === 'overview') loadDashboard();
  if (page === 'users') loadUsers();
  if (page === 'tiers') loadTiers();
  if (page === 'catalog') loadCatalog();
  if (page === 'recharges') loadRecharges();
  if (page === 'announcements') loadAnnouncements();
  if (page === 'keys') loadKeys();
  if (page === 'demo') loadDemoSessions();
  if (page === 'usage') loadUsage();
  if (page === 'queue') loadQueue();
  if (page === 'u-overview') loadUserOverview();
  if (page === 'u-keys') loadUserKeys();
  if (page === 'u-recharge') loadUserRecharge();
  if (page === 'u-ann') loadUserAnnouncements();
}

/* ── Toast ── */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-icon').textContent = type === 'error' ? 'error' : 'check_circle';
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ── Modal Helpers ── */
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

/* ── Dashboard ── */
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/dashboard`);
    const data = await res.json();
    document.getElementById('s-users').textContent = fmtNum(data.totalUsers);
    document.getElementById('s-keys').textContent = fmtNum(data.activeKeys);
    document.getElementById('s-today').textContent = fmtNum(data.requestsToday);
    document.getElementById('s-tokens').textContent = fmtNum(data.totalTokens);
    document.getElementById('s-queued').textContent = fmtNum(data.queuePending);
    document.getElementById('s-demo').textContent = fmtNum(data.demoSessions);
    renderChart(data.dailyRequests || []);
  } catch (e) { console.error(e); }
}

function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString();
}

function renderChart(days) {
  const container = document.getElementById('chart-bars');
  if (!days.length) { container.innerHTML = '<div class="state-empty">No data</div>'; return; }
  const max = Math.max(...days.map(d => d.count), 1);
  container.innerHTML = days.map(d => `
    <div class="bar-wrap" title="${d.date}: ${d.count}">
      <div class="bar" style="height:${Math.max((d.count/max)*100,4)}%"></div>
      <div class="bar-lbl">${d.date.slice(5)}</div>
    </div>
  `).join('');
}

/* ── Users ── */
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="7">Error loading users</td></tr>'; return; }
    tbody.innerHTML = data.map(u => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:8px"><img src="${u.github_avatar||''}" class="user-av" style="width:28px;height:28px" onerror="this.style.display='none'"><span>${u.github_username||'Unknown'}</span></div></td>
        <td><span class="badge badge-purple">${u.tier_name||'Free'}</span></td>
        <td>${fmtNum(u.credits_balance)}</td>
        <td>${fmtNum(u.credits_rollover)}</td>
        <td>${u.is_admin?'Yes':'No'}</td>
        <td>${fmtDate(u.created_at)}</td>
        <td><button class="ib" onclick="editUser(${u.id},'${u.github_username||''}',${u.tier_id||0},${u.credits_balance||0},${u.credits_rollover||0},${u.is_admin?1:0},${u.is_banned?1:0})"><span class="ms">edit</span></button></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function editUser(id, username, tierId, credits, rollover, isAdmin, isBanned) {
  document.getElementById('um-id').value = id;
  document.getElementById('um-username').value = username;
  document.getElementById('um-tier').value = tierId;
  document.getElementById('um-credits').value = credits;
  document.getElementById('um-rollover').value = rollover;
  const admToggle = document.getElementById('um-admin');
  admToggle.classList.toggle('on', !!isAdmin);
  const banToggle = document.getElementById('um-banned');
  banToggle.classList.toggle('on', !!isBanned);
  openModal('user-modal');
}

async function submitUser(e) {
  e.preventDefault();
  const id = document.getElementById('um-id').value;
  const body = {
    id,
    tierId: document.getElementById('um-tier').value,
    creditsBalance: document.getElementById('um-credits').value,
    creditsRollover: document.getElementById('um-rollover').value,
    isAdmin: document.getElementById('um-admin').classList.contains('on'),
    isBanned: document.getElementById('um-banned').classList.contains('on')
  };
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { closeModal('user-modal'); showToast('User updated'); loadUsers(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

/* ── Tiers ── */
async function loadTiers() {
  const tbody = document.getElementById('tiers-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/tiers`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="8">Error</td></tr>'; return; }
    tbody.innerHTML = data.map(t => `
      <tr>
        <td>${t.SORT_ORDER??t.sort_order??0}</td>
        <td><strong>${t.NAME??t.name??''}</strong></td>
        <td>${fmtNum(t.PRICE_IDR??t.price_idr??0)}</td>
        <td>${fmtNum(t.MONTHLY_CREDITS??t.monthly_credits??0)}</td>
        <td>${fmtNum(t.ROLLOVER_CAP??t.rollover_cap??0)}</td>
        <td>${t.QUEUE_PRIORITY_FAST??t.queue_priority_fast??0}/${t.QUEUE_PRIORITY_STD??t.queue_priority_std??0}/${t.QUEUE_PRIORITY_EXHAUSTED??t.queue_priority_exhausted??0}</td>
        <td>${t.CONCURRENT_REQUESTS??t.concurrent_requests??0}/${t.CONCURRENT_BATCHES??t.concurrent_batches??0}</td>
        <td><span class="badge ${(t.IS_ACTIVE??t.is_active)?'badge-green':'badge-red'}">${(t.IS_ACTIVE??t.is_active)?'Active':'Inactive'}</span></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

/* ── Catalog (merged model + provider mappings) ── */
let catalogData = [];
let catalogFilter = '';

async function loadCatalog() {
  const tbody = document.getElementById('catalog-tbody');
  tbody.innerHTML = '<tr><td colspan="9"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/catalog`);
    const data = await res.json();
    catalogData = Array.isArray(data) ? data : [];
    renderCatalog();
  } catch (e) { console.error(e); }
}

function filterCatalog(btn, cat) {
  catalogFilter = cat;
  document.querySelectorAll('#cat-filters .chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCatalog();
}

function renderCatalog() {
  const tbody = document.getElementById('catalog-tbody');
  let rows = catalogData;
  if (catalogFilter) rows = rows.filter(r => r.category === catalogFilter);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9"><div class="state-empty">No models</div></td></tr>'; return; }
  tbody.innerHTML = rows.map(m => {
    const providers = (m.routes||m.mappings||[]).map(r => r.providerName||r.provider_name||r.PROVIDER_NAME||'').filter(Boolean);
    const provHtml = providers.length ? providers.map(p => `<span class="badge badge-blue">${p}</span>`).join(' ') : '<span class="badge badge-grey">None</span>';
    return `
      <tr>
        <td><strong>${m.modelId||m.model_id||''}</strong><div style="font-size:11px;color:var(--md-on-surface-variant)">${m.displayName||m.display_name||''}</div></td>
        <td><span class="badge badge-purple">${m.category||''}</span></td>
        <td>${m.availableTiers?.join?.(', ') || m.modelAccessLevel || m.model_access_level || 'free'}</td>
        <td>${m.contextWindow||m.context_window||m.DEFAULT_CONTEXT_WINDOW||'—'}</td>
        <td>${m.inMultiplier||m.in_multiplier||1}</td>
        <td>${m.outMultiplier||m.out_multiplier||1}</td>
        <td>${provHtml}</td>
        <td><span class="badge ${m.isActive||m.is_active?'badge-green':'badge-red'}">${(m.isActive||m.is_active)?'Active':'Inactive'}</span></td>
        <td>
          <button class="ib" onclick="editCatalog(${m.id})"><span class="ms">edit</span></button>
          <button class="ib del" onclick="deleteCatalog(${m.id})"><span class="ms">delete</span></button>
        </td>
      </tr>
    `;
  }).join('');
}

function openCatalogModal() {
  document.getElementById('cm-id').value = '';
  document.getElementById('cm-title').textContent = 'Add Model';
  document.getElementById('catalog-form').reset();
  document.getElementById('cm-caching').classList.remove('on');
  document.getElementById('cm-batch').classList.remove('on');
  document.getElementById('cm-active').classList.add('on');
  document.getElementById('mappings-tbody').innerHTML = '';
  openModal('catalog-modal');
}

function editCatalog(id) {
  const m = catalogData.find(x => x.id === id);
  if (!m) return;
  document.getElementById('cm-id').value = m.id;
  document.getElementById('cm-title').textContent = 'Edit Model';
  document.getElementById('cm-cat').value = m.category || '';
  document.getElementById('cm-mid').value = m.modelId || m.model_id || '';
  document.getElementById('cm-dname').value = m.displayName || m.display_name || '';
  document.getElementById('cm-access').value = m.modelAccessLevel || m.model_access_level || m.availableTiers?.[0] || 'free';
  document.getElementById('cm-desc').value = m.description || '';
  document.getElementById('cm-ctx').value = m.contextWindow || m.context_window || m.DEFAULT_CONTEXT_WINDOW || '';
  document.getElementById('cm-timeout').value = m.timeoutMs || m.timeout_ms || 60000;
  document.getElementById('cm-in').value = m.inMultiplier || m.in_multiplier || 1;
  document.getElementById('cm-out').value = m.outMultiplier || m.out_multiplier || 1;
  document.getElementById('cm-cr').value = m.cacheReadMultiplier || m.cache_read_multiplier || 0.1;
  document.getElementById('cm-cw').value = m.cacheWriteMultiplier || m.cache_write_multiplier || 1.25;
  document.getElementById('cm-caching').classList.toggle('on', !!(m.supportsCaching||m.supports_caching));
  document.getElementById('cm-batch').classList.toggle('on', !!(m.supportsBatch||m.supports_batch));
  document.getElementById('cm-active').classList.toggle('on', !!(m.isActive||m.is_active));
  document.getElementById('cm-dep-date').value = m.deprecationDate || m.deprecation_date || '';
  document.getElementById('cm-dep-note').value = m.deprecationNote || m.deprecation_note || '';
  document.getElementById('cm-params').value = (m.supportedParameters||[]).join(',');

  const routes = m.routes || m.mappings || [];
  document.getElementById('mappings-tbody').innerHTML = routes.map((r,i) => mappingRowHtml(i, r)).join('');
  openModal('catalog-modal');
}

function mappingRowHtml(i, r) {
  return `
    <tr data-index="${i}">
      <td><select class="mapping-input" data-field="providerName">${PROVIDERS.map(p => `<option value="${p}" ${(r.providerName||r.provider_name||'')===p?'selected':''}>${p}</option>`).join('')}</select></td>
      <td><input type="text" class="mapping-input" data-field="providerModelId" value="${r.providerModelId||r.backendModelId||r.BACKEND_MODEL_ID||r.provider_model_id||''}" placeholder="backend model id"></td>
      <td><input type="number" class="mapping-input" data-field="contextWindow" value="${r.contextWindow||r.providerContextWindow||r.context_window||r.PROVIDER_CONTEXT_WINDOW||''}" placeholder="tokens"></td>
      <td><input type="number" class="mapping-input" data-field="priority" value="${r.priority||0}"></td>
      <td><input type="number" class="mapping-input" data-field="inMultiplier" value="${r.inMultiplier||r.in_multiplier||''}" step="0.1" placeholder="inherit"></td>
      <td><input type="number" class="mapping-input" data-field="outMultiplier" value="${r.outMultiplier||r.out_multiplier||''}" step="0.1" placeholder="inherit"></td>
      <td><input type="text" class="mapping-input" data-field="allowedParams" value="${(r.allowedParams?Object.keys(r.allowedParams).join(','):'')}" placeholder="param1,param2"></td>
      <td><input type="checkbox" class="mapping-input" data-field="supportsBatch" ${(r.supportsBatch||r.supports_batch)?'checked':''}></td>
      <td><input type="checkbox" class="mapping-input" data-field="isActive" ${(r.isActive!==false && r.is_active!==0)?'checked':''}></td>
      <td><button type="button" class="ib del" onclick="this.closest('tr').remove()"><span class="ms">delete</span></button></td>
    </tr>
  `;
}

function addMappingRow() {
  const tbody = document.getElementById('mappings-tbody');
  const i = tbody.children.length;
  const tr = document.createElement('tr');
  tr.setAttribute('data-index', i);
  tr.innerHTML = mappingRowHtml(i, {});
  tbody.appendChild(tr);
}

async function submitCatalog(e) {
  e.preventDefault();
  const id = document.getElementById('cm-id').value;
  const routes = [];
  document.querySelectorAll('#mappings-tbody tr').forEach(tr => {
    const get = f => {
      const el = tr.querySelector(`[data-field="${f}"]`);
      if (!el) return null;
      if (el.type === 'checkbox') return el.checked;
      return el.value || null;
    };
    const providerName = get('providerName');
    const providerModelId = get('providerModelId');
    if (!providerName || !providerModelId) return;
    const allowedParamsStr = get('allowedParams');
    const allowedParams = allowedParamsStr ? Object.fromEntries(allowedParamsStr.split(',').map(p => [p.trim(), {supportMode:'inherit',allowedValues:[]}])) : null;
    routes.push({
      providerName,
      providerModelId,
      backendModelId: providerModelId,
      contextWindow: get('contextWindow') ? Number(get('contextWindow')) : null,
      priority: Number(get('priority')) || 0,
      inMultiplier: get('inMultiplier') ? Number(get('inMultiplier')) : null,
      outMultiplier: get('outMultiplier') ? Number(get('outMultiplier')) : null,
      allowedParams,
      supportsBatch: !!get('supportsBatch'),
      isActive: !!get('isActive')
    });
  });

  const body = {
    category: document.getElementById('cm-cat').value,
    modelId: document.getElementById('cm-mid').value,
    displayName: document.getElementById('cm-dname').value,
    accessLevel: document.getElementById('cm-access').value,
    description: document.getElementById('cm-desc').value,
    contextWindow: document.getElementById('cm-ctx').value || null,
    timeoutMs: Number(document.getElementById('cm-timeout').value) || 60000,
    inMultiplier: Number(document.getElementById('cm-in').value) || 1,
    outMultiplier: Number(document.getElementById('cm-out').value) || 1,
    cacheReadMultiplier: Number(document.getElementById('cm-cr').value) || 0.1,
    cacheWriteMultiplier: Number(document.getElementById('cm-cw').value) || 1.25,
    supportsCaching: document.getElementById('cm-caching').classList.contains('on'),
    supportsBatch: document.getElementById('cm-batch').classList.contains('on'),
    isActive: document.getElementById('cm-active').classList.contains('on'),
    deprecationDate: document.getElementById('cm-dep-date').value || null,
    deprecationNote: document.getElementById('cm-dep-note').value || null,
    supportedParameters: document.getElementById('cm-params').value.split(',').map(s=>s.trim()).filter(Boolean),
    routes
  };
  if (id) body.id = id;

  try {
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(`${API_BASE}/api/admin/catalog`, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { closeModal('catalog-modal'); showToast(id?'Model updated':'Model created'); loadCatalog(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function deleteCatalog(id) {
  if (!confirm('Delete this model?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/catalog?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Model deleted'); loadCatalog(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

/* ── Recharge Packages ── */
async function loadRecharges() {
  const tbody = document.getElementById('recharges-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/recharge-packages`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="8">Error</td></tr>'; return; }
    _recharges = data;
    tbody.innerHTML = data.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${fmtNum(p.credits)}</td>
        <td>${fmtNum(p.priceIdr||p.price_idr||0)} ${p.originalPriceIdr?`<span style="text-decoration:line-through;opacity:.6">${fmtNum(p.originalPriceIdr)}</span>`:''}</td>
        <td>${p.discountPct||p.discount_pct||0}% ${p.isDiscountActive?'<span class="badge badge-green">Active</span>':''}</td>
        <td><span class="badge badge-purple">${p.targetTierName||p.target_tier_name||p.tierDisplayName||'Any'}</span></td>
        <td>${p.expiryDate||p.expiry_date?fmtDate(p.expiryDate||p.expiry_date)+' '+ (p.isExpired?'<span class="badge badge-red">Expired</span>':''):'Never'}</td>
        <td><span class="badge ${(p.isActive||p.is_active)&&!p.isDisabled&&!p.is_disabled?'badge-green':'badge-red'}">${(p.isActive||p.is_active)&&!p.isDisabled&&!p.is_disabled?'Active':'Inactive'}</span></td>
        <td>
          <button class="ib" onclick="editRecharge(${p.id})"><span class="ms">edit</span></button>
          <button class="ib del" onclick="deleteRecharge(${p.id})"><span class="ms">delete</span></button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function openRechargeModal() {
  document.getElementById('rm-id').value = '';
  document.getElementById('rm-title').textContent = 'New Recharge Package';
  document.getElementById('recharge-form').reset();
  document.getElementById('rm-active').classList.add('on');
  openModal('recharge-modal');
}

function editRecharge(id) {
  const p = _recharges.find(r => (r.ID||r.id) === id);
  if (!p) { showToast('Package not found — reload page','error'); return; }
  openRechargeModal();
  document.getElementById('rm-title').textContent = 'Edit Recharge Package';
  document.getElementById('rm-id').value = id;
  document.getElementById('rm-name').value = p.NAME||p.name||'';
  document.getElementById('rm-desc').value = p.DESCRIPTION||p.description||'';
  document.getElementById('rm-credits').value = p.CREDITS||p.credits||0;
  document.getElementById('rm-price').value = p.PRICE_IDR||p.price_idr||p.PRICEIDR||p.priceIdr||0;
  document.getElementById('rm-discount').value = p.DISCOUNT_PCT||p.discount_pct||p.DISCOUNTPCT||p.discountPct||0;
  // Set tier select
  const tierName = p.TARGET_TIER_NAME||p.target_tier_name||p.TARGETTIERNAME||p.targetTierName||'';
  const tierIdx = TIER_LEVELS.indexOf(tierName);
  document.getElementById('rm-tier').value = tierIdx >= 0 ? tierIdx : 0;
  // Set expiry
  const exp = p.EXPIRY_DATE||p.expiry_date||p.EXPIRYDATE||p.expiryDate;
  if (exp) {
    const d = new Date(exp);
    if (!isNaN(d)) document.getElementById('rm-expires').value = d.toISOString().slice(0,16);
  }
  // Set active toggle
  const isActive = (p.IS_ACTIVE||p.is_active) && !(p.IS_DISABLED||p.is_disabled);
  document.getElementById('rm-active').classList.toggle('on', !!isActive);
}

async function submitRecharge(e) {
  e.preventDefault();
  const id = document.getElementById('rm-id').value;
  const body = {
    name: document.getElementById('rm-name').value,
    description: document.getElementById('rm-desc').value,
    credits: Number(document.getElementById('rm-credits').value),
    priceIdr: Number(document.getElementById('rm-price').value),
    discountPct: Number(document.getElementById('rm-discount').value) || 0,
    targetTierName: TIER_LEVELS[document.getElementById('rm-tier').value] || null,
    expiryDate: document.getElementById('rm-expires').value || null,
    isActive: document.getElementById('rm-active').classList.contains('on')
  };
  if (id) body.id = id;
  try {
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(`${API_BASE}/api/admin/recharge-packages`, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { closeModal('recharge-modal'); showToast(id?'Package updated':'Package created'); loadRecharges(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function deleteRecharge(id) {
  if (!confirm('Delete this package?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/recharge-packages?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Package deleted'); loadRecharges(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

/* ── Announcements ── */
async function loadAnnouncements() {
  const tbody = document.getElementById('ann-tbody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="7">Error</td></tr>'; return; }
    _announcements = data;
    tbody.innerHTML = data.map(a => `
      <tr>
        <td><strong>${a.TITLE||a.title||''}</strong></td>
        <td><span class="badge badge-${(a.TYPE||a.type||'info')==='error'?'red':(a.TYPE||a.type||'info')==='warning'?'orange':(a.TYPE||a.type||'info')==='success'?'green':'blue'}">${a.TYPE||a.type||'info'}</span></td>
        <td>${(a.IS_BANNER||a.is_banner)?'<span class="badge badge-green">Yes</span>':'No'}</td>
        <td>${(a.IS_URGENT||a.is_urgent)?'<span class="badge badge-red">Yes</span>':'No'}</td>
        <td>${a.EXPIRES_AT||a.expires_at?fmtDate(a.EXPIRES_AT||a.expires_at):'Never'}</td>
        <td><span class="badge ${(a.IS_ACTIVE||a.is_active)?'badge-green':'badge-red'}">${(a.IS_ACTIVE||a.is_active)?'Active':'Inactive'}</span></td>
        <td>
          <button class="ib" onclick="editAnnouncement(${a.ID||a.id})"><span class="ms">edit</span></button>
          <button class="ib del" onclick="deleteAnnouncement(${a.ID||a.id})"><span class="ms">delete</span></button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function openAnnModal() {
  document.getElementById('am-id').value = '';
  document.getElementById('am-title').textContent = 'New Announcement';
  document.getElementById('ann-form').reset();
  document.getElementById('am-active').classList.add('on');
  document.getElementById('am-banner').classList.remove('on');
  document.getElementById('am-urgent').classList.remove('on');
  openModal('ann-modal');
}

function editAnnouncement(id) {
  const a = _announcements.find(r => (r.ID||r.id) === id);
  if (!a) { showToast('Announcement not found — reload page','error'); return; }
  openAnnModal();
  document.getElementById('am-title').textContent = 'Edit Announcement';
  document.getElementById('am-id').value = id;
  document.getElementById('am-title-f').value = a.TITLE||a.title||'';
  document.getElementById('am-content').value = a.CONTENT||a.content||'';
  document.getElementById('am-type').value = a.TYPE||a.type||'info';
  const exp = a.EXPIRES_AT||a.expires_at;
  if (exp) {
    const d = new Date(exp);
    if (!isNaN(d)) document.getElementById('am-expires').value = d.toISOString().slice(0,16);
  }
  document.getElementById('am-active').classList.toggle('on', !!(a.IS_ACTIVE||a.is_active));
  document.getElementById('am-banner').classList.toggle('on', !!(a.IS_BANNER||a.is_banner));
  document.getElementById('am-urgent').classList.toggle('on', !!(a.IS_URGENT||a.is_urgent));
}

async function submitAnn(e) {
  e.preventDefault();
  const id = document.getElementById('am-id').value;
  const body = {
    title: document.getElementById('am-title-f').value,
    content: document.getElementById('am-content').value,
    type: document.getElementById('am-type').value,
    expiresAt: document.getElementById('am-expires').value || null,
    isActive: document.getElementById('am-active').classList.contains('on'),
    isBanner: document.getElementById('am-banner').classList.contains('on'),
    isUrgent: document.getElementById('am-urgent').classList.contains('on')
  };
  if (id) body.id = id;
  try {
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(`${API_BASE}/api/admin/announcements`, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { closeModal('ann-modal'); showToast(id?'Announcement updated':'Announcement created'); loadAnnouncements(); loadBanners(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Deleted'); loadAnnouncements(); loadBanners(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

/* ── Banners ── */
async function loadBanners() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements`);
    const data = await res.json();
    const banners = (Array.isArray(data)?data:[]).filter(a => (a.IS_BANNER||a.is_banner) && (a.IS_ACTIVE||a.is_active));
    const container = document.getElementById('banners');
    container.innerHTML = banners.slice(0,3).map(b => `
      <div class="banner ${(b.IS_URGENT||b.is_urgent)?'urgent':'info'}" onclick="location.href='#announcements'">
        <span class="ms">${(b.IS_URGENT||b.is_urgent)?'warning':'info'}</span>
        <span>${b.TITLE||b.title||''}</span>
        <button class="banner-close" onclick="event.stopPropagation();dismissBanner(${b.ID||b.id},this)"><span class="ms">close</span></button>
      </div>
    `).join('');
  } catch (e) {}
}

async function dismissBanner(id, btn) {
  try {
    await fetch(`${API_BASE}/api/admin/announcements/${id}/dismiss`, { method: 'POST' });
    btn.closest('.banner').remove();
  } catch (e) {}
}

async function loadUnreadAnnouncements() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements`);
    const data = await res.json();
    const unread = (Array.isArray(data)?data:[]).filter(a => (a.IS_ACTIVE||a.is_active)).length;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.classList.toggle('show', unread > 0);
  } catch (e) {}
}

/* ── API Keys ── */
let keyFilter = 'all';

async function loadKeys() {
  const tbody = document.getElementById('keys-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/keys`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="8">Error</td></tr>'; return; }
    let rows = data;
    if (keyFilter !== 'all') rows = rows.filter(k => (k.KEY_TYPE||k.key_type) === keyFilter);
    tbody.innerHTML = rows.map(k => `
      <tr>
        <td><span class="mono">${(k.KEY||k.key||'').slice(0,16)}...</span></td>
        <td>${k.NAME||k.name||''}</td>
        <td><span class="badge badge-blue">${k.KEY_TYPE||k.key_type||'global'}</span></td>
        <td><span class="badge ${(k.IS_ACTIVE||k.is_active)?'badge-green':'badge-red'}">${(k.IS_ACTIVE||k.is_active)?'Active':'Inactive'}</span></td>
        <td>${k.RPM||k.rpm||0}/${k.RPD||k.rpd||0}</td>
        <td>${fmtNum(k.USAGE_COUNT||k.usage_count||0)}</td>
        <td>${k.LAST_USED||k.last_used?fmtDate(k.LAST_USED||k.last_used):'Never'}</td>
        <td><button class="ib del" onclick="deleteKey(${k.ID||k.id})"><span class="ms">delete</span></button></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function filterKeys(type) {
  keyFilter = type;
  document.querySelectorAll('#page-keys .chip').forEach(c => c.classList.remove('active'));
  document.getElementById('kf-' + type).classList.add('active');
  loadKeys();
}

function openKeyModal() {
  document.getElementById('km-id').value = '';
  document.getElementById('km-title').textContent = 'New API Key';
  document.getElementById('key-form').reset();
  openModal('key-modal');
}

async function submitKey(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('km-name').value,
    rpm: Number(document.getElementById('km-rpm').value) || 5,
    rpd: Number(document.getElementById('km-rpd').value) || 20,
    inputTokenLimit: Number(document.getElementById('km-itl').value) || 10000,
    queuePriority: Number(document.getElementById('km-qp').value) || 0,
    expiresInDays: document.getElementById('km-exp').value ? Number(document.getElementById('km-exp').value) : null
  };
  try {
    const res = await fetch(`${API_BASE}/api/admin/keys`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { closeModal('key-modal'); showToast('Key created'); loadKeys(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function deleteKey(id) {
  if (!confirm('Delete this key?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/keys?keyId=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Key deleted'); loadKeys(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

/* ── Demo Sessions ── */
async function loadDemoSessions() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/demo-sessions`);
    const data = await res.json();
    document.getElementById('ds-active').textContent = fmtNum(data.active);
    document.getElementById('ds-blocked').textContent = fmtNum(data.blocked);
    document.getElementById('ds-purge').textContent = fmtNum(data.purgeEligible);
    const tbody = document.getElementById('demo-tbody');
    if (!data.sessions?.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="state-empty">No sessions</div></td></tr>'; return; }
    tbody.innerHTML = data.sessions.map(s => `
      <tr>
        <td><span class="mono">${s.ip_address||s.IP_ADDRESS||'—'}</span></td>
        <td>${fmtNum(s.request_count||s.REQUEST_COUNT||0)}</td>
        <td>${fmtDate(s.first_seen||s.FIRST_SEEN)}</td>
        <td>${fmtDate(s.last_seen||s.LAST_SEEN)}</td>
        <td><span class="badge ${(s.is_blocked||s.IS_BLOCKED)?'badge-red':'badge-green'}">${(s.is_blocked||s.IS_BLOCKED)?'Blocked':'Active'}</span></td>
        <td><button class="ib del" onclick="blockDemo('${s.composite_hash||s.COMPOSITE_HASH}')"><span class="ms">block</span></button></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

async function purgeDemoKeys() {
  if (!confirm('Purge demo sessions inactive 30+ days?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/demo-sessions?action=purge`, { method: 'POST' });
    if (res.ok) { showToast('Purged'); loadDemoSessions(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function blockDemo(hash) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/demo-sessions`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({compositeHash:hash,isBlocked:true}) });
    if (res.ok) { showToast('Blocked'); loadDemoSessions(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

function filterDemo(type) {
  // Simplified: reload all
  loadDemoSessions();
}

/* ── Usage ── */
async function loadUsage() {
  const tbody = document.getElementById('usage-tbody');
  tbody.innerHTML = '<tr><td colspan="6"><div class="state-empty"><div class="spin"></div></div></td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/admin/usage`);
    const data = await res.json();
    if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="6">Error</td></tr>'; return; }
    tbody.innerHTML = data.map(u => `
      <tr>
        <td><span class="mono">${u.IDENTIFIER||u.identifier||'—'}</span></td>
        <td>${u.MODEL||u.model||'—'}</td>
        <td>${fmtNum(u.INPUT_TOKENS||u.input_tokens||0)}</td>
        <td>${fmtNum(u.OUTPUT_TOKENS||u.output_tokens||0)}</td>
        <td><span class="mono">${u.IP_ADDRESS||u.ip_address||'—'}</span></td>
        <td>${fmtDate(u.CREATED_AT||u.created_at)}</td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

/* ── Queue ── */
async function loadQueue() {
  try {
    const res = await fetch(`${API_BASE}/api/queue/status`);
    const data = await res.json();
    document.getElementById('q-queued').textContent = fmtNum(data.queued);
    document.getElementById('q-proc').textContent = fmtNum(data.processing);
    document.getElementById('q-fail').textContent = fmtNum(data.failed);
    document.getElementById('q-done').textContent = fmtNum(data.completed);
    const tbody = document.getElementById('queue-tbody');
    if (!data.items?.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="state-empty">No items</div></td></tr>'; return; }
    tbody.innerHTML = data.items.map(q => `
      <tr>
        <td><span class="mono">${(q.ID||q.id||'').slice(0,20)}...</span></td>
        <td>${q.MODEL||q.model||'—'}</td>
        <td>${q.PRIORITY||q.priority||0}</td>
        <td><span class="badge badge-${(q.STATUS||q.status)==='queued'?'orange':(q.STATUS||q.status)==='failed'?'red':'green'}">${q.STATUS||q.status||'—'}</span></td>
        <td>${fmtDate(q.CREATED_AT||q.created_at)}</td>
        <td>${q.FINISHED_AT||q.finished_at?fmtDate(q.FINISHED_AT||q.finished_at):'—'}</td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function filterQueue(type) {
  loadQueue();
}

/* ── User View ── */
async function loadUserOverview() {
  try {
    const res = await fetch(`${API_BASE}/api/user/me`);
    const data = await res.json();
    document.getElementById('u-tier').textContent = data.tier?.name || 'Free';
    document.getElementById('u-credits').textContent = fmtNum(data.credits?.balance);
    document.getElementById('u-rollover').textContent = fmtNum(data.credits?.rollover);
  } catch (e) { console.error(e); }
}

async function loadUserKeys() {
  const tbody = document.getElementById('u-keys-tbody');
  try {
    const res = await fetch(`${API_BASE}/api/user/keys`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { tbody.innerHTML = '<tr><td colspan="4"><div class="state-empty">No keys yet</div></td></tr>'; return; }
    tbody.innerHTML = data.map(k => `
      <tr>
        <td>${k.NAME||k.name||'Personal Key'}</td>
        <td><span class="mono" onclick="this.textContent=(this.textContent==='Click to reveal'?('${k.KEY||k.key||''}'):'Click to reveal')" style="cursor:pointer">Click to reveal</span></td>
        <td>${fmtNum(k.USAGE_COUNT||k.usage_count||0)}</td>
        <td><button class="ib del" onclick="deleteUserKey(${k.ID||k.id})"><span class="ms">delete</span></button></td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

async function createUserKey() {
  try {
    const res = await fetch(`${API_BASE}/api/user/keys`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name:'New Key'}) });
    if (res.ok) { showToast('Key created'); loadUserKeys(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function deleteUserKey(id) {
  if (!confirm('Delete this key?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/user/keys?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Deleted'); loadUserKeys(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function loadUserRecharge() {
  const grid = document.getElementById('recharge-grid');
  try {
    const res = await fetch(`${API_BASE}/api/user/recharge`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { grid.innerHTML = '<div class="state-empty">No packages available</div>'; return; }
    grid.innerHTML = data.map(p => `
      <div class="card" style="display:flex;flex-direction:column;gap:12px">
        <div style="font-size:18px;font-weight:800">${p.name}</div>
        <div style="font-size:14px;color:var(--md-on-surface-variant)">${p.description||''}</div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:28px;font-weight:800">Rp ${fmtNum(p.priceIdr||p.price_idr||0)}</span>
          ${p.originalPriceIdr?`<span style="text-decoration:line-through;opacity:.6">Rp ${fmtNum(p.originalPriceIdr)}</span>`:''}
        </div>
        <div><span class="badge badge-purple">${fmtNum(p.credits)} credits</span> ${p.discountPct?`<span class="badge badge-green">${p.discountPct}% off</span>`:''}</div>
        <button class="btn btn-filled" style="margin-top:auto" onclick="buyRecharge(${p.id})">Purchase</button>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function buyRecharge(packageId) {
  try {
    const res = await fetch(`${API_BASE}/api/user/recharge`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({packageId}) });
    if (res.ok) { showToast('Recharge successful!'); loadUserOverview(); }
    else { const err = await res.json(); showToast(err.error||'Error','error'); }
  } catch (e) { showToast('Network error','error'); }
}

async function loadUserAnnouncements() {
  const page = document.getElementById('u-ann-page');
  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { page.innerHTML = '<div class="state-empty">No announcements</div>'; return; }
    page.innerHTML = data.filter(a => a.IS_ACTIVE||a.is_active).map(a => `
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="badge badge-${(a.TYPE||a.type||'info')==='error'?'red':(a.TYPE||a.type||'info')==='warning'?'orange':(a.TYPE||a.type||'info')==='success'?'green':'blue'}">${a.TYPE||a.type||'info'}</span>
          <span style="font-weight:700">${a.TITLE||a.title||''}</span>
          <span style="margin-left:auto;font-size:12px;color:var(--md-on-surface-variant)">${fmtDate(a.CREATED_AT||a.created_at)}</span>
        </div>
        <div class="md-content">${marked.parse(a.CONTENT||a.content||'')}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

/* ── Utilities ── */
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0,16);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadBanners();
  go('overview');
});
