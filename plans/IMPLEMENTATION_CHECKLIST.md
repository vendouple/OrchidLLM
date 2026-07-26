# OrchidLLM — Implementation Checklist & Progress Tracker

> **Purpose:** Track what's already built (Frontend-DEMO + backend `src/`), what's missing, and what needs porting. Source of truth: `plans/ORCHIDLLM_PLAN.md` (v3.1.3).
> **Last updated:** 2026-07-21 (schema corrections + Channels key storage shipped — see Changelog)
> **Legend:** `[x]` done · `[~]` partial / scaffolded · `[ ]` not started · `[!]` deviation from plan (see notes)

---

## 0. Architecture & Stack Reality Check

| Layer | Plan says | Actual state |
|-------|-----------|--------------|
| Backend language | Node.js (plan §25 mentions `oracledb`, `express-session`) | **.NET 10 / ASP.NET Core** (`OrchidLLM.Web.csproj`, `net10.0`) — **deviation** |
| Database | Oracle (`oracledb` driver) | **MySQL 8** (Pomelo EF provider, `docker-compose.yml`) — **deviation** |
| Queue / counters | Redis sorted set + counters | Redis wired (`StackExchange.Redis`, `ChannelRpmService`) — **partial** |
| Frontend | 4 HTML pages, M3E 2.5.5 | `Frontend-DEMO/` has all 4 pages — **demo only, not ported to ASP.NET views** |
| Provider keys | `.env`-only, never in DB | **CHANGED — providers now configured via Channels admin UI in dashboard** (see §6 below) |

> ⚠️ The plan was written for a Node/Oracle stack. The actual repo is .NET 10 + MySQL. Treat plan §25 (env vars, `oracledb`, `express-session`) as **aspirational**, not literal. Map env-driven config to `appsettings.json` + admin DB config instead.

---

## 1. Database Schema (EF Core entities in `src/OrchidLLM.Web/Data/Entities/`)

| Entity file | Plan section | Status | Notes |
|-------------|-------------|--------|-------|
| `Users.cs` — `User`, `UserAuthProvider`, `UserSubscription` | §19, §24 | `[x]` | Fields match plan (username, display_name, email, avatar, role, strict_params, referral, soft-delete, notification_prefs) |
| `Credits.cs` — `UserCredit`, `UserCreditLedger` | §7, §24 | `[x]` | standard/fast/rollover/reserved + ledger |
| `Tiers.cs` — `SubscriptionTier`, `SubscriptionTierBillingOption` | §7, §13 | `[x]` | All tier fields present incl. exhaustion config, billing options |
| `Boosters.cs` — `BoosterPack`, `BoosterPackWallet`, `BoosterPackTargetingRule`, `UserBoosterPack` | §12 | `[x]` | Stale fields removed (2026-07-21): `DurationDays`, `IsPermanent`, `PermanentBaseTierId`, `UserBoosterPack.ExpiresAt` gone. Matches plan v3.1.2. |
| `Providers.cs` — `Provider`, `ProviderKey`, `ModelMaker`, `Model`, `ModelProvider`, `ModelTokenMultiplier` | §5, §6, §9 | `[x]` | `EnvKeyPrefix` removed; `ProviderKey` entity added (encrypted pool, cascade-deletes with Provider). `ModelProvider.SpeedPriority` direction resolved: **lower = faster/preferred**, matching `Provider.Weight` and the Frontend-DEMO UI (plan's "higher=faster" wording is superseded — see §6 below) |
| `ApiKeys.cs` — `ApiKey`, `DemoKey` | §17, §17a | `[x]` | Matches plan (hash, preview, limits, whitelist, expose_balance, demo key UUID) |
| `Logs.cs` — `RequestLog`, `RoutingLog`, `AdminSqlQueryLog` | §18 | `[x]` | 30d/15d retention fields, obfuscated key ref |
| `Queue.cs` — `RequestQueueItem`, `BatchRequest` | §4, §14 | `[x]` | Schema scaffolded; batch is stub per plan |
| `Compression.cs` — `UserCompressionSetting`, `UserContextTierPreference` | §8 | `[x]` | Per-model, per-tier config |
| `Announcements.cs` — `Announcement`, `AdminNotification`, `UserDismissedBanner`, `UserReadAnnouncement` | §21 | `[x]` | Added (2026-07-21): `BannerTitle`, `IsBannerDismissible`, `PostedAt`, `LastEditedAt`; `BannerExpiresAt` replaced by `ExpiresAt`. Split into `UserDismissedBanner` (banner dismissals only) + new `UserReadAnnouncement` (read state) per plan v3.1.3. No controller/UI wired to these fields yet — that's still open, see §11. |
| `Misc.cs` — `ReferralTransaction`, `SystemSetting` | §23, §24 | `[x]` | Scaffolded for future phase |
| `OrchidDbContext.cs` | §24 | `[x]` | All DbSets registered, indexes, delete behaviors, seed data |
| `SeedData.cs` | §25 | `[x]` | Model makers + system settings (demo limits, heartbeat, admin handles) |
| Migration `20260720111046_InitialCreate` | — | `[x]` | Initial schema applied |
| Migration `20260721093129_AlignProviderKeysAndAnnouncements` | — | `[x]` | Schema corrections + `ProviderKey` table. Not yet applied to a live DB in this environment (no local MySQL/Docker available) — verified via `dotnet ef migrations script` SQL review instead of `database update`. Run `dotnet ef database update` before next deploy. |

### Schema TODOs
- [x] ~~Remove stale booster fields~~ — done 2026-07-21
- [x] ~~Add announcement fields~~ — done 2026-07-21
- [x] ~~Split announcement dismiss/read~~ — done 2026-07-21
- [x] ~~Resolve `ModelProvider.SpeedPriority` direction~~ — standardized on lower=faster (matches `Provider.Weight` + demo UI), done 2026-07-21
- [x] ~~Reconcile `Provider.EnvKeyPrefix`~~ — removed; see §6 for the new `ProviderKey` model

---

## 2. Auth System (§19, §17a)

| Feature | Status | Notes |
|---------|--------|-------|
| GitHub OAuth | `[x]` | `Program.cs` wires `AddGitHub` with `OnCreatingTicket` upserting user + claims |
| Cookie session | `[x]` | `AddCookie` with login path `/Account/Login` |
| Admin role middleware | `[x]` | `[Authorize(Roles = "admin")]` on Admin area controllers |
| Default admin handle from config | `[x]` | `Orchid:AdminGithubHandles` in `appsettings.json` |
| Google OAuth | `[ ]` | Plan §19 Phase 6 — not started |
| Multi-provider linking UI | `[ ]` | `UserAuthProvider` table exists; no UI |
| `AccountController` | `[~]` | Exists in `Controllers/` — needs login/callback endpoints (verify) |
| Demo key system (§17a) | `[~]` | `DemoKey` entity exists; **no generation endpoint, cookie+localStorage persistence, Redis daily counter, or 20-day inactivity cron** |
| Session → frontend bridge | `[ ]` | `login.js` simulates session in localStorage; backend session not yet bridged to ported views |

### Auth TODOs
- [x] ~~Verify `AccountController` has GitHub login + callback actions~~ — confirmed 2026-07-26 (`ExternalLogin`/`ExternalLoginCallback`)
- [x] ~~Implement demo key issuance endpoint (`POST /api/demo/key`) returning UUID~~ — `DemoApiController` + `DemoKeyService.IssueAsync`, 2026-07-26
- [x] ~~Demo key cookie persistence (`orchid_demo_key`, 30-day, SameSite=Strict, Secure)~~ — shared by `TryDemo` + `POST /api/demo/key`
- [x] ~~Demo key Redis daily counter (`demo:{uuid}:daily`, TTL = end of UTC day)~~ — `DemoKeyService.TryConsumeAsync`/`GetRemainingAsync` (+ `GET /api/demo/remaining` for the banner pill)
- [x] ~~Demo key 20-day inactivity hard-delete cron~~ — `DemoKeyCleanupService` (daily 03:00 UTC + catch-up run 1 min after boot)
- [~] Bridge ASP.NET auth session → ported frontend — **API half done 2026-07-26**: `GET /api/auth/session` (exact demo shape: `{authenticated, user:{username, display_name, avatar}, tier, isAdmin}`) + JSON `POST /api/auth/logout` in `AuthApiController`. Remaining: inject `window.ORCHID_SESSION` into the ported Razor shells (Phase C port work)

---

## 3. API Gateway (§3, §4, §6, §16, §18)

| Feature | Status | Notes |
|---------|--------|-------|
| `/v1/chat/completions` (stream + non-stream) | `[~]` | **Shipped 2026-07-26** (`GatewayController`): full pipeline (auth → reserve → queue slot → route → dispatch w/ fallback → reconcile → logs), SSE streaming passthrough. **Not yet exercised against a live provider** (no local Docker/MySQL/Redis) — first live test pending |
| `/v1/completions` | `[ ]` | — |
| `/v1/images/generations`, `/v1/images/edits` | `[ ]` | — |
| `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/audio/music` | `[ ]` | — |
| `/v1/video/generations` | `[ ]` | — |
| `/v1/models` (key-gated, plan-filtered) | `[x]` | 2026-07-26 — OpenAI list shape + orchid extension fields, filtered by caller access-tier rank (`AccessTiers`) |
| `/v1/models/{id}` | `[x]` | Same filtering; 404 `model_not_found` when out of plan |
| Request queue (Redis sorted set, priority) | `[~]` | `[!]` **v1 deviation**: `GatewayRequestQueue` is an in-memory priority admission queue (higher priority first, FIFO within, `-1` admin bypass, global dispatch cap `Orchid:MaxConcurrentDispatch`). Completion signalling needs an in-process handle anyway (HTTP request parked); Redis sorted set only pays off multi-instance — revisit then. `RequestQueueItem` rows still written for the admin Queue view |
| Queue worker loop | `[x]` | Event-driven admission inside `GatewayRequestQueue` (no polling hosted service needed with the slot design) |
| Provider router (health, fallback, in-flight) | `[x]` | `ProviderRouter`: eligibility (active/health/context/free-only for demo+free), weight-then-speed order for paid (lower=faster), LRU key rotation from encrypted pool, health transitions (429→rate_limited+backoff, 402→out_of_credits+admin notification, 401/403→key down, 5xx/timeout→dead) |
| Provider adapters (per-provider, §Phase 7) | `[~]` | `IProviderAdapter` + `OpenAiCompatibleAdapter` (streaming SSE passthrough w/ shadow usage parse, error translation phrasebook). One family only — per-provider adapters remain Phase 7 |
| RPM enforcement per user (Redis `rpm:{user_id}`) | `[x]` | `UserRpmService`, enforced in middleware |
| Credit reservation + reconciliation | `[x]` | `CreditService`: estimate→reserve→reconcile/release, §7 depletion order (booster fast→booster std→rollover→sub fast→sub std), ledger writes, zero-charge-on-failure |
| Request logs (30d) + routing logs (15d) | `[~]` | Write path live for chat endpoint (obfuscated `KeyRefHash`, `ProvidersAttempted` JSON, queue wait ms). Retention **cleanup cron still missing** |
| SSE heartbeat while queued | `[x]` | `: heartbeat` comment every `Orchid:HeartbeatIntervalSeconds` (default 15s) while awaiting a slot |
| Provider obfuscation (strip headers, translate errors) | `[~]` | Upstream headers never forwarded (body-only copy); errors translated (fixed phrasebook — `ErrorLabels` DB table not consumed yet); non-stream body `model` re-branded to orchid slug. **TODO: stream chunks pass the provider's model id through**; wire `ErrorLabel`/`Provider.ErrorAliasOverrides` into translation |
| `strict_params` handling | `[ ]` | Field on `User`; no enforcement |
| Parameter stripping + `X-Orchid-Unsupported-Params` header | `[ ]` | — |

### Gateway TODOs
- [~] Create `ApiGatewayController` with all `/v1/*` endpoints — 2026-07-26: `GatewayController` ships `/v1/chat/completions` + `/v1/models` + `/v1/models/{id}`. Remaining endpoints (completions/images/audio/video) still open
- [ ] **First live end-to-end test** of chat completions against a configured channel (blocked here on no Docker; needs MySQL+Redis+one provider key)
- [ ] Wire `ErrorLabels` table + `Provider.ErrorAliasOverrides` into adapter error translation (currently a fixed built-in phrasebook)
- [ ] Re-brand `model` field inside streaming chunks (non-stream responses already re-branded)
- [ ] Log-retention cleanup cron (30d RequestLogs / 15d RoutingLogs)
- [ ] Provider re-probe cron (restore `rate_limited`/`dead` → `active`; fail-count threshold before `dead`)
- [ ] `strict_params` + param stripping + `X-Orchid-Unsupported-Params` (needs `ModelProvider.SupportsParams` consumed in router)
- [x] ~~Implement API key auth middleware (`sk-orch-` prefix, hash lookup)~~ — 2026-07-26: `Services/Gateway/` (`ApiKeyAuthenticator` SHA-256 lookup + active/expiry/credit-limit checks, `GatewayAuthMiddleware` on `/v1/*` with OpenAI-shaped errors, `GatewayCaller` in HttpContext.Items). Smoke-tested: no-auth `/v1/*` → 401 `missing_api_key`. Note: no key *generation* yet (dashboard CRUD, §7)
- [x] ~~Implement demo key auth path~~ — bearer `demo` or bare request + `orchid_demo_key` cookie → `DemoKeyService.TryConsumeAsync` (daily quota consumed per request; 429 `demo_limit_reached` when over)
- [ ] Build Redis-backed request queue + worker service (`IHostedService`)
- [ ] Build provider router with health tracking + fallback
- [x] ~~Per-user RPM counter service (mirror `ChannelRpmService`)~~ — `UserRpmService` (`rpm:{user_id}`, 60s TTL), enforced in `GatewayAuthMiddleware` using `Tier.RpmNormal` (exhausted-state RPM deferred to the Phase E exhaustion evaluator)
- [ ] Credit reservation service (estimate → reserve → reconcile → release on fail)
- [ ] SSE streaming + heartbeat for queued requests
- [ ] Provider adapter interface + at least one stub adapter
- [ ] Error translation pipeline (user-actionable vs internal)
- [ ] Header stripping middleware

---

## 4. Billing, Credits & Plans (§7, §10, §11, §12, §13)

| Feature | Status | Notes |
|---------|--------|-------|
| Subscription tier CRUD (admin) | `[ ]` | Entity exists; no admin controller |
| Manual plan upgrade (admin) | `[ ]` | — |
| Credit pools (standard/fast/rollover/booster) | `[x]` | `UserCredit` + `UserBoosterPack` entities |
| Credit depletion order | `[ ]` | No service implementing §7 order |
| Exhaustion system | `[~]` | Tier config fields exist; no enforcement |
| Rollover cron (end-of-cycle) | `[ ]` | — |
| Booster pack stacking | `[ ]` | — |
| Split-fuel booster wallets | `[x]` | `BoosterPackWallet` entity |
| Booster targeting rules | `[x]` | `BoosterPackTargetingRule` entity |
| Dummy checkout endpoints (IDR + USD) | `[ ]` | — |
| Billing cycle + deferred upgrade | `[~]` | `UserSubscription.PendingTierId` exists; no processing |
| Next-cycle offers (§13) | `[ ]` | **No `UserNextCycleOffer` entity** — missing from schema |
| Retention offers (churn prevention) | `[~]` | Frontend `admin.js` seeds `RETENTION_OFFERS_SEED`; no backend table |

### Billing TODOs
- [x] ~~Add `UserNextCycleOffer` entity~~ — `Data/Entities/Offers.cs`, migration `20260726144251_AddOffersAndErrorLabels`, 2026-07-26 ("one active per user" left as a business rule for the billing service, not a DB constraint)
- [x] ~~Add retention offer entity~~ — `RetentionOffer` (typed table, unique on `MinTenureMonths`), same migration; also added global `ErrorLabel` table (admin Settings → Error Labels; per-channel overrides stay on `Provider.ErrorAliasOverrides`)
- [ ] Credit depletion order service (booster fast → booster std → rollover → sub fast → sub std)
- [ ] Rollover cron job (`IHostedService` or Quartz)
- [ ] Exhaustion state evaluator
- [ ] Dummy checkout controller (IDR + USD, cart style)
- [ ] Billing cycle processor (monthly credit refill even on yearly billing)
- [ ] Deferred upgrade applier at cycle start

---

## 5. Compression & Context System (§8, §9)

| Feature | Status | Notes |
|---------|--------|-------|
| `UserCompressionSetting` entity | `[x]` | Per-model, per-tier |
| `UserContextTierPreference` entity | `[x]` | allow/compress/error behaviour |
| `ModelTokenMultiplier` entity | `[x]` | input/output/cache read/write |
| Compression pipeline (sequential backend) | `[ ]` | No service |
| Context tier unlock + sequential enforcement | `[ ]` | — |
| Plan-downgrade context auto-lock at cycle start | `[ ]` | — |
| Admin base compression prompt | `[ ]` | No field/setting |
| Compression UI on model card (frontend) | `[x]` | `users.js` has full compression config UI per tier |
| Budget action selector per tier (frontend) | `[x]` | In `users.js` |

### Compression TODOs
- [ ] Compression execution service (count tokens → tier check → compress → primary)
- [ ] Sequential context tier unlock enforcement
- [ ] Auto-lock tiers on downgrade at billing cycle start
- [ ] Admin base prompt storage (`SystemSetting` or new field)
- [ ] Token counting utility (tiktoken equivalent in .NET)

---

## 6. Provider / Channels System — **DIRECTION CHANGE** ⚠️ — base functionality shipped 2026-07-21

> **Plan says:** Provider API keys stored **exclusively in `.env`**. `providers` table holds only `env_key_prefix` to resolve keys at runtime (§6, §25, Decision Log Set E).
>
> **New direction (per user):** Providers are configured via **Channels in the admin dashboard** instead of `.env`. Implemented:
> - Provider API keys are **stored in the DB**, encrypted at rest (AES-256-GCM, `Orchid:EncryptionKey` config — see `appsettings.json`)
> - `Provider.EnvKeyPrefix` has been **removed** (was unreferenced outside the entity/migrations)
> - Admin UI manages keys directly via `ChannelsController` + `Areas/Admin/Views/Channels/*` (bulk-paste textarea, masked preview list, per-key revoke)
> - Key rotation pool / LRU selection at **dispatch time** is still open — see TODOs (this pass only covers admin-side storage + CRUD, not the router consuming the pool, since the gateway/router itself doesn't exist yet — see §3)

### Current state
| Feature | Status | Notes |
|---------|--------|-------|
| `Provider` entity | `[x]` | `EnvKeyPrefix` removed; `Keys` nav added |
| `ProviderKey` entity | `[x]` | `ProviderId`, `KeyCipher` (AES-GCM), `KeyPreview`, `Status`, `RateLimitUntil`, `LastUsedAt`, `CreatedAt`. Cascade-deletes with `Provider`. |
| `IProviderKeyCipher` / `ProviderKeyCipher` | `[x]` | `Services/Security/ProviderKeyCipher.cs` — AES-256-GCM, registered as singleton in `Program.cs`, key from `Orchid:EncryptionKey` |
| `ChannelsController` (admin) | `[x]` | CRUD + bulk key add (`Save`), `DeleteKey`, `Probe` (real HEAD-request reachability check, not a mock), modality + error-alias editing |
| Channels Index view | `[x]` | Lists providers with live RPM, modality support, key pool (masked previews), probe/edit/delete actions |
| Channels Edit view | `[x]` | Full edit form: modality rows (name + comma-separated params), error-alias override rows, bulk key-paste textarea |
| `ChannelRpmService` | `[x]` | Per-channel RPM counter (Redis) |
| Frontend admin Channels UI (`Frontend-DEMO/admin.js`) | `[x]` | Reference implementation — full JS chip-based modality matrix / dynamic add-row UX not yet ported 1:1 (ASP.NET views use plain form rows instead of dynamic JS — functionally equivalent, less polished); full visual port is still Phase 4 frontend work (§7/§8) |
| Key pool storage | `[x]` | `ProviderKeys` table, migration `20260721093129_AlignProviderKeysAndAnnouncements` |
| Key encryption at rest | `[x]` | AES-256-GCM, dev key pre-seeded in `appsettings.Development.json` (dev-only, mirrors existing dev DB password convention) |
| Key rotation / LRU selection at dispatch | `[ ]` | **Still open** — no gateway/router exists yet to consume the pool (blocked on §3 API Gateway) |
| Speed/free-eligibility as DB columns | `[x]` | Already existed (`Provider.Weight`, `Provider.Free`); direction resolved as lower=faster (see §1) |

### Channels TODOs (new direction)
- [x] ~~Add `ProviderKey` entity~~ — done 2026-07-21
- [x] ~~Resolve Weight vs Speed~~ — standardized on lower=better (`Weight`), matches demo + existing UI copy
- [x] ~~Add key encryption service~~ — `ProviderKeyCipher` (AES-GCM)
- [x] ~~Extend `ChannelsController`~~ — key bulk-add/delete, modalities, error aliases, probe
- [ ] **Port frontend Channels UI polish** (`admin.js` dynamic JS chip matrix, NATO codenames, live toast feedback) to ASP.NET — current views are functional but simpler forms, not a pixel port. Tracked under §7/§8 frontend port phase.
- [x] ~~Update `Provider` entity~~ — `EnvKeyPrefix` dropped entirely (no callers referenced it)
- [ ] Update `plans/ORCHIDLLM_PLAN.md` §6/§25/Decision Log Set E text to describe DB-stored keys instead of `.env` (doc-only, not yet done — this checklist is the source of truth in the meantime)
- [ ] Router reads keys from DB pool instead of env var resolution — blocked on the API Gateway/router existing at all (§3)
- [ ] Real per-provider auth probing (current `Probe` action only checks HTTP reachability, not credential validity) — needs the Phase 7 adapter-per-provider layer to do properly

---

## 7. Frontend — Dashboard (`users.html` / `users.js`)

> The `Frontend-DEMO/` is a **working demo** (localStorage-backed). It needs porting to ASP.NET Razor views under `Areas/Dashboard/Views/`. Currently `Areas/Dashboard/Views/Home/Index.cshtml` is a placeholder.

| Section (plan §20) | Demo status | Ported to ASP.NET | Notes |
|--------------------|-------------|-------------------|-------|
| Home (overview, credit meters) | `[x]` | `[ ]` | `users.js` renders credit console, recent activity |
| Usage (30d request history) | `[x]` | `[ ]` | `initUsageSection()`, `renderUsageTable()` with compression/routing badges |
| Models (catalog + per-card config) | `[x]` | `[ ]` | `renderModels()`, model card with context tiers, compression config, budget action |
| API Keys (CRUD + per-key config) | `[x]` | `[ ]` | `renderApiKeys()` — full CRUD, limits, whitelist, expose_balance |
| Billing (plan, credits, booster store) | `[x]` | `[ ]` | `initBillingSection()`, `renderSubscriptionPlans()`, `renderBoosterStore()`, `renderCreditsConsole()` |
| Settings (strict_params, prefs) | `[x]` | `[ ]` | `renderSettingsVersionCard()` — **correctly excludes compression** (per plan §8 placement rule) |
| Account (profile, security, danger zone) | `[x]` | `[ ]` | `renderAccountHistory()` — profile, sessions, deletion flow |
| Announcements (banner + bell + page) | `[x]` | `[ ]` | `renderAnnouncements()`, `renderGlobalBanners()`, `updateBellBadge()` |
| Dynamic tier accent colors | `[x]` | `[ ]` | `applyTierAccent()` — DB-driven `display_color_token` |
| Rollover cap nudge | `[~]` | `[ ]` | Partial in demo |
| Admin ↔ User view toggle | `[~]` | `[ ]` | Demo has admin link; no toggle button |

### Dashboard port TODOs
- [ ] Port `users.html` shell → `Areas/Dashboard/Views/Home/Index.cshtml` (or `_Layout`)
- [ ] Port `users.css` → `wwwroot/css/dashboard.css`
- [ ] Port `users.js` → `wwwroot/js/dashboard.js` (replace localStorage with fetch calls)
- [ ] Port `shared-store.js` bridge (or replace with API calls)
- [ ] Port `booster-seed.js` (or serve packs from API)
- [ ] Dashboard API controllers (Home, Models, ApiKeys, Billing, Account, Announcements, Usage)
- [ ] Replace mock `USER`/`TIER` with server-injected auth session
- [ ] Replace `OrchidShared.get()` seed fallbacks with real API responses

---

## 8. Frontend — Admin (`admin.html` / `admin.js`)

> `Areas/Admin/Views/Home/Index.cshtml` is a placeholder pointing to Channels. Only Channels is wired in backend.

| Section (plan §22) | Demo status | Ported to ASP.NET | Notes |
|--------------------|-------------|-------------------|-------|
| Dashboard (KPIs, health, incidents) | `[x]` | `[ ]` | `renderDashboard()` — stat grid, req chart, retry table, health list |
| Models (catalog maker) | `[x]` | `[ ]` | `renderModels()`, `openModelDialog()`, context tier rows, multipliers |
| Model Maker (vendors) | `[x]` | `[ ]` | `renderMakers()`, `openMakerDialog()` — SVG mark + name |
| Channels (providers) | `[x]` | `[~]` | **Backend has basic CRUD only**; demo has full key pool, modality matrix, error aliases |
| Plans (subscription tiers) | `[x]` | `[ ]` | `renderTiers()` — full tier config |
| Booster Packs | `[x]` | `[ ]` | `renderBoosterPacks()`, `openBoosterDialog()`, split-fuel wallets, targeting rules |
| Users (search, manage) | `[x]` | `[ ]` | `renderUsers()`, `openUserDialog()` |
| Queue (live view) | `[x]` | `[ ]` | `renderQueue()` |
| Logs (routing + activity) | `[x]` | `[ ]` | `renderLogs()` with compression/routing columns |
| Announcements | `[x]` | `[ ]` | `renderAnnouncements()`, `openAnnDialog()` — type/tone/banner/version |
| Settings (retry, error labels, retention, routing, notifs) | `[x]` | `[ ]` | `initSettings()` — retry rules, error aliases, retention offers, routing priority, admin notifications |
| SQL Query tool | `[ ]` | `[ ]` | **Not in demo**; plan §22 lists it |
| Demo Session Keys (purge/suspend) | `[ ]` | `[ ]` | **Not in demo**; plan §22 lists it |
| API Keys oversight (platform-wide) | `[ ]` | `[ ]` | **Not in demo**; plan §22 lists it |
| Admin notifications bell | `[x]` | `[ ]` | `initAlerts()`, `renderAlerts()` |
| Traffic state pill | `[x]` | `[ ]` | `initTraffic()` — low/normal/high/peak |

### Admin port TODOs
- [ ] Port `admin.html` shell → `Areas/Admin/Views/Home/Index.cshtml` (or `_Layout`)
- [ ] Port `admin.css` → `wwwroot/css/admin.css`
- [ ] Port `admin.js` → `wwwroot/js/admin.js`
- [ ] Admin API controllers for each section (Models, Makers, Tiers, Boosters, Users, Queue, Logs, Announcements, Settings)
- [ ] **Extend Channels controller** to match demo (keys, modalities, error aliases, bulk keys)
- [ ] Add SQL Query controller + view (read-only SELECT default, destructive override toggle, logged)
- [ ] Add Demo Keys management view (list, purge, suspend)
- [ ] Add platform-wide API Keys oversight view

---

## 9. Frontend — Chat / Index (`index.html` / `index.js` / `app.js`)

> Plan §20: `index.html` is intentionally barebones (demo + redirect). Authenticated chat is Phase 5.

| Feature | Demo status | Ported | Notes |
|---------|-------------|--------|-------|
| Chat UI (message view, composer) | `[x]` | `[ ]` | `index.js` full chat with attachments, image viewer, tools |
| Demo mode (20 req/day counter) | `[x]` | `[ ]` | `demoRemaining()`, `S.demoCount` |
| Model dropdown (categorized) | `[x]` | `[ ]` | `renderToolsModelList()` — text/image/video/audio/tts/music/transcription |
| `app.js` API talker | `[x]` | `[ ]` | Stubbed (`MOCK_CATALOG`, pollinations for images) — **not real gateway calls** |
| Theme toggle | `[x]` | `[ ]` | `applyTheme()` |
| Temp chat mode | `[x]` | `[ ]` | `toggleTemp()` |
| PWA nudge | `[x]` | `[ ]` | — |
| Authenticated chat (auto API key) | `[ ]` | `[ ]` | Phase 5 |
| Playground mode | `[ ]` | `[ ]` | Phase 5 |
| Roleplay / Characters | `[ ]` | `[ ]` | Phase 5 |
| Conversation history (account-tied) | `[ ]` | `[ ]` | Phase 5 |
| Minigames | `[ ]` | `[ ]` | Phase 5+ |
| Social features | `[ ]` | `[ ]` | Phase 6+ |

### Chat TODOs
- [ ] Port `index.html` → `Views/Home/Index.cshtml` (or keep as static wwwroot page)
- [ ] Port `index.js`, `app.js`, `index.css` → `wwwroot/`
- [ ] Replace `app.js` stubs with real `/v1/*` gateway calls
- [ ] Wire demo key from backend (not localStorage-only)
- [ ] Phase 5: authenticated chat using session-resolved API key

---

## 10. Frontend — Login (`login.html` / `login.js`)

| Feature | Demo status | Ported | Notes |
|---------|-------------|--------|-------|
| GitHub OAuth button | `[x]` | `[~]` | Demo simulates; backend `AccountController` has real OAuth |
| Falling shapes background | `[x]` | `[ ]` | `login.js` canvas animation |
| Demo key generation on login | `[x]` | `[ ]` | localStorage only |

### Login TODOs
- [ ] Port `login.html` → `Views/Account/Login.cshtml`
- [ ] Replace simulated OAuth with real GitHub redirect via `AccountController`
- [ ] Port falling shapes animation

---

## 11. Announcement & Changelog System (§21)

| Feature | Demo status | Backend | Notes |
|---------|-------------|---------|-------|
| Unified announcement + changelog | `[x]` | `[~]` | `Announcement` entity has `Type` (announcement/changelog/both) |
| Tones (info/warning/error/success/neutral/changelog) | `[x]` | `[x]` | `Tone` field |
| Version tag | `[x]` | `[x]` | `VersionTag` field |
| Banner (max 3, dismissible) | `[x]` | `[~]` | **Missing `IsBannerDismissible`, `BannerTitle`, `ExpiresAt`** |
| Read state tracking | `[x]` | `[ ]` | **Missing `UserReadAnnouncements` table** |
| Bell icon + badge | `[x]` | `[ ]` | `updateBellBadge()` in demo |
| Cross-linked entries | `[x]` | `[x]` | `RelatedAnnouncementId` |
| Posted vs last-edited timestamps | `[x]` | `[ ]` | **Missing `PostedAt`, `LastEditedAt`** — only `CreatedAt` |

### Announcements TODOs
- [ ] Add `BannerTitle`, `IsBannerDismissible`, `PostedAt`, `LastEditedAt` to `Announcement`
- [ ] Rename `BannerExpiresAt` → `ExpiresAt` (or keep both with clear semantics)
- [ ] Add `UserReadAnnouncements` table; rename `UserDismissedAnnouncements` → `UserDismissedBanners`
- [ ] Announcement API controller (list, create, edit, expire, dismiss, mark-read)
- [ ] 3-banner limit enforcement
- [ ] Bell badge count (unread active announcements + changelog)

---

## 12. Batch Queue System (§14)

| Feature | Status | Notes |
|---------|--------|-------|
| `BatchRequest` entity | `[x]` | Scaffolded |
| Batch submission | `[ ]` | Stubs only per plan |
| 50% discount on final cost | `[~]` | `DiscountRate` field exists (default 0.5) |
| Concurrent batch slots per tier | `[x]` | `SubscriptionTier.BatchQueueSlots` |
| Exhaustion rule | `[ ]` | — |

### Batch TODOs
- [ ] Batch submission endpoint
- [ ] Batch accumulation + provider batch API call (stubs OK for now)
- [ ] Polling/webhook completion
- [ ] 50% discount reconciliation

---

## 13. Concurrent Request & RPM Systems (§15, §16)

| Feature | Status | Notes |
|---------|--------|-------|
| Per-user concurrent limit | `[~]` | `SubscriptionTier.MaxConcurrentRequests` exists; no enforcement |
| Per-user RPM | `[~]` | Tier fields exist; **no per-user RPM service** (only per-channel) |
| Per-channel RPM | `[x]` | `ChannelRpmService` |
| Redis key reference (§16) | `[ ]` | No `rpm:{user_id}`, `inflight:{provider_id}`, `traffic:*` keys implemented |

### TODOs
- [ ] `UserRpmService` (mirror `ChannelRpmService`, key `rpm:{user_id}`, 60s TTL)
- [ ] Per-provider in-flight counter (`inflight:{provider_id}`)
- [ ] Traffic state rolling metric (`traffic:rpm_rolling`, `traffic:state`)
- [ ] Concurrent request enforcement middleware

---

## 14. Affiliate / Referral System (§23)

| Feature | Status | Notes |
|---------|--------|-------|
| `ReferralTransaction` entity | `[x]` | Scaffolded |
| `User.ReferralCode` + `ReferredBy` | `[x]` | Fields exist |
| Referral code on checkout | `[ ]` | — |
| Reward calculation | `[ ]` | Future phase |

### TODOs
- [ ] Phase 6 — not v1

---

## 15. Phased Rollout Progress (plan §26)

| Phase | Status | Notes |
|-------|--------|-------|
| **Phase 0 — Foundation** | `[~]` | DB schema ✅ (corrected 2026-07-21), Auth ✅, Provider mgmt ✅ (Channels + encrypted key storage), Model registry entity only, Gateway skeleton ❌ |
| **Phase 1 — Core API Gateway** | `[ ]` | Queue, router, chat endpoint, credits, RPM, API keys, demo keys, models endpoint, logs — all not started |
| **Phase 2 — Billing & Plans** | `[~]` | Entities exist; no services/controllers |
| **Phase 3 — Advanced Features** | `[~]` | Compression entities exist; no pipeline. Batch stubbed. Other endpoints ❌ |
| **Phase 4 — Frontend Polish** | `[~]` | Demo complete; **not ported to ASP.NET views** |
| **Phase 5 — Consumer App** | `[ ]` | Demo chat exists; authenticated chat not started |
| **Phase 6 — Growth** | `[ ]` | Future |
| **Phase 7 — Provider Integration** | `[ ]` | Future — adapters not started |

---

## 16. Open TODOs from Plan §28 (owner decisions needed)

- [ ] Fill in tier pricing table (§7) — IDR/USD, credits, priorities, accent colours
- [ ] Finalise tier names (Free / Basic / Plus / Pro / Elite?)
- [ ] Decide `demo` tier model list
- [ ] **RESOLVED by new direction**: multi-key provider naming → now DB-stored via Channels (was `.env` `OPENAI_KEY_1`)
- [ ] Heartbeat ping interval (suggest 15s — already in `SystemSetting` seed)
- [ ] Per-request timeout thresholds (chat ~30s, image ~120s, video ~300s)
- [ ] `ADMIN_GITHUB_HANDLES` format — comma-separated (already in `appsettings.json` `Orchid:AdminGithubHandles` array)
- [ ] `referral_code` on signup for all or on demand?
- [ ] Demo key cookie name + expiry (suggest `orchid_demo_key`, 30-day)
- [ ] Demo inactivity cron schedule (suggest daily 03:00 UTC)
- [ ] Phase 5 scope cut (roleplay/playground features)
- [ ] Account deletion grace period (14 days assumed)
- [ ] Username uniqueness rules (min length, allowed chars, reserved words)
- [ ] **N/A**: Oracle driver mode — repo uses MySQL, not Oracle
- [ ] **N/A**: `ORACLE_DB_CONNECTION_STRING` — MySQL connection string instead
- [ ] SQL query tool scope (read-only SELECT always, or separate role?)
- [ ] Param priority order: `streaming > image > tool_calling > reasoning > search` — confirm

---

## 17. Implementation Priority (suggested order)

1. **Schema corrections** (§1 TODOs) — cheap, unblocks everything
2. **Channels key storage** (§6) — new direction, needed before gateway
3. **Core API Gateway** (§3) — Phase 1, the product's reason to exist
4. **Billing services** (§4) — Phase 2, needed for paid traffic
5. **Port frontend to ASP.NET views** (§7, §8, §9, §10) — Phase 4
6. **Compression pipeline** (§5) — Phase 3
7. **Announcement system completion** (§11)
8. **Batch + concurrent + RPM** (§12, §13)
9. **Phase 5+ consumer app features** — later

---

## Changelog

- **2026-07-26** — Phase A of `plans/IMPLEMENTATION_PLAN_V1.md` (new sequenced plan doc created same day from full Frontend-DEMO + backend audit):
  - New entities `UserNextCycleOffer` (§13), `RetentionOffer`, `ErrorLabel` + migration `20260726144251_AddOffersAndErrorLabels` (verified via `dotnet ef migrations script` — still no local Docker/MySQL in this environment; run `dotnet ef database update` before next deploy, or just boot in Development: the app now auto-migrates on dev startup).
  - `AuthApiController`: `GET /api/auth/session` + JSON `POST /api/auth/logout` matching the exact shape `index.js` already fetches.
  - `DemoKeyService` (issuance + Redis daily counter `demo:{uuid}:daily` with end-of-UTC-day TTL, over-cap decrement guard), `DemoApiController` (`POST /api/demo/key`, `GET /api/demo/remaining`), `DemoKeyCleanupService` (20-day inactivity hard-delete, daily 03:00 UTC). `AccountController.TryDemo` refactored onto the service.
  - Dev-only `Database.Migrate()` on boot in `Program.cs` (non-fatal if MySQL is down, mirroring the Redis boot convention).
  - Phase B groundwork (§3 gateway steps 1–2): `ApiKeyAuthenticator` + `GatewayAuthMiddleware` (API-key & demo auth on `/v1/*`, OpenAI-shaped error bodies) + `UserRpmService` (`rpm:{user_id}`). Verified by booting the app (no MySQL/Redis available): `/api/auth/session` → `{"authenticated":false}`, unauthenticated `/v1/chat/completions` → 401 `missing_api_key`.
  - Phase B core (§3 steps 3–6): `CreditService` (reserve/reconcile/release, §7 depletion order, ledger), `GatewayRequestQueue` (in-memory priority admission — deviation noted in §3 table), `ProviderInFlightService` (`inflight:{provider_id}`), `ProviderRouter` (eligibility/weight order/LRU key pool/health transitions + 402 admin notification), `IProviderAdapter` + `OpenAiCompatibleAdapter` (SSE passthrough, usage extraction, error phrasebook), `GatewayController` (`/v1/chat/completions` stream+non-stream with heartbeats and fallback loop, `/v1/models`, `/v1/models/{id}`), request/routing log writes. Compiles clean; endpoint gating smoke-tested; **live provider round-trip still untested** (no Docker in this environment).
- **2026-07-21** — Initial checklist created. Identified stack deviation (Node/Oracle plan vs .NET/MySQL reality), provider→Channels direction change, and full gap analysis between Frontend-DEMO, backend entities, and plan.
- **2026-07-21** — Shipped schema corrections + Channels key storage (checklist §1, §6 priority items 1–2):
  - Removed stale `BoosterPack` fields (`DurationDays`, `IsPermanent`, `PermanentBaseTierId`) and `UserBoosterPack.ExpiresAt` per plan v3.1.2.
  - Added `Announcement.BannerTitle`/`IsBannerDismissible`/`PostedAt`/`LastEditedAt`, replaced `BannerExpiresAt` with `ExpiresAt`, split `UserDismissedAnnouncement` into `UserDismissedBanner` + new `UserReadAnnouncement` per plan v3.1.3.
  - Added `ProviderKey` entity + `ProviderKeyCipher` (AES-256-GCM) service; provider keys now live in the DB, encrypted, managed via the Channels admin UI — removed the now-unused `Provider.EnvKeyPrefix`.
  - Extended `ChannelsController`/views: bulk key paste + revoke, per-modality param config, per-channel error-alias overrides, and a real (not mocked) HTTP reachability probe.
  - Resolved the `SpeedPriority`/`Weight` direction conflict flagged in the initial checklist: standardized on **lower = faster/preferred** everywhere, matching the existing Channels UI copy and Frontend-DEMO, rather than the plan's "higher = faster" wording.
  - Generated migration `20260721093129_AlignProviderKeysAndAnnouncements`; verified via `dotnet build` + `dotnet ef migrations script` SQL review. **Not yet applied to a live database** — no local MySQL/Docker available in this environment, so run `dotnet ef database update` before next deploy/test session.
  - Not done in this pass: router/dispatch-time key rotation (blocked on the API Gateway, which doesn't exist yet — §3), and the full pixel-level port of `admin.js`'s dynamic Channels UI (current ASP.NET views are functionally equivalent plain forms, tracked under §7/§8).
