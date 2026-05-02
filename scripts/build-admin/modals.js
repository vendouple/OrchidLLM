const { PROVIDERS, TIER_LEVELS, ACCESS_LEVELS } = require('./html.js');
const provOpts = PROVIDERS.map(p=>`<option value="${p}">${p}</option>`).join('');
const tierOpts = TIER_LEVELS.map((t,i)=>`<option value="${i}">${t}</option>`).join('');
const accessOpts = ACCESS_LEVELS.map(a=>`<option value="${a}">${a.charAt(0).toUpperCase()+a.slice(1)}</option>`).join('');

module.exports = `
<!-- KEY MODAL -->
<div class="overlay" id="key-modal"><div class="modal">
  <div class="modal-header"><div class="modal-title" id="km-title">New API Key</div><button class="modal-close" onclick="closeModal('key-modal')"><span class="ms">close</span></button></div>
  <form class="form-stack" id="key-form" onsubmit="submitKey(event)">
    <input type="hidden" id="km-id">
    <div class="form-group"><label>Name</label><input type="text" id="km-name" placeholder="e.g. Production Key" required></div>
    <div class="form-row">
      <div class="form-group"><label>RPM</label><input type="number" id="km-rpm" value="5" min="1"></div>
      <div class="form-group"><label>RPD</label><input type="number" id="km-rpd" value="20" min="1"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Input Token Limit (-1=∞)</label><input type="number" id="km-itl" value="10000" min="-1"></div>
      <div class="form-group"><label>Queue Priority</label><input type="number" id="km-qp" value="0" min="0" max="10"></div>
    </div>
    <div class="form-group"><label>Expires in Days (blank=never)</label><input type="number" id="km-exp" placeholder="Never" min="1"></div>
    <div class="form-actions"><button type="button" class="btn btn-outlined" onclick="closeModal('key-modal')">Cancel</button><button type="submit" class="btn btn-filled">Save Key</button></div>
  </form>
</div></div>

<!-- CATALOG MODAL (Add/Edit model + mappings) -->
<div class="overlay" id="catalog-modal"><div class="modal xl">
  <div class="modal-header"><div class="modal-title" id="cm-title">Add Model</div><button class="modal-close" onclick="closeModal('catalog-modal')"><span class="ms">close</span></button></div>
  <form class="form-stack" id="catalog-form" onsubmit="submitCatalog(event)">
    <input type="hidden" id="cm-id">
    <div class="form-row">
      <div class="form-group"><label>Category</label>
        <select id="cm-cat" required><option value="">Category...</option><option value="text">text</option><option value="image">image</option><option value="video">video</option><option value="audio">audio</option><option value="transcription">transcription</option></select>
      </div>
      <div class="form-group"><label>Frontend Model ID</label><input type="text" id="cm-mid" placeholder="e.g. claude-opus-4.5" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Display Name</label><input type="text" id="cm-dname" placeholder="e.g. Claude Opus 4.5" required></div>
      <div class="form-group"><label>Access Level (Tier)</label>
        <select id="cm-access">${accessOpts}</select>
      </div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="cm-desc" rows="2" style="resize:none"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Context Window</label><input type="text" id="cm-ctx" placeholder="e.g. 200K"></div>
      <div class="form-group"><label>Timeout (ms)</label><input type="number" id="cm-timeout" value="60000" min="1000"></div>
    </div>
    <div style="background:rgba(255,255,255,.04);border-radius:var(--md-radius-lg);padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
      <div class="form-group"><label>In Multiplier</label><input type="number" id="cm-in" value="1.0" step="0.1" min="0.1"></div>
      <div class="form-group"><label>Out Multiplier</label><input type="number" id="cm-out" value="1.0" step="0.1" min="0.1"></div>
      <div class="form-group"><label>Cache Read ×</label><input type="number" id="cm-cr" value="0.1" step="0.05" min="0"></div>
      <div class="form-group"><label>Cache Write ×</label><input type="number" id="cm-cw" value="1.25" step="0.05" min="0"></div>
      <div class="form-group"><label>Heavy Threshold (tokens)</label><input type="number" id="cm-heavy-thresh" placeholder="e.g. 32000" min="0"></div>
      <div class="form-group"><label>Heavy Multiplier</label><input type="number" id="cm-heavy-mult" value="1.5" step="0.1" min="1"></div>
      <div class="form-group"><label>Massive Threshold</label><input type="number" id="cm-massive-thresh" placeholder="e.g. 100000" min="0"></div>
      <div class="form-group"><label>Massive Multiplier</label><input type="number" id="cm-massive-mult" value="2.0" step="0.1" min="1"></div>
    </div>
    <div class="form-row">
      <div class="toggle-row"><button type="button" class="toggle" id="cm-caching" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Supports Caching</span></div>
      <div class="toggle-row"><button type="button" class="toggle" id="cm-batch" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Supports Batch</span></div>
      <div class="toggle-row"><button type="button" class="toggle" id="cm-active" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Active</span></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Deprecation Date</label><input type="datetime-local" id="cm-dep-date"></div>
      <div class="form-group"><label>Deprecation Note</label><input type="text" id="cm-dep-note" placeholder="Optional note"></div>
    </div>
    <div class="form-group"><label>Allowed Pass-through Params (comma-separated)</label><input type="text" id="cm-params" placeholder="e.g. reasoning_effort,temperature"></div>

    <!-- Provider mappings sub-section -->
    <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:700;font-size:14px">Provider Mappings</div>
        <button type="button" class="btn btn-tonal btn-sm" onclick="addMappingRow()"><span class="ms">add</span>Add Provider</button>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Provider</th><th>Backend Model ID</th><th>Context</th><th>Priority</th><th>In×</th><th>Out×</th><th>Allowed Params</th><th>Batch</th><th>Active</th><th></th></tr></thead>
        <tbody id="mappings-tbody"></tbody>
      </table>
    </div>
    <div class="form-actions"><button type="button" class="btn btn-outlined" onclick="closeModal('catalog-modal')">Cancel</button><button type="submit" class="btn btn-filled">Save Model</button></div>
  </form>
</div></div>

<!-- RECHARGE MODAL -->
<div class="overlay" id="recharge-modal"><div class="modal">
  <div class="modal-header"><div class="modal-title" id="rm-title">New Recharge Package</div><button class="modal-close" onclick="closeModal('recharge-modal')"><span class="ms">close</span></button></div>
  <form class="form-stack" id="recharge-form" onsubmit="submitRecharge(event)">
    <input type="hidden" id="rm-id">
    <div class="form-group"><label>Package Name</label><input type="text" id="rm-name" placeholder="e.g. Starter Pack" required></div>
    <div class="form-group"><label>Description</label><textarea id="rm-desc" rows="2" style="resize:none" placeholder="Optional"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Credits</label><input type="number" id="rm-credits" placeholder="e.g. 100000" required min="1"></div>
      <div class="form-group"><label>Price (IDR)</label><input type="number" id="rm-price" placeholder="e.g. 9000" required min="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Discount %</label><input type="number" id="rm-discount" value="0" min="0" max="99"></div>
      <div class="form-group"><label>Target Tier (min)</label><select id="rm-tier">${tierOpts}</select></div>
    </div>
    <div class="form-group"><label>Package Expires At (optional)</label><input type="datetime-local" id="rm-expires"></div>
    <div class="toggle-row"><button type="button" class="toggle on" id="rm-active" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Active</span></div>
    <div class="form-actions"><button type="button" class="btn btn-outlined" onclick="closeModal('recharge-modal')">Cancel</button><button type="submit" class="btn btn-filled">Save Package</button></div>
  </form>
</div></div>

<!-- ANNOUNCEMENT MODAL -->
<div class="overlay" id="ann-modal"><div class="modal lg">
  <div class="modal-header"><div class="modal-title" id="am-title">New Announcement</div><button class="modal-close" onclick="closeModal('ann-modal')"><span class="ms">close</span></button></div>
  <form class="form-stack" id="ann-form" onsubmit="submitAnn(event)">
    <input type="hidden" id="am-id">
    <div class="form-group"><label>Title</label><input type="text" id="am-title-f" placeholder="e.g. Scheduled Maintenance" required></div>
    <div class="form-group"><label>Content (Markdown supported)</label><textarea id="am-content" rows="6" style="resize:vertical;font-family:monospace;font-size:12px" placeholder="## Heading&#10;&#10;Body text here..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="am-type"><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error / Outage</option><option value="success">Success</option></select>
      </div>
      <div class="form-group"><label>Expires At (optional)</label><input type="datetime-local" id="am-expires"></div>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      <div class="toggle-row"><button type="button" class="toggle on" id="am-active" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Active</span></div>
      <div class="toggle-row"><button type="button" class="toggle" id="am-banner" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Show Banner</span></div>
      <div class="toggle-row"><button type="button" class="toggle" id="am-urgent" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Urgent (Red)</span></div>
    </div>
    <div class="form-actions"><button type="button" class="btn btn-outlined" onclick="closeModal('ann-modal')">Cancel</button><button type="submit" class="btn btn-filled">Save</button></div>
  </form>
</div></div>

<!-- USER EDIT MODAL -->
<div class="overlay" id="user-modal"><div class="modal">
  <div class="modal-header"><div class="modal-title">Edit User</div><button class="modal-close" onclick="closeModal('user-modal')"><span class="ms">close</span></button></div>
  <form class="form-stack" id="user-form" onsubmit="submitUser(event)">
    <input type="hidden" id="um-id">
    <div class="form-group"><label>GitHub Username (readonly)</label><input type="text" id="um-username" readonly></div>
    <div class="form-group"><label>Tier</label><select id="um-tier">${tierOpts}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Credits Balance</label><input type="number" id="um-credits" min="0"></div>
      <div class="form-group"><label>Rollover Credits</label><input type="number" id="um-rollover" min="0"></div>
    </div>
    <div class="toggle-row"><button type="button" class="toggle" id="um-admin" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Admin</span></div>
    <div class="toggle-row" style="margin-top:8px"><button type="button" class="toggle" id="um-banned" onclick="this.classList.toggle('on')"></button><span class="toggle-label">Banned</span></div>
    <div class="form-actions"><button type="button" class="btn btn-outlined" onclick="closeModal('user-modal')">Cancel</button><button type="submit" class="btn btn-filled">Save</button></div>
  </form>
</div></div>
`;
