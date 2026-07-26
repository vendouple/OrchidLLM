# OrchidLLM — Implementation Plan v1 (Demo → Production Port)

> **Purpose:** Actionable, sequenced implementation plan derived from analysis of `Frontend-DEMO/`, the current `src/OrchidLLM.Web` backend, `plans/ORCHIDLLM_PLAN.md` (v3.1.3), and `plans/IMPLEMENTATION_CHECKLIST.md` (2026-07-21).
> **Created:** 2026-07-26
> **Scope:** Everything needed to turn the localStorage-backed demo into the real .NET 10 + MySQL + Redis product. Follows checklist §17 priority order: **Gateway → Billing → Frontend port → Compression → Announcements → Batch/RPM**.

---

## 1. Analysis Summary (what exists today)

### 1.1 Backend (`src/OrchidLLM.Web`) — .NET 10, MVC + Areas, MySQL 8 (Pomelo EF 9), Redis

**Done and real:**
- Full domain schema: **30 entities / 11 files**, `OrchidDbContext` with indexes, delete behaviors, JSON columns, money precision. 2 migrations (`InitialCreate`, `AlignProviderKeysAndAnnouncements` — the latter **not yet applied** to a live DB).
- GitHub OAuth (cookie auth, `OnCreatingTicket` upserts User + AuthProvider + Credit + Subscription, admin role from `Orchid:AdminGithubHandles`). Login view is a real port of demo `login.html`.
- **Channels admin** (the only complete feature): `ChannelsController` CRUD, bulk key paste, AES-256-GCM key encryption (`ProviderKeyCipher`), HTTP reachability probe, `ChannelRpmService` (per-channel Redis RPM).
- `AccountController.TryDemo` inserts `DemoKey` + sets `orchid_demo_key` cookie (30d, Strict, Secure).

**Missing entirely:**
- **API gateway** — no `/v1/*` controllers, no queue worker, no router, no credit metering, no SSE streaming, no per-user RPM, no request/routing log writes.
- **All services layer** beyond cipher + channel RPM. No hosted/background services, no crons.
- Dashboard/Admin UI beyond Channels — nav rail shows 8 disabled "Coming in a later phase" buttons. Root `Views/Home`, `_Layout`, `wwwroot/lib/*` are untouched `dotnet new mvc` template.
- `UserNextCycleOffer` entity (§13) and retention-offer storage — missing from schema.
- No `Database.Migrate()` on boot, no Dockerfile for the web app, no tests, no CI.

### 1.2 Frontend demo (`Frontend-DEMO/`) — ~28,300 lines, 4 pages, M3E web components

| Page | Size | State |
|------|------|-------|
| `users.html/css/js` (dashboard) | ~14,800 L | Complete demo: 8 sections (Home, Models, API Keys, Billing, Settings, Account, Usage, Announcements) |
| `admin.html/css/js` | ~5,200 L | Complete demo: 10 sections incl. model catalog, pools, tiers, booster editor, queue, logs, settings |
| `index.html/css/js` + `app.js` (chat) | ~5,600 L | Complete playground; `app.js` is a stub API layer with OpenAI-shaped contracts |
| `login.*` | ~1,300 L | Already ported to `Views/Account/Login.cshtml` |
| `shared-store.js` | 116 L | localStorage pub/sub bridge admin → user (12 keys) |
| `booster-seed.js` | 727 L | 22-pack booster catalogue + shared tag-badge renderer |

**Key findings that shape this plan:**

1. **The only real backend contract the demo assumes** is `GET /api/auth/session` → `{authenticated, user:{username, display_name, avatar}, tier, isAdmin}` and `POST /api/auth/logout`. Everything else is localStorage.
2. **`shared-store.js` is the seam to replace.** Every `OrchidShared.get(key, seed)` maps to a GET endpoint, every `.set()` to a POST/PUT, `.subscribe()` to SSE/polling. The seed data can become DB fixtures nearly verbatim.
3. **`admin.js`'s `seedState()` is a de-facto schema proposal** — it includes concepts the DB does not have yet: **routing pools** (strategy priority/weighted, failover, members), **silent-retry rules** (regex/code → retry|fatal), **error label aliases** (global + per-provider overrides), **retention offers**, **model groups** (named access tiers with rank), **token groups** (per-key RPM/TPM groups), incidents, retry-activity log. Each needs a schema decision: adopt, defer, or drop.
4. **Security holes to close during the port** (fine for a demo, fatal in prod):
   - Admin gate is self-granting (`session.role='admin'` writable client-side) — real port must use server-side `[Authorize(Roles="admin")]` only.
   - All tier/whitelist/credit/RPM checks are client-side decoration — must be enforced server-side.
   - `renderApiKeys()` + dialogs build HTML with unescaped interpolation and inline `onclick="…('${id}')"` — needs escaping + event delegation once data is server-sourced.
   - Vendor SVG marks are raw admin-input SVG injected unsanitized — sanitize on save or render via `<img src=data:>`.
5. **Design-system debt to fix while porting:**
   - Two token systems: dashboard/admin/login use full `--md-sys-color-*` (dark-only — the Theme Light/Auto and Density controls do nothing), index uses shorthand tokens + a compat layer with a real `[data-theme]` block.
   - Font skew: Google Sans (dashboard/admin/login) vs Plus Jakarta Sans (index). M3E CDN version skew: 2.5.2 (index) vs 2.5.5 (others).
   - `users.html` carries ~775 lines of inline `<style>` `!important` patches that must fold into `users.css`.
   - Hardcoded GitHub Pages URLs in `index.html`/`index.js` (`vendouple.github.io/...`) and absolute `/users.html`, `/admin.html`, `/login` links that break under routing — replace with server-rendered URLs.
6. **Dead shared-store keys** (`logs`, `queue`, `tokenGroups` declared, never published) — the real API supersedes them.
7. `index.js` has one live inference call (pollinations.ai prompt-enhance) — must route through the gateway instead.

---

## 2. Guiding decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Keep the demo JS architecture in the port** — static `wwwroot` JS + JSON APIs, not Razor-rendered sections. Razor supplies only the page shell, auth session injection, and antiforgery. | 14k+ lines of working UI; rewriting as server-rendered Razor is wasted effort. The demo already talks to a `fetch`-shaped seam. |
| D2 | **API-first order**: build the JSON endpoints a section needs, then port that section, section by section. | Avoids a big-bang port; each section is verifiable against real data. |
| D3 | Auth bridge = replace `orchid_session` localStorage reads with a server-injected `window.ORCHID_SESSION` (serialized from claims into the Razor shell) + real `/api/auth/session`. | Demo already prefers server response and falls back to localStorage — flip the preference and delete the fallback. |
| D4 | **Speed/weight direction: lower = faster/preferred** everywhere (checklist resolution 2026-07-21 supersedes plan wording). | Already standardized in entities + Channels UI. |
| D5 | Provider keys live in DB (Channels), encrypted — plan §6/§25 `.env` wording is superseded. | Shipped 2026-07-21. |
| D6 | New concepts from `admin.js` (pools, retry rules, error aliases, retention offers, model groups, token groups): **adopt retention offers + error aliases + model groups now** (cheap, already half-exist), **defer pools + silent-retry engine + token groups** to the router phase (Phase C) where they're consumed. | Don't schema-freeze things whose consumer doesn't exist yet. |
| D7 | Realtime admin→user sync (`OrchidShared.subscribe`) becomes **polling first** (30–60s + on-navigation refetch); SSE/WebSocket later. | Cross-tab live sync is a nice-to-have; polling is one line per section. |
| D8 | The chat playground (`index.*`) ports **last** (Phase 5 in the master plan) — but its `/api/auth/session` endpoint ships in Phase A because the dashboard needs it too. | Matches plan §20 "intentionally barebones until Phase 5". |

---

## 3. Phased plan

### Phase A — Foundation fixes & auth bridge *(small, unblocks everything)*

1. **Apply migrations on boot**: `dotnet ef database update` story — add conditional `app.Services…Database.Migrate()` for dev, document manual apply for prod. Verify migration 2 against live MySQL via docker-compose.
2. **Schema additions** (one migration):
   - `UserNextCycleOffer` (§13 — offer_type, discount, bonus credits, applies_to_cycle, is_used, one active per user).
   - `RetentionOffer` (tenure bracket → discount % + bonus credits — from `RETENTION_OFFERS_SEED`).
   - Global error-alias table (`ErrorLabel`: match code/regex → user-facing label) — per-provider overrides already exist on `Provider`.
   - `ModelGroup` (id, name, rank, order) if not representable by the existing `access_tier` enum — demo treats groups as admin-editable rows, plan treats tiers as enum; **decide: keep enum for v1**, add `ModelGroup` only if admin-editable tiers are required. *(Default: keep enum, map demo groups onto it.)*
3. **Session endpoints**: `GET /api/auth/session` (exact demo shape: `{authenticated, user:{username, display_name, avatar}, tier, isAdmin}`), `POST /api/auth/logout`. Serialize the same object into the Razor shell as `window.ORCHID_SESSION`.
4. **Demo key completion** (checklist §2): `POST /api/demo/key` issuance, Redis daily counter `demo:{uuid}:daily` (TTL end of UTC day), 20-day inactivity hard-delete via a hosted cron service.
5. **Template cleanup**: remove `wwwroot/lib/*` (bootstrap/jquery — unused by real pages), root `Views/Home` template content, `site.css/js`; keep `_Layout` only as the base for new shells.
6. **Dockerfile for the web app** + `web:` service in docker-compose (depends_on mysql/redis) so the full stack runs one-command.

**Exit criteria:** `docker compose up` runs MySQL+Redis+web; GitHub login round-trips; `/api/auth/session` returns real claims; demo key issuance works with the daily counter.

### Phase B — Core API Gateway (checklist §3, plan Phase 1) *(the product's reason to exist)*

Build in this order (each step testable alone):

1. **API key auth middleware** — `sk-orch-` prefix, SHA-256 hash lookup, per-key status/expiry/whitelist checks; demo-key auth path (UUID cookie/header → `DemoKey` row + daily counter).
2. **Per-user RPM service** — mirror `ChannelRpmService`: `rpm:{user_id}`, 60s TTL, tier-configured limits, 429 without charge.
3. **Credit service** — estimate → reserve (`credits_reserved`) → reconcile/release; depletion order (booster fast → booster std → rollover → sub fast → sub std); ledger writes. **Any failure = zero charge** (hard rule, plan §6).
4. **Queue** — Redis sorted set (score = priority from tier/booster/fast-credit config), `IHostedService` worker loop; in-flight counters `inflight:{provider_id}`; SSE heartbeat while queued.
5. **Router v1** — eligibility filter (health, context limit, capability, free-eligibility for free/demo), weight sort (lower = faster) for paid, key-pool LRU rotation from encrypted `ProviderKeys`, health state transitions (429→rate_limited, 402→out_of_credits + admin notification, 5xx→dead threshold), fallback to next candidate.
6. **First adapter + endpoint** — adapter interface (`Request`, `TranslateError`, `IsRateLimited`, async polling hooks) with one OpenAI-compatible adapter; `POST /v1/chat/completions` (streaming SSE + non-streaming), header stripping, error translation (user-actionable vs internal), `X-Orchid-Unsupported-Params` on param strip, `strict_params` enforcement.
7. **`GET /v1/models` / `/v1/models/{id}`** — key-gated, plan-filtered (demo key → demo tier only).
8. **Logging** — `RequestLog` (30d) + `RoutingLog` (15d, obfuscated key ref) write paths + retention cleanup cron.

**Exit criteria:** a real chat completion streams through the gateway against at least one configured channel, is queued by priority, charges credits correctly, logs both tables, and never leaks provider identity in body/headers/errors.

### Phase C — Dashboard API + section-by-section port (checklist §7)

Port shell first: `users.html` → `Areas/Dashboard/Views/Home/Index.cshtml` (+ `_DashboardLayout`), `users.css` → `wwwroot/css/dashboard.css` (folding in the 775 inline `!important` lines), `users.js` → `wwwroot/js/dashboard.js`. Then per section — **API controller first, then swap the section's data source**:

| Order | Section | Endpoints (Dashboard API area, `/api/dashboard/...`) | Demo source replaced |
|-------|---------|------------------------------------------------------|----------------------|
| 1 | Home | `GET overview` (credits breakdown, active packs, recent activity, insights) | `CREDITS`, `ACTIVE_PACKS`, `RECENT_ACTIVITY` |
| 2 | Models | `GET models` (plan-filtered, context bands, multipliers, anonymous endpoint counts), `GET/PUT models/{id}/settings` (per-band enabled/action/compression/promptSuffix) | `MODELS_SEED`, `orchid_model_settings_*` |
| 3 | API Keys | `GET/POST/PUT/DELETE keys`, `POST keys/{id}/rotate` (plaintext shown once) | `API_KEYS` |
| 4 | Usage | `GET usage?filters` (30d request history + stats) | `REQUEST_HISTORY` |
| 5 | Billing | `GET billing` (tier, cycle, renewal), `GET tiers`, `GET boosters` (targeting-rule filtered server-side), `POST checkout` (dummy), `POST plan/change` (immediate/deferred), cancellation flow + retention offer endpoints | `SUBSCRIPTION_TIERS`, booster seed, `DEMO_USER` |
| 6 | Announcements | `GET announcements`, `POST {id}/read`, `POST {id}/dismiss-banner` (3-banner limit, read state, bell badge count) | `ANNOUNCEMENTS_SEED`, seen/dismissed keys |
| 7 | Settings | `GET/PUT settings` (`strict_params` paid-gated server-side, theme/density prefs) | localStorage |
| 8 | Account | `GET account`, `PUT profile`, sessions list/revoke, notification prefs, `POST delete` (14-day grace) | mock data |

Port rules for every section:
- Escape all interpolated server data; replace inline `onclick` string handlers with delegated listeners.
- All gating (tier rank, whitelists, paid-only toggles) re-checked server-side; client keeps only the visual lock state.
- `OrchidShared.get(key, seed)` → `fetch`; seeds retired into `SeedData.cs` fixtures where useful.
- Compression/context config stays **on the model card only** (plan §8 placement rule — never in Settings).

**Exit criteria:** logged-in user completes every dashboard flow against MySQL data with `Frontend-DEMO/` untouched (kept as reference until parity confirmed, then archived).

### Phase D — Admin API + admin port (checklist §8)

Same pattern: `admin.html/css/js` → Admin area shell + `wwwroot/js/admin.js`. Enable nav-rail buttons one by one:

1. **Models + Makers** — model CRUD (context tier rows sequential-gap validation, multipliers, capability matrix, deprecation dates), maker CRUD (**sanitize SVG** on save), attach-providers dialog (weight, contextCap, params).
2. **Plans** — tier CRUD incl. billing options, per-cycle flash pricing, tier styling (icon/emoji/custom tag/bg/glow — persist as JSON style column, already modeled by `tierStyles` shared key).
3. **Boosters** — pack CRUD with split-fuel wallets, targeting rules (typed rule rows matching `BoosterPackTargetingRule`), availability windows, stock/purchase limits, live tag preview (reuse `booster-seed.js` badge renderer as a shared module).
4. **Users** — search/filter, detail dialog, manual tier change (immediate/next-cycle), credit reset/refund, suspend; batch operations.
5. **Queue + Logs** — live queue view (poll Redis-backed queue), routing log viewer (15d, full detail, obfuscated key refs), retry-activity view.
6. **Announcements** — full CRUD matching §21 (type/tone/banner title/dismissibility/expiry, 3-banner enforcement, posted vs edited timestamps).
7. **Settings** — retry rules + error aliases + retention offers + admin notification thresholds + routing config (strategy, priority order, probe interval, queue timeout) → `SystemSetting` rows or typed tables per D6.
8. **Channels polish** — port the demo's chip-based modality matrix, NATO codenames, toast feedback onto the existing functional views.
9. **New views not in demo** (plan §22): SQL query tool (SELECT-only default, per-session destructive override, logged to `AdminSqlQueryLog`), Demo-key management (list/purge/suspend), platform-wide API key oversight.
10. **Admin ↔ User view toggle** (server-verified role, UI-only context switch).

### Phase E — Advanced systems (checklist §5, §11–§13)

1. **Compression pipeline** — token counting (SharpToken or equivalent), context-tier detection, sequential unlock enforcement, plan-gate errors (no charge), compression model call → summary swap → primary call, combined billing; downgrade auto-lock cron at cycle start; admin base prompt in `SystemSetting`.
2. **Billing crons** — rollover calculation (cap, percentage, invalidation rules), monthly refill (even on yearly), deferred upgrade/downgrade applier, exhaustion evaluator (per-tier exhausted priority/RPM/model/context config), next-cycle offer consumption.
3. **Batch queue** — submission endpoint, accumulation, provider stubs, 50% reconciliation, per-tier slots, exhaustion suspension.
4. **Concurrency + traffic state** — per-user concurrent enforcement, `traffic:rpm_rolling` / `traffic:state` metrics, free/demo soft-deprioritization at high/peak (admin pill already in demo UI).

### Phase F — Chat playground port (plan Phase 5)

Port `index.*` + `app.js` into `wwwroot`, replace stubs with real `/v1/*` gateway calls (demo key or session-resolved API key), remove pollinations dependency, unify tokens/fonts/M3E version with the dashboard, fix hardcoded URLs. Playground/roleplay/history per plan §20 Phase 5 scope.

---

## 4. Risks & open decisions

| Risk / decision | Mitigation / owner call needed |
|-----------------|-------------------------------|
| Tier pricing/priority numbers still TBD (plan §28) | Ship with demo's IDR-first placeholder numbers as seed data; admin can edit via Plans CRUD once Phase D lands |
| Model groups: enum vs admin-editable table | Default enum for v1 (D6); revisit if admin needs custom tiers |
| Pools / token groups / silent-retry engine | Defer schema until router consumes them (Phase B–C boundary); demo UI for them stays hidden until backed |
| EF Core 9 on net10.0 | Works, but track EF 10 GA and bump both |
| `appsettings.Development.json` holds a real AES key + dev passwords in working tree | Acceptable dev-only convention (gitignored); production keys via environment/secret store — document in §25 replacement |
| XSS surface in ported JS (unescaped interpolation, raw SVG, inline handlers) | Mandatory fix during each section's port (Phase C/D port rules) |
| Dark-only dashboard CSS vs advertised Light/Auto toggle | Either implement light scheme during shell port or hide the toggle until done — **decide at Phase C start** (default: hide) |
| Plan doc still says Node/Oracle/.env keys | Doc-only update to §6/§25/Decision Log after Phase B (checklist already flags it) |

---

## 5. Suggested immediate next steps (first working session)

1. Phase A items 1–3: boot-time migration for dev, the `UserNextCycleOffer`/`RetentionOffer`/`ErrorLabel` migration, and `/api/auth/session` + `/api/auth/logout` + `window.ORCHID_SESSION` injection.
2. Phase A item 4: demo key issuance endpoint + Redis daily counter (small, already scoped in checklist §2).
3. Start Phase B step 1–2 (API key middleware + per-user RPM) — pure services, no UI dependency.

---

## Changelog

- **2026-07-26** — Initial version. Synthesized from full Frontend-DEMO analysis (~28.3k lines audited), backend scaffold audit, ORCHIDLLM_PLAN.md v3.1.3, and IMPLEMENTATION_CHECKLIST.md (2026-07-21).
