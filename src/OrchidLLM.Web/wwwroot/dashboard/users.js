/**
 * OrchidLLM Dashboard — Interactive Demo Logic
 * Handles navigation, mock data, purchase flows, animations,
 * credit meters, model details, API key management, and announcements.
 */
(function () {
  'use strict';

  // Fallback Custom Elements for Segmented Buttons
  if (!customElements.get('m3e-button-segment')) {
    class M3eButtonSegment extends HTMLElement {
      static get observedAttributes() { return ['checked', 'disabled']; }
      constructor() {
        super();
      }
      get checked() {
        return this.hasAttribute('checked');
      }
      set checked(val) {
        if (val) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
      }
      get disabled() {
        return this.hasAttribute('disabled');
      }
      set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
      }
      get value() {
        return this.getAttribute('value');
      }
      set value(val) {
        if (val) this.setAttribute('value', val);
        else this.removeAttribute('value');
      }
    }
    customElements.define('m3e-button-segment', M3eButtonSegment);
  }

  if (!customElements.get('m3e-segmented-button')) {
    class M3eSegmentedButton extends HTMLElement {
      constructor() {
        super();
      }
      connectedCallback() {
        this.addEventListener('click', (e) => {
          const segment = e.target.closest('m3e-button-segment');
          if (!segment || segment.hasAttribute('disabled') || segment.disabled) return;
          
          const isMulti = this.hasAttribute('multi');
          if (!isMulti) {
            this.querySelectorAll('m3e-button-segment').forEach(seg => {
              if (seg !== segment) {
                seg.removeAttribute('checked');
                seg.checked = false;
              }
            });
            segment.setAttribute('checked', '');
            segment.checked = true;
          } else {
            if (segment.hasAttribute('checked')) {
              segment.removeAttribute('checked');
              segment.checked = false;
            } else {
              segment.setAttribute('checked', '');
              segment.checked = true;
            }
          }
          
          this.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }
    customElements.define('m3e-segmented-button', M3eSegmentedButton);
  }

  // Helper to synchronize properties to attributes for M3E Web Components
  function syncAllM3EAttributes() {
    document.querySelectorAll('m3e-filter-chip').forEach(c => {
      const isSelected = (typeof c.selected === 'boolean') ? c.selected : c.hasAttribute('selected');
      if (isSelected) {
        c.setAttribute('selected', '');
      } else {
        c.removeAttribute('selected');
      }
    });
    document.querySelectorAll('m3e-segmented-button').forEach(btn => {
      const segments = btn.querySelectorAll('m3e-button-segment');
      let checkedSeg = Array.from(segments).find(seg => (typeof seg.checked === 'boolean') ? seg.checked : seg.hasAttribute('checked'));
      if (checkedSeg) {
        segments.forEach(seg => {
          if (seg === checkedSeg) {
            seg.setAttribute('checked', '');
            seg.checked = true;
            seg.classList.add('checked');
          } else {
            seg.removeAttribute('checked');
            seg.checked = false;
            seg.classList.remove('checked');
          }
        });
      }
    });
  }

  // Global change listener on capture phase to synchronize M3E properties to attributes
  document.addEventListener('change', (e) => {
    // 1. Sync filter chips
    const filterChip = e.target.closest('m3e-filter-chip');
    if (filterChip) {
      const parent = filterChip.closest('m3e-filter-chip-set');
      const targets = parent ? parent.querySelectorAll('m3e-filter-chip') : document.querySelectorAll('m3e-filter-chip');
      targets.forEach(c => {
        if (c.selected) {
          c.setAttribute('selected', '');
        } else {
          c.removeAttribute('selected');
        }
      });
    }

    // 2. Sync segmented buttons
    const segBtn = e.target.closest('m3e-segmented-button');
    if (segBtn) {
      const segments = segBtn.querySelectorAll('m3e-button-segment');
      let checkedSeg = Array.from(segments).find(seg => seg.checked);
      if (!checkedSeg && e.target.closest('m3e-button-segment')) {
        checkedSeg = e.target.closest('m3e-button-segment');
      }
      if (checkedSeg) {
        segments.forEach(seg => {
          if (seg === checkedSeg) {
            seg.setAttribute('checked', '');
            seg.checked = true;
            seg.classList.add('checked');
          } else {
            seg.removeAttribute('checked');
            seg.checked = false;
            seg.classList.remove('checked');
          }
        });
      }
    }
  }, true);

  // Run synchronization when elements are upgraded by the browser (CDN load completion)
  if (window.customElements) {
    customElements.whenDefined('m3e-filter-chip').then(syncAllM3EAttributes);
    customElements.whenDefined('m3e-segmented-button').then(syncAllM3EAttributes);
  }

  // ============================================================
  // SESSION CHECK — redirect to login if not authenticated
  // ============================================================
  const session = JSON.parse(localStorage.getItem('orchid_session') || 'null');
  if (!session) {
    window.location.href = '/Account/Login';
    return;
  }

  // ============================================================
  // MOCK DATA
  // ============================================================
  const TIER = session.tier || 'free';
  const TIER_COLORS = {
    free: '#938F99', basic: '#80CBC4', plus: '#B388FF',
    pro: '#FFD54F', elite: '#D946EF'
  };
  const TIER_GRADIENT_ENDS = {
    free: '#706E75', basic: '#00BFA5', plus: '#7C4DFF',
    pro: '#FF8F00', elite: '#F43F5E'
  };
  const TIER_ICONS = {
    free: 'person', basic: 'star', plus: 'diamond',
    pro: 'workspace_premium', elite: 'auto_awesome'
  };

  const USER = {
    username: session.username || 'vendouple',
    display_name: session.display_name || 'johndoe',
    email: 'johndoe@orchidllm.com',
    avatar_initial: (session.display_name || 'j')[0].toUpperCase(),
    account_id: session.user_id || 'usr_a8f3e21b',
    joined: 'May 2026',
    tier: TIER,
    tierLabel: TIER.charAt(0).toUpperCase() + TIER.slice(1),
    specialty: session.specialty || 'developer',
  };

  let currentCurrency = 'idr';
  let currentBoosterCategory = 'all';

  function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Hello';
  }

  function getRandomGreeting() {
    const greetings = ['Hello', 'Hi', 'Welcome', 'Welcome back', 'Hey there', 'Greetings', 'Nice to see you', 'Great to have you back'];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  function getDailyLoginCount() {
    const today = new Date().toDateString();
    let data = JSON.parse(localStorage.getItem('orchid_daily_logins') || 'null');
    if (!data || data.date !== today) {
      data = { date: today, count: 0 };
    }
    data.count++;
    localStorage.setItem('orchid_daily_logins', JSON.stringify(data));
    return data.count;
  }

  function getGreetingForVisit(count) {
    if (count === 1) return getTimeGreeting();
    if (count <= 30) return getRandomGreeting();
    return getRandomGreeting();
  }

  function getLoginMessage(count) {
    if (count === 1) return '';
    if (count === 2) return 'Back so soon?';
    if (count === 3) return 'Third time\'s the charm!';
    if (count === 4) return 'You\'re on a roll today.';
    if (count === 5) return 'Five visits today — impressive dedication!';
    if (count === 6) return 'Six visits and counting!';
    if (count === 7) return 'Lucky number seven!';
    if (count === 8) return 'Eight times today — you\'re crushing it!';
    if (count === 9) return 'Nine visits — almost double digits!';
    if (count === 10) return 'Double digits! Ten visits today.';
    if (count === 11) return 'Eleven visits — you\'re in the zone!';
    if (count === 12) return 'A dozen visits today!';
    if (count === 13) return 'Thirteen visits — lucky you!';
    if (count === 14) return 'Fourteen and still going strong!';
    if (count === 15) return 'Fifteen visits — halfway to thirty!';
    if (count === 16) return 'Sixteen visits today!';
    if (count === 17) return 'Seventeen visits — incredible focus!';
    if (count === 18) return 'Eighteen visits and counting!';
    if (count === 19) return 'Nineteen visits — almost at twenty!';
    if (count === 20) return 'Twenty visits today — amazing!';
    if (count === 21) return 'Twenty-one visits — blackjack!';
    if (count === 22) return 'Twenty-two visits today!';
    if (count === 23) return 'Twenty-three visits — Jordan number!';
    if (count === 24) return 'Twenty-four visits — non-stop!';
    if (count === 25) return 'Twenty-five visits — quarter century!';
    if (count === 26) return 'Twenty-six visits today!';
    if (count === 27) return 'Twenty-seven visits — unstoppable!';
    if (count === 28) return 'Twenty-eight visits and counting!';
    if (count === 29) return 'Twenty-nine — one more to go!';
    if (count === 30) return 'Thirty visits today — legendary!';
    return `Visit #${count} today — you\'re unstoppable!`;
  }

  function getSpecialtyMessage(specialty) {
    const messages = {
      developer: 'Your APIs and endpoints are ready to go.',
      researcher: 'New papers and datasets are waiting for you.',
      designer: 'Fresh inspiration awaits in your workspace.',
      writer: 'Your drafts are saved and ready to refine.',
      analyst: 'Your dashboards have been updated with new data.',
      student: 'Keep up the great learning momentum!',
      entrepreneur: 'Your projects are running smoothly.',
    };
    return messages[specialty] || 'Here\'s your OrchidLLM overview for today.';
  }

  const CREDITS = {
    standard: { current: 12450, max: 25000 },
    fast: { current: 3200, max: 5000 },
    rollover: { current: 1800, max: 5000 },
    booster: { current: 8500, max: 10000 },
  };

  // ============================================================
  // MODEL GROUPS — named access tiers (admin-authored, bridged).
  // Groups replace the old fixed free/standard/premium/premium+ labels.
  // `rank` shares the TIER_RANK scale so hasTierAccess()/hasGroupAccess() agree.
  // ============================================================
  const MODEL_GROUPS_SEED = [
    { id: 'free',        name: 'Free',     rank: 1, order: 0 },
    { id: 'standard',    name: 'Standard', rank: 2, order: 1 },
    { id: 'premium',     name: 'Premium',  rank: 3, order: 2 },
    { id: 'premiumPlus', name: 'Premium+', rank: 4, order: 3 },
  ];
  const MODEL_GROUPS = (window.OrchidShared
    ? OrchidShared.get(OrchidShared.KEYS.groups, MODEL_GROUPS_SEED)
    : MODEL_GROUPS_SEED);

  // Model Maker — vendor marks authored in the admin panel (Model Maker tab).
  // Ids match each model's `makerSlug` so assignment is a straight lookup.
  // Original abstract SVG marks, not trademark reproductions.
  const VENDORS_SEED = [
    { id: 'anthropic', name: 'Anthropic', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 L21 20H15.5L12 13L8.5 20H3Z" fill="#cc785c"/></svg>' },
    { id: 'openai', name: 'OpenAI', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#10a37f" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="19" cy="9" r="3"/><circle cx="19" cy="16" r="3"/><circle cx="12" cy="20" r="3"/><circle cx="5" cy="16" r="3"/><circle cx="5" cy="9" r="3"/></g></svg>' },
    { id: 'google', name: 'Google', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 12V2A10 10 0 0 1 22 12Z" fill="#4285F4"/><path d="M12 12H22A10 10 0 0 1 12 22Z" fill="#34A853"/><path d="M12 12V22A10 10 0 0 1 2 12Z" fill="#FBBC05"/><path d="M12 12H2A10 10 0 0 1 12 2Z" fill="#EA4335"/></svg>' },
    { id: 'meta', name: 'Meta', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 8c-2.8 0-5 2.5-5 5.5S4.2 19 7 19c2 0 3.3-1.4 4.4-3.1.4-.6.8-1.3 1.1-1.9-.3-.6-.7-1.3-1.1-1.9C10.3 10.4 9 9 7 9m10 0c2.8 0 5 2.5 5 5.5S19.8 20 17 20c-2 0-3.3-1.4-4.4-3.1-.4-.6-.8-1.3-1.1-1.9.3-.6.7-1.3 1.1-1.9C13.7 11.4 15 10 17 10" stroke="#0866FF" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
    { id: 'deepseek', name: 'DeepSeek', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 15c2-4 5-6 9-6s7 2 9 6c-3-1-5-3-9-3s-6 2-9 3z" fill="#4d6bfe"/><circle cx="17" cy="9" r="1.4" fill="#4d6bfe"/></svg>' },
    { id: 'mistral', name: 'Mistral', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="#ff7000"><rect x="3" y="10" width="4" height="4"/><rect x="8" y="6" width="4" height="4"/><rect x="8" y="14" width="4" height="4"/><rect x="13" y="10" width="4" height="4"/><rect x="18" y="6" width="3" height="12"/></g></svg>' },
  ];
  const VENDORS = (window.OrchidShared
    ? OrchidShared.get(OrchidShared.KEYS.vendors, VENDORS_SEED)
    : VENDORS_SEED);
  function vendorById(id) { return VENDORS.find(v => v.id === id) || null; }
  // Model card/detail logo: prefer the assigned vendor's SVG mark, else emoji.
  function makerLogoHtml(model) {
    const v = vendorById(model.makerSlug);
    return (v && v.svg) ? v.svg : (model.icon || '🤖');
  }

  // Seed model catalogue. Admin edits are bridged via OrchidShared → MODELS.
  // Each model may carry its own `contextTiers[]` (per-model pricing/access
  // bands); models without them get bands synthesized by fillContextTiers().
  // Lifecycle: `launchAt` (ISO, upcoming until then) / `deprecateAt` (ISO,
  // auto soft-deletes past it). Both nullable.
  const MODELS_SEED = [
    { id: 'claude-opus-4-5',  name: 'Claude Opus 4.5',   maker: 'Anthropic', makerSlug: 'anthropic', icon: '🟣', tier: 'premium',  group: 'premium',     desc: 'Anthropic’s flagship for deep reasoning, long-context analysis and vision.', context: '200k', mIn: 1.00, mOut: 1.50, caps: ['streaming', 'vision', 'reasoning', 'caching', 'tools'], endpoints: 3, launchAt: null, deprecateAt: null },
    { id: 'claude-sonnet-4-5',name: 'Claude Sonnet 4.5', maker: 'Anthropic', makerSlug: 'anthropic', icon: '🟣', tier: 'standard', group: 'standard',    desc: 'Balanced speed and intelligence — the everyday workhorse model.', context: '200k', mIn: 0.80, mOut: 1.10, caps: ['streaming', 'vision', 'reasoning', 'tools'], endpoints: 4, launchAt: null, deprecateAt: null },
    { id: 'claude-haiku-4',   name: 'Claude Haiku 4',    maker: 'Anthropic', makerSlug: 'anthropic', icon: '🟣', tier: 'free',     group: 'free',        desc: 'Fast, low-cost model for high-volume and latency-sensitive tasks.', context: '200k', mIn: 0.40, mOut: 0.55, caps: ['streaming', 'vision'], endpoints: 5, launchAt: null, deprecateAt: null },
    { id: 'gpt-4o',           name: 'GPT-4o',            maker: 'OpenAI',    makerSlug: 'openai',    icon: '🟢', tier: 'standard', group: 'standard',    desc: 'Multimodal OpenAI model with strong tool-calling and web search.', context: '128k', mIn: 0.75, mOut: 1.00, caps: ['streaming', 'vision', 'tools', 'search'], endpoints: 3, launchAt: null, deprecateAt: null },
    { id: 'gpt-4o-mini',      name: 'GPT-4o Mini',       maker: 'OpenAI',    makerSlug: 'openai',    icon: '🟢', tier: 'free',     group: 'free',        desc: 'Compact, affordable GPT-4o variant for everyday tasks.', context: '128k', mIn: 0.25, mOut: 0.35, caps: ['streaming', 'vision', 'tools'], endpoints: 4, launchAt: null, deprecateAt: null },
    { id: 'gpt-4-5',          name: 'GPT-4.5',           maker: 'OpenAI',    makerSlug: 'openai',    icon: '🟢', tier: 'elite',    group: 'premiumPlus', desc: 'Legacy frontier model — scheduled for deprecation.', context: '128k', mIn: 1.20, mOut: 1.80, caps: ['streaming', 'vision', 'tools', 'reasoning'], endpoints: 2, launchAt: null, deprecateAt: '2026-09-30T00:00:00Z' },
    { id: 'gpt-5-5',          name: 'GPT-5.5',           maker: 'OpenAI',    makerSlug: 'openai',    icon: '🟢', tier: 'premium',  group: 'premium',     desc: 'Next-gen OpenAI model. Cheap at low context; premium unlock for 200k+.', context: '1M',   mIn: 1.00, mOut: 1.50,
      caps: ['streaming', 'vision', 'tools', 'reasoning', 'search', 'caching'], endpoints: 3, launchAt: '2026-08-15T00:00:00Z', deprecateAt: null,
      contextTiers: [
        { upTo: 200000, mIn: 1.00, mOut: 1.50, cacheRead: 0.30, cacheWrite: 0.50, requiredGroup: 'standard' },
        { upTo: null,   mIn: 1.40, mOut: 2.00, cacheRead: 0.40, cacheWrite: 0.70, requiredGroup: 'premiumPlus' },
      ] },
    { id: 'gemini-2-flash',   name: 'Gemini 2.0 Flash',  maker: 'Google',    makerSlug: 'google',    icon: '🔵', tier: 'free',     group: 'free',        desc: 'Ultra-fast 1M-context Google model with search grounding.', context: '1M',   mIn: 0.20, mOut: 0.30, caps: ['streaming', 'vision', 'tools', 'search'], endpoints: 3, launchAt: null, deprecateAt: null },
    { id: 'gemini-2-pro',     name: 'Gemini 2.5 Pro',    maker: 'Google',    makerSlug: 'google',    icon: '🔵', tier: 'premium',  group: 'premium',     desc: 'Google’s most capable long-context reasoning + search model.', context: '1M',   mIn: 0.90, mOut: 1.20, caps: ['streaming', 'vision', 'tools', 'reasoning', 'search'], endpoints: 2, launchAt: null, deprecateAt: null },
    { id: 'llama-3-70b',      name: 'Llama 3.3 70B',     maker: 'Meta',      makerSlug: 'meta',      icon: '🦙', tier: 'free',     group: 'free',        desc: 'Open-weight Meta model for general chat and text generation.', context: '128k', mIn: 0.15, mOut: 0.25, caps: ['streaming'], endpoints: 6, launchAt: null, deprecateAt: null },
    { id: 'deepseek-v3',      name: 'DeepSeek V3',       maker: 'DeepSeek',  makerSlug: 'deepseek',  icon: '🐋', tier: 'free',     group: 'free',        desc: 'Cost-efficient reasoning model from DeepSeek.', context: '64k',  mIn: 0.10, mOut: 0.20, caps: ['streaming', 'reasoning'], endpoints: 4, launchAt: null, deprecateAt: null },
    { id: 'deepseek-r1',      name: 'DeepSeek R1',       maker: 'DeepSeek',  makerSlug: 'deepseek',  icon: '🐋', tier: 'standard', group: 'standard',    desc: 'Chain-of-thought reasoning specialist.', context: '128k', mIn: 0.30, mOut: 0.45, caps: ['streaming', 'reasoning'], endpoints: 3, launchAt: null, deprecateAt: null },
    { id: 'claude-opus-4',    name: 'Claude Opus 4',     maker: 'Anthropic', makerSlug: 'anthropic', icon: '🟣', tier: 'elite',    group: 'premiumPlus', desc: 'Previous-generation Opus, retained for compatibility.', context: '200k', mIn: 1.10, mOut: 1.60, caps: ['streaming', 'vision', 'reasoning', 'caching', 'tools'], endpoints: 2, launchAt: null, deprecateAt: null },
  ];

  // Live catalogue: authored-by-admin data if present, else the seed.
  const MODELS = (window.OrchidShared
    ? OrchidShared.get(OrchidShared.KEYS.models, MODELS_SEED)
    : MODELS_SEED);

  // Layer admin-authored per-model overrides (group reassignment, lifecycle
  // dates, multipliers) onto the catalogue. Keyed by model id (== admin slug).
  if (window.OrchidShared) {
    const overrides = OrchidShared.get(OrchidShared.KEYS.modelOverrides, {}) || {};
    MODELS.forEach(m => {
      const o = overrides[m.id];
      if (!o) return;
      if (o.group != null) m.group = o.group;
      if (o.launchAt !== undefined) m.launchAt = o.launchAt;
      if (o.deprecateAt !== undefined) m.deprecateAt = o.deprecateAt;
      if (o.mIn != null) m.mIn = o.mIn;
      if (o.mOut != null) m.mOut = o.mOut;
      if (Array.isArray(o.contextTiers)) m.contextTiers = o.contextTiers;
      if (o.makerId !== undefined) m.makerSlug = o.makerId;
      if (o.maker != null) m.maker = o.maker;
      if (o.delisted !== undefined) m.delisted = o.delisted;
    });
  }

  const TIER_RANK = { demo: 0, free: 1, standard: 2, basic: 2, premium: 3, plus: 3, 'premium+': 4, pro: 4, max: 5, elite: 6, admin: 7 };
  const USER_TIER_RANK = TIER_RANK[TIER] || TIER_RANK.free;
  const ENDPOINT_LABELS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const CONTEXT_TIERS = [
    { index: 0, label: 'Base', range: '0-32,999 tokens', requiredTier: 'free', action: 'allow' },
    { index: 1, label: 'Tier 1', range: '33,000-199,999 tokens', requiredTier: 'standard', action: 'compress', compressionModel: 'orchid-compress-lite' },
    { index: 2, label: 'Tier 2', range: '200,000-999,999 tokens', requiredTier: 'premium', action: 'compress', compressionModel: 'orchid-compress-pro' },
    { index: 3, label: 'Tier 3', range: '1,000,000+ tokens', requiredTier: 'elite', action: 'error', compressionModel: 'orchid-compress-max' },
  ];
  const TOKEN_MULTIPLIERS = [
    { tier: 'Base',   input: '1.00x', output: '1.00x', cacheRead: '0.20x', cacheWrite: '0.80x' },
    { tier: 'Tier 1', input: '1.15x', output: '1.35x', cacheRead: '0.25x', cacheWrite: '0.95x' },
    { tier: 'Tier 2', input: '1.45x', output: '1.80x', cacheRead: '0.35x', cacheWrite: '1.20x' },
    { tier: 'Tier 3', input: '2.00x', output: '2.60x', cacheRead: '0.50x', cacheWrite: '1.80x' },
  ];

  // ============================================================
  // MODEL GROUPS / CONTEXT BANDS / LIFECYCLE — helpers
  // ============================================================
  // Parse a display context string ('200k', '1M', '128k', '64k', '8192') to tokens.
  function ctxToTokens(ctx) {
    if (typeof ctx === 'number') return ctx;
    if (!ctx) return 0;
    const s = String(ctx).trim().toLowerCase().replace(/,/g, '');
    if (s.endsWith('m')) return Math.round(parseFloat(s) * 1000000);
    if (s.endsWith('k')) return Math.round(parseFloat(s) * 1000);
    return parseInt(s, 10) || 0;
  }
  // Format tokens back to a compact label for band headers.
  function tokensToLabel(t) {
    if (t == null) return '∞';
    if (t >= 1000000) return (t % 1000000 === 0 ? (t / 1000000) : (t / 1000000).toFixed(1)) + 'M';
    if (t >= 1000) return Math.round(t / 1000) + 'k';
    return String(t);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function groupById(id) { return MODEL_GROUPS.find(g => g.id === id) || null; }
  function groupName(id) { const g = groupById(id); return g ? g.name : (id || 'Free'); }
  function groupRank(id) {
    const g = groupById(id);
    if (g) return g.rank;
    return TIER_RANK[id] || TIER_RANK.free;
  }
  // Does the current user's tier meet the required group?
  function hasGroupAccess(groupId) { return USER_TIER_RANK >= groupRank(groupId); }

  // Resolve a model's context bands. If the model authored its own
  // `contextTiers[]`, use them; otherwise synthesize per-model bands from its
  // base multipliers + max context (kept independent per model — no global set).
  function resolveContextTiers(model) {
    if (Array.isArray(model.contextTiers) && model.contextTiers.length) {
      return model.contextTiers.slice().sort((a, b) => (a.upTo == null ? Infinity : a.upTo) - (b.upTo == null ? Infinity : b.upTo));
    }
    const maxTok = ctxToTokens(model.context);
    const baseGroup = model.group || 'free';
    const r2 = (n) => Math.round(n * 100) / 100;
    const bands = [
      { upTo: Math.min(32000, maxTok), mIn: r2(model.mIn), mOut: r2(model.mOut), cacheRead: r2(model.mIn * 0.25), cacheWrite: r2(model.mIn * 0.9), requiredGroup: baseGroup },
    ];
    if (maxTok > 32000) {
      const g2 = groupRank(baseGroup) >= groupRank('standard') ? baseGroup : 'standard';
      bands.push({ upTo: Math.min(200000, maxTok), mIn: r2(model.mIn * 1.3), mOut: r2(model.mOut * 1.35), cacheRead: r2(model.mIn * 0.32), cacheWrite: r2(model.mIn * 1.1), requiredGroup: g2 });
    }
    if (maxTok > 200000) {
      const g3 = groupRank(baseGroup) >= groupRank('premium') ? baseGroup : 'premium';
      bands.push({ upTo: maxTok >= 1000000 ? null : maxTok, mIn: r2(model.mIn * 1.7), mOut: r2(model.mOut * 1.9), cacheRead: r2(model.mIn * 0.42), cacheWrite: r2(model.mIn * 1.4), requiredGroup: g3 });
    }
    // Collapse duplicate upTo (small models) keeping the first.
    const seen = new Set();
    return bands.filter(b => { const k = b.upTo; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // Lifecycle status from launch/deprecation dates. Returns
  // 'upcoming' | 'active' | 'retired'. Auto soft-deletes past deprecateAt.
  function modelLifecycle(model) {
    const now = Date.now();
    if (model.archived) return 'retired';
    if (model.deprecateAt && now >= Date.parse(model.deprecateAt)) return 'retired';
    if (model.launchAt && now < Date.parse(model.launchAt)) return 'upcoming';
    return 'active';
  }
  // A model is deprecating soon if it has a future deprecateAt within 60 days.
  function deprecatingSoon(model) {
    if (!model.deprecateAt) return false;
    const t = Date.parse(model.deprecateAt);
    const now = Date.now();
    return t > now && (t - now) < 60 * 24 * 60 * 60 * 1000;
  }
  // Models shown to users: active + upcoming (upcoming flagged, not selectable).
  // Retired models are hidden. Persist the soft-delete flag on first detection.
  function visibleModels() {
    let mutated = false;
    MODELS.forEach(m => {
      if (!m.archived && m.deprecateAt && Date.now() >= Date.parse(m.deprecateAt)) { m.archived = true; mutated = true; }
    });
    if (mutated && window.OrchidShared && OrchidShared.has(OrchidShared.KEYS.models)) {
      OrchidShared.set(OrchidShared.KEYS.models, MODELS);
    }
    // Delisted models are hidden from direct listing — reachable only via a
    // pool that routes to them (bridged from the admin catalogue).
    return MODELS.filter(m => modelLifecycle(m) !== 'retired' && !m.delisted);
  }

  // Rich capability metadata for the model capability showcase.
  const CAP_INFO = {
    tools:     { label: 'Tool calling',   icon: 'build',      desc: 'Can call functions / tools and use structured outputs.' },
    vision:    { label: 'Vision',         icon: 'visibility', desc: 'Accepts image inputs and reasons over them.' },
    images:    { label: 'Image output',   icon: 'image',      desc: 'Generates images from prompts.' },
    reasoning: { label: 'Reasoning',      icon: 'psychology', desc: 'Extended step-by-step reasoning / thinking.' },
    search:    { label: 'Web search',     icon: 'search',     desc: 'Can ground responses with live web search.' },
    caching:   { label: 'Prompt caching', icon: 'cached',     desc: 'Supports cached-context billing for repeated prompts.' },
    streaming: { label: 'Streaming',      icon: 'stream',     desc: 'Streams tokens as they are generated.' },
  };

  // Admin-set base compression prompt (read-only to users)
  const ADMIN_BASE_COMPRESSION_PROMPT = 'You are an expert conversation summarizer. Condense the following conversation history into a concise but complete summary, preserving all key decisions, facts, and context. Output only the summary — no preamble.';

  // Token groups — reusable bundles of model access + default rate limits.
  const TOKEN_GROUPS = [
    { id: 'tg-prod', name: 'Production', models: ['claude-sonnet-4-5', 'gpt-4o', 'gemini-2-flash'], rpm: 120, tpm: 250000 },
    { id: 'tg-dev', name: 'Development', models: null, rpm: 30, tpm: 60000 },
    { id: 'tg-test', name: 'Sandbox', models: ['gpt-4o-mini', 'llama-3-70b'], rpm: 10, tpm: 20000 },
  ];
  const tokenGroupById = (id) => TOKEN_GROUPS.find(g => g.id === id) || null;

  const API_KEYS = [
    { id: 'k1', label: 'Production App', preview: 'sk-orch-prod…8f3x', status: 'active', created: '2026-05-01', lastUsed: '2 min ago', creditsUsed: 4520, creditLimit: null, limitInterval: null, exposeBalance: true, modelWhitelist: ['claude-sonnet-4-5', 'gpt-4o', 'gemini-2-flash'], expiresAt: null, tokenGroup: 'tg-prod', rpm: 120, tpm: 250000 },
    { id: 'k2', label: 'Development', preview: 'sk-orch-dev…q2m7', status: 'active', created: '2026-05-10', lastUsed: '1 hour ago', creditsUsed: 1230, creditLimit: 50000, limitInterval: 'monthly', exposeBalance: false, modelWhitelist: null, expiresAt: '2026-12-31', tokenGroup: 'tg-dev', rpm: 30, tpm: 60000 },
    { id: 'k3', label: 'Testing Bot', preview: 'sk-orch-test…j9k1', status: 'disabled', created: '2026-05-15', lastUsed: '3 days ago', creditsUsed: 340, creditLimit: 1000, limitInterval: 'daily', exposeBalance: false, modelWhitelist: ['gpt-4o-mini', 'llama-3-70b'], expiresAt: '2026-06-01', tokenGroup: 'tg-test', rpm: 10, tpm: 20000 },
  ];

  // ============================================================
  // SUBSCRIPTION TIERS
  // ============================================================
  const SUBSCRIPTION_TIERS = [
    {
      id: 'free', name: 'Free Plan',
      cycles: { monthly: 0, quarterly: null, yearly: null },
      credits: 0, rpm: 5, maxKeys: 1, fastTrack: false, context: 8192,
      icon: 'person', tierColor: 'free', modelAccess: 'Free',
      gradient: ['#424242', '#1b1b1b'],
      accentColor: '#938f99',
      iconShape: 'square', iconEmoji: null, customTag: null,
      bgStyle: 'none', bgColors: [], hasBorder: false, borderAnimated: false, hasGlowing: false, glowPulse: false, glowAnimated: false,
      tagline: 'Basic access to check out OrchidLLM features.',
      perks: ['0 credits/mo', '5 RPM limit', '1 active API key', 'Free model access'],
      grid: {
        credits: 2000, standardCredits: 2000, fastCredits: 0,
        rpm: 3, maxKeys: 3, fastTrack: false, modelAccess: 'Free',
        stdQueue: 0, fastQueue: 1, exhaustedQueue: 'Locked',
        rpmActive: 3, rpmExhausted: 'Locked',
        concurrentRequests: 1, batchSlots: 0,
        rolloverRate: '0%', rolloverCap: '—', compression: '❌',
        perks: ['2,000 credits/mo (hover details)', '3 RPM (active) · Locked (exhaust)', '1 concurrent request', '3 active API keys max', 'Rollover: ❌ · Compression: ❌', 'Model access: Free']
      }
    },
    {
      id: 'basic', name: 'Basic Plan',
      cycles: { monthly: 80000, quarterly: 200000, yearly: 720000 },
      credits: 5000, rpm: 30, maxKeys: 2, fastTrack: false, context: 32768,
      icon: 'star', tierColor: 'basic', modelAccess: 'Standard',
      gradient: ['#00796B', '#004D40'],
      accentColor: '#80cbc4',
      iconShape: 'square', iconEmoji: null, customTag: null,
      bgStyle: 'none', bgColors: [], hasBorder: false, borderAnimated: false, hasGlowing: false, glowPulse: false, glowAnimated: false,
      tagline: 'Essential features for side projects and standard APIs.',
      perks: ['5,000 credits/mo', '30 RPM limit', '2 active API keys', 'Standard model access'],
      grid: {
        credits: 5000, standardCredits: 4000, fastCredits: 1000,
        rpm: 5, maxKeys: 5, fastTrack: false, modelAccess: 'Standard',
        stdQueue: 2, fastQueue: 3, exhaustedQueue: 1,
        rpmActive: 5, rpmExhausted: 3,
        concurrentRequests: 1, batchSlots: 2,
        rolloverRate: '20%', rolloverCap: '2,000', compression: '✅',
        perks: ['5,000 credits/mo (hover details)', '5 RPM (active) · 3 (exhausted)', '1 concurrent request · 2 batch slots', '5 active API keys max', 'Rollover: ❌ · Compression: ✅', 'Model access: Standard']
      }
    },
    {
      id: 'plus', name: 'Plus Plan',
      cycles: { monthly: 150000, quarterly: 380000, yearly: null },
      credits: 50000, rpm: 60, maxKeys: 5, fastTrack: true, context: 1000000,
      icon: 'diamond', tierColor: 'plus', modelAccess: 'Premium',
      gradient: ['#8126e0', '#4c1b99'],
      accentColor: '#b388ff',
      iconShape: 'square', iconEmoji: null, customTag: null,
      bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false,
      tagline: 'Increased speed and limits for developers and growing apps.',
      perks: ['50,000 credits/mo', '60 RPM limit', '5 active API keys', 'Priority queue'],
      grid: {
        credits: 50000, standardCredits: 40000, fastCredits: 10000,
        rpm: 30, maxKeys: 10, fastTrack: true, modelAccess: 'Premium',
        stdQueue: 3, fastQueue: 4, exhaustedQueue: 2,
        rpmActive: 30, rpmExhausted: 10,
        concurrentRequests: 3, batchSlots: 4,
        rolloverRate: '35%', rolloverCap: '50,000', compression: '✅',
        perks: ['50,000 credits/mo (hover details)', '30 RPM (active) · 10 (exhausted)', '3 concurrent requests · 4 batch slots', '10 active API keys max', 'Rollover: ✅ · Compression: ✅', 'Model access: Premium']
      }
    },
    {
      id: 'pro', name: 'Pro Plan',
      cycles: { monthly: 280000, quarterly: 700000, yearly: null },
      credits: 200000, rpm: 120, maxKeys: 10, fastTrack: true, context: 1000000,
      icon: 'workspace_premium', tierColor: 'pro', modelAccess: 'Premium+',
      gradient: ['#a67c00', '#4c3600'],
      accentColor: '#ffd54f',
      iconShape: 'square', iconEmoji: null, customTag: null,
      bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false,
      tagline: 'Premium speed & priority access for professional scaling.',
      perks: ['200,000 credits/mo', '120 RPM limit', '10 active API keys', 'Premium+ model access'],
      grid: {
        credits: 200000, standardCredits: 160000, fastCredits: 40000,
        rpm: 60, maxKeys: 20, fastTrack: true, modelAccess: 'Premium+',
        stdQueue: 4, fastQueue: 5, exhaustedQueue: 2,
        rpmActive: 60, rpmExhausted: 20,
        concurrentRequests: 5, batchSlots: 8,
        rolloverRate: '50%', rolloverCap: '200,000', compression: '✅',
        perks: ['200,000 credits/mo (hover details)', '60 RPM (active) · 20 (exhausted)', '5 concurrent requests · 8 batch slots', '20 active API keys max', 'Rollover: ✅ · Compression: ✅', 'Model access: Premium+']
      }
    },
    {
      id: 'elite', name: 'Elite Plan',
      cycles: { monthly: 450000, quarterly: null, yearly: null },
      credits: 1000000, rpm: 300, maxKeys: 50, fastTrack: true, context: 1000000,
      icon: 'auto_awesome', tierColor: 'elite', modelAccess: 'Elite',
      gradient: ['#D946EF', '#F43F5E'],
      accentColor: '#D946EF',
      iconShape: 'diamond', iconEmoji: null, customTag: null,
      bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false,
      tagline: 'Maximum bandwidth and power for enterprise-grade applications.',
      perks: ['1,000,000 credits/mo', '300 RPM limit', '50 active API keys', 'Elite model access & support'],
      grid: {
        credits: 1000000, standardCredits: 800000, fastCredits: 200000,
        rpm: 150, maxKeys: 50, fastTrack: true, modelAccess: 'Elite',
        stdQueue: 5, fastQueue: 6, exhaustedQueue: 2,
        rpmActive: 150, rpmExhausted: 50,
        concurrentRequests: 10, batchSlots: 16,
        rolloverRate: '70%', rolloverCap: '500,000', compression: '✅',
        perks: ['1,000,000 credits/mo (hover details)', '150 RPM (active) · 50 (exhausted)', '10 concurrent requests · 16 batch slots', '50 active API keys max', 'Rollover: ✅ · Compression: ✅', 'Model access: Elite & support']
      }
    },
  ];

  // Admin-authored per-tier visual overrides (bg/border/glow/icon/tag),
  // keyed by lowercased tier name — merged in over the seed defaults above
  // so admin edits to Plans show up here without touching pricing/limits.
  if (window.OrchidShared) {
    const tierStyles = OrchidShared.get(OrchidShared.KEYS.tierStyles, {});
    SUBSCRIPTION_TIERS.forEach(tier => {
      const override = tierStyles[tier.id];
      if (override) Object.assign(tier, override);
    });

    // Admin-authored billing-cycle pricing — replaces the hardcoded seed
    // `cycles` object wholesale once the admin has published at least once.
    // `cycleOverrides` carries an optional limited-time flash price per cycle
    // ({ idr, until }); resolveCyclePrice() below decides which one wins.
    const tierPricing = OrchidShared.get(OrchidShared.KEYS.tierPricing, {});
    SUBSCRIPTION_TIERS.forEach(tier => {
      const pricing = tierPricing[tier.id];
      if (!pricing) return;
      tier.cycles = {
        monthly: pricing.monthlyEnabled !== false ? pricing.monthlyIDR : null,
        quarterly: pricing.quarterlyEnabled ? pricing.quarterlyIDR : null,
        yearly: pricing.yearlyEnabled ? pricing.yearlyIDR : null,
      };
      tier.cycleOverrides = pricing.cycleOverrides || null;
    });
  }

  // Loyalty-escalating retention offers (admin-configured in Settings) —
  // brackets keyed by minimum months on the user's CURRENT tier.
  const RETENTION_OFFERS_SEED = [
    { id: 'ro1', minTenureMonths: 0, discountPercent: 30, bonusCredits: 50000 },
    { id: 'ro2', minTenureMonths: 3, discountPercent: 40, bonusCredits: 75000 },
    { id: 'ro3', minTenureMonths: 6, discountPercent: 50, bonusCredits: 100000 },
  ];
  const RETENTION_OFFERS = window.OrchidShared ? OrchidShared.get(OrchidShared.KEYS.retentionOffers, RETENTION_OFFERS_SEED) : RETENTION_OFFERS_SEED;

  // Highest bracket the user's tenure on their current tier qualifies for.
  function getRetentionOffer() {
    const tenure = DEMO_USER.planTenureMonths || 0;
    const eligible = RETENTION_OFFERS.filter(r => tenure >= r.minTenureMonths);
    if (!eligible.length) return { discountPercent: 30, bonusCredits: 50000 };
    return eligible.reduce((best, r) => (r.minTenureMonths > best.minTenureMonths ? r : best));
  }

  // Demo user state (simulated)
  let DEMO_USER = {
    tier: TIER,
    cycle: session.cycle || 'monthly',
    nextRenewal: session.nextRenewal || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isFirstUpgrade: localStorage.getItem('orchid_first_upgrade_seen') !== 'true',
    scheduledUpgrade: session.scheduledUpgrade || null,
    scheduledDowngrade: session.scheduledDowngrade || null,

    // ── Personalization fields ──────────────────────────────────
    totalSpent: 1250000,          // Total IDR ever spent
    joinedMonths: 6,              // How long on the platform
    joinedDays: 180,              // Platform tenure in days
    spentPastMonth: 150000,       // Spent in the last 30 days
    spentPast2Months: 350000,    // Spent in the last 60 days
    activeRequestsToday: 120,     // API requests today
    isActiveToday: true,          // User was active recently (API flag)
    planTenureMonths: 3,         // How long on the current plan
    currentPlan: TIER,           // 'free' | 'basic' | 'plus' | 'pro' | 'elite'
    isReturning: true,           // Returning vs new user
    referCount: 5,                // How many users referred
  };

  // Icon container shapes admin can pick for wallet icons / plan icons / tag
  // markers — anything outside this whitelist (e.g. stale demo values) is
  // ignored so old data never breaks rendering.
  const SHAPE_CLASSES = ['square', 'circle', 'diamond', 'hexagon'];

  // ============================================================
  // BOOSTER PACKS
  // ============================================================
  // Canonical seed + shared tag renderer live in booster-seed.js (loaded
  // before this script) so the admin panel shares the exact same examples.
  const BOOSTER_PACKS_SEED = window.ORCHID_BOOSTER_SEED || [];

  // Admin-authored packs win once the admin has saved at least once; the
  // seed above is only the pre-admin fallback (OrchidShared.get contract).
  const BOOSTER_PACKS = window.OrchidShared ? OrchidShared.get(OrchidShared.KEYS.boosterPacks, BOOSTER_PACKS_SEED) : BOOSTER_PACKS_SEED;

  // Declarative personalization-rule evaluator — packs carry a plain
  // { type, value, reason } object (not a function) so the whole list can
  // survive JSON.stringify across the admin→user bridge.
  function evalPersonalization(pack, user) {
    const rule = pack.personalization;
    if (!rule || rule.type === 'none') return true;
    switch (rule.type) {
      case 'spend_gte': return user.totalSpent >= rule.value;
      case 'tenure_months_gte': return user.joinedMonths >= rule.value;
      case 'recent_spend_gte': return user.spentPastMonth >= rule.value;
      case 'recent_spend_lt': return user.spentPastMonth < rule.value;
      case 'activity_gte': return user.activeRequestsToday >= rule.value;
      case 'plan_tenure_gte': return user.planTenureMonths >= rule.value;
      default: return true;
    }
  }

  // Shared tag-badge renderer (booster-seed.js) — same output on booster
  // cards, plan cards and the admin dialog live preview.
  const renderCustomTagBadge = window.OrchidTagBadge;
  // ACTIVE_PACKS: Each entry is one purchased booster pack.
  // Credits do NOT expire after purchase — they persist until fully consumed.
  // ignore_plan_lock=false means pack is LOCKED if user drops below purchase tier.
  // Split-fuel packs have a `wallets` array; simple packs use creditsStandard/creditsFast.
  const ACTIVE_PACKS = [
    {
      id: 'ap1',
      name: 'The Power User Bundle',
      color: '#EC4899',
      isSplitFuel: true,
      // Split-fuel: two separate wallets provisioned by one purchase
      wallets: [
        { label: 'Fast', creditsLeft: 7200, creditsMax: 10000, queuePriority: 6, modelAccess: 'premium+', type: 'fast', walletColor: '#EC4899' },
        { label: 'Standard · Haiku', creditsLeft: 28500, creditsMax: 40000, queuePriority: 2, modelAccess: 'standard', type: 'standard', walletColor: '#A855F7' },
      ],
      ignorePlanLock: false,
      isLocked: false,          // user is Plus — pack valid
      purchasedOnTier: 'plus',
    },
    {
      id: 'ap2',
      name: 'Starter Boost',
      color: '#3B82F6',
      isSplitFuel: false,
      creditsStandardLeft: 820,
      creditsStandardMax: 5000,
      creditsFastLeft: 1000,    // fast credits exhausted
      creditsFastMax: 1000,
      queuePriorityStandard: 3,
      queuePriorityFast: 4,
      modelAccess: 'standard',
      ignorePlanLock: true,     // Free-tier promo — survives any plan change
      isLocked: false,
      purchasedOnTier: 'free',
    },
    {
      id: 'ap3',
      name: 'Flash Pack · Fast-Lane',
      color: '#F59E0B',
      isSplitFuel: false,
      creditsStandardLeft: 0,
      creditsStandardMax: 0,
      creditsFastLeft: 8400,
      creditsFastMax: 10000,
      queuePriorityStandard: null,
      queuePriorityFast: 6,
      modelAccess: 'premium+',
      ignorePlanLock: false,
      isLocked: false,
      purchasedOnTier: 'plus',
    },
    {
      id: 'ap4',
      name: 'Weekend Pass',
      color: '#06B6D4',
      isSplitFuel: false,
      creditsStandardLeft: 9750,
      creditsStandardMax: 10000,
      creditsFastLeft: 1800,
      creditsFastMax: 2000,
      queuePriorityStandard: 4,
      queuePriorityFast: 4,
      modelAccess: 'premium',
      ignorePlanLock: false,
      isLocked: false,
      purchasedOnTier: 'basic',
    },
    {
      id: 'ap5',
      name: 'Elite Bulk Pack',
      color: '#8B5CF6',
      isSplitFuel: false,
      creditsStandardLeft: 35000,
      creditsStandardMax: 50000,
      creditsFastLeft: 5000,
      creditsFastMax: 10000,
      queuePriorityStandard: 5,
      queuePriorityFast: 6,
      modelAccess: 'premium+',
      ignorePlanLock: false,
      isLocked: true,           // LOCKED: purchased on Elite, user is now Plus
      purchasedOnTier: 'elite',
      lockedReason: 'Requires Elite plan — credits preserved, reactivates if you upgrade',
    },
  ];

  // Tag shape → M3E shape name + color variant mapping
  const TAG_SHAPE_MAP = {
    POPULAR:  { shape: 'flower',  fill: true,  color: '#7C3AED' },
    FEATURED: { shape: 'diamond', fill: true,  color: '#F59E0B' },
    LIMITED:  { shape: 'gem',     fill: false, color: '#06B6D4' },
    SALE:     { shape: 'burst',   fill: true,  color: '#EF4444' },
  };

  const TIER_COLOR_MAP = {
    free:  'var(--tier-color-free)',
    basic: 'var(--tier-color-basic)',
    plus:  'var(--tier-color-plus)',
    pro:   'var(--tier-color-pro)',
    elite: 'var(--tier-color-elite)',
  };

  // Helper to sync booster pack lock states and invalidation based on user's active tier
  function syncBoosterPackTiers(currentTier) {
    const tierOrder = ['free', 'basic', 'plus', 'pro', 'elite'];
    const currentIdx = tierOrder.indexOf(currentTier);
    const proIdx = tierOrder.indexOf('pro');

    if (currentTier === 'free' || currentIdx <= 0) {
      // Invalidated if free/not subscribed: completely remove all packs
      ACTIVE_PACKS.length = 0;
    } else {
      // Locked if lower than pro
      ACTIVE_PACKS.forEach(p => {
        p.isLocked = currentIdx < proIdx;
      });
    }
  }

  // ============================================================
  // TIER ACCENT SYSTEM
  // ============================================================
  function applyTierAccent(tier) {
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === tier) || SUBSCRIPTION_TIERS[0];
    
    // Sync booster pack locks/invalidations based on subscription tier
    syncBoosterPackTiers(tier);

    document.documentElement.style.setProperty('--tier-accent', tierData.accentColor);
    document.documentElement.style.setProperty('--tier-gradient-start', tierData.gradient[0]);
    document.documentElement.style.setProperty('--tier-gradient-end', tierData.gradient[1]);
    
    // Sync dynamic tier attributes for CSS styling
    document.documentElement.setAttribute('data-active-tier', tier);
    document.body.setAttribute('data-active-tier', tier);
    
    // Dynamically update MD3 primary tokens based on the active tier to theme buttons/highlights automatically
    const onPrimaryColors = {
      free: '#1c1b1f',
      basic: '#003732',
      plus: '#24005a',
      pro: '#3e2723',
      elite: '#4a0050'
    };
    const primaryContainers = {
      free: 'rgba(147, 143, 153, 0.16)',
      basic: 'rgba(128, 203, 196, 0.16)',
      plus: 'rgba(179, 136, 255, 0.16)',
      pro: 'rgba(255, 213, 79, 0.16)',
      elite: 'rgba(217, 70, 239, 0.16)'
    };
    const onPrimaryContainers = {
      free: '#e6e0e9',
      basic: '#80cbc4',
      plus: '#b388ff',
      pro: '#ffd54f',
      elite: '#D946EF'
    };

    document.documentElement.style.setProperty('--md-sys-color-primary', tierData.accentColor);
    document.documentElement.style.setProperty('--md-sys-color-on-primary', onPrimaryColors[tier] || '#ffffff');
    document.documentElement.style.setProperty('--md-sys-color-primary-container', primaryContainers[tier] || 'rgba(255, 255, 255, 0.16)');
    document.documentElement.style.setProperty('--md-sys-color-on-primary-container', onPrimaryContainers[tier] || tierData.accentColor);
    
    // Sync USER object state
    USER.tier = tier;
    USER.tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    
    // Sync top right badge
    const labelEl = document.getElementById('tier-badge-label');
    if (labelEl) {
      labelEl.textContent = USER.tierLabel;
    }
    const badgeIconEl = document.querySelector('#tier-badge .material-symbols-outlined');
    if (badgeIconEl) {
      badgeIconEl.textContent = TIER_ICONS[tier] || 'person';
    }

    const cardEl = document.getElementById('premium-billing-card');
    if (cardEl) {
      cardEl.className = 'premium-billing-card stagger-item'; // Reset classes
      cardEl.classList.add('tier-' + tier);
      
      const gradients = {
        free: 'linear-gradient(135deg, #424242, #1b1b1b)',
        basic: 'linear-gradient(135deg, #00796B, #004D40)',
        plus: 'linear-gradient(135deg, #8126e0, #4c1b99)',
        pro: 'linear-gradient(135deg, #a67c00, #4c3600)',
        elite: 'linear-gradient(135deg, #701A75, #2E0854)',
      };
      
      const subcardGradients = {
        free: 'linear-gradient(135deg, rgba(147, 143, 153, 0.12), rgba(112, 110, 117, 0.04))',
        basic: 'linear-gradient(135deg, rgba(128, 203, 196, 0.12), rgba(0, 191, 165, 0.04))',
        plus: 'linear-gradient(135deg, rgba(179, 136, 255, 0.12), rgba(124, 77, 255, 0.04))',
        pro: 'linear-gradient(135deg, rgba(255, 213, 79, 0.12), rgba(255, 143, 0, 0.04))',
        elite: 'linear-gradient(135deg, rgba(217, 70, 239, 0.12), rgba(244, 63, 94, 0.04))',
      };
      
      cardEl.style.setProperty('--card-bg-gradient', gradients[tier] || gradients.free);
      cardEl.style.setProperty('--subcard-bg-gradient', subcardGradients[tier] || subcardGradients.free);
    }

    const iconEl = document.querySelector('.plan-badge-inner .material-symbols-outlined');
    if (iconEl) {
      iconEl.textContent = tierData.icon;
    }

    if (window._billingInitialized && typeof renderCreditsConsole === 'function') {
      renderCreditsConsole('credits-console-container');
      renderCreditsConsole('billing-credits-console-container');
    }
  }


  // ============================================================
  // Helper to calculate how many times a booster pack has been purchased
  function getPackPurchaseCount(pack) {
    return ACTIVE_PACKS.filter(ap => {
      const n1 = ap.name.toLowerCase().replace(/^the\s+/, '');
      const n2 = pack.name.toLowerCase().replace(/^the\s+/, '');
      return n1 === n2;
    }).length;
  }

  // ============================================================
  // BOOSTER STORE RENDERING (M3E shapes, price slashes, countdowns)
  // ============================================================
  function renderBoosterStore() {
    const grid = document.getElementById('booster-grid');
    if (!grid) return;

    // Filter booster packs based on active category filter AND personalization rule
    const filteredPacks = BOOSTER_PACKS.filter(p => {
      if (p.minTier && !hasTierAccess(p.minTier)) return false;
      if (p.maxTier && USER_TIER_RANK > (TIER_RANK[p.maxTier] || Infinity)) return false;
      if (!evalPersonalization(p, DEMO_USER)) return false;
      if (!currentBoosterCategory || currentBoosterCategory === 'all') return true;
      return p.category && p.category.toLowerCase() === currentBoosterCategory.toLowerCase();
    });

    grid.innerHTML = filteredPacks.map((p, i) => {
      let bgStyle = '';
      let bgAnimatedClass = '';
      if (p.bgStyle === 'animated') {
        bgStyle = `background: linear-gradient(135deg, ${p.bgColors[0]}, ${p.bgColors[1]}, ${p.bgColors[2] || p.bgColors[0]});`;
        bgAnimatedClass = 'bg-animated';
      } else if (p.bgStyle === 'gradient') {
        bgStyle = `background: linear-gradient(135deg, ${p.bgColors[0]}, ${p.bgColors[1]});`;
      } else if (p.bgStyle === 'solid') {
        bgStyle = `background: ${p.bgColors[0]};`;
      } else {
        bgStyle = 'background: var(--md-sys-color-surface-container-low);';
      }

      const primaryColor = p.themeColor || (p.bgColors && p.bgColors[0] ? p.bgColors[0] : '#7C3AED');
      const styleVars = `--pack-theme-color: ${primaryColor}; --pack-theme-color-end: ${p.bgColors && p.bgColors[1] ? p.bgColors[1] : primaryColor};`;

      // Discount calculations
      const discountPercent = p.slashPriceIDR
        ? Math.round(((p.slashPriceIDR - p.priceIDR) / p.slashPriceIDR) * 100)
        : 0;

      const price = currentCurrency === 'idr'
        ? `Rp ${formatNum(p.priceIDR)}`
        : `$${p.priceUSD.toFixed(2)}`;
      let slashOld = '';
      if (p.slashPriceIDR) {
        if (currentCurrency === 'idr') {
          slashOld = `<span class="booster-price-old">Rp ${formatNum(p.slashPriceIDR)}</span>`;
        } else {
          const slashPriceUSD = p.slashPriceUSD || (p.priceUSD * (p.slashPriceIDR / p.priceIDR));
          slashOld = `<span class="booster-price-old">$${slashPriceUSD.toFixed(2)}</span>`;
        }
      }

      // Removed discount badge from beside the price per user request
      const priceDiscountBadge = '';

      // Purchase count and limit
      const purchaseCount = getPackPurchaseCount(p);
      const hasLimit = p.purchaseLimit !== null && p.purchaseLimit !== undefined;
      const limitReached = hasLimit && purchaseCount >= p.purchaseLimit;
      const remainingCount = hasLimit ? Math.max(0, p.purchaseLimit - purchaseCount) : 0;

      // Tag badge: diagonal corner ribbon (ONLY for discounts)
      let tagHTML = '';
      if (discountPercent > 0) {
        const text = `${discountPercent}% OFF`;
        
        let ribbonClass = 'booster-ribbon';
        let wrapperClass = 'booster-ribbon-wrapper';
        let inlineStyle = '';
        
        if (discountPercent >= 50) {
          ribbonClass += ' ribbon-gradient ribbon-glow';
          wrapperClass += ' wrapper-glow';
        } else if (discountPercent >= 30) {
          ribbonClass += ' ribbon-gradient';
        } else {
          ribbonClass += ' ribbon-solid';
          // Determine color based on tag mapping
          const tagColor = TAG_SHAPE_MAP[p.tag]?.color || '#16a34a';
          inlineStyle = `background-color: ${tagColor};`;
        }
        
        tagHTML = `
          <div class="${wrapperClass}">
            <div class="${ribbonClass}" style="${inlineStyle}">
              <span>${text}</span>
            </div>
          </div>
        `;
      }

      // Background particles / effects
      const bgEffectsHTML = (p.bgStyle === 'animated' || p.bgStyle === 'gradient')
        ? `<div class="booster-bg-particles">
             <div class="booster-particle" style="top:12%; left:22%; width:16px; height:16px; animation-delay:0s;"></div>
             <div class="booster-particle" style="top:58%; left:78%; width:12px; height:12px; animation-delay:1.5s;"></div>
             <div class="booster-particle" style="top:75%; left:35%; width:20px; height:20px; animation-delay:3s;"></div>
           </div>`
        : '';

      // Top-left availability/countdown timer wrapper
      let countdownHTML = '';
      if (p.availableUntil) {
        countdownHTML = `<div class="countdown-timer booster-timer-tag" data-until="${p.availableUntil}">
             <span class="countdown-icon">⏳</span>
             <span class="countdown-value"></span>
           </div>`;
      } else if (p.globalStock !== null && p.globalStock !== undefined) {
        const isUrgentStock = p.globalStock <= 20;
        countdownHTML = `<div class="booster-timer-tag ${isUrgentStock ? 'urgent' : ''}">
             <span class="countdown-icon">🔥</span>
             <span class="countdown-value">Only ${p.globalStock} Available</span>
           </div>`;
      }

      // Detailed wallet list
      const walletsHTML = p.wallets.map(w => {
        const isFast = w.type === 'fast';
        const icon = isFast ? 'flash_on' : 'toll';
        const accessText = w.access.toUpperCase();
        const shape = SHAPE_CLASSES.includes(w.iconShape) ? w.iconShape : 'circle';
        const iconInner = w.iconEmoji
          ? `<span class="icon-emoji">${w.iconEmoji}</span>`
          : `<span class="material-symbols-outlined">${icon}</span>`;
        return `
          <div class="store-wallet-row ${isFast ? 'wl-fast' : 'wl-std'}">
            <span class="store-wallet-icon-wrap shape-${shape}" style="background:color-mix(in srgb, ${w.color} 22%, transparent); color:${w.color}">${iconInner}</span>
            <div class="store-wallet-info">
              <span class="store-wallet-amt">${formatNum(w.credits)} <span class="store-wallet-lbl">${w.label}</span></span>
              <div class="store-wallet-badges">
                <span class="store-wallet-badge prio" title="Queue Priority ${w.priority}">P${w.priority}</span>
                <span class="store-wallet-badge access ${w.access}" title="Access to ${w.access} models">${accessText}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const remainingHTML = hasLimit
        ? `<span class="booster-remaining-count ${limitReached ? 'maxed' : ''}">${remainingCount} Remaining</span>`
        : '';
      
      // Category is rendered as the header tag badge (or customTag override)
      const catClass = p.category ? `cat-${p.category.toLowerCase().replace(/\s+/g, '-')}` : '';
      const headerTagHTML = renderCustomTagBadge(p.customTag, p.category, catClass);

      const headerParts = [headerTagHTML, remainingHTML].filter(Boolean);
      const headerTopHTML = headerParts.join('<span class="booster-header-dot">·</span>');

      // Determine glow styling class
      let glowClass = '';
      if (p.hasGlowing) {
        if (p.glowAnimated) {
          glowClass = 'card-glowing-animated';
        } else if (p.glowPulse !== false) {
          glowClass = 'card-glowing-pulse';
        } else {
          glowClass = 'card-glowing';
        }
      }

      // Determine border styling class
      let borderClass = '';
      if (p.hasBorder) {
        if (p.borderAnimated !== false) {
          borderClass = 'card-animated-border';
        } else {
          borderClass = 'card-with-border';
        }
      }

      return `
        <div class="booster-card ${p.featured ? 'featured' : ''} ${borderClass} ${glowClass} ${bgAnimatedClass} ${limitReached ? 'limit-reached' : ''} stagger-item"
             style="${bgStyle} ${styleVars} animation-delay:${i * 80}ms"
             onclick="openPurchaseFlow('${p.id}')">
          ${p.hasBorder && p.borderAnimated !== false ? '<div class="card-border-wrapper"></div>' : ''}
          ${countdownHTML}
          ${bgEffectsHTML}
          ${tagHTML}
          <div class="booster-card-header">
            <div class="booster-header-top">
              ${headerTopHTML}
            </div>
            <div class="booster-name ${p.personalization && p.personalization.reason ? 'title-special' : ''}">${p.name}</div>
          </div>
          <div class="booster-desc">${p.description}</div>
          <div class="booster-store-wallets">
            ${walletsHTML}
          </div>
          <div class="booster-card-footer">
            <div class="booster-price">
              ${slashOld}
              <span class="booster-price-current">${price}</span>
              ${priceDiscountBadge}
            </div>
            <div class="booster-meta-details">
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Re-run stagger animation
    grid.querySelectorAll('.stagger-item').forEach(el => {
      el.classList.remove('stagger-done');
      void el.offsetWidth;
      el.classList.add('stagger-done');
    });

    // ---- Row-based Show More logic ----
    applyShowMoreLogic(grid);
  }

  // Dynamic Show More: measure how many cards fit in one row, hide the rest
  function applyShowMoreLogic(grid) {
    const showMoreRow = document.getElementById('booster-show-more-row');
    const showMoreBtn = document.getElementById('show-more-btn');
    const cards = [...grid.querySelectorAll('.booster-card')];
    if (cards.length === 0) {
      if (showMoreRow) showMoreRow.style.display = 'none';
      return;
    }

    // Force a reflow so computed layout is accurate
    void grid.offsetHeight;

    const gridStyle = window.getComputedStyle(grid);
    const gridWidth = grid.clientWidth;
    const gap = parseFloat(gridStyle.gap) || 16;

    if (gridWidth === 0) return; // Not visible yet — skip (re-called on resize)

    const firstCard = cards[0];
    const cardWidth = firstCard.getBoundingClientRect().width;
    const cols = Math.max(1, Math.round((gridWidth + gap) / (cardWidth + gap)));
    const rows = Math.ceil(cards.length / cols);
    const needsShowMore = rows > 2;

    // Reset all cards
    cards.forEach((c, idx) => {
      c.classList.remove('pack-hidden');
      c.style.setProperty('animation-delay', `${idx * 80}ms`);
    });

    if (needsShowMore) {
      // Hide cards beyond the first row (1 row visible by default if there are more than 2 rows)
      const visibleCount = cols; // exactly 1 row
      for (let i = visibleCount; i < cards.length; i++) {
        cards[i].classList.add('pack-hidden');
      }
      // Update button label
      const remaining = cards.length - visibleCount;
      const labelSpan = showMoreBtn.querySelector('.show-more-label');
      if (labelSpan) labelSpan.textContent = `Show ${remaining} more pack${remaining > 1 ? 's' : ''}`;
      showMoreRow.style.display = 'flex';

      // Wire button — remove old listener then add new
      const newBtn = showMoreBtn.cloneNode(true);
      showMoreBtn.replaceWith(newBtn);
      newBtn.addEventListener('click', () => {
        const hiddenCards = cards.slice(visibleCount);
        // Cascade reveal via the Web Animations API: WAAPI composites above
        // CSS animations, so it can't be trumped by the cards' combined
        // animation lists (bg-animated/glow variants) or the stagger-done
        // static state — the CSS-class restart approach popped everything in
        // at once. fill:'backwards' holds opacity 0 through each card's delay.
        hiddenCards.forEach((el, index) => {
          el.classList.remove('pack-hidden');
          el.classList.add('stagger-done');
          el.animate(
            [
              { opacity: 0, transform: 'translateY(12px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 400, delay: index * 80, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)', fill: 'backwards' }
          );
        });

        showMoreRow.style.display = 'none';
      });
    } else {
      showMoreRow.style.display = 'none';
    }
  }

  // Re-apply show-more logic on window resize (debounced)
  let _showMoreResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_showMoreResizeTimer);
    _showMoreResizeTimer = setTimeout(() => {
      const grid = document.getElementById('booster-grid');
      if (grid) {
        grid.classList.remove('expanded');
        applyShowMoreLogic(grid);
      }
    }, 120);
  });

  // ============================================================
  // COUNTDOWN TIMER
  // ============================================================
  let countdownInterval = null;

  function tickCountdowns() {
    document.querySelectorAll('.countdown-timer').forEach(el => {
      const until = el.dataset.until;
      if (!until) return;
      const ms = new Date(until) - Date.now();
      const val = el.querySelector('.countdown-value');
      if (!val) return;
      if (ms <= 0) {
        val.textContent = 'EXPIRED';
        el.classList.add('urgent');
        return;
      }
      const totalH = ms / 3600000;
      if (totalH >= 24) {
        const d = Math.floor(totalH / 24);
        val.textContent = `${d} DAY${d !== 1 ? 'S' : ''} LEFT`;
      } else {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        val.textContent = `${h}H ${m.toString().padStart(2, '0')}M LEFT`;
      }
      if (ms < 86400000) {
        el.classList.add('urgent');
      } else {
        el.classList.remove('urgent');
      }
    });
  }

  function startCountdownTimer() {
    tickCountdowns();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(tickCountdowns, 1000);
  }

  // ============================================================
  // TIER TRANSITION ANIMATIONS
  // ============================================================
  function spawnParticles(count, container) {
    const colors = ['#b388ff', '#ffd54f', '#80cbc4', '#ff6b9d', '#06B6D4', '#7C3AED'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'tier-particle';
      const size = 6 + Math.random() * 8;
      const tx = (Math.random() - 0.5) * 300;
      const ty = -40 - Math.random() * 160;
      const delay = Math.random() * 0.4;
      const color = colors[Math.floor(Math.random() * colors.length)];
      Object.assign(p.style, {
        width: `${size}px`, height: `${size}px`,
        background: color,
        left: `${40 + Math.random() * 20}%`,
        top: `${40 + Math.random() * 20}%`,
        animationDelay: `${delay}s`,
        animationDuration: `${1.0 + Math.random() * 0.6}s`,
        '--tx': `${tx}px`, '--ty': `${ty}px`,
      });
      container.appendChild(p);
      requestAnimationFrame(() => p.classList.add('animate'));
      setTimeout(() => p.remove(), 2000);
    }
  }

  function showUpgradeCelebration(tier, creditsBoost) {
    applyTierAccent(tier);
    showToast(`Successfully upgraded to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan!`, 'success');
    DEMO_USER.isFirstUpgrade = false;
    localStorage.setItem('orchid_first_upgrade_seen', 'true');
  }

  function showDowngradeEffect(tier) {
    applyTierAccent(tier);
    showToast(`Successfully downgraded to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan!`, 'info');
  }

  // ============================================================
  // SUBSCRIPTION PLANS GRID
  // ============================================================
  const CYCLE_FILTER_ID = 'cycle-filter-tiers';

  // Which plans lack a given cycle — computed from live (admin-editable)
  // tier data rather than a hardcoded tier-name list, so the tooltip stays
  // correct after admin enables/disables cycles per tier.
  function cycleTooltip(cycle) {
    const unavailable = SUBSCRIPTION_TIERS.filter(t => t.cycles[cycle] === null || t.cycles[cycle] === undefined).map(t => t.name.replace(' Plan', ''));
    if (!unavailable.length) return `${cycle.charAt(0).toUpperCase() + cycle.slice(1)} billing — all plans are available`;
    return `${cycle.charAt(0).toUpperCase() + cycle.slice(1)} billing — ${unavailable.join(', ')} unavailable`;
  }

  // Resolves the effective price for a tier+cycle, honoring an optional
  // admin-set limited-time override ({ idr, until }) over the standing price.
  // Returns null when the cycle is disabled for this tier.
  function resolveCyclePrice(tier, cycle) {
    const standingPrice = tier.cycles[cycle];
    if (standingPrice === null || standingPrice === undefined) return null;
    const override = tier.cycleOverrides && tier.cycleOverrides[cycle];
    const overrideActive = override && override.idr != null && override.until && new Date(override.until).getTime() > Date.now();
    if (overrideActive) {
      return { price: override.idr, isOverride: true, overrideUntil: override.until, standingPrice };
    }
    return { price: standingPrice, isOverride: false, standingPrice };
  }

  // Standing "Save X%" vs paying monthly every month — only shown when the
  // set cycle price is actually cheaper (never computed from a flat guess).
  function cycleDiscountPercent(tier, cycle, price) {
    if (cycle === 'monthly' || !tier.cycles.monthly) return 0;
    const original = tier.cycles.monthly * (cycle === 'quarterly' ? 3 : 12);
    if (!(price < original)) return 0;
    return Math.round((1 - price / original) * 100);
  }

  // Override savings vs the standing price for that same cycle (the "50%
  // off" a flash promo actually promises), not vs. monthly × factor.
  function overrideDiscountPercent(standingPrice, overridePrice) {
    if (!standingPrice || !(overridePrice < standingPrice)) return 0;
    return Math.round((1 - overridePrice / standingPrice) * 100);
  }

  function renderSubscriptionPlans() {
    const container = document.getElementById('subscription-plans-container');
    if (!container) return;

    const currentTier = DEMO_USER.tier;
    const currentCycle = DEMO_USER.cycle;

    // Filter row containing cycle and currency toggles side-by-side
    const filterRow = `
      <div class="sub-cycle-filter-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 16px; flex-wrap: wrap; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="sub-cycle-filter-label">Billing cycle:</span>
          <m3e-segmented-button id="${CYCLE_FILTER_ID}" class="cycle-filter">
            ${['monthly', 'quarterly', 'yearly'].map(cycle => {
              const tooltip = ` title="${cycleTooltip(cycle)}"`;
              return `<m3e-button-segment value="${cycle}"${cycle === currentCycle ? ' checked' : ''}${tooltip}>${cycle.charAt(0).toUpperCase() + cycle.slice(1)}</m3e-button-segment>`;
            }).join('')}
          </m3e-segmented-button>
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="sub-cycle-filter-label">Currency:</span>
          <m3e-segmented-button class="currency-toggle" id="currency-toggle-main">
            <m3e-button-segment value="idr"${currentCurrency === 'idr' ? ' checked' : ''}>IDR</m3e-button-segment>
            <m3e-button-segment value="usd"${currentCurrency === 'usd' ? ' checked' : ''}>USD</m3e-button-segment>
          </m3e-segmented-button>
        </div>
      </div>
    `;

    const gridHTML = `
      <div class="subscription-plans-grid" id="sub-plans-grid">
        ${SUBSCRIPTION_TIERS.map((tier, idx) => {
          const isCurrentTier = tier.id === currentTier;
          return renderSubscriptionPlanCard(tier, isCurrentTier, currentTier);
        }).join('')}
      </div>
    `;

    const sectionTitle = `
      <h3 class="store-section-title" style="margin-bottom:16px;">
        <span class="material-symbols-outlined">Workspace_Premium</span>
        Subscription Plans
      </h3>
    `;

    container.innerHTML = sectionTitle + filterRow + gridHTML;

    // Wire up cycle filter → clean grid update
    const segBtn = document.getElementById(CYCLE_FILTER_ID);
    if (segBtn) {
      const newSegBtn = segBtn.cloneNode(true); // detach old listeners, keep children
      segBtn.replaceWith(newSegBtn);
      newSegBtn.addEventListener('change', () => {
        const checked = newSegBtn.querySelector('m3e-button-segment[checked]');
        if (!checked) return;
        const selectedCycle = checked.value;

        // Update global cycle
        DEMO_USER.cycle = selectedCycle;

        // Re-render the grid of cards
        const grid = document.getElementById('sub-plans-grid');
        if (grid) {
          grid.innerHTML = SUBSCRIPTION_TIERS.map(tier => {
            const isCurrentTier = tier.id === currentTier;
            return renderSubscriptionPlanCard(tier, isCurrentTier, currentTier);
          }).join('');

          // Re-stagger animation
          grid.querySelectorAll('.stagger-item').forEach(el => {
            el.classList.remove('stagger-done');
            void el.offsetWidth;
            el.classList.add('stagger-done');
          });
        }
      });
    }

    // Wire up currency toggle → re-render prices everywhere
    const currencyBtn = document.getElementById('currency-toggle-main');
    if (currencyBtn) {
      const newCurrencyBtn = currencyBtn.cloneNode(true); // detach old listeners, keep children
      currencyBtn.replaceWith(newCurrencyBtn);
      newCurrencyBtn.addEventListener('change', () => {
        const checked = newCurrencyBtn.querySelector('m3e-button-segment[checked]');
        if (!checked) return;
        currentCurrency = checked.value;
        // Re-render plan cards with new currency
        const grid = document.getElementById('sub-plans-grid');
        if (grid) {
          grid.innerHTML = SUBSCRIPTION_TIERS.map(tier => {
            const isCurrentTier = tier.id === currentTier;
            return renderSubscriptionPlanCard(tier, isCurrentTier, currentTier);
          }).join('');
          grid.querySelectorAll('.stagger-item').forEach(el => {
            el.classList.remove('stagger-done');
            void el.offsetWidth;
            el.classList.add('stagger-done');
          });
        }
        // Also refresh billing subcard prices
        renderBillingSection();
      });
    }
  }

  function renderSubscriptionPlanCard(tier, isCurrentTier, currentTier) {
    const FEATURES = [
      {
        icon: 'toll',
        key: 'credits',
        label: 'Credits / mo',
        render: (gd, tier) => {
          const display = gd.credits ? formatNum(gd.credits) : '0';
          const stdCr = formatNum(gd.standardCredits || 0);
          const fastCr = formatNum(gd.fastCredits || 0);
          return `
            <div class="sub-feature-row expandable-row" title="Hover to view breakdown">
              <div class="row-main-content">
                <span class="sub-feature-icon material-symbols-outlined">toll</span>
                <span class="sub-feature-label">Credits / mo</span>
                <span class="sub-feature-value">${display}</span>
              </div>
              <div class="row-expanded-details">
                <div class="row-detail-item">
                  <span class="row-detail-label">· Standard:</span>
                  <span class="row-detail-value">${stdCr}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Fast:</span>
                  <span class="row-detail-value">${fastCr}</span>
                </div>
              </div>
            </div>
          `;
        }
      },
      {
        icon: 'speed',
        key: 'rpm',
        label: 'RPM limit',
        render: (gd, tier) => {
          const display = gd.rpmActive || gd.rpm || '—';
          const activeRpm = gd.rpmActive || gd.rpm || '—';
          const exhaustedRpm = gd.rpmExhausted || 'Locked';
          return `
            <div class="sub-feature-row expandable-row" title="Hover to view breakdown">
              <div class="row-main-content">
                <span class="sub-feature-icon material-symbols-outlined">speed</span>
                <span class="sub-feature-label">RPM limit</span>
                <span class="sub-feature-value">${display}</span>
              </div>
              <div class="row-expanded-details">
                <div class="row-detail-item">
                  <span class="row-detail-label">· Active:</span>
                  <span class="row-detail-value">${activeRpm}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Exhausted:</span>
                  <span class="row-detail-value">${exhaustedRpm}</span>
                </div>
              </div>
            </div>
          `;
        }
      },
      {
        icon: 'bolt',
        key: 'fastTrack',
        label: 'Priority queue',
        render: (gd, tier) => {
          const display = gd.stdQueue !== undefined ? `Prio ${gd.stdQueue}` : 'No';
          
          let stdQ = gd.stdQueue !== undefined ? gd.stdQueue : '0';
          let fastQ = gd.fastQueue !== undefined ? gd.fastQueue : '—';
          let exhQ = gd.exhaustedQueue !== undefined ? gd.exhaustedQueue : 'Locked';

          if (tier.id === 'free') {
            fastQ = '1 (requires pack)';
            exhQ = 'Locked (disabled)';
          }

          return `
            <div class="sub-feature-row expandable-row" title="Hover to view breakdown">
              <div class="row-main-content">
                <span class="sub-feature-icon material-symbols-outlined">bolt</span>
                <span class="sub-feature-label">Priority queue</span>
                <span class="sub-feature-value">${display}</span>
              </div>
              <div class="row-expanded-details">
                <div class="row-detail-item">
                  <span class="row-detail-label">· Standard Queue:</span>
                  <span class="row-detail-value">${stdQ}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Fast Queue:</span>
                  <span class="row-detail-value">${fastQ}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Exhausted Queue:</span>
                  <span class="row-detail-value">${exhQ}</span>
                </div>
              </div>
            </div>
          `;
        }
      },
      {
        icon: 'grid_view',
        key: 'concurrency',
        label: 'Concurrency',
        render: (gd, tier) => {
          const display = `${gd.concurrentRequests || 1} Req`;
          const reqs = gd.concurrentRequests || 1;
          const slots = gd.batchSlots !== undefined ? gd.batchSlots : 0;
          return `
            <div class="sub-feature-row expandable-row" title="Hover to view breakdown">
              <div class="row-main-content">
                <span class="sub-feature-icon material-symbols-outlined">grid_view</span>
                <span class="sub-feature-label">Concurrency</span>
                <span class="sub-feature-value">${display}</span>
              </div>
              <div class="row-expanded-details">
                <div class="row-detail-item">
                  <span class="row-detail-label">· Concurrent Requests:</span>
                  <span class="row-detail-value">${reqs}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Batch Slots:</span>
                  <span class="row-detail-value">${slots}</span>
                </div>
              </div>
            </div>
          `;
        }
      },
      {
        icon: 'key',
        key: 'maxKeys',
        label: 'API keys',
        render: (gd, tier) => {
          const display = gd.maxKeys || '—';
          return `
            <div class="sub-feature-row">
              <span class="row-main-content" style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <span class="sub-feature-icon material-symbols-outlined">key</span>
                <span class="sub-feature-label">API keys</span>
                <span class="sub-feature-value" style="margin-left: auto; font-weight: 600;">${display}</span>
              </span>
            </div>
          `;
        }
      },
      {
        icon: 'psychology',
        key: 'modelAccess',
        label: 'Model Access',
        render: (gd, tier) => {
          const display = gd.modelAccess || '—';
          return `
            <div class="sub-feature-row">
              <span class="row-main-content" style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <span class="sub-feature-icon material-symbols-outlined">psychology</span>
                <span class="sub-feature-label">Model Access</span>
                <span class="sub-feature-value" style="margin-left: auto; font-weight: 600;">${display}</span>
              </span>
            </div>
          `;
        }
      },
      {
        icon: 'compress',
        key: 'compression',
        label: 'Compression',
        render: (gd, tier) => {
          const display = gd.compression === '✅' ? 'Yes' : 'No';
          return `
            <div class="sub-feature-row">
              <span class="row-main-content" style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <span class="sub-feature-icon material-symbols-outlined">compress</span>
                <span class="sub-feature-label">Compression</span>
                <span class="sub-feature-value" style="font-weight: 600;">${display}</span>
              </span>
            </div>
          `;
        }
      },
      {
        icon: 'replay',
        key: 'rollover',
        label: 'Rollover',
        render: (gd, tier) => {
          const hasRollover = gd.rolloverRate !== '0%' && gd.rolloverRate !== undefined;
          const display = hasRollover ? gd.rolloverRate : 'No';
          
          const rateVal = hasRollover ? `${gd.rolloverRate} of remaining` : '0%';
          const capVal = gd.rolloverCap || '—';

          return `
            <div class="sub-feature-row ${hasRollover ? 'expandable-row' : ''}" ${hasRollover ? 'title="Hover to view breakdown"' : ''}>
              <div class="row-main-content">
                <span class="sub-feature-icon material-symbols-outlined">replay</span>
                <span class="sub-feature-label">Rollover</span>
                <span class="sub-feature-value">${display}</span>
              </div>
              ${hasRollover ? `
              <div class="row-expanded-details">
                <div class="row-detail-item">
                  <span class="row-detail-label">· Monthly Rate:</span>
                  <span class="row-detail-value">${rateVal}</span>
                </div>
                <div class="row-detail-item">
                  <span class="row-detail-label">· Maximum Cap:</span>
                  <span class="row-detail-value">${capVal}</span>
                </div>
              </div>
              ` : ''}
            </div>
          `;
        }
      }
    ];

    const gridData = tier.grid || tier;
    const featuresHTML = FEATURES.map(f => f.render(gridData, tier)).join('');

    const cyclePrice = resolveCyclePrice(tier, DEMO_USER.cycle); // null | {price, isOverride, overrideUntil, standingPrice}
    const isNull = cyclePrice === null;
    const price = isNull ? null : cyclePrice.price;

    let priceHTML = '';
    let chooseBtnHTML = '';
    let overrideBadgeHTML = '';

    const tierOrder = ['free', 'basic', 'plus', 'pro', 'elite'];
    const currentIdx = tierOrder.indexOf(currentTier);
    const tierIdx = tierOrder.indexOf(tier.id);

    if (isNull) {
      const unavailableMsg = {
        quarterly: 'Not available quarterly',
        yearly: `${tier.name.replace(' Plan', '')} not available yearly`
      }[DEMO_USER.cycle] || 'Not available';

      priceHTML = `<span class="sub-price-unavailable">Not available</span>`;
      chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="tonal" disabled style="opacity:0.6;cursor:not-allowed;"><span slot="icon" class="material-symbols-outlined">lock</span>${unavailableMsg}</m3e-button>`;
    } else {
      const periodLabel = { monthly: '/mo', quarterly: '/3 mo', yearly: '/yr' }[DEMO_USER.cycle];

      let formattedPrice = '';
      if (price === 0) {
        formattedPrice = `<span class="sub-price-free">Free</span>`;
      } else {
        formattedPrice = currentCurrency === 'idr'
          ? `Rp ${formatNum(price)}`
          : `$${(price / 15000).toFixed(2)}`;
      }

      // Original price to slash: the standing cycle price when a limited-time
      // override is active, otherwise monthly × factor for quarterly/yearly.
      const hasDiscount = cyclePrice.isOverride || (DEMO_USER.cycle !== 'monthly' && cycleDiscountPercent(tier, DEMO_USER.cycle, price) > 0);
      if (hasDiscount) {
        const originalPrice = cyclePrice.isOverride ? cyclePrice.standingPrice : tier.cycles.monthly * (DEMO_USER.cycle === 'quarterly' ? 3 : 12);
        const formattedOriginal = currentCurrency === 'idr'
          ? `Rp ${formatNum(originalPrice)}`
          : `$${(originalPrice / 15000).toFixed(2)}`;

        priceHTML = `<span class="sub-plan-original-price">${formattedOriginal}</span><span class="sub-plan-now-price">${formattedPrice}</span><span class="sub-price-period">${periodLabel}</span>`;
      } else {
        priceHTML = price === 0
          ? formattedPrice
          : `<span class="sub-plan-now-price">${formattedPrice}</span><span class="sub-price-period">${periodLabel}</span>`;
      }

      if (cyclePrice.isOverride) {
        overrideBadgeHTML = `<div class="countdown-timer booster-timer-tag" data-until="${cyclePrice.overrideUntil}" style="margin:4px auto 0;"><span class="countdown-icon">⚡</span><span class="countdown-value"></span></div>`;
      }

      const isScheduledUpgrade = DEMO_USER.scheduledUpgrade && DEMO_USER.scheduledUpgrade.tierId === tier.id;
      const isScheduledDowngrade = DEMO_USER.scheduledDowngrade && DEMO_USER.scheduledDowngrade.tierId === tier.id;
      if (isCurrentTier) {
        chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="outlined" disabled style="--m3e-button-outline-color: var(--tier-accent); --m3e-button-disabled-label-text-color: var(--tier-accent) !important;"><span slot="icon" class="material-symbols-outlined">check</span>Current Plan</m3e-button>`;
      } else if (isScheduledUpgrade) {
        chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="tonal" onclick="openScheduledUpgradeActions('${tier.id}', '${DEMO_USER.scheduledUpgrade.cycle}')" style="cursor:pointer;"><span slot="icon" class="material-symbols-outlined">pending_actions</span>Scheduled</m3e-button>`;
      } else if (isScheduledDowngrade) {
        chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="tonal" onclick="openScheduledDowngradeActions('${tier.id}')" style="cursor:pointer;"><span slot="icon" class="material-symbols-outlined">pending_actions</span>Scheduled</m3e-button>`;
      } else if (tierIdx > currentIdx) {
        chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="filled" onclick="openSubscriptionPurchase('${tier.id}', '${DEMO_USER.cycle}')"><span slot="icon" class="material-symbols-outlined">upgrade</span>Upgrade</m3e-button>`;
      } else {
        chooseBtnHTML = `<m3e-button class="sub-plan-choose-btn" variant="outlined" onclick="openDowngradeOfferFlow('${tier.id}')"><span slot="icon" class="material-symbols-outlined">vertical_align_bottom</span>Downgrade</m3e-button>`;
      }
    }

    const currentBadgeHTML = isCurrentTier
      ? `<span class="current-badge sub-plan-current-badge">Current</span>`
      : '';

    // Determine price label display (with save badge if applicable)
    let ctaHTML = '';
    if (isNull) {
      ctaHTML = `
        <div class="sub-plan-price-chip" style="visibility: hidden;">Spacer</div>
        ${chooseBtnHTML}
      `;
    } else {
      let saveHTML = '';
      if (price > 0 && cyclePrice.isOverride) {
        const overridePct = overrideDiscountPercent(cyclePrice.standingPrice, price);
        saveHTML = `<span class="save-badge save-badge-flash">⚡ Limited${overridePct > 0 ? ` · Save ${overridePct}%` : ''}</span>`;
      } else if (price > 0) {
        const save = cycleDiscountPercent(tier, DEMO_USER.cycle, price);
        saveHTML = save > 0 ? `<span class="save-badge">Save ${save}%</span>` : '';
      }
      ctaHTML = `
        <div class="sub-plan-price-chip" style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">${priceHTML} ${saveHTML}</div>
        ${overrideBadgeHTML}
        ${chooseBtnHTML}
      `;
    }

    // Data-driven border/glow classes — admin-editable per tier, reusing the
    // exact same visual system as Booster Pack store cards.
    let visualClass = '';
    if (tier.hasBorder) visualClass += tier.borderAnimated ? ' card-animated-border' : ' card-with-border';
    if (tier.hasGlowing) {
      if (tier.glowAnimated) visualClass += ' card-glowing-animated';
      else if (tier.glowPulse) visualClass += ' card-glowing-pulse';
      else visualClass += ' card-glowing';
    }

    const bgColors = tier.bgColors || [];
    let bgStyleAttr = '';
    let bgAnimatedClass = '';
    if (tier.bgStyle === 'animated' && bgColors.length) {
      bgStyleAttr = `background: linear-gradient(135deg, ${bgColors[0]}, ${bgColors[1] || bgColors[0]}, ${bgColors[2] || bgColors[0]});`;
      bgAnimatedClass = ' bg-animated';
    } else if (tier.bgStyle === 'gradient' && bgColors.length) {
      bgStyleAttr = `background: linear-gradient(135deg, ${bgColors[0]}, ${bgColors[1] || bgColors[0]});`;
    } else if (tier.bgStyle === 'solid' && bgColors.length) {
      bgStyleAttr = `background: ${bgColors[0]};`;
    }
    const themeColorEnd = bgColors[1] || `var(--tier-color-${tier.id})`;

    let fallingShapesHTML = '';
    if (tier.id === 'pro' || tier.id === 'elite') {
      fallingShapesHTML = `
        <div class="falling-shapes-container">
          <m3e-shape name="flower" style="left: 10%; width: 14px; height: 14px; animation-delay: 0s;"></m3e-shape>
          <m3e-shape name="diamond" style="left: 30%; width: 10px; height: 10px; animation-delay: 2s;"></m3e-shape>
          <m3e-shape name="gem" style="left: 55%; width: 12px; height: 12px; animation-delay: 4s;"></m3e-shape>
          <m3e-shape name="heart" style="left: 75%; width: 10px; height: 10px; animation-delay: 1.5s;"></m3e-shape>
          <m3e-shape name="star" style="left: 90%; width: 12px; height: 12px; animation-delay: 3.5s;"></m3e-shape>
          <m3e-shape name="puffy" style="left: 20%; width: 15px; height: 15px; animation-delay: 5s;"></m3e-shape>
          <m3e-shape name="burst" style="left: 45%; width: 11px; height: 11px; animation-delay: 6.5s;"></m3e-shape>
          <m3e-shape name="sunny" style="left: 80%; width: 13px; height: 13px; animation-delay: 0.8s;"></m3e-shape>
        </div>
      `;
    }

    // Same rich tag system as booster packs (customTag: bg/border/text styles,
    // each independently solid/gradient/animated, plus glow).
    const tagBadgeHTML = renderCustomTagBadge(tier.customTag, null, '');

    const iconShape = SHAPE_CLASSES.includes(tier.iconShape) ? tier.iconShape : 'square';
    const iconInner = tier.iconEmoji
      ? `<span class="icon-emoji">${tier.iconEmoji}</span>`
      : `<span class="material-symbols-outlined" style="color:var(--tier-color-${tier.id});">${tier.icon}</span>`;

    return `
      <div class="subscription-plan-card stagger-item${visualClass}${bgAnimatedClass}" data-tier-id="${tier.id}" style="animation-delay:${['free','basic','plus','pro','elite'].indexOf(tier.id) * 60}ms; --plan-accent: var(--tier-color-${tier.id}); --pack-theme-color: var(--tier-color-${tier.id}); --pack-theme-color-end: ${themeColorEnd}; ${bgStyleAttr}">
        ${tier.hasBorder && tier.borderAnimated ? '<div class="card-border-wrapper"></div>' : ''}
        ${fallingShapesHTML}
        ${tagBadgeHTML ? `<div class="sub-plan-tag-row">${tagBadgeHTML}</div>` : ''}
        <div class="sub-plan-header">
          <div class="sub-plan-icon shape-${iconShape}" style="background:color-mix(in srgb, var(--tier-color-${tier.id}) 18%, transparent);">
            ${iconInner}
          </div>
          <div class="sub-plan-title">${tier.name}</div>
          ${currentBadgeHTML}
        </div>
        <div class="sub-plan-features">${featuresHTML}</div>
        <div class="sub-plan-cta">
          ${ctaHTML}
        </div>
      </div>
    `;
  }

  // ============================================================
  // DOWNGRADE OFFER FLOW
  // ============================================================
  // Applies a downgrade to `targetTierId` right now (no further prompts) —
  // shared by the "Downgrade Immediately" timing choice and the scheduled-
  // downgrade manage modal's "Downgrade Now" action.
  function applyDowngradeNow(targetTierId) {
    const targetTier = SUBSCRIPTION_TIERS.find(t => t.id === targetTierId);
    if (!targetTier) return;

    DEMO_USER.tier = targetTierId;
    DEMO_USER.chosenOffer = null;
    DEMO_USER.scheduledDowngrade = null;

    const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
    session.tier = targetTierId;
    session.scheduledDowngrade = null;
    localStorage.setItem('orchid_session', JSON.stringify(session));

    CREDITS.standard.current = targetTier.credits;
    CREDITS.standard.max = targetTier.credits;
    CREDITS.fast.current = 0;
    CREDITS.fast.max = 0;
    CREDITS.rollover.current = 0;

    syncBoosterPackTiers(targetTierId);
    showDowngradeEffect(targetTierId);

    applyTierAccent(targetTierId);
    renderMiniPlanCard();
    renderSubscriptionPlans();
    renderBoosterStore();
    if (typeof renderCreditsConsole === 'function') {
      renderCreditsConsole('credits-console-container');
      renderCreditsConsole('billing-credits-console-container');
    }
  }

  // Timing choice shown after a user skips/declines the retention offer —
  // mirrors the upgrade flow's "next cycle vs. immediately" choice.
  function showDowngradeTimingChoice(targetTierId, onBack) {
    const targetTier = SUBSCRIPTION_TIERS.find(t => t.id === targetTierId);
    const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    const formattedDate = formatRenewalDate(new Date(DEMO_USER.nextRenewal));
    const goBack = onBack || (() => openDowngradeOfferFlow(targetTierId));

    showDialog(`Downgrade to ${targetTier.name}`, 'vertical_align_bottom', `
      <p class="dialog-body" style="margin-bottom:12px;text-align:left;">Choose when your downgrade from <strong>${currentTier.name}</strong> to <strong>${targetTier.name}</strong> should take effect:</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;text-align:left;">
        <label style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="downgrade-timing-select" value="next_cycle" checked style="margin-top:2px;" />
          <div>
            <div style="font-weight:600;font-size:13px;color:var(--md-sys-color-primary);margin-bottom:4px;">Option A: Downgrade at Next Billing Cycle</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Keep your current <strong>${currentTier.name}</strong> credits, priority and features until <strong>${formattedDate}</strong>, then switch automatically.</div>
          </div>
        </label>
        <label style="background:rgba(216,27,96,0.04);border:1px solid rgba(216,27,96,0.15);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="downgrade-timing-select" value="immediate" style="margin-top:2px;" />
          <div>
            <div style="font-weight:600;font-size:13px;color:#ff3366;margin-bottom:4px;">Option B: Downgrade Immediately (Downgrade NOW)</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Takes effect immediately. <strong style="color:#ff3366;">⚠️ Warning:</strong> Remaining ${currentTier.name} credits and rollover will be lost. No refunds will be provided.</div>
          </div>
        </label>
      </div>
    `, [
      { label: 'Back', variant: 'text', action: () => { goBack(); } },
      { label: 'Confirm', variant: 'filled', action: () => {
        const selected = document.querySelector('input[name="downgrade-timing-select"]:checked')?.value;
        closeDialog();

        if (selected === 'next_cycle') {
          DEMO_USER.scheduledDowngrade = { tierId: targetTierId, date: DEMO_USER.nextRenewal };
          const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
          session.scheduledDowngrade = DEMO_USER.scheduledDowngrade;
          localStorage.setItem('orchid_session', JSON.stringify(session));

          showToast(`Downgrade to ${targetTier.name} scheduled for next cycle (${formattedDate})!`, 'info');
          renderMiniPlanCard();
          renderSubscriptionPlans();
        } else {
          applyDowngradeNow(targetTierId);
        }
      } }
    ]);
  }

  window.openScheduledDowngradeActions = function(tierId) {
    const tier = SUBSCRIPTION_TIERS.find(t => t.id === tierId);
    if (!tier) return;
    const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    const sched = DEMO_USER.scheduledDowngrade || { date: DEMO_USER.nextRenewal };
    const schedDateFormatted = formatRenewalDate(new Date(sched.date));

    showDialog('Manage Scheduled Downgrade', 'pending_actions', `
      <div style="text-align:left;color:var(--md-sys-color-on-surface);">
        <p style="margin-bottom:14px;font-size:13.5px;line-height:1.5;">
          You currently have a downgrade to <strong>${tier.name}</strong> scheduled for <strong>${schedDateFormatted}</strong>. Until then, you keep full <strong>${currentTier.name}</strong> access.
        </p>
      </div>
    `, [
      { label: 'Keep Current Plan', variant: 'text', action: () => {
        closeDialog();
        DEMO_USER.scheduledDowngrade = null;
        const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
        session.scheduledDowngrade = null;
        localStorage.setItem('orchid_session', JSON.stringify(session));
        showToast('Scheduled downgrade cancelled.', 'success');
        renderMiniPlanCard();
        renderSubscriptionPlans();
      } },
      { label: 'Downgrade Now', variant: 'filled', action: () => {
        closeDialog();
        applyDowngradeNow(tierId);
      } },
    ]);
  };

  window.openDowngradeOfferFlow = function(targetTierId) {
    const targetTier = SUBSCRIPTION_TIERS.find(t => t.id === targetTierId);
    const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    const offer = getRetentionOffer();

    let offerASelected = DEMO_USER.chosenOffer === 'A' ? 'checked' : '';
    let offerBSelected = DEMO_USER.chosenOffer === 'B' ? 'checked' : '';

    showDialog('Save Offer on ' + currentTier.name, 'warning', `
      <p class="dialog-body" style="margin-bottom:12px;color:var(--md-sys-color-on-surface);text-align:left;">Before you downgrade to the <strong>${targetTier.name}</strong>, keep your current plan and select one of our exclusive save offers:</p>

      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;text-align:left;">
        <label style="background:rgba(102,187,106,0.06);border:1px solid rgba(102,187,106,0.2);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="downgrade-offer-select" value="A" style="margin-top:2px;" ${offerASelected} />
          <div>
            <div style="font-weight:600;font-size:13px;color:#66BB6A;margin-bottom:4px;">Option A: ${offer.discountPercent}% Off Next Cycle</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Get a ${offer.discountPercent}% discount applied automatically to your next renewal.</div>
          </div>
        </label>
        <label style="background:rgba(102,187,106,0.06);border:1px solid rgba(102,187,106,0.2);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="downgrade-offer-select" value="B" style="margin-top:2px;" ${offerBSelected} />
          <div>
            <div style="font-weight:600;font-size:13px;color:#66BB6A;margin-bottom:4px;">Option B: ${formatNum(offer.bonusCredits)} Extra Credits</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Get an extra ${formatNum(offer.bonusCredits)} standard credits added automatically on your next renewal.</div>
          </div>
        </label>
      </div>
      <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 14px;font-size:11.5px;color:var(--md-sys-color-on-surface-variant);text-align:left;">
        Once chosen, the offer discount will be highlighted on your dashboard.
      </div>
      ${targetTierId === 'free'
        ? `<div style="background:rgba(216,27,96,0.04);border:1px solid rgba(216,27,96,0.15);border-radius:10px;padding:12px;font-size:11.5px;color:var(--md-sys-color-on-surface-variant);text-align:left;margin-top:12px;">
             <strong style="color:#ff3366;">⚠️ Warning:</strong> Reverting to the Free tier will <strong style="color:#ff3366;">permanently invalidate and remove</strong> all active booster packs.
           </div>`
        : `<div style="background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;font-size:11.5px;color:var(--md-sys-color-on-surface-variant);text-align:left;margin-top:12px;">
             <strong style="color:#F59E0B;">⚠️ Notice:</strong> Downgrading below the Pro tier will <strong style="color:#F59E0B;">lock</strong> all active booster packs. They will unlock when you upgrade back to Pro or higher.
           </div>`
      }
    `, [
      { label: targetTierId === 'free' ? 'Cancel Offer & Revert to Free' : 'Skip Offer', variant: 'text', action: () => {
        closeDialog();
        showDowngradeTimingChoice(targetTierId);
      } },
      { label: 'Accept Offer', variant: 'filled', action: () => {
        const selected = document.querySelector('input[name="downgrade-offer-select"]:checked')?.value;
        if (!selected) {
          showToast(targetTierId === 'free' ? 'Please select a save offer or choose Revert to Free.' : 'Please select a save offer or choose Skip Offer.', 'warning');
          return;
        }
        DEMO_USER.chosenOffer = selected;
        closeDialog();
        renderMiniPlanCard();
        renderSubscriptionPlans();

        if (selected === 'A') {
          showToast(`Save offer accepted! ${offer.discountPercent}% discount applied to your next billing cycle.`, 'success');
        } else {
          DEMO_USER.bonusCreditsNextCycle = offer.bonusCredits;
          showToast(`Save offer accepted! ${formatNum(offer.bonusCredits)} bonus credits will be added on your next billing cycle.`, 'success');
        }
      } }
    ]);
  };

  // ============================================================
  // MINI PLAN CARD
  // ============================================================
  function formatRenewalDate(date) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  function getRenewalDate(cycle) {
    const now = new Date();
    if (cycle === 'yearly') {
      now.setFullYear(now.getFullYear() + 1);
    } else if (cycle === 'quarterly') {
      now.setMonth(now.getMonth() + 3);
    } else {
      now.setMonth(now.getMonth() + 1);
    }
    return now;
  }

  function renderMiniPlanCard() {
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier) || SUBSCRIPTION_TIERS[0];
    const isFree = DEMO_USER.tier === 'free';
    
    // Update Badge
    const badgeTextEl = document.getElementById('plan-badge-text');
    if (badgeTextEl) {
      badgeTextEl.textContent = tierData.name.replace(' Plan', '').toUpperCase();
    }
    const badgeIconEl = document.querySelector('.plan-badge-inner .material-symbols-outlined');
    if (badgeIconEl) {
      badgeIconEl.textContent = tierData.icon;
    }
    
    // Update Title
    const titleEl = document.getElementById('card-title-text');
    if (titleEl) {
      titleEl.textContent = tierData.name;
    }

    // Update Description
    const descEl = document.getElementById('card-description-text');
    if (descEl) {
      descEl.textContent = tierData.tagline || '';
    }

    // Update Perks Container
    const perksContainer = document.getElementById('card-perks-container');
    if (perksContainer) {
      perksContainer.innerHTML = (tierData.perks || []).map(p => {
        let icon = 'check';
        if (p.includes('credit')) icon = 'toll';
        else if (p.includes('RPM')) icon = 'speed';
        else if (p.includes('API')) icon = 'key';
        else if (p.includes('queue') || p.includes('priority')) icon = 'bolt';
        else if (p.includes('model') || p.includes('support')) icon = 'psychology';
        
        return `
          <div class="plan-perk-chip">
            <span class="material-symbols-outlined">${icon}</span>
            <span>${p}</span>
          </div>
        `;
      }).join('');
    }

    // Update Right Billing Subcard
    const subcard = document.getElementById('billing-subcard');
    if (subcard) {
      let priceHTML = '';
      let billingCycleLabel = 'Billing';
      
      if (isFree) {
        priceHTML = 'Free';
        billingCycleLabel = 'Free Plan';
        subcard.innerHTML = `
          <div class="billing-subcard-header" style="align-items: center;">
            <span class="billing-cycle-title">${billingCycleLabel}</span>
            <span class="billing-price-value" style="font-size: 24px; color: var(--tier-accent);">${priceHTML}</span>
          </div>
          <div class="billing-subcard-divider"></div>
          <div class="billing-subcard-field">
            <span class="subcard-field-label">Next renewal</span>
            <span class="subcard-field-value">Never</span>
          </div>
          <div class="billing-subcard-field">
            <span class="subcard-field-label">Payment method</span>
            <span class="subcard-field-value">None</span>
          </div>
          <div class="billing-subcard-actions" style="margin-top: 10px;">
            <button class="subcard-action-btn primary" onclick="document.getElementById('subscription-plans-container').scrollIntoView({ behavior: 'smooth' })">
              Upgrade Plan
            </button>
          </div>
        `;
      } else {
        billingCycleLabel = { monthly: 'Monthly billing', quarterly: 'Quarterly billing', yearly: 'Yearly billing' }[DEMO_USER.cycle] || 'Billed cycle';
        
        let basePrice = tierData.cycles[DEMO_USER.cycle];
        if (basePrice === null || basePrice === undefined) {
          basePrice = tierData.cycles.monthly;
        }
        
        let priceStr = '';
        let promoLabelHTML = '';
        if (basePrice > 0) {
          const periodSuffix = { monthly: '/mo', quarterly: '/3 mo', yearly: '/yr' }[DEMO_USER.cycle] || '/mo';
          
          if (DEMO_USER.chosenOffer === 'A') {
            const originalPriceStr = currentCurrency === 'idr' ? `Rp ${formatNum(basePrice)}` : `$${(basePrice / 15000).toFixed(2)}`;
            const discountedPrice = basePrice * 0.7;
            const discountedPriceStr = currentCurrency === 'idr' ? `Rp ${formatNum(discountedPrice)}` : `$${(discountedPrice / 15000).toFixed(2)}`;
            
            priceStr = `<span style="text-decoration: line-through; opacity: 0.55; font-size: 13.5px; font-weight: normal; margin-right: 6px;">${originalPriceStr}</span><strong style="color: #66BB6A;">${discountedPriceStr}</strong><span style="font-size: 13px; font-weight: normal; opacity: 0.85;">${periodSuffix}</span>`;
            promoLabelHTML = `<div style="font-size: 10px; color: #66BB6A; font-weight: 700; margin-top: -8px; letter-spacing: 0.5px; text-transform: uppercase;">30% Save Offer Active</div>`;
          } else {
            const normalPriceStr = currentCurrency === 'idr' ? `Rp ${formatNum(basePrice)}` : `$${(basePrice / 15000).toFixed(2)}`;
            priceStr = `<strong>${normalPriceStr}</strong><span style="font-size: 13px; font-weight: normal; opacity: 0.85;">${periodSuffix}</span>`;
            
            if (DEMO_USER.chosenOffer === 'B') {
              promoLabelHTML = `<div style="font-size: 10px; color: #66BB6A; font-weight: 700; margin-top: -8px; letter-spacing: 0.5px; text-transform: uppercase;">+50K Credits Offer Active</div>`;
            }
          }
        } else {
          priceStr = 'Free';
        }
        
        if (DEMO_USER.scheduledUpgrade) {
          const sched = DEMO_USER.scheduledUpgrade;
          const targetTierData = SUBSCRIPTION_TIERS.find(t => t.id === sched.tierId);
          const schedDateFormatted = formatRenewalDate(new Date(sched.date));
          promoLabelHTML = `
            <div class="scheduled-upgrade-badge" onclick="openScheduledUpgradeActions('${sched.tierId}', '${sched.cycle}')" style="cursor: pointer; font-size: 11px; color: var(--tier-accent); font-weight: 700; margin-top: -8px; margin-bottom: 8px; padding: 6px 10px; background: color-mix(in srgb, var(--tier-accent) 8%, transparent); border: 1px dashed color-mix(in srgb, var(--tier-accent) 25%, transparent); border-radius: 6px; letter-spacing: 0.2px; text-transform: none; display: flex; align-items: center; gap: 6px; transition: background 0.2s ease, border-color 0.2s ease;" title="Click to manage scheduled upgrade">
              <span class="material-symbols-outlined" style="font-size:14px;">calendar_today</span>
              <span>Scheduled: Upgrade to ${targetTierData ? targetTierData.name : sched.tierId} on ${schedDateFormatted} (Manage)</span>
            </div>
          `;
        }
        
        const renewalDate = new Date(DEMO_USER.nextRenewal);
        const formattedDate = formatRenewalDate(renewalDate);
        
        subcard.innerHTML = `
          <div class="billing-subcard-header">
            <span class="billing-cycle-title">${billingCycleLabel}</span>
            <span class="billing-price-value">${priceStr}</span>
          </div>
          ${promoLabelHTML}
          <div class="billing-subcard-divider"></div>
          <div class="billing-subcard-field">
            <span class="subcard-field-label">Next renewal</span>
            <span class="subcard-field-value">${formattedDate}</span>
          </div>
          <div class="billing-subcard-field">
            <span class="subcard-field-label">Payment method</span>
            <span class="subcard-field-value highlight">Manual (admin)</span>
          </div>
          <div class="billing-subcard-actions">
            <button class="subcard-action-btn primary" onclick="document.getElementById('subscription-plans-container').scrollIntoView({ behavior: 'smooth' })">Change Plan</button>
            <button class="subcard-action-btn danger" onclick="triggerCancelFlow()">Cancel Plan</button>
          </div>
        `;
      }
    }
    
    applyTierAccent(DEMO_USER.tier);
  }

  // ============================================================
  // SUBSCRIPTION PURCHASE FLOW
  // ============================================================
  window.openSubscriptionPurchase = function(tierId, cycle) {
    const tier = SUBSCRIPTION_TIERS.find(t => t.id === tierId);
    if (!tier) return;
    const gridData = tier.grid || tier;
    const resolvedCycle = resolveCyclePrice(tier, cycle);
    if (resolvedCycle === null) return;
    const price = resolvedCycle.price;

    const cycleLabel = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[cycle];
    const periodLabel = cycle === 'quarterly' ? '3 months' : cycle === 'yearly' ? '12 months' : 'month';

    const priceStr = currentCurrency === 'idr'
      ? `Rp ${formatNum(price)} / ${periodLabel}`
      : `$${(price / 15000).toFixed(2)} / ${periodLabel}`;

    const oldTierId = DEMO_USER.tier;
    const tierOrder = ['free', 'basic', 'plus', 'pro', 'elite'];
    const oldIdx = tierOrder.indexOf(oldTierId);
    const newIdx = tierOrder.indexOf(tierId);

    // If upgrading from a paid plan (not free), show the 3-option timing selector modal first
    if (oldTierId !== 'free' && newIdx > oldIdx) {
      const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === oldTierId);
      const renewalDate = new Date(DEMO_USER.nextRenewal);
      const formattedDate = formatRenewalDate(renewalDate);

      showDialog(`Upgrade to ${tier.name}`, 'upgrade', `
        <p class="dialog-body" style="margin-bottom:12px;text-align:left;">You are currently on the <strong>${currentTier.name}</strong>. Choose how you want to upgrade to <strong>${tier.name}</strong>:</p>
        
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;text-align:left;">
          <label style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
            <input type="radio" name="upgrade-timing-select" value="next_cycle" checked style="margin-top:2px;" />
            <div>
              <div style="font-weight:600;font-size:13px;color:var(--md-sys-color-primary);margin-bottom:4px;">Option A: Upgrade at Next Billing Cycle</div>
              <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Upgrade will take effect automatically on <strong>${formattedDate}</strong>. You keep all your current plan's remaining credits and rollover.</div>
            </div>
          </label>
          <label style="background:rgba(216,27,96,0.04);border:1px solid rgba(216,27,96,0.15);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
            <input type="radio" name="upgrade-timing-select" value="immediate" style="margin-top:2px;" />
            <div>
              <div style="font-weight:600;font-size:13px;color:#ff3366;margin-bottom:4px;">Option B: Upgrade Immediately (Upgrade NOW)</div>
              <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">
                Upgrade takes effect immediately. 
                <strong style="color:#ff3366;">⚠️ Warning:</strong> Remaining ${currentTier.name} credits and rollover will be invalidated. Booster packs will port through. No refunds will be provided.
              </div>
            </div>
          </label>
        </div>
      `, [
        { label: 'Cancel', variant: 'text', action: 'close' },
        { label: 'Proceed', variant: 'filled', action: () => {
          const selected = document.querySelector('input[name="upgrade-timing-select"]:checked')?.value;
          closeDialog();

          if (selected === 'next_cycle') {
            // Schedule the upgrade
            DEMO_USER.scheduledUpgrade = { tierId, cycle, date: DEMO_USER.nextRenewal };
            
            // Save scheduled upgrade in session
            const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
            session.scheduledUpgrade = DEMO_USER.scheduledUpgrade;
            localStorage.setItem('orchid_session', JSON.stringify(session));

            showToast(`Upgrade to ${tier.name} scheduled for next cycle (${formattedDate})!`, 'success');
            renderMiniPlanCard();
            renderSubscriptionPlans();
          } else if (selected === 'immediate') {
            // Show the double confirmation "Make sure you are sure" dialog
            showImmediateUpgradeConfirmation(tier, cycle, priceStr);
          }
        }}
      ]);
      return;
    }

    // Otherwise, direct upgrade (e.g. from free or same-tier cycle change)
    const rolloverNote = DEMO_USER.tier === tierId
      ? `<div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--md-sys-color-on-surface-variant);display:flex;align-items:flex-start;gap:8px;">
           <span class="material-symbols-outlined" style="font-size:16px;color:#FFC107;flex-shrink:0;">warning</span>
           Changing billing cycle will reset your credit rollover balance.
         </div>`
      : '';

    showDialog(`Subscribe to ${tier.name}`, tier.icon, `
      <p class="dialog-body" style="margin-bottom:12px;text-align:left;">${tier.name} · <strong>${cycleLabel}</strong></p>
      ${rolloverNote}
      <div class="purchase-summary">
        <div class="purchase-row"><span>Standard Credits / mo</span><span>${formatNum(gridData.standardCredits)}</span></div>
        ${gridData.fastCredits ? `<div class="purchase-row"><span>Fast Credits / mo</span><span>${formatNum(gridData.fastCredits)}</span></div>` : ''}
        <div class="purchase-row"><span>RPM limit</span><span>${gridData.rpm}</span></div>
        <div class="purchase-row"><span>API keys</span><span>${gridData.maxKeys}</span></div>
        <div class="purchase-row"><span>Priority queue</span><span>${tier.fastTrack ? 'Yes' : 'No'}</span></div>
        <div class="purchase-row"><span>Billing cycle</span><span>${cycleLabel}</span></div>
        <div class="purchase-row total"><span>Total</span><span>${priceStr}</span></div>
      </div>
      <div style="margin-top:16px;padding:12px;background:rgba(102,187,106,0.08);border:1px solid rgba(102,187,106,0.2);border-radius:8px;font-size:12px;color:var(--md-sys-color-on-surface-variant);text-align:left;">
        <span class="material-symbols-outlined" style="font-size:14px;color:#66BB6A;vertical-align:middle;margin-right:4px;">info</span>
        Upgrade takes effect immediately · Downgrade applies at end of billing period
      </div>
    `, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: `Subscribe`, variant: 'filled', action: () => {
        closeDialog();
        
        const oldTier = DEMO_USER.tier;
        const targetTier = tierId;

        // Update DEMO_USER
        DEMO_USER.tier = targetTier;
        DEMO_USER.cycle = cycle;
        const nextRenewal = getRenewalDate(cycle);
        DEMO_USER.nextRenewal = nextRenewal.toISOString().split('T')[0];
        DEMO_USER.scheduledUpgrade = null; // Clear scheduled upgrade if upgrading immediately

        // Save session
        const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
        session.tier = targetTier;
        session.cycle = cycle;
        session.nextRenewal = DEMO_USER.nextRenewal;
        session.scheduledUpgrade = null;
        localStorage.setItem('orchid_session', JSON.stringify(session));

        // Update Credits
        CREDITS.standard.current = tier.credits;
        CREDITS.standard.max = tier.credits;
        CREDITS.fast.current = 0;
        CREDITS.fast.max = 0;
        CREDITS.rollover.current = 0;

        // Locks
        syncBoosterPackTiers(targetTier);

        // Trigger animations
        if (newIdx > oldIdx) {
          showUpgradeCelebration(targetTier, tier.credits);
        } else if (newIdx < oldIdx) {
          showDowngradeEffect(targetTier);
        } else {
          showToast(`Billing cycle updated to ${cycleLabel}!`, 'success');
        }

        applyTierAccent(targetTier);
        renderMiniPlanCard();
        renderSubscriptionPlans();
        renderBoosterStore();
      }},
    ]);
  };

  window.showImmediateUpgradeConfirmation = function(tier, cycle, priceStr) {
    const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    
    showDialog('Are you absolutely sure?', 'warning', `
      <div style="text-align:left;color:var(--md-sys-color-on-surface);">
        <p style="margin-bottom:14px;font-size:13.5px;line-height:1.5;">You are upgrading to the <strong>${tier.name}</strong> immediately. Please review the following terms carefully:</p>
        <ul style="margin: 0 0 16px 20px; padding: 0; font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; gap: 8px;">
          <li>Remaining credits from your current <strong>${currentTier.name}</strong> and any rollover credits will be <strong style="color:#ff3366;">permanently lost</strong>.</li>
          <li>Your active booster packs <strong style="color:#66BB6A;">will remain active</strong> and port through to the new plan.</li>
          <li><strong style="color:#ff3366;">No refunds</strong> or credits will be issued for the unused time of your current plan.</li>
        </ul>
        <div style="background:rgba(216,27,96,0.08);border:1px solid rgba(216,27,96,0.2);border-radius:8px;padding:12px;font-size:12.5px;line-height:1.4;">
          <strong>Final price:</strong> ${priceStr}<br/>
          By clicking "Confirm Upgrade", you agree to these conditions.
        </div>
      </div>
    `, [
      { label: 'Go Back', variant: 'text', action: () => {
        openSubscriptionPurchase(tier.id, cycle);
      } },
      { label: 'Confirm Upgrade', variant: 'filled', action: () => {
        closeDialog();
        
        const oldTier = DEMO_USER.tier;
        const targetTier = tier.id;
        const tierOrder = ['free', 'basic', 'plus', 'pro', 'elite'];
        const oldIdx = tierOrder.indexOf(oldTier);
        const newIdx = tierOrder.indexOf(targetTier);

        // Update DEMO_USER
        DEMO_USER.tier = targetTier;
        DEMO_USER.cycle = cycle;
        const nextRenewal = getRenewalDate(cycle);
        DEMO_USER.nextRenewal = nextRenewal.toISOString().split('T')[0];
        DEMO_USER.scheduledUpgrade = null; // Clear scheduled upgrade

        // Save session
        const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
        session.tier = targetTier;
        session.cycle = cycle;
        session.nextRenewal = DEMO_USER.nextRenewal;
        session.scheduledUpgrade = null;
        localStorage.setItem('orchid_session', JSON.stringify(session));

        // Update Credits
        CREDITS.standard.current = tier.credits;
        CREDITS.standard.max = tier.credits;
        CREDITS.fast.current = 0;
        CREDITS.fast.max = 0;
        CREDITS.rollover.current = 0;

        // Locks
        syncBoosterPackTiers(targetTier);

        // Trigger animations
        showUpgradeCelebration(targetTier, tier.credits);

        applyTierAccent(targetTier);
        renderMiniPlanCard();
        renderSubscriptionPlans();
        renderBoosterStore();
        if (typeof renderCreditsConsole === 'function') {
          renderCreditsConsole('credits-console-container');
          renderCreditsConsole('billing-credits-console-container');
        }
      }}
    ]);
  };

  window.openScheduledUpgradeActions = function(tierId, cycle) {
    const tier = SUBSCRIPTION_TIERS.find(t => t.id === tierId);
    if (!tier) return;
    const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    
    const sched = DEMO_USER.scheduledUpgrade || { date: DEMO_USER.nextRenewal };
    const schedDateFormatted = formatRenewalDate(new Date(sched.date));
    const price = (resolveCyclePrice(tier, cycle) || resolveCyclePrice(tier, 'monthly') || { price: 0 }).price;
    const periodLabel = cycle === 'quarterly' ? '3 months' : cycle === 'yearly' ? '12 months' : 'month';
    
    const priceStr = currentCurrency === 'idr'
      ? `Rp ${formatNum(price)} / ${periodLabel}`
      : `$${(price / 15000).toFixed(2)} / ${periodLabel}`;

    showDialog('Manage Scheduled Upgrade', 'pending_actions', `
      <div style="text-align:left;color:var(--md-sys-color-on-surface);">
        <p style="margin-bottom:14px;font-size:13.5px;line-height:1.5;">
          You currently have an upgrade to <strong>${tier.name}</strong> (${cycle.charAt(0).toUpperCase() + cycle.slice(1)}) scheduled for <strong>${schedDateFormatted}</strong>.
        </p>
        <p style="margin-bottom:14px;font-size:13px;color:var(--md-sys-color-on-surface-variant);line-height:1.5;">
          If you have run out of credits or need higher limits, you can upgrade instantly.
        </p>
        <div style="background:rgba(216,27,96,0.04);border:1px solid rgba(216,27,96,0.15);border-radius:10px;padding:12px;font-size:12.5px;line-height:1.45;margin-bottom:12px;">
          <div style="font-weight:600;color:#ff3366;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
            <span class="material-symbols-outlined" style="font-size:16px;">warning</span>
            Important Notice for Instant Upgrade
          </div>
          Remaining credits from your current <strong>${currentTier.name}</strong> and any rollover credits will be <strong style="color:#ff3366;">permanently lost</strong>. Active booster packs will remain active and port through.
        </div>
      </div>
    `, [
      { label: 'Close', variant: 'text', action: 'close' },
      { label: 'Upgrade Instantly', variant: 'filled', action: () => {
        closeDialog();
        
        const oldTier = DEMO_USER.tier;
        const targetTier = tier.id;
        const tierOrder = ['free', 'basic', 'plus', 'pro', 'elite'];
        const oldIdx = tierOrder.indexOf(oldTier);
        const newIdx = tierOrder.indexOf(targetTier);

        DEMO_USER.tier = targetTier;
        DEMO_USER.cycle = cycle;
        const nextRenewal = getRenewalDate(cycle);
        DEMO_USER.nextRenewal = nextRenewal.toISOString().split('T')[0];
        DEMO_USER.scheduledUpgrade = null;

        const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
        session.tier = targetTier;
        session.cycle = cycle;
        session.nextRenewal = DEMO_USER.nextRenewal;
        session.scheduledUpgrade = null;
        localStorage.setItem('orchid_session', JSON.stringify(session));

        CREDITS.standard.current = tier.credits;
        CREDITS.standard.max = tier.credits;
        CREDITS.fast.current = 0;
        CREDITS.fast.max = 0;
        CREDITS.rollover.current = 0;

        syncBoosterPackTiers(targetTier);

        showUpgradeCelebration(targetTier, tier.credits);

        applyTierAccent(targetTier);
        renderMiniPlanCard();
        renderSubscriptionPlans();
        renderBoosterStore();
        if (typeof renderCreditsConsole === 'function') {
          renderCreditsConsole('credits-console-container');
          renderCreditsConsole('billing-credits-console-container');
        }
      } }
    ]);
  };

  // ============================================================
  // MANAGE PLAN
  // ============================================================
  window.openManagePlan = function() {
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier) || SUBSCRIPTION_TIERS[0];
    showDialog('Manage Plan', tierData.icon, `
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:8px;text-align:left;">
        <div style="background:var(--md-sys-color-surface-container);border-radius:12px;padding:16px;">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${tierData.name}</div>
          <div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);">Current cycle: ${DEMO_USER.cycle}</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:16px;text-align:left;">
        Manage your subscription, update billing details, or cancel your plan from the billing portal.
      </p>
    `, [
      { label: 'Close', variant: 'text', action: 'close' },
      { label: 'Billing Portal', variant: 'filled', action: () => {
        closeDialog();
        showToast('Opening billing portal...', 'info');
      }},
    ]);
  };

  // ============================================================
  // CYCLE SELECTOR
  // ============================================================
  window.openCycleSelector = function() {
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier);
    if (!tierData) return;
    
    const availableCycles = Object.keys(tierData.cycles).filter(c => tierData.cycles[c] !== null && tierData.cycles[c] > 0);
    
    const cycleOptionsHtml = availableCycles.map(c => {
      const price = (resolveCyclePrice(tierData, c) || { price: tierData.cycles[c] }).price;
      const priceStr = currentCurrency === 'idr'
        ? `Rp ${formatNum(price)}`
        : `$${(price / 15000).toFixed(2)}`;
      const checked = c === DEMO_USER.cycle ? 'checked' : '';
      return `
        <label class="form-radio-row" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--md-sys-color-surface-container-high);border-radius:8px;margin-bottom:8px;cursor:pointer;">
          <input type="radio" name="cycle-select" value="${c}" ${checked} />
          <div style="flex:1;text-align:left;">
            <div style="font-weight:600;font-size:14px;color:var(--md-sys-color-on-surface);">${c.charAt(0).toUpperCase() + c.slice(1)}</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">${priceStr}</div>
          </div>
        </label>
      `;
    }).join('');

    showDialog('Change Billing Cycle', 'edit_calendar', `
      <p class="dialog-body" style="margin-bottom:12px;color:var(--md-sys-color-on-surface-variant);text-align:left;">Select your preferred billing cycle for <strong>${tierData.name}</strong>:</p>
      <div style="display:flex;flex-direction:column;margin-bottom:8px;">
        ${cycleOptionsHtml}
      </div>
      <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:8px;text-align:left;">
        Changing cycle resets rollover credits. The new cycle starts immediately.
      </div>
    `, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: 'Update Cycle', variant: 'filled', action: () => {
        const selected = document.querySelector('input[name="cycle-select"]:checked')?.value;
        if (selected) {
          closeDialog();
          const oldCycle = DEMO_USER.cycle;
          if (selected !== oldCycle) {
            if (CREDITS.rollover.current > 0) {
              CREDITS.rollover.current = 0;
            }
            DEMO_USER.cycle = selected;
            const newRenewal = getRenewalDate(selected);
            DEMO_USER.nextRenewal = newRenewal.toISOString().split('T')[0];
            
            // Save and re-render
            renderMiniPlanCard();
            renderSubscriptionPlans();
            
            showToast(`Billing cycle updated to ${selected}!`, 'success');
          }
        }
      }}
    ]);
  };

  // ============================================================
  // CANCELLATION FLOW & EXPIRE EFFECT
  // ============================================================
  window.triggerCancelFlow = function() {
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === DEMO_USER.tier) || SUBSCRIPTION_TIERS[0];
    const offer = getRetentionOffer();

    let offerASelected = DEMO_USER.chosenOffer === 'A' ? 'checked' : '';
    let offerBSelected = DEMO_USER.chosenOffer === 'B' ? 'checked' : '';

    showDialog('Cancel ' + tierData.name, 'warning', `
      <p class="dialog-body" style="margin-bottom:12px;color:var(--md-sys-color-on-surface);text-align:left;">Are you sure you want to cancel your <strong>${tierData.name}</strong> subscription?</p>
      <p class="dialog-body" style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:16px;text-align:left;">We would hate to see you go! If you stay with us today, we have special save offers for you:</p>

      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;text-align:left;">
        <label style="background:rgba(102,187,106,0.06);border:1px solid rgba(102,187,106,0.2);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="cancel-offer-select" value="A" style="margin-top:2px;" ${offerASelected} />
          <div>
            <div style="font-weight:600;font-size:13px;color:#66BB6A;margin-bottom:4px;">Option A: ${offer.discountPercent}% Off Next Cycle</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Get a ${offer.discountPercent}% discount applied automatically to your next renewal.</div>
          </div>
        </label>
        <label style="background:rgba(102,187,106,0.06);border:1px solid rgba(102,187,106,0.2);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
          <input type="radio" name="cancel-offer-select" value="B" style="margin-top:2px;" ${offerBSelected} />
          <div>
            <div style="font-weight:600;font-size:13px;color:#66BB6A;margin-bottom:4px;">Option B: ${formatNum(offer.bonusCredits)} Extra Credits</div>
            <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">Get an extra ${formatNum(offer.bonusCredits)} standard credits added automatically on your next renewal.</div>
          </div>
        </label>
      </div>
      <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 14px;font-size:11.5px;color:var(--md-sys-color-on-surface-variant);text-align:left;">
        If you accept an offer, it will update your dashboard price immediately. If you choose to cancel, you will revert to the Free tier.
      </div>
      <div style="background:rgba(216,27,96,0.04);border:1px solid rgba(216,27,96,0.15);border-radius:10px;padding:12px;font-size:11.5px;color:var(--md-sys-color-on-surface-variant);text-align:left;margin-top:12px;">
        <strong style="color:#ff3366;">⚠️ Warning:</strong> Reverting to the Free tier will <strong style="color:#ff3366;">permanently invalidate and remove</strong> all active booster packs.
      </div>
    `, [
      { label: 'Cancel Offer & Revert to Free', variant: 'text', action: () => {
        closeDialog();
        showDowngradeTimingChoice('free', () => triggerCancelFlow());
      } },
      { label: 'Accept Offer', variant: 'filled', action: () => {
        const selected = document.querySelector('input[name="cancel-offer-select"]:checked')?.value;
        if (!selected) {
          showToast('Please select a save offer or choose Revert to Free.', 'warning');
          return;
        }
        DEMO_USER.chosenOffer = selected;
        closeDialog();
        renderMiniPlanCard();
        renderSubscriptionPlans();

        if (selected === 'A') {
          showToast(`Save offer accepted! ${offer.discountPercent}% discount applied to your next billing cycle.`, 'success');
        } else {
          DEMO_USER.bonusCreditsNextCycle = offer.bonusCredits;
          showToast(`Save offer accepted! ${formatNum(offer.bonusCredits)} bonus credits will be added on your next billing cycle.`, 'success');
        }
      } }
    ]);
  };

  window.showExpireEffect = function() {
    const wash = document.createElement('div');
    wash.className = 'tier-wash-overlay tier-expire-wash';
    document.body.appendChild(wash);
    setTimeout(() => wash.remove(), 2000);

    document.body.classList.add('tier-expire-active');
    setTimeout(() => document.body.classList.remove('tier-expire-active'), 2000);

    const overlay = document.getElementById('tier-overlay');
    if (overlay) {
      const shapeEl = document.getElementById('tier-shape-animate');
      const creditsEl = document.getElementById('tier-credits-animate');
      const nameEl = document.getElementById('tier-name-animate');
      const particlesEl = document.getElementById('tier-particles');
      const closeBtn = document.getElementById('tier-overlay-close');

      overlay.hidden = false;
      [shapeEl, creditsEl, nameEl].forEach(el => el?.classList.remove('animate'));
      particlesEl.innerHTML = '';
      shapeEl.setAttribute('name', 'cloud_off'); 
      shapeEl.style.color = 'var(--tier-color-free)';
      creditsEl.textContent = '';
      nameEl.textContent = 'Subscription Expired';
      nameEl.style.color = 'var(--md-sys-color-error)';

      setTimeout(() => {
        shapeEl.classList.add('animate');
      }, 50);
      setTimeout(() => nameEl.classList.add('animate'), 300);

      setTimeout(() => {
        DEMO_USER.tier = 'free';
        applyTierAccent('free');
        renderMiniPlanCard();
        renderSubscriptionPlans();
        
        CREDITS.standard.current = 0;
        CREDITS.fast.current = 0;
        CREDITS.rollover.current = 0;
        
        renderCreditsConsole('credits-console-container');
        renderCreditsConsole('billing-credits-console-container');
        setTimeout(animateCreditsConsole, 100);

        const badgeTextEl = document.getElementById('plan-badge-text');
        if (badgeTextEl) badgeTextEl.textContent = 'EXPIRED';
      }, 400);

      const closeTimer = setTimeout(() => {
        overlay.hidden = true;
        shapeEl.style.color = '';
        nameEl.style.color = '';
        [shapeEl, creditsEl, nameEl].forEach(el => el?.classList.remove('animate'));
      }, 2000);

      if (closeBtn) {
        closeBtn.onclick = () => {
          clearTimeout(closeTimer);
          overlay.hidden = true;
          shapeEl.style.color = '';
          nameEl.style.color = '';
          [shapeEl, creditsEl, nameEl].forEach(el => el?.classList.remove('animate'));
        };
      }
    }

    showToast('Your subscription has ended — credits locked, free tier active', 'error');
  };


  // ============================================================
  // INIT BILLING SECTION
  // ============================================================
  function initBillingSection() {
    renderMiniPlanCard();
    renderSubscriptionPlans();
    renderBoosterStore();
    startCountdownTimer();
    syncAllM3EAttributes();

    // Booster category filter segmented button listener
    const boosterFilter = document.getElementById('booster-category-filter');
    if (boosterFilter) {
      boosterFilter.addEventListener('change', (e) => {
        const checkedSegment = Array.from(boosterFilter.querySelectorAll('m3e-button-segment')).find(seg => seg.checked || seg.hasAttribute('checked'));
        if (checkedSegment) {
          const category = checkedSegment.getAttribute('value') || 'all';
          currentBoosterCategory = category;
          renderBoosterStore();
        }
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window._billingInitialized = true; initBillingSection(); });
  } else {
    window._billingInitialized = true;
    initBillingSection();
  }

  const RECENT_ACTIVITY = [
    { model: 'Claude Haiku 4', endpoint: '/v1/chat/completions', status: 'success', credits: 12, time: '2 min ago' },
    { model: 'GPT-4o Mini', endpoint: '/v1/chat/completions', status: 'success', credits: 8, time: '15 min ago' },
    { 
      model: 'Claude Opus 4.5', 
      endpoint: '/v1/chat/completions', 
      status: 'success', 
      credits: 22, 
      time: '45 min ago',
      compression: {
        compressor: 'orchid-compress-pro',
        originalTokens: '245k',
        compressedTokens: '44k',
        savedPct: '82%'
      }
    },
    { model: 'DeepSeek V3', endpoint: '/v1/chat/completions', status: 'success', credits: 5, time: '1 hour ago' },
    { model: 'Claude Opus 4.5', endpoint: '/v1/chat/completions', status: 'fail', credits: 0, time: '2 hours ago' },
    { 
      model: 'GPT-4o', 
      endpoint: '/v1/chat/completions', 
      status: 'success', 
      credits: 14, 
      time: '3 hours ago',
      compression: {
        compressor: 'orchid-compress-lite',
        originalTokens: '110k',
        compressedTokens: '32k',
        savedPct: '71%',
        routedTo: 'Gemini 2.0 Flash'
      }
    },
    { model: 'Gemini 2.0 Flash', endpoint: '/v1/chat/completions', status: 'success', credits: 3, time: '4 hours ago' },
  ];

  const ANNOUNCEMENTS_SEED = [
    {
      id: 'a1', type: 'announcement', tone: 'warning',
      bannerTitle: 'Scheduled Platform & Database Maintenance & Optimization Operations Set for May 24th',
      title: 'Database Maintenance Coming',
      description: `We will be conducting scheduled database maintenance to optimize query performance and scale our clusters. Expect brief latency or temporary API errors during this period.

### Maintenance Window
- **Start Time**: May 24, 2026, at 02:00 UTC
- **End Time**: May 24, 2026, at 04:00 UTC
- **Estimated Duration**: 2 hours of intermittent scaling operations

### Expected Platform Impact
During this period, you may experience the following:
- Brief database latencies (up to 500ms) for dashboard actions
- Temporary API connection errors (\`503 Service Unavailable\`) for up to 5 minutes
- Temporary pauses in active sandbox environments

We apologize for the inconvenience and recommend scheduling critical workloads outside of this maintenance window. For real-time updates, visit our [Status Page](https://status.orchidllm.com).`,
      date: 'May 20, 2026', postedAt: '2026-05-20T10:00:00Z', lastEditedAt: '2026-05-20T14:30:00Z',
      isBanner: true, isBannerDismissible: true, relatedAnnouncementId: null,
      expiresAt: null, bannerExpiresAt: '2026-05-24T04:00:00Z',
    },
    {
      id: 'a2', type: 'changelog', tone: 'info',
      bannerTitle: 'DeepSeek R1 Reasoning Model Integration & Streaming Support is Now Fully Live on Standard Tier',
      title: 'DeepSeek R1 Model Integration',
      description: `DeepSeek R1 reasoning model is now fully integrated and available to all users on the Standard tier. It supports streaming, long-context reasoning, and advanced prompt execution with unmatched price-to-performance ratio.

### Key Integration Highlights
- **Advanced Reasoning**: Excels in math, code, and complex logical reasoning tasks.
- **Streaming Output**: Instant response generation with dynamic token tracking.
- **Cost Efficient**: High-end performance at an unmatched price-to-performance ratio.

### How to use DeepSeek R1
Simply update your model parameter to \`deepseek-r1\` or select it directly from the model dropdown in the playground.

\`\`\`javascript
const response = await orchid.chat.completions.create({
  model: "deepseek-r1",
  messages: [{ role: "user", content: "Solve for x: x^2 + 5x + 6 = 0" }]
});
\`\`\``,
      date: 'May 18, 2026', postedAt: '2026-05-18T09:00:00Z', lastEditedAt: null,
      version: 'v1.3.0', isBanner: true, isBannerDismissible: true, relatedAnnouncementId: null,
      expiresAt: null, bannerExpiresAt: null,
    },
    {
      id: 'a3', type: 'both', tone: 'success',
      bannerTitle: 'Per-Model Context Compression Pipeline Officially Live to Minimize Input Token Overheads & Costs',
      title: 'Compression Pipeline Available',
      description: `Our new automatic context compression pipeline is officially live! You can now configure compression settings per-model to intelligently summarize context histories, reduce input token overheads, and dramatically lower your API bills without losing critical conversation context.

### Features & Capabilities
- **Intelligent Summarization**: Automatically compresses past messages when context limits are reached.
- **Reduced Overhead**: Saves up to **80%** on input token costs without losing key context.
- **Granular Control**: Configure parameters per-model or per-request in the dashboard.

Try configuring it today under the **Settings** panel or see the API documentation for advanced details!`,
      date: 'May 15, 2026', postedAt: '2026-05-15T12:00:00Z', lastEditedAt: '2026-05-16T08:00:00Z',
      version: 'v1.2.0', isBanner: true, isBannerDismissible: false, relatedAnnouncementId: 'a4',
      expiresAt: null, bannerExpiresAt: null,
    },
    {
      id: 'a4', type: 'changelog', tone: 'changelog',
      title: 'Booster Pack Wallets Launched',
      description: `Split-fuel booster packs now support multiple independent credit wallets with unique priorities and model access configurations. Perfect for teams managing mixed development environments and allocating credit budgets flexibly.

### Key Features
- **Independent Wallets**: Create unique wallets for development, testing, and production.
- **Unique Priorities**: Set priority queues per wallet to manage task scheduling.
- **Flexible Credit Budgets**: Allocate credits dynamically based on team requirements.

See the booster pack page for more information.`,
      date: 'May 12, 2026', postedAt: '2026-05-12T16:00:00Z', lastEditedAt: null,
      version: 'v1.1.0', isBanner: false, isBannerDismissible: false, relatedAnnouncementId: null,
      expiresAt: null, bannerExpiresAt: null,
    },
  ];

  // Announcements authored in the admin panel are bridged here; fall back to
  // the seed set when nothing has been authored yet. Newest first.
  const ANNOUNCEMENTS = (window.OrchidShared
    ? OrchidShared.get(OrchidShared.KEYS.announcements, ANNOUNCEMENTS_SEED)
    : ANNOUNCEMENTS_SEED)
    .slice()
    .sort((a, b) => Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0));

  // An announcement soft-deletes (hidden everywhere, incl. the announcements
  // page) once `expiresAt` passes. `bannerExpiresAt` is narrower — it only
  // stops the *banner*; the announcement itself stays listed.
  function announcementActive(a) { return !a.expiresAt || Date.now() < Date.parse(a.expiresAt); }
  function bannerActive(a) {
    return !!a.isBanner && announcementActive(a) && (!a.bannerExpiresAt || Date.now() < Date.parse(a.bannerExpiresAt));
  }

  const REQUEST_HISTORY = [
    { time: 'May 20, 16:25', model: 'Claude Haiku 4', endpoint: '/v1/chat/completions', status: 'success', credits: 12 },
    { time: 'May 20, 16:10', model: 'GPT-4o Mini', endpoint: '/v1/chat/completions', status: 'success', credits: 8 },
    { 
      time: 'May 20, 15:45', 
      model: 'Claude Opus 4.5', 
      endpoint: '/v1/chat/completions', 
      status: 'success', 
      credits: 22,
      compression: {
        compressor: 'orchid-compress-pro',
        originalTokens: '245k',
        compressedTokens: '44k',
        savedPct: '82%'
      }
    },
    { time: 'May 20, 15:15', model: 'DeepSeek V3', endpoint: '/v1/chat/completions', status: 'success', credits: 5 },
    { time: 'May 20, 14:30', model: 'Claude Opus 4.5', endpoint: '/v1/chat/completions', status: 'fail', credits: 0 },
    { 
      time: 'May 20, 13:15', 
      model: 'GPT-4o', 
      endpoint: '/v1/chat/completions', 
      status: 'success', 
      credits: 14,
      compression: {
        compressor: 'orchid-compress-lite',
        originalTokens: '110k',
        compressedTokens: '32k',
        savedPct: '71%',
        routedTo: 'Gemini 2.0 Flash'
      }
    },
    { time: 'May 20, 12:05', model: 'Gemini Flash', endpoint: '/v1/chat/completions', status: 'success', credits: 3 },
    { time: 'May 19, 22:18', model: 'Llama 3.3 70B', endpoint: '/v1/chat/completions', status: 'success', credits: 4 },
    { time: 'May 19, 20:00', model: 'Claude Haiku 4', endpoint: '/v1/chat/completions', status: 'success', credits: 10 },
    { time: 'May 19, 18:30', model: 'GPT-4o', endpoint: '/v1/completions', status: 'success', credits: 15 },
  ];

  // Bridge: prepend this user's admin-published request logs (if any), mapped
  // to the local history shape, so the usage view reflects the shared log feed.
  if (window.OrchidShared) {
    const myName = session.username || 'vendouple';
    const shared = (OrchidShared.get(OrchidShared.KEYS.logs, []) || []).filter(r => r.user === myName);
    const mapped = shared.map(r => ({
      time: 'Today ' + r.time,
      model: r.model,
      endpoint: '/v1/chat/completions',
      status: r.status === 'error' ? 'fail' : 'success',
      credits: Math.round(r.credits) || 0,
    }));
    if (mapped.length) REQUEST_HISTORY.unshift(...mapped);
  }

  // Login & Account Event History (30 days)
  // type: 'login' | 'logout' | 'session_revoked' | 'auth_linked' | 'auth_unlinked' | 'email_changed' | 'username_changed' | 'key_created' | 'key_deleted'
  const ACCOUNT_HISTORY = [
    { time: 'May 21, 09:02', type: 'login',           device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'Signed in via GitHub',                      status: 'success' },
    { time: 'May 20, 23:47', type: 'logout',          device: 'Safari · iPhone',    location: 'Jakarta, ID',    detail: 'Session ended',                              status: 'neutral' },
    { time: 'May 20, 22:10', type: 'login',           device: 'Safari · iPhone',    location: 'Jakarta, ID',    detail: 'Signed in via GitHub',                      status: 'success' },
    { time: 'May 20, 14:33', type: 'session_revoked', device: 'Dashboard',          location: '—',              detail: 'Session revoked from Active Sessions panel',  status: 'warning' },
    { time: 'May 19, 19:05', type: 'login',           device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'Signed in via GitHub',                      status: 'success' },
    { time: 'May 18, 11:20', type: 'username_changed',device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'Username changed to @vendouple',             status: 'info' },
    { time: 'May 17, 08:44', type: 'login',           device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'Signed in via GitHub',                      status: 'success' },
    { time: 'May 16, 21:30', type: 'login',           device: 'Firefox · Windows', location: 'Surabaya, ID',   detail: 'Signed in via GitHub',                      status: 'success' },
    { time: 'May 15, 15:02', type: 'auth_linked',     device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'GitHub account linked',                     status: 'info' },
    { time: 'May 14, 10:11', type: 'login',           device: 'Chrome · Windows',  location: 'Jakarta, ID',    detail: 'First sign-in — account created',            status: 'success' },
  ];

  // ============================================================
  // TIER ACCENT — apply dynamic color
  // ============================================================
  document.documentElement.style.setProperty('--tier-accent', TIER_COLORS[TIER] || TIER_COLORS.free);
  document.documentElement.style.setProperty('--tier-gradient-end', TIER_GRADIENT_ENDS[TIER] || TIER_GRADIENT_ENDS.free);

  // ============================================================
  // POPULATE USER INFO
  // ============================================================
  const loginCount = getDailyLoginCount();
  const greeting = getGreetingForVisit(loginCount);
  const specialtyMsg = getSpecialtyMessage(USER.specialty);
  const loginMsg = getLoginMessage(loginCount);
  
  setText('welcome-greeting', `${greeting}, ${USER.display_name}`);
  
  const welcomeSub = document.querySelector('.welcome-sub');
  if (welcomeSub) {
    let subText = specialtyMsg;
    if (loginMsg) subText += ` ${loginMsg}`;
    welcomeSub.textContent = subText;
  }
  setText('tier-badge-label', USER.tierLabel);
  setText('nav-rail-avatar', USER.avatar_initial);
  setText('profile-avatar', USER.avatar_initial);
  setText('profile-name', USER.display_name);
  setText('profile-username', `@${USER.username}`);
  setText('profile-account-id', USER.account_id);

  const tierBadgeIcon = document.querySelector('#tier-badge .material-symbols-outlined');
  if (tierBadgeIcon) tierBadgeIcon.textContent = TIER_ICONS[TIER] || 'person';

  // Render dynamic welcome banner subscription status/upgrade badge
  const subStatusEl = document.getElementById('welcome-sub-status');
  if (subStatusEl) {
    if (USER.tier === 'free') {
      subStatusEl.innerHTML = `
        <m3e-button variant="tonal" size="small" onclick="switchSection('billing')">
          <span slot="icon" class="material-symbols-outlined">upgrade</span>
          Upgrade Plan
        </m3e-button>
      `;
    } else {
      subStatusEl.innerHTML = `
        <div class="welcome-sub-badge">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
          <span class="welcome-sub-badge-text">${USER.tierLabel} Plan &middot; 12 days remaining</span>
        </div>
      `;
    }
  }

  // ============================================================
  // CUSTOM PLAN HOVER TOOLTIPS & DEMO BANNER DISMISSAL
  // ============================================================
  const planHoverCard = document.createElement('div');
  planHoverCard.id = 'plan-hover-card';
  planHoverCard.className = 'plan-hover-card';
  document.body.appendChild(planHoverCard);

  function getPlanDetails(tier) {
    const details = {
      free: { name: 'Free Plan', price: '$0.00 / mo', cycle: 'N/A', nextBilling: 'N/A' },
      basic: { name: 'Basic Plan', price: '$9.99 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' },
      standard: { name: 'Standard Plan', price: '$15.00 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' },
      plus: { name: 'Plus Plan', price: '$29.99 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' },
      premium: { name: 'Premium Plan', price: '$49.99 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' },
      pro: { name: 'Pro Plan', price: '$99.99 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' },
      elite: { name: 'Elite Plan', price: '$199.99 / mo', cycle: 'Monthly', nextBilling: 'June 22, 2026' }
    };
    return details[tier] || details.free;
  }

  function showPlanCard(event, badge) {
    const details = getPlanDetails(USER.tier);
    planHoverCard.innerHTML = `
      <div class="plan-hover-card-header">
        <span class="material-symbols-outlined" style="color:var(--tier-accent)">diamond</span>
        <span class="plan-hover-card-title">${details.name}</span>
      </div>
      <div class="plan-hover-card-row">
        <span class="plan-hover-card-label">Price:</span>
        <span class="plan-hover-card-value">${details.price}</span>
      </div>
      <div class="plan-hover-card-row">
        <span class="plan-hover-card-label">Cycle:</span>
        <span class="plan-hover-card-value">${details.cycle}</span>
      </div>
      <div class="plan-hover-card-row">
        <span class="plan-hover-card-label">Next Billing:</span>
        <span class="plan-hover-card-value">${details.nextBilling}</span>
      </div>
      <div class="plan-hover-card-footer">
        Click to view billing details
      </div>
    `;

    planHoverCard.style.display = 'block';
    const rect = badge.getBoundingClientRect();
    
    const tooltipWidth = 260;
    let left = rect.left + (rect.width - tooltipWidth) / 2 + window.scrollX;
    let top = rect.bottom + 8 + window.scrollY;

    if (left + tooltipWidth > window.innerWidth) {
      left = window.innerWidth - tooltipWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    planHoverCard.style.left = left + 'px';
    planHoverCard.style.top = top + 'px';
  }

  function hidePlanCard() {
    planHoverCard.style.display = 'none';
  }

  function setupPlanTooltip(badge) {
    if (!badge) return;
    badge.addEventListener('mouseenter', (e) => showPlanCard(e, badge));
    badge.addEventListener('mouseleave', hidePlanCard);
    badge.addEventListener('click', () => {
      hidePlanCard();
      switchSection('billing');
    });
  }

  const tierBadge = document.getElementById('tier-badge');
  setupPlanTooltip(tierBadge);

  const welcomeSubBadge = document.querySelector('.welcome-sub-badge');
  if (welcomeSubBadge) {
    setupPlanTooltip(welcomeSubBadge);
  }


  // ============================================================
  // NAVIGATION
  // ============================================================
  const navItems = document.querySelectorAll('.nav-rail-item[data-section], .bottom-nav-item[data-section]');
  let currentSection = 'home';

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (section) switchSection(section);
    });
  });

  // Brand logo click to refresh dashboard (brings back to home)
  const brandLogo = document.getElementById('nav-rail-brand');
  if (brandLogo) {
    brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/Dashboard';
    });
  }

  window.switchSection = function(sectionName) {
    if (sectionName === currentSection) return;

    // Update nav items
    navItems.forEach(n => {
      n.classList.toggle('active', n.dataset.section === sectionName);
      // Toggle filled icon
      const icon = n.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.style.fontVariationSettings = n.dataset.section === sectionName ? "'FILL' 1" : "'FILL' 0";
      }
      // Toggle bottom indicator
      const ind = n.querySelector('.bottom-indicator');
      if (ind) ind.style.display = n.dataset.section === sectionName ? 'block' : 'none';
    });

    // Switch section visibility
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${sectionName}`);
    if (target) {
      target.classList.add('active');
      // Re-trigger animation
      target.style.animation = 'none';
      target.offsetHeight; // reflow
      target.style.animation = '';
    }

    // Update topbar title
    const titles = {
      home: 'Home', models: 'Models', apikeys: 'API Keys',
      billing: 'Billing & Credits', settings: 'Settings',
      account: 'Account', announcements: 'Announcements', usage: 'Usage'
    };
    setText('topbar-title', titles[sectionName] || sectionName);
    currentSection = sectionName;

    // Animate credits console if entering home or billing
    if (sectionName === 'home' || sectionName === 'billing') {
      setTimeout(animateCreditsConsole, 100);
    }

    // Lazy-init billing section content on first entry
    if (sectionName === 'billing') {
      if (!window._billingInitialized) {
        window._billingInitialized = true;
        initBillingSection();
      } else {
        const grid = document.getElementById('booster-grid');
        if (grid) {
          applyShowMoreLogic(grid);
        }
      }
    }
  };

  // ============================================================
  // CREDITS CONSOLE & ACTIVE PACKS
  // ============================================================
  function packCredits(p) {
    // Returns { current, max } for any pack (split-fuel or simple)
    if (p.isSplitFuel) {
      return {
        current: p.wallets.reduce((s, w) => s + w.creditsLeft, 0),
        max:     p.wallets.reduce((s, w) => s + w.creditsMax, 0),
      };
    }
    return {
      current: (p.creditsStandardLeft || 0) + (p.creditsFastLeft || 0),
      max:     (p.creditsStandardMax  || 0) + (p.creditsFastMax  || 0),
    };
  }

  function updateBoosterCreditsTotal() {
    let cur = 0, mx = 0;
    ACTIVE_PACKS.filter(p => !p.isLocked).forEach(p => {
      const t = packCredits(p); cur += t.current; mx += t.max;
    });
    CREDITS.booster.current = cur;
    CREDITS.booster.max = mx;
  }

  function renderCreditsConsole(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    updateBoosterCreditsTotal();

    const activeTier = DEMO_USER.tier;
    const tierData = SUBSCRIPTION_TIERS.find(t => t.id === activeTier) || SUBSCRIPTION_TIERS[0];
    
    // Define category-specific colors per tier (different but similar to tier accent)
    const catColors = {
      free: {
        standard: '#938f99',
        fast: '#b5b2bc',
        rollover: '#706e75'
      },
      basic: {
        standard: '#80cbc4',
        fast: '#4db6ac',
        rollover: '#00897b'
      },
      plus: {
        standard: '#b388ff',
        fast: '#8c9eff',
        rollover: '#7c4dff'
      },
      pro: {
        standard: '#ffd54f',
        fast: '#ffa726',
        rollover: '#ffe082'
      },
      elite: {
        standard: '#D946EF',
        fast: '#F43F5E',
        rollover: '#A21CAF'
      }
    };
    const tierColors = catColors[activeTier] || catColors.free;
    const barColor = tierData.accentColor;

    // Grand total includes only unlocked booster credits + base
    const totalCurrent = CREDITS.standard.current + CREDITS.fast.current + CREDITS.rollover.current + CREDITS.booster.current;
    const totalMax     = CREDITS.standard.max     + CREDITS.fast.max     + CREDITS.rollover.max     + CREDITS.booster.max;
    const totalPercentage = Math.round((totalCurrent / totalMax) * 100);
    const circumference = 2 * Math.PI * 50;

    // ── Base credit rows (compact, no expiry — subscription credits reset monthly) ──
    const standardPct = Math.round((CREDITS.standard.current / CREDITS.standard.max) * 100);
    const fastPct     = Math.round((CREDITS.fast.current     / CREDITS.fast.max)     * 100);
    const rolloverPct = Math.round((CREDITS.rollover.current / CREDITS.rollover.max) * 100);

    function baseCreditRow(cat, label, current, max, pct, color) {
      return `
        <div class="bcr" data-category="${cat}" style="--bar-color:${color};">
          <div class="bcr-label">
            <span class="bcr-dot" style="background:${color}"></span>
            <span class="bcr-name">${label}</span>
          </div>
          <div class="bcr-track"><div class="bcr-fill bar-fill" style="width:0%" data-pct="${pct}"></div></div>
          <span class="bcr-value">${formatNum(current)} / ${formatNum(max)}</span>
        </div>`;
    }

    // ── Booster pack cards ──
    const accessMap = {
      'premium+': { label: 'Premium+', cls: 'acc-pplus' },
      'premium':  { label: 'Premium',  cls: 'acc-prem'  },
      'standard': { label: 'Standard', cls: 'acc-std'   },
    };
    function accBadge(tier) {
      const v = accessMap[tier] || { label: tier, cls: '' };
      return `<span class="bpc-acc ${v.cls}">${v.label}</span>`;
    }
    function pBadge(priority, type) {
      if (!priority) return '';
      const cls = type === 'fast' ? 'pb-fast' : 'pb-std';
      return `<span class="bpc-prio ${cls}" title="Queue priority ${priority}/6">P${priority}</span>`;
    }
    function walletBar(w, packId) {
      const pct = Math.round((w.creditsLeft / w.creditsMax) * 100);
      const isFast = w.type === 'fast';
      return `
        <div class="bpc-wallet" data-wallet-color="${w.walletColor || '#888'}">
          <div class="bpcw-meta">
            <span class="bpcw-label${isFast ? ' wl-fast' : ''}">${ isFast ? '⚡' : '·'} ${w.label}</span>
            ${pBadge(w.queuePriority, w.type)}
            ${accBadge(w.modelAccess)}
          </div>
          <div class="bpcw-bar-row">
            <div class="bpcw-track"><div class="bpcw-fill bar-fill" style="width:0%;background:${w.walletColor || '#888'}" data-pct="${pct}"></div></div>
            <span class="bpcw-val">${formatNum(w.creditsLeft)} / ${formatNum(w.creditsMax)} cr</span>
          </div>
        </div>`;
    }

    const activePacks = ACTIVE_PACKS.filter(p => !p.isLocked);
    const lockedPacks  = ACTIVE_PACKS.filter(p => p.isLocked);
    const totalPackCount = ACTIVE_PACKS.length;
    const activePackCount = activePacks.length;

    function renderPackCard(p, idx) {
      const tot = packCredits(p);
      const totPct = tot.max > 0 ? Math.round((tot.current / tot.max) * 100) : 0;

      let walletsHtml = '';
      if (p.isSplitFuel) {
        walletsHtml = p.wallets.map(w => walletBar(w, p.id)).join('');
      } else {
        // Simple pack: show standard and/or fast bars
        if (p.creditsStandardMax > 0) {
          const pct = Math.round((p.creditsStandardLeft / p.creditsStandardMax) * 100);
          walletsHtml += `
            <div class="bpc-wallet" data-wallet-color="${p.color}">
              <div class="bpcw-meta">
                <span class="bpcw-label">· Standard</span>
                ${pBadge(p.queuePriorityStandard, 'standard')}
                ${accBadge(p.modelAccess)}
              </div>
              <div class="bpcw-bar-row">
                <div class="bpcw-track"><div class="bpcw-fill bar-fill" style="width:0%;background:${p.color}" data-pct="${pct}"></div></div>
                <span class="bpcw-val">${formatNum(p.creditsStandardLeft)} / ${formatNum(p.creditsStandardMax)} cr</span>
              </div>
            </div>`;
        }
        if (p.creditsFastMax > 0) {
          const fastPct2 = Math.round((p.creditsFastLeft / p.creditsFastMax) * 100);
          const fastColor = p.walletColor2 || p.color;
          walletsHtml += `
            <div class="bpc-wallet" data-wallet-color="${fastColor}">
              <div class="bpcw-meta">
                <span class="bpcw-label wl-fast">⚡ Fast</span>
                ${pBadge(p.queuePriorityFast, 'fast')}
                ${accBadge(p.modelAccess)}
              </div>
              <div class="bpcw-bar-row">
                <div class="bpcw-track"><div class="bpcw-fill bar-fill" style="width:0%;background:${fastColor}" data-pct="${fastPct2}"></div></div>
                <span class="bpcw-val">${formatNum(p.creditsFastLeft)} / ${formatNum(p.creditsFastMax)} cr</span>
              </div>
            </div>`;
        }
      }

      const splitBadge = p.isSplitFuel ? `<span class="bpc-badge-split">SPLIT</span>` : '';
      const lockBadge  = p.ignorePlanLock ? `<span class="bpc-badge-free">FREE-TIER</span>` : '';

      return `
        <div class="bpack-card" data-category="booster-pack" data-pack-idx="${idx}" style="--pack-color:${p.color}">
          <div class="bpack-header">
            <span class="bpack-dot" style="background:${p.color}"></span>
            <span class="bpack-name">${p.name}</span>
            ${splitBadge}${lockBadge}
            <span class="bpack-total">${formatNum(tot.current)} / ${formatNum(tot.max)} cr</span>
          </div>
          <div class="bpack-wallets">${walletsHtml}</div>
        </div>`;
    }

    function renderLockedCard(p) {
      const tot = packCredits(p);
      return `
        <div class="bpack-card bpack-locked">
          <div class="bpack-header">
            <span class="bpack-dot" style="background:${p.color};opacity:0.35"></span>
            <span class="bpack-name" style="opacity:0.45">${p.name}</span>
            <span class="bpc-badge-locked"><span class="material-symbols-outlined" style="font-size:11px">lock</span>LOCKED</span>
            <span class="bpack-total" style="opacity:0.4">${formatNum(tot.current)} cr preserved</span>
          </div>
          <div class="bpack-lock-notice">${p.lockedReason}</div>
        </div>`;
    }

    const activeCardsHtml = activePacks.map((p, i) => renderPackCard(p, ACTIVE_PACKS.indexOf(p))).join('');
    const lockedCardsHtml = lockedPacks.map(p => renderLockedCard(p)).join('');
    const boosterListHtml = (activeCardsHtml + lockedCardsHtml) || `
      <div class="booster-empty-state"><span class="material-symbols-outlined">flash_off</span>No active booster packs</div>`;

    container.innerHTML = `
      <div class="credits-console">
        <!-- TOP ROW: ring (left) + compact base credit bars (right) -->
        <div class="cc-top-row">
          <div class="cc-ring-panel">
            <svg viewBox="0 0 120 120" class="console-ring-svg">
              <defs>
                <linearGradient id="${containerId}-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="var(--tier-accent)" />
                  <stop offset="100%" stop-color="var(--tier-gradient-end, var(--tier-accent))" />
                </linearGradient>
                <filter id="${containerId}-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
                  <feColorMatrix in="blur" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6" result="glow"/>
                  <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <circle class="ring-track" cx="60" cy="60" r="50" stroke-width="9"></circle>
              <circle class="ring-fill" cx="60" cy="60" r="50" stroke-width="9"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference}"
                data-target="${circumference - (totalCurrent / totalMax) * circumference}"
                stroke="url(#${containerId}-gradient)" />
            </svg>
            <div class="cc-ring-text">
              <span class="ring-percentage">0%</span>
              <span class="ring-subtitle">TOTAL FUEL</span>
              <span class="ring-amount">${formatNum(totalCurrent)} / ${formatNum(totalMax)} cr</span>
            </div>
          </div>
          <div class="cc-base-credits">
            ${baseCreditRow('standard', 'Standard',   CREDITS.standard.current, CREDITS.standard.max, standardPct, tierColors.standard)}
            ${baseCreditRow('fast',     'Fast',        CREDITS.fast.current,     CREDITS.fast.max,     fastPct,     tierColors.fast)}
            ${baseCreditRow('rollover', 'Rollover',    CREDITS.rollover.current, CREDITS.rollover.max, rolloverPct, tierColors.rollover)}
          </div>
        </div>

        <!-- BOOSTER SECTION -->
        <div class="cc-booster-section">
          <div class="cc-booster-header">
            <span class="cc-booster-title">
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;font-variation-settings:'FILL' 1">flash_on</span>
              Active Booster Packs
            </span>
            <span class="cc-booster-meta">${formatNum(CREDITS.booster.current)} cr · ${activePackCount} active${lockedPacks.length > 0 ? ` · ${lockedPacks.length} locked` : ''}</span>
          </div>
          <div class="cc-booster-list" id="${containerId}-booster-list">
            ${boosterListHtml}
          </div>
        </div>
      </div>
    `;

    // ── Hover interactions ──
    const allHoverable = container.querySelectorAll('.bcr, .bpack-card:not(.bpack-locked)');
    const ringFill   = container.querySelector('.ring-fill');
    const pctEl      = container.querySelector('.ring-percentage');
    const subEl      = container.querySelector('.ring-subtitle');
    const amtEl      = container.querySelector('.ring-amount');
    const glowId     = `${containerId}-glow`;

    allHoverable.forEach(el => {
      el.addEventListener('mouseenter', () => {
        let cur = 0, mx = 1, name = '', color = '';
        const cat = el.dataset.category;

        if (cat === 'standard') {
          cur = CREDITS.standard.current; mx = CREDITS.standard.max;
          name = 'STANDARD'; color = tierColors.standard;
        } else if (cat === 'fast') {
          cur = CREDITS.fast.current; mx = CREDITS.fast.max;
          name = 'FAST'; color = tierColors.fast;
        } else if (cat === 'rollover') {
          cur = CREDITS.rollover.current; mx = CREDITS.rollover.max;
          name = 'ROLLOVER'; color = tierColors.rollover;
        } else if (cat === 'booster-pack') {
          const p = ACTIVE_PACKS[parseInt(el.dataset.packIdx)];
          if (p) { const t = packCredits(p); cur = t.current; mx = t.max; name = p.name.toUpperCase(); color = p.color; }
        }

        const pct = mx > 0 ? Math.round((cur / mx) * 100) : 0;
        allHoverable.forEach(e => e.classList.toggle('cc-dimmed', e !== el));
        el.classList.add('cc-highlighted');

        ringFill.style.stroke = color;
        ringFill.setAttribute('filter', `url(#${glowId})`);
        ringFill.style.strokeDashoffset = circumference - (cur / mx) * circumference;
        pctEl.textContent = `${pct}%`;
        subEl.textContent = name;
        amtEl.textContent = `${formatNum(cur)} / ${formatNum(mx)} cr`;
      });

      el.addEventListener('mouseleave', () => {
        allHoverable.forEach(e => { e.classList.remove('cc-dimmed'); e.classList.remove('cc-highlighted'); });
        ringFill.style.stroke = '';
        ringFill.removeAttribute('filter');
        ringFill.style.strokeDashoffset = circumference - (totalCurrent / totalMax) * circumference;
        pctEl.textContent = `${totalPercentage}%`;
        subEl.textContent = 'TOTAL FUEL';
        amtEl.textContent = `${formatNum(totalCurrent)} / ${formatNum(totalMax)} cr`;
      });
    });
  }

  renderCreditsConsole('credits-console-container');
  renderCreditsConsole('billing-credits-console-container');

  function animateCreditsConsole() {
    // Animate ring fill stroke-dashoffset
    document.querySelectorAll('.ring-fill').forEach(circle => {
      const target = parseFloat(circle.dataset.target);
      circle.style.strokeDashoffset = target;
    });

    // Animate horizontal progress bars from 0% to target%
    document.querySelectorAll('.bar-fill').forEach(bar => {
      const targetPct = parseFloat(bar.dataset.pct);
      bar.style.width = `${targetPct}%`;
    });

    // Animate the big percentage numbers in the centers of the rings
    document.querySelectorAll('.ring-percentage').forEach(el => {
      const parentContainer = el.closest('.credits-console');
      if (!parentContainer) return;
      
      const ringFill = parentContainer.querySelector('.ring-fill');
      if (!ringFill) return;
      
      const circumference = 2 * Math.PI * 50;
      const targetOffset = parseFloat(ringFill.dataset.target);
      const pct = Math.round(((circumference - targetOffset) / circumference) * 100);
      
      animateCounter(el, 0, pct, 1000, '%');
    });
  }

  function animateCounter(el, start, end, duration, suffix = '') {
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = formatNum(Math.round(start + (end - start) * eased)) + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Initial animation
  setTimeout(animateCreditsConsole, 300);

  // ============================================================
  // RECENT ACTIVITY
  // ============================================================
  const activityList = document.getElementById('activity-list');
  if (activityList) {
    activityList.innerHTML = RECENT_ACTIVITY.map((a, i) => {
      let compHtml = '';
      if (a.compression) {
        const c = a.compression;
        if (c.routedTo) {
          compHtml = `
            <div class="activity-compression-info">
              <div class="activity-compression-badge-row">
                <span class="activity-badge activity-badge-route">Routed</span>
              </div>
              <div class="activity-comp-text">
                Routed to <strong>${c.routedTo}</strong> (${c.originalTokens} → ${c.compressedTokens} via ${c.compressor})
              </div>
            </div>
          `;
        } else {
          compHtml = `
            <div class="activity-compression-info">
              <div class="activity-compression-badge-row">
                <span class="activity-badge activity-badge-comp">Compressed</span>
              </div>
              <div class="activity-comp-text">
                Compressed context ${c.originalTokens} → ${c.compressedTokens} (${c.savedPct} saved) via ${c.compressor}
              </div>
            </div>
          `;
        }
      }
      return `
        <div class="activity-item stagger-item" style="animation-delay:${i * 60}ms">
          <div class="activity-icon ${a.status === 'fail' ? 'error' : ''}">
            <span class="material-symbols-outlined">${a.status === 'success' ? 'check_circle' : 'error'}</span>
          </div>
          <div class="activity-details">
            <div class="activity-model">${a.model}</div>
            <div class="activity-meta">${a.endpoint} · ${a.time}</div>
            ${compHtml}
          </div>
          <div class="activity-cost">${a.credits > 0 ? `-${a.credits} cr` : 'No charge'}</div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // MODELS GRID
  // ============================================================
  const modelsGrid = document.getElementById('models-grid');
  const modelFilters = { provider: ['all'], tier: ['all'], cap: ['all'] };

  function hasTierAccess(tier) {
    return USER_TIER_RANK >= (TIER_RANK[tier] || TIER_RANK.free);
  }

  // The group a model needs at minimum (its cheapest band's requiredGroup).
  function modelBaseGroup(m) {
    const bands = resolveContextTiers(m);
    let best = bands[0] ? bands[0].requiredGroup : (m.group || 'free');
    bands.forEach(b => { if (groupRank(b.requiredGroup) < groupRank(best)) best = b.requiredGroup; });
    return best;
  }
  function modelCardMarkup(m, i) {
    const life = modelLifecycle(m);
    const baseGroup = modelBaseGroup(m);
    const isLocked = !hasGroupAccess(baseGroup);
    const upcoming = life === 'upcoming';
    const tierLabel = groupName(baseGroup).toUpperCase();
    let badge = '';
    if (upcoming) {
      badge = `<div class="mc-status-badge mc-upcoming"><span class="material-symbols-outlined">rocket_launch</span>SOON</div>`;
    } else if (isLocked) {
      badge = `<div class="mc-status-badge mc-locked"><span class="material-symbols-outlined">lock</span>${tierLabel}</div>`;
    } else if (deprecatingSoon(m)) {
      badge = `<div class="mc-status-badge mc-deprecating"><span class="material-symbols-outlined">schedule</span>DEPRECATING</div>`;
    }
    return `
        <div class="model-card ${isLocked ? 'locked' : 'unlocked'}${upcoming ? ' upcoming' : ''} stagger-item" style="animation-delay:${i * 40}ms" data-model="${m.id}" onclick="openModelDetail('${m.id}')">
          ${badge}
          <div class="model-card-top">
            <div class="model-maker-icon${isLocked ? ' mci-locked' : ''}">${makerLogoHtml(m)}</div>
            <div class="model-card-info">
              <div class="model-card-name">${m.name}</div>
              <div class="model-card-maker">${m.maker}</div>
            </div>
          </div>
          ${m.desc ? `<div class="model-card-desc">${m.desc}</div>` : ''}
          <div class="model-card-id" onclick="event.stopPropagation();copyToClipboard('${m.id}')">
            <code>${m.id}</code>
            <span class="material-symbols-outlined">content_copy</span>
          </div>
          <div class="model-card-caps">
            ${m.caps.slice(0, 4).map(c => `<span class="cap-chip"><span class="material-symbols-outlined">${capIcon(c)}</span>${capLabel(c)}</span>`).join('')}
            ${m.caps.length > 4 ? `<span class="cap-chip cap-chip-more">+${m.caps.length - 4}</span>` : ''}
          </div>
          <div class="model-card-footer">
            <span class="model-card-context-info">
              <span class="material-symbols-outlined">memory</span>
              ${m.context} context
            </span>
            <span class="model-card-endpoints-info">
              <span class="material-symbols-outlined">cable</span>
              ${m.endpoints} endpoints
            </span>
          </div>
        </div>`;
  }

  function renderModels(search = '') {
    const query = search.trim().toLowerCase();
    const filtered = visibleModels().filter(m => {
      const matchProvider = modelFilters.provider.includes('all') || modelFilters.provider.includes(m.makerSlug);
      const matchTier = modelFilters.tier.includes('all') || modelFilters.tier.includes(m.tier) || modelFilters.tier.includes(m.group);
      const matchCap = modelFilters.cap.includes('all') || modelFilters.cap.some(c => m.caps.includes(c));
      const matchSearch = !query || m.name.toLowerCase().includes(query) || m.maker.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
      return matchProvider && matchTier && matchCap && matchSearch;
    });

    // Group the cards under group headers (ordered by group.order).
    const groupsOrdered = MODEL_GROUPS.slice().sort((a, b) => a.order - b.order);
    let html = '';
    let idx = 0;
    groupsOrdered.forEach(g => {
      const inGroup = filtered.filter(m => (m.group || 'free') === g.id);
      if (!inGroup.length) return;
      const locked = !hasGroupAccess(g.id);
      html += `<div class="model-group-header${locked ? ' locked' : ''}">
        <span class="mgh-name">${g.name}</span>
        <span class="mgh-meta">${inGroup.length} model${inGroup.length > 1 ? 's' : ''}${locked ? ' · <span class="material-symbols-outlined">lock</span> requires upgrade' : ''}</span>
      </div>`;
      html += inGroup.map(m => modelCardMarkup(m, idx++)).join('');
    });
    // Any models whose group isn't in MODEL_GROUPS (defensive) go under "Other".
    const orphan = filtered.filter(m => !groupById(m.group || 'free'));
    if (orphan.length) {
      html += `<div class="model-group-header"><span class="mgh-name">Other</span><span class="mgh-meta">${orphan.length} model${orphan.length > 1 ? 's' : ''}</span></div>`;
      html += orphan.map(m => modelCardMarkup(m, idx++)).join('');
    }
    modelsGrid.innerHTML = html || `<div class="models-empty">No models match your filters.</div>`;
  }


  function capIcon(cap) { return (CAP_INFO[cap] && CAP_INFO[cap].icon) || 'check'; }
  function capLabel(cap) { return (CAP_INFO[cap] && CAP_INFO[cap].label) || cap; }

  // Active filters bar management helpers
  function updateActiveFiltersBar() {
    const bar = document.getElementById('active-filters-bar');
    const pillsContainer = document.getElementById('active-filters-pills');
    if (!bar || !pillsContainer) return;

    // Check if any filters are active (not 'all')
    const providerActive = modelFilters.provider.length > 0 && !modelFilters.provider.includes('all');
    const tierActive = modelFilters.tier.length > 0 && !modelFilters.tier.includes('all');
    const capActive = modelFilters.cap.length > 0 && !modelFilters.cap.includes('all');

    if (!providerActive && !tierActive && !capActive) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    pillsContainer.innerHTML = '';

    // Add provider pills
    if (providerActive) {
      modelFilters.provider.forEach(val => {
        const chipEl = document.querySelector(`#model-provider-filters m3e-filter-chip[data-filter="${val}"]`);
        const label = chipEl ? (chipEl.getAttribute('label') || chipEl.textContent.trim()) : val;
        pillsContainer.appendChild(createActiveFilterPill('provider', val, `Provider: ${label}`));
      });
    }

    // Add tier pills
    if (tierActive) {
      modelFilters.tier.forEach(val => {
        const chipEl = document.querySelector(`#model-tier-filters m3e-filter-chip[data-tier="${val}"]`);
        const label = chipEl ? (chipEl.getAttribute('label') || chipEl.textContent.trim()) : val;
        pillsContainer.appendChild(createActiveFilterPill('tier', val, `Tier: ${label}`));
      });
    }

    // Add cap pills
    if (capActive) {
      modelFilters.cap.forEach(val => {
        const chipEl = document.querySelector(`#model-cap-filters m3e-filter-chip[data-cap="${val}"]`);
        const label = chipEl ? (chipEl.getAttribute('label') || chipEl.textContent.trim()) : val;
        pillsContainer.appendChild(createActiveFilterPill('cap', val, `Capability: ${label}`));
      });
    }
  }

  function createActiveFilterPill(type, value, text) {
    const pill = document.createElement('div');
    pill.className = 'active-filter-pill';
    pill.innerHTML = `
      <span>${text}</span>
      <button class="active-filter-pill-remove" aria-label="Remove filter">
        <span class="material-symbols-outlined">close</span>
      </button>
    `;
    pill.querySelector('.active-filter-pill-remove').addEventListener('click', () => {
      removeFilterValue(type, value);
    });
    return pill;
  }

  function removeFilterValue(type, value) {
    if (type === 'provider') {
      modelFilters.provider = modelFilters.provider.filter(v => v !== value);
      if (modelFilters.provider.length === 0) modelFilters.provider = ['all'];
      const chip = document.querySelector(`#model-provider-filters m3e-filter-chip[data-filter="${value}"]`);
      if (chip) chip.selected = false;
      const allChip = document.querySelector('#model-provider-filters m3e-filter-chip[data-filter="all"]');
      if (modelFilters.provider.includes('all') && allChip) allChip.selected = true;
    } else if (type === 'tier') {
      modelFilters.tier = modelFilters.tier.filter(v => v !== value);
      if (modelFilters.tier.length === 0) modelFilters.tier = ['all'];
      const chip = document.querySelector(`#model-tier-filters m3e-filter-chip[data-tier="${value}"]`);
      if (chip) chip.selected = false;
      const allChip = document.querySelector('#model-tier-filters m3e-filter-chip[data-tier="all"]');
      if (modelFilters.tier.includes('all') && allChip) allChip.selected = true;
    } else if (type === 'cap') {
      modelFilters.cap = modelFilters.cap.filter(v => v !== value);
      if (modelFilters.cap.length === 0) modelFilters.cap = ['all'];
      const chip = document.querySelector(`#model-cap-filters m3e-filter-chip[data-cap="${value}"]`);
      if (chip) chip.selected = false;
      const allChip = document.querySelector('#model-cap-filters m3e-filter-chip[data-cap="all"]');
      if (modelFilters.cap.includes('all') && allChip) allChip.selected = true;
    }

    syncAllM3EAttributes();
    updateFilterBadge();
    updateActiveFiltersBar();
    renderModels(document.getElementById('model-search')?.value || '');
  }

  function resetAllFilters() {
    modelFilters.provider = ['all'];
    modelFilters.tier = ['all'];
    modelFilters.cap = ['all'];

    document.querySelectorAll('#model-provider-filters m3e-filter-chip').forEach(c => {
      c.selected = c.dataset.filter === 'all';
    });
    document.querySelectorAll('#model-tier-filters m3e-filter-chip').forEach(c => {
      c.selected = c.dataset.tier === 'all';
    });
    document.querySelectorAll('#model-cap-filters m3e-filter-chip').forEach(c => {
      c.selected = c.dataset.cap === 'all';
    });

    syncAllM3EAttributes();
    updateFilterBadge();
    updateActiveFiltersBar();
    renderModels(document.getElementById('model-search')?.value || '');
  }

  // Active filters badge helper
  function updateFilterBadge() {
    let count = 0;
    if (modelFilters.provider.length > 0 && !modelFilters.provider.includes('all')) count += modelFilters.provider.length;
    if (modelFilters.tier.length > 0 && !modelFilters.tier.includes('all')) count += modelFilters.tier.length;
    if (modelFilters.cap.length > 0 && !modelFilters.cap.includes('all')) count += modelFilters.cap.length;
    
    const badge = document.getElementById('filter-count-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // Bind Reset Buttons
  document.getElementById('active-filters-reset-btn')?.addEventListener('click', resetAllFilters);
  document.getElementById('filter-panel-reset-btn')?.addEventListener('click', resetAllFilters);

  // Helper to bind events and manage selections for M3 filter chips
  let isUpdatingFilter = false;
  function setupChipSetFilter(containerId, filterKey, datasetAttr) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const chips = container.querySelectorAll('m3e-filter-chip');
    const allChip = Array.from(chips).find(c => c.dataset[datasetAttr] === 'all');

    chips.forEach(chip => {
      chip.addEventListener('change', () => {
        if (isUpdatingFilter) return;
        isUpdatingFilter = true;

        try {
          const val = chip.dataset[datasetAttr] || 'all';
          const isSelected = chip.selected;

          if (val === 'all') {
            if (isSelected) {
              // Deselect all others
              chips.forEach(c => {
                if (c !== allChip) c.selected = false;
              });
              modelFilters[filterKey] = ['all'];
            } else {
              // Re-select all chip because we need at least one filter or "all"
              const othersSelected = Array.from(chips).some(c => c !== allChip && c.selected);
              if (!othersSelected) {
                allChip.selected = true;
                modelFilters[filterKey] = ['all'];
              }
            }
          } else {
            if (isSelected) {
              // Deselect "All"
              if (allChip) allChip.selected = false;
            }

            // Gather all selected
            const selectedVals = Array.from(chips)
              .filter(c => c.selected && c !== allChip)
              .map(c => c.dataset[datasetAttr]);

            if (selectedVals.length === 0) {
              if (allChip) allChip.selected = true;
              modelFilters[filterKey] = ['all'];
            } else {
              modelFilters[filterKey] = selectedVals;
            }
          }
        } finally {
          isUpdatingFilter = false;
        }

        syncAllM3EAttributes();
        updateFilterBadge();
        updateActiveFiltersBar();
        renderModels(document.getElementById('model-search')?.value || '');
      });
    });
  }

  // Setup filters
  setupChipSetFilter('model-provider-filters', 'provider', 'filter');
  setupChipSetFilter('model-tier-filters', 'tier', 'tier');
  setupChipSetFilter('model-cap-filters', 'cap', 'cap');

  updateFilterBadge();
  updateActiveFiltersBar();
  renderModels();

  // Collapsible Filters Panel Toggle
  const toggleBtn = document.getElementById('toggle-filters-btn');
  const filterPanel = document.getElementById('filter-panel');
  if (toggleBtn && filterPanel) {
    toggleBtn.addEventListener('click', () => {
      toggleBtn.classList.toggle('active');
      filterPanel.classList.toggle('active');
    });
  }

  // Model search
  document.getElementById('model-search')?.addEventListener('input', e => {
    renderModels(e.target.value);
  });


  // ============================================================
  // MODEL DETAIL SHEET
  // ============================================================
  // Get model settings from localStorage
  function getModelSettings(modelId) {
    const key = `orchid_model_settings_${modelId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    const defaultSettings = {};
    CONTEXT_TIERS.forEach(tier => {
      defaultSettings[tier.index] = {
        enabled: tier.index === 0 || tier.action !== 'error',
        action: tier.action,
        compressionModel: tier.compressionModel || '',
        promptSuffix: '',
      };
    });
    return defaultSettings;
  }

  function saveModelSettings(modelId, settings) {
    const key = `orchid_model_settings_${modelId}`;
    localStorage.setItem(key, JSON.stringify(settings));
  }

  function parseContextLimit(ctxStr) {
    if (ctxStr.endsWith('M')) return parseFloat(ctxStr) * 1000000;
    if (ctxStr.endsWith('k')) return parseFloat(ctxStr) * 1000;
    return parseFloat(ctxStr);
  }

  window.upgradePlan = function(planName) {
    const targetTier = planName.toLowerCase();
    
    showDialog(`Upgrade to ${planName}`, 'workspace_premium', `
      <p class="dialog-body" style="margin-bottom:12px;color:var(--md-sys-color-on-surface);text-align:left;">Are you sure you want to upgrade your plan to <strong>${planName}</strong>?</p>
      <p class="dialog-body" style="font-size:13px;color:var(--md-sys-color-on-surface-variant);text-align:left;">This will unlock the higher context window tiers and model access levels for your account.</p>
    `, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: 'Confirm Upgrade', variant: 'filled', action: () => {
        closeDialog();
        showDialog('Upgrading…', 'hourglass_top', `
          <div style="text-align:center;padding:24px 0;">
            <div style="width:48px;height:48px;border:3px solid var(--md-sys-color-outline-variant);border-top-color:var(--md-sys-color-primary);border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite;"></div>
            <p style="color:var(--md-sys-color-on-surface-variant);">Updating subscription status…</p>
          </div>
        `, []);

        setTimeout(() => {
          closeDialog();
          
          // Save new tier in local storage orchid_session
          const session = JSON.parse(localStorage.getItem('orchid_session') || '{}');
          session.tier = targetTier;
          localStorage.setItem('orchid_session', JSON.stringify(session));

          const tierData = SUBSCRIPTION_TIERS.find(t => t.id === targetTier) || SUBSCRIPTION_TIERS[0];
          
          // Trigger Upgrade celebration
          DEMO_USER.tier = targetTier;
          const nextRenewal = getRenewalDate(DEMO_USER.cycle);
          DEMO_USER.nextRenewal = nextRenewal.toISOString().split('T')[0];

          // Set credits
          CREDITS.standard.current = tierData.credits;
          CREDITS.standard.max = tierData.credits;
          CREDITS.fast.current = 0;
          CREDITS.fast.max = 0;
          CREDITS.rollover.current = 0;

          // Locks
          syncBoosterPackTiers(targetTier);

          showUpgradeCelebration(targetTier, tierData.credits);
          renderMiniPlanCard();
          renderSubscriptionPlans();
          renderBoosterStore();

          showToast(`Upgraded to ${planName} successfully!`, 'success');
        }, 1500);
      }}
    ]);
  };

  window.openModelDetail = function(modelId) {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;

    const overlay = document.getElementById('model-detail-overlay');
    const content = document.getElementById('sheet-content');

    const isLocked = !hasTierAccess(model.tier);
    const endpointRows = Array.from({ length: model.endpoints }, (_, i) => {
      const label = ENDPOINT_LABELS[i] || `endpoint-${i + 1}`;
      const caps = model.caps.slice(0, Math.max(1, model.caps.length - i)).join(', ');
      
      let speed = 90;
      let speedLabel = 'Fastest';
      let reqTier = 'free';

      if (i === 0) {
        speed = 90;
        speedLabel = 'Fastest';
        reqTier = 'standard';
      } else if (i === 1) {
        speed = 70;
        speedLabel = 'Fast';
        reqTier = 'standard';
      } else {
        speed = Math.max(10, 45 - (i - 2) * 10);
        speedLabel = 'Standard';
        reqTier = 'free';
      }

      const hasEpAccess = !isLocked && hasTierAccess(reqTier);

      const statusHtml = hasEpAccess ? 
        `<span class="ep-status active"><span class="material-symbols-outlined">check_circle</span>Active</span>` :
        `<span class="ep-status locked"><span class="material-symbols-outlined">lock</span>Paid Only</span>`;

      const rowClass = hasEpAccess ? '' : 'style="opacity: 0.65;"';

      return `
        <tr ${rowClass}>
          <td><strong>${label}</strong></td>
          <td><span class="speed-val">${speed}</span> <span class="speed-label" style="opacity:0.75;font-size:11px;">(${speedLabel})</span></td>
          <td>${statusHtml}</td>
          <td>${caps}</td>
        </tr>
      `;
    }).join('');

    const settings = getModelSettings(model.id);

    // Sanitize sequential enablement of context tiers
    let lastEnabled = true;
    for (let i = 0; i < 4; i++) {
      const tier = CONTEXT_TIERS[i];
      const modelMaxCtx = parseContextLimit(model.context);
      const tierMinToken = [0, 33000, 200000, 1000000][i];
      const isSupportedByModel = modelMaxCtx >= tierMinToken;
      const unlocked = !isLocked && isSupportedByModel;

      if (!settings[i]) {
        settings[i] = {
          enabled: unlocked && (i === 0 || tier.action !== 'error'),
          action: tier.action,
          compressionModel: tier.compressionModel || '',
          promptSuffix: '',
        };
      }

      if (!unlocked || !settings[i].enabled || !lastEnabled) {
        lastEnabled = false;
        settings[i].enabled = false;
        settings[i].action = 'error';
      }
    }
    saveModelSettings(model.id, settings);

    // Helper: build the cost comparison card for a compression model
    function buildCostCard(compModelId, tierIndex) {
      const tierMinToken = [0, 33000, 200000, 1000000][tierIndex];
      const comp = MODELS.find(m => m.id === compModelId);
      if (!comp) return '<div class="comp-cost-card comp-cost-empty">Select a model above to see cost comparison.</div>';
      const pIn = model.mIn, pOut = model.mOut;
      const cIn = comp.mIn, cOut = comp.mOut;
      const inDiff = Math.round(Math.abs(pIn - cIn) / pIn * 100);
      const outDiff = Math.round(Math.abs(pOut - cOut) / pOut * 100);
      const inCheaper = cIn <= pIn, outCheaper = cOut <= pOut;
      const ctxOk = parseContextLimit(comp.context) >= tierMinToken;
      return `
        <div class="comp-cost-card">
          <div class="ccc-header">
            <span class="ccc-model-name">${comp.icon} ${comp.name}</span>
            ${!ctxOk ? `<span class="ccc-ctx-warn"><span class="material-symbols-outlined">warning</span>Context: ${comp.context} — partial range</span>` : `<span class="ccc-ctx-ok"><span class="material-symbols-outlined">check_circle</span>Full context support</span>`}
          </div>
          <div class="ccc-rates">
            <div class="ccc-rate-row">
              <span class="ccc-rate-label">Input rate</span>
              <span class="ccc-rate-val ${inCheaper ? 'cheaper' : 'costlier'}">
                <span class="material-symbols-outlined">${inCheaper ? 'trending_down' : 'trending_up'}</span>
                ${cIn.toFixed(2)}x
                <span class="ccc-delta">${inCheaper ? '−' : '+'}${inDiff}% vs primary</span>
              </span>
            </div>
            <div class="ccc-rate-row">
              <span class="ccc-rate-label">Output rate</span>
              <span class="ccc-rate-val ${outCheaper ? 'cheaper' : 'costlier'}">
                <span class="material-symbols-outlined">${outCheaper ? 'trending_down' : 'trending_up'}</span>
                ${cOut.toFixed(2)}x
                <span class="ccc-delta">${outCheaper ? '−' : '+'}${outDiff}% vs primary</span>
              </span>
            </div>
          </div>
        </div>
      `;
    }

    const contextRows = CONTEXT_TIERS.map((tier, i) => {
      const modelMaxCtx = parseContextLimit(model.context);
      const tierMinToken = [0, 33000, 200000, 1000000][tier.index];
      const isSupportedByModel = modelMaxCtx >= tierMinToken;
      const unlocked = !isLocked && isSupportedByModel;

      const tierSettings = settings[tier.index] || {
        enabled: unlocked && (tier.index === 0 || tier.action !== 'error'),
        action: tier.action,
        compressionModel: tier.compressionModel || '',
        promptSuffix: '',
      };

      const enabled = unlocked && tierSettings.enabled;
      const action = tierSettings.action;
      const multiplier = TOKEN_MULTIPLIERS[i];

      // Default compression model: ensure it exists, is accessible, and fallback if needed
      // All models in dropdown — sorted: full support first, then partial, then cheaper first
      const sortedModels = [...MODELS].sort((a, b) => {
        const aFull = parseContextLimit(a.context) >= tierMinToken;
        const bFull = parseContextLimit(b.context) >= tierMinToken;
        if (aFull && !bFull) return -1;
        if (!aFull && bFull) return 1;
        return a.mIn - b.mIn;
      });

      let selectedCompressionModel = tierSettings.compressionModel;
      if (!selectedCompressionModel || !MODELS.find(m => m.id === selectedCompressionModel) || !hasTierAccess(MODELS.find(m => m.id === selectedCompressionModel).tier)) {
        const accessibleModels = sortedModels.filter(m => hasTierAccess(m.tier));
        const fullSupportAccessible = accessibleModels.filter(m => parseContextLimit(m.context) >= tierMinToken);
        selectedCompressionModel = fullSupportAccessible.length > 0 ? fullSupportAccessible[0].id : (accessibleModels.length > 0 ? accessibleModels[0].id : MODELS[0].id);
      }

      // Group models by tier for the dropdown optgroups
      const modelsByTier = {
        free: [],
        standard: [],
        premium: [],
        elite: []
      };
      sortedModels.forEach(em => {
        if (modelsByTier[em.tier]) {
          modelsByTier[em.tier].push(em);
        } else {
          modelsByTier.free.push(em); // fallback
        }
      });

      const allModelOptions = ['free', 'standard', 'premium', 'elite'].map(tierKey => {
        const tierModels = modelsByTier[tierKey];
        if (!tierModels || tierModels.length === 0) return '';
        
        const tierLabel = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
        const isTierLocked = !hasTierAccess(tierKey);
        const optgroupLabel = isTierLocked ? `${tierLabel} Tier (Locked)` : `${tierLabel} Tier`;
        
        const optionsHtml = tierModels.map(em => {
          const ctxOk = parseContextLimit(em.context) >= tierMinToken;
          const ctxLabel = ctxOk ? '' : ` (Max: ${em.context} ctx)`;
          const optionLocked = !hasTierAccess(em.tier);
          const selectedText = em.id === selectedCompressionModel ? 'selected' : '';
          const disabledText = optionLocked ? 'disabled' : '';
          const lockIcon = optionLocked ? ' 🔒' : '';
          
          return `<option value="${em.id}" ${selectedText} ${disabledText}>
            ${em.icon} ${em.name}${ctxLabel}${lockIcon}
          </option>`;
        }).join('');
        
        return `<optgroup label="${optgroupLabel}">${optionsHtml}</optgroup>`;
      }).join('');

      const compressionConfigBlock = unlocked ? `
        <div class="compression-config-block">
          <div class="ccb-section">
            <div class="ccb-label">
              <span class="material-symbols-outlined">psychology</span>
              Compression model
            </div>
            <select class="compression-select" data-tier-select="${tier.index}">
              ${allModelOptions}
            </select>
            <div class="comp-cost-card-wrap" id="cost-card-${model.id.replace(/[^a-z0-9]/g,'-')}-${tier.index}">
              ${buildCostCard(selectedCompressionModel, tier.index)}
            </div>
          </div>
          <div class="ccb-section ccb-prompt-section">
            <div class="ccb-label">
              <span class="material-symbols-outlined">admin_panel_settings</span>
              Base prompt
              <span class="ccb-locked-badge">admin · read only</span>
            </div>
            <div class="cpm-admin-text">${ADMIN_BASE_COMPRESSION_PROMPT}</div>
            <div class="ccb-label" style="margin-top:12px;">
              <span class="material-symbols-outlined">edit_note</span>
              Your additional instructions
            </div>
            <textarea class="cpm-textarea" data-tier-prompt="${tier.index}" placeholder="Appended after admin base prompt. Cannot remove admin lines.">${tierSettings.promptSuffix || ''}</textarea>
          </div>
        </div>
      ` : '';

      const actionLabels = {
        allow: 'Allow',
        compress: 'Compress',
        error: 'Block Request'
      };

      const actionButtons = ['allow', 'compress', 'error'].map(act => `
        <button class="budget-action-btn ${action === act ? 'active' : ''}" data-action="${act}" ${unlocked ? '' : 'disabled'}>${actionLabels[act] || act}</button>
      `).join('');

      const costPctInput  = multiplier.input  === '1.00x' ? '' : ` (+${Math.round((parseFloat(multiplier.input)  - 1) * 100)}% cost)`;
      const costPctOutput = multiplier.output === '1.00x' ? '' : ` (+${Math.round((parseFloat(multiplier.output) - 1) * 100)}% cost)`;

      const upgradeLink = (!unlocked && isSupportedByModel) ? `
        <m3e-button variant="text" size="small" onclick="closeModelDetail(); switchSection('billing');" style="margin-left:8px; --md-sys-typescale-body-font-size: 11px;">Upgrade</m3e-button>
      ` : '';

      let tierStateHtml = '';
      const switchDisabled = !unlocked;
      if (!isSupportedByModel) {
        tierStateHtml = `
          <span class="tier-state locked" style="background: color-mix(in srgb, var(--md-sys-color-error) 10%, transparent); color: var(--md-sys-color-error); border-color: color-mix(in srgb, var(--md-sys-color-error) 25%, transparent);">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1; font-size: 13px;">warning</span>
            Exceeds model limit (${model.context})
          </span>
        `;
      } else {
        tierStateHtml = `
          <span class="tier-state ${unlocked ? 'unlocked' : 'locked'}">
            <span class="material-symbols-outlined">${unlocked ? 'lock_open' : 'lock'}</span>
            ${unlocked ? 'Unlocked' : `${tier.requiredTier}+ required`}
          </span>
        `;
      }

      return `
        <div class="context-tier-row ${unlocked ? 'unlocked' : 'locked'} ${enabled ? 'active' : ''}" data-context-tier="${tier.index}" data-model-id="${model.id}">
          <div class="context-tier-main">
            <span class="context-tier-label">${tier.label}</span>
            <span class="context-tier-range">${tier.range}</span>
            ${tierStateHtml}
            ${upgradeLink}
          </div>
          <m3e-switch class="toggle-switch ${enabled ? 'active' : ''}" ${enabled ? 'checked' : ''} ${switchDisabled ? 'disabled' : ''} data-tier="${tier.index}"></m3e-switch>
          <div class="tier-config">
            <div class="budget-actions per-tier">${actionButtons}</div>
            ${compressionConfigBlock}
            <div class="tier-multipliers">
              Input ${multiplier.input}${costPctInput} · Output ${multiplier.output}${costPctOutput} · Cache read ${multiplier.cacheRead} · Cache write ${multiplier.cacheWrite}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Capability showcase — explains what the model can do.
    const capsShowcase = (model.caps || []).map(c => {
      const info = CAP_INFO[c] || { label: c, icon: 'check', desc: '' };
      return `<div class="cap-showcase-item">
        <span class="material-symbols-outlined">${info.icon}</span>
        <div class="cs-text"><div class="cs-label">${info.label}</div><div class="cs-desc">${info.desc}</div></div>
      </div>`;
    }).join('');

    // Per-model pricing & access bands (multipliers + which group unlocks each).
    const bands = resolveContextTiers(model);
    const pricingRows = bands.map((b, bi) => {
      const prevUpTo = bi === 0 ? 0 : bands[bi - 1].upTo;
      const rangeLabel = `${tokensToLabel(prevUpTo)}–${b.upTo == null ? '∞' : tokensToLabel(b.upTo)}`;
      const unlocked = hasGroupAccess(b.requiredGroup);
      const accessCell = unlocked
        ? `<span class="ep-status active"><span class="material-symbols-outlined">check_circle</span>${groupName(b.requiredGroup)}</span>`
        : `<span class="ep-status locked"><span class="material-symbols-outlined">lock</span>${groupName(b.requiredGroup)}</span>`;
      return `<tr class="${unlocked ? '' : 'band-locked'}">
        <td><strong>${rangeLabel}</strong></td>
        <td>${b.mIn}×</td><td>${b.mOut}×</td>
        <td>${b.cacheRead}×</td><td>${b.cacheWrite}×</td>
        <td>${accessCell}</td>
      </tr>`;
    }).join('');

    // Lifecycle badge for the header.
    const life = modelLifecycle(model);
    let lifeBadge = '';
    if (life === 'upcoming') {
      lifeBadge = `<span class="lifecycle-badge upcoming"><span class="material-symbols-outlined">rocket_launch</span>Launches ${fmtDate(model.launchAt)}</span>`;
    } else if (deprecatingSoon(model)) {
      lifeBadge = `<span class="lifecycle-badge deprecating"><span class="material-symbols-outlined">schedule</span>Deprecates ${fmtDate(model.deprecateAt)}</span>`;
    }

    content.innerHTML = `
      <!-- Sheet header -->
      <div class="sheet-header">
        <div class="sheet-model-icon${isLocked ? ' smi-locked' : ''}">${makerLogoHtml(model)}</div>
        <div class="sheet-header-info">
          <div class="sheet-model-name">${model.name}</div>
          <div class="sheet-model-maker-row">
            <span class="sheet-maker-label">${model.maker}</span>
            <span class="tier-access-badge ${model.tier}">${groupName(model.group).toUpperCase()}</span>
            ${lifeBadge}
            <button class="copy-model-id" onclick="copyToClipboard('${model.id}')">
              <code>${model.id}</code>
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </div>
          ${model.desc ? `<div class="sheet-model-desc">${model.desc}</div>` : ''}
        </div>
        <button class="sheet-close" onclick="closeModelDetail()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Capabilities showcase -->
      ${capsShowcase ? `<div class="sheet-section">
        <div class="sheet-section-title"><span class="material-symbols-outlined">auto_awesome</span>Capabilities</div>
        <div class="cap-showcase">${capsShowcase}</div>
      </div>` : ''}

      <!-- Pricing & Access by context band -->
      <div class="sheet-section">
        <div class="sheet-section-title"><span class="material-symbols-outlined">payments</span>Pricing &amp; Access <span class="section-hint">credit multipliers per context band</span></div>
        <table class="endpoint-table pricing-access-table">
          <thead><tr><th>Context (tokens)</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>Unlocks at</th></tr></thead>
          <tbody>${pricingRows}</tbody>
        </table>
      </div>

      ${isLocked ? `
        <!-- Locked model banner -->
        <div class="model-locked-banner">
          <div class="mlb-icon-wrap">
            <span class="material-symbols-outlined mlb-lock-icon">lock</span>
          </div>
          <div class="mlb-body">
            <div class="mlb-title">Locked for your current plan</div>
            <div class="mlb-desc">This model requires the <strong>${model.tier}</strong> plan or above. Configuration is shown for reference only.</div>
          </div>
          <m3e-button variant="filled" class="mlb-upgrade-btn" onclick="closeModelDetail(); switchSection('billing');">
            <span slot="icon" class="material-symbols-outlined">upgrade</span>
            Upgrade
          </m3e-button>
        </div>
      ` : ''}

      <!-- Endpoints section -->
      <div class="sheet-section">
        <div class="sheet-section-title">
          <span class="material-symbols-outlined">cable</span>
          Endpoints
        </div>
        <table class="endpoint-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Speed Rating</th>
              <th>Status</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>${endpointRows}</tbody>
        </table>
      </div>

      <!-- Context tiers section -->
      <div class="sheet-section">
        <div class="sheet-section-title">
          <span class="material-symbols-outlined">memory</span>
          Context Tiers
        </div>
        <div class="context-tiers">${contextRows}</div>
      </div>
    `;

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Wire up toggle switches in sheet (M3E)
    content.querySelectorAll('m3e-switch[data-tier]').forEach(t => {
      t.addEventListener('change', () => {
        if (t.disabled) return;
        const isActive = t.checked;
        const tierIdx = parseInt(t.dataset.tier);
        
        // Update local settings
        const settings = getModelSettings(model.id);
        
        if (isActive) {
          // Enable this tier and all lower tiers
          for (let i = 0; i <= tierIdx; i++) {
            const switchEl = content.querySelector(`m3e-switch[data-tier="${i}"]`);
            if (switchEl && !switchEl.disabled) {
              switchEl.checked = true;
              switchEl.classList.add('active');
              settings[i].enabled = true;
              
              if (settings[i].action === 'error' && i < 3) {
                settings[i].action = 'allow';
              }
              
              // Visual action buttons update
              const row = switchEl.closest('.context-tier-row');
              if (row) {
                row.classList.add('active');
                row.querySelectorAll('.budget-action-btn').forEach(btn => {
                  btn.classList.toggle('active', btn.dataset.action === settings[i].action);
                });
              }
            }
          }
          showToast(`${model.name} tiers up to ${CONTEXT_TIERS[tierIdx].label} are now enabled.`, 'success');
        } else {
          // Disable this tier and all higher tiers
          for (let i = tierIdx; i < 4; i++) {
            const switchEl = content.querySelector(`m3e-switch[data-tier="${i}"]`);
            if (switchEl) {
              switchEl.checked = false;
              switchEl.classList.remove('active');
              settings[i].enabled = false;
              settings[i].action = 'error';
              
              // Visual action buttons update
              const row = switchEl.closest('.context-tier-row');
              if (row) {
                row.classList.remove('active');
                row.querySelectorAll('.budget-action-btn').forEach(btn => {
                  btn.classList.toggle('active', btn.dataset.action === 'error');
                });
              }
            }
          }
          showToast(`${model.name} tiers from ${CONTEXT_TIERS[tierIdx].label} upwards are now disabled.`, 'success');
        }
        
        saveModelSettings(model.id, settings);
      });
    });

    // Wire up budget action buttons
    content.querySelectorAll('.budget-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const row = btn.closest('.context-tier-row');
        const tierIdx = parseInt(row.dataset.contextTier);
        const action = btn.dataset.action;

        const settings = getModelSettings(model.id);

        if (action === 'error') {
          // Setting action to 'error' (Block Request) disables this tier and all higher tiers!
          for (let i = tierIdx; i < 4; i++) {
            const switchEl = content.querySelector(`m3e-switch[data-tier="${i}"]`);
            if (switchEl) {
              switchEl.checked = false;
              switchEl.classList.remove('active');
              settings[i].enabled = false;
              settings[i].action = 'error';

              const r = switchEl.closest('.context-tier-row');
              if (r) {
                r.classList.remove('active');
                r.querySelectorAll('.budget-action-btn').forEach(b => {
                  b.classList.toggle('active', b.dataset.action === 'error');
                });
              }
            }
          }
          showToast(`${model.name} tiers from ${CONTEXT_TIERS[tierIdx].label} upwards are now blocked and disabled.`, 'success');
        } else {
          // Setting action to 'allow' or 'compress'
          row.querySelectorAll('.budget-action-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          settings[tierIdx].action = action;
          showToast(`${model.name} ${CONTEXT_TIERS[tierIdx].label} action set to ${action === 'compress' ? 'Compress' : 'Allow'}.`, 'success');
        }

        saveModelSettings(model.id, settings);
      });
    });

    // Wire up compression model select — update cost card live
    content.querySelectorAll('.compression-select').forEach(select => {
      select.addEventListener('change', () => {
        const row = select.closest('.context-tier-row');
        const tierIdx = parseInt(row.dataset.contextTier);
        const modelId = row.dataset.modelId;
        const val = select.value;

        // Update cost card
        const cardKey = `cost-card-${modelId.replace(/[^a-z0-9]/g,'-')}-${tierIdx}`;
        const cardWrap = document.getElementById(cardKey);
        if (cardWrap) {
          const tierMinToken = [0, 33000, 200000, 1000000][tierIdx];
          const comp = MODELS.find(m => m.id === val);
          if (comp) {
            const pIn = model.mIn, pOut = model.mOut;
            const cIn = comp.mIn, cOut = comp.mOut;
            const inDiff = Math.round(Math.abs(pIn - cIn) / pIn * 100);
            const outDiff = Math.round(Math.abs(pOut - cOut) / pOut * 100);
            const inCheaper = cIn <= pIn, outCheaper = cOut <= pOut;
            const ctxOk = parseContextLimit(comp.context) >= tierMinToken;
            cardWrap.innerHTML = `
              <div class="comp-cost-card">
                <div class="ccc-header">
                  <span class="ccc-model-name">${comp.icon} ${comp.name}</span>
                  ${!ctxOk ? `<span class="ccc-ctx-warn"><span class="material-symbols-outlined">warning</span>Context: ${comp.context} — partial range</span>` : `<span class="ccc-ctx-ok"><span class="material-symbols-outlined">check_circle</span>Full context support</span>`}
                </div>
                <div class="ccc-rates">
                  <div class="ccc-rate-row">
                    <span class="ccc-rate-label">Input rate</span>
                    <span class="ccc-rate-val ${inCheaper ? 'cheaper' : 'costlier'}">
                      <span class="material-symbols-outlined">${inCheaper ? 'trending_down' : 'trending_up'}</span>
                      ${cIn.toFixed(2)}x
                      <span class="ccc-delta">${inCheaper ? '−' : '+'}${inDiff}% vs primary</span>
                    </span>
                  </div>
                  <div class="ccc-rate-row">
                    <span class="ccc-rate-label">Output rate</span>
                    <span class="ccc-rate-val ${outCheaper ? 'cheaper' : 'costlier'}">
                      <span class="material-symbols-outlined">${outCheaper ? 'trending_down' : 'trending_up'}</span>
                      ${cOut.toFixed(2)}x
                      <span class="ccc-delta">${outCheaper ? '−' : '+'}${outDiff}% vs primary</span>
                    </span>
                  </div>
                </div>
              </div>
            `;
          }
        }

        const settings = getModelSettings(model.id);
        settings[tierIdx].compressionModel = val;
        saveModelSettings(model.id, settings);

        const comp = MODELS.find(m => m.id === val);
        showToast(`Compression model set to ${comp ? comp.name : val}.`, 'success');
      });
    });

    // Wire up prompt suffix textareas — debounced save
    content.querySelectorAll('.cpm-textarea').forEach(ta => {
      let debounce;
      ta.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const tierIdx = parseInt(ta.dataset.tierPrompt);
          const settings = getModelSettings(model.id);
          if (!settings[tierIdx]) settings[tierIdx] = {};
          settings[tierIdx].promptSuffix = ta.value;
          saveModelSettings(model.id, settings);
          showToast('Compression prompt saved.', 'success');
        }, 800);
      });
    });

    // Close on overlay click
    overlay.onclick = e => {
      if (e.target === overlay) closeModelDetail();
    };
  };


  window.closeModelDetail = function() {
    const overlay = document.getElementById('model-detail-overlay');
    const sheet = document.getElementById('model-detail-sheet');
    sheet.style.animation = 'none';
    sheet.style.transform = 'translateY(100%)';
    sheet.style.transition = 'transform 300ms cubic-bezier(0.3, 0, 0.8, 0.15)';
    setTimeout(() => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      sheet.style.animation = '';
      sheet.style.transform = '';
      sheet.style.transition = '';
    }, 300);
  };

  // ============================================================
  // API KEYS
  // ============================================================
  // ============================================================
  function renderApiKeys() {
    const list = document.getElementById('apikey-list');
    if (!list) return;

    list.innerHTML = API_KEYS.map((k, i) => {
      const isCardDisabled = k.status === 'disabled';
      const badgeText = isCardDisabled ? 'Paused' : 'Active';
      const metaItems = [];

      metaItems.push(`<span class="apikey-meta-item"><span class="material-symbols-outlined">schedule</span>Last used: ${k.lastUsed}</span>`);
      metaItems.push(`<span class="apikey-meta-item"><span class="material-symbols-outlined">toll</span>${formatNum(k.creditsUsed)} credits used</span>`);

      if (k.creditLimit) {
        const intervalLabel = k.limitInterval === 'lifetime' ? 'lifetime' :
                              k.limitInterval === 'daily' ? 'day' :
                              k.limitInterval === 'weekly' ? 'week' :
                              k.limitInterval === 'monthly' ? 'month' : '';
        const limitText = intervalLabel ? `${formatNum(k.creditLimit)}/${intervalLabel} limit` : `${formatNum(k.creditLimit)} limit`;
        metaItems.push(`<span class="apikey-meta-item"><span class="material-symbols-outlined">paid</span>${limitText}</span>`);
      }
      if (k.expiresAt) {
        metaItems.push(`<span class="apikey-meta-item"><span class="material-symbols-outlined">event</span>Expires: ${k.expiresAt}</span>`);
      }
      if (k.exposeBalance) {
        metaItems.push(`<span class="apikey-meta-item"><span class="material-symbols-outlined">account_balance_wallet</span>Exposes balance</span>`);
      }
      if (k.modelWhitelist && k.modelWhitelist.length > 0) {
        const allowedModelsText = k.modelWhitelist.map(id => {
          const m = MODELS.find(x => x.id === id);
          return m ? `${m.icon} ${m.name}` : id;
        }).join(', ');
        metaItems.push(`<span class="apikey-meta-item" title="${allowedModelsText}"><span class="material-symbols-outlined">psychology</span>${k.modelWhitelist.length} models allowed</span>`);
      }
      const tg = k.tokenGroup ? tokenGroupById(k.tokenGroup) : null;
      if (tg) {
        metaItems.push(`<span class="apikey-meta-item" title="Token group"><span class="material-symbols-outlined">workspaces</span>${tg.name} group</span>`);
      }
      if (k.rpm || k.tpm) {
        const rl = [k.rpm ? `${formatNum(k.rpm)} RPM` : null, k.tpm ? `${formatNum(k.tpm)} TPM` : null].filter(Boolean).join(' · ');
        metaItems.push(`<span class="apikey-meta-item" title="Rate limits"><span class="material-symbols-outlined">speed</span>${rl}</span>`);
      }

      return `
        <div class="apikey-card stagger-item ${isCardDisabled ? 'disabled' : ''}" style="animation-delay:${i * 80}ms" data-key-id="${k.id}">
          <div class="apikey-status-dot ${k.status}"></div>
          <div class="apikey-info">
            <div class="apikey-label" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
              <span class="apikey-label-text">${k.label}</span>
              <span class="apikey-status-badge ${k.status}">${badgeText}</span>
            </div>
            <div class="apikey-preview">${k.preview}</div>
            <div class="apikey-meta">
              ${metaItems.join('')}
            </div>
          </div>
          <div class="apikey-actions">
            <button class="apikey-action-btn" title="Edit permissions" onclick="editApiKey('${k.id}')"><span class="material-symbols-outlined">edit</span></button>
            <button class="apikey-action-btn" title="Rotate key" onclick="confirmAction('Rotate Key', 'Generate a new key value? The old key will be immediately invalidated.', () => showToast('Key rotated successfully', 'success'))"><span class="material-symbols-outlined">refresh</span></button>
            <button class="apikey-action-btn" title="${k.status === 'active' ? 'Disable' : 'Enable'}" onclick="toggleKeyStatus('${k.id}')"><span class="material-symbols-outlined">${k.status === 'active' ? 'pause' : 'play_arrow'}</span></button>
            <button class="apikey-action-btn danger" title="Delete key" onclick="confirmAction('Delete Key', 'Permanently delete this API key? This cannot be undone.', () => { API_KEYS.splice(API_KEYS.findIndex(x=>x.id==='${k.id}'),1); renderApiKeys(); showToast('Key deleted', 'success'); })"><span class="material-symbols-outlined">delete</span></button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderApiKeys();

  window.toggleKeyStatus = function(keyId) {
    const key = API_KEYS.find(k => k.id === keyId);
    if (key) {
      key.status = key.status === 'active' ? 'disabled' : 'active';
      renderApiKeys();
      showToast(`Key ${key.status === 'active' ? 'enabled' : 'disabled'}`, 'success');
    }
  };

  // Create key button
  document.getElementById('btn-create-key')?.addEventListener('click', () => {
    // Filter models based on tier accessibility
    const accessibleModels = MODELS.filter(m => hasTierAccess(m.tier));

    // Generate the whitelist options dynamically
    const modelOptionsHtml = accessibleModels.map(m => `
      <label class="model-whitelist-item">
        <input type="checkbox" value="${m.id}" class="model-whitelist-checkbox" />
        <span>${m.icon} ${m.name}</span>
      </label>
    `).join('');

    showDialog(
      'Create API Key',
      'key',
      `
        <div class="form-field">
          <label class="form-label">Key Label</label>
          <input class="form-input" type="text" placeholder="e.g. My App" id="new-key-label" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-field">
            <label class="form-label">Credit Limit</label>
            <input class="form-input" type="number" placeholder="Unlimited" id="new-key-credit-limit" />
          </div>
          <div class="form-field">
            <label class="form-label">Reset Interval</label>
            <select class="form-input" id="new-key-limit-interval">
              <option value="none">No Reset (Lifetime)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Expiration Date</label>
          <input class="form-input" type="date" id="new-key-expires" />
        </div>
        <div class="form-field">
          <label class="form-label">Model Whitelist (optional - defaults to all)</label>
          <div class="model-whitelist-selector">
            <div class="model-whitelist-grid">
              ${modelOptionsHtml}
            </div>
          </div>
        </div>
        <div class="form-field" style="display: flex; align-items: center; gap: 8px; margin-top: 16px;">
          <input type="checkbox" id="new-key-expose-balance" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--md-sys-color-primary);" />
          <label for="new-key-expose-balance" class="form-label" style="margin-bottom: 0; cursor: pointer; text-transform: none; font-size: 13px;">
            Expose credit balance to downstream requests
          </label>
        </div>
      `,
      [
        { label: 'Cancel', variant: 'text', action: 'close' },
        { label: 'Create', variant: 'filled', action: () => {
          const label = document.getElementById('new-key-label')?.value || 'New Key';
          const creditLimitVal = document.getElementById('new-key-credit-limit')?.value;
          const limitIntervalVal = document.getElementById('new-key-limit-interval')?.value;
          const expiresVal = document.getElementById('new-key-expires')?.value;
          const exposeBalance = document.getElementById('new-key-expose-balance')?.checked || false;
          
          const selectedModels = Array.from(document.querySelectorAll('.model-whitelist-checkbox:checked')).map(cb => cb.value);

          const creditLimit = creditLimitVal ? parseInt(creditLimitVal) : null;
          const limitInterval = limitIntervalVal === 'none' ? null : limitIntervalVal;
          const expiresAt = expiresVal || null;
          const modelWhitelist = selectedModels.length > 0 ? selectedModels : null;

          const newKey = 'sk-orch-' + randomId(32);

          // Show the key reveal
          showDialog('Your New API Key', 'key', `
            <p class="dialog-body" style="margin-bottom:8px;">Save this key now — it won't be shown again.</p>
            <div class="key-reveal">
              <span class="key-reveal-text" id="revealed-key">${newKey}</span>
              <button class="key-copy-btn" onclick="copyToClipboard('${newKey}')"><span class="material-symbols-outlined">content_copy</span></button>
            </div>
          `, [{ label: 'Done', variant: 'filled', action: () => {
            API_KEYS.push({
              id: 'k' + (API_KEYS.length + 1),
              label,
              preview: newKey.slice(0, 14) + '…' + newKey.slice(-4),
              status: 'active',
              created: 'Today',
              lastUsed: 'Never',
              creditsUsed: 0,
              creditLimit,
              limitInterval,
              expiresAt,
              exposeBalance,
              modelWhitelist
            });
            renderApiKeys();
            closeDialog();
            showToast('API key created', 'success');
          }}]);
        }},
      ]
    );
  });

  // Edit key button flow
  window.editApiKey = function(keyId) {
    const key = API_KEYS.find(k => k.id === keyId);
    if (!key) return;

    // Filter models based on tier accessibility
    const accessibleModels = MODELS.filter(m => hasTierAccess(m.tier));

    // Generate the whitelist options dynamically with current selections marked
    const modelOptionsHtml = accessibleModels.map(m => {
      const isChecked = key.modelWhitelist && key.modelWhitelist.includes(m.id) ? 'checked' : '';
      return `
        <label class="model-whitelist-item">
          <input type="checkbox" value="${m.id}" class="model-whitelist-checkbox" ${isChecked} />
          <span>${m.icon} ${m.name}</span>
        </label>
      `;
    }).join('');

    const limitIntervalVal = key.limitInterval || 'none';

    showDialog(
      'Edit API Key Permissions',
      'edit',
      `
        <div class="form-field">
          <label class="form-label">Key Label</label>
          <input class="form-input" type="text" value="${key.label}" id="edit-key-label" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-field">
            <label class="form-label">Credit Limit</label>
            <input class="form-input" type="number" placeholder="Unlimited" value="${key.creditLimit || ''}" id="edit-key-credit-limit" />
          </div>
          <div class="form-field">
            <label class="form-label">Reset Interval</label>
            <select class="form-input" id="edit-key-limit-interval">
              <option value="none" ${limitIntervalVal === 'none' ? 'selected' : ''}>No Reset (Lifetime)</option>
              <option value="daily" ${limitIntervalVal === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${limitIntervalVal === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${limitIntervalVal === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Expiration Date</label>
          <input class="form-input" type="date" value="${key.expiresAt || ''}" id="edit-key-expires" />
        </div>
        <div class="form-field">
          <label class="form-label">Model Whitelist (optional - defaults to all)</label>
          <div class="model-whitelist-selector">
            <div class="model-whitelist-grid">
              ${modelOptionsHtml}
            </div>
          </div>
        </div>
        <div class="form-field" style="display: flex; align-items: center; gap: 8px; margin-top: 16px;">
          <input type="checkbox" id="edit-key-expose-balance" ${key.exposeBalance ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--md-sys-color-primary);" />
          <label for="edit-key-expose-balance" class="form-label" style="margin-bottom: 0; cursor: pointer; text-transform: none; font-size: 13px;">
            Expose credit balance to downstream requests
          </label>
        </div>
      `,
      [
        { label: 'Cancel', variant: 'text', action: 'close' },
        { label: 'Save Changes', variant: 'filled', action: () => {
          const label = document.getElementById('edit-key-label')?.value || key.label;
          const creditLimitVal = document.getElementById('edit-key-credit-limit')?.value;
          const limitIntervalVal = document.getElementById('edit-key-limit-interval')?.value;
          const expiresVal = document.getElementById('edit-key-expires')?.value;
          const exposeBalance = document.getElementById('edit-key-expose-balance')?.checked || false;
          
          const selectedModels = Array.from(document.querySelectorAll('.model-whitelist-checkbox:checked')).map(cb => cb.value);

          key.label = label;
          key.creditLimit = creditLimitVal ? parseInt(creditLimitVal) : null;
          key.limitInterval = limitIntervalVal === 'none' ? null : limitIntervalVal;
          key.expiresAt = expiresVal || null;
          key.exposeBalance = exposeBalance;
          key.modelWhitelist = selectedModels.length > 0 ? selectedModels : null;

          renderApiKeys();
          closeDialog();
          showToast('API key permissions updated', 'success');
        }},
      ]
    );
  };


  // Currency toggle (M3E segmented button) using event delegation
  document.addEventListener('change', (e) => {
    const segBtn = e.target.closest('m3e-segmented-button.currency-toggle');
    if (!segBtn) return;
    const checkedSegment = segBtn.querySelector('m3e-button-segment[checked]');
    if (checkedSegment) {
      currentCurrency = checkedSegment.value;
      
      // Keep all currency toggles on the page in sync
      document.querySelectorAll('m3e-segmented-button.currency-toggle').forEach(btn => {
        btn.querySelectorAll('m3e-button-segment').forEach(seg => {
          if (seg.getAttribute('value') === currentCurrency) {
            seg.setAttribute('checked', '');
            seg.checked = true;
          } else {
            seg.removeAttribute('checked');
            seg.checked = false;
          }
        });
      });

      renderBoosterStore();
      renderSubscriptionPlans();
      if (typeof renderBillingSection === 'function') {
        renderBillingSection();
      }
    }
  });

  // ============================================================
  // PURCHASE FLOW
  // ============================================================
  window.openPurchaseFlow = function(packId) {
    const pack = BOOSTER_PACKS.find(p => p.id === packId);
    if (!pack) return;

    // Check purchase limit
    const purchaseCount = getPackPurchaseCount(pack);
    const hasLimit = pack.purchaseLimit !== null && pack.purchaseLimit !== undefined;
    if (hasLimit && purchaseCount >= pack.purchaseLimit) {
      showToast(`You have reached the purchase limit for ${pack.name}!`, 'error');
      return;
    }

    const price = currentCurrency === 'idr'
      ? `Rp ${formatNum(pack.priceIDR)}`
      : `$${pack.priceUSD.toFixed(2)}`;

    const creditDetails = pack.wallets.map(w => `
      <div class="purchase-row" style="font-weight:600; margin-top: 8px;"><span>${w.label} Credits</span><span>${formatNum(w.credits)}</span></div>
      <div class="purchase-row" style="font-size:12px; opacity:0.8; padding-left:12px;"><span>· Queue Priority</span><span>Priority ${w.priority} / 6</span></div>
      <div class="purchase-row" style="font-size:12px; opacity:0.8; padding-left:12px;"><span>· Model Access</span><span>${w.access.toUpperCase()} Tier</span></div>
    `).join('');

    const limitText = hasLimit 
      ? `Limit ${pack.purchaseLimit} per user (${purchaseCount}/${pack.purchaseLimit} bought)`
      : `Unlimited (${purchaseCount} bought)`;

    showDialog('Purchase Booster Pack', 'flash_on', `
      <p class="dialog-body">${pack.name}</p>
      <div class="purchase-summary">
        ${creditDetails}
        <div class="purchase-row"><span>Purchase Limit</span><span>${limitText}</span></div>
        <div class="purchase-row total" style="margin-top: 12px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;"><span>Total</span><span>${price}</span></div>
      </div>
      <div class="form-field">
        <label class="form-label">Referral Code (optional)</label>
        <input class="form-input" type="text" placeholder="Enter code" id="referral-code" />
      </div>
    `, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: `Pay ${price}`, variant: 'filled', action: () => {
        closeDialog();
        // Show success
        showDialog('Purchase Complete!', 'check_circle', `
          <div style="text-align:center;padding:16px 0;">
            <div style="width:64px;height:64px;border-radius:50%;background:rgba(102,187,106,0.12);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-outlined" style="font-size:36px;color:#66BB6A;font-variation-settings:'FILL' 1;">check_circle</span>
            </div>
            <p style="font-size:16px;font-weight:500;color:var(--md-sys-color-on-surface);margin-bottom:4px;">${pack.name} activated!</p>
            <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);">Credits have been added to your account.</p>
          </div>
        `, [{ label: 'Done', variant: 'filled', action: 'close' }]);

          // Add to active packs with wallets mapped
          const activePackWallets = pack.wallets.map(w => ({
            label: w.label,
            creditsLeft: w.credits,
            creditsMax: w.credits,
            queuePriority: w.priority,
            modelAccess: w.access === 'elite' ? 'premium+' : w.access,
            type: w.type,
            walletColor: w.color || (w.type === 'fast' ? '#EC4899' : '#A855F7')
          }));

          ACTIVE_PACKS.push({
            id: 'ap_' + Date.now(),
            name: pack.name,
            color: pack.bgColors ? pack.bgColors[0] : '#8B5CF6',
            isSplitFuel: true,
            wallets: activePackWallets,
            ignorePlanLock: false,
            isLocked: false,
            purchasedOnTier: DEMO_USER.tier
          });

          // Update booster credits and redraw console
          updateBoosterCreditsTotal();
          renderCreditsConsole('credits-console-container');
          renderCreditsConsole('billing-credits-console-container');
          setTimeout(animateCreditsConsole, 100);

          showToast(`${pack.name} purchased successfully!`, 'success');
      }},
    ]);
  };

  // ============================================================



  // ============================================================
  // ANNOUNCEMENTS
  // ============================================================
  const dismissed = JSON.parse(localStorage.getItem('orchid_dismissed_announcements') || '[]');
  const seen = JSON.parse(localStorage.getItem('orchid_seen_announcements') || '[]');

  // Helper: Strip markdown formatting for plain-text snippets
  function stripMarkdown(text) {
    if (!text) return '';
    let clean = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks entirely from snippet
      .replace(/`([^`]+)`/g, '$1')   // inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
      .replace(/\*([^*]+)\*/g, '$1')   // italic
      .replace(/^#+\s+/gm, '')        // headers
      .replace(/^[-*+]\s+/gm, '')     // list bullet indicators
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links [text](url) -> text
      .replace(/\n+/g, ' ');          // remove line breaks in snippet
    return clean.trim();
  }

  // Helper: Parse basic markdown to HTML for modal view
  function parseMarkdown(text) {
    if (!text) return '';
    
    // 1. Escape HTML initially to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Extract code blocks to avoid paragraph/list processing on them
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      const index = codeBlocks.length;
      codeBlocks.push(`<pre class="code-block ${lang ? 'lang-' + lang : ''}"><code>${code.trim()}</code></pre>`);
      return `\n===CODEBLOCK_PLACEHOLDER_${index}===\n`;
    });

    // 3. Parse headers: ### Title -> <h3>Title</h3>
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // 4. Split into lines and process paragraphs & lists
    let inList = false;
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      
      // Match list item
      const listMatch = line.match(/^[-*+]\s+(.*)$/);
      if (listMatch) {
        let content = listMatch[1];
        content = parseInlineMarkdown(content);
        if (!inList) {
          inList = true;
          return '<ul><li>' + content + '</li>';
        }
        return '<li>' + content + '</li>';
      }

      // If we were in a list, close it first
      let prefix = '';
      if (inList) {
        inList = false;
        prefix = '</ul>';
      }

      if (trimmed === '') {
        return prefix;
      }

      // Don't wrap headings or code block placeholders in <p>
      if (trimmed.startsWith('<h') || trimmed.startsWith('===CODEBLOCK_PLACEHOLDER_')) {
        return prefix + line;
      }

      // Normal paragraph
      return prefix + '<p>' + parseInlineMarkdown(line) + '</p>';
    });

    if (inList) {
      processedLines.push('</ul>');
    }

    html = processedLines.join('\n');

    // 5. Replace placeholders with the actual styled code blocks
    codeBlocks.forEach((block, index) => {
      html = html.replace(`===CODEBLOCK_PLACEHOLDER_${index}===`, block);
    });

    // Inline elements parser
    function parseInlineMarkdown(txt) {
      // Bold: **text** -> <strong>text</strong>
      txt = txt.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic: *text* -> <em>text</em>
      txt = txt.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Inline code: `code` -> <code>code</code>
      txt = txt.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      // Links: [text](url) -> <a href="$2" target="_blank" class="announcement-link">$1<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-left:4px;">open_in_new</span></a>
      txt = txt.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="announcement-link">$1<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-left:4px;">open_in_new</span></a>');
      return txt;
    }

    return html;
  }

  function getRelativeTime(isoDate) {
    if (!isoDate) return '';
    const now = new Date();
    const then = new Date(isoDate);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHrs < 24) return `${diffHrs} hr${diffHrs > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  }

  function renderAnnouncements(filter = 'all') {
    const list = document.getElementById('announcement-list');
    if (!list) return;

    const filtered = ANNOUNCEMENTS.filter(a => {
      if (!announcementActive(a)) return false;
      if (filter === 'all') return true;
      return a.type === filter || a.type === 'both';
    });

    list.innerHTML = filtered.map((a, i) => {
      const isSeen = seen.includes(a.id);
      const toneClass = a.tone || 'info';
      const versionChip = a.version ? `<span class="version-chip">${a.version}</span>` : '';
      const typeLabel = a.type === 'both' ? 'Announcement + Changelog' : a.type;
      const typeClass = a.type === 'changelog' || a.type === 'both' ? 'changelog-type' : 'announcement-type';
      const relativeTimeSrc = a.lastEditedAt || a.postedAt;
      const relativeTimeStr = getRelativeTime(relativeTimeSrc);
      const lastEditedStr = a.lastEditedAt ? `Last edited ${getRelativeTime(a.lastEditedAt)}` : null;
      const lastEditedHtml = lastEditedStr ? `<span class="announcement-last-edited">&nbsp;&middot;&nbsp;${lastEditedStr}</span>` : '';
      const crossLink = getCrossLinkHtml(a);

      const cleanSnippet = stripMarkdown(a.description);
      const truncated = cleanSnippet.length > 150 ? cleanSnippet.slice(0, 150) + '...' : cleanSnippet;

      return `
        <div class="announcement-card ${toneClass} stagger-item ${isSeen ? 'seen' : 'unseen'}" 
             style="animation-delay:${i * 60}ms" 
             data-announcement-id="${a.id}"
             onclick="openAnnouncementModal('${a.id}', this, event)">
          <div class="announcement-header">
            <div class="announcement-title-row">
              <span class="unseen-dot"></span>
              <div class="announcement-title">${a.title}</div>
            </div>
            ${versionChip}
            <span class="announcement-type-chip ${typeClass}">${typeLabel}</span>
          </div>
          <div class="announcement-desc-container">
            <div class="announcement-desc">${truncated}</div>
          </div>
          ${crossLink}
          <div class="announcement-footer">
            <div class="announcement-date">${a.date}${lastEditedHtml}&nbsp;&middot;&nbsp;${relativeTimeStr}</div>
            <m3e-button variant="text" size="small" class="announcement-expand-btn" onclick="event.stopPropagation(); this.closest('.announcement-card').classList.toggle('expanded'); openAnnouncementModal('${a.id}', this, event);">
              Read more
              <span slot="icon" class="material-symbols-outlined expand-icon">open_in_new</span>
            </m3e-button>
          </div>
        </div>
      `;
    }).join('');
  }

  function getCrossLinkHtml(a) {
    if (!a.relatedAnnouncementId) return '';
    const related = ANNOUNCEMENTS.find(r => r.id === a.relatedAnnouncementId);
    if (!related) return '';
    const isChangelog = related.type === 'changelog' || related.type === 'both';
    const label = isChangelog ? 'See release notes' : 'See announcement';
    return `<div class="announcement-cross-link" onclick="event.stopPropagation(); openAnnouncementModal('${related.id}', null)"><span class="material-symbols-outlined" style="font-size:14px;">link</span> ${label} &rarr;</div>`;
  }

  window.openAnnouncementModal = function(id, card, event) {
    if (event && event.target.closest('.announcement-dismiss')) {
      return;
    }

    const a = ANNOUNCEMENTS.find(item => item.id === id);
    if (!a) return;

    const bodyHtml = parseMarkdown(a.description);
    
    const headerEl = document.getElementById('announcement-modal-header');
    const bodyEl = document.getElementById('announcement-modal-body');
    const modalEl = document.getElementById('announcement-modal');

    if (headerEl && bodyEl && modalEl) {
      const typeLabel = a.type === 'both' ? 'Announcement + Changelog' : a.type;
      const typeClass = a.type === 'changelog' || a.type === 'both' ? 'changelog-type' : 'announcement-type';
      const versionBadge = a.version ? `<span class="announcement-modal-version">${a.version}</span>` : '';

      const postedAtFull = a.postedAt ? new Date(a.postedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : a.date;
      const editedAtFull = a.lastEditedAt ? new Date(a.lastEditedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : null;
      const timestampHtml = `<div class="announcement-modal-timestamps"><span class="announcement-modal-timestamp-item">Originally posted: ${postedAtFull}</span>${editedAtFull ? `<span class="announcement-modal-timestamp-item">Last edited: ${editedAtFull}</span>` : ''}</div>`;

      const crossLinkModal = getCrossLinkHtml(a);

      headerEl.innerHTML = `
        <button class="announcement-modal-close" onclick="closeAnnouncementModal()" aria-label="Close modal">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="announcement-modal-meta">
          <span class="announcement-modal-type-chip ${typeClass}">${typeLabel}</span>
          ${versionBadge}
          <span class="announcement-modal-date">${a.date}</span>
        </div>
        <h2 class="announcement-modal-title">${a.title}</h2>
        ${timestampHtml}
      `;
      bodyEl.innerHTML = bodyHtml + (crossLinkModal ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--md-sys-color-outline-variant);">${crossLinkModal}</div>` : '');

      modalEl.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    // Mark as seen instantly
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem('orchid_seen_announcements', JSON.stringify(seen));
      
      // Update card visual unseen dot (if card is passed)
      if (card) {
        card.classList.add('seen');
        card.classList.remove('unseen');
      } else {
        // Find card in DOM and update it
        const domCard = document.querySelector(`[data-announcement-id="${id}"]`);
        if (domCard) {
          domCard.classList.add('seen');
          domCard.classList.remove('unseen');
        }
      }
      updateBellBadge();
    }
  };

  window.closeAnnouncementModal = function() {
    const modalEl = document.getElementById('announcement-modal');
    if (modalEl) {
      modalEl.classList.remove('active');
      document.body.style.overflow = ''; // Restore main page scrolling
    }
  };

  window.handleAnnouncementModalBackdropClick = function(event) {
    if (event.target === event.currentTarget) {
      closeAnnouncementModal();
    }
  };

  renderAnnouncements();

  // Announcement filter chips (M3E)
  document.querySelectorAll('#announcement-filters m3e-filter-chip').forEach(chip => {
    chip.addEventListener('change', () => {
      if (!chip.selected) {
        chip.selected = true;
        syncAllM3EAttributes();
        return;
      }
      // Deselect others (single-select)
      document.querySelectorAll('#announcement-filters m3e-filter-chip').forEach(c => {
        if (c !== chip) c.selected = false;
      });
      syncAllM3EAttributes();
      renderAnnouncements(chip.dataset.filter);
    });
  });

  window.dismissAnnouncement = function(id, btn, event) {
    if (event) {
      event.stopPropagation();
    }
    dismissed.push(id);
    localStorage.setItem('orchid_dismissed_announcements', JSON.stringify(dismissed));
    updateBellBadge();
  };

  function updateBellBadge() {
    const count = ANNOUNCEMENTS.filter(a => announcementActive(a) && !dismissed.includes(a.id) && !seen.includes(a.id)).length;
    ['bell-badge', 'bell-badge-mobile'].forEach(id => {
      const badge = document.getElementById(id);
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    });
  }

  updateBellBadge();

  // ============================================================
  // SETTINGS — Current Version + Changelog Card
  // ============================================================
  (function renderSettingsVersionCard() {
    const card = document.getElementById('settings-version-card');
    const content = document.getElementById('settings-version-content');
    if (!card || !content) return;

    const latestChangelog = ANNOUNCEMENTS.find(a => announcementActive(a) && (a.type === 'changelog' || a.type === 'both') && a.version);
    if (!latestChangelog) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const relativeStr = getRelativeTime(latestChangelog.lastEditedAt || latestChangelog.postedAt);
    const cleanSnippet = stripMarkdown(latestChangelog.description);
    const truncated = cleanSnippet.length > 120 ? cleanSnippet.slice(0, 120) + '...' : cleanSnippet;

    content.innerHTML = `
      <div class="settings-version-row">
        <div class="settings-version-badge">${latestChangelog.version}</div>
        <div class="settings-version-info">
          <div class="settings-version-title">${latestChangelog.title}</div>
          <div class="settings-version-desc">${truncated}</div>
          <div class="settings-version-meta">${latestChangelog.date}${relativeStr ? ' &middot; ' + relativeStr : ''}</div>
        </div>
        <button class="settings-version-view-btn" onclick="openAnnouncementModal('${latestChangelog.id}', null)">
          <span class="material-symbols-outlined" style="font-size:16px;">open_in_new</span>
          View
        </button>
      </div>
    `;
  })();

  // ============================================================
  // REQUEST HISTORY TABLE (Usage section)
  // ============================================================
  const historyTbody = document.getElementById('history-tbody');
  if (historyTbody) {
    historyTbody.innerHTML = REQUEST_HISTORY.map(r => `
      <tr>
        <td>${r.time}</td>
        <td>${r.model}</td>
        <td style="font-family:'Roboto Mono',monospace;font-size:12px;">${r.endpoint}</td>
        <td><span class="status-badge ${r.status}">${r.status === 'success' ? '✓ Success' : '✗ Failed'}</span></td>
        <td>${r.credits > 0 ? `-${r.credits} cr` : '—'}</td>
      </tr>
    `).join('');
  }

  // ============================================================
  // LOGIN & ACCOUNT HISTORY
  // ============================================================
  (function renderAccountHistory() {
    const container = document.getElementById('account-history-list');
    if (!container) return;

    const EVENT_META = {
      login:            { icon: 'login',            label: 'Sign In',             colorClass: 'ah-success' },
      logout:           { icon: 'logout',           label: 'Sign Out',            colorClass: 'ah-neutral' },
      session_revoked:  { icon: 'gpp_bad',          label: 'Session Revoked',     colorClass: 'ah-warning' },
      auth_linked:      { icon: 'link',             label: 'Auth Linked',         colorClass: 'ah-info'    },
      auth_unlinked:    { icon: 'link_off',         label: 'Auth Unlinked',       colorClass: 'ah-warning' },
      email_changed:    { icon: 'mail',             label: 'Email Changed',       colorClass: 'ah-info'    },
      username_changed: { icon: 'badge',            label: 'Username Changed',    colorClass: 'ah-info'    },
      key_created:      { icon: 'key',              label: 'API Key Created',     colorClass: 'ah-info'    },
      key_deleted:      { icon: 'key_off',          label: 'API Key Deleted',     colorClass: 'ah-warning' },
    };

    container.innerHTML = ACCOUNT_HISTORY.map((ev, i) => {
      const meta = EVENT_META[ev.type] || { icon: 'info', label: ev.type, colorClass: 'ah-neutral' };
      return `
        <div class="ah-item stagger-item" style="animation-delay:${i * 50}ms">
          <div class="ah-icon-wrap ${meta.colorClass}">
            <span class="material-symbols-outlined">${meta.icon}</span>
          </div>
          <div class="ah-body">
            <div class="ah-top-row">
              <span class="ah-event-label">${meta.label}</span>
              <span class="ah-badge ${meta.colorClass}-badge">${meta.label}</span>
            </div>
            <div class="ah-detail">${ev.detail}</div>
            <div class="ah-meta-row">
              <span class="ah-meta-item">
                <span class="material-symbols-outlined">devices</span>
                ${ev.device}
              </span>
              <span class="ah-meta-item">
                <span class="material-symbols-outlined">location_on</span>
                ${ev.location}
              </span>
              <span class="ah-meta-item ah-time">
                <span class="material-symbols-outlined">schedule</span>
                ${ev.time}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  })();

  // ============================================================
  // TOGGLE SWITCHES (global)
  // ============================================================
  document.querySelectorAll('m3e-switch[data-toggle]').forEach(toggle => {
    toggle.addEventListener('change', () => {
      // m3e-switch handles its own checked state
    });
  });

  // Settings segmented buttons (Theme, Density, etc.) — M3E
  document.addEventListener('change', (e) => {
    const themeBtn = e.target.closest('m3e-segmented-button.theme-toggle');
    if (themeBtn) {
      const checkedSegment = Array.from(themeBtn.querySelectorAll('m3e-button-segment')).find(seg => seg.checked);
      if (checkedSegment) {
        const themeVal = checkedSegment.value;
        const themeLabel = themeVal.charAt(0).toUpperCase() + themeVal.slice(1);
        showToast(`Theme changed to ${themeLabel}`, 'info');
      }
    }

    const densityBtn = e.target.closest('m3e-segmented-button.density-toggle');
    if (densityBtn) {
      const checkedSegment = Array.from(densityBtn.querySelectorAll('m3e-button-segment')).find(seg => seg.checked);
      if (checkedSegment) {
        const densityVal = checkedSegment.value;
        const densityLabel = densityVal.charAt(0).toUpperCase() + densityVal.slice(1);
        showToast(`Display density changed to ${densityLabel}`, 'info');
      }
    }
  });

  // ============================================================
  // DIALOGS — Generic dialog system
  // ============================================================
  window.showDialog = function(title, icon, bodyHTML, actions) {
    const overlay = document.getElementById('dialog-overlay');
    const box = document.getElementById('dialog-box');

    box.innerHTML = `
      <div class="dialog-title">
        <span class="material-symbols-outlined">${icon}</span>
        ${title}
      </div>
      <div class="dialog-body">${bodyHTML}</div>
      <div class="dialog-actions" id="dialog-action-btns"></div>
    `;

    const actionsContainer = document.getElementById('dialog-action-btns');
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = `btn btn-${a.variant || 'text'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        if (a.action === 'close') closeDialog();
        else if (typeof a.action === 'function') a.action();
      });
      actionsContainer.appendChild(btn);
    });

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Close on overlay click
    overlay.onclick = e => { if (e.target === overlay) closeDialog(); };
  };

  window.closeDialog = function() {
    const overlay = document.getElementById('dialog-overlay');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  window.confirmAction = function(title, message, onConfirm) {
    showDialog(title, 'warning', `<p>${message}</p>`, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: 'Confirm', variant: 'filled', action: () => { closeDialog(); onConfirm(); } },
    ]);
  };

  // ============================================================
  // TOASTS
  // ============================================================
  window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
      ${message}
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  };

  // ============================================================
  // COPY TO CLIPBOARD
  // ============================================================
  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  };

  // ============================================================
  // UPGRADE BUTTON
  // ============================================================
  document.getElementById('btn-upgrade')?.addEventListener('click', () => {
    switchSection('billing');
    setTimeout(() => {
      document.getElementById('subscription-plans-container')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  });

  // ============================================================
  // DELETE ACCOUNT FLOW
  // ============================================================
  document.getElementById('btn-delete-account')?.addEventListener('click', () => {
    showDialog('Delete Account', 'delete_forever', `
      <p style="margin-bottom:16px;">This will permanently delete your account, all API keys, and cancel any active subscriptions. This cannot be undone after the 14-day grace period.</p>
      <div class="form-field">
        <label class="form-label">Type your username to confirm</label>
        <input class="form-input" type="text" placeholder="${USER.username}" id="delete-confirm-input" />
      </div>
    `, [
      { label: 'Cancel', variant: 'text', action: 'close' },
      { label: 'Delete My Account', variant: 'danger', action: () => {
        const input = document.getElementById('delete-confirm-input');
        if (input && input.value === USER.username) {
          closeDialog();
          showToast('Account scheduled for deletion. 14-day grace period started.', 'success');
        } else {
          showToast('Username does not match', 'error');
        }
      }},
    ]);
  });

  // ============================================================
  // REVOKE ALL SESSIONS
  // ============================================================
  document.getElementById('btn-revoke-all')?.addEventListener('click', () => {
    confirmAction('Revoke All Sessions', 'Sign out from all devices except your current session?', () => {
      showToast('All other sessions revoked', 'success');
    });
  });

  // ============================================================
  // SIGN OUT FLOW
  // ============================================================
  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    localStorage.removeItem('orchid_session');
    showToast('Signed out successfully', 'success');
    setTimeout(() => {
      window.location.href = '/Account/Login';
    }, 800);
  });

  // ============================================================
  // CLEAR HISTORY
  // ============================================================
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    const tbody = document.getElementById('history-tbody');
    if (tbody) {
      tbody.style.transition = 'opacity 300ms ease';
      tbody.style.opacity = '0';
      setTimeout(() => {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--md-sys-color-on-surface-variant);">History cleared from view</td></tr>`;
        tbody.style.opacity = '1';
      }, 300);
    }
  });

  // ============================================================
  // NUDGE BANNER
  // ============================================================
  const nudgeBanner = document.getElementById('nudge-banner');
  if (nudgeBanner && CREDITS.rollover.current >= CREDITS.rollover.max * 0.9) {
    nudgeBanner.style.display = 'flex';
  }

  document.getElementById('nudge-dismiss')?.addEventListener('click', () => {
    nudgeBanner.style.transition = 'all 300ms ease';
    nudgeBanner.style.opacity = '0';
    nudgeBanner.style.height = '0';
    nudgeBanner.style.padding = '0';
    nudgeBanner.style.margin = '0';
    nudgeBanner.style.overflow = 'hidden';
    setTimeout(() => { nudgeBanner.style.display = 'none'; }, 300);
  });

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDialog();
      closeModelDetail();
    }
  });



  // ============================================================
  // UTILITY
  // ============================================================
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatNum(n) {
    return n.toLocaleString();
  }

  function randomId(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  }


  // ============================================================
  // USAGE SECTION -- Stats + History Table + Filters
  // ============================================================
  (function initUsageSection() {
    var statsContainer = document.getElementById('usage-stats-row');
    if (statsContainer) {
      var totalRequests = REQUEST_HISTORY.length;
      var successCount  = REQUEST_HISTORY.filter(function(r){ return r.status === 'success'; }).length;
      var failCount     = REQUEST_HISTORY.filter(function(r){ return r.status === 'fail'; }).length;
      var creditsSpent  = REQUEST_HISTORY.reduce(function(s,r){ return s + r.credits; }, 0);
      var stats = [
        { icon: 'send',         label: 'Total Requests', value: totalRequests,        cls: 'primary'   },
        { icon: 'check_circle', label: 'Successful',      value: successCount,         cls: 'success'   },
        { icon: 'error',        label: 'Failed',          value: failCount,            cls: 'error'     },
        { icon: 'toll',         label: 'Credits Spent',   value: creditsSpent + ' cr', cls: 'secondary' }
      ];
      statsContainer.innerHTML = stats.map(function(s){
        return '<div class="usage-stat-card"><div class="usage-stat-icon ' + s.cls + '"><span class="material-symbols-outlined">' + s.icon + '</span></div><div class="usage-stat-value">' + s.value + '</div><div class="usage-stat-label">' + s.label + '</div></div>';
      }).join('');
    }

    var usageTbody = document.getElementById('usage-history-tbody');
    var usageCount = document.getElementById('usage-history-count');
    var activeStatus      = 'all';
    var activeEndpoint    = 'all';
    var activeCompression = 'all';

    function getModelCellHtml(r) {
      if (!r.compression) {
        return r.model;
      }
      var c = r.compression;
      if (c.routedTo) {
        return `
          <div class="model-cell-content">
            <div class="model-name-row">
              <span class="model-name">${r.model}</span>
              <span class="badge badge-routing" title="This request was dynamically routed to another model">
                <span class="material-symbols-outlined">alt_route</span> Routed
              </span>
            </div>
            <div class="model-subtext">
              Originally <span class="orig-model">${r.model}</span> &rarr; Routed to <span class="target-model">${c.routedTo}</span>
              <span class="routing-compress-info">(${c.originalTokens} &rarr; ${c.compressedTokens}, ${c.savedPct} saved via <span class="compressor-name">${c.compressor}</span>)</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="model-cell-content">
            <div class="model-name-row">
              <span class="model-name">${r.model}</span>
              <span class="badge badge-compression" title="This request triggered context compression">
                <span class="material-symbols-outlined">compress</span> Compressed
              </span>
            </div>
            <div class="model-subtext">
              Context compressed <span class="tokens-info">${c.originalTokens} &rarr; ${c.compressedTokens}</span> (${c.savedPct} saved) via <span class="compressor-name">${c.compressor}</span>
            </div>
          </div>
        `;
      }
    }

    function renderUsageTable() {
      var filtered = REQUEST_HISTORY.filter(function(r){
        var ms = activeStatus   === 'all' || r.status   === activeStatus;
        var me = activeEndpoint === 'all' || r.endpoint === activeEndpoint;
        var mc = true;
        if (activeCompression === 'compressed') {
          mc = !!r.compression;
        } else if (activeCompression === 'routed') {
          mc = !!(r.compression && r.compression.routedTo);
        } else if (activeCompression === 'none') {
          mc = !r.compression;
        }
        return ms && me && mc;
      });
      if (usageCount) usageCount.textContent = filtered.length + ' record' + (filtered.length !== 1 ? 's' : '');
      if (!usageTbody) return;
      if (filtered.length === 0) {
        usageTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--md-sys-color-on-surface-variant);">No records match the current filters</td></tr>';
        return;
      }
      usageTbody.innerHTML = filtered.map(function(r){
        var statusHtml = '<span class="status-badge ' + r.status + '">' + (r.status === 'success' ? '\u2713 Success' : '\u2717 Failed') + '</span>';
        var creditsHtml = r.credits > 0 ? '-' + r.credits + ' cr' : '\u2014';
        var modelHtml = getModelCellHtml(r);
        return '<tr><td>' + r.time + '</td><td>' + modelHtml + '</td><td style="font-family:\'Roboto Mono\',monospace;font-size:12px;">' + r.endpoint + '</td><td>' + statusHtml + '</td><td>' + creditsHtml + '</td></tr>';
      }).join('');
    }

    renderUsageTable();

    // Usage filter: Status (M3E)
    document.querySelectorAll('#usage-filter-status m3e-filter-chip').forEach(function(chip){
      chip.addEventListener('change', function(){
        if (!chip.selected) {
          chip.selected = true;
          syncAllM3EAttributes();
          return;
        }
        document.querySelectorAll('#usage-filter-status m3e-filter-chip').forEach(function(c){ if (c !== chip) c.selected = false; });
        activeStatus = chip.dataset.status;
        syncAllM3EAttributes();
        renderUsageTable();
      });
    });

    // Usage filter: Endpoint (M3E)
    document.querySelectorAll('#usage-filter-endpoint m3e-filter-chip').forEach(function(chip){
      chip.addEventListener('change', function(){
        if (!chip.selected) {
          chip.selected = true;
          syncAllM3EAttributes();
          return;
        }
        document.querySelectorAll('#usage-filter-endpoint m3e-filter-chip').forEach(function(c){ if (c !== chip) c.selected = false; });
        activeEndpoint = chip.dataset.endpoint;
        syncAllM3EAttributes();
        renderUsageTable();
      });
    });

    // Usage filter: Compression (M3E)
    document.querySelectorAll('#usage-filter-compression m3e-filter-chip').forEach(function(chip){
      chip.addEventListener('change', function(){
        if (!chip.selected) {
          chip.selected = true;
          syncAllM3EAttributes();
          return;
        }
        document.querySelectorAll('#usage-filter-compression m3e-filter-chip').forEach(function(c){ if (c !== chip) c.selected = false; });
        activeCompression = chip.dataset.compression;
        syncAllM3EAttributes();
        renderUsageTable();
      });
    });

    var resetFiltersBtn = document.getElementById('btn-reset-usage-filters');
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', function(){
        activeStatus = 'all';
        activeEndpoint = 'all';
        activeCompression = 'all';
        
        document.querySelectorAll('#usage-filter-status m3e-filter-chip').forEach(c => {
          c.selected = c.dataset.status === 'all';
        });
        document.querySelectorAll('#usage-filter-endpoint m3e-filter-chip').forEach(c => {
          c.selected = c.dataset.endpoint === 'all';
        });
        document.querySelectorAll('#usage-filter-compression m3e-filter-chip').forEach(c => {
          c.selected = c.dataset.compression === 'all';
        });
        
        syncAllM3EAttributes();
        renderUsageTable();
        
        showToast('Filters reset', 'info');
      });
    }
  })();

  // ============================================================
  //   GLOBAL TOP-LEVEL ANNOUNCEMENT BANNERS MANAGER
  // ============================================================
  (function(){
    function updateBannerHeightVariable() {
      const container = document.getElementById('global-banners-container');
      if (container) {
        const height = container.offsetHeight;
        document.documentElement.style.setProperty('--banner-height', height + 'px');
      } else {
        document.documentElement.style.setProperty('--banner-height', '0px');
      }
    }

    window.dismissGlobalBanner = function(id, event) {
      if (event) event.stopPropagation();

      const bannerEl = document.getElementById(`global-banner-${id}`);
      if (!bannerEl) return;

      const dismissed = JSON.parse(localStorage.getItem('orchid_dismissed_announcements') || '[]');
      if (!dismissed.includes(id)) {
        dismissed.push(id);
        localStorage.setItem('orchid_dismissed_announcements', JSON.stringify(dismissed));
      }

      // Smooth slide-up transition
      bannerEl.style.height = '0px';
      bannerEl.style.paddingTop = '0px';
      bannerEl.style.paddingBottom = '0px';
      bannerEl.style.minHeight = '0px';
      bannerEl.style.borderBottom = 'none';
      bannerEl.style.opacity = '0';

      // Immediately calculate the target height during collapsing transition
      const container = document.getElementById('global-banners-container');
      if (container) {
        const bannerHeight = bannerEl.offsetHeight;
        const currentTotalHeight = container.offsetHeight;
        const newTargetHeight = Math.max(0, currentTotalHeight - bannerHeight);
        document.documentElement.style.setProperty('--banner-height', newTargetHeight + 'px');
      }

      setTimeout(() => {
        bannerEl.remove();
        updateBannerHeightVariable();
        // If the announcements section render is active, sync its dismissed cards in real-time
        if (typeof renderAnnouncements === 'function') {
          renderAnnouncements();
        }
      }, 300);
    };

    window.handleBannerClick = function(id) {
      if (typeof switchSection === 'function') {
        switchSection('announcements');
      }

      setTimeout(() => {
        const card = document.querySelector(`[data-announcement-id="${id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof openAnnouncementModal === 'function') {
          openAnnouncementModal(id, card);
        }
      }, 250);
    };

    function renderGlobalBanners() {
      const container = document.getElementById('global-banners-container');
      if (!container) return;

      const dismissed = JSON.parse(localStorage.getItem('orchid_dismissed_announcements') || '[]');
      const activeBanners = ANNOUNCEMENTS.filter(a => bannerActive(a) && !dismissed.includes(a.id)).slice(0, 3);

      if (activeBanners.length === 0) {
        container.innerHTML = '';
        document.documentElement.style.setProperty('--banner-height', '0px');
        return;
      }

      container.innerHTML = activeBanners.map(function(a) {
        const typeLabel = a.type === 'both' ? 'Announcement' : (a.type === 'changelog' ? 'Changelog' : 'Announcement');
        const displayTitle = a.bannerTitle || a.title;
        const cleanSnippet = stripMarkdown(a.description);
        const truncatedDesc = cleanSnippet.length > 140 ? cleanSnippet.slice(0, 140) + '...' : cleanSnippet;
        const dismissBtn = a.isBannerDismissible === false ? '' : `
            <button class="global-banner-dismiss" onclick="dismissGlobalBanner('${a.id}', event)" aria-label="Dismiss banner">
              <span class="material-symbols-outlined">close</span>
            </button>`;
        return `
          <div class="global-banner tone-${a.tone}" data-banner-id="${a.id}" id="global-banner-${a.id}">
            <div class="global-banner-text" onclick="handleBannerClick('${a.id}')">
              <span class="global-banner-type-chip">${typeLabel}</span>
              <span class="global-banner-title"><strong>${displayTitle}:</strong> ${truncatedDesc}</span>
            </div>
            <button class="global-banner-cta" onclick="handleBannerClick('${a.id}')">
              Learn more <span>&rarr;</span>
            </button>
            ${dismissBtn}
          </div>
        `;
      }).join('');

      // Measure height and apply dynamic offsets
      setTimeout(updateBannerHeightVariable, 50);
      window.addEventListener('resize', updateBannerHeightVariable);
    }

    // Run on load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderGlobalBanners);
    } else {
      renderGlobalBanners();
    }
  })();
})();
