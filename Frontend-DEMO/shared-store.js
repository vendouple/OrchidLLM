/* ==========================================================================
 * OrchidLLM — Shared Store bridge
 * --------------------------------------------------------------------------
 * A tiny classic-script layer (window.OrchidShared) that lets the admin panel
 * author data that the user dashboard / playground read back live.
 *
 * Loaded as a plain <script> BEFORE each page script (users.js / admin.js are
 * classic scripts; index.js is a module — globals are visible to both).
 *
 * Design notes:
 *  - Everything is persisted to localStorage under the `orchid_shared_*` keys.
 *  - `get(key, seed)` returns authored data if present, otherwise the caller's
 *    seed constant (so the demo works before anything is authored).
 *  - `set(key, value)` writes the data AND bumps a companion `<key>__rev` so
 *    other tabs receive a native `storage` event they can react to.
 *  - `subscribe(key, cb)` fires when another tab changes that key.
 * ========================================================================== */
(function (global) {
  'use strict';

  var KEYS = {
    announcements:  'orchid_shared_announcements',
    models:         'orchid_shared_models',
    modelOverrides: 'orchid_shared_model_overrides',
    groups:         'orchid_shared_groups',
    logs:           'orchid_shared_logs',
    queue:          'orchid_shared_queue',
    tokenGroups:    'orchid_shared_token_groups',
    vendors:        'orchid_shared_vendors',
    boosterPacks:   'orchid_shared_booster_packs',
    tierStyles:     'orchid_shared_tier_styles',
    tierPricing:    'orchid_shared_tier_pricing',
    retentionOffers: 'orchid_shared_retention_offers',
  };

  // All known shared keys (used by reset()).
  var ALL_KEYS = Object.keys(KEYS).map(function (k) { return KEYS[k]; });

  function revKey(key) { return key + '__rev'; }

  function readRaw(key) {
    try { return global.localStorage.getItem(key); }
    catch (e) { return null; }
  }

  /**
   * Return the authored value for `key`, or `seed` when nothing is stored.
   * A deep clone of `seed` is returned so callers can mutate it freely without
   * corrupting their own module-level constant.
   */
  function get(key, seed) {
    var raw = readRaw(key);
    if (raw != null) {
      try { return JSON.parse(raw); }
      catch (e) { /* fall through to seed on corrupt data */ }
    }
    return seed === undefined ? null : clone(seed);
  }

  /** Persist `value` under `key` and bump its revision for cross-tab sync. */
  function set(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      // A monotonic-ish counter derived from the previous rev; avoids Date.now
      // dependency and still changes every write so `storage` events fire.
      var prev = parseInt(readRaw(revKey(key)) || '0', 10) || 0;
      global.localStorage.setItem(revKey(key), String(prev + 1));
    } catch (e) { /* quota / disabled storage — no-op in the demo */ }
    return value;
  }

  /** True when the key has authored data (vs. falling back to a seed). */
  function has(key) { return readRaw(key) != null; }

  /** Clear one shared key (and its rev), or every shared key when omitted. */
  function reset(key) {
    var targets = key ? [key] : ALL_KEYS;
    targets.forEach(function (k) {
      try {
        global.localStorage.removeItem(k);
        global.localStorage.removeItem(revKey(k));
      } catch (e) { /* no-op */ }
    });
  }

  /**
   * Call `cb(newValue)` whenever another tab changes `key`. Returns an
   * unsubscribe function. (Same-tab writes do NOT fire `storage`, by spec —
   * call your own re-render directly after set() in that case.)
   */
  function subscribe(key, cb) {
    function handler(e) {
      if (!e) return;
      if (e.key === key || e.key === revKey(key)) {
        cb(get(key));
      }
    }
    global.addEventListener('storage', handler);
    return function () { global.removeEventListener('storage', handler); };
  }

  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { return v; }
  }

  global.OrchidShared = {
    KEYS: KEYS,
    get: get,
    set: set,
    has: has,
    reset: reset,
    subscribe: subscribe,
    clone: clone,
  };
})(window);
