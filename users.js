/**
 * OrchidLLM Dashboard — users.js
 * Handles navigation, auth state, API calls, and section rendering.
 */

// ─── Theme ───
(function initTheme() {
  const saved = localStorage.getItem('orchid-dark');
  const isDark = saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelector('m3e-theme')?.setAttribute('color-scheme', 'dark');
  }
})();

// ─── State ───
let currentUser = null;
let currentSection = 'overview';
const API = '/api';

// ─── DOM Ready ───
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initThemeToggle();
  initKeyDialog();
  checkAuth();
});

// ─── Navigation ───
function initNav() {
  const railItems = document.querySelectorAll('.rail-item[data-nav]');
  const mobItems = document.querySelectorAll('.mob-nav-item[data-nav]');

  const navigate = (section) => {
    if (section === 'admin-link') {
      window.location.href = '/admin.html';
      return;
    }
    currentSection = section;

    // Update rail
    railItems.forEach(el => {
      el.classList.toggle('active', el.dataset.nav === section);
    });
    // Update mobile
    mobItems.forEach(el => {
      el.classList.toggle('active', el.dataset.nav === section);
      const indicator = el.querySelector('.mob-nav-indicator');
      if (indicator) indicator.style.display = el.classList.contains('active') ? 'block' : 'none';
    });
    // Show section
    document.querySelectorAll('.dash-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `sec-${section}`);
    });
    // Update topbar title
    const titles = {
      overview: 'Dashboard',
      models: 'Model Catalog',
      keys: 'API Keys',
      billing: 'Billing & Plans',
      logs: 'Activity Logs',
      account: 'Account Settings'
    };
    document.getElementById('topbar-title').textContent = titles[section] || 'Dashboard';

    // Scroll to top
    document.getElementById('dash-content').scrollTop = 0;
  };

  railItems.forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));
  mobItems.forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));

  // URL hash support
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById(`sec-${hash}`)) {
    navigate(hash);
  }
}

// ─── Theme Toggle ───
function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    document.querySelector('m3e-theme')?.setAttribute('color-scheme', newTheme);
    localStorage.setItem('orchid-dark', newTheme === 'dark' ? '1' : '0');
    // Update icon
    const icon = btn.querySelector('m3e-icon');
    if (icon) icon.setAttribute('name', newTheme === 'dark' ? 'light_mode' : 'dark_mode');
  });
  // Set initial icon
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = btn.querySelector('m3e-icon');
  if (icon) icon.setAttribute('name', isDark ? 'light_mode' : 'dark_mode');
}

// ─── Auth Check ───
async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth/session`, { credentials: 'include' });
    if (!res.ok) throw new Error('Not authenticated');
    const data = await res.json();
    if (!data.authenticated) throw new Error('Not authenticated');
    // Normalize user object — API returns camelCase
    const raw = data.user || {};
    currentUser = {
      id: raw.id,
      username: raw.username || raw.githubUsername || raw.displayName,
      login: raw.githubUsername || raw.username,
      email: raw.email,
      avatar_url: raw.avatarUrl || raw.avatar_url,
      role: raw.role || (raw.isAdmin || data.isAdmin ? 'admin' : 'user'),
      tier_name: raw.tierName || data.modelAccessTier || 'Free',
      tier_id: raw.tierId,
      created_at: raw.createdAt || raw.created_at,
    };
    onAuthenticated();
  } catch {
    onUnauthenticated();
  }
}

function onAuthenticated() {
  document.getElementById('auth-gate').style.display = 'none';
  document.querySelectorAll('.dash-section').forEach(s => s.style.pointerEvents = '');

  // Fill user info
  const u = currentUser;
  document.getElementById('topbar-sub').textContent = `Welcome, ${u.username || u.login || 'User'}`;

  // Avatar
  if (u.avatar_url) {
    const imgs = [
      document.getElementById('topbar-avatar-img'),
      document.getElementById('account-avatar-img')
    ];
    imgs.forEach(img => {
      if (img) { img.src = u.avatar_url; img.style.display = 'block'; }
    });
  }

  // Tier chip
  const tierName = u.tier_name || 'Free';
  const tierChip = document.getElementById('tier-chip');
  tierChip.textContent = tierName;
  tierChip.className = 'tier-chip tier-' + tierName.toLowerCase().replace(/\+/g, 'plus');

  // Account section
  document.getElementById('account-username').textContent = u.username || u.login || '—';
  document.getElementById('account-email').textContent = u.email || 'No email set';
  document.getElementById('account-joined').textContent = u.created_at
    ? 'Member since ' + new Date(u.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  document.getElementById('github-handle').textContent = '@' + (u.login || u.username || '');

  // Admin link
  if (u.role === 'admin') {
    document.getElementById('rail-admin-btn').style.display = '';
  }

  // Load data
  loadCredits();
  loadModels();
  loadKeys();
  loadLogs();
  loadAnnouncements();
}

function onUnauthenticated() {
  document.getElementById('auth-gate').style.display = 'flex';
  document.querySelectorAll('.dash-section').forEach(s => s.style.display = 'none');
}

// ─── Load Credits ───
async function loadCredits() {
  try {
    const res = await fetch(`${API}/user/credits`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const c = data.credits || data;

    const stdTotal = c.credits_standard_total || 1000;
    const stdCurrent = c.credits_standard ?? 0;
    const fastTotal = c.credits_fast_total || 100;
    const fastCurrent = c.credits_fast ?? 0;

    document.getElementById('credits-standard').textContent = stdCurrent.toLocaleString();
    document.getElementById('credits-fast').textContent = fastCurrent.toLocaleString();
    document.getElementById('credits-rollover').textContent = (c.credits_rollover ?? 0).toLocaleString();

    document.getElementById('credits-standard-sub').textContent = `${stdCurrent.toLocaleString()} / ${stdTotal.toLocaleString()} this cycle`;
    document.getElementById('credits-fast-sub').textContent = `${fastCurrent.toLocaleString()} / ${fastTotal.toLocaleString()} this cycle`;

    // Meters
    const stdPct = stdTotal > 0 ? (stdCurrent / stdTotal * 100) : 0;
    const fastPct = fastTotal > 0 ? (fastCurrent / fastTotal * 100) : 0;
    const mStd = document.getElementById('meter-standard');
    const mFast = document.getElementById('meter-fast');
    mStd.style.width = stdPct + '%';
    mFast.style.width = fastPct + '%';
    if (stdPct < 15) mStd.classList.add('crit'); else if (stdPct < 30) mStd.classList.add('warn');
    if (fastPct < 15) mFast.classList.add('crit'); else if (fastPct < 30) mFast.classList.add('warn');

    // Billing section
    const tierName = currentUser?.tier_name || 'Free';
    document.getElementById('billing-plan-name').textContent = tierName;
    document.getElementById('billing-cycle-info').textContent =
      tierName === 'Free' ? 'No active subscription' :
        `${c.billing_cycle || 'Monthly'} · Renews ${c.period_end ? new Date(c.period_end).toLocaleDateString() : 'N/A'}`;

    // Credits table
    const tbody = document.getElementById('credits-table-body');
    tbody.innerHTML = `
      <tr><td>Standard</td><td>${stdCurrent.toLocaleString()}</td><td>${stdTotal.toLocaleString()}</td><td>${c.queue_priority_standard ?? '0'}</td></tr>
      <tr><td>Fast</td><td>${fastCurrent.toLocaleString()}</td><td>${fastTotal.toLocaleString()}</td><td>${c.queue_priority_fast ?? '—'}</td></tr>
      <tr><td>Rollover</td><td>${(c.credits_rollover ?? 0).toLocaleString()}</td><td>${(c.rollover_max_cap ?? 0).toLocaleString()}</td><td>Same as Std</td></tr>
    `;
  } catch (e) {
    console.warn('Failed to load credits:', e);
  }
}

// ─── Load Models ───
async function loadModels() {
  const grid = document.getElementById('model-grid');
  try {
    const res = await fetch(`${API}/models`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const result = await res.json();
    // API returns { object: 'list', data: [...] } or array
    const models = Array.isArray(result) ? result : (result.data || []);
    if (models.length === 0) throw new Error('empty');
    renderModelGrid(models);
  } catch {
    // Fallback: try public models.json
    try {
      const res2 = await fetch('/models.json');
      const data2 = await res2.json();
      // models.json structure: { categories: { text: [...], image: [...], video: [...], ... } }
      let models2 = [];
      const cats = data2.categories || data2;
      if (Array.isArray(cats)) { models2 = cats; }
      else {
        for (const [cat, arr] of Object.entries(cats)) {
          if (Array.isArray(arr)) {
            arr.forEach(m => models2.push({
              ...m,
              modality: m.modality || cat,
              display_name: m.name || m.display_name || m.id,
              access_tier: m.pro ? 'standard' : 'free',
            }));
          }
        }
      }
      if (models2.length > 0) renderModelGrid(models2);
      else grid.innerHTML = '<div class="empty-state"><span class="ms">psychology</span><h3>No models available</h3><p>Check back later for model updates.</p></div>';
    } catch {
      grid.innerHTML = '<div class="empty-state"><span class="ms">psychology</span><h3>Could not load models</h3><p>Please try again later.</p></div>';
    }
  }
}

function renderModelGrid(models) {
  const grid = document.getElementById('model-grid');
  grid.innerHTML = models.map(m => {
    const name = m.display_name || m.name || m.id || 'Unknown';
    // Extract maker from name (e.g. "Anthropic Claude Sonnet 4.6" → "Anthropic")
    const maker = m.model_maker || m.maker || m.provider || name.split(' ')[0] || '';
    const tier = m.access_tier || (m.pro ? 'standard' : 'free');
    const modality = m.modality || m.type || 'text';
    const initials = name.split(/[\s-]/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
    const locked = tier !== 'free' && tier !== 'demo' && (!currentUser?.tier_name || tierLevel(currentUser.tier_name) < tierLevel(tier));
    const caps = m.capabilities || [];
    const hasVision = caps.includes('vision') || m.supports_vision;
    const hasStream = caps.includes('streaming') || m.supports_streaming;
    const hasReasoning = caps.includes('reasoning') || m.supports_reasoning;
    const hasSearch = caps.includes('search') || m.supports_search;
    const hasTools = caps.includes('tools') || m.supports_function_calling;

    return `
      <div class="model-card" data-modality="${modality}" onclick="showModelDetail('${m.id || name}')">
        <div class="model-card-head">
          <div class="model-card-avatar">${initials}</div>
          <div>
            <div class="model-card-name">${escHtml(name)}</div>
            <div class="model-card-maker">${escHtml(maker)}${m.context ? ` · ${m.context} ctx` : ''}</div>
          </div>
          ${locked ? '<span class="ms sm" style="margin-left:auto;color:var(--warn)">lock</span>' : ''}
        </div>
        <div class="model-card-badges">
          <span class="badge badge-tier">${tier}</span>
          <span class="badge badge-cap">${modality}</span>
          ${hasVision ? '<span class="badge badge-new">Vision</span>' : ''}
          ${hasReasoning ? '<span class="badge badge-new">Reasoning</span>' : ''}
          ${hasSearch ? '<span class="badge badge-new">Search</span>' : ''}
          ${hasTools ? '<span class="badge badge-cap">Tools</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

function tierLevel(name) {
  const map = { demo: 0, free: 1, standard: 2, premium: 3, 'premium+': 4, max: 5, elite: 6, admin: 7 };
  return map[(name || '').toLowerCase()] ?? 0;
}

// ─── Filter Models ───
window.filterModels = function(type) {
  document.querySelectorAll('#model-filters m3e-assist-chip').forEach(c => {
    c.removeAttribute('selected');
    if (c.textContent.trim().toLowerCase() === type || (type === 'all' && c.textContent.trim() === 'All'))
      c.setAttribute('selected', '');
  });
  document.querySelectorAll('.model-card').forEach(card => {
    if (type === 'all') { card.style.display = ''; return; }
    card.style.display = card.dataset.modality === type ? '' : 'none';
  });
};

window.showModelDetail = function(id) {
  showToast(`Model detail for "${id}" coming soon`);
};

// ─── Load API Keys ───
async function loadKeys() {
  try {
    const res = await fetch(`${API}/user/keys`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const keys = data.keys || data || [];
    renderKeys(keys);
  } catch {
    // silent
  }
}

function renderKeys(keys) {
  const list = document.getElementById('keys-list');
  const maxKeys = currentUser?.max_api_keys ?? 3;
  document.getElementById('key-count-badge').textContent = `${keys.length} / ${maxKeys}`;

  if (!keys.length) {
    list.innerHTML = '<div class="empty-state"><span class="ms">vpn_key</span><h3>No API keys yet</h3><p>Create an API key to start making requests.</p></div>';
    return;
  }
  list.innerHTML = keys.map(k => `
    <div class="key-card">
      <div class="key-icon"><span class="ms fill">vpn_key</span></div>
      <div class="key-info">
        <div class="key-label">${escHtml(k.label || 'Unnamed Key')}</div>
        <div class="key-preview">${escHtml(k.key_preview || 'sk-orch-***')}</div>
      </div>
      <span class="key-status ${k.is_active !== false ? 'active' : 'disabled'}">${k.is_active !== false ? 'Active' : 'Disabled'}</span>
      <div class="key-actions">
        <m3e-icon-button title="Toggle key" onclick="toggleKey('${k.id}')"><m3e-icon name="${k.is_active !== false ? 'pause' : 'play_arrow'}"></m3e-icon></m3e-icon-button>
        <m3e-icon-button title="Delete key" onclick="deleteKey('${k.id}')"><m3e-icon name="delete"></m3e-icon></m3e-icon-button>
      </div>
    </div>`).join('');
}

// ─── Key Dialog ───
function initKeyDialog() {
  const dlg = document.getElementById('create-key-dlg');
  const btn = document.getElementById('create-key-btn');
  const prefixInput = document.getElementById('new-key-prefix');
  const preview = document.getElementById('prefix-preview');

  btn?.addEventListener('click', () => dlg?.showModal?.() || dlg?.setAttribute('open', ''));

  prefixInput?.addEventListener('input', () => {
    const val = prefixInput.value.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 16);
    prefixInput.value = val;
    preview.textContent = val || '…';
  });

  dlg?.addEventListener('close', async (e) => {
    if (e.detail?.returnValue === 'create' || dlg.returnValue === 'create') {
      await createKey();
    }
  });
}

async function createKey() {
  const label = document.getElementById('new-key-label')?.value?.trim() || 'My API Key';
  const prefix = document.getElementById('new-key-prefix')?.value?.trim() || '';
  try {
    const res = await fetch(`${API}/user/keys`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, prefix })
    });
    if (!res.ok) throw new Error('Failed to create key');
    const data = await res.json();
    if (data.key) {
      showToast(`Key created! Save it now: ${data.key}`);
    }
    loadKeys();
  } catch (e) {
    showToast('Failed to create key: ' + e.message);
  }
}

window.toggleKey = async function(id) {
  try {
    await fetch(`${API}/user/keys/${id}/toggle`, { method: 'PATCH', credentials: 'include' });
    loadKeys();
    showToast('Key status updated');
  } catch { showToast('Failed to update key'); }
};

window.deleteKey = async function(id) {
  if (!confirm('Delete this API key? This cannot be undone.')) return;
  try {
    await fetch(`${API}/user/keys/${id}`, { method: 'DELETE', credentials: 'include' });
    loadKeys();
    showToast('Key deleted');
  } catch { showToast('Failed to delete key'); }
};

// ─── Load Logs ───
async function loadLogs() {
  try {
    const res = await fetch(`${API}/user/logs`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const logs = data.logs || data || [];
    renderLogs(logs);

    // Update request count on overview
    document.getElementById('requests-count').textContent = logs.length.toLocaleString();
  } catch { /* silent */ }
}

function renderLogs(logs) {
  const tbody = document.getElementById('logs-table-body');
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--out);padding:20px">No activity yet</td></tr>';
    return;
  }
  tbody.innerHTML = logs.slice(0, 50).map(l => `
    <tr>
      <td>${new Date(l.created_at).toLocaleString()}</td>
      <td>${escHtml(l.model || '—')}</td>
      <td>${escHtml(l.endpoint || '—')}</td>
      <td><span class="key-status ${l.status === 'success' ? 'active' : 'disabled'}">${l.status}</span></td>
      <td>${l.credits_charged ?? '—'}</td>
    </tr>`).join('');
}

window.filterLogs = function(status) {
  const rows = document.querySelectorAll('#logs-table-body tr');
  rows.forEach(r => {
    if (status === 'all') { r.style.display = ''; return; }
    const s = r.querySelector('.key-status');
    r.style.display = (s && s.textContent.trim() === status) ? '' : 'none';
  });
};

// ─── Announcements ───
async function loadAnnouncements() {
  try {
    const res = await fetch(`${API}/user/announcements`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.announcements || data || [];
    const host = document.getElementById('announce-host');

    const dismissed = JSON.parse(localStorage.getItem('orchid-dismissed') || '[]');
    const banners = items.filter(a => a.is_banner && a.is_active && !dismissed.includes(a.id)).slice(0, 3);

    host.innerHTML = banners.map(a => {
      const tone = a.tone || 'info';
      const icons = { info: 'info', warning: 'warning', error: 'error', success: 'check_circle', neutral: 'campaign', changelog: 'new_releases' };
      return `
        <div class="announce-banner ${tone}">
          <span class="ms fill">${icons[tone] || 'info'}</span>
          <span>${escHtml(a.title)}</span>
          <button class="announce-dismiss" onclick="dismissAnnounce('${a.id}', this)" title="Dismiss">
            <span class="ms" style="font-size:16px;pointer-events:none">close</span>
          </button>
        </div>`;
    }).join('');
  } catch { /* silent */ }
}

window.dismissAnnounce = function(id, btn) {
  const dismissed = JSON.parse(localStorage.getItem('orchid-dismissed') || '[]');
  dismissed.push(id);
  localStorage.setItem('orchid-dismissed', JSON.stringify(dismissed));
  btn.closest('.announce-banner')?.remove();
};

// ─── Toast ───
function showToast(msg) {
  const existing = document.querySelector('.dash-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'dash-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── Utility ───
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
