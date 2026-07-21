/* ============================================================
   OrchidLLM Admin Panel — Demo
   All state is mock data persisted to localStorage.
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // SESSION / ADMIN GATE
  // ============================================================
  const session = JSON.parse(localStorage.getItem('orchid_session') || 'null');
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', init);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // NATO phonetic alphabet — providers are codenamed in creation order.
  const NATO = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel','India',
    'Juliett','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo','Sierra',
    'Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];

  const STORE_KEY = 'orchid_admin_state';
  const RETRYABLE_CODES = ['429', '500', '502', '503', '504', 'timeout', 'conn_reset'];

  // Default error-code display labels — renames raw upstream error text
  // wherever it's shown (logs, retry activity, route traces). Per-endpoint
  // overrides (provider.errorAliasOverrides) take precedence over these.
  const ERROR_ALIASES_SEED = [
    { id: 'ea1', matchType: 'code', pattern: '429', label: 'Upstream Rate Limited' },
    { id: 'ea2', matchType: 'code', pattern: '402', label: 'Upstream Billing Error' },
    { id: 'ea3', matchType: 'regex', pattern: '^5\\d\\d', label: 'Upstream Server Error' },
    { id: 'ea4', matchType: 'code', pattern: 'timeout', label: 'Upstream Timeout' },
    { id: 'ea5', matchType: 'code', pattern: '401', label: 'Upstream Auth Rejected' },
  ];
  // Demo custom retry rules — matched before the plain code-chip list. A
  // 'fatal' action means never silently retry even if the code chip list
  // would otherwise allow it (e.g. a 403 that really means "bad key", not
  // "transient"). providerId null = applies to all endpoints.
  const RETRY_RULES_SEED = [
    { id: 'rr1', providerId: null, matchType: 'regex', pattern: 'insufficient_quota|out.of.credit', action: 'retry', note: 'Provider ran dry mid-stream — reroute, don\'t surface to the user' },
    { id: 'rr2', providerId: 'pv3', matchType: 'code', pattern: '403', action: 'fatal', note: 'Groq 403 means a bad/revoked key, not a transient failure — alert admin instead of retrying' },
  ];
  // Loyalty-escalating retention offers shown on downgrade/cancel — the
  // highest bracket whose minTenureMonths the user's time-on-current-tier
  // meets wins (evaluated in users.js getRetentionOffer()).
  const RETENTION_OFFERS_SEED = [
    { id: 'ro1', minTenureMonths: 0, discountPercent: 30, bonusCredits: 50000 },
    { id: 'ro2', minTenureMonths: 3, discountPercent: 40, bonusCredits: 75000 },
    { id: 'ro3', minTenureMonths: 6, discountPercent: 50, bonusCredits: 100000 },
  ];
  const matchesRule = (rule, raw) => rule.matchType === 'regex'
    ? (() => { try { return new RegExp(rule.pattern, 'i').test(raw); } catch (e) { return false; } })()
    : String(raw).toLowerCase().includes(String(rule.pattern).toLowerCase());
  const MODEL_CAPS = ['streaming', 'vision', 'reasoning', 'function_calling', 'search', 'caching', 'images'];
  // Per-provider request parameters. `standard` ones are always applied;
  // the rest are optional toggles surfaced to users where supported.
  const ATTACH_PARAMS = ['temperature', 'top_p', 'tools', 'reasoning', 'vision', 'json_mode', 'thinking_effort', 'search', 'reasoning_effort'];
  const STANDARD_PARAMS = ['temperature', 'top_p'];

  // Per-endpoint modality support. An endpoint declares which modalities it
  // serves and, per modality, the request params it supports. Params differ
  // by modality (e.g. images take a size/quality, audio takes a voice) — the
  // union below is the built-in palette; admins can add custom chips per
  // modality. Stored on the provider as `modalities: { text: [...params] }`.
  const BASE_MODALITIES = ['text', 'image', 'audio', 'video', 'music'];
  const MODALITY_PARAMS = {
    text:  ['temperature', 'top_p', 'tools', 'reasoning', 'json_mode', 'thinking_effort', 'search', 'reasoning_effort', 'stop', 'max_tokens'],
    image: ['size', 'quality', 'style', 'n', 'negative_prompt', 'seed', 'steps', 'guidance'],
    audio: ['voice', 'speed', 'format', 'language', 'timestamps'],
    video: ['resolution', 'fps', 'duration', 'seed', 'motion'],
    music: ['duration', 'tempo', 'genre', 'seed', 'instrumental'],
  };
  const modalityParamPalette = (mod) => MODALITY_PARAMS[mod] || STANDARD_PARAMS.slice();
  const defaultModalities = () => ({ text: STANDARD_PARAMS.slice() });

  // Smart-routing priority factors — the router sorts candidate endpoints by
  // these in order. Admin can reorder in Settings → Routing.
  const ROUTING_FACTORS = {
    availability: { label: 'Availability', desc: 'healthy & under concurrency cap first', icon: 'check_circle' },
    context:      { label: 'Context window', desc: 'smallest endpoint that still fits the request', icon: 'straighten' },
    weight:       { label: 'Weight (quality)', desc: 'lower configured weight = preferred', icon: 'trophy' },
  };
  const ROUTING_PRIORITY_DEFAULT = ['availability', 'context', 'weight'];

  // Model groups — named access tiers, bridged to the user dashboard.
  // Seeded to mirror the user-side defaults; admin can rename/add/remove.
  const GROUPS_SEED = [
    { id: 'free',        name: 'Free',     rank: 1, order: 0 },
    { id: 'standard',    name: 'Standard', rank: 2, order: 1 },
    { id: 'premium',     name: 'Premium',  rank: 3, order: 2 },
    { id: 'premiumPlus', name: 'Premium+', rank: 4, order: 3 },
  ];
  // Map a legacy tier label → group id (for seeding existing models).
  const TIER_TO_GROUP = { free: 'free', standard: 'standard', premium: 'premium', 'premium+': 'premiumPlus', elite: 'premiumPlus' };

  // Model Maker — vendors authored here (name + SVG mark), assignable to
  // models in the catalogue. Ids intentionally match the user-side
  // `makerSlug` values already baked into MODELS_SEED so the bridge is a
  // straight id swap. Marks are original abstract shapes, not trademarks.
  const VENDORS_SEED = [
    { id: 'anthropic', name: 'Anthropic', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 L21 20H15.5L12 13L8.5 20H3Z" fill="#cc785c"/></svg>' },
    { id: 'openai', name: 'OpenAI', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#10a37f" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="19" cy="9" r="3"/><circle cx="19" cy="16" r="3"/><circle cx="12" cy="20" r="3"/><circle cx="5" cy="16" r="3"/><circle cx="5" cy="9" r="3"/></g></svg>' },
    { id: 'google', name: 'Google', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 12V2A10 10 0 0 1 22 12Z" fill="#4285F4"/><path d="M12 12H22A10 10 0 0 1 12 22Z" fill="#34A853"/><path d="M12 12V22A10 10 0 0 1 2 12Z" fill="#FBBC05"/><path d="M12 12H2A10 10 0 0 1 12 2Z" fill="#EA4335"/></svg>' },
    { id: 'meta', name: 'Meta', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 8c-2.8 0-5 2.5-5 5.5S4.2 19 7 19c2 0 3.3-1.4 4.4-3.1.4-.6.8-1.3 1.1-1.9-.3-.6-.7-1.3-1.1-1.9C10.3 10.4 9 9 7 9m10 0c2.8 0 5 2.5 5 5.5S19.8 20 17 20c-2 0-3.3-1.4-4.4-3.1-.4-.6-.8-1.3-1.1-1.9.3-.6.7-1.3 1.1-1.9C13.7 11.4 15 10 17 10" stroke="#0866FF" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
    { id: 'deepseek', name: 'DeepSeek', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 15c2-4 5-6 9-6s7 2 9 6c-3-1-5-3-9-3s-6 2-9 3z" fill="#4d6bfe"/><circle cx="17" cy="9" r="1.4" fill="#4d6bfe"/></svg>' },
    { id: 'mistral', name: 'Mistral', svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="#ff7000"><rect x="3" y="10" width="4" height="4"/><rect x="8" y="6" width="4" height="4"/><rect x="8" y="14" width="4" height="4"/><rect x="13" y="10" width="4" height="4"/><rect x="18" y="6" width="3" height="12"/></g></svg>' },
  ];

  // Booster pack visual customization: icon container shape + optional emoji
  // override, reused for wallet icons, tier icons and tag markers.
  const SHAPE_OPTIONS = ['square', 'circle', 'diamond', 'hexagon'];

  // Declarative personalization rule types — evaluated against DEMO_USER
  // fields on the user side (users.js evalPersonalization()). Kept
  // declarative (not raw functions) so the whole pack list survives
  // JSON.stringify across the admin→user bridge.
  const PERSONALIZATION_TYPES = [
    { value: 'none', label: 'None — always visible' },
    { value: 'spend_gte', label: 'Total spend ≥ (IDR)' },
    { value: 'tenure_months_gte', label: 'Months on platform ≥' },
    { value: 'recent_spend_gte', label: 'Spend in past month ≥ (IDR)' },
    { value: 'recent_spend_lt', label: 'Spend in past month < (IDR)' },
    { value: 'activity_gte', label: 'Requests today ≥' },
    { value: 'plan_tenure_gte', label: 'Months on current plan ≥' },
  ];

  // Booster Packs seed — the full user-side example catalogue, shared via
  // booster-seed.js so the admin manages exactly what the store displays.
  const BOOSTER_PACKS_SEED = window.ORCHID_BOOSTER_SEED || [];

  // ============================================================
  // SEED DATA
  // ============================================================
  function seedState() {
    const key = (suffix) => `sk-orch-up-${suffix}`;
    return {
      settings: {
        retryEnabled: true, retryCodes: ['429', '500', '502', '503', 'timeout'],
        retryMax: 3, retryBackoff: 400, retryCross: true,
        notifKeyDown: true, notifCredits: true, notifCreditHours: 24, notifFailThreshold: 5,
        notifUserBanner: true,
        routingStrategy: 'weight', routingFreeElig: true, probeInterval: 5, queueTimeout: 90,
        routingPriority: ROUTING_PRIORITY_DEFAULT.slice(),
        retryRules: JSON.parse(JSON.stringify(RETRY_RULES_SEED)),
        errorAliases: JSON.parse(JSON.stringify(ERROR_ALIASES_SEED)),
        retentionOffers: JSON.parse(JSON.stringify(RETENTION_OFFERS_SEED)),
      },
      providers: [
        { id: 'pv1', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', weight: 1, free: true, maxConcurrent: 40, inFlight: 17, status: 'active',
          modalities: { text: ['temperature', 'top_p', 'tools', 'reasoning', 'json_mode', 'reasoning_effort'], image: ['size', 'quality', 'style', 'n'] },
          keys: [
            { preview: key('a3f8…k2x1'), status: 'healthy' },
            { preview: key('b7c2…m9q4'), status: 'healthy' },
            { preview: key('c1d9…p5w7'), status: 'rate_limited' },
          ] },
        { id: 'pv2', label: 'Together AI', url: 'https://api.together.xyz/v1', weight: 3, free: true, maxConcurrent: 25, inFlight: 9, status: 'active',
          modalities: { text: ['temperature', 'top_p', 'tools', 'json_mode'], image: ['size', 'n', 'seed', 'steps'] },
          keys: [
            { preview: key('d4e6…r8t2'), status: 'healthy' },
            { preview: key('e2f1…s3y8'), status: 'healthy' },
          ] },
        { id: 'pv3', label: 'Groq Cloud', url: 'https://api.groq.com/openai/v1', weight: 2, free: false, maxConcurrent: 30, inFlight: 22, status: 'rate_limited',
          modalities: { text: ['temperature', 'top_p', 'tools', 'reasoning', 'reasoning_effort', 'thinking_effort'], audio: ['voice', 'speed', 'format', 'language'] },
          keys: [
            { preview: key('f9g3…u6z0'), status: 'rate_limited' },
            { preview: key('g5h7…v1a4'), status: 'healthy' },
          ] },
        { id: 'pv4', label: 'DeepInfra', url: 'https://api.deepinfra.com/v1/openai', weight: 5, free: true, maxConcurrent: 15, inFlight: 3, status: 'out_of_credits',
          modalities: { text: ['temperature', 'top_p'] },
          errorAliasOverrides: [{ id: 'pv4ea1', matchType: 'regex', pattern: 'credit', label: 'DeepInfra Credits Exhausted' }],
          keys: [
            { preview: key('h8i2…w4b6'), status: 'down' },
          ] },
        { id: 'pv5', label: 'Fireworks', url: 'https://api.fireworks.ai/inference/v1', weight: 4, free: false, maxConcurrent: 20, inFlight: 0, status: 'dead',
          modalities: { text: ['temperature', 'top_p', 'tools'], image: ['size', 'quality', 'seed', 'steps', 'guidance'], video: ['resolution', 'fps', 'duration', 'seed'] },
          keys: [
            { preview: key('i3j5…x7c9'), status: 'down' },
            { preview: key('j6k8…y2d3'), status: 'down' },
          ] },
      ],
      groups: JSON.parse(JSON.stringify(GROUPS_SEED)),
      vendors: JSON.parse(JSON.stringify(VENDORS_SEED)),
      models: [
        { id: 'm1', name: 'Claude Opus 4.5', slug: 'claude-opus-4-5', maker: 'Anthropic', makerId: 'anthropic', modality: 'text', tier: 'premium+', group: 'premium', context: 200000, active: true, mIn: 1.00, mOut: 1.50, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'vision', 'reasoning', 'function_calling', 'caching'],
          providers: [
            { providerId: 'pv1', weight: 1, contextCap: 200000, params: ['temperature', 'top_p', 'tools', 'reasoning', 'vision'] },
            { providerId: 'pv3', weight: 4, contextCap: 128000, params: ['temperature', 'tools'] },
          ] },
        { id: 'm2', name: 'GPT-4o', slug: 'gpt-4o', maker: 'OpenAI', makerId: 'openai', modality: 'multimodal', tier: 'premium', group: 'standard', context: 128000, active: true, mIn: 0.75, mOut: 1.00, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'vision', 'function_calling', 'search'],
          providers: [
            { providerId: 'pv1', weight: 2, contextCap: 128000, params: ['temperature', 'top_p', 'tools', 'vision', 'json_mode'] },
            { providerId: 'pv2', weight: 3, contextCap: 128000, params: ['temperature', 'tools'] },
            { providerId: 'pv5', weight: 6, contextCap: 64000, params: ['temperature'] },
          ] },
        { id: 'm3', name: 'Gemini 2.5 Pro', slug: 'gemini-2-pro', maker: 'Google', makerId: 'google', modality: 'multimodal', tier: 'standard', group: 'premium', context: 1000000, active: true, mIn: 0.90, mOut: 1.20, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'vision', 'reasoning', 'search'],
          providers: [
            { providerId: 'pv2', weight: 1, contextCap: 1000000, params: ['temperature', 'top_p', 'vision', 'search'] },
            { providerId: 'pv4', weight: 5, contextCap: 200000, params: ['temperature'] },
          ] },
        { id: 'm4', name: 'Llama 4 Maverick', slug: 'llama-4-maverick', maker: 'Meta', makerId: 'meta', modality: 'text', tier: 'free', group: 'free', context: 128000, active: true, mIn: 0.15, mOut: 0.25, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'function_calling'],
          providers: [
            { providerId: 'pv3', weight: 1, contextCap: 128000, params: ['temperature', 'top_p', 'tools'] },
            { providerId: 'pv2', weight: 2, contextCap: 128000, params: ['temperature', 'top_p'] },
            { providerId: 'pv4', weight: 4, contextCap: 64000, params: ['temperature'] },
          ] },
        { id: 'm5', name: 'DeepSeek V3.2', slug: 'deepseek-v3-2', maker: 'DeepSeek', makerId: 'deepseek', modality: 'text', tier: 'free', group: 'free', context: 64000, active: true, mIn: 0.10, mOut: 0.20, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'reasoning'],
          providers: [
            { providerId: 'pv4', weight: 2, contextCap: 64000, params: ['temperature', 'top_p'] },
            { providerId: 'pv1', weight: 3, contextCap: 64000, params: ['temperature', 'top_p', 'reasoning'] },
          ] },
        { id: 'm6', name: 'Claude Haiku 4.5', slug: 'claude-haiku-4', maker: 'Anthropic', makerId: 'anthropic', modality: 'text', tier: 'standard', group: 'free', context: 200000, active: false, mIn: 0.40, mOut: 0.55, launchAt: null, deprecateAt: null,
          caps: ['streaming', 'vision', 'function_calling'],
          providers: [
            { providerId: 'pv1', weight: 1, contextCap: 200000, params: ['temperature', 'top_p', 'tools', 'vision'] },
          ] },
      ],
      pools: [
        { id: 'pool1', name: 'Free Pool', slug: 'free', kind: 'pool', active: true, group: 'free', strategy: 'priority', failover: true,
          members: [{ modelId: 'm4', weight: 1 }, { modelId: 'm5', weight: 1 }, { modelId: 'm6', weight: 1 }] },
        { id: 'pool2', name: 'Strong Pool', slug: 'strong', kind: 'pool', active: true, group: 'premium', strategy: 'weighted', failover: true,
          members: [{ modelId: 'm1', weight: 60 }, { modelId: 'm3', weight: 40 }] },
      ],
      tiers: [
        { id: 't1', name: 'Free', color: '#938f99', idr: 0, usd: 0, std: 30000, fast: 0, priority: 0, rpm: 3, concurrent: 1, access: 'free', rollover: false,
          monthlyEnabled: true, quarterlyEnabled: false, quarterlyIDR: null, yearlyEnabled: false, yearlyIDR: null, cycleOverrides: { monthly: null, quarterly: null, yearly: null },
          iconShape: 'square', iconEmoji: null, customTag: null,
          bgStyle: 'none', bgColors: [], hasBorder: false, borderAnimated: false, hasGlowing: false, glowPulse: false, glowAnimated: false },
        { id: 't2', name: 'Basic', color: '#80cbc4', idr: 80000, usd: 5.33, std: 250000, fast: 20000, priority: 1, rpm: 5, concurrent: 1, access: 'standard', rollover: true,
          monthlyEnabled: true, quarterlyEnabled: true, quarterlyIDR: 200000, yearlyEnabled: true, yearlyIDR: 720000, cycleOverrides: { monthly: null, quarterly: null, yearly: null },
          iconShape: 'square', iconEmoji: null, customTag: null,
          bgStyle: 'none', bgColors: [], hasBorder: false, borderAnimated: false, hasGlowing: false, glowPulse: false, glowAnimated: false },
        { id: 't3', name: 'Plus', color: '#b388ff', idr: 150000, usd: 10, std: 700000, fast: 100000, priority: 3, rpm: 15, concurrent: 3, access: 'premium', rollover: true,
          monthlyEnabled: true, quarterlyEnabled: true, quarterlyIDR: 380000, yearlyEnabled: false, yearlyIDR: null, cycleOverrides: { monthly: null, quarterly: null, yearly: null },
          iconShape: 'square', iconEmoji: null, customTag: null,
          bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false },
        { id: 't4', name: 'Pro', color: '#ffd54f', idr: 280000, usd: 18.67, std: 1800000, fast: 350000, priority: 5, rpm: 30, concurrent: 6, access: 'premium+', rollover: true,
          monthlyEnabled: true, quarterlyEnabled: true, quarterlyIDR: 700000, yearlyEnabled: false, yearlyIDR: null, cycleOverrides: { monthly: null, quarterly: null, yearly: null },
          iconShape: 'square', iconEmoji: null, customTag: null,
          bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false },
        { id: 't5', name: 'Elite', color: '#d946ef', idr: 450000, usd: 30, std: 4500000, fast: 1000000, priority: 8, rpm: 60, concurrent: -1, access: 'elite', rollover: true,
          monthlyEnabled: true, quarterlyEnabled: false, quarterlyIDR: null, yearlyEnabled: false, yearlyIDR: null, cycleOverrides: { monthly: null, quarterly: null, yearly: null },
          iconShape: 'diamond', iconEmoji: null, customTag: null,
          bgStyle: 'none', bgColors: [], hasBorder: true, borderAnimated: true, hasGlowing: true, glowPulse: false, glowAnimated: false },
      ],
      boosterPacks: JSON.parse(JSON.stringify(BOOSTER_PACKS_SEED)),
      users: [
        { id: 'u1', name: 'vendouple', email: 'vendouple@orchidllm.com', tier: 'Elite', status: 'active', requests: 12480, credits: 3211050, joined: 'May 2026' },
        { id: 'u2', name: 'sarah_dev', email: 'sarah@example.com', tier: 'Plus', status: 'active', requests: 4211, credits: 402113, joined: 'May 2026' },
        { id: 'u3', name: 'budi.s', email: 'budi@example.id', tier: 'Basic', status: 'exhausted', requests: 1893, credits: 0, joined: 'Jun 2026' },
        { id: 'u4', name: 'mika_ai', email: 'mika@example.com', tier: 'Pro', status: 'active', requests: 8930, credits: 1204551, joined: 'Apr 2026' },
        { id: 'u5', name: 'anon4821', email: 'anon4821@mail.com', tier: 'Free', status: 'active', requests: 302, credits: 11200, joined: 'Jul 2026' },
        { id: 'u6', name: 'spamlord99', email: 'spam@sketchy.net', tier: 'Free', status: 'suspended', requests: 40122, credits: 0, joined: 'Jun 2026' },
        { id: 'u7', name: 'ratna.w', email: 'ratna@example.id', tier: 'Plus', status: 'active', requests: 3320, credits: 512700, joined: 'May 2026' },
        { id: 'u8', name: 'devteam_x', email: 'ops@devteamx.io', tier: 'Elite', status: 'active', requests: 22841, credits: 2100033, joined: 'Mar 2026' },
      ],
      alerts: [
        { sev: 'error', title: 'Key down on Endpoint Echo', desc: 'Both keys returning 401 — provider marked dead. Traffic rerouted via silent retry.', time: '4 min ago', unread: true },
        { sev: 'warning', title: 'Endpoint Delta out of credits', desc: 'out_of_credits for 26h — exceeds the 24h threshold. Needs a top-up.', time: '1 h ago', unread: true },
        { sev: 'warning', title: 'Endpoint Charlie rate limited', desc: 'Key #1 hit 429. Backoff until 14:32, key #2 absorbing traffic.', time: '2 h ago', unread: true },
        { sev: 'info', title: 'Traffic state: high', desc: 'Sustained elevated load 12:00–13:10. Free-tier routing tightened; paid unaffected.', time: '5 h ago', unread: false },
        { sev: 'info', title: 'Re-probe restored Endpoint Bravo', desc: 'Provider back to active after rate-limit window expired.', time: 'Yesterday', unread: false },
      ],
      retries: [
        { time: '14:21', model: 'claude-opus-4-5', failedOn: 'Charlie', error: '429 rate_limited', via: 'Alpha', attempts: 2 },
        { time: '14:08', model: 'gpt-4o', failedOn: 'Foxtrot*', error: '503 overloaded', via: 'Alpha', attempts: 2 },
        { time: '13:52', model: 'llama-4-maverick', failedOn: 'Delta', error: 'timeout', via: 'Charlie', attempts: 3, hops: ['Delta', 'Bravo'] },
        { time: '13:47', model: 'gemini-2-5-pro', failedOn: 'Delta', error: '402 billing', via: 'Bravo', attempts: 2 },
        { time: '13:31', model: 'deepseek-v3-2', failedOn: 'Delta', error: '500 internal', via: 'Alpha', attempts: 2 },
        { time: '12:58', model: 'gpt-4o', failedOn: 'Echo', error: '401 auth', via: 'Bravo', attempts: 2 },
      ],
      incidents: [
        { sev: 'error', title: 'Endpoint Echo — dead', meta: 'Consecutive 5xx exceeded threshold (5). Auto-removed from rotation · 4 min ago' },
        { sev: 'warning', title: 'Endpoint Delta — out of credits', meta: 'Admin notified after 24h threshold · 1 h ago' },
        { sev: 'warning', title: 'Endpoint Charlie — rate limited', meta: 'Re-probe scheduled every 5 min · 2 h ago' },
        { sev: 'info', title: 'High traffic window', meta: '12:00–13:10 · free tier deprioritised, zero paid impact' },
      ],
      announcements: [
        { id: 'an1', type: 'announcement', tone: 'warning',
          bannerTitle: 'Scheduled Platform & Database Maintenance Set for May 24th',
          title: 'Database Maintenance Coming',
          description: 'We will be conducting scheduled database maintenance to optimize query performance.\n\n### Maintenance Window\n- **Start**: May 24, 2026, 02:00 UTC\n- **End**: May 24, 2026, 04:00 UTC\n\nWe apologize for the inconvenience.',
          date: 'May 20, 2026', postedAt: '2026-05-20T10:00:00Z', lastEditedAt: null,
          version: '', isBanner: true, isBannerDismissible: true, relatedAnnouncementId: null,
          expiresAt: null, bannerExpiresAt: '2026-05-24T04:00:00Z' },
        { id: 'an2', type: 'changelog', tone: 'info',
          bannerTitle: 'DeepSeek R1 Reasoning Model Now Live on Standard Tier',
          title: 'DeepSeek R1 Model Integration',
          description: 'DeepSeek R1 reasoning model is now fully integrated and available on the Standard tier.\n\n### Highlights\n- **Advanced Reasoning** in math, code and logic\n- **Streaming Output**\n- **Cost Efficient**',
          date: 'May 18, 2026', postedAt: '2026-05-18T09:00:00Z', lastEditedAt: null,
          version: 'v1.3.0', isBanner: true, isBannerDismissible: true, relatedAnnouncementId: null,
          expiresAt: null, bannerExpiresAt: null },
      ],
      logs: seedLogs(),
      queue: seedQueue(),
      traffic: 'normal',
    };
  }

  // Deterministic-ish mock request logs (no Date.now — fixed clock strings).
  function seedLogs() {
    const users = ['vendouple', 'sarah_dev', 'budi.s', 'mika_ai', 'ratna.w', 'devteam_x'];
    const models = ['claude-opus-4-5', 'gpt-4o', 'gemini-2-pro', 'llama-3-70b', 'deepseek-r1', 'claude-haiku-4'];
    // Parallel to `models` — the ×in/×out rate actually billed for that request.
    const rates = [{ i: 1.00, o: 1.50 }, { i: 0.75, o: 1.00 }, { i: 0.90, o: 1.20 }, { i: 0.15, o: 0.25 }, { i: 0.10, o: 0.20 }, { i: 0.40, o: 0.55 }];
    const chans = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const statuses = ['success', 'success', 'success', 'success', 'retried', 'error'];
    const errKinds = ['429 rate_limited', '503 overloaded', 'timeout', '500 internal', '402 billing'];
    const rows = [];
    let mins = 0;
    for (let i = 0; i < 24; i++) {
      const inTok = 400 + (i * 137) % 5200;
      const outTok = 120 + (i * 89) % 1800;
      // Wide enough spread to cross both the 33k (lite) and 200k (pro)
      // compression thresholds mirrored from users.js CONTEXT_TIERS.
      const ctx = i === 23 ? 245000 : inTok + (i * 2900) % 42000;
      const st = statuses[i % statuses.length];
      const hh = String(16 - Math.floor(mins / 60)).padStart(2, '0');
      const mm = String((60 - (mins % 60)) % 60).padStart(2, '0');
      const channel = chans[i % chans.length];
      const latencyMs = 220 + (i * 173) % 3400;
      const retries = st === 'retried' ? 1 + (i % 2) : (st === 'error' ? 1 + (i % 3) : 0);
      // Build a verbose route trace: the failed hops (from endpoint) then the
      // final routed hop (to endpoint). success = single healthy hop.
      const others = chans.filter(c => c !== channel);
      const route = [];
      if (st === 'error') {
        for (let k = 0; k < retries; k++) route.push({ ep: chans[(i + k) % chans.length], result: errKinds[(i + k) % errKinds.length], ms: 90 + ((i + k) * 77) % 420 });
      } else {
        for (let k = 0; k < retries; k++) route.push({ ep: others[(i + k) % others.length], result: errKinds[(i + k) % errKinds.length], ms: 110 + ((i + k) * 90) % 300 });
        route.push({ ep: channel, result: 'success', ms: latencyMs });
      }
      const rate = rates[i % rates.length];
      // Requests whose context crosses the user-side compression threshold
      // (33k, mirroring users.js CONTEXT_TIERS) get auto-compressed first.
      const compressed = ctx >= 33000;
      rows.push({
        time: `${hh}:${mm}`,
        user: users[i % users.length],
        model: models[i % models.length],
        channel, contextTokens: ctx, inTokens: inTok, outTokens: outTok,
        rateIn: rate.i, rateOut: rate.o,
        credits: Math.round((inTok * 0.001 * rate.i + outTok * 0.0015 * rate.o) * 10) / 10,
        compressed, compressionModel: compressed ? (ctx >= 200000 ? 'orchid-compress-pro' : 'orchid-compress-lite') : null,
        latencyMs, status: st, retries, route,
      });
      mins += 7 + (i % 5);
    }
    return rows;
  }
  // Mock live queue — advanced/drained by a timer for a live feel.
  function seedQueue() {
    const users = ['sarah_dev', 'mika_ai', 'devteam_x', 'ratna.w', 'budi.s', 'anon4821'];
    const models = ['claude-opus-4-5', 'gpt-4o', 'gemini-2-pro', 'deepseek-r1'];
    const tiers = [{ n: 'Elite', p: 8 }, { n: 'Pro', p: 5 }, { n: 'Plus', p: 3 }, { n: 'Basic', p: 1 }, { n: 'Free', p: 0 }];
    const chans = ['Alpha', 'Bravo', 'Charlie'];
    const q = [];
    for (let i = 0; i < 7; i++) {
      const t = tiers[i % tiers.length];
      const running = i < 2;
      // Row 0 shows a live reroute (attempt 2, moved off a bad endpoint) so the
      // queue conveys the same retry→route story as the logs.
      const attempt = running && i === 0 ? 2 : 1;
      q.push({
        id: 'rq' + (1000 + i),
        user: users[i % users.length],
        model: models[i % models.length],
        tier: t.n, priority: t.p,
        channel: running ? chans[i % chans.length] : '—',
        reroutedFrom: attempt > 1 ? 'Charlie' : null,
        attempt,
        state: running ? 'running' : 'queued',
        waited: (i * 3) % 40,
      });
    }
    return q;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to seed */ }
    return seedState();
  }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); publishCatalogue(); }

  let state = loadState();
  normalizeState();

  // Backfill fields added after a user's state was first persisted.
  function normalizeState() {
    if (!Array.isArray(state.groups)) state.groups = JSON.parse(JSON.stringify(GROUPS_SEED));
    (state.models || []).forEach(m => {
      if (m.group == null) m.group = TIER_TO_GROUP[m.tier] || 'free';
      if (m.mIn == null) m.mIn = 0.5;
      if (m.mOut == null) m.mOut = 0.7;
      if (m.launchAt === undefined) m.launchAt = null;
      if (m.deprecateAt === undefined) m.deprecateAt = null;
    });
    if (!Array.isArray(state.announcements)) state.announcements = seedState().announcements;
    state.announcements.forEach(a => {
      if (a.expiresAt === undefined) a.expiresAt = null;
      if (a.bannerExpiresAt === undefined) a.bannerExpiresAt = null;
    });
    if (!Array.isArray(state.logs)) state.logs = seedLogs();
    if (!Array.isArray(state.queue)) state.queue = seedQueue();
    if (!Array.isArray(state.vendors)) state.vendors = JSON.parse(JSON.stringify(VENDORS_SEED));
    (state.models || []).forEach(m => {
      if (m.makerId === undefined) m.makerId = null;
      if (m.delisted === undefined) m.delisted = false;
    });
    if (!Array.isArray(state.pools)) state.pools = [];
    if (!Array.isArray(state.boosterPacks)) state.boosterPacks = JSON.parse(JSON.stringify(BOOSTER_PACKS_SEED));
    state.boosterPacks.forEach(p => {
      if (p.customTag === undefined) p.customTag = null;
      if (p.slashPriceUSD === undefined) p.slashPriceUSD = null;
      if (p.personalization === undefined) p.personalization = null;
      if (p.minTier === undefined) p.minTier = null;
      if (p.maxTier === undefined) p.maxTier = null;
      (p.wallets || []).forEach(w => {
        if (w.iconShape === undefined) w.iconShape = 'circle';
        if (w.iconEmoji === undefined) w.iconEmoji = null;
      });
    });
    (state.tiers || []).forEach(t => {
      if (t.iconShape === undefined) t.iconShape = 'square';
      if (t.iconEmoji === undefined) t.iconEmoji = null;
      // Migrate the short-lived simple tag (text + color) to the customTag model.
      if (t.customTag === undefined) {
        t.customTag = t.tag ? {
          name: t.tag, bgStyle: 'none', bgColors: [],
          borderStyle: 'solid', borderColors: [t.tagColor || t.color],
          textStyle: 'solid', textColors: [t.tagColor || t.color],
          glowing: false,
        } : null;
      }
      if (t.bgStyle === undefined) t.bgStyle = 'none';
      if (!Array.isArray(t.bgColors)) t.bgColors = [];
      if (t.hasBorder === undefined) t.hasBorder = false;
      if (t.borderAnimated === undefined) t.borderAnimated = false;
      if (t.hasGlowing === undefined) t.hasGlowing = false;
      if (t.glowPulse === undefined) t.glowPulse = false;
      if (t.glowAnimated === undefined) t.glowAnimated = false;
      if (t.monthlyEnabled === undefined) t.monthlyEnabled = true;
      if (t.quarterlyEnabled === undefined) t.quarterlyEnabled = false;
      if (t.quarterlyIDR === undefined) t.quarterlyIDR = null;
      if (t.yearlyEnabled === undefined) t.yearlyEnabled = false;
      if (t.yearlyIDR === undefined) t.yearlyIDR = null;
      if (!t.cycleOverrides || typeof t.cycleOverrides !== 'object') t.cycleOverrides = { monthly: null, quarterly: null, yearly: null };
    });
    // Endpoints declare their served modalities + supported params per modality.
    (state.providers || []).forEach(p => {
      if (!p.modalities || typeof p.modalities !== 'object') p.modalities = defaultModalities();
      if (!Array.isArray(p.errorAliasOverrides)) p.errorAliasOverrides = [];
    });
    if (!state.settings) state.settings = seedState().settings;
    if (!Array.isArray(state.settings.retryRules)) state.settings.retryRules = JSON.parse(JSON.stringify(RETRY_RULES_SEED));
    if (!Array.isArray(state.settings.errorAliases)) state.settings.errorAliases = JSON.parse(JSON.stringify(ERROR_ALIASES_SEED));
    if (!Array.isArray(state.settings.retentionOffers)) state.settings.retentionOffers = JSON.parse(JSON.stringify(RETENTION_OFFERS_SEED));
    if (!Array.isArray(state.settings.routingPriority)) {
      state.settings.routingPriority = ROUTING_PRIORITY_DEFAULT.slice();
    } else {
      // Drop unknown factors, append any newly-added ones at the end.
      state.settings.routingPriority = state.settings.routingPriority.filter(f => ROUTING_FACTORS[f]);
      ROUTING_PRIORITY_DEFAULT.forEach(f => { if (!state.settings.routingPriority.includes(f)) state.settings.routingPriority.push(f); });
    }
  }

  const groupById = (id) => (state.groups || []).find(g => g.id === id) || null;
  const groupName = (id) => { const g = groupById(id); return g ? g.name : id; };

  // Bridge: publish groups + per-model overrides so the user dashboard reflects
  // admin edits (group rename/reassign, lifecycle scheduling, multipliers).
  function publishCatalogue() {
    if (!window.OrchidShared) return;
    OrchidShared.set(OrchidShared.KEYS.groups, (state.groups || []).map(g => ({ id: g.id, name: g.name, rank: g.rank, order: g.order })));
    OrchidShared.set(OrchidShared.KEYS.vendors, state.vendors || []);
    const overrides = {};
    (state.models || []).forEach(m => {
      overrides[m.slug] = {
        group: m.group,
        launchAt: m.launchAt || null,
        deprecateAt: m.deprecateAt || null,
        mIn: m.mIn, mOut: m.mOut,
        makerId: m.makerId || null,
        maker: m.maker,
        delisted: !!m.delisted,
        // Always an array so an admin clearing all bands (back to synthesized
        // pricing) actually bridges as "no bands" instead of being dropped.
        contextTiers: Array.isArray(m.contextTiers) ? m.contextTiers : [],
      };
    });
    OrchidShared.set(OrchidShared.KEYS.modelOverrides, overrides);
    // Announcements pass through unchanged — same shape as the user side.
    if (Array.isArray(state.announcements)) {
      OrchidShared.set(OrchidShared.KEYS.announcements, state.announcements);
    }
    // Booster Packs are wholly admin-authored — publish the full list as-is.
    OrchidShared.set(OrchidShared.KEYS.boosterPacks, state.boosterPacks || []);
    // Tier visual styling, keyed by lowercased name so it lines up with the
    // user-side SUBSCRIPTION_TIERS ids (free/basic/plus/pro/elite) without
    // requiring the two id spaces to match exactly.
    const tierStyles = {};
    (state.tiers || []).forEach(t => {
      tierStyles[t.name.toLowerCase()] = {
        iconShape: t.iconShape, iconEmoji: t.iconEmoji,
        customTag: t.customTag || null,
        bgStyle: t.bgStyle, bgColors: t.bgColors,
        hasBorder: t.hasBorder, borderAnimated: t.borderAnimated,
        hasGlowing: t.hasGlowing, glowPulse: t.glowPulse, glowAnimated: t.glowAnimated,
      };
    });
    OrchidShared.set(OrchidShared.KEYS.tierStyles, tierStyles);
    // Tier billing-cycle pricing, keyed the same way as tierStyles.
    const tierPricing = {};
    (state.tiers || []).forEach(t => {
      tierPricing[t.name.toLowerCase()] = {
        monthlyEnabled: t.monthlyEnabled !== false, monthlyIDR: t.idr,
        quarterlyEnabled: !!t.quarterlyEnabled, quarterlyIDR: t.quarterlyIDR,
        yearlyEnabled: !!t.yearlyEnabled, yearlyIDR: t.yearlyIDR,
        cycleOverrides: t.cycleOverrides || null,
      };
    });
    OrchidShared.set(OrchidShared.KEYS.tierPricing, tierPricing);
    OrchidShared.set(OrchidShared.KEYS.retentionOffers, state.settings.retentionOffers || []);
  }

  // Codename helpers — order in the providers array defines the letter.
  const codename = (pv) => 'Endpoint ' + (NATO[state.providers.indexOf(pv)] || 'Zulu-' + state.providers.indexOf(pv));
  const codenameById = (id) => {
    const pv = state.providers.find(p => p.id === id);
    return pv ? codename(pv) : 'Endpoint ?';
  };
  const providerById = (id) => state.providers.find(p => p.id === id);
  // Reverse of codename() — a route-trace hop only carries the NATO letter,
  // so resolving its per-endpoint error-label overrides needs this lookup.
  const providerByLetter = (letter) => state.providers[NATO.indexOf(letter)] || null;

  // Rename a raw upstream error string per admin-defined labels. Endpoint-level
  // overrides win; falls back to the global list; raw string if nothing matches.
  function resolveErrorLabel(raw, letter) {
    if (!raw) return raw;
    const pv = letter ? providerByLetter(letter) : null;
    const overrideHit = pv && pv.errorAliasOverrides ? pv.errorAliasOverrides.find(r => matchesRule(r, raw)) : null;
    if (overrideHit) return overrideHit.label;
    const globalHit = (state.settings.errorAliases || []).find(r => matchesRule(r, raw));
    return globalHit ? globalHit.label : raw;
  }

  const fmt = (n) => n.toLocaleString('en-US');
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ============================================================
  // TOAST
  // ============================================================
  function toast(msg, icon) {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="material-symbols-outlined">${icon || 'check_circle'}</span>${escapeHtml(msg)}`;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 2800);
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // Admin gate — demo lets any signed-in user self-grant admin.
    if (session.role !== 'admin') {
      $('#admin-gate').style.display = 'flex';
      $('#gate-grant-btn').addEventListener('click', () => {
        session.role = 'admin';
        localStorage.setItem('orchid_session', JSON.stringify(session));
        $('#admin-gate').style.display = 'none';
        toast('Demo admin access granted', 'shield_person');
      });
    }
    $('#admin-name').textContent = session.username || 'admin';

    initNav();
    initAlerts();
    initTraffic();
    renderAll();
    initDialogs();
    initSettings();
    publishCatalogue(); // sync groups + overrides to the user dashboard on load
  }

  function renderAll() {
    renderDashboard();
    renderModels();
    renderMakers();
    renderProviders();
    renderTiers();
    renderBoosterPacks();
    renderUsers();
    renderQueue();
    renderLogs();
    renderAnnouncements();
    updateNavDot();
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  const SECTION_TITLES = {
    dashboard: 'Dashboard', models: 'Model Catalog', makers: 'Model Maker', providers: 'Channels',
    subscriptions: 'Subscription Tiers', users: 'Users',
    queue: 'Request Queue', logs: 'Request Logs', announcements: 'Announcements',
    settings: 'Settings',
  };

  function initNav() {
    $$('.nav-rail-item').forEach(btn => {
      btn.addEventListener('click', () => showSection(btn.dataset.section));
    });
    $('#mobile-nav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#nav-rail').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      const rail = $('#nav-rail');
      if (rail.classList.contains('open') && !rail.contains(e.target)) rail.classList.remove('open');
    });
  }

  function showSection(name) {
    $$('.nav-rail-item').forEach(b => b.classList.toggle('active', b.dataset.section === name));
    $$('.admin-section').forEach(s => s.classList.toggle('active', s.id === 'section-' + name));
    $('#topbar-title').textContent = SECTION_TITLES[name] || name;
    $('#nav-rail').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateNavDot() {
    const issue = state.providers.some(p => p.status === 'dead' || p.status === 'out_of_credits');
    $('#nav-provider-dot').style.display = issue ? 'block' : 'none';
  }

  // ============================================================
  // TOPBAR — traffic + alerts
  // ============================================================
  function initTraffic() {
    const pill = $('#traffic-pill');
    pill.dataset.state = state.traffic;
    $('#traffic-label').textContent = state.traffic;
    // Demo: cycle traffic state on click
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', () => {
      const states = ['low', 'normal', 'high', 'peak'];
      state.traffic = states[(states.indexOf(state.traffic) + 1) % states.length];
      pill.dataset.state = state.traffic;
      $('#traffic-label').textContent = state.traffic;
      saveState();
      if (state.traffic === 'high' || state.traffic === 'peak') {
        toast('Free/demo traffic deprioritised — paid users unaffected', 'traffic');
      }
    });
  }

  function initAlerts() {
    const flyout = $('#alerts-flyout');
    $('#alerts-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      flyout.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (flyout.classList.contains('open') && !flyout.contains(e.target)) flyout.classList.remove('open');
    });
    $('#alerts-clear-btn').addEventListener('click', () => {
      state.alerts.forEach(a => a.unread = false);
      saveState();
      renderAlerts();
    });
    renderAlerts();
  }

  function renderAlerts() {
    const list = $('#alerts-flyout-list');
    const iconFor = { error: 'key_off', warning: 'warning', info: 'info' };
    list.innerHTML = state.alerts.map(a => `
      <div class="alert-item ${a.unread ? 'unread' : ''}">
        <div class="alert-icon sev-${a.sev}"><span class="material-symbols-outlined">${iconFor[a.sev]}</span></div>
        <div class="alert-body">
          <div class="alert-title">${escapeHtml(a.title)}</div>
          <div class="alert-desc">${escapeHtml(a.desc)}</div>
          <div class="alert-time">${escapeHtml(a.time)}</div>
        </div>
      </div>`).join('');
    const unread = state.alerts.filter(a => a.unread).length;
    const badge = $('#bell-badge');
    badge.textContent = unread;
    badge.style.display = unread ? 'block' : 'none';
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function renderDashboard() {
    const healthy = state.providers.filter(p => p.status === 'active').length;
    const retries = state.retries.length * 47; // demo scale-up
    const stats = [
      { icon: 'swap_vert', label: 'Requests today', value: '48,213', trend: '+12%', up: true },
      { icon: 'group', label: 'Active users (24h)', value: '1,842', trend: '+4%', up: true },
      { icon: 'autorenew', label: 'Silent retries (24h)', value: fmt(retries), trend: '-8%', up: false, goodDown: true },
      { icon: 'dns', label: 'Healthy providers', value: `${healthy}/${state.providers.length}`, trend: '', up: true },
      { icon: 'timer', label: 'Avg TTFT', value: '640ms', trend: '-5%', up: false, goodDown: true },
      { icon: 'pending_actions', label: 'Queue depth', value: '23', trend: '+3', up: false },
    ];
    $('#stat-grid').innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-icon-row">
          <div class="stat-icon"><span class="material-symbols-outlined">${s.icon}</span></div>
          ${s.trend ? `<div class="stat-trend ${s.up || s.goodDown ? 'up' : 'down'}">
            <span class="material-symbols-outlined">${s.up ? 'trending_up' : 'trending_down'}</span>${s.trend}
          </div>` : ''}
        </div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>`).join('');

    // 24h bar chart (deterministic pseudo-random)
    const chart = $('#req-chart');
    let total = 0;
    let bars = '';
    for (let h = 0; h < 24; h++) {
      const v = Math.round(800 + 1600 * Math.abs(Math.sin(h * 0.7 + 2)) + (h > 11 && h < 15 ? 900 : 0));
      total += v;
      const pct = Math.round((v / 3400) * 100);
      bars += `<div class="bar" style="height:${Math.max(pct, 4)}%" data-tip="${String(h).padStart(2, '0')}:00 — ${fmt(v)} req"></div>`;
    }
    chart.innerHTML = bars;
    $('#req-chart-total').textContent = fmt(total) + ' total';

    // Retry table
    $('#retry-table tbody').innerHTML = state.retries.map(r => `
      <tr>
        <td class="mono">${r.time}</td>
        <td class="mono">${escapeHtml(r.model)}</td>
        <td>${Array.isArray(r.hops) && r.hops.length
          ? r.hops.map(h => 'Endpoint ' + escapeHtml(h)).join(' <span class="rt-arrow">→</span> ')
          : 'Endpoint ' + escapeHtml(r.failedOn)}</td>
        <td><span class="status-chip st-dead" title="${escapeHtml(r.error)}">${escapeHtml(resolveErrorLabel(r.error, (r.failedOn || '').replace('*', '')))}</span></td>
        <td>Endpoint ${escapeHtml(r.via)}</td>
        <td class="mono">${r.attempts}</td>
      </tr>`).join('');

    // Provider health list
    $('#health-list').innerHTML = state.providers.map(p => `
      <div class="health-item" data-goto="providers">
        <div>
          <div class="health-codename">${codename(p)}</div>
          <div class="health-real">${escapeHtml(p.label)} · weight ${p.weight}</div>
        </div>
        <div class="health-right">
          <span class="status-chip st-${p.status}">${p.status.replace(/_/g, ' ')}</span>
          <span class="health-load">${p.inFlight}/${p.maxConcurrent} in flight</span>
        </div>
      </div>`).join('');
    $$('#health-list .health-item').forEach(el => el.addEventListener('click', () => showSection('providers')));

    // Incidents
    $('#incident-list').innerHTML = state.incidents.map(i => `
      <div class="incident-item">
        <div class="incident-strip sev-${i.sev}"></div>
        <div>
          <div class="incident-title">${escapeHtml(i.title)}</div>
          <div class="incident-meta">${escapeHtml(i.meta)}</div>
        </div>
      </div>`).join('');
  }

  // ============================================================
  // MODEL CATALOG
  // ============================================================
  let modelSearchTerm = '';

  function renderModels() {
    renderGroupsPanel();
    renderPools();
    const list = $('#model-list');
    const models = state.models.filter(m =>
      !modelSearchTerm ||
      m.name.toLowerCase().includes(modelSearchTerm) ||
      m.slug.toLowerCase().includes(modelSearchTerm) ||
      m.maker.toLowerCase().includes(modelSearchTerm)
    );
    list.innerHTML = models.map(m => {
      const eps = m.providers.slice().sort((a, b) => a.weight - b.weight);
      const life = modelLifeAdmin(m);
      const lifeChip = life === 'upcoming'
        ? `<span class="lifecycle-chip up"><span class="material-symbols-outlined">rocket_launch</span>launches ${fmtDateAdmin(m.launchAt)}</span>`
        : life === 'retired'
        ? `<span class="lifecycle-chip ret"><span class="material-symbols-outlined">block</span>retired</span>`
        : (m.deprecateAt ? `<span class="lifecycle-chip dep"><span class="material-symbols-outlined">schedule</span>deprecates ${fmtDateAdmin(m.deprecateAt)}</span>` : '');
      const groupOpts = (state.groups || []).map(g => `<option value="${g.id}" ${g.id === m.group ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
      const vendor = vendorById(m.makerId);
      return `
      <div class="model-card ${life === 'retired' ? 'model-retired' : ''}" data-model="${m.id}">
        <div class="model-card-head" data-expand>
          <div class="model-maker-logo">${vendor && vendor.svg ? vendor.svg : escapeHtml(m.maker[0])}</div>
          <div class="model-title-wrap">
            <div class="model-name">
              ${escapeHtml(m.name)}
              <span class="tier-badge grp-badge">${escapeHtml(groupName(m.group))}</span>
              ${lifeChip}
              ${m.active ? '' : '<span class="status-chip st-dead">disabled</span>'}
              ${m.delisted ? '<span class="status-chip delisted-chip"><span class="material-symbols-outlined">visibility_off</span>delisted</span>' : ''}
            </div>
            <div class="model-slug">${escapeHtml(m.slug)} · ${escapeHtml(m.maker)} · ${escapeHtml(m.modality)} · ${fmt(m.context)} ctx · ${m.mIn}× in / ${m.mOut}× out</div>
          </div>
          <div class="model-head-right">
            <span class="model-ep-count"><span class="material-symbols-outlined">dns</span>${eps.length} endpoint${eps.length === 1 ? '' : 's'}</span>
            <button class="icon-btn delist-model-btn ${m.delisted ? 'is-delisted' : ''}" data-model="${m.id}" title="${m.delisted ? 'Delisted — click to relist' : 'Delist (hide from users, keep for pools)'}"><span class="material-symbols-outlined">${m.delisted ? 'visibility_off' : 'visibility'}</span></button>
            <button class="icon-btn edit-model-btn" data-model="${m.id}" title="Edit model"><span class="material-symbols-outlined">edit</span></button>
            <m3e-switch class="model-active-tog" data-model="${m.id}" ${m.active ? 'checked' : ''} icons="selected" title="Model active"></m3e-switch>
            <span class="material-symbols-outlined expand-arrow">expand_more</span>
          </div>
        </div>
        <div class="model-card-body">
          <div class="model-group-assign">
            <label>Group</label>
            <select class="grp-select" data-model="${m.id}">${groupOpts}</select>
            <span class="hint" style="margin:0">Reassigning migrates this model's access on the user dashboard.</span>
          </div>
          <div class="model-body-head">
            <span class="model-body-title">Routing endpoints — lower weight tried first</span>
            <m3e-button variant="tonal" size="extra-small" class="attach-ep-btn" data-model="${m.id}">
              <m3e-icon slot="icon" name="add_link"></m3e-icon> Add Provider
            </m3e-button>
          </div>
          ${eps.length ? eps.map(ep => {
            const pv = providerById(ep.providerId);
            if (!pv) return '';
            return `
            <div class="ep-row">
              <div class="ep-codename"><span class="material-symbols-outlined">dns</span>${codenameById(ep.providerId)}</div>
              <span class="status-chip st-${pv.status}">${pv.status.replace(/_/g, ' ')}</span>
              <span class="ep-metric"><span class="material-symbols-outlined">short_text</span><b>${fmt(ep.contextCap)}</b> ctx cap</span>
              <span class="ep-metric"><span class="material-symbols-outlined">tune</span>${ep.params.length} params</span>
              ${pv.free ? '<span class="free-chip">free ok</span>' : ''}
              <div class="ep-right">
                <span class="ep-weight-badge" title="Weight — lower = better">w ${ep.weight}</span>
                <button class="icon-btn danger detach-ep-btn" data-model="${m.id}" data-provider="${ep.providerId}" title="Detach provider">
                  <span class="material-symbols-outlined">link_off</span>
                </button>
              </div>
            </div>`;
          }).join('') : '<div class="hint" style="margin:0">No providers attached — this model cannot serve requests.</div>'}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
            ${m.caps.map(c => `<span class="cap-chip"><span class="material-symbols-outlined" style="font-size:13px">check</span>${c}</span>`).join('')}
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="hint">No models match your search.</div>';

    // Expand/collapse
    $$('#model-list [data-expand]').forEach(head => {
      head.addEventListener('click', (e) => {
        if (e.target.closest('m3e-switch')) return;
        head.closest('.model-card').classList.toggle('expanded');
      });
    });
    // Active toggle
    $$('#model-list .model-active-tog').forEach(sw => {
      sw.addEventListener('change', () => {
        const m = state.models.find(x => x.id === sw.dataset.model);
        m.active = !!sw.checked;
        saveState();
        toast(`${m.name} ${m.active ? 'enabled' : 'disabled — hidden from catalog'}`, m.active ? 'visibility' : 'visibility_off');
        renderModels();
      });
    });
    // Attach provider
    $$('#model-list .attach-ep-btn').forEach(btn => {
      btn.addEventListener('click', () => openAttachDialog(btn.dataset.model));
    });
    // Detach
    $$('#model-list .detach-ep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = state.models.find(x => x.id === btn.dataset.model);
        m.providers = m.providers.filter(ep => ep.providerId !== btn.dataset.provider);
        saveState();
        toast(`${codenameById(btn.dataset.provider)} detached from ${m.name}`, 'link_off');
        renderModels();
        // keep card expanded
        const card = $(`#model-list .model-card[data-model="${m.id}"]`);
        if (card) card.classList.add('expanded');
      });
    });

    // Edit model
    $$('#model-list .edit-model-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openModelDialog(btn.dataset.model); });
    });
    // Quick delist / relist
    $$('#model-list .delist-model-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = state.models.find(x => x.id === btn.dataset.model);
        if (!m) return;
        m.delisted = !m.delisted;
        saveState();
        toast(`${m.name} ${m.delisted ? 'delisted — hidden from users, still callable via pools' : 'relisted — visible to users again'}`, m.delisted ? 'visibility_off' : 'visibility');
        renderModels();
      });
    });
    // Inline group reassignment
    $$('#model-list .grp-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const m = state.models.find(x => x.id === sel.dataset.model);
        if (!m) return;
        m.group = sel.value;
        saveState();
        toast(`${m.name} moved to ${groupName(m.group)} — migrated on user dashboard`, 'sync_alt');
        renderModels();
        const card = $(`#model-list .model-card[data-model="${m.id}"]`);
        if (card) card.classList.add('expanded');
      });
    });

    $('#model-search').oninput = (e) => {
      modelSearchTerm = e.target.value.trim().toLowerCase();
      renderModels();
    };
  }

  // Lifecycle helpers (admin side).
  function modelLifeAdmin(m) {
    const now = Date.now();
    if (m.deprecateAt && now >= Date.parse(m.deprecateAt)) return 'retired';
    if (m.launchAt && now < Date.parse(m.launchAt)) return 'upcoming';
    return 'active';
  }
  function fmtDateAdmin(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  // For <input type="date"> value binding.
  function toDateInput(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  function fromDateInput(v) { return v ? new Date(v + 'T00:00:00Z').toISOString() : null; }

  // ============================================================
  // MODEL GROUPS MANAGER
  // ============================================================
  function renderGroupsPanel() {
    const panel = $('#groups-panel');
    if (!panel) return;
    const groups = (state.groups || []).slice().sort((a, b) => a.order - b.order);
    panel.innerHTML = `
      <div class="groups-head">
        <div class="groups-title"><span class="material-symbols-outlined">workspaces</span>Model Groups <span class="hint" style="margin:0">named access tiers · bridged to users</span></div>
        <m3e-button variant="tonal" size="small" id="add-group-btn"><m3e-icon slot="icon" name="add"></m3e-icon> Add Group</m3e-button>
      </div>
      <div class="groups-row">
        ${groups.map(g => {
          const count = (state.models || []).filter(m => m.group === g.id).length;
          return `<div class="group-chip-card" data-group="${g.id}">
            <div class="gcc-name">${escapeHtml(g.name)}</div>
            <div class="gcc-meta">${count} model${count === 1 ? '' : 's'} · rank ${g.rank}</div>
            <div class="gcc-actions">
              <button class="icon-btn rename-group-btn" data-group="${g.id}" title="Rename"><span class="material-symbols-outlined">edit</span></button>
              <button class="icon-btn danger delete-group-btn" data-group="${g.id}" title="Delete"><span class="material-symbols-outlined">delete</span></button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $('#add-group-btn').addEventListener('click', addGroup);
    $$('#groups-panel .rename-group-btn').forEach(b => b.addEventListener('click', () => renameGroup(b.dataset.group)));
    $$('#groups-panel .delete-group-btn').forEach(b => b.addEventListener('click', () => deleteGroup(b.dataset.group)));
  }

  function addGroup() {
    const name = (prompt('New group name (e.g. "Ultra")') || '').trim();
    if (!name) return;
    const id = 'g' + Date.now();
    const maxRank = Math.max(0, ...(state.groups || []).map(g => g.rank));
    const maxOrder = Math.max(-1, ...(state.groups || []).map(g => g.order));
    state.groups.push({ id, name, rank: maxRank + 1, order: maxOrder + 1 });
    saveState();
    toast(`Group "${name}" created`, 'workspaces');
    renderModels();
  }
  function renameGroup(id) {
    const g = groupById(id);
    if (!g) return;
    const name = (prompt('Rename group', g.name) || '').trim();
    if (!name) return;
    g.name = name;
    saveState();
    toast(`Group renamed to "${name}" — updated on user dashboard`, 'sync_alt');
    renderModels();
  }
  function deleteGroup(id) {
    const g = groupById(id);
    if (!g) return;
    const members = (state.models || []).filter(m => m.group === id);
    const fallback = (state.groups || []).find(x => x.id !== id);
    if (!fallback) { toast('At least one group is required', 'error'); return; }
    if (!confirm(`Delete group "${g.name}"?${members.length ? ` ${members.length} model(s) will migrate to "${fallback.name}".` : ''}`)) return;
    members.forEach(m => { m.group = fallback.id; });
    state.groups = state.groups.filter(x => x.id !== id);
    saveState();
    toast(`Group "${g.name}" deleted${members.length ? ` — ${members.length} model(s) migrated` : ''}`, 'delete');
    renderModels();
  }

  // ============================================================
  // MODEL MAKER — vendors (name + SVG mark), assignable to models
  // ============================================================
  function vendorById(id) { return (state.vendors || []).find(v => v.id === id) || null; }

  function renderMakers() {
    const grid = $('#maker-grid');
    if (!grid) return;
    const vendors = state.vendors || [];
    grid.innerHTML = vendors.length ? vendors.map(v => {
      const count = (state.models || []).filter(m => m.makerId === v.id).length;
      return `
      <div class="maker-card" data-maker="${v.id}">
        <div class="maker-card-logo">${v.svg || ''}</div>
        <div class="maker-card-name">${escapeHtml(v.name)}</div>
        <div class="maker-card-meta">${count} model${count === 1 ? '' : 's'}</div>
        <div class="maker-card-actions">
          <button class="icon-btn edit-maker-btn" data-maker="${v.id}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="icon-btn danger delete-maker-btn" data-maker="${v.id}" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>`;
    }).join('') : '<div class="hint">No makers yet — add one to assign it to models.</div>';
    $$('#maker-grid .edit-maker-btn').forEach(b => b.addEventListener('click', () => openMakerDialog(b.dataset.maker)));
    $$('#maker-grid .delete-maker-btn').forEach(b => b.addEventListener('click', () => deleteMaker(b.dataset.maker)));
  }

  let editingMakerId = null;
  function openMakerDialog(id) {
    editingMakerId = id || null;
    const v = id ? vendorById(id) : null;
    $('#maker-dlg-title').textContent = v ? `Edit Maker — ${v.name}` : 'New Maker';
    $('#mk-name').value = v ? v.name : '';
    $('#mk-svg').value = v ? v.svg : '';
    $('#mk-preview').innerHTML = v ? v.svg : '';
    $('#maker-dlg').show();
  }

  function saveMaker() {
    const name = $('#mk-name').value.trim();
    const svg = $('#mk-svg').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    if (editingMakerId) {
      const v = vendorById(editingMakerId);
      Object.assign(v, { name, svg });
      toast(`${name} updated`, 'save');
    } else {
      state.vendors.push({ id: 'v' + Date.now(), name, svg });
      toast(`${name} added — assign it to models in the catalog`, 'factory');
    }
    saveState();
    $('#maker-dlg').hide();
    renderMakers();
    renderModels(); // vendor logos may be showing in the model list
  }

  function deleteMaker(id) {
    const v = vendorById(id);
    if (!v) return;
    const members = (state.models || []).filter(m => m.makerId === id);
    if (!confirm(`Delete maker "${v.name}"?${members.length ? ` ${members.length} model(s) will lose their logo.` : ''}`)) return;
    members.forEach(m => { m.makerId = null; });
    state.vendors = state.vendors.filter(x => x.id !== id);
    saveState();
    toast(`Maker "${v.name}" deleted`, 'delete');
    renderMakers();
    renderModels();
  }

  // ============================================================
  // ANNOUNCEMENTS (authored here → bridged to the user dashboard)
  // ============================================================
  let editingAnnId = null;
  const stripMd = (s) => String(s || '').replace(/[#*`>_~\-]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

  // How many announcements currently count as "an active banner" (used to
  // enforce the 3-banner cap). Excludes `excludeId` (the one being edited).
  function activeBannerCount(excludeId) {
    const now = Date.now();
    return (state.announcements || []).filter(a =>
      a.id !== excludeId && a.isBanner &&
      !(a.expiresAt && now >= Date.parse(a.expiresAt)) &&
      !(a.bannerExpiresAt && now >= Date.parse(a.bannerExpiresAt))
    ).length;
  }

  function renderAnnouncements() {
    const list = $('#ann-list');
    if (!list) return;
    const now = Date.now();
    const items = (state.announcements || []).slice().sort((a, b) => Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0));
    list.innerHTML = items.length ? items.map(a => {
      const typeLabel = a.type === 'both' ? 'Announcement + Changelog' : (a.type === 'changelog' ? 'Changelog' : 'Announcement');
      const expired = a.expiresAt && now >= Date.parse(a.expiresAt);
      const bannerExpired = a.bannerExpiresAt && now >= Date.parse(a.bannerExpiresAt);
      let bannerChip = '';
      if (a.isBanner) {
        bannerChip = (expired || bannerExpired)
          ? '<span class="ann-type-chip" style="opacity:.65"><span class="material-symbols-outlined" style="font-size:13px">campaign</span>banner expired</span>'
          : `<span class="ann-type-chip banner"><span class="material-symbols-outlined" style="font-size:13px">campaign</span>banner${a.isBannerDismissible === false ? ' · persistent' : ''}</span>`;
      }
      return `
      <div class="ann-card ${expired ? 'ann-expired' : ''}" data-ann="${a.id}">
        <div class="ann-card-main">
          <div class="ann-card-title">${escapeHtml(a.title)}
            ${a.version ? `<span class="tier-badge">${escapeHtml(a.version)}</span>` : ''}
            <span class="ann-type-chip tone-${a.tone}">${typeLabel}</span>
            ${bannerChip}
            ${expired ? '<span class="ann-type-chip" style="opacity:.65">expired — hidden from users</span>' : ''}
          </div>
          <div class="ann-card-snippet">${escapeHtml(stripMd(a.description).slice(0, 150))}${a.description && a.description.length > 150 ? '…' : ''}</div>
          <div class="ann-card-meta">${escapeHtml(a.date || '')}${a.lastEditedAt ? ' · edited' : ''}${a.expiresAt ? ` · expires ${fmtDateAdmin(a.expiresAt)}` : ''}${a.bannerExpiresAt ? ` · banner until ${fmtDateAdmin(a.bannerExpiresAt)}` : ''}</div>
        </div>
        <div class="ann-card-actions">
          <button class="icon-btn edit-ann-btn" data-ann="${a.id}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="icon-btn danger del-ann-btn" data-ann="${a.id}" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>`;
    }).join('') : '<div class="hint">No announcements yet — create one to publish it to users.</div>';
    $$('#ann-list .edit-ann-btn').forEach(b => b.addEventListener('click', () => openAnnDialog(b.dataset.ann)));
    $$('#ann-list .del-ann-btn').forEach(b => b.addEventListener('click', () => deleteAnnouncement(b.dataset.ann)));
  }

  function openAnnDialog(id) {
    editingAnnId = id || null;
    const a = id ? (state.announcements || []).find(x => x.id === id) : null;
    $('#ann-dlg-title').textContent = a ? 'Edit Announcement' : 'New Announcement';
    $('#an-title').value = a ? a.title : '';
    $('#an-type').value = a ? a.type : 'announcement';
    $('#an-tone').value = a ? a.tone : 'info';
    $('#an-version').value = a ? (a.version || '') : '';
    $('#an-banner-title').value = a ? (a.bannerTitle || '') : '';
    $('#an-desc').value = a ? a.description : '';
    setSwitch($('#an-is-banner'), a ? !!a.isBanner : false);
    setSwitch($('#an-banner-dismissible'), a ? !!a.isBannerDismissible : true);
    $('#an-expires').value = a ? toDateInput(a.expiresAt) : '';
    $('#an-banner-expires').value = a ? toDateInput(a.bannerExpiresAt) : '';
    // Related-changelog options (other announcements).
    const opts = ['<option value="">— none —</option>'].concat(
      (state.announcements || []).filter(x => x.id !== id).map(x => `<option value="${x.id}" ${a && a.relatedAnnouncementId === x.id ? 'selected' : ''}>${escapeHtml(x.title)}</option>`)
    );
    $('#an-related').innerHTML = opts.join('');
    $('#ann-dlg').show();
  }

  function saveAnnouncement() {
    const title = $('#an-title').value.trim();
    if (!title) { toast('Title is required', 'error'); return; }
    const isBanner = !!$('#an-is-banner').checked;
    if (isBanner && activeBannerCount(editingAnnId) >= 3) {
      toast('Max 3 banners allowed — turn one off first', 'error');
      return;
    }
    const nowIso = isoNow();
    const data = {
      type: $('#an-type').value,
      tone: $('#an-tone').value,
      version: $('#an-version').value.trim(),
      bannerTitle: $('#an-banner-title').value.trim() || title,
      title,
      description: $('#an-desc').value,
      isBanner,
      isBannerDismissible: !!$('#an-banner-dismissible').checked,
      relatedAnnouncementId: $('#an-related').value || null,
      date: fmtDateAdmin(nowIso),
      expiresAt: fromDateInput($('#an-expires').value),
      bannerExpiresAt: fromDateInput($('#an-banner-expires').value),
    };
    if (editingAnnId) {
      const a = state.announcements.find(x => x.id === editingAnnId);
      Object.assign(a, data, { lastEditedAt: nowIso });
      toast('Announcement updated & republished', 'save');
    } else {
      state.announcements.unshift(Object.assign({ id: 'an' + Date.now(), postedAt: nowIso, lastEditedAt: null }, data));
      toast('Announcement published to users', 'campaign');
    }
    saveState();
    $('#ann-dlg').hide();
    renderAnnouncements();
  }

  function deleteAnnouncement(id) {
    const a = (state.announcements || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Delete "${a.title}"? It will be removed from the user dashboard.`)) return;
    state.announcements = state.announcements.filter(x => x.id !== id);
    saveState();
    toast('Announcement deleted', 'delete');
    renderAnnouncements();
  }

  // ISO timestamp without relying on Date.now at module-eval time.
  function isoNow() { return new Date().toISOString(); }
  function setSwitch(el, on) { if (!el) return; el.checked = !!on; if (on) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }

  // ============================================================
  // REQUEST LOGS
  // ============================================================
  let logSearchTerm = '';
  let logStatusFilter = 'all';
  function renderLogs() {
    const tb = $('#logs-table tbody');
    if (!tb) return;
    const rows = (state.logs || []).filter(r =>
      (logStatusFilter === 'all' || r.status === logStatusFilter) &&
      (!logSearchTerm || r.model.toLowerCase().includes(logSearchTerm) || r.user.toLowerCase().includes(logSearchTerm) || r.channel.toLowerCase().includes(logSearchTerm))
    );
    tb.innerHTML = rows.map((r, i) => {
      // Only give rows with a real story (a retry or a hard failure) the
      // click-to-expand trace — a plain first-try success needs no disclosure.
      const hasTrace = Array.isArray(r.route) && (r.retries || r.status === 'error');
      const compHop = r.compressed ? `
        <span class="rt-hop rt-comp" title="Compressed via ${escapeHtml(r.compressionModel)}">
          <span class="material-symbols-outlined">compress</span>${escapeHtml(r.compressionModel)}
        </span><span class="rt-arrow">→</span>` : '';
      const traceRow = hasTrace ? `
        <tr class="log-detail" data-log="${i}" hidden>
          <td colspan="11">
            <div class="route-trace">
              <span class="rt-label">Route</span>
              ${compHop}
              ${r.route.map((h, k) => `
                <span class="rt-hop rt-${h.result === 'success' ? 'ok' : 'fail'}">
                  <span class="material-symbols-outlined">${h.result === 'success' ? 'check_circle' : 'error'}</span>
                  Endpoint ${escapeHtml(h.ep)} · ${escapeHtml(h.result === 'success' ? 'success' : resolveErrorLabel(h.result, h.ep))} · ${fmt(h.ms)}ms
                </span>${k < r.route.length - 1 ? '<span class="rt-arrow">→</span>' : ''}`).join('')}
              ${r.status === 'error' ? '<span class="rt-final rt-fail">all endpoints exhausted — surfaced to user</span>'
                : (r.retries ? `<span class="rt-final rt-ok">recovered after ${r.retries} retr${r.retries === 1 ? 'y' : 'ies'} — user saw no error</span>` : '')}
              <span class="rt-final rt-bill">billed ${r.credits} cr · ${r.rateIn}× in / ${r.rateOut}× out</span>
            </div>
          </td>
        </tr>` : '';
      return `
      <tr class="log-row${hasTrace ? ' has-trace' : ''}" data-log="${i}">
        <td class="mono">${r.time}</td>
        <td>${escapeHtml(r.user)}</td>
        <td class="mono">${escapeHtml(r.model)}</td>
        <td>${hasTrace && r.retries ? `<span class="route-summary">Endpoint ${escapeHtml(r.route[0].ep)} <span class="rt-arrow">→</span> Endpoint ${escapeHtml(r.channel)}</span>` : 'Endpoint ' + escapeHtml(r.channel)}</td>
        <td>${r.compressed ? `<span class="comp-chip" title="Compressed via ${escapeHtml(r.compressionModel)}"><span class="material-symbols-outlined">compress</span></span>` : '<span class="hint" style="margin:0">—</span>'}</td>
        <td>${fmt(r.contextTokens)}</td>
        <td>${fmt(r.inTokens)}→${fmt(r.outTokens)}</td>
        <td>${r.credits}<span class="log-rate">${r.rateIn}×/${r.rateOut}×</span></td>
        <td>${fmt(r.latencyMs)}ms</td>
        <td>${r.retries || 0}${hasTrace ? ' <span class="material-symbols-outlined trace-caret">expand_more</span>' : ''}</td>
        <td><span class="status-chip log-${r.status}">${r.status}</span></td>
      </tr>${traceRow}`;
    }).join('') || '<tr><td colspan="11" class="hint" style="padding:16px">No logs match.</td></tr>';
    $$('#logs-table .log-row.has-trace').forEach(row => {
      row.addEventListener('click', () => {
        const detail = tb.querySelector(`.log-detail[data-log="${row.dataset.log}"]`);
        if (!detail) return;
        detail.hidden = !detail.hidden;
        row.classList.toggle('trace-open', !detail.hidden);
      });
    });
  }

  // ============================================================
  // REQUEST QUEUE (priority-ordered; drains over time)
  // ============================================================
  let queueTimer = null;
  let queuePaused = false;
  let queueSeq = 2000;
  function renderQueue() {
    const tb = $('#queue-table tbody');
    if (!tb) return;
    const q = (state.queue || []).slice().sort((a, b) => {
      const sr = (a.state === 'running' ? 0 : 1) - (b.state === 'running' ? 0 : 1);
      return sr !== 0 ? sr : (b.priority - a.priority);
    });
    tb.innerHTML = q.map((r, i) => `
      <tr class="${r.state === 'running' ? 'q-running' : ''}">
        <td>${i + 1}</td>
        <td class="mono">${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.user)}</td>
        <td class="mono">${escapeHtml(r.model)}</td>
        <td>${escapeHtml(r.tier)}</td>
        <td><span class="prio-badge">P${r.priority}</span></td>
        <td>${r.channel === '—' ? '—' : 'Endpoint ' + escapeHtml(r.channel)
          + (r.reroutedFrom ? `<span class="q-reroute" title="Rerouted after a failed attempt">↻ from ${escapeHtml(r.reroutedFrom)}</span>` : '')
          + (r.attempt > 1 ? `<span class="q-attempt">attempt ${r.attempt}</span>` : '')}</td>
        <td><span class="status-chip ${r.state === 'running' ? 'st-active' : 'q-wait'}">${r.state}</span></td>
        <td>${r.waited}s</td>
      </tr>`).join('') || '<tr><td colspan="9" class="hint" style="padding:16px">Queue is empty.</td></tr>';
    const summary = $('#queue-summary');
    if (summary) {
      const running = q.filter(r => r.state === 'running').length;
      summary.innerHTML = `<span class="q-stat"><b>${q.length}</b> in queue</span><span class="q-stat"><b>${running}</b> running</span><span class="q-stat"><b>${q.length - running}</b> waiting</span>`;
    }
  }
  function tickQueue() {
    if (queuePaused) return;
    const q = state.queue || [];
    // Promote a waiting request; complete a running one occasionally.
    const running = q.filter(r => r.state === 'running');
    const waiting = q.filter(r => r.state === 'queued').sort((a, b) => b.priority - a.priority);
    if (running.length && Math.random() < 0.6) {
      const done = running[0];
      state.queue = q.filter(r => r.id !== done.id);
    }
    q.forEach(r => { if (r.state === 'queued') r.waited += 2; });
    const stillRunning = (state.queue || []).filter(r => r.state === 'running').length;
    if (stillRunning < 2 && waiting.length) {
      const promote = waiting[0];
      const found = (state.queue || []).find(r => r.id === promote.id);
      if (found) {
        found.state = 'running';
        found.channel = ['Alpha', 'Bravo', 'Charlie'][Math.floor(Math.random() * 3)];
        // ~40% of promotions simulate a first attempt that failed and rerouted,
        // so the queue keeps telling the retry→route story as it drains.
        if (Math.random() < 0.4) {
          found.attempt = 2;
          found.reroutedFrom = ['Charlie', 'Delta', 'Echo'].filter(c => c !== found.channel)[Math.floor(Math.random() * 2)];
        } else {
          found.attempt = 1; found.reroutedFrom = null;
        }
      }
    }
    // Occasionally enqueue a fresh request so the queue never empties.
    if ((state.queue || []).length < 8 && Math.random() < 0.5) {
      const tiers = [{ n: 'Elite', p: 8 }, { n: 'Pro', p: 5 }, { n: 'Plus', p: 3 }, { n: 'Free', p: 0 }];
      const t = tiers[Math.floor(Math.random() * tiers.length)];
      state.queue.push({ id: 'rq' + (++queueSeq), user: ['sarah_dev', 'mika_ai', 'anon4821', 'ratna.w'][Math.floor(Math.random() * 4)], model: ['claude-opus-4-5', 'gpt-4o', 'gemini-2-pro', 'deepseek-r1'][Math.floor(Math.random() * 4)], tier: t.n, priority: t.p, channel: '—', state: 'queued', waited: 0 });
    }
    renderQueue();
  }

  // ============================================================
  // PROVIDERS
  // ============================================================
  // Weighted-random routing share: eligible (active) channels split traffic
  // inversely to weight (lower weight = larger share).
  function routingShares() {
    const active = state.providers.filter(p => p.status === 'active');
    const inv = active.map(p => 1 / Math.max(1, p.weight));
    const total = inv.reduce((s, v) => s + v, 0) || 1;
    const map = {};
    active.forEach((p, i) => { map[p.id] = Math.round((inv[i] / total) * 100); });
    return map;
  }

  function renderProviders() {
    const grid = $('#provider-grid');
    const shares = routingShares();
    const s = state.settings || {};
    const policyBanner = `
      <div class="channels-policy">
        <div class="cp-item"><span class="material-symbols-outlined">alt_route</span><div><div class="cp-label">Routing</div><div class="cp-val">${(s.routingStrategy || 'weight') === 'weight' ? 'Weighted random' : escapeHtml(s.routingStrategy)}</div></div></div>
        <div class="cp-item"><span class="material-symbols-outlined">replay</span><div><div class="cp-label">Retry</div><div class="cp-val">${s.retryEnabled ? `up to ${s.retryMax}× · ${s.retryBackoff}ms backoff${s.retryCross ? ' · cross-channel' : ''}` : 'disabled'}</div></div></div>
        <div class="cp-item"><span class="material-symbols-outlined">bolt</span><div><div class="cp-label">Retryable</div><div class="cp-val">${(s.retryCodes || []).join(', ') || '—'}</div></div></div>
        <div class="cp-item"><span class="material-symbols-outlined">timer</span><div><div class="cp-label">Queue timeout</div><div class="cp-val">${s.queueTimeout || 90}s · re-probe ${s.probeInterval || 5}m</div></div></div>
      </div>`;
    grid.innerHTML = policyBanner + state.providers.map(p => {
      const attachedModels = state.models.filter(m => m.providers.some(ep => ep.providerId === p.id)).length;
      const hasIssue = p.status === 'dead' || p.status === 'out_of_credits';
      const share = shares[p.id] || 0;
      return `
      <div class="provider-card ${hasIssue ? 'has-issue' : ''}">
        <div class="pc-head">
          <div class="pc-glyph">${codename(p).replace('Endpoint ', '')[0]}</div>
          <div>
            <div class="pc-title">${codename(p)}</div>
            <div class="pc-sub">${escapeHtml(p.label)} · OpenAI-compatible</div>
            <div class="pc-url">${escapeHtml(p.url)}</div>
          </div>
          <div class="pc-head-right"><span class="status-chip st-${p.status}">${p.status.replace(/_/g, ' ')}</span></div>
        </div>
        <div class="pc-metrics">
          <div class="pc-metric">
            <div class="pc-metric-label">Weight</div>
            <div class="pc-metric-value">${p.weight} <small>lower = better</small></div>
          </div>
          <div class="pc-metric">
            <div class="pc-metric-label">Routing share</div>
            <div class="pc-metric-value">${p.status === 'active' ? share + '%' : '<small>inactive</small>'}</div>
            <div class="pc-share-bar"><span style="width:${p.status === 'active' ? share : 0}%"></span></div>
          </div>
          <div class="pc-metric">
            <div class="pc-metric-label">Concurrency</div>
            <div class="pc-metric-value">${p.inFlight}<small>/${p.maxConcurrent}</small></div>
          </div>
          <div class="pc-metric">
            <div class="pc-metric-label">Free tier</div>
            <div class="pc-metric-value" style="color:${p.free ? 'var(--st-active)' : 'var(--md-sys-color-outline)'}">${p.free ? 'Yes' : 'No'}</div>
          </div>
        </div>
        <div class="pc-modalities">
          <div class="pc-keys-head" style="margin-bottom:6px"><span>Modality support</span></div>
          ${Object.keys(p.modalities || {}).length ? Object.entries(p.modalities).map(([mod, params]) =>
            `<div class="pc-mod-row"><span class="pc-mod-name">${mod}</span><span class="pc-mod-params">${params.length ? params.map(x => escapeHtml(x)).join(', ') : '<em>no params</em>'}</span></div>`
          ).join('') : '<div class="hint" style="margin:0">No modalities configured</div>'}
        </div>
        <div>
          <div class="pc-keys-head">
            <span>Key pool (${p.keys.length}) — LRU rotation</span>
            <span>${attachedModels} model${attachedModels === 1 ? '' : 's'}</span>
          </div>
          <div class="pc-key-list" style="margin-top:8px">
            ${p.keys.map((k, i) => `
              <div class="pc-key-row">
                <span class="key-dot k-${k.status}"></span>
                <span class="pc-key-preview">${escapeHtml(k.preview)}</span>
                <span class="key-status-label k-${k.status}">${k.status.replace(/_/g, ' ')}</span>
                <button class="icon-btn danger pv-key-del" data-provider="${p.id}" data-key="${i}" title="Revoke key" style="width:28px;height:28px">
                  <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                </button>
              </div>`).join('')}
          </div>
        </div>
        <div class="pc-actions">
          <m3e-button variant="text" size="extra-small" class="pv-probe-btn" data-provider="${p.id}">
            <m3e-icon slot="icon" name="ecg_heart"></m3e-icon> Probe
          </m3e-button>
          <m3e-button variant="text" size="extra-small" class="pv-keys-btn" data-provider="${p.id}">
            <m3e-icon slot="icon" name="library_add"></m3e-icon> Add Keys
          </m3e-button>
          <m3e-button variant="outlined" size="extra-small" class="pv-edit-btn" data-provider="${p.id}">
            <m3e-icon slot="icon" name="edit"></m3e-icon> Edit
          </m3e-button>
        </div>
      </div>`;
    }).join('');

    $$('.pv-edit-btn').forEach(b => b.addEventListener('click', () => openProviderDialog(b.dataset.provider)));
    $$('.pv-keys-btn').forEach(b => b.addEventListener('click', () => openBulkKeysDialog(b.dataset.provider)));
    $$('.pv-key-del').forEach(b => b.addEventListener('click', () => {
      const p = providerById(b.dataset.provider);
      p.keys.splice(Number(b.dataset.key), 1);
      saveState();
      toast(`Key revoked on ${codename(p)}`, 'key_off');
      renderProviders();
      renderDashboard();
    }));
    $$('.pv-probe-btn').forEach(b => b.addEventListener('click', () => {
      const p = providerById(b.dataset.provider);
      toast(`Probing ${codename(p)}…`, 'ecg_heart');
      setTimeout(() => {
        if (p.status === 'rate_limited') {
          p.status = 'active';
          p.keys.forEach(k => { if (k.status === 'rate_limited') k.status = 'healthy'; });
          toast(`${codename(p)} restored — back in rotation`, 'check_circle');
        } else if (p.status === 'active') {
          toast(`${codename(p)} healthy — 200 OK`, 'check_circle');
        } else {
          toast(`${codename(p)} still ${p.status.replace(/_/g, ' ')}`, 'error');
        }
        saveState();
        renderProviders();
        renderDashboard();
        updateNavDot();
      }, 900);
    }));
  }

  // ============================================================
  // SUBSCRIPTION TIERS
  // ============================================================
  function renderTiers() {
    const grid = $('#tier-grid');
    grid.innerHTML = state.tiers.map(t => `
      <div class="tier-card" style="--tier-c:${t.color}">
        <div class="tier-card-head">
          <div class="tier-name-row">
            <span class="tier-swatch"></span>
            <span class="tier-name">${escapeHtml(t.name)}</span>
          </div>
          <div class="tier-price">${t.idr ? `<b>Rp ${fmt(t.idr)}</b>/mo · $${t.usd}/mo` : '<b>Free</b>'}</div>
        </div>
        <div class="tier-cycles-note">
          ${[
            t.monthlyEnabled !== false ? 'Monthly' : null,
            t.quarterlyEnabled ? `Quarterly (Rp ${fmt(t.quarterlyIDR)})` : null,
            t.yearlyEnabled ? `Yearly (Rp ${fmt(t.yearlyIDR)})` : null,
          ].filter(Boolean).join(' · ') || 'No billing cycles enabled'}
          ${['monthly', 'quarterly', 'yearly'].some(c => t.cycleOverrides && t.cycleOverrides[c] && new Date(t.cycleOverrides[c].until) > new Date()) ? ' · <span style="color:#F59E0B">⚡ Limited offer active</span>' : ''}
        </div>
        <div class="tier-rows">
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">toll</span>Standard credits</span><span class="tier-row-value">${fmt(t.std)}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">bolt</span>Fast credits</span><span class="tier-row-value">${t.fast ? fmt(t.fast) : '—'}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">low_priority</span>Queue priority</span><span class="tier-row-value">${t.priority}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">speed</span>RPM limit</span><span class="tier-row-value">${t.rpm}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">stacks</span>Concurrent requests</span><span class="tier-row-value">${t.concurrent === -1 ? '∞' : t.concurrent}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">category</span>Model access</span><span class="tier-row-value">${escapeHtml(t.access)}</span></div>
          <div class="tier-row"><span class="tier-row-label"><span class="material-symbols-outlined">history</span>Rollover</span><span class="tier-row-value">${t.rollover ? 'Yes' : 'No'}</span></div>
        </div>
        <div class="tier-card-actions">
          ${t.name === 'Free' ? '' : `<button class="icon-btn danger tier-del-btn" data-tier="${t.id}" title="Delete tier"><span class="material-symbols-outlined">delete</span></button>`}
          <m3e-button variant="outlined" size="extra-small" class="tier-edit-btn" data-tier="${t.id}">
            <m3e-icon slot="icon" name="edit"></m3e-icon> Edit
          </m3e-button>
        </div>
      </div>`).join('');

    $$('.tier-edit-btn').forEach(b => b.addEventListener('click', () => openTierDialog(b.dataset.tier)));
    $$('.tier-del-btn').forEach(b => b.addEventListener('click', () => {
      const t = state.tiers.find(x => x.id === b.dataset.tier);
      state.tiers = state.tiers.filter(x => x.id !== b.dataset.tier);
      saveState();
      toast(`Tier "${t.name}" deleted`, 'delete');
      renderTiers();
    }));
  }

  // ============================================================
  // BOOSTER PACKS
  // ============================================================
  let editingBoosterId = null;
  let editingBoosterWallets = [];

  // ---- Custom tag editor (shared by the booster + tier dialogs) ----
  // Reads/writes the same customTag model booster-seed.js renders:
  // bg / border / text each independently none|solid|gradient|animated with
  // their own colors, plus an optional glow. The live preview uses the exact
  // user-side renderer (OrchidTagBadge) so admin sees precisely what ships.
  const tagColorsByStyle = (style, c1, c2, c3) =>
    style === 'none' ? [] : style === 'solid' ? [c1] : style === 'gradient' ? [c1, c2] : [c1, c2, c3];

  function fillTagEditor(prefix, tag) {
    const on = !!tag;
    $(`#${prefix}-custom`).checked = on;
    $(`#${prefix}-editor`).style.display = on ? '' : 'none';
    const t = tag || {};
    // Color inputs only accept #rrggbb — legacy seeds carry rgba() glow
    // colors, which fall back to a sane default here (kept intact on disk
    // until the admin actually re-saves the tag).
    const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : d;
    $(`#${prefix}-name`).value = t.name || '';
    $(`#${prefix}-bg-style`).value = t.bgStyle || 'solid';
    const bg = t.bgColors || [];
    $(`#${prefix}-bg-c1`).value = hex(bg[0], '#7c3aed');
    $(`#${prefix}-bg-c2`).value = hex(bg[1], '#ec4899');
    $(`#${prefix}-bg-c3`).value = hex(bg[2], '#06b6d4');
    $(`#${prefix}-border-style`).value = t.borderStyle || 'solid';
    const bc = t.borderColors || [];
    $(`#${prefix}-border-c1`).value = hex(bc[0], '#ffffff');
    $(`#${prefix}-border-c2`).value = hex(bc[1], '#7c3aed');
    $(`#${prefix}-border-c3`).value = hex(bc[2], '#ec4899');
    $(`#${prefix}-text-style`).value = t.textStyle || 'solid';
    const tc = t.textColors || [];
    $(`#${prefix}-text-c1`).value = hex(tc[0], '#ffffff');
    $(`#${prefix}-text-c2`).value = hex(tc[1], '#ffd700');
    $(`#${prefix}-text-c3`).value = hex(tc[2], '#00ffff');
    $(`#${prefix}-glow`).checked = !!t.glowing;
    $(`#${prefix}-glow-color`).value = hex(t.glowColor, '#7c3aed');
    refreshTagPreview(prefix);
  }

  function readTagEditor(prefix) {
    if (!$(`#${prefix}-custom`).checked) return null;
    const v = (id) => $(`#${prefix}-${id}`).value;
    return {
      name: v('name').trim() || null,
      bgStyle: v('bg-style'),
      bgColors: tagColorsByStyle(v('bg-style'), v('bg-c1'), v('bg-c2'), v('bg-c3')),
      borderStyle: v('border-style'),
      borderColors: tagColorsByStyle(v('border-style'), v('border-c1'), v('border-c2'), v('border-c3')),
      textStyle: v('text-style'),
      textColors: tagColorsByStyle(v('text-style'), v('text-c1'), v('text-c2'), v('text-c3')),
      glowing: !!$(`#${prefix}-glow`).checked,
      glowColor: v('glow-color'),
    };
  }

  // Booster tags fall back to the category label; tier tags have no fallback.
  const TAG_PREVIEW_FALLBACK = {
    'bp-tag': () => ($('#bp-category').value.trim().toUpperCase() || 'CATEGORY'),
    'tr-tag': () => null,
  };

  function refreshTagPreview(prefix) {
    const host = $(`#${prefix}-preview`);
    if (!host || !window.OrchidTagBadge) return;
    const tag = readTagEditor(prefix);
    const fallback = TAG_PREVIEW_FALLBACK[prefix] ? TAG_PREVIEW_FALLBACK[prefix]() : null;
    host.innerHTML = OrchidTagBadge(tag, fallback, '') || '<span class="hint" style="margin:0">no tag shown</span>';
  }

  function initTagEditor(prefix) {
    $(`#${prefix}-custom`).addEventListener('change', () => {
      $(`#${prefix}-editor`).style.display = $(`#${prefix}-custom`).checked ? '' : 'none';
      refreshTagPreview(prefix);
    });
    ['input', 'change'].forEach(ev =>
      $(`#${prefix}-editor`).addEventListener(ev, () => refreshTagPreview(prefix)));
  }

  function toDatetimeLocalValue(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openBoosterDialog(id) {
    editingBoosterId = id || null;
    const p = id ? (state.boosterPacks || []).find(x => x.id === id) : null;
    $('#booster-dlg-title').textContent = p ? `Edit Booster Pack — ${p.name}` : 'Add Booster Pack';
    $('#bp-name').value = p ? p.name : '';
    $('#bp-category').value = p ? p.category : 'Starter';
    $('#bp-desc').value = p ? p.description : '';
    fillTagEditor('bp-tag', p ? p.customTag : null);
    $('#bp-price-idr').value = p ? p.priceIDR : 15000;
    $('#bp-price-usd').value = p ? p.priceUSD : 0.99;
    $('#bp-slash-idr').value = p && p.slashPriceIDR ? p.slashPriceIDR : '';
    $('#bp-slash-usd').value = p && p.slashPriceUSD ? p.slashPriceUSD : '';
    $('#bp-until').value = p && p.availableUntil ? toDatetimeLocalValue(p.availableUntil) : '';
    $('#bp-stock').value = p && p.globalStock != null ? p.globalStock : '';
    $('#bp-limit').value = p && p.purchaseLimit != null ? p.purchaseLimit : '';
    $('#bp-bg-style').value = p ? p.bgStyle : 'solid';
    const bgc = p && Array.isArray(p.bgColors) ? p.bgColors : [];
    $('#bp-bg-c1').value = bgc[0] || '#1c1b20';
    $('#bp-bg-c2').value = bgc[1] || '#2d1b4e';
    $('#bp-bg-c3').value = bgc[2] || '#7c3aed';
    $('#bp-has-border').checked = p ? !!p.hasBorder : true;
    $('#bp-border-animated').checked = p ? !!p.borderAnimated : false;
    $('#bp-has-glowing').checked = p ? !!p.hasGlowing : false;
    $('#bp-glow-pulse').checked = p ? !!p.glowPulse : false;
    $('#bp-glow-animated').checked = p ? !!p.glowAnimated : false;
    const tierOptionsHTML = (state.tiers || []).map(t => `<option value="${escapeHtml(t.name.toLowerCase())}">${escapeHtml(t.name)}</option>`).join('');
    $('#bp-min-tier').innerHTML = `<option value="">None — any tier</option>` + tierOptionsHTML;
    $('#bp-min-tier').value = p && p.minTier ? p.minTier : '';
    $('#bp-max-tier').innerHTML = `<option value="">None — no upper bound</option>` + tierOptionsHTML;
    $('#bp-max-tier').value = p && p.maxTier ? p.maxTier : '';
    $('#bp-pers-type').innerHTML = PERSONALIZATION_TYPES.map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('');
    $('#bp-pers-type').value = p && p.personalization ? p.personalization.type : 'none';
    $('#bp-pers-value').value = p && p.personalization ? p.personalization.value : '';
    $('#bp-pers-reason').value = p && p.personalization ? p.personalization.reason : '';
    editingBoosterWallets = p && Array.isArray(p.wallets) ? JSON.parse(JSON.stringify(p.wallets)) : [
      { label: 'Standard', credits: 5000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6', iconShape: 'circle', iconEmoji: null },
    ];
    renderBoosterWallets();
    $('#booster-dlg').show();
  }

  function renderBoosterWallets() {
    const host = $('#bp-wallets-list');
    if (!host) return;
    host.innerHTML = editingBoosterWallets.length ? editingBoosterWallets.map((w, i) => `
      <div class="bp-wallet-row" data-i="${i}">
        <div class="bp-wallet-row-fields">
          <input class="a-input" type="text" data-f="label" data-i="${i}" value="${escapeHtml(w.label)}" placeholder="Label" />
          <input class="a-input" type="number" data-f="credits" data-i="${i}" value="${w.credits}" placeholder="Credits" />
          <input class="a-input" type="number" data-f="priority" data-i="${i}" value="${w.priority}" placeholder="Prio" min="0" max="9" />
          <select class="a-input" data-f="type" data-i="${i}">
            <option value="standard" ${w.type === 'standard' ? 'selected' : ''}>Standard</option>
            <option value="fast" ${w.type === 'fast' ? 'selected' : ''}>Fast</option>
          </select>
          <select class="a-input" data-f="access" data-i="${i}">
            ${['free', 'standard', 'premium', 'premium+', 'elite'].map(a => `<option value="${a}" ${w.access === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
          <input class="a-input" type="color" data-f="color" data-i="${i}" value="${w.color}" style="height:38px;padding:3px" />
          <select class="a-input" data-f="iconShape" data-i="${i}">
            ${SHAPE_OPTIONS.map(s => `<option value="${s}" ${w.iconShape === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <input class="a-input" type="text" data-f="iconEmoji" data-i="${i}" value="${w.iconEmoji || ''}" placeholder="emoji" maxlength="4" style="width:56px" />
        </div>
        <button type="button" class="icon-btn danger bp-wallet-remove" data-i="${i}" title="Remove wallet"><span class="material-symbols-outlined">close</span></button>
      </div>
    `).join('') : '<div class="hint" style="margin:0">No wallets yet — add at least one credit wallet.</div>';

    $$('.bp-wallet-remove', host).forEach(b => b.addEventListener('click', () => {
      editingBoosterWallets.splice(Number(b.dataset.i), 1);
      renderBoosterWallets();
    }));
    $$('[data-f]', host).forEach(inp => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i), f = inp.dataset.f;
      const w = editingBoosterWallets[i];
      if (!w) return;
      if (f === 'credits' || f === 'priority') w[f] = Number(inp.value) || 0;
      else if (f === 'iconEmoji') w[f] = inp.value.trim() || null;
      else w[f] = inp.value;
    }));
  }

  function addBoosterWallet() {
    editingBoosterWallets.push({ label: 'Standard', credits: 1000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6', iconShape: 'circle', iconEmoji: null });
    renderBoosterWallets();
  }

  function saveBooster() {
    const name = $('#bp-name').value.trim();
    if (!name) { toast('Pack name is required', 'error'); return; }
    if (!editingBoosterWallets.length) { toast('Add at least one credit wallet', 'error'); return; }
    const bgStyle = $('#bp-bg-style').value;
    const bgColors = bgStyle === 'solid' ? [$('#bp-bg-c1').value]
      : bgStyle === 'gradient' ? [$('#bp-bg-c1').value, $('#bp-bg-c2').value]
      : [$('#bp-bg-c1').value, $('#bp-bg-c2').value, $('#bp-bg-c3').value];
    const persType = $('#bp-pers-type').value;
    const data = {
      name,
      category: $('#bp-category').value.trim() || 'Starter',
      description: $('#bp-desc').value.trim(),
      customTag: readTagEditor('bp-tag'),
      wallets: editingBoosterWallets.slice(),
      priceIDR: Number($('#bp-price-idr').value) || 0,
      priceUSD: Number($('#bp-price-usd').value) || 0,
      slashPriceIDR: $('#bp-slash-idr').value ? Number($('#bp-slash-idr').value) : null,
      slashPriceUSD: $('#bp-slash-usd').value ? Number($('#bp-slash-usd').value) : null,
      availableUntil: $('#bp-until').value ? new Date($('#bp-until').value).toISOString() : null,
      globalStock: $('#bp-stock').value !== '' ? Number($('#bp-stock').value) : null,
      purchaseLimit: $('#bp-limit').value !== '' ? Number($('#bp-limit').value) : null,
      minTier: $('#bp-min-tier').value || null,
      maxTier: $('#bp-max-tier').value || null,
      bgStyle, bgColors,
      hasBorder: !!$('#bp-has-border').checked,
      borderAnimated: !!$('#bp-border-animated').checked,
      hasGlowing: !!$('#bp-has-glowing').checked,
      glowPulse: !!$('#bp-glow-pulse').checked,
      glowAnimated: !!$('#bp-glow-animated').checked,
      personalization: persType !== 'none' ? {
        type: persType,
        value: Number($('#bp-pers-value').value) || 0,
        reason: $('#bp-pers-reason').value.trim() || 'Personalized Offer',
      } : null,
    };
    if (editingBoosterId) {
      Object.assign(state.boosterPacks.find(x => x.id === editingBoosterId), data);
      toast(`Booster pack "${name}" updated`, 'save');
    } else {
      state.boosterPacks.unshift({ id: 'bp' + Date.now(), ...data });
      toast(`Booster pack "${name}" created`, 'bolt');
    }
    saveState();
    $('#booster-dlg').hide();
    renderBoosterPacks();
  }

  function renderBoosterPacks() {
    const host = $('#booster-admin-grid');
    if (!host) return;
    const packs = state.boosterPacks || [];
    if (!packs.length) { host.innerHTML = '<div class="hint">No booster packs yet.</div>'; return; }
    host.innerHTML = packs.map(p => {
      const priceLine = p.slashPriceIDR
        ? `<s>Rp ${fmt(p.slashPriceIDR)}</s> <b>Rp ${fmt(p.priceIDR)}</b>`
        : `<b>Rp ${fmt(p.priceIDR)}</b>`;
      const availability = p.globalStock != null ? `${fmt(p.globalStock)} in stock`
        : p.purchaseLimit != null ? `limit ${p.purchaseLimit}/user` : 'unlimited';
      const accent = (p.customTag && p.customTag.bgColors && p.customTag.bgColors[0]) || p.themeColor || (p.bgColors && p.bgColors[0]) || '#7C3AED';
      const tagPreview = window.OrchidTagBadge ? OrchidTagBadge(p.customTag, p.customTag ? p.category : null, '') : '';
      const minTierName = (state.tiers || []).find(t => t.name.toLowerCase() === p.minTier)?.name;
      const maxTierName = (state.tiers || []).find(t => t.name.toLowerCase() === p.maxTier)?.name;
      const tierRangeLabel = minTierName && maxTierName ? `${minTierName}–${maxTierName}`
        : minTierName ? `${minTierName}+`
        : maxTierName ? `≤${maxTierName}` : '';
      const minTierBadge = tierRangeLabel ? `<span class="tier-badge grp-badge" title="Only visible to ${escapeHtml(tierRangeLabel)} tier users">${escapeHtml(tierRangeLabel)}</span>` : '';
      return `
      <div class="booster-admin-card" data-bp="${p.id}" style="--bp-c:${accent}">
        <div class="booster-admin-head">
          <div class="pool-glyph" style="background:color-mix(in srgb, var(--bp-c) 20%, transparent)"><span class="material-symbols-outlined" style="color:var(--bp-c)">bolt</span></div>
          <div class="pool-title-wrap">
            <div class="pool-name">${escapeHtml(p.name)}
              <span class="tier-badge grp-badge">${escapeHtml(p.category)}</span>
              ${minTierBadge}
              ${tagPreview}
              ${p.personalization ? `<span class="pool-failover-badge"><span class="material-symbols-outlined">person</span>personalized</span>` : ''}
            </div>
            <div class="model-slug">${p.wallets.length} wallet${p.wallets.length === 1 ? '' : 's'} · ${priceLine} · ${availability}</div>
          </div>
          <div class="model-head-right">
            <button class="icon-btn edit-booster-btn" data-bp="${p.id}" title="Edit pack"><span class="material-symbols-outlined">edit</span></button>
            <button class="icon-btn danger delete-booster-btn" data-bp="${p.id}" title="Delete pack"><span class="material-symbols-outlined">delete</span></button>
          </div>
        </div>
      </div>`;
    }).join('');

    $$('.edit-booster-btn', host).forEach(b => b.addEventListener('click', () => openBoosterDialog(b.dataset.bp)));
    $$('.delete-booster-btn', host).forEach(b => b.addEventListener('click', () => {
      const p = state.boosterPacks.find(x => x.id === b.dataset.bp);
      if (!p || !confirm(`Delete booster pack "${p.name}"?`)) return;
      state.boosterPacks = state.boosterPacks.filter(x => x.id !== b.dataset.bp);
      saveState();
      toast(`Booster pack "${p.name}" deleted`, 'delete');
      renderBoosterPacks();
    }));
  }

  // ============================================================
  // USERS
  // ============================================================
  let userSearchTerm = '';
  let userTierFilter = 'all';

  function renderUsers() {
    // Filter chips
    const tiers = ['all', ...state.tiers.map(t => t.name)];
    $('#user-tier-filter').innerHTML = tiers.map(t =>
      `<button class="f-chip ${userTierFilter === t ? 'active' : ''}" data-tier="${escapeHtml(t)}">${t === 'all' ? 'All tiers' : escapeHtml(t)}</button>`
    ).join('');
    $$('#user-tier-filter .f-chip').forEach(c => c.addEventListener('click', () => {
      userTierFilter = c.dataset.tier;
      renderUsers();
    }));

    const avatarColor = (name) => {
      const hues = [262, 199, 330, 160, 30, 210];
      let h = 0;
      for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
      return `hsl(${hues[h % hues.length]}, 45%, 45%)`;
    };
    const tierColor = (name) => (state.tiers.find(t => t.name === name) || {}).color || '#938f99';

    const rows = state.users.filter(u =>
      (userTierFilter === 'all' || u.tier === userTierFilter) &&
      (!userSearchTerm || u.name.toLowerCase().includes(userSearchTerm) || u.email.toLowerCase().includes(userSearchTerm))
    );

    $('#users-table tbody').innerHTML = rows.map(u => `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar" style="background:${avatarColor(u.name)}">${escapeHtml(u.name[0].toUpperCase())}</div>
            <div>
              <div class="user-name">${escapeHtml(u.name)}</div>
              <div class="user-email">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="tier-badge" style="background:color-mix(in srgb, ${tierColor(u.tier)} 15%, transparent);color:${tierColor(u.tier)};border-color:color-mix(in srgb, ${tierColor(u.tier)} 35%, transparent)">${escapeHtml(u.tier)}</span></td>
        <td><span class="u-status ${u.status}">${u.status}</span></td>
        <td class="mono">${fmt(u.requests)}</td>
        <td class="mono">${fmt(u.credits)}</td>
        <td>${escapeHtml(u.joined)}</td>
        <td style="text-align:right">
          <button class="icon-btn user-manage-btn" data-user="${u.id}" title="Manage user">
            <span class="material-symbols-outlined">manage_accounts</span>
          </button>
        </td>
      </tr>`).join('') || '<tr><td colspan="7" style="padding:24px;color:var(--md-sys-color-outline)">No users match.</td></tr>';

    $$('.user-manage-btn').forEach(b => b.addEventListener('click', () => openUserDialog(b.dataset.user)));

    $('#user-search').oninput = (e) => {
      userSearchTerm = e.target.value.trim().toLowerCase();
      renderUsers();
    };
  }

  // ============================================================
  // DIALOGS
  // ============================================================
  let editingProviderId = null;
  let editingTierId = null;
  let attachModelId = null;
  let managingUserId = null;

  function initDialogs() {
    // chips
    buildChipSet($('#retry-codes'), RETRYABLE_CODES, state.settings.retryCodes);
    buildChipSet($('#md-caps'), MODEL_CAPS, ['streaming']);
    buildChipSet($('#at-params'), ATTACH_PARAMS, ['temperature', 'top_p']);

    // Provider dialog
    $('#add-provider-btn').addEventListener('click', () => openProviderDialog(null));
    $('#provider-save-btn').addEventListener('click', saveProvider);
    $('#pv-ea-add-btn').addEventListener('click', addProviderErrorAlias);

    // Bulk keys
    $('#bulk-keys-btn').addEventListener('click', () => openBulkKeysDialog(null));
    $('#bulk-keys-input').addEventListener('input', () => {
      const n = parseKeys($('#bulk-keys-input').value).length;
      $('#bulk-count').textContent = `${n} key${n === 1 ? '' : 's'} detected`;
    });
    $('#bulk-keys-save-btn').addEventListener('click', saveBulkKeys);

    // Model dialog
    $('#add-model-btn').addEventListener('click', () => openModelDialog(null));
    $('#model-save-btn').addEventListener('click', saveModel);
    $('#md-name').addEventListener('input', () => {
      $('#md-slug').value = $('#md-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });
    $('#md-add-tier-btn').addEventListener('click', addTierRow);

    // Pool (router model) dialog
    $('#add-pool-btn').addEventListener('click', () => openPoolDialog(null));
    $('#pool-save-btn').addEventListener('click', savePool);
    $('#pl-add-member-btn').addEventListener('click', addPoolMember);
    $('#pl-strategy').addEventListener('change', renderPoolMembers);
    $('#pl-name').addEventListener('input', () => {
      // Only auto-fill the alias while creating (leave manual edits alone on edit).
      if (!editingPoolId) $('#pl-slug').value = slugifyToken($('#pl-name').value).replace(/_/g, '-');
    });

    // Model Maker (vendors) dialog
    $('#add-maker-btn').addEventListener('click', () => openMakerDialog(null));
    $('#maker-save-btn').addEventListener('click', saveMaker);
    $('#mk-svg').addEventListener('input', () => { $('#mk-preview').innerHTML = $('#mk-svg').value; });

    // Attach dialog
    $('#attach-save-btn').addEventListener('click', saveAttach);

    // Tier dialog
    $('#add-tier-btn').addEventListener('click', () => openTierDialog(null));
    $('#tier-save-btn').addEventListener('click', saveTier);

    // Booster pack dialog
    $('#add-booster-btn').addEventListener('click', () => openBoosterDialog(null));
    $('#booster-save-btn').addEventListener('click', saveBooster);
    $('#bp-add-wallet-btn').addEventListener('click', addBoosterWallet);

    // Custom tag editors (booster + tier) with live previews
    initTagEditor('bp-tag');
    initTagEditor('tr-tag');
    $('#bp-category').addEventListener('input', () => refreshTagPreview('bp-tag'));

    // User dialog
    $('#user-save-btn').addEventListener('click', saveUser);

    // Announcements
    $('#add-announcement-btn').addEventListener('click', () => openAnnDialog(null));
    $('#ann-save-btn').addEventListener('click', saveAnnouncement);

    // Logs — search + status filter chips
    $('#log-search').addEventListener('input', (e) => { logSearchTerm = e.target.value.trim().toLowerCase(); renderLogs(); });
    const lf = $('#log-status-filter');
    if (lf) {
      const statuses = ['all', 'success', 'retried', 'error'];
      lf.innerHTML = statuses.map(s => `<button type="button" class="filter-chip ${s === 'all' ? 'active' : ''}" data-status="${s}">${s}</button>`).join('');
      $$('#log-status-filter .filter-chip').forEach(c => c.addEventListener('click', () => {
        logStatusFilter = c.dataset.status;
        $$('#log-status-filter .filter-chip').forEach(x => x.classList.toggle('active', x === c));
        renderLogs();
      }));
    }

    // Queue — pause/resume + live drain timer
    $('#queue-pause-btn').addEventListener('click', () => {
      queuePaused = !queuePaused;
      $('#queue-pause-btn').innerHTML = queuePaused
        ? '<m3e-icon slot="icon" name="play_arrow"></m3e-icon> Resume'
        : '<m3e-icon slot="icon" name="pause"></m3e-icon> Pause';
      toast(queuePaused ? 'Queue simulation paused' : 'Queue simulation resumed', queuePaused ? 'pause' : 'play_arrow');
    });
    queueTimer = setInterval(tickQueue, 2200);
  }

  function buildChipSet(host, options, selected) {
    host.innerHTML = options.map(o =>
      `<button type="button" class="code-chip ${selected.includes(o) ? 'selected' : ''}" data-value="${o}">${o}</button>`
    ).join('');
    $$('.code-chip', host).forEach(c => c.addEventListener('click', () => c.classList.toggle('selected')));
  }
  const chipValues = (host) => $$('.code-chip.selected', host).map(c => c.dataset.value);
  const setChipValues = (host, values) => $$('.code-chip', host).forEach(c => c.classList.toggle('selected', values.includes(c.dataset.value)));
  const parseKeys = (text) => text.split('\n').map(s => s.trim()).filter(Boolean);
  const maskKey = (k) => k.length > 12 ? k.slice(0, 10) + '…' + k.slice(-4) : k;

  // --- Provider add/edit ---
  // Working copy of the endpoint's per-modality param support, edited live by
  // renderModalityMatrix() and committed on save. Shape: { modality: [params] }.
  let editingModalities = {};
  const slugifyToken = (s) => s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

  function renderModalityMatrix() {
    const host = $('#pv-modalities');
    if (!host) return;
    const enabled = Object.keys(editingModalities);
    const allMods = BASE_MODALITIES.concat(enabled.filter(m => !BASE_MODALITIES.includes(m)));
    const toggles = allMods.map(m => {
      const on = enabled.includes(m);
      const n = on ? editingModalities[m].length : 0;
      return `<button type="button" class="code-chip mm-toggle ${on ? 'selected' : ''}" data-mod="${m}">${m}${on && n ? ` · ${n}` : ''}</button>`;
    }).join('');
    const blocks = enabled.map(m => {
      const list = editingModalities[m];
      const palette = modalityParamPalette(m).concat(list.filter(p => !modalityParamPalette(m).includes(p)));
      const chips = palette.map(p =>
        `<button type="button" class="code-chip mm-param ${list.includes(p) ? 'selected' : ''}" data-mod="${m}" data-param="${p}">${p}</button>`
      ).join('');
      return `<div class="mm-block" data-mod="${m}">
          <div class="mm-block-head"><span class="mm-block-name">${m}</span>
            <button type="button" class="icon-btn danger mm-remove" data-mod="${m}" title="Stop serving ${m}"><span class="material-symbols-outlined">close</span></button>
          </div>
          <div class="code-chips">${chips || '<span class="hint" style="margin:0">no params — add a custom one below</span>'}</div>
          <div class="mm-addparam">
            <input class="a-input mono mm-addparam-input" type="text" placeholder="custom param (e.g. reasoning_effort)…" data-mod="${m}" />
            <m3e-button variant="text" size="small" class="mm-addparam-btn" data-mod="${m}"><m3e-icon slot="icon" name="add"></m3e-icon>Add</m3e-button>
          </div>
        </div>`;
    }).join('');
    host.innerHTML = `<div class="mm-toggles">${toggles}</div>
      <div class="mm-addmod">
        <input class="a-input mono mm-addmod-input" type="text" placeholder="custom modality (e.g. music, 3d)…" />
        <m3e-button variant="text" size="small" id="mm-addmod-btn"><m3e-icon slot="icon" name="add"></m3e-icon>Add modality</m3e-button>
      </div>
      <div class="mm-blocks">${blocks || '<div class="hint" style="margin:0">Enable a modality above to configure its supported parameters.</div>'}</div>`;

    $$('.mm-toggle', host).forEach(c => c.addEventListener('click', () => {
      const m = c.dataset.mod;
      if (editingModalities[m]) delete editingModalities[m];
      else editingModalities[m] = m === 'text' ? STANDARD_PARAMS.slice() : [];
      renderModalityMatrix();
    }));
    $$('.mm-param', host).forEach(c => c.addEventListener('click', () => {
      const { mod, param } = c.dataset, list = editingModalities[mod];
      const i = list.indexOf(param);
      if (i >= 0) list.splice(i, 1); else list.push(param);
      renderModalityMatrix();
    }));
    $$('.mm-remove', host).forEach(b => b.addEventListener('click', () => {
      delete editingModalities[b.dataset.mod];
      renderModalityMatrix();
    }));
    const addModBtn = $('#mm-addmod-btn', host), addModInput = $('.mm-addmod-input', host);
    const doAddMod = () => {
      const slug = slugifyToken(addModInput.value);
      if (!slug) return;
      if (editingModalities[slug]) { toast(`Modality "${slug}" already enabled`, 'info'); return; }
      editingModalities[slug] = [];
      renderModalityMatrix();
    };
    if (addModBtn) addModBtn.addEventListener('click', doAddMod);
    if (addModInput) addModInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddMod(); } });
    $$('.mm-addparam-btn', host).forEach(btn => {
      const m = btn.dataset.mod;
      const input = host.querySelector(`.mm-addparam-input[data-mod="${m}"]`);
      const doAdd = () => {
        const slug = slugifyToken(input.value);
        if (!slug) return;
        if (!editingModalities[m].includes(slug)) editingModalities[m].push(slug);
        renderModalityMatrix();
      };
      btn.addEventListener('click', doAdd);
      if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    });
  }

  // Working copy of this endpoint's own error-label overrides, edited live in
  // the provider dialog and committed on save (mirrors editingModalities).
  let editingErrorAliasOverrides = [];
  function renderProviderErrorAliases() {
    renderErrorAliasList('#pv-error-alias-list', editingErrorAliasOverrides, (i) => {
      editingErrorAliasOverrides.splice(i, 1);
      renderProviderErrorAliases();
    });
  }
  function addProviderErrorAlias() {
    const pattern = $('#pv-ea-pattern').value.trim();
    const label = $('#pv-ea-label').value.trim();
    if (!pattern || !label) { toast('Pattern and display label are required', 'error'); return; }
    editingErrorAliasOverrides.push({ id: 'pvea' + Date.now(), matchType: $('#pv-ea-type').value, pattern, label });
    $('#pv-ea-pattern').value = ''; $('#pv-ea-label').value = '';
    renderProviderErrorAliases();
  }

  function openProviderDialog(id) {
    editingProviderId = id;
    const pv = id ? providerById(id) : null;
    $('#provider-dlg-title').textContent = pv ? `Edit ${codename(pv)}` : 'Add Provider';
    $('#codename-name').textContent = pv ? codename(pv) : 'Endpoint ' + (NATO[state.providers.length] || 'Zulu+');
    $('#pv-name').value = pv ? pv.label : '';
    $('#pv-url').value = pv ? pv.url : '';
    $('#pv-weight').value = pv ? pv.weight : 10;
    $('#pv-concurrent').value = pv ? pv.maxConcurrent : 20;
    $('#pv-free').checked = pv ? pv.free : false;
    $('#pv-keys').value = '';
    $('#pv-keys').placeholder = pv ? `Add more keys (pool already has ${pv.keys.length})…` : 'sk-key-one\nsk-key-two';
    editingModalities = pv && pv.modalities ? JSON.parse(JSON.stringify(pv.modalities)) : defaultModalities();
    renderModalityMatrix();
    editingErrorAliasOverrides = pv && Array.isArray(pv.errorAliasOverrides) ? JSON.parse(JSON.stringify(pv.errorAliasOverrides)) : [];
    renderProviderErrorAliases();
    $('#provider-dlg').show();
  }

  function saveProvider() {
    const label = $('#pv-name').value.trim();
    const url = $('#pv-url').value.trim();
    if (!label || !url) { toast('Label and base URL are required', 'error'); return; }
    const newKeys = parseKeys($('#pv-keys').value).map(k => ({ preview: maskKey(k), status: 'healthy' }));
    if (editingProviderId) {
      const pv = providerById(editingProviderId);
      Object.assign(pv, {
        label, url,
        weight: Number($('#pv-weight').value) || 10,
        maxConcurrent: Number($('#pv-concurrent').value) || 20,
        free: !!$('#pv-free').checked,
        modalities: JSON.parse(JSON.stringify(editingModalities)),
        errorAliasOverrides: editingErrorAliasOverrides.slice(),
      });
      pv.keys.push(...newKeys);
      toast(`${codename(pv)} updated`, 'save');
    } else {
      const pv = {
        id: 'pv' + Date.now(),
        label, url,
        weight: Number($('#pv-weight').value) || 10,
        free: !!$('#pv-free').checked,
        maxConcurrent: Number($('#pv-concurrent').value) || 20,
        inFlight: 0, status: 'active',
        modalities: JSON.parse(JSON.stringify(editingModalities)),
        errorAliasOverrides: editingErrorAliasOverrides.slice(),
        keys: newKeys,
      };
      state.providers.push(pv);
      toast(`${codename(pv)} created${newKeys.length ? ` with ${newKeys.length} key(s)` : ''}`, 'add_circle');
    }
    saveState();
    $('#provider-dlg').hide();
    renderProviders();
    renderModels();
    renderDashboard();
    updateNavDot();
  }

  // --- Bulk keys ---
  function openBulkKeysDialog(preselectId) {
    $('#bulk-provider').innerHTML = state.providers.map(p =>
      `<option value="${p.id}" ${p.id === preselectId ? 'selected' : ''}>${codename(p)} — ${escapeHtml(p.label)}</option>`
    ).join('');
    $('#bulk-keys-input').value = '';
    $('#bulk-count').textContent = '0 keys detected';
    $('#bulk-keys-dlg').show();
  }

  function saveBulkKeys() {
    const pv = providerById($('#bulk-provider').value);
    const keys = parseKeys($('#bulk-keys-input').value);
    if (!pv || !keys.length) { toast('Paste at least one key', 'error'); return; }
    pv.keys.push(...keys.map(k => ({ preview: maskKey(k), status: 'healthy' })));
    saveState();
    $('#bulk-keys-dlg').hide();
    toast(`${keys.length} key${keys.length === 1 ? '' : 's'} added to ${codename(pv)} pool`, 'library_add_check');
    renderProviders();
  }

  // --- Model add / edit ---
  let editingModelId = null;
  let editingTiers = [];

  // Bands are the model's source of truth. Sort ascending by ceiling (a null
  // "up to" means no limit → sorts last) so the first band is the entry tier.
  const sortTiers = (tiers) => tiers.slice().sort((a, b) =>
    (a.upTo == null ? Infinity : a.upTo) - (b.upTo == null ? Infinity : b.upTo));
  // Max context the model serves = the largest band ceiling. A null ceiling
  // means unbounded, nominalised to the largest finite band (or 1M fallback).
  function contextFromTiers(tiers) {
    if (!tiers || !tiers.length) return 200000;
    const finite = tiers.map(t => t.upTo).filter(u => u != null);
    if (tiers.some(t => t.upTo == null)) return finite.length ? Math.max(...finite) : 1000000;
    return Math.max(...finite);
  }
  // A starter band so a legacy/blank model still has pricing + access + ceiling.
  const starterTier = (m) => ({
    upTo: m ? (m.context || 200000) : 200000,
    mIn: m && m.mIn != null ? m.mIn : 1.0,
    mOut: m && m.mOut != null ? m.mOut : 1.5,
    cacheRead: 0.3, cacheWrite: 0.5,
    requiredGroup: (m && m.group) || (state.groups[0] && state.groups[0].id) || 'free',
  });

  function openModelDialog(id) {
    editingModelId = id || null;
    const m = id ? state.models.find(x => x.id === id) : null;
    $('#model-dlg-title').textContent = m ? `Edit Model — ${m.name}` : 'Add Model';
    $('#md-name').value = m ? m.name : '';
    $('#md-slug').value = m ? m.slug : '';
    // Maker options from current vendors (Model Maker tab).
    $('#md-maker').innerHTML = ['<option value="">Other (no vendor)</option>'].concat(
      (state.vendors || []).map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`)
    ).join('');
    $('#md-maker').value = m ? (m.makerId || '') : ((state.vendors[0] && state.vendors[0].id) || '');
    $('#md-modality').value = m ? m.modality : 'text';
    $('#md-launch').value = m ? toDateInput(m.launchAt) : '';
    $('#md-deprecate').value = m ? toDateInput(m.deprecateAt) : '';
    setChipValues($('#md-caps'), m ? m.caps : ['streaming']);
    $('#md-delist').checked = m ? !!m.delisted : false;
    // Bands are now the model's sole source of pricing/context/access. Seed a
    // starter band from legacy fields (or defaults) so the editor is never empty.
    const existing = m && Array.isArray(m.contextTiers) ? JSON.parse(JSON.stringify(m.contextTiers)) : [];
    editingTiers = existing.length ? existing : [starterTier(m)];
    renderTierRows();
    $('#model-dlg').show();
  }

  // Per-model context/pricing band editor — add/edit/remove contextTiers[]
  // rows in-place. Empty list = fall back to synthesized bands from mIn/mOut.
  function renderTierRows() {
    const host = $('#md-tiers-list');
    if (!host) return;
    const groupOpts = (state.groups || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    host.innerHTML = editingTiers.length ? editingTiers.map((t, i) => `
      <div class="tier-edit-row" data-i="${i}">
        <input class="a-input mono" type="number" placeholder="no limit" value="${t.upTo == null ? '' : t.upTo}" data-f="upTo" step="1000" />
        <input class="a-input" type="number" value="${t.mIn}" data-f="mIn" step="0.05" title="Input ×" />
        <input class="a-input" type="number" value="${t.mOut}" data-f="mOut" step="0.05" title="Output ×" />
        <input class="a-input" type="number" value="${t.cacheRead}" data-f="cacheRead" step="0.05" title="Cache read ×" />
        <input class="a-input" type="number" value="${t.cacheWrite}" data-f="cacheWrite" step="0.05" title="Cache write ×" />
        <select class="a-input" data-f="requiredGroup">${groupOpts}</select>
        <button class="icon-btn danger rm-tier-btn" data-i="${i}" title="Remove band"><span class="material-symbols-outlined">delete</span></button>
      </div>`).join('') : '<div class="hint" style="margin:0">Add at least one band — it sets the model\'s pricing, access group and max context.</div>';
    $$('#md-tiers-list .tier-edit-row').forEach((row, i) => {
      const sel = row.querySelector('select[data-f="requiredGroup"]');
      if (sel) sel.value = editingTiers[i].requiredGroup || (state.groups[0] && state.groups[0].id);
      row.querySelectorAll('input,select').forEach(inp => {
        inp.addEventListener('input', () => {
          const f = inp.dataset.f;
          editingTiers[i][f] = f === 'upTo' ? (inp.value === '' ? null : Number(inp.value)) : (f === 'requiredGroup' ? inp.value : (Number(inp.value) || 0));
        });
      });
    });
    $$('#md-tiers-list .rm-tier-btn').forEach(b => b.addEventListener('click', () => {
      editingTiers.splice(Number(b.dataset.i), 1);
      renderTierRows();
    }));
  }

  function addTierRow() {
    const last = editingTiers[editingTiers.length - 1];
    editingTiers.push({
      upTo: null,
      mIn: last ? last.mIn : 1,
      mOut: last ? last.mOut : 1.5,
      cacheRead: last ? last.cacheRead : 0.3,
      cacheWrite: last ? last.cacheWrite : 0.5,
      requiredGroup: (last && last.requiredGroup) || (state.groups[0] && state.groups[0].id) || 'free',
    });
    renderTierRows();
  }

  function saveModel() {
    const name = $('#md-name').value.trim();
    const slug = $('#md-slug').value.trim();
    if (!name || !slug) { toast('Name and slug are required', 'error'); return; }
    const makerId = $('#md-maker').value || null;
    const vendor = makerId ? vendorById(makerId) : null;
    // Guarantee at least one band, then derive context/pricing/access from it.
    const tiers = sortTiers(editingTiers.length ? editingTiers : [starterTier(null)]);
    const entry = tiers[0]; // lowest ceiling = the model's entry tier
    const data = {
      name, slug,
      makerId,
      maker: vendor ? vendor.name : ($('#md-maker').selectedOptions[0] ? $('#md-maker').selectedOptions[0].textContent : 'Other'),
      modality: $('#md-modality').value,
      // Base group/pricing = the entry band; context = the largest band ceiling.
      group: entry.requiredGroup,
      tier: entry.requiredGroup,
      context: contextFromTiers(tiers),
      mIn: entry.mIn,
      mOut: entry.mOut,
      launchAt: fromDateInput($('#md-launch').value),
      deprecateAt: fromDateInput($('#md-deprecate').value),
      caps: chipValues($('#md-caps')),
      delisted: !!$('#md-delist').checked,
      contextTiers: tiers,
    };
    if (editingModelId) {
      Object.assign(state.models.find(x => x.id === editingModelId), data);
      toast(`${name} updated`, 'save');
    } else {
      state.models.unshift({ id: 'm' + Date.now(), active: true, providers: [], ...data });
      toast(`${name} added — attach a provider so it can serve traffic`, 'category');
    }
    saveState();
    $('#model-dlg').hide();
    renderModels();
  }

  // ============================================================
  // MODEL POOLS (virtual router models, e.g. /free, /strong)
  // ============================================================
  // A pool is a model users call by one alias; the router selects a member
  // model per `strategy` and (if `failover`) falls through to the next on error.
  const STRATEGY_LABEL = { priority: 'Priority order', round_robin: 'Round robin', weighted: 'Weighted %' };
  let editingPoolId = null;
  let editingPoolMembers = []; // [{ modelId, weight }]

  function modelNameById(id) { const m = state.models.find(x => x.id === id); return m ? m.name : '(deleted model)'; }

  function openPoolDialog(id) {
    editingPoolId = id || null;
    const p = id ? (state.pools || []).find(x => x.id === id) : null;
    $('#pool-dlg-title').textContent = p ? `Edit Pool — ${p.name}` : 'Add Pool';
    $('#pl-name').value = p ? p.name : '';
    $('#pl-slug').value = p ? p.slug : '';
    $('#pl-group').innerHTML = (state.groups || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    $('#pl-group').value = p ? p.group : (state.groups[0] && state.groups[0].id);
    $('#pl-strategy').value = p ? p.strategy : 'priority';
    $('#pl-failover').checked = p ? !!p.failover : true;
    editingPoolMembers = p && Array.isArray(p.members) ? JSON.parse(JSON.stringify(p.members)) : [];
    renderPoolMembers();
    $('#pool-dlg').show();
  }

  function poolAddableModels() {
    // Any real model (incl. delisted) not already a member. Pools can't nest.
    return state.models.filter(m => !editingPoolMembers.some(mem => mem.modelId === m.id));
  }

  function renderPoolMembers() {
    const host = $('#pl-members-list');
    if (!host) return;
    const weighted = $('#pl-strategy').value === 'weighted';
    const totalW = editingPoolMembers.reduce((s, m) => s + (Number(m.weight) || 0), 0) || 1;
    host.innerHTML = editingPoolMembers.length ? editingPoolMembers.map((mem, i) => {
      const m = state.models.find(x => x.id === mem.modelId);
      const share = weighted ? Math.round(((Number(mem.weight) || 0) / totalW) * 100) : 0;
      return `<div class="pl-member-row" data-i="${i}">
          <span class="pl-order">${i + 1}</span>
          <div class="pl-member-info">
            <span class="pl-member-name">${escapeHtml(m ? m.name : '(deleted)')}</span>
            <span class="pl-member-sub">${m ? escapeHtml(m.slug) : ''}${m && m.delisted ? ' · <span class="delisted-inline">delisted</span>' : ''}</span>
          </div>
          ${weighted ? `<div class="pl-weight"><input class="a-input mono" type="number" min="0" step="1" value="${mem.weight == null ? 1 : mem.weight}" data-i="${i}" data-f="weight" /><span class="pl-share">${share}%</span></div>` : ''}
          <button type="button" class="icon-btn pl-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up"><span class="material-symbols-outlined">keyboard_arrow_up</span></button>
          <button type="button" class="icon-btn pl-down" data-i="${i}" ${i === editingPoolMembers.length - 1 ? 'disabled' : ''} title="Move down"><span class="material-symbols-outlined">keyboard_arrow_down</span></button>
          <button type="button" class="icon-btn danger pl-remove" data-i="${i}" title="Remove"><span class="material-symbols-outlined">close</span></button>
        </div>`;
    }).join('') : '<div class="hint" style="margin:0">No members yet — add model cards below. Order = priority; delisted models are fine.</div>';

    // Add-member dropdown (exclude current members).
    const addable = poolAddableModels();
    $('#pl-add-member-select').innerHTML = addable.length
      ? addable.map(m => `<option value="${m.id}">${escapeHtml(m.name)}${m.delisted ? ' (delisted)' : ''}</option>`).join('')
      : '<option value="" disabled selected>All models already added</option>';

    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= editingPoolMembers.length) return;
      [editingPoolMembers[i], editingPoolMembers[j]] = [editingPoolMembers[j], editingPoolMembers[i]];
      renderPoolMembers();
    };
    $$('.pl-up', host).forEach(b => b.addEventListener('click', () => move(Number(b.dataset.i), -1)));
    $$('.pl-down', host).forEach(b => b.addEventListener('click', () => move(Number(b.dataset.i), 1)));
    $$('.pl-remove', host).forEach(b => b.addEventListener('click', () => { editingPoolMembers.splice(Number(b.dataset.i), 1); renderPoolMembers(); }));
    $$('input[data-f="weight"]', host).forEach(inp => inp.addEventListener('input', () => {
      editingPoolMembers[Number(inp.dataset.i)].weight = Number(inp.value) || 0;
      // Update share labels live without stealing focus — light recompute.
      const t = editingPoolMembers.reduce((s, m) => s + (Number(m.weight) || 0), 0) || 1;
      $$('.pl-member-row', host).forEach((row, k) => {
        const share = row.querySelector('.pl-share');
        if (share) share.textContent = Math.round(((Number(editingPoolMembers[k].weight) || 0) / t) * 100) + '%';
      });
    }));
  }

  function addPoolMember() {
    const id = $('#pl-add-member-select').value;
    if (!id) return;
    if (editingPoolMembers.some(m => m.modelId === id)) return;
    editingPoolMembers.push({ modelId: id, weight: 1 });
    renderPoolMembers();
  }

  function savePool() {
    const name = $('#pl-name').value.trim();
    const slug = $('#pl-slug').value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name || !slug) { toast('Name and alias slug are required', 'error'); return; }
    if (!editingPoolMembers.length) { toast('Add at least one member model', 'error'); return; }
    const clash = state.models.some(m => m.slug === slug) ||
      (state.pools || []).some(p => p.slug === slug && p.id !== editingPoolId);
    if (clash) { toast(`Alias "${slug}" is already used by another model or pool`, 'error'); return; }
    const data = {
      name, slug, kind: 'pool',
      group: $('#pl-group').value,
      strategy: $('#pl-strategy').value,
      failover: !!$('#pl-failover').checked,
      members: editingPoolMembers.slice(),
    };
    if (editingPoolId) {
      Object.assign((state.pools || []).find(x => x.id === editingPoolId), data);
      toast(`Pool "${name}" updated`, 'save');
    } else {
      state.pools.unshift({ id: 'pool' + Date.now(), active: true, ...data });
      toast(`Pool "${name}" created — callable as /${slug}`, 'account_tree');
    }
    saveState();
    $('#pool-dlg').hide();
    renderPools();
  }

  function renderPools() {
    const host = $('#pool-list');
    if (!host) return;
    const pools = state.pools || [];
    if (!pools.length) { host.innerHTML = ''; return; }
    host.innerHTML = pools.map(p => {
      const totalW = p.members.reduce((s, m) => s + (Number(m.weight) || 0), 0) || 1;
      return `
      <div class="pool-card ${p.active ? '' : 'pool-off'}" data-pool="${p.id}">
        <div class="pool-card-head" data-expand>
          <div class="pool-glyph"><span class="material-symbols-outlined">account_tree</span></div>
          <div class="pool-title-wrap">
            <div class="pool-name">${escapeHtml(p.name)}
              <span class="pool-alias mono">/${escapeHtml(p.slug)}</span>
              <span class="tier-badge grp-badge">${escapeHtml(groupName(p.group))}</span>
              <span class="pool-strat-badge">${STRATEGY_LABEL[p.strategy] || p.strategy}</span>
              ${p.failover ? '<span class="pool-failover-badge"><span class="material-symbols-outlined">autorenew</span>failover</span>' : ''}
              ${p.active ? '' : '<span class="status-chip st-dead">disabled</span>'}
            </div>
            <div class="model-slug">${p.members.length} member${p.members.length === 1 ? '' : 's'} · virtual router model</div>
          </div>
          <div class="model-head-right">
            <button class="icon-btn edit-pool-btn" data-pool="${p.id}" title="Edit pool"><span class="material-symbols-outlined">edit</span></button>
            <button class="icon-btn danger delete-pool-btn" data-pool="${p.id}" title="Delete pool"><span class="material-symbols-outlined">delete</span></button>
            <m3e-switch class="pool-active-tog" data-pool="${p.id}" ${p.active ? 'checked' : ''} icons="selected" title="Pool active"></m3e-switch>
            <span class="material-symbols-outlined expand-arrow">expand_more</span>
          </div>
        </div>
        <div class="pool-card-body">
          <div class="pool-members-head">${p.strategy === 'priority' ? 'Tried top-down; next on failure' : p.strategy === 'round_robin' ? 'Rotated evenly across members' : 'Picked by weight share'}</div>
          ${p.members.map((mem, i) => {
            const m = state.models.find(x => x.id === mem.modelId);
            const share = Math.round(((Number(mem.weight) || 0) / totalW) * 100);
            return `<div class="pool-member">
              <span class="pl-order">${i + 1}</span>
              <span class="pool-member-name">${escapeHtml(m ? m.name : '(deleted model)')}</span>
              <span class="pool-member-slug mono">${m ? escapeHtml(m.slug) : ''}</span>
              ${m && m.delisted ? '<span class="delisted-inline">delisted</span>' : ''}
              ${m && !m.active ? '<span class="status-chip st-dead">disabled</span>' : ''}
              ${p.strategy === 'weighted' ? `<span class="pool-share-badge">${share}%</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    $$('#pool-list [data-expand]').forEach(head => head.addEventListener('click', (e) => {
      if (e.target.closest('m3e-switch') || e.target.closest('.icon-btn')) return;
      head.closest('.pool-card').classList.toggle('expanded');
    }));
    $$('#pool-list .edit-pool-btn').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openPoolDialog(b.dataset.pool); }));
    $$('#pool-list .delete-pool-btn').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = (state.pools || []).find(x => x.id === b.dataset.pool);
      if (!p || !confirm(`Delete pool "${p.name}" (/${p.slug})? Member models are not affected.`)) return;
      state.pools = state.pools.filter(x => x.id !== b.dataset.pool);
      saveState();
      toast(`Pool "${p.name}" deleted`, 'delete');
      renderPools();
    }));
    $$('#pool-list .pool-active-tog').forEach(sw => sw.addEventListener('change', () => {
      const p = (state.pools || []).find(x => x.id === sw.dataset.pool);
      if (!p) return;
      p.active = !!sw.checked;
      saveState();
      toast(`Pool "${p.name}" ${p.active ? 'enabled' : 'disabled'}`, p.active ? 'visibility' : 'visibility_off');
    }));
  }

  // --- Attach provider to model ---
  function openAttachDialog(modelId) {
    attachModelId = modelId;
    const m = state.models.find(x => x.id === modelId);
    const available = state.providers.filter(p => !m.providers.some(ep => ep.providerId === p.id));
    if (!available.length) { toast('All providers already attached to this model', 'info'); return; }
    $('#attach-model-name').textContent = m.name;
    $('#at-provider').innerHTML = available.map(p =>
      `<option value="${p.id}">${codename(p)} — ${escapeHtml(p.label)}${p.free ? ' (free ok)' : ''}</option>`
    ).join('');
    $('#at-weight').value = 10;
    $('#at-context').value = m.context;
    setChipValues($('#at-params'), ['temperature', 'top_p']);
    $('#attach-dlg').show();
  }

  function saveAttach() {
    const m = state.models.find(x => x.id === attachModelId);
    if (!m) return;
    m.providers.push({
      providerId: $('#at-provider').value,
      weight: Number($('#at-weight').value) || 10,
      contextCap: Number($('#at-context').value) || m.context,
      params: chipValues($('#at-params')),
    });
    saveState();
    $('#attach-dlg').hide();
    toast(`${codenameById($('#at-provider').value)} attached to ${m.name}`, 'add_link');
    renderModels();
    const card = $(`#model-list .model-card[data-model="${m.id}"]`);
    if (card) card.classList.add('expanded');
  }

  // --- Tier add/edit ---
  function openTierDialog(id) {
    editingTierId = id;
    const t = id ? state.tiers.find(x => x.id === id) : null;
    $('#tier-dlg-title').textContent = t ? `Edit Tier — ${t.name}` : 'Add Subscription Tier';
    $('#tr-name').value = t ? t.name : '';
    $('#tr-color').value = t ? t.color : '#b388ff';
    $('#tr-idr').value = t ? t.idr : 0;
    $('#tr-usd').value = t ? t.usd : 0;
    $('#tr-monthly-enabled').checked = t ? t.monthlyEnabled !== false : true;
    $('#tr-quarterly-enabled').checked = t ? !!t.quarterlyEnabled : false;
    $('#tr-quarterly-idr').value = t && t.quarterlyIDR != null ? t.quarterlyIDR : '';
    $('#tr-yearly-enabled').checked = t ? !!t.yearlyEnabled : false;
    $('#tr-yearly-idr').value = t && t.yearlyIDR != null ? t.yearlyIDR : '';
    ['monthly', 'quarterly', 'yearly'].forEach(cycle => {
      const ov = t && t.cycleOverrides ? t.cycleOverrides[cycle] : null;
      $(`#tr-override-${cycle}-idr`).value = ov ? ov.idr : '';
      $(`#tr-override-${cycle}-until`).value = ov ? toDatetimeLocalValue(ov.until) : '';
    });
    $('#tr-std').value = t ? t.std : 100000;
    $('#tr-fast').value = t ? t.fast : 0;
    $('#tr-priority').value = t ? t.priority : 1;
    $('#tr-rpm').value = t ? t.rpm : 5;
    $('#tr-concurrent').value = t ? t.concurrent : 1;
    $('#tr-model-access').value = t ? t.access : 'standard';
    $('#tr-rollover').checked = t ? t.rollover : false;
    $('#tr-icon-shape').value = t ? t.iconShape : 'square';
    $('#tr-icon-emoji').value = t && t.iconEmoji ? t.iconEmoji : '';
    fillTagEditor('tr-tag', t ? t.customTag : null);
    $('#tr-bg-style').value = t ? t.bgStyle : 'none';
    const bgc = t && Array.isArray(t.bgColors) ? t.bgColors : [];
    $('#tr-bg-c1').value = bgc[0] || '#1c1b20';
    $('#tr-bg-c2').value = bgc[1] || '#2d1b4e';
    $('#tr-bg-c3').value = bgc[2] || '#7c3aed';
    $('#tr-has-border').checked = t ? !!t.hasBorder : false;
    $('#tr-border-animated').checked = t ? !!t.borderAnimated : false;
    $('#tr-has-glowing').checked = t ? !!t.hasGlowing : false;
    $('#tr-glow-pulse').checked = t ? !!t.glowPulse : false;
    $('#tr-glow-animated').checked = t ? !!t.glowAnimated : false;
    $('#tier-dlg').show();
  }

  function saveTier() {
    const name = $('#tr-name').value.trim();
    if (!name) { toast('Tier name is required', 'error'); return; }
    const bgStyle = $('#tr-bg-style').value;
    const bgColors = bgStyle === 'solid' ? [$('#tr-bg-c1').value]
      : bgStyle === 'gradient' ? [$('#tr-bg-c1').value, $('#tr-bg-c2').value]
      : bgStyle === 'animated' ? [$('#tr-bg-c1').value, $('#tr-bg-c2').value, $('#tr-bg-c3').value]
      : [];
    const cycleOverrides = {};
    ['monthly', 'quarterly', 'yearly'].forEach(cycle => {
      const priceVal = $(`#tr-override-${cycle}-idr`).value;
      const untilVal = $(`#tr-override-${cycle}-until`).value;
      cycleOverrides[cycle] = (priceVal !== '' && untilVal)
        ? { idr: Number(priceVal) || 0, until: new Date(untilVal).toISOString() }
        : null;
    });
    const data = {
      name,
      color: $('#tr-color').value,
      idr: Number($('#tr-idr').value) || 0,
      usd: Number($('#tr-usd').value) || 0,
      monthlyEnabled: !!$('#tr-monthly-enabled').checked,
      quarterlyEnabled: !!$('#tr-quarterly-enabled').checked,
      quarterlyIDR: $('#tr-quarterly-idr').value !== '' ? Number($('#tr-quarterly-idr').value) : null,
      yearlyEnabled: !!$('#tr-yearly-enabled').checked,
      yearlyIDR: $('#tr-yearly-idr').value !== '' ? Number($('#tr-yearly-idr').value) : null,
      cycleOverrides,
      std: Number($('#tr-std').value) || 0,
      fast: Number($('#tr-fast').value) || 0,
      priority: Number($('#tr-priority').value) || 0,
      rpm: Number($('#tr-rpm').value) || 1,
      concurrent: Number($('#tr-concurrent').value),
      access: $('#tr-model-access').value,
      rollover: !!$('#tr-rollover').checked,
      iconShape: $('#tr-icon-shape').value,
      iconEmoji: $('#tr-icon-emoji').value.trim() || null,
      customTag: readTagEditor('tr-tag'),
      bgStyle, bgColors,
      hasBorder: !!$('#tr-has-border').checked,
      borderAnimated: !!$('#tr-border-animated').checked,
      hasGlowing: !!$('#tr-has-glowing').checked,
      glowPulse: !!$('#tr-glow-pulse').checked,
      glowAnimated: !!$('#tr-glow-animated').checked,
    };
    if (editingTierId) {
      Object.assign(state.tiers.find(x => x.id === editingTierId), data);
      toast(`Tier "${name}" updated`, 'save');
    } else {
      state.tiers.push({ id: 't' + Date.now(), ...data });
      toast(`Tier "${name}" created`, 'workspace_premium');
    }
    saveState();
    $('#tier-dlg').hide();
    renderTiers();
    renderUsers();
  }

  // --- User manage ---
  function openUserDialog(id) {
    managingUserId = id;
    const u = state.users.find(x => x.id === id);
    $('#user-dlg-title').textContent = `Manage @${u.name}`;
    $('#user-dlg-body').innerHTML = `
      <div class="field-row">
        <label for="us-tier">Subscription tier <span class="label-hint">manual upgrade — billing is dummy in demo</span></label>
        <select class="a-input" id="us-tier">
          ${state.tiers.map(t => `<option ${t.name === u.tier ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <label for="us-status">Account status</label>
        <select class="a-input" id="us-status">
          <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="exhausted" ${u.status === 'exhausted' ? 'selected' : ''}>Exhausted (credits at 0)</option>
          <option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select>
      </div>
      <div class="field-row">
        <label for="us-credits">Grant bonus credits</label>
        <input class="a-input" type="number" id="us-credits" value="0" step="1000" min="0" />
      </div>`;
    $('#user-dlg').show();
  }

  function saveUser() {
    const u = state.users.find(x => x.id === managingUserId);
    if (!u) return;
    u.tier = $('#us-tier').value;
    u.status = $('#us-status').value;
    const bonus = Number($('#us-credits').value) || 0;
    if (bonus > 0) {
      u.credits += bonus;
      if (u.status === 'exhausted') u.status = 'active';
    }
    saveState();
    $('#user-dlg').hide();
    toast(`@${u.name} updated${bonus ? ` — +${fmt(bonus)} credits granted` : ''}`, 'manage_accounts');
    renderUsers();
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  // Working copy of the routing-priority order, reordered via the arrows and
  // committed on "Save settings".
  let routingPriorityDraft = [];
  function renderRoutingPriority() {
    const host = $('#routing-priority');
    if (!host) return;
    host.innerHTML = routingPriorityDraft.map((f, i) => {
      const meta = ROUTING_FACTORS[f];
      return `<div class="rp-row" data-f="${f}">
          <span class="rp-rank">${i + 1}</span>
          <span class="material-symbols-outlined rp-icon">${meta.icon}</span>
          <div class="rp-text"><div class="rp-label">${meta.label}</div><div class="rp-desc">${meta.desc}</div></div>
          <button type="button" class="icon-btn rp-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up"><span class="material-symbols-outlined">keyboard_arrow_up</span></button>
          <button type="button" class="icon-btn rp-down" data-i="${i}" ${i === routingPriorityDraft.length - 1 ? 'disabled' : ''} title="Move down"><span class="material-symbols-outlined">keyboard_arrow_down</span></button>
        </div>`;
    }).join('');
    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= routingPriorityDraft.length) return;
      [routingPriorityDraft[i], routingPriorityDraft[j]] = [routingPriorityDraft[j], routingPriorityDraft[i]];
      renderRoutingPriority();
    };
    $$('.rp-up', host).forEach(b => b.addEventListener('click', () => move(Number(b.dataset.i), -1)));
    $$('.rp-down', host).forEach(b => b.addEventListener('click', () => move(Number(b.dataset.i), 1)));
  }

  // ---- Custom retry rules (Settings → Silent Retry) ----
  function renderRetryRules() {
    const host = $('#retry-rules-list');
    if (!host) return;
    const rules = state.settings.retryRules || [];
    const testerVal = ($('#rule-tester-input') || {}).value || '';
    host.innerHTML = rules.length ? rules.map((r, i) => {
      const pv = r.providerId ? providerById(r.providerId) : null;
      const isMatch = testerVal && matchesRule(r, testerVal);
      return `<div class="rr-row ${isMatch ? 'rr-match' : ''}" data-i="${i}">
          <span class="rr-scope">${pv ? codename(pv) : 'All providers'}</span>
          <span class="rr-type">${r.matchType === 'regex' ? 'regex' : 'code'}</span>
          <span class="rr-pattern mono">${escapeHtml(r.pattern)}</span>
          <span class="rr-action rr-${r.action}">${r.action === 'fatal' ? 'never retry' : 'retry silently'}</span>
          <span class="rr-note">${escapeHtml(r.note || '')}</span>
          ${isMatch ? '<span class="rr-match-badge"><span class="material-symbols-outlined">check_circle</span>matches</span>' : ''}
          <button type="button" class="icon-btn danger rr-remove" data-i="${i}" title="Remove rule"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    }).join('') : '<div class="hint" style="margin:0">No custom rules — the code chips above cover the common cases.</div>';
    $$('.rr-remove', host).forEach(b => b.addEventListener('click', () => {
      state.settings.retryRules.splice(Number(b.dataset.i), 1);
      saveState();
      renderRetryRules();
    }));
  }

  function addRetryRule() {
    const pattern = $('#rr-pattern').value.trim();
    if (!pattern) { toast('Enter a code or regex pattern', 'error'); return; }
    state.settings.retryRules.push({
      id: 'rr' + Date.now(),
      providerId: $('#rr-provider').value || null,
      matchType: $('#rr-type').value,
      pattern,
      action: $('#rr-action').value,
      note: '',
    });
    $('#rr-pattern').value = '';
    saveState();
    renderRetryRules();
  }

  // ---- Error code display labels (Settings, global) + per-endpoint overrides ----
  function renderErrorAliasList(hostSel, list, onRemove) {
    const host = $(hostSel);
    if (!host) return;
    host.innerHTML = list.length ? list.map((r, i) => `
        <div class="rr-row" data-i="${i}">
          <span class="rr-type">${r.matchType === 'regex' ? 'regex' : 'code'}</span>
          <span class="rr-pattern mono">${escapeHtml(r.pattern)}</span>
          <span class="material-symbols-outlined rt-arrow" style="font-size:16px">arrow_forward</span>
          <span class="rr-label-preview">${escapeHtml(r.label)}</span>
          <button type="button" class="icon-btn danger ea-remove" data-i="${i}" title="Remove label"><span class="material-symbols-outlined">delete</span></button>
        </div>`).join('') : '<div class="hint" style="margin:0">No custom labels yet — raw upstream text is shown as-is.</div>';
    $$('.ea-remove', host).forEach(b => b.addEventListener('click', () => { onRemove(Number(b.dataset.i)); }));
  }
  function renderGlobalErrorAliases() {
    renderErrorAliasList('#error-alias-list', state.settings.errorAliases || [], (i) => {
      state.settings.errorAliases.splice(i, 1);
      saveState();
      renderGlobalErrorAliases();
    });
  }
  function addGlobalErrorAlias() {
    const pattern = $('#ea-pattern').value.trim();
    const label = $('#ea-label').value.trim();
    if (!pattern || !label) { toast('Pattern and display label are required', 'error'); return; }
    state.settings.errorAliases.push({ id: 'ea' + Date.now(), matchType: $('#ea-type').value, pattern, label });
    $('#ea-pattern').value = ''; $('#ea-label').value = '';
    saveState();
    renderGlobalErrorAliases();
  }

  // ---- Loyalty-escalating retention offers (Settings, global) ----
  function renderRetentionOffers() {
    const host = $('#retention-offer-list');
    if (!host) return;
    const list = (state.settings.retentionOffers || []).slice().sort((a, b) => a.minTenureMonths - b.minTenureMonths);
    host.innerHTML = list.length ? list.map(r => `
        <div class="rr-row" data-id="${r.id}">
          <span class="rr-type">${r.minTenureMonths}+ mo</span>
          <span class="rr-pattern mono">${r.discountPercent}% off</span>
          <span class="material-symbols-outlined rt-arrow" style="font-size:16px">or</span>
          <span class="rr-label-preview">${fmt(r.bonusCredits)} bonus credits</span>
          <button type="button" class="icon-btn danger ro-remove" data-id="${r.id}" title="Remove bracket"><span class="material-symbols-outlined">delete</span></button>
        </div>`).join('') : '<div class="hint" style="margin:0">No brackets yet — downgrade/cancel offers fall back to a flat 30% / 50,000 credits.</div>';
    $$('.ro-remove', host).forEach(b => b.addEventListener('click', () => {
      state.settings.retentionOffers = state.settings.retentionOffers.filter(r => r.id !== b.dataset.id);
      saveState();
      renderRetentionOffers();
    }));
  }
  function addRetentionOffer() {
    const minTenureMonths = Number($('#ro-min-months').value);
    const discountPercent = Number($('#ro-discount').value);
    const bonusCredits = Number($('#ro-credits').value);
    if (!Number.isFinite(minTenureMonths) || minTenureMonths < 0 || !discountPercent || !bonusCredits) {
      toast('Min. months, discount % and bonus credits are all required', 'error'); return;
    }
    state.settings.retentionOffers.push({ id: 'ro' + Date.now(), minTenureMonths, discountPercent, bonusCredits });
    $('#ro-min-months').value = ''; $('#ro-discount').value = ''; $('#ro-credits').value = '';
    saveState();
    renderRetentionOffers();
  }

  function initSettings() {
    const s = state.settings;
    $('#rr-provider').innerHTML = '<option value="">All providers</option>' +
      state.providers.map(p => `<option value="${p.id}">${codename(p)} — ${escapeHtml(p.label)}</option>`).join('');
    renderRetryRules();
    renderGlobalErrorAliases();
    renderRetentionOffers();
    $('#rule-tester-input').addEventListener('input', renderRetryRules);
    $('#rr-add-btn').addEventListener('click', addRetryRule);
    $('#ea-add-btn').addEventListener('click', addGlobalErrorAlias);
    $('#ro-add-btn').addEventListener('click', addRetentionOffer);

    $('#retry-enabled').checked = s.retryEnabled;
    setChipValues($('#retry-codes'), s.retryCodes);
    $('#retry-max').value = s.retryMax;
    $('#retry-backoff').value = s.retryBackoff;
    $('#retry-cross').checked = s.retryCross;
    $('#notif-keydown').checked = s.notifKeyDown;
    $('#notif-credits').checked = s.notifCredits;
    $('#notif-credit-hours').value = s.notifCreditHours;
    $('#notif-fail-threshold').value = s.notifFailThreshold;
    $('#notif-user-banner').checked = s.notifUserBanner;
    $('#routing-strategy').value = s.routingStrategy;
    $('#routing-free-elig').checked = s.routingFreeElig;
    $('#probe-interval').value = s.probeInterval;
    $('#queue-timeout').value = s.queueTimeout;
    routingPriorityDraft = (s.routingPriority || ROUTING_PRIORITY_DEFAULT).slice();
    renderRoutingPriority();

    $('#save-settings-btn').addEventListener('click', () => {
      Object.assign(state.settings, {
        retryEnabled: !!$('#retry-enabled').checked,
        retryCodes: chipValues($('#retry-codes')),
        retryMax: Number($('#retry-max').value) || 3,
        retryBackoff: Number($('#retry-backoff').value) || 0,
        retryCross: !!$('#retry-cross').checked,
        notifKeyDown: !!$('#notif-keydown').checked,
        notifCredits: !!$('#notif-credits').checked,
        notifCreditHours: Number($('#notif-credit-hours').value) || 24,
        notifFailThreshold: Number($('#notif-fail-threshold').value) || 5,
        notifUserBanner: !!$('#notif-user-banner').checked,
        routingStrategy: $('#routing-strategy').value,
        routingFreeElig: !!$('#routing-free-elig').checked,
        probeInterval: Number($('#probe-interval').value) || 5,
        queueTimeout: Number($('#queue-timeout').value) || 90,
        routingPriority: routingPriorityDraft.slice(),
      });
      saveState();
      toast('Settings saved', 'save');
    });

    $('#reset-demo-btn').addEventListener('click', () => {
      localStorage.removeItem(STORE_KEY);
      state = seedState();
      saveState();
      renderAll();
      $('#traffic-pill').dataset.state = state.traffic;
      $('#traffic-label').textContent = state.traffic;
      renderAlerts();
      initSettingsValuesOnly();
      toast('Demo data reset to seed', 'restart_alt');
    });
  }

  function initSettingsValuesOnly() {
    const s = state.settings;
    $('#retry-enabled').checked = s.retryEnabled;
    setChipValues($('#retry-codes'), s.retryCodes);
    $('#retry-max').value = s.retryMax;
    $('#retry-backoff').value = s.retryBackoff;
    $('#retry-cross').checked = s.retryCross;
    $('#notif-keydown').checked = s.notifKeyDown;
    $('#notif-credits').checked = s.notifCredits;
    $('#notif-credit-hours').value = s.notifCreditHours;
    $('#notif-fail-threshold').value = s.notifFailThreshold;
    $('#notif-user-banner').checked = s.notifUserBanner;
    $('#routing-strategy').value = s.routingStrategy;
    $('#routing-free-elig').checked = s.routingFreeElig;
    $('#probe-interval').value = s.probeInterval;
    $('#queue-timeout').value = s.queueTimeout;
    routingPriorityDraft = (s.routingPriority || ROUTING_PRIORITY_DEFAULT).slice();
    renderRoutingPriority();
    $('#rr-provider').innerHTML = '<option value="">All providers</option>' +
      state.providers.map(p => `<option value="${p.id}">${codename(p)} — ${escapeHtml(p.label)}</option>`).join('');
    renderRetryRules();
    renderGlobalErrorAliases();
  }

})();
