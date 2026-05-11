# OrchidLLM Architecture Overview

> **Version:** v3.0 — Phase 0+1 Foundation

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Vercel Static)                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │index.html│ │users.html│ │admin.html│ │login.html│       │
│  │  (chat)  │ │(dashboard)│ │ (admin) │ │  (OAuth) │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │             │            │             │              │
│       └─────────────┴────────────┴─────────────┘              │
│                         │                                     │
│                    app.js (API Proxy)                          │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  API Layer (Vercel Serverless Functions)                      │
│                                                               │
│  /api/auth/*        GitHub OAuth flow                         │
│  /api/v1/*          OpenAI-compatible API gateway             │
│  /api/admin/*       Admin CRUD (tiers, models, providers)     │
│  /api/user/*        User dashboard (profile, keys, credits)   │
│  /api/demo/*        Demo key management                       │
│  /api/cron/*        Scheduled jobs (cleanup, rollover)         │
│                                                               │
│  Shared Libraries:                                            │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐ │
│  │oracle.js│ │auth.js │ │keys.js │ │router.js│ │billing.js│ │
│  │(DB pool)│ │(OAuth) │ │(API key)│ │(routing)│ │(credits) │ │
│  └────┬────┘ └────────┘ └────────┘ └────┬────┘ └─────────┘  │
│       │                                  │                    │
│  ┌────┴────┐ ┌──────────┐ ┌─────────┐  │                    │
│  │queue.js │ │redis.js  │ │tokenizer│  │                    │
│  │(priority)│ │(RPM/rate)│ │(tiktoken)│  │                    │
│  └─────────┘ └──────────┘ └─────────┘  │                    │
│                                          │                    │
│  ┌──────────────────────────────────────┴──────────┐         │
│  │ providers.js — Upstream HTTP Facade              │         │
│  │ Forwards requests, strips upstream headers       │         │
│  └──────────────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  Data Layer                                                   │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ Oracle Cloud  │  │ Upstash Redis │                         │
│  │ ADB (Thin)    │  │ (REST)        │                         │
│  │               │  │               │                         │
│  │ • users       │  │ • RPM counters │                        │
│  │ • tiers       │  │ • Demo daily   │                        │
│  │ • models      │  │ • Rate limits  │                        │
│  │ • providers   │  │               │                         │
│  │ • credits     │  │               │                         │
│  │ • logs        │  │               │                         │
│  └──────────────┘  └──────────────┘                          │
└───────────────────────────────────────────────────────────────┘
```

## Request Lifecycle

```
User Request
    │
    ▼
┌─ Auth Check ─────────────────────────────────┐
│  API Key (sk-orch-...) or Demo Key or Session │
│  → resolveAuthContext()                       │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ RPM Check ──────────────────────────────────┐
│  Redis counter per user, 60s window           │
│  Limit from subscription_tiers.rpm_normal     │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Model Access ───────────────────────────────┐
│  Check model.access_tier ≤ user.access_tier   │
│  Check API key model_whitelist                │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Context Window Check ───────────────────────┐
│  Count input tokens (tiktoken cl100k_base)    │
│  Check context_window_tiers for plan gating   │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Credit Reservation ────────────────────────┐
│  Estimate output tokens → calculate cost     │
│  Apply token multipliers from DB             │
│  Reserve credits (or reject if insufficient)  │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Queue & Route ──────────────────────────────┐
│  Enqueue with priority (tier-based)           │
│  Select provider: active, speed_priority ASC  │
│  Check concurrent limits                      │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Provider Dispatch ──────────────────────────┐
│  Forward to upstream (OpenAI-compatible)      │
│  Stream or buffer response                    │
│  On failure: mark provider, try fallback      │
└──────────────────────────┬────────────────────┘
                           │
    ▼
┌─ Reconciliation ────────────────────────────┐
│  Calculate actual cost from usage.tokens      │
│  Release reservation delta                    │
│  Deduct from pools in depletion order         │
│  Log to request_logs + routing_logs           │
└──────────────────────────────────────────────┘
```

## Security Model

| Principle | Implementation |
|-----------|---------------|
| **Provider Obfuscation** | Provider names never exposed. Routing logs use `key_ref_hash` (SHA-256). Anonymous labels (`Endpoint A`, `Endpoint B`) on model cards. |
| **API Key Storage** | Keys stored as SHA-256 hash. Plaintext shown only once at creation. |
| **Provider Keys** | `.env` only — never in DB. Resolved at runtime via `env_key_prefix`. |
| **Session Security** | HMAC-SHA256 signed stateless cookies. 7-day expiry. Constant-time comparison. |
| **Admin Access** | Role-based (`users.role = 'admin'`). Configured via `ADMIN_GITHUB_HANDLES` env var. |
| **CORS** | Origin allowlist from env. Credentials supported for session cookies. |
| **Cron Protection** | `CRON_SECRET` header verification (required in production). |

## Database Schema

See `db/schema.sql` (v3.1) — 25+ tables covering:
- User management & auth providers
- Subscription tiers & billing
- Credit pools (standard, fast, rollover, booster)
- Model catalog & maker registry
- Provider routing & health tracking
- Request queue & priority system
- Logging (request, routing, admin SQL audit)
- Announcements & notifications
