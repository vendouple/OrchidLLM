# OrchidLLM Feature Tracker

> Phase-based implementation status

## Phase 0 — Foundation ✅

- [x] Database schema v3.1 (`db/schema.sql`)
- [x] Oracle connection pool (`lib/oracle.js`)
- [x] Auth — GitHub OAuth (`api/auth/*`, `lib/auth.js`)
- [x] Admin role middleware (`lib/middleware.js`)
- [x] Provider management CRUD (`api/admin/providers.js`)
- [x] Model registry CRUD (`api/admin/models.js`)
- [x] Model maker CRUD (`api/admin/model-makers.js`)
- [x] Model↔Provider mapping CRUD (`api/admin/model-providers.js`)
- [x] Subscription tier CRUD (`api/admin/tiers.js`)
- [x] Booster pack CRUD (`api/admin/boosters.js`)
- [x] System settings CRUD (`api/admin/settings.js`)
- [x] Announcement system CRUD (`api/admin/announcements.js`)
- [x] Admin user management (`api/admin/users.js`)
- [x] Admin platform stats (`api/admin/stats.js`)
- [x] Admin SQL query tool (`api/admin/sql.js`)
- [x] Admin notification bell (`api/admin/notifications.js`)
- [x] Admin key oversight (`api/admin/keys.js`)
- [x] Admin demo key management (`api/admin/demo-keys.js`)
- [x] Admin log viewer (`api/admin/logs.js`)
- [x] `.env`-driven base URL config

## Phase 1 — Core API Gateway ✅

- [x] Provider router with health tracking (`lib/router.js`)
- [x] Provider HTTP facade (`lib/providers.js`)
- [x] `POST /api/v1/chat/completions` (streaming + non-streaming)
- [x] Token counting with tiktoken (`lib/tokenizer.js`)
- [x] Token multiplier + credit reservation + reconciliation (`lib/billing.js`)
- [x] RPM enforcement via Redis/memory (`lib/redis.js`)
- [x] API key system — create, rotate, whitelist, limits (`api/user/keys.js`)
- [x] API key validation (`lib/keys.js`)
- [x] Demo key system — generation, cookie persistence (`api/demo/key.js`)
- [x] Demo key cleanup cron (`api/cron/cleanup-demo.js`)
- [x] `GET /api/v1/models` — auth required, plan-filtered
- [x] `GET /api/models` — public catalog (legacy)
- [x] Request queue with priority (`lib/queue.js`)
- [x] Queue worker cron (`api/cron/queue-worker.js`)
- [x] Request logs + routing logs (`lib/api-core.js`)
- [x] User profile endpoint (`api/user/profile.js`)
- [x] User credit state endpoint (`api/user/credits.js`)
- [x] User subscription info (`api/user/subscription.js`)
- [x] User request history (`api/user/logs.js`)
- [x] User announcements (`api/user/announcements.js`)
- [x] Credit rollover cron (`api/cron/rollover.js`)

## Phase 2 — Billing & Plans 🔲

- [ ] Manual plan upgrade (admin)
- [ ] Booster pack purchase flow + stacking logic
- [ ] Dummy checkout endpoints (IDR + USD)
- [ ] Billing cycle + deferred upgrade logic

## Phase 3 — Advanced Features 🔲

- [ ] Compression pipeline (sequential backend)
- [ ] Context window tier unlock + enforcement
- [ ] Batch queue
- [ ] `POST /api/images/generations` (full implementation)
- [ ] `POST /api/audio/speech` (full implementation)
- [ ] `POST /api/audio/transcriptions` (full implementation)
- [ ] Music + video generation

## Phase 4 — Frontend Polish 🔲

- [ ] Material 3 Expressive dashboard
- [ ] Dynamic tier accent colors
- [ ] Model detail sheet + lock icons
- [ ] API key management UI
- [ ] Billing / credits dashboard
- [ ] Logs viewer
- [ ] Public model catalog page

## Phase 5 — Consumer App 🔲

- [ ] Authenticated chat via auto-resolved API key
- [ ] Playground mode
- [ ] Roleplay / Characters
- [ ] Conversation history

## Phase 6 — Growth 🔲

- [ ] Real payment integration (Midtrans/Stripe)
- [ ] Affiliate / referral system
- [ ] Google OAuth

## Phase 7 — Provider Integration 🔲

- [ ] Per-provider adapter modules
- [ ] Aggregator orchestrator
- [ ] Key pool rotation
- [ ] Health monitoring with admin alerts
