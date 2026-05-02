const PROVIDERS = ['pollinations','nvidia','cerebras','mistral','navy','voidai','cloudflare','ollama','openai','anthropic','azure','groq','openrouter','google','cohere','xai','deepseek','together','fireworks','perplexity','ai21','elevenlabs','stability'];
const TIER_LEVELS = ['Free','Basic','Plus','Pro','Ultra','Ultimate'];
const ACCESS_LEVELS = ['free','basic','plus','pro','ultra','ultimate'];

module.exports = { PROVIDERS, TIER_LEVELS, ACCESS_LEVELS };

module.exports.html = `
<!-- BANNERS -->
<div id="banners" class="banners"></div>

<!-- SIDEBAR -->
<aside class="sidebar">
  <div class="sb-header">
    <div class="sb-logo"><span class="ms f" style="color:#fff;font-size:22px">hub</span></div>
    <div><div class="sb-title">OrchidLLM</div><div class="sb-sub">Admin Console</div></div>
  </div>
  <div class="view-switch">
    <button class="view-btn active" onclick="switchView('admin')" id="vbtn-admin">Admin</button>
    <button class="view-btn" onclick="switchView('user')" id="vbtn-user">User</button>
  </div>
  <nav class="sb-nav" id="admin-nav">
    <div class="nav-section">Overview</div>
    <button class="nav-item active" id="nav-overview" onclick="go('overview')"><span class="ms">dashboard</span>Overview</button>
    <div class="nav-section">Management</div>
    <button class="nav-item" id="nav-users" onclick="go('users')"><span class="ms">group</span>Users</button>
    <button class="nav-item" id="nav-tiers" onclick="go('tiers')"><span class="ms">military_tech</span>Tiers</button>
    <button class="nav-item" id="nav-catalog" onclick="go('catalog')"><span class="ms">model_training</span>Model Catalog</button>
    <button class="nav-item" id="nav-recharges" onclick="go('recharges')"><span class="ms">payments</span>Recharge Packages</button>
    <button class="nav-item" id="nav-announcements" onclick="go('announcements')"><span class="ms">campaign</span>Announcements</button>
    <div class="nav-section">Platform</div>
    <button class="nav-item" id="nav-keys" onclick="go('keys')"><span class="ms">vpn_key</span>API Keys</button>
    <button class="nav-item" id="nav-demo" onclick="go('demo')"><span class="ms">person_play</span>Demo Sessions<span class="nav-badge" id="demo-badge" style="display:none">0</span></button>
    <button class="nav-item" id="nav-usage" onclick="go('usage')"><span class="ms">analytics</span>Usage Logs</button>
    <button class="nav-item" id="nav-queue" onclick="go('queue')"><span class="ms">queue</span>Request Queue<span class="nav-badge" id="queue-badge" style="display:none">0</span></button>
  </nav>
  <nav class="sb-nav" id="user-nav" style="display:none">
    <div class="nav-section">Your Account</div>
    <button class="nav-item active" id="nav-u-overview" onclick="go('u-overview')"><span class="ms">person</span>Overview</button>
    <button class="nav-item" id="nav-u-keys" onclick="go('u-keys')"><span class="ms">vpn_key</span>My API Keys</button>
    <button class="nav-item" id="nav-u-recharge" onclick="go('u-recharge')"><span class="ms">add_card</span>Recharge Credits</button>
    <div class="nav-section">System</div>
    <button class="nav-item" id="nav-u-ann" onclick="go('u-ann')"><span class="ms">campaign</span>Announcements</button>
  </nav>
  <div class="sb-footer">
    <div id="sb-login" style="padding:8px;text-align:center;display:none">
      <a href="/api/auth/github" class="btn btn-filled" style="width:100%;justify-content:center"><span class="ms">login</span>Sign in with GitHub</a>
    </div>
    <div class="user-row" id="sb-user" style="display:none">
      <img id="sb-avatar" class="user-av" src="" alt="">
      <div class="user-info">
        <div class="user-name" id="sb-username">User</div>
        <div class="user-role" id="sb-role">Admin</div>
      </div>
      <button class="notif-btn" onclick="go('announcements')" title="Announcements"><span class="ms">notifications</span><span class="notif-dot" id="notif-dot"></span></button>
      <button class="logout-btn" onclick="doLogout()" title="Logout"><span class="ms">logout</span></button>
    </div>
  </div>
</aside>

<!-- MAIN -->
<main id="main">

<!-- OVERVIEW -->
<div class="page active" id="page-overview">
  <div class="topbar"><div class="page-title"><span class="ms">dashboard</span>Overview</div>
    <div class="topbar-right"><button class="btn btn-outlined btn-sm" onclick="loadDashboard()"><span class="ms">refresh</span>Refresh</button></div>
  </div>
  <div class="stat-grid" id="stat-grid">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(103,80,164,.2)"><span class="ms f" style="color:var(--md-primary)">group</span></div><div class="stat-val" id="s-users">—</div><div class="stat-lbl">Total Users</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(76,175,80,.2)"><span class="ms f" style="color:#81C784">vpn_key</span></div><div class="stat-val" id="s-keys">—</div><div class="stat-lbl">Active Keys</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(33,150,243,.2)"><span class="ms f" style="color:#64B5F6">today</span></div><div class="stat-val" id="s-today">—</div><div class="stat-lbl">Requests Today</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(255,152,0,.2)"><span class="ms f" style="color:#FFB74D">token</span></div><div class="stat-val" id="s-tokens">—</div><div class="stat-lbl">Total Tokens</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(244,67,54,.2)"><span class="ms f" style="color:#E57373">pending</span></div><div class="stat-val" id="s-queued">—</div><div class="stat-lbl">Queue Pending</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(103,80,164,.2)"><span class="ms f" style="color:var(--md-primary)">person_play</span></div><div class="stat-val" id="s-demo">—</div><div class="stat-lbl">Demo Sessions</div></div>
  </div>
  <div class="section" style="margin-top:12px">
    <div class="card"><div class="card-header"><div class="card-title"><span class="ms">bar_chart</span>Requests — Last 14 Days</div></div>
      <div style="padding:16px 20px"><div class="chart-bars" id="chart-bars"><div class="spin"></div></div></div>
    </div>
  </div>
</div>

<!-- USERS -->
<div class="page" id="page-users">
  <div class="topbar"><div class="page-title"><span class="ms">group</span>Users</div>
    <div class="topbar-right"><button class="btn btn-outlined btn-sm" onclick="loadUsers()"><span class="ms">refresh</span>Refresh</button></div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Registered Users</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>User</th><th>Tier</th><th>Credits</th><th>Rollover</th><th>Admin</th><th>Joined</th><th>Actions</th>
    </tr></thead><tbody id="users-tbody"><tr><td colspan="7"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- TIERS -->
<div class="page" id="page-tiers">
  <div class="topbar"><div class="page-title"><span class="ms">military_tech</span>Tiers</div>
    <div class="topbar-right"><button class="btn btn-outlined btn-sm" onclick="loadTiers()"><span class="ms">refresh</span>Refresh</button></div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Subscription Tiers</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Level</th><th>Name</th><th>Price (IDR)</th><th>Monthly Credits</th><th>Rollover Cap</th><th>Queue (F/S/E)</th><th>Concurrent (R/B)</th><th>Access Level</th>
    </tr></thead><tbody id="tiers-tbody"><tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- MODEL CATALOG (merged) -->
<div class="page" id="page-catalog">
  <div class="topbar"><div class="page-title"><span class="ms">model_training</span>Model Catalog</div>
    <div class="topbar-right">
      <div class="chips" id="cat-filters">
        <button class="chip active" data-cat="" onclick="filterCatalog(this,'')">All</button>
        <button class="chip" data-cat="text" onclick="filterCatalog(this,'text')">Text</button>
        <button class="chip" data-cat="image" onclick="filterCatalog(this,'image')">Image</button>
        <button class="chip" data-cat="video" onclick="filterCatalog(this,'video')">Video</button>
        <button class="chip" data-cat="audio" onclick="filterCatalog(this,'audio')">Audio</button>
      </div>
      <button class="btn btn-filled btn-sm" onclick="openCatalogModal()"><span class="ms">add</span>Add Model</button>
    </div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Models &amp; Provider Mappings</div></div>
    <div class="tbl-wrap"><table class="tbl" id="catalog-table"><thead><tr>
      <th>Model ID</th><th>Category</th><th>Access</th><th>Context</th><th>In×</th><th>Out×</th><th>Providers</th><th>Active</th><th>Actions</th>
    </tr></thead><tbody id="catalog-tbody"><tr><td colspan="9"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- RECHARGE PACKAGES -->
<div class="page" id="page-recharges">
  <div class="topbar"><div class="page-title"><span class="ms">payments</span>Recharge Packages</div>
    <div class="topbar-right"><button class="btn btn-filled btn-sm" onclick="openRechargeModal()"><span class="ms">add</span>New Package</button></div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>All Packages</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Name</th><th>Credits</th><th>Price</th><th>Discount</th><th>Target Tier</th><th>Expires</th><th>Active</th><th>Actions</th>
    </tr></thead><tbody id="recharges-tbody"><tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- ANNOUNCEMENTS -->
<div class="page" id="page-announcements">
  <div class="topbar"><div class="page-title"><span class="ms">campaign</span>Announcements</div>
    <div class="topbar-right"><button class="btn btn-filled btn-sm" onclick="openAnnModal()"><span class="ms">add</span>New</button></div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>All Announcements</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Title</th><th>Type</th><th>Banner</th><th>Urgent</th><th>Expires</th><th>Active</th><th>Actions</th>
    </tr></thead><tbody id="ann-tbody"><tr><td colspan="7"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- API KEYS -->
<div class="page" id="page-keys">
  <div class="topbar"><div class="page-title"><span class="ms">vpn_key</span>API Keys</div>
    <div class="topbar-right">
      <div class="chips"><button class="chip active" id="kf-all" onclick="filterKeys('all')">All</button><button class="chip" id="kf-demo" onclick="filterKeys('demo')">Demo</button><button class="chip" id="kf-global" onclick="filterKeys('global')">Global</button></div>
      <button class="btn btn-filled btn-sm" onclick="openKeyModal()"><span class="ms">add</span>New Key</button>
    </div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>All Keys</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Key</th><th>Name</th><th>Type</th><th>Status</th><th>RPM/RPD</th><th>Usage</th><th>Last Used</th><th>Actions</th>
    </tr></thead><tbody id="keys-tbody"><tr><td colspan="8"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- DEMO SESSIONS -->
<div class="page" id="page-demo">
  <div class="topbar"><div class="page-title"><span class="ms">person_play</span>Demo Sessions</div>
    <div class="topbar-right"><button class="btn btn-danger btn-sm" onclick="purgeDemoKeys()"><span class="ms">delete_sweep</span>Purge 30d Inactive</button></div>
  </div>
  <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(76,175,80,.2)"><span class="ms f" style="color:#81C784">check_circle</span></div><div class="stat-val" id="ds-active">—</div><div class="stat-lbl">Active</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(244,67,54,.2)"><span class="ms f" style="color:#E57373">block</span></div><div class="stat-val" id="ds-blocked">—</div><div class="stat-lbl">Blocked</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(255,152,0,.2)"><span class="ms f" style="color:#FFB74D">delete_forever</span></div><div class="stat-val" id="ds-purge">—</div><div class="stat-lbl">Eligible Purge</div></div>
  </div>
  <div class="section" style="margin-top:12px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Sessions</div><div class="card-actions"><div class="chips"><button class="chip active" id="df-all" onclick="filterDemo('all')">All</button><button class="chip" id="df-active" onclick="filterDemo('active')">Active</button><button class="chip" id="df-blocked" onclick="filterDemo('blocked')">Blocked</button></div></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>IP</th><th>Requests</th><th>First Seen</th><th>Last Active</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody id="demo-tbody"><tr><td colspan="6"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- USAGE LOGS -->
<div class="page" id="page-usage">
  <div class="topbar"><div class="page-title"><span class="ms">analytics</span>Usage Logs</div>
    <div class="topbar-right"><button class="btn btn-outlined btn-sm" onclick="loadUsage()"><span class="ms">refresh</span>Refresh</button></div>
  </div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">history</span>Recent Usage</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Identifier</th><th>Model</th><th>In Tokens</th><th>Out Tokens</th><th>IP</th><th>Time</th>
    </tr></thead><tbody id="usage-tbody"><tr><td colspan="6"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- REQUEST QUEUE -->
<div class="page" id="page-queue">
  <div class="topbar"><div class="page-title"><span class="ms">queue</span>Request Queue</div>
    <div class="topbar-right"><div class="chips"><button class="chip active" id="qf-all" onclick="filterQueue('all')">All</button><button class="chip" id="qf-queued" onclick="filterQueue('queued')">Queued</button><button class="chip" id="qf-failed" onclick="filterQueue('failed')">Failed</button></div></div>
  </div>
  <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(255,152,0,.2)"><span class="ms f" style="color:#FFB74D">pending</span></div><div class="stat-val" id="q-queued">—</div><div class="stat-lbl">Queued</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(33,150,243,.2)"><span class="ms f" style="color:#64B5F6">sync</span></div><div class="stat-val" id="q-proc">—</div><div class="stat-lbl">Processing</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(244,67,54,.2)"><span class="ms f" style="color:#E57373">error</span></div><div class="stat-val" id="q-fail">—</div><div class="stat-lbl">Failed</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(76,175,80,.2)"><span class="ms f" style="color:#81C784">done_all</span></div><div class="stat-val" id="q-done">—</div><div class="stat-lbl">Done Today</div></div>
  </div>
  <div class="section" style="margin-top:12px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Queue Items</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>ID</th><th>Model</th><th>Priority</th><th>Status</th><th>Created</th><th>Finished</th>
    </tr></thead><tbody id="queue-tbody"><tr><td colspan="6"><div class="state-empty"><div class="spin"></div></div></td></tr></tbody></table></div>
  </div></div>
</div>

<!-- USER VIEW PAGES -->
<div class="page" id="page-u-overview">
  <div class="topbar"><div class="page-title"><span class="ms">person</span>My Account</div></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(103,80,164,.2)"><span class="ms f" style="color:var(--md-primary)">military_tech</span></div><div class="stat-val" id="u-tier">—</div><div class="stat-lbl">Current Tier</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(76,175,80,.2)"><span class="ms f" style="color:#81C784">wallet</span></div><div class="stat-val" id="u-credits">—</div><div class="stat-lbl">Credits</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(33,150,243,.2)"><span class="ms f" style="color:#64B5F6">savings</span></div><div class="stat-val" id="u-rollover">—</div><div class="stat-lbl">Rollover</div></div>
  </div>
  <div class="section" style="margin-top:16px"><div class="card"><div class="card-header"><div class="card-title"><span class="ms">campaign</span>Announcements</div></div><div id="u-ann-list" style="padding:16px 20px;line-height:1.8"></div></div></div>
</div>
<div class="page" id="page-u-keys">
  <div class="topbar"><div class="page-title"><span class="ms">vpn_key</span>My API Keys</div><div class="topbar-right"><button class="btn btn-filled btn-sm" onclick="createUserKey()"><span class="ms">add</span>Create Key</button></div></div>
  <div class="section" style="margin-top:20px"><div class="card">
    <div class="card-header"><div class="card-title"><span class="ms">list_alt</span>Keys</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Key (click to reveal)</th><th>Usage</th><th>Actions</th></tr></thead><tbody id="u-keys-tbody"></tbody></table></div>
  </div></div>
</div>
<div class="page" id="page-u-recharge">
  <div class="topbar"><div class="page-title"><span class="ms">add_card</span>Recharge Credits</div></div>
  <div class="section" style="margin-top:20px"><div id="recharge-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px"></div></div>
</div>
<div class="page" id="page-u-ann">
  <div class="topbar"><div class="page-title"><span class="ms">campaign</span>All Announcements</div></div>
  <div class="section" style="margin-top:20px"><div id="u-ann-page" style="display:flex;flex-direction:column;gap:12px"></div></div>
</div>

</main>

<!-- TOAST -->
<div class="toast" id="toast"><span class="ms" id="toast-icon">check_circle</span><span id="toast-msg"></span></div>
`;
