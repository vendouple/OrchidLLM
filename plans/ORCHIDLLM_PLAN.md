# OrchidLLM — Comprehensive Product & Architecture Plan
>
> **Status:** Draft v3.1.3 | Last updated: 2026-05-21
> **Author:** James (Owner) + AI-assisted planning

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [API Endpoint System](#3-api-endpoint-system)
4. [Request Queue System](#4-request-queue-system)
5. [Model System](#5-model-system)
6. [Provider Routing & Aggregation](#6-provider-routing--aggregation)
7. [Billing, Credits & Plans](#7-billing-credits--plans)
8. [Compression System](#8-compression-system)
9. [Context Window & Token Multiplier System](#9-context-window--token-multiplier-system)
10. [Exhaustion System](#10-exhaustion-system)
11. [Rollover System](#11-rollover-system)
12. [Booster / Recharge Pack System](#12-booster--recharge-pack-system)
13. [Subscription Billing Cycles](#13-subscription-billing-cycles)
14. [Batch Queue System](#14-batch-queue-system)
15. [Concurrent Request System](#15-concurrent-request-system)
16. [RPM System](#16-rpm-system)
17. [API Key System](#17-api-key-system)
    - [17a. Demo Key System](#17a-demo-key-system)
18. [Request Lifecycle & Logging](#18-request-lifecycle--logging)
19. [Auth System](#19-auth-system)
    - [19a. Account Center](#19a-account-center)
20. [Frontend — Dashboard & Consumer App](#20-frontend--dashboard--consumer-app)
21. [Announcement & Changelog System](#21-announcement--changelog-system)
22. [Admin System](#22-admin-system)
23. [Affiliate / Referral System](#23-affiliate--referral-system)
24. [Database Schema Outline](#24-database-schema-outline)
25. [Environment & Configuration](#25-environment--configuration)
26. [Phased Rollout Plan](#26-phased-rollout-plan)
27. [Decision Log (Q&A Sets A–C)](#27-decision-log-qa-sets-ac)
28. [Open TODOs](#28-open-todos)

---

## 1. Project Overview

**OrchidLLM** is a multi-layered LLM aggregation platform with two primary faces:

| Face | Description |
|------|-------------|
| **API Gateway** | OpenAI-compatible REST API that routes requests to various free/cheap upstream providers, stabilising their instability via aggregation, queuing, and fallback routing. |
| **Consumer App** | A user-facing chat interface with personalities, minigames, and social features. Built on top of the same API gateway. |

### Core Philosophy

- Upstream providers are free or cheap but **unstable**. Orchid absorbs that instability.
- Users pay for **stability, priority, features, and higher limits** — not raw model access.
- **Nothing is hardcoded** that should be a DB value. Admin configures everything.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│       Browser (Dashboard / Consumer App) | External API Keys    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                     ORCHID API GATEWAY                          │
│        Auth → Rate Limit → Credit Reserve → Queue → Router      │
└──────┬──────────┬──────────┬──────────┬───────────┬────────────┘
       │          │          │          │           │
  Chat/LLM   Image Gen   TTS/Music  Transcribe  Video Gen
  Provider   Provider    Provider   Provider    Provider
   Pool       Pool        Pool       Pool        Pool
```

### Service Breakdown

| Service | Responsibility |
|---------|----------------|
| `api-gateway` | Auth, RPM enforcement, credit reservation, queue ingestion |
| `queue-worker` | Dequeues requests by priority, dispatches to router |
| `provider-router` | Selects best provider per request requirements |
| `billing-service` | Credit reservation, reconciliation, rollover, recharge |
| `compression-service` | Pre-request context compression pipeline |
| `admin-api` | Tier config, provider config, announcements, manual upgrades |
| `frontend` | Dashboard + Consumer App (Material 3 Expressive) |
| `notification-service` | Admin alerts for provider health, user nudges |

---

## 3. API Endpoint System

### Domain Configuration (`.env` driven)

```env
# Development
API_BASE_URL=http://localhost:3000/api

# Production (once domain is live)
API_BASE_URL=https://api.orchidllm.com
```

All endpoint paths are relative to `API_BASE_URL`. The gateway reads this at boot — no hardcoded URLs anywhere.

### OpenAI-Compatible Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | LLM chat, streaming supported |
| `/v1/completions` | POST | Legacy text completion |
| `/v1/images/generations` | POST | Image generation |
| `/v1/images/edits` | POST | Image editing |
| `/v1/audio/speech` | POST | TTS generation |
| `/v1/audio/transcriptions` | POST | Audio to text transcription |
| `/v1/audio/music` | POST | Music generation *(Orchid extension)* |
| `/v1/video/generations` | POST | Video generation *(Orchid extension)* |
| `/v1/models` | GET | List available models *(requires API key)* |
| `/v1/models/{model_id}` | GET | Model detail |

### Parameter Handling Rules

```
IF user is on FREE or DEMO tier:
  → Strip all unsupported parameters silently
  → Speed rating is IGNORED — free/demo routing is eligibility-only
  → Only route to providers where <PROVIDER_ENV>_FREE=true in .env
  → If no free-eligible provider is available → 503 (no credit charge)

IF user is on PAID tier + strict_params = false (default):
  → Strip unsupported params, proceed
  → Add response header: X-OrchidLLM-Param-Dropped: <param_name>
  → Route to any available provider (speed-preference applies normally)

IF user is on PAID tier + strict_params = true:
  → Only route to providers supporting ALL requested parameters
  → If no provider available → FAIL request (no credit charge)
```

`strict_params` is a paid-only account toggle. Default: `false`.

**Provider free-eligibility is set per provider in `.env` via `<PROVIDER_ENV>_FREE=true|false`.** A provider with `_FREE=false` is reserved for paid subscribers only — free/demo traffic is never routed there regardless of model availability. Speed values (`<PROVIDER_ENV>_SPEED`) are read but not used when routing free/demo users — only `_FREE` eligibility matters.

---

## 4. Request Queue System

### Priority Model

Priority is a positive integer. **Higher = processed first.**

```
Priority 10  → processed before priority 1
Priority 0   → lowest (free tier base)
Priority -1  → reserved for admin bypass (skip queue entirely)
```

All priority values are **DB-configured per tier by admin** — never hardcoded.

### Priority Sources

| Source | Contribution |
|--------|-------------|
| Tier base (standard credits) | `queue_priority_standard` configured in DB per tier |
| Fast credits active | `queue_priority_fast` configured in DB per tier |
| Booster pack active | Pack's own configured priority (overrides tier base) |

### Queue Worker Logic

```
LOOP:
  1. Pull highest-priority pending request from queue (Redis sorted set)
  2. Check provider availability for that model/params
  3. If provider available     → dispatch → mark in-flight
  4. If provider rate-limited  → flag provider, try next
  5. If no provider available  → re-queue with short backoff
  6. On success                → reconcile credits
  7. On failure                → release all reserved credits, log failure
```

### Connection Behaviour While Queued

- **Streaming requests:** SSE connection stays open. Client receives a heartbeat event while waiting in queue. Tokens begin streaming once the provider responds.
- **Non-streaming requests:** Long-poll. Connection held open until response or timeout.
- **Timeout thresholds:** Configurable per request type (e.g. video = longer, chat = shorter).

---

## 5. Model System

### Access Tiers

| Tier Label | Description |
|------------|-------------|
| `demo` | Available to unauthenticated/demo-key users only — subset of free models, 33k context cap |
| `free` | Available to all registered users |
| `standard` | Requires any paid subscription or qualifying booster pack |
| `premium` | Requires mid-tier subscription |
| `premium+` | Requires higher subscription |
| `max` | Requires top subscription |
| `elite` | Requires highest subscription or explicit grant |
| `admin` | Internal/testing models, admin only |

### Model Record (DB)

```
models
├── id
├── display_name              e.g. "Claude Opus 4.5"
├── model_slug                e.g. "claude-opus-4-5"
├── model_maker_id            FK → model_makers (e.g. Anthropic, OpenAI, Google)
├── access_tier               enum: demo|free|standard|premium|premium+|max|elite|admin
├── context_window_tiers      JSON: [{ tokens: 33000, required_plan: "basic" }, ...]
├── modality                  enum: text|image|audio|video|music|multimodal
├── is_active                 bool
├── deprecation_date          date | null  (soft-disabled on frontend once reached)
├── supports_streaming        bool
├── supports_vision           bool
├── supports_reasoning        bool
├── supports_search           bool
├── supports_caching          bool
├── supports_function_calling bool
├── max_output_tokens         int
├── public_description        text
└── providers                 → relation to model_providers
```

### Model Provider Record (DB)

```
model_providers
├── id
├── model_id                  FK → models
├── provider_id               FK → providers
├── speed_priority            int
│   Provider speed rating. Higher number = faster provider.
│   Admin tooltip: "Higher = faster. Free users can be routed to lower-speed providers; paid/fast-credit users are prioritised to higher-speed providers."
├── context_limit             int (provider-specific cap for this model)
├── supports_params           JSON { reasoning: true, search: false, ... }
├── max_concurrent            int (hard cap this provider allows)
├── current_in_flight         int (live counter, tracked in Redis)
├── status                    enum: active|rate_limited|out_of_credits|dead
├── rate_limit_until          timestamp | null
├── last_checked              timestamp
└── notes                     text (admin notes, e.g. "needs top-up")
```

### Provider Health Tracking

```
IF request to provider fails:
  → 429 / rate limit  → status = rate_limited, rate_limit_until = now + backoff
  → 402 / billing     → status = out_of_credits, alert admin immediately
  → 5xx / timeout     → increment fail_count; if > threshold → status = dead

IF status = out_of_credits for > 1 day:
  → Send admin notification (not triggered for temporary rate limits)

CRON every N minutes:
  → Re-probe rate_limited providers; if alive → restore status = active
```

### Public Model Catalog

- Public **marketing page** shows model list — no login required, no API call.
- `/v1/models` API endpoint requires a valid API key — returns only models accessible to that user's plan.
- Both sourced from the same `models` table. UI conditionally renders based on auth state.

| State | View |
|-------|------|
| Not signed in (web) | Basic model info, no config, no lock icons |
| Signed in (free) | Lock icons on premium models, context toggles visible but locked |
| Signed in (paid) | Unlock toggles active, compression config, full multiplier detail |

---

## 6. Provider Routing & Aggregation

### Provider Key Storage

**All provider API keys are stored exclusively in `.env`. No provider keys are stored in the database.**

Multiple keys per provider are supported for rotation and throughput. Naming convention:

```env
OPENAI_KEY_1=sk-...
OPENAI_KEY_2=sk-...
ANTHROPIC_KEY_1=sk-ant-...
# etc.
```

The router treats these as a pool. On each request it picks the least-recently-used healthy key. If a key is rate-limited it is flagged temporarily and skipped; the next key in the pool is tried. This allows parallel throughput across multiple API keys for the same provider.

### Provider Speed Configuration (`.env` driven)

Each upstream provider has a provider-specific speed value in `.env`. The value is numeric and **higher = faster**. This is separate from queue priority: queue priority decides which user request is processed first, while provider speed decides which healthy upstream provider should be attempted first for that request.

Naming convention:

```env
# Provider API key
OPENROUTER_API_KEY=

# Provider speed rating; higher = faster
OPENROUTER_API_KEY_SPEED=80
```

If both DB and `.env` values exist, `.env` is the deploy-time override used by the router. Admin/database values remain useful as defaults and for UI display.

Routing behaviour:

- Paid users prefer the highest-speed eligible provider first (speed DESC).
- Free/demo users are routed only to providers where `<PROVIDER_ENV>_FREE=true`. Speed is irrelevant and ignored for free/demo — the first free-eligible available provider wins.
- Providers must still pass health, context-limit, capability, rate-limit, and concurrency checks before speed is considered (paid) or free-eligibility is checked (free/demo).

### Routing Decision Tree (per request)

```
1. Filter models matching requested model_slug
2. Filter model_providers by:
   a. status = active
   b. context_limit >= message_token_count
   c. IF user is FREE or DEMO:
        → Only include providers where <PROVIDER_ENV>_FREE=true
        → Skip steps 3–4 speed logic entirely (speed is irrelevant for free/demo)
      IF user is PAID + strict_params = true:
        → Only include providers supporting ALL requested params
      IF user is PAID + strict_params = false:
        → Include any provider; unsupported params are stripped
3. Resolve provider speed (PAID users only):
   a. <PROVIDER_ENV>_SPEED from .env if present
   b. otherwise model_providers.speed_priority DB fallback
4. Sort eligible providers (PAID users only):
   → Speed DESC (highest/fastest first)
   (Free/demo: no sort — first free-eligible available provider wins)
5. Pick first provider where current_in_flight < max_concurrent
6. Increment current_in_flight
7. Dispatch request
8. On completion → decrement current_in_flight
```

### Traffic-Aware Routing

The aggregator continuously monitors platform traffic load and adjusts routing behaviour to protect the experience of paying users during peaks.

**Traffic state** is tracked in Redis as a rolling metric (e.g. requests/minute over the last 5 minutes):

| Traffic State | Definition | Behaviour |
|--------------|-----------|-----------|
| `low` | Below normal baseline | All users routed normally; no restrictions tightened |
| `normal` | Typical operating load | Standard routing rules apply |
| `high` | Sustained elevated load | Free/demo users throttled toward slower providers and longer queue wait; paid users unaffected |
| `peak` | Near-capacity | Free/demo users may be softly deprioritised further; batch jobs deferred until load drops; paying users still receive fastest eligible provider |

> The aggregator never hard-blocks free/demo users during high traffic — it only adjusts their provider speed preference and queue position. Paid users should not notice high-traffic periods.

**Traffic state is not exposed to users.** It is logged internally and visible to admin in the provider health dashboard.

### Booster Package vs Subscription — Queue Priority

When both a subscription tier and a booster package are active on the same account, the following priority rules apply:

```
Subscription queue priority always takes precedence over booster queue priority.

Example:
  User has: Plus subscription (queue_priority = 70) + Booster pack (queue_priority = 85)
  Effective queue priority = max(subscription, booster) = 85
  BUT:
  If the subscription tier grants fast credits, those are consumed first before booster fast credits.
  Booster fast credits are a reserve — consumed only once subscription allocation is exhausted.
```

Priority ordering (high → low):

1. Subscription users (higher tier = higher priority)
2. Booster-only users (no subscription, active booster pack)
3. Free registered users
4. Demo key users

> During high traffic, booster users get faster access than free users but the queue still serves subscription users ahead of booster-only users. This ensures subscription value is protected.

Routing is driven by `model_providers.context_limit` — no hardcoded token thresholds in code.

```
message_tokens < 33k    → prefer fast low-cost providers
message_tokens < 200k   → mid-tier providers
message_tokens >= 200k  → high-context providers only
```

### Failure & Fallback

```
IF provider fails mid-request:
  → Retry with next candidate in sorted list
  → Mark failed provider appropriately (rate_limited / dead)
  → Log to routing_logs

IF all providers fail:
  → Return error to user
  → Release all reserved credits (no charge)
```

> **Critical rule: If any request fails for any reason, zero credits are charged.**

### Provider Obfuscation Policy

**Providers are never exposed to users — anywhere.** This is a hard platform rule, not a per-feature toggle.

| Surface | Rule |
|---------|------|
| API responses | No provider name, base URL, or identifying info in any response body or header |
| Request logs (user-visible) | Shows: model name, model maker (via `model_makers` table), endpoint, status, credits charged. **Never shows: provider, key, routing path.** |
| Routing logs | Full detail stored server-side for admin/debugging. **Admin-only. Never surfaced to users.** Key references are obfuscated (see below). |
| Model cards | Providers listed as `Endpoint A`, `Endpoint B`, etc. (see §20 Model Catalog Maker). No real provider names. |
| Error messages | Translated/normalised by each provider adapter before reaching the user. See error translation rules below. |
| HTTP headers | All upstream provider headers stripped before responding to client. No `x-provider-*` or origin headers forwarded. |

**Error Translation Rules:**

Provider-specific error codes are translated by each adapter into one of two categories:

| Category | Behaviour | Examples |
|----------|-----------|---------|
| **User-actionable** | Upstreamed with a translated, provider-neutral message | Context length exceeded, tool calling not supported on this model, image input not supported, invalid request format, content policy rejection |
| **Internal / infrastructure** | Generic message only — no provider detail leaked | Rate limit hit, provider overloaded, auth failure, provider down, unknown error |

```
Examples of translated user-actionable messages:
  provider: "anthropic: context_length_exceeded" → user sees: "Request exceeds the maximum context length for this model."
  provider: "openai: tool_use_not_supported"     → user sees: "Tool calling is not supported by the selected model configuration."
  provider: "google: image_not_supported"        → user sees: "Image input is not supported by the selected model configuration."

Examples of suppressed internal messages:
  provider: "rate_limited: too many requests"    → user sees: "Service temporarily unavailable. Please retry."
  provider: "anthropic: overloaded_error"        → user sees: "Service temporarily unavailable. Please retry."
```

Adapters are responsible for classifying and translating their own error codes. The aggregator enforces that no raw provider error text passes through unprocessed.

**What users CAN filter/see:**

- The model name (e.g. `claude-opus-4-5`)
- The model maker / lab via `model_makers` table (e.g. `Anthropic`, `OpenAI`, `Google`) — shown with icon and name
- Their own usage history (model, status, credits, timestamp)

**Model maker vs Provider:** A *provider* is who hosts/serves the model (e.g. OpenRouter, Together AI, the lab directly). The *model maker* is who created the model (stored in `model_makers` table). Only the maker is visible to users.

### Currency Support

| Currency | Notes |
|----------|-------|
| IDR | Lower prices, Indonesian users |
| USD | Global pricing, higher rates |

Billing is currently **dummy endpoints**. Admin manually upgrades plans. Real payment integration is a future phase (Midtrans for IDR, Stripe for USD).

### Credit Types

| Type | Description | Queue Contribution |
|------|-------------|-------------------|
| `standard` | Base subscription credits | `queue_priority_standard` |
| `fast` | Premium credits (sub or booster) | `queue_priority_fast` |
| `rollover` | Converted from leftover standard credits | Same as standard |

### Credit Pool Depletion Order

```
1. Booster pack fast credits     (highest priority, consumed first)
2. Booster pack standard credits
3. Rollover credits
4. Subscription fast credits
5. Subscription standard credits
```

Within booster packs: pack with the highest fast priority is consumed first.

### Credit Reservation Flow

```
REQUEST RECEIVED
  → Estimate token cost
  → IF balance < estimate → reject before queuing (no charge)
  → Reserve estimated credits into credits_reserved
  → Dispatch to provider
  → On success  → reconcile actual cost, release remainder
  → On failure  → release all reserved credits (no charge)
```

### Tier Configuration (DB — not hardcoded)

```
subscription_tiers
├── id
├── name                          e.g. "Basic", "Plus"
├── display_color_token           e.g. "tier-basic" (maps to M3 color scheme in frontend)
├── price_idr_monthly
├── price_usd_monthly
├── price_idr_yearly
├── price_usd_yearly
├── credits_standard_monthly
├── credits_fast_monthly
├── queue_priority_standard       int
├── queue_priority_fast           int
├── queue_priority_exhausted      int
├── rpm_normal                    int
├── rpm_exhausted                 int
├── max_concurrent_requests       int (-1 = infinite)
├── max_concurrent_exhausted      int
├── batch_queue_slots             int (0 = no access)
├── max_api_keys                  int
├── supports_rollover             bool
├── rollover_max_cap              int (credits)
├── rollover_percentage           float (0.0–1.0)
├── supports_compression          bool
├── strict_params_option          bool (can this tier enable strict_params)
├── model_access_tier             enum: free|standard|premium|...
├── context_window_unlock_tiers   JSON array of unlockable tiers
├── supports_yearly_billing       bool
├── supports_monthly_billing      bool
├── exhaustion_model_access       enum: free_only|standard|locked
├── exhaustion_context_lock       enum: lock_to_base|retain|custom
├── exhaustion_batch_access       bool
└── is_active                     bool
```

### Proposed Tier Table *(pricing TBD — fill in later)*

| Feature | Free | Basic | Plus | Pro | Elite |
|---------|------|-------|------|-----|-------|
| Price IDR/mo | 0 | TBD | TBD | TBD | TBD |
| Price USD/mo | 0 | TBD | TBD | TBD | TBD |
| Standard Credits/mo | TBD | TBD | TBD | TBD | TBD |
| Fast Credits/mo | 0 | TBD | TBD | TBD | TBD |
| Std Queue Priority | 0 | TBD | TBD | TBD | TBD |
| Fast Queue Priority | — | TBD | TBD | TBD | TBD |
| Exhausted Priority | Locked | TBD | TBD | TBD | TBD |
| RPM (active) | 3 | 5 | TBD | TBD | TBD |
| RPM (exhausted) | Locked | 3 | TBD | TBD | TBD |
| Concurrent Requests | 1 | 1 | TBD | TBD | TBD |
| Batch Slots | 0 | 2 | 4 | TBD | TBD |
| API Key Limit | 3 | 5 | TBD | TBD | TBD |
| Rollover | ❌ | TBD | TBD | TBD | TBD |
| Compression | ❌ | ✅ | ✅ | ✅ | ✅ |
| Accent Color | Gray | TBD | TBD | TBD | TBD |

> **TODO (James):** Fill in pricing and priority numbers above.

---

## 8. Compression System

> ⚠️ **Placement rule:** All compression and context window configuration is **per model card only**. It is **not** a global setting and must not appear in the Settings section of the dashboard. Each model has independent config — what a user sets on Claude Opus 4.5 has zero effect on GPT-4o. Any agent or developer working on this UI must enforce this: the Settings page contains only account-level toggles (`strict_params`, general preferences). Compression lives on the model card, period.

### Overview

Compression is a **backend-sequential pipeline** that reduces context size before sending to the primary model. Unlocked at Basic tier by default (configurable per tier via `supports_compression`).

### Context Tier Structure

Context tiers are sequential and must be **unlocked in order**. A user cannot enable the 200k tier without the 33k tier already enabled — the 33k–199k range would be unhandled otherwise.

```
Example for Claude Opus 4.5:
  Tier 0:  0–32,999 tokens        → always active, no unlock needed
  Tier 1:  33,000–199,999 tokens  → requires plan unlock; compression configurable
  Tier 2:  200,000–999,999 tokens → requires higher plan unlock; compression configurable
  Tier 3:  1,000,000+ tokens      → requires top plan; compression configurable
```

### Plan-Gated Context Thresholds

Each context tier in `models.context_window_tiers` has a `required_plan` field.

```
ON REQUEST:
  → Count context tokens
  → Identify which context tier the token count falls into
  → Check: user's current plan >= required_plan for that tier

  IF plan insufficient:
    → Return error (no credit charge)
    → Message: "Context limit exceeded. Upgrade to unlock this range."
```

**Auto-lock on downgrade:** If a user had a tier enabled (e.g. 1M on Plus) and downgrades to Basic before the next billing cycle, the system automatically disables that toggle at billing cycle start. Any request hitting that range errors cleanly with no credit charge.

```
ON BILLING CYCLE START:
  → Re-evaluate user's active plan
  → For each user_compression_settings / user_context_tier_preferences entry:
      IF tier.required_plan > user.current_plan:
        → Disable that tier toggle
```

### Per-Tier, Per-Model Compression Configuration

Users configure compression **independently per model, per context tier**. Each tier can use a **different compression model** with its own system prompt:

```
user_compression_settings
├── user_id
├── model_id                 (primary model, e.g. claude-opus-4-5)
├── tier_index               (1, 2, 3 — matches context tier)
├── enabled                  bool
├── compression_model_id     FK → models (cheaper model used to summarise)
│
│   Each tier can use a DIFFERENT compression model. Example:
│     Tier 1 (33k)   → claude-haiku-4-5
│     Tier 2 (200k)  → gpt-4o-mini
│     Tier 3 (1M)    → deepseek-v3
│
├── system_prompt_append     text | null
│   User appends to admin base prompt. Cannot delete admin base lines.
└── base_prompt_locked       text (admin-set, read-only to user)
```

This configuration lives on the **individual model card** inside the Models section of the dashboard. Each model card expands to show compression config per context tier — compression model dropdown + prompt editor per tier. **This is not accessible from Settings. It does not exist globally.**

### Admin Base Compression Prompt

Admin sets a global base prompt (e.g. *"You are an expert conversation summarizer."*). Users can **append** to it but **cannot remove** the admin base lines. Stored as `admin_base_prompt` + `user_prompt_suffix`.

### Compression Execution Flow

```
REQUEST ARRIVES
  → Count tokens in full conversation history
  → Identify context tier
  → Verify plan unlocks this tier (else error, no charge)

  IF compression enabled for this tier:
    1. Send FULL context to compression_model
       Charge: compression_model_tokens × compression_model_multipliers
    2. Wait for summary (TTFT delayed — spinner shown client-side)
    3. Replace full history with summary
    4. Send compressed context to primary model
       Charge: primary_model_tokens × primary_model_multipliers

Total charge = compression cost + primary model cost
```

> **TTFT behaviour:** Stream shows nothing until compression completes. Frontend shows a spinner. Once the primary model starts streaming, tokens flow normally.

### Behaviour Options Per Context Tier (per user, per model)

```
user_context_tier_preferences
├── user_id
├── model_id
├── tier_index
└── behaviour    enum: allow | compress | error
    allow    → pay full cost at this tier's multiplier, proceed
    compress → trigger compression pipeline
    error    → reject request before sending (no credit charge)
```

---

## 9. Context Window & Token Multiplier System

### Multiplier Table (DB, per model per context tier)

```
model_token_multipliers
├── id
├── model_id
├── context_tier_min          int  (e.g. 0, 33000, 200000, 1000000)
├── context_tier_max          int | null  (null = no upper bound)
├── multiplier_input          float  (e.g. 0.8)
├── multiplier_output         float  (e.g. 1.5)
├── multiplier_cache_read     float  (e.g. 0.2)
├── multiplier_cache_write    float  (e.g. 0.8)
└── notes                     text
```

### Credit Calculation

```
final_cost =
  (input_tokens      × multiplier_input)       +
  (output_tokens     × multiplier_output)      +
  (cache_read_tok    × multiplier_cache_read)  +
  (cache_write_tok   × multiplier_cache_write)

Units: credits per token (base rate set per model in DB)
```

---

## 10. Exhaustion System

### Trigger

Credits are "exhausted" when **all** credit pools (subscription standard + fast + rollover + all booster packs) reach 0.

### Exhaustion Behaviour (fully DB-configurable per tier)

```
Per subscription_tiers row:
├── queue_priority_exhausted       int
├── rpm_exhausted                  int
├── exhaustion_model_access        enum: free_only | standard | locked
├── exhaustion_context_lock        enum: lock_to_base | retain | custom
├── exhaustion_batch_access        bool
├── exhaustion_concurrent_requests int
└── exhaustion_message             text (shown in user dashboard)
```

### Example Configured Behaviour

| Tier | Normal Queue | Exhausted Queue | Normal Models | Exhausted Models | Normal Context | Exhausted Context |
|------|-------------|-----------------|---------------|-----------------|----------------|-------------------|
| Free | 0 | Locked | free | Locked | 33k | Locked |
| Basic | 1 | 0 | standard | free only | 200k | 33k |
| Plus | 3 | 1 | premium | standard | 1M | 200k |

> **Example values only.** Admin sets all of this per tier in the DB.

---

## 11. Rollover System

### Rules

```
ON BILLING CYCLE END:
  1. Calculate remaining subscription_standard credits (booster pack credits excluded)
  2. IF tier.supports_rollover = true:
       rollover_amount = min(
         remaining × rollover_percentage,
         rollover_max_cap - credits_rollover_current
       )
       → Add rollover_amount to credits_rollover (same priority as standard)
       → Discard remainder silently
       → IF any credits discarded → nudge user in dashboard:
           "Some credits expired. Spend before month end to avoid losing them."
  3. IF credits_rollover_current >= rollover_max_cap → 0 new rollover added
```

### Rollover Invalidation

```
Rollover IS ZEROED if:
  - User upgrades plan (even deferred to next cycle)
  - User downgrades plan
  - User cancels / discontinues subscription
  - User changes billing cycle

Rollover IS KEPT if:
  - Plan renews normally on same tier and same billing cycle
```

### Properties

- Same queue priority as standard credits.
- Shown separately in dashboard for transparency (not merged into standard display).
- Free tier: `supports_rollover = false`.

---

## 12. Booster / Recharge Pack System

> ⚠️ **Key distinction — Store Offer vs Pack Credits:**
>
> - `available_from` / `available_until` = the window during which the pack is **visible and purchasable** in the store. This is the store offer expiring, NOT the credits.
> - Booster pack credits **do not expire after purchase**. Once bought, credits persist in the user's wallet until fully consumed or until the account is deleted.
> - Badges like `[⏳ 24 HOURS LEFT]` refer to how long the **deal remains purchasable**, not how long the credits last.
> - There is no "permanent" toggle and no credit countdown timer on purchased packs.

### Pack Record (DB)

```
booster_packs
├── id
├── name
├── description
├── eligible_tiers            JSON array of tier IDs (empty = all tiers)
├── price_idr
├── price_usd
├── credits_standard
├── credits_fast
├── queue_priority_standard   int
├── queue_priority_fast       int
├── model_access_tier         enum
├── context_unlock_tiers      JSON (same structure as tier context unlocks)
├── ignore_plan_lock          bool
│   true  = pack credits survive any plan change (used for Free-tier promo packs)
│   false = pack is invalidated if user drops below the tier it was purchased on
├── max_purchases_per_user    int (-1 = unlimited)
├── max_total_purchases       int (-1 = unlimited)
├── available_from            timestamp | null   ← store offer window open (not credit expiry)
├── available_until           timestamp | null   ← store offer window close (not credit expiry)
└── is_active                 bool
```

> `available_until` controls when the **store stops showing the pack**. Credits purchased before that date do not expire — they remain in the user's wallet until spent.

### Pack Stacking

```
Multiple active packs → SEPARATE credit pools

Depletion order:
  1. Pack with highest queue_priority_fast (fast credits, highest first)
  2. Next pack's fast credits
  3. Pack standard credits (highest priority first)
  4. Rollover credits
  5. Subscription fast credits
  6. Subscription standard credits
```

### Pack Invalidation on Plan Change

Booster pack credits are **never wiped on plan upgrade**. On downgrade, only packs with `ignore_plan_lock = false` are invalidated:

```
ignore_plan_lock = false (default):
  Pack VALID while: user_plan >= tier pack was purchased on
  Pack INVALID when: user drops below that tier
  Pack RESTORED if: user returns to that tier or above

  Example:
    UPGRADE:   Basic → Plus    → pack still valid
    DOWNGRADE: Plus  → Basic   → pack still valid (same tier as purchase)
    DOWNGRADE: Basic → Free    → pack INVALIDATED
    LATER:     Free  → Basic   → pack RESTORED

ignore_plan_lock = true (Free-tier promo packs):
  Pack VALID regardless of any plan change
  Used for: Welcome Packs, Free-tier boosters, promotional packs
```

### Credit Survival on Plan Change

Booster pack credits persist until fully consumed. They do not expire on a timer after purchase — only plan-lock invalidation (above) can remove them before they are spent.

### Checkout Flow

Cart/checkout style (not one-click):

- User browses packs filtered to their current tier.
- Reviews: credit breakdown, queue priority, model access grant.
- Referral/affiliate code field on checkout page.
- Confirms payment in IDR or USD.

### Split-Fuel Booster Packs

A single Booster Pack purchase can provision **multiple separate credit wallets** in one transaction — a "Split-Fuel" bundle. This lets one pack grant different credit types with different priorities and model access levels.

**Example — "The Power User Bundle" (Rp 50,000):**

| Wallet | Credits | Queue Priority | Model Access |
|--------|---------|---------------|-------------|
| Wallet A (Fast) | 10,000 | 6 | Premium+ (e.g. Opus) |
| Wallet B (Standard) | 40,000 | 2 | Standard (e.g. Haiku) |

**Burn logic:** The system routes to the correct wallet based on the model requested. Requesting Opus burns Wallet A; requesting Haiku burns Wallet B. If Wallet A is exhausted, Opus requests fall back to standard wallet credit at standard priority.

**DB extension:** Each `booster_packs` row can have multiple `booster_pack_wallets` child rows, each with their own `credits_amount`, `queue_priority`, and `model_access_tier`. A single-wallet pack is just one child row (existing behaviour unchanged).

```
booster_pack_wallets
├── id
├── pack_id              FK → booster_packs
├── label                e.g. "Fast", "Standard", "Bulk"
├── credits_amount       int
├── queue_priority       int
├── model_access_tier    enum
└── context_unlock_tiers JSON | null
```

### Free Tier Booster Exception

Booster packs **explicitly labelled for the Free tier** (`eligible_tiers` includes free, `ignore_plan_lock = true`) do **not** lock or invalidate on any plan change — because there is no tier below Free to downgrade to.

```
Free Tier booster lifecycle:
  User buys "Weekend Pass" (20k premium credits) → remains Free tier
  Those credits are consumed normally — no expiry timer after purchase
  Once exhausted → seamlessly reverts to standard Free limits
  If user upgrades to Basic → booster credits port over
  If Paid user cancels entirely → any Paid-Tier boosters with ignore_plan_lock=false are wiped
```

### Personalization & Targeting Engine

The dashboard shows Booster Packs and Subscription deals **only to users who meet backend-configured conditions**. This is the automated targeting engine — rules are fully configurable by admin per pack/deal.

#### A. Activity & Usage Targeting

| Segment | Condition | Strategy |
|---------|-----------|---------|
| Highly Active | API request within past `[X]` hours/days (configurable) | Offer bulk Standard credits — they're burning fast |
| Inactive / Churn Risk | No request in 14+ days (configurable) | Offer a discounted Premium fast-lane pack to re-engage |

#### B. Loyalty & Tenure Targeting

| Segment | Condition | Strategy |
|---------|-----------|---------|
| Long-Term | Continuous active subscription for `[X]` consecutive months | Exclusive discounted packs or a one-time free credit drop |
| Upgrade Incentive | On Basic for 3+ months | Heavily discounted upgrade offer to Plus for next billing cycle |
| New Subscriber | First-time buyer | "Welcome Pack" visible in store for 14 days only — after that the store offer disappears (`available_until`). Credits purchased before cutoff do not expire. |

#### C. Churn Prevention — Cancellation Flow

When a user clicks **"Cancel Subscription"**, do **not** immediately cancel. Trigger a dynamic save offer based on their tier:

```
CANCELLATION CLICK →
  Show save modal:
    Option A: "Stay on [Tier] and get 30% off your next billing cycle"
    Option B: "Get an instant 50,000 extra credits if you keep your subscription active today"
  IF accepted → apply offer, cancel cancellation
  IF declined → proceed with cancellation at end of billing cycle
```

Offer content and amounts are admin-configurable per tier.

#### D. Subscription Billing Cycle Promos

| Rule | Detail |
|------|--------|
| Duration discounts | Admin sets percentage discount for Quarterly / Annual commit (e.g. 10% off Quarterly, 20% off Annual) |
| Credit refill cadence | Even on Annual billing, credit refills and rollover calculations execute **monthly** — prevents burning a year of compute in one day |
| Tier restrictions | Higher-tier plans can be restricted to Monthly-only (protects platform from long-term compute cost risk). Configurable per tier. |
| Promo expiry | Discounts can have an `expires_at` date after which standard pricing resumes — same DB field as booster pack `available_until` |

#### E. Financial Targeting

Financial targeting can be based on **lifetime spend**, **spend within a specific timeframe**, or **purchase frequency** — all configurable by admin.

| Condition | Strategy |
|-----------|---------|
| Lifetime spend > `[threshold]` (e.g. Rp 500,000) | Show exclusive "Elite Bulk Pack" to high-value users |
| Lifetime spend < `[threshold]` (e.g. new / rare purchaser) | Show entry-level enticement pack to convert them |
| Spend in timeframe > `[amount]` (e.g. spent > Rp 100,000 in the past month) | Reward active spenders with a loyalty pack |
| Spend in timeframe < `[amount]` (e.g. < Rp 10,000 since Jan 2026) | Re-engage low-spend users with a discounted starter pack |
| Total purchases < `[count]` | First-purchase or rarely-purchase user — show a low-risk intro pack |

**Timeframe targeting:** The rule engine supports a `timeframe_start` and `timeframe_end` on any financial rule. This allows offers scoped to a calendar window (e.g. "spent anything in 2026", "purchased in the past 30 days", "active since the start of Ramadan promo"). Both absolute dates and rolling windows (e.g. last `[N]` days) are supported.

All thresholds are admin-configurable. Multiple conditions can be stacked (AND/OR logic groups, configurable per offer).

**Targeting config DB:**

```
booster_pack_targeting_rules
├── pack_id              FK → booster_packs
├── rule_type            enum: activity | tenure | churn_risk | financial | new_subscriber
├── operator             enum: gt | lt | gte | lte | eq | between
├── value_a              int | float          (primary threshold)
├── value_b              int | float | null   (upper bound for "between")
├── unit                 enum: days | months | idr | usd | requests | purchases
├── timeframe_type       enum: lifetime | rolling | fixed | null
│   lifetime  = entire account history
│   rolling   = last N days/months (value_a = N, unit = days/months)
│   fixed     = between timeframe_start and timeframe_end
│   null      = not a time-scoped rule
├── timeframe_start      date | null   (used when timeframe_type = fixed)
├── timeframe_end        date | null   (used when timeframe_type = fixed)
└── logic_group          int  (rules with same group = AND; different groups = OR)
```

### Storefront UI Metadata

Each Booster Pack stores visual metadata for the dashboard store card:

```
booster_packs (UI fields)
├── badge_text           string | null   e.g. "🔥 HOT", "👋 WELCOME", "⏳ 24 HOURS LEFT"
│   Note: "⏳ 24 HOURS LEFT" refers to available_until (store offer closing), NOT credit expiry
├── gradient_start       hex string | null   e.g. "#7C3AED"
├── gradient_end         hex string | null   e.g. "#3B82F6"
├── is_featured          bool   (pinned to top of store)
└── display_order        int    (sort order within category)
```

Cards with `gradient_start` / `gradient_end` render a gradient background; cards without fall back to the standard M3E surface colour. Badge text is overlaid as a chip on the card corner.

---

## 13. Subscription Billing Cycles

### Cycle Options

| Cycle | Notes |
|-------|-------|
| Monthly | Standard |
| Yearly | Discount configurable; credit refill still monthly |
| Lifetime | Optional per tier |

```
subscription_tier_billing_options
├── tier_id              FK → subscription_tiers
├── cycle                enum: monthly | yearly | lifetime
├── is_available         bool
├── discount_percentage  float
└── discount_expires_at  timestamp | null
```

Some tiers can have certain billing cycles **disabled** — e.g. Elite may be monthly-only. Configurable per tier via `supports_yearly_billing`, `supports_monthly_billing`.

### One-Time Next-Cycle Discounts

The system supports **single next-billing-cycle offers** — a discount, a credit bonus, or both, applied exactly once to the user's upcoming billing cycle. These are issued as rewards, upgrade incentives, loyalty gestures, or churn-prevention offers.

**Examples:**

- "Thanks for upgrading — get 20% off your next billing cycle."
- "Welcome back — here's 50,000 bonus credits on your next cycle."
- "Stay subscribed and get 20% off + 30,000 credits on your next cycle."

**Hard system constraint — no multi-cycle offers:**

> The system **does not support** discounts or bonuses that extend across multiple billing cycles (e.g. "20% off for the next 3 months", "discounted for a year"). This is intentional to prevent compounding calculation errors across cycle boundaries. An offer applies to **one upcoming billing cycle only**, then expires. Admin cannot configure a multi-cycle span — the field does not exist.

**DB:**

```
user_next_cycle_offers
├── id
├── user_id               FK → users
├── offer_type            enum: discount | credit_bonus | both
├── discount_percentage   float | null      (e.g. 0.20 = 20% off)
├── bonus_credits         int | null        (added to next cycle's credit grant)
├── bonus_credit_type     enum: standard | fast | null
├── message               string            (shown in dashboard banner/modal, e.g. "Thanks for being a loyal subscriber!")
├── applies_to_cycle      date              (the specific billing cycle start date this applies to)
├── is_used               bool              (flipped to true once cycle processes)
├── created_at            timestamp
└── created_by            FK → users (admin) | null (system-generated)
```

- Only **one active offer** per user at a time. If a new offer is issued while one is pending, it replaces the old one (admin warned before confirming).
- Offers created by the targeting engine (churn prevention, loyalty rewards) are system-generated (`created_by = null`).
- Offers created manually by admin have `created_by = admin_user_id`.
- Once `is_used = true`, the record is kept for audit but has no further effect.

```
USER REQUESTS UPGRADE:
  → Show modal:
    "Upgrade takes effect on your next billing cycle [DATE].
     Upgrade now? Your current credits and rollover will be invalidated."

  IF user confirms IMMEDIATE:
    → Invalidate current cycle credits and rollover
    → Apply new tier NOW
    → New billing cycle starts today

  IF user DEFERS:
    → Set pending_tier_id on user_subscriptions
    → Current tier and credits remain until cycle end
```

---

## 14. Batch Queue System

### Overview

Batch requests are **low-priority, deferred requests** — dispatched during provider low-traffic windows. Discount: **50% off final credit cost** (after all token multipliers applied, configurable).

> **Status:** DB schema and queue logic are scaffolded. Actual provider batch API calls are **not yet implemented** — stubs only.

### Batch Record (DB)

```
batch_requests
├── id
├── user_id
├── api_key_id
├── model_id
├── provider_batch_job_id     (upstream provider's batch job ID)
├── payload                   JSON
├── status                    enum: pending|submitted|polling|completed|failed
├── queue_priority            int (same logic as main queue)
├── discount_rate             float (default 0.5, applied to final credit cost)
├── reserved_credits          int
├── actual_credits_charged    int | null
├── created_at
├── submitted_at              timestamp | null
├── completed_at              timestamp | null
└── response_payload          JSON | null
```

### Concurrent Batch Slots Per Tier

| Tier | Batch Slots |
|------|------------|
| Free | 0 (no access) |
| Basic | 2 |
| Plus | 4 |
| Higher | configurable |

### Processing Flow

```
1. User submits batch request → insert into batch_requests, reserve credits
2. System accumulates requests up to provider's batch limit
3. Submit batch job to provider
4. Poll provider for completion (cron or webhook)
5. On completion → reconcile at 50% of final calculated cost
6. Deliver result (webhook or polling endpoint)
```

### Exhaustion Rule

```
IF credits exhausted AND lower tier:
  → Batch access suspended until credits restored
Higher tiers: configurable — may retain reduced batch slots
```

---

## 15. Concurrent Request System

### Definition

Concurrent requests = number of simultaneous in-flight requests a user can have at once. Primarily for agentic / multi-agent workflows.

### Configuration (per tier in DB)

```
max_concurrent_requests     int  (-1 = infinite)
max_concurrent_exhausted    int
```

### Billing

Each provider call in a multi-model agentic workflow = **separate billable event**. Simpler to implement; each call appears individually in the user's activity log.

---

## 16. RPM System

### Enforcement: Per User (all API keys combined)

```
Redis counter: key = "rpm:{user_id}", TTL = 60s
On each request:
  → Increment counter
  → IF counter > rpm_limit → 429 response (no credit charge)
```

### Redis Key Reference

| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `rpm:{user_id}` | 60s | RPM counter per user |
| `demo:{uuid}:daily` | End of UTC day | Demo key daily request counter |
| `inflight:{provider_id}` | No TTL (decremented on completion) | Per-provider in-flight count |
| `traffic:rpm_rolling` | 5 min rolling window | Platform-wide request rate for traffic state detection |
| `traffic:state` | 30s TTL (refreshed by aggregator) | Current traffic state: `low` \| `normal` \| `high` \| `peak` |
| `queue:user:{user_id}` | No TTL (sorted set score = priority) | User position in request queue |

### RPM Limits (DB-configured)

| Tier | Normal RPM | Exhausted RPM |
|------|-----------|---------------|
| Free | 3 | Locked |
| Basic | 5 | 3 |
| Higher | configurable | configurable |

---

## 17. API Key System

### Key Format

```
sk-orch-[optional_user_prefix]-[random_32_chars]
```

Optional user-defined prefix is sanitised.

### Key Record (DB)

```
api_keys
├── id
├── user_id
├── key_hash                  stored hashed, never plaintext after creation
├── key_preview               e.g. "sk-orch-abc...xyz" (first 12 + last 4 chars)
├── label                     user-defined name
├── is_active                 bool
├── credit_limit_total        int | null
│   null = unlimited; once hit, key is permanently unusable
├── credit_limit_daily        int | null
├── credit_limit_reset        enum: daily | weekly | monthly | never
├── credit_used_today         int
├── credit_used_total         int
├── model_whitelist           JSON array of model_ids | null  (null = ALL)
├── expose_balance            bool  (default: false)
├── created_at
├── last_used_at
└── expires_at                timestamp | null
```

### Downgrade Key Retention

```
IF user downgrades AND key_count > new_tier.max_api_keys:
  → Existing keys remain active (NOT auto-deleted)
  → Cannot CREATE new keys until count < new tier limit
  → Dashboard: "You have X keys. Your plan allows Y. Delete Z to add new ones."
```

### Key Actions

| Action | Behaviour |
|--------|-----------|
| Create | Generates key; plaintext shown once only |
| Rotate | New value; old instantly invalid; config preserved |
| Edit | Update label, limits, whitelist, toggles |
| Disable / Enable | Temporary suspension |
| Delete | Permanent |

### Key Config Notes

- **`credit_limit_total`:** Hard lifetime cap. Once consumed, key is permanently dead. Create new key for a fresh budget.
- **`expose_balance`:** Default `false`. Prevents leaking credit balance to third-party apps using the key.
- **`model_whitelist`:** Restricts which models this specific key can call.
- **RPM:** Still enforced per user, not per key.

---

## 17a. Demo Key System

### Overview

The consumer-facing chat app exposes a **demo tier** that allows unauthenticated visitors to try OrchidLLM with no account required. A persistent demo key is generated in the browser and tracked server-side.

### Key Generation & Persistence

| Rule | Detail |
|------|--------|
| **Generation** | On first visit to the chat app, a `demo_key` UUID is generated server-side and returned to the client. |
| **Browser storage** | Stored in `localStorage` AND as a long-lived cookie (`SameSite=Strict`, `Secure`, 30-day expiry). The cookie is the primary persistence mechanism — if `localStorage` is cleared, the cookie is checked and the key is restored into `localStorage` automatically on next load. |
| **Platform split** | Mobile and desktop are treated as different platforms and may receive different demo keys. Same device, different platform = different key (e.g. a phone and a PC are independent). |
| **Cross-browser on same device** | Demo keys are **not** shared across browsers on the same device (Chrome and Firefox on the same PC have independent keys). This is by design and cannot be reconciled without an account. |
| **No cross-device sync** | Demo keys do not follow the user to a different device. Account creation is required for persistent identity. |

### Limits

| Property | Value |
|----------|-------|
| Requests per day | 20 |
| Context window cap | 33,000 tokens |
| Model access tier | `demo` models only |
| Credit system | N/A — request counter only (Redis incr, daily TTL) |
| Rate limiting | Standard RPM enforced per demo key |

### Inactivity & Expiry

- If a demo key records **no requests for 20 consecutive days**, it is **hard-deleted** from the database (no soft-delete, no recovery).
- The 20-day inactivity timer resets on any successful request.
- If a returning visitor's demo key has been hard-deleted, a new one is issued transparently on next visit.
- Deletion is handled by a scheduled cron job: `DELETE FROM demo_keys WHERE last_used_at < NOW() - INTERVAL '20 days'`.

### Demo Key Record (DB)

```
demo_keys
├── id                  UUID (this IS the demo key value)
├── platform            enum: web_desktop | web_mobile
├── requests_today      int (reset daily via cron or Redis TTL)
├── total_requests      int
├── created_at          timestamp
└── last_used_at        timestamp
```

> `requests_today` is tracked in **Redis** (key: `demo:{uuid}:daily`, TTL = end of UTC day) for performance. The DB `last_used_at` is updated asynchronously for inactivity tracking.

### Model Dropdown Order

The model selector in the chat app orders tiers from most restricted to most capable:

```
demo > free > standard > premium > premium+ > max > elite
```

Demo users only see `demo`-tier models. Registered free users see `demo` + `free` models. Paid tiers see all models up to their plan level.

### Demo vs. Free Tier Comparison

| Property | Demo (no account) | Free (registered) |
|----------|-------------------|-------------------|
| Requests/day | 20 | Configured per tier |
| Context cap | 33k tokens | Tier default |
| Model access | `demo` tier only | `demo` + `free` tier |
| Persistence | Cookie + localStorage | Account-bound |
| API key type | `demo_keys` table | `api_keys` table |
| Upgrade path | Create account → free tier | Subscribe |

---

## 18. Request Lifecycle & Logging

### Full Request Flow

```
1.  Request arrives with sk-orch- key
2.  Authenticate key → resolve user
3.  RPM check (per user) → 429 if exceeded (no charge)
4.  Check user status: active | exhausted | locked
5.  Check model access: does plan allow this model?
6.  Check context tier: does plan unlock this token range?
7.  Resolve effective credit pool and queue priority
8.  Reserve estimated credits → reject if insufficient (no charge)
9.  Insert into request_queue (Redis sorted set)
10. Queue worker picks up → provider routing (§6)
11. SSE/long-poll stays open during wait; heartbeat every N seconds
12. Provider dispatched → stream / return response
13. On completion → reconcile actual credits, release reservation delta
14. Write to request_logs (30d) and routing_logs (15d)
15. On ANY failure at ANY step → full reservation released, zero credits charged
```

### Log Retention Policy

| Log Type | Retention | Visible To | Contents |
|----------|-----------|------------|---------|
| `request_logs` | 30 days | User + Admin | Status, **model name**, **model maker**, endpoint, credits charged, timestamp. **Provider never shown.** |
| `routing_logs` | 15 days | Admin only | Provider chain (provider ID only, never name), obfuscated key reference (hashed short ID, not index or raw key), user_id, fallback sequence, params stripped, queue wait ms, TTFT ms. **Never surfaced to users.** |
| User activity view | 30 days | User | Summarised view of `request_logs` — no payload, no routing detail, no provider info |

Detailed payload logs (request/response body) not stored by default. Admin can enable per-user with consent flag for debugging.

> All upstream provider headers are stripped before the response reaches the user. No `x-provider-*`, rate-limit, or origin headers are forwarded. See §6 Provider Obfuscation Policy.

---

## 19. Auth System

### Providers (no passwords ever stored)

| Provider | Status | Notes |
|----------|--------|-------|
| GitHub OAuth | ✅ v1, active | Primary login method. Fetches `login` (username), `email`, `avatar_url`, `name` from GitHub API on first sign-in. |
| Google OAuth | 🔜 Planned (Phase 6) | Will fetch `email`, `name`, `picture`. Same `users` table, different `provider` field value. |
| Others | Future | Discord, etc. — TBD. |

> Passwords are **never stored** under any OAuth provider path.

### Session Handling

Sessions are managed server-side (e.g. `express-session` + Redis store). The `SESSION_SECRET` env var signs the session cookie. Sessions persist across requests; no JWT in v1.

```
SESSION_SECRET=your_random_session_secret_here
```

### Multi-Provider Account Linking

When Google OAuth launches, users who signed up via GitHub should be able to link their Google account to the same `users` row. The `user_auth_providers` table handles this:

```
user_auth_providers
├── id
├── user_id           FK → users
├── provider          enum: github | google
├── provider_user_id  string (GitHub login or Google sub)
├── email             string
└── linked_at         timestamp
```

Primary email on the account is whichever provider was used at sign-up, but can be changed from Account Settings.

### Admin Accounts

- Admin = standard `users` row with `role = "admin"`.
- Default admin: GitHub handle `vendouple`. Additional admins granted via Admin panel by an existing admin.
- Admin routes protected by role-check middleware.
- No separate auth system or login flow.

### Unauthenticated Access

```
GET /v1/models        → 401 (requires API key)
All /v1/* endpoints   → 401 (requires API key)
Public model catalog  → ✅ Available (frontend page, not an API endpoint)
Chat app demo         → ✅ Available (demo key issued, see §17a)
```

---

## 19a. Account Center

The Account Center is a dedicated settings area within the dashboard where users manage their identity, preferences, and account lifecycle. Accessible from the dashboard nav (avatar / profile chip).

### Profile Information

| Field | Editable | Source | Notes |
|-------|----------|--------|-------|
| Username | ✅ Yes | Pulled from OAuth on first sign-in; user can override | Displayed throughout the app |
| Display name | ✅ Yes | Same as username initially | Shown on profile/social features |
| Email address | ✅ Yes | Pulled from OAuth provider | Primary contact for billing, notifications |
| Avatar | ✅ Yes | Pulled from OAuth (GitHub avatar / Google picture) | User can upload a custom avatar |
| Joined date | ❌ Read-only | `users.created_at` | Displayed as "Member since [Month Year]" |
| Account ID | ❌ Read-only | `users.id` | Shown for support reference |
| Auth provider(s) | ❌ Read-only (link/unlink) | `user_auth_providers` | Shows connected providers; link new ones here |

### Security

| Feature | Detail |
|---------|--------|
| Connected accounts | List of linked OAuth providers (GitHub, Google when live). Link / unlink from here. |
| Active sessions | View active sessions by device/browser with last-seen timestamp. Revoke individual sessions or all except current. |
| Session secret rotation | Not user-facing — handled server-side. |

### Notification Preferences

| Preference | Default | Detail |
|-----------|---------|--------|
| Billing alerts (low credits, renewal) | On | Email + in-app |
| Announcement notifications | On | In-app bell only |
| Product updates / newsletter | Off (opt-in) | Email only |

### Request History

- Displays the user's request activity log for the last **30 days** (mirrors §18 log retention).
- Columns: timestamp, model, endpoint, status (success / fail), credits charged.
- Filterable by date range, model, status.
- Users cannot see routing-level detail (that is admin-only).
- A **"Clear visible history"** option dismisses the display — does not delete underlying logs (those expire naturally at 30d).

### Subscription & Billing (summary)

- Current plan name, billing cycle, next renewal date.
- Links through to the full Billing section of the dashboard.
- Read-only here — plan changes happen in the Billing section.

### Account Deletion

Deletion is a **hard, irreversible action**. Flow:

```
1. User clicks "Delete my account" (buried under a danger zone section)
2. Confirmation modal:
   "This will permanently delete your account, all API keys,
    and cancel any active subscriptions. This cannot be undone."
   Requires user to type their username to confirm.
3. On confirm:
   → All active API keys are immediately revoked
   → Active subscriptions flagged for cancellation at payment provider
   → user_auth_providers rows deleted
   → users row soft-deleted initially (is_deleted = true, deleted_at = now())
   → Hard purge scheduled after 14-day grace period (cron)
   → Session destroyed, user redirected to homepage
4. Grace period (14 days):
   → User can log back in and cancel deletion ("Restore my account" banner)
   → No new requests accepted during grace period
   → After 14 days: hard delete of users row + all associated data
```

> **Data retained after hard delete:** Aggregated/anonymised billing records may be retained for financial compliance. No PII.

### Account Center DB Fields

Additional fields on `users` table to support Account Center:

```
users (additions)
├── username              string, unique (editable, min 3 chars, alphanumeric + underscore)
├── display_name          string, nullable
├── email                 string, nullable (from OAuth; user can update)
├── avatar_url            string, nullable
├── created_at            timestamp                ← "Joined" date
├── is_deleted            bool, default false
├── deleted_at            timestamp, nullable
├── deletion_scheduled_at timestamp, nullable      ← grace period end
└── notification_prefs    JSON
```

---

## 20. Frontend — Dashboard & Consumer App

### Tech: Material 3 Expressive

Use the Material 3 Expressive web bundle as an ES module on frontend pages that need M3E components:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@m3e/web@2.5.5/dist/all.min.js/+esm"></script>
```

Local vendored assets may remain available for offline/dev fallback, but production pages should prefer the pinned CDN module unless there is a deployment reason not to.

### Dynamic Accent Color Per Tier

Each `subscription_tiers` row has a `display_color_token` field. Frontend reads the user's active tier and applies the corresponding M3 color scheme. **No hardcoded hex values in frontend.**

```
Free    → Gray / neutral
Basic   → e.g. Blue / Teal
Plus    → e.g. Purple / Violet
Pro     → e.g. Amber
Elite   → e.g. Deep Red / Orchid
```

Tier color transitions are **animated** on upgrade confirmation.

### Dashboard Sections

| Section | Features |
|---------|---------|
| Home | Usage summary, credit meters (standard / fast / rollover / booster), active packs, recent activity |
| Chat | Consumer app entry point (demo for guests, full chat for logged-in users — Phase 5) |
| Models | Public catalog + authenticated detail view. Each model card is the **single location** for per-model context tier toggles, compression config, and budget behaviour (Allow / Compress / Error). |
| API Keys | CRUD + per-key config (limits, whitelist, expose_balance) |
| Billing | Plan status, credits breakdown, booster store, invoices (future) |
| Settings | `strict_params` toggle (paid only), account-level preferences. **Compression and context window config are NOT here — they live on each model card.** |
| Account | Profile, email, avatar, connected providers, active sessions, notification prefs, request history, danger zone (account deletion) — see §19a |
| Announcements | Banner list, expandable, dismissible |
| Logs | 30d request activity + 15d routing detail |

### Model Detail Sheet (Model Card)

The model card is the **sole location** for per-model context and compression configuration. Nothing related to context tiers, compression, or budget behaviour exists anywhere else in the UI (not in Settings, not globally). Each model is configured in isolation — settings on one model card do not affect any other model.

Clicking a model opens its card showing:

- Provider(s) as anonymous endpoint labels, access tier, context tiers available for this model.
- Token multipliers (input / output / cache read / cache write) — shown at the user's current plan tier.
- User's enabled context tier toggles (sequential unlock enforced — cannot skip a tier).
- Per-tier compression config: compression model dropdown + prompt editor (one per context tier, independently configurable). Each tier may use a completely different compression model.
- Budget action selector (**Allow** / **Compress** / **Error**) per context tier — set independently per tier.
- Lock icons with upgrade CTA for tiers above the user's current plan.

> **For implementors:** if you are building any part of this UI and find yourself adding compression or context config outside of the model card, stop — it is in the wrong place.

### Rollover Cap Nudge

Dashboard shows a persistent nudge when rollover cap is hit: *"You've hit your rollover cap — spend your credits before the cycle ends to avoid losing them."*

### Page Architecture

The frontend is **four HTML pages** sharing a common asset base:

| Page | File | Purpose |
|------|------|---------|
| Chat / Index | `index.html` | Public-facing chat interface, demo sessions, future playground. Entry point for all visitors. |
| Dashboard | `users.html` | Full user dashboard: overview, models, billing, account, API keys, logs. |
| Login | `login.html` | Auth intermediary. Handles GitHub OAuth redirect. On success, returns user to `index.html`. |
| Admin | `admin.html` | Internal admin panel. Role-gated. |

**`index.html` — File responsibilities:**

- `index.html` — markup / shell
- `index.js` — all UI logic for the chat page (demo key handling, message rendering, model dropdown)
- `app.js` — API talker only; routes requests from `index.html` through the backend gateway. **Do not modify `app.js` for UI concerns.**

> Current state: `index.html` is intentionally barebones (intermediary + demo). Errors should be fixed but feature scope should not expand until Phase 5.

**`login.html` flow:**

```
User clicks login on index.html
  → /login.html
  → GitHub OAuth redirect
  → OAuth callback → session created
  → Redirect back to index.html
From index.html: profile icon dropup → /users.html (dashboard)
```

**`users.html` — Sections:**
All sections listed in the Dashboard Sections table (§20 below). Includes model customisation, billing, account, API key management, overview.

**`admin.html` — Sections:**

| Section | Detail |
|---------|--------|
| Overview | Platform stats: total users, active sessions, revenue (stub), provider health summary |
| Usage Logs | Full 15d routing detail + 30d activity, filterable by user / model / status |
| Request Queue | Live view of in-flight and queued requests, per-user, cancellable |
| Demo Session Keys | List all active demo keys, view usage, **purge** (hard delete) or **suspend** (block requests without deletion) |
| Users | Search users, view plan/credits/keys/logs, manually upgrade/downgrade tier, extend subscription, reset/refund credits, suspend accounts. Batch operations supported (multi-select → bulk action). |
| Tiers | Full CRUD on subscription tiers: name, price (IDR + USD), credit allocations, RPM, queue priority, API key limit, concurrent request limit, context caps, rollover config, colour token |
| Booster Packages | Create / edit / deactivate packs: credit amount (standard + fast split), queue priority, model access grant, store offer window (`available_from`/`available_until`), per-tier availability, purchase limit |
| Model Catalogue | See §20 Model Catalog Maker below |
| API Keys | View all API keys platform-wide, filter by user, plan, status. Suspend or revoke individual keys. Bulk suspend. |
| Announcements | Create / edit / expire banners. Set tone, title, markdown description, active window, max 3 simultaneous banners enforced here. |
| SQL Query | Direct SQL query interface to Oracle DB. **Admin only.** Queries are read-only by default (SELECT); destructive queries require an explicit override toggle per session. All queries logged with admin user ID and timestamp. |

### Admin ↔ User View Toggle

If the authenticated user has `role = "admin"`, a persistent **Switch to User View / Switch to Admin View** button is shown (e.g. top-right chip). This lets the admin verify the user-facing experience without logging out. The toggle switches the active page context; it does not change the user's role or session.

---

### Model Catalog Maker

The model catalogue is the most advanced configuration surface. Key rules:

**Provider keys are `.env`-only. No provider API keys are stored in the DB.**

The system supports key rotation per provider: multiple keys for the same provider can be listed in `.env` (e.g. `OPENAI_KEY_1`, `OPENAI_KEY_2`). The router distributes requests across available keys and falls back to the next key if one is rate-limited or erroring.

**Per-model config (admin):**

| Field | Detail |
|-------|--------|
| Display name | Model name shown to users |
| Provider | Dropdown of configured `.env` providers |
| Access tier | `demo` / `free` / `standard` / `premium` / `premium+` / `max` / `elite` / `admin` |
| Context window thresholds | Infinite rows: each threshold has a `token_min`, multiplier overrides (input/output/cache read/cache write), and access tier required to unlock. Must be sequential — gaps not allowed. |
| Supported capabilities | Multi-select: `vision`, `tool_calling`, `streaming`, `batch`, `caching`, `reasoning`, `search`, `image_generation`, `tts`, `transcription`, `music_generation`, `video_generation` |
| Parameters supported | Flag which inference params the provider supports (temperature, top_p, reasoning_effort, etc.) |
| Deprecation date | Optional. Once reached: model is soft-disabled on frontend (greyed, tooltip "Deprecated"). Still accessible via API for existing users with a deprecation warning header. |
| Description | Markdown, shown on model detail card |
| Speed rating | Integer 0–N. **Higher = faster**. Admin tooltip: *"Higher = faster. Free/demo traffic may use lower-speed providers; paid traffic prioritises higher-speed providers."* Used by router to prioritise providers by user tier. |

**Provider capability conflict resolution** (when user requests params not all providers support):

```
User request comes in with params [streaming, image, tools]

Step 1: Find providers for this model that are healthy (not rate-limited / disabled)
Step 2: If user has strict_params=ON (paid only):
         → Require ALL requested params to be supported
         → If no single provider satisfies: FAIL (no credits charged)
Step 3: If strict_params=OFF:
         → Warn user via response header: X-Orchid-Unsupported-Params: [list]
         → Priority order for param coverage:
             streaming > image > tool_calling > reasoning > search > (others)
         → Pick provider with highest coverage score
         → If tie: pick by speed rating (lowest number wins)
Step 4: If no providers are available at all:
         → 503, no credits charged
```

**Model card — anonymous provider capability table:**

The public/user-facing model detail card does NOT reveal provider names. Instead it shows:

```
| Endpoint   | Capabilities              |
|------------|---------------------------|
| Endpoint A | Streaming, Vision, Tools  |
| Endpoint B | Streaming, Vision         |
| Endpoint C | Streaming                 |
```

Labels are auto-generated (`Endpoint A`, `Endpoint B`, …) and stable per session. The user can see which capability set is available but cannot identify the underlying provider.

---

Consumer app and API dashboard are in the same frontend deployment. Users navigate between them or go directly to the dashboard by URL.

**Current State (Phase 0–1):** The consumer-facing chat app is intentionally barebones — it acts as a live demo and a gateway to redirect users toward the dashboard and account creation. It uses the demo key system (§17a) to let visitors try the service immediately without signing up.

**Authenticated Chat (Phase 5):** Once a user is logged in, the chat app will automatically use their account's API key to power the chat session. No manual key entry required — the frontend resolves the key from the session and routes requests through the gateway transparently.

**Future Phases (Phase 5+):**

| Feature | Description |
|---------|-------------|
| Playground mode | Model parameter tweaking (temperature, top_p, system prompt), side-by-side model comparison |
| Roleplay / Characters | Selectable AI personalities with persistent memory, configurable by admin |
| Conversation history | Saved chats tied to user account |
| Minigames | Lightweight interactive games powered by the LLM |
| Social features | Shareable conversations, public character profiles |

**Phase note:** Playground and roleplay are planned for Phase 5. Social/sharing features are Phase 6+. Exact breakdown to be refined as Phase 5 approaches.

**Free tier API key policy:** Once the consumer app is mature, free-tier registered users will be directed to the consumer app rather than granted raw API key access. This keeps free usage within the controlled chat interface.

---

## 21. Announcement & Changelog System

Announcements and changelogs are a **unified system** — the same DB table, same admin UI, different `type` tags. An admin can post a pure changelog entry, a pure announcement, or tag a single post as both. Announcements can also hyperlink to a related changelog entry.

### Entry Types & Preset Colours

| Type | Preset Colour | Use Case |
|------|--------------|-------|
| `announcement` | Tone-driven (see below) | Platform news, maintenance, policy changes |
| `changelog` | Teal / Cyan | Model updates, new features, system improvements, version notes |
| `announcement + changelog` | Tone colour (banner) + Teal badge | Urgent news that also has release notes; both tags shown |

**Announcement tones** (applied when `type` includes `announcement`):

| Tone | Colour | Use Case |
|------|--------|---------|
| `info` | Blue | General information, non-urgent news |
| `warning` | Amber | Upcoming maintenance, degraded service |
| `error` | Red | Outage, critical issue |
| `success` | Green | Issue resolved, service restored |
| `neutral` | Gray | Low-importance notices |
| `changelog` | Teal / Cyan | Changelog-only entries (no urgency implied) |

> A `changelog`-only entry is **not** shown as a banner by default — it appears only in the Announcements/Changelog page and bell list. Tagging it as `announcement + changelog` promotes it to banner-eligible.

### DB Record

```
announcements
├── id
├── title                    text          ← full announcement title (used on page)
├── banner_title             string | null ← shorter title for the banner strip; falls back
│                                            to title if null
├── description              markdown | null
├── type                     enum: announcement | changelog | both
├── tone                     enum: info | warning | error | success | neutral | changelog
├── version_tag              string | null   e.g. "v1.4.2", "Model Update – May 2026"
│                            (shown as a small chip on changelog entries)
├── related_announcement_id  FK → announcements | null
│                            (allows an announcement to hyperlink to a changelog entry)
├── is_banner                bool   (false by default for changelog-only entries)
├── is_banner_dismissible    bool   (true = user can dismiss banner; false = permanent banner
│                                   until admin expires/disables/makes-dismissible/disables banner)
├── expires_at               timestamp | null
│                            When reached: announcement soft-disappears from user dashboard.
│                            Banner also removed. Admin can still see and restore.
│                            If null = stays visible forever until admin disables it.
├── is_active                bool   (false removes entry from user view immediately — both
│                                   announcement and banner. Admin sees it as disabled.)
├── posted_at                timestamp   ← original publish time; never changed on edit
├── last_edited_at           timestamp | null   ← updated on every admin edit
└── created_by               FK → users (admin)
```

> `posted_at` is set once on creation and never modified. `last_edited_at` updates on every subsequent admin edit.

### Announcement Lifecycle — What Makes One Disappear

| Trigger | Effect on Banner | Effect on Announcements Page |
|---------|-----------------|------------------------------|
| `expires_at` reached | Removed | Soft-removed from user view |
| Admin sets `is_active = false` | Removed | Removed from user view (admin can re-enable) |
| Admin sets `is_banner_dismissible = true` | User can now dismiss it | Announcement stays on page |
| Admin sets `is_banner = false` | Removed | Announcement stays on page |
| User dismisses a dismissible banner | Dismissed for that user | Announcement **still visible** on page — **announcements page is never user-dismissible** |

### Non-Dismissible Banner Rules

If `is_banner_dismissible = false`, the banner persists for every user until one of these admin actions:

- **A.** Admin sets `expires_at` → banner (and announcement) disappear when that date is reached
- **B.** Admin sets `is_active = false` → removes both banner and announcement immediately
- **C.** Admin sets `is_banner_dismissible = true` → users can now dismiss it themselves
- **D.** Admin sets `is_banner = false` → disables the banner only; announcement stays on page

### Banner Rules

- Max **3 active banners** simultaneously (most recent 3 by `posted_at` if more exist).
- Banners are **thin, unobtrusive** — single line: `banner_title` (falls back to `title`) + tone colour strip + type chip + dismiss button (only if `is_banner_dismissible = true`).
- Clicking banner → navigates to Announcements page → auto-expands clicked entry → marks as read.
- Changelog-only entries (`is_banner = false`) are never shown as banners regardless of settings.
- Banner appearance does **not** change based on read state. Full banner style always shown — read state is reflected on the announcements page only.

### Read State

- An announcement is marked **read** when the user clicks it from the banner, bell list, or announcements page. All three count equally.
- Read announcements on the page render in **pastel / muted** style — colour shifted, opacity reduced. Still fully legible at a glance; not intrusive.
- Unread announcements show at full colour and contrast.
- Non-dismissible banners always render at full banner style regardless of read state.
- Read state stored in `user_read_announcements` (user_id, announcement_id, read_at).

### Timestamps & Relative Time

Every announcement shows two levels of timestamp detail:

**In-list / bell view (compact):**
```
Last edited: [date]  ·  16 hrs ago
```
Relative time counts from `last_edited_at` if set, otherwise from `posted_at`. Lets users judge at a glance if the entry is fresh or outdated.

**Popout / expanded view (full detail):**
```
Originally posted:  [full posted_at timestamp]
Last edited:        [full last_edited_at timestamp]   ← only shown if edited at least once
```

### Announcements / Changelog Page

- Single unified page, sorted **newest → oldest** by `posted_at`.
- Filterable by type (`All` / `Announcements` / `Changelog`).
- **Not user-dismissible.** Entries disappear only via `expires_at` or admin `is_active = false`.
- Read entries shown in pastel/muted style; unread at full contrast.
- Changelog entries show `version_tag` as a prominent chip.
- Cross-linked entries: **"See release notes →"** / **"See announcement →"** shown inline.
- Admin creates both types from the same form: type, tone, title, banner title override, description, version tag, dismissibility toggle, optional expiry date.

### Bell Icon

- Located at bottom of sidebar/nav.
- Red badge count = unread active announcements + unread changelog entries.
- Bell list groups: banners/announcements first, changelog entries below a divider.
- Relative time shown inline per entry ("2 hrs ago", "yesterday").
- `version_tag` chip shown on changelog entries.
- Clicking any bell entry marks it as read and opens the expanded entry on the Announcements page.

### Supporting DB Tables

```
user_dismissed_banners
├── id
├── user_id         FK → users
├── announcement_id FK → announcements
└── dismissed_at    timestamp
-- Only for banner dismissals. Announcements page has no user-dismiss action.

user_read_announcements
├── id
├── user_id         FK → users
├── announcement_id FK → announcements
└── read_at         timestamp
-- Written on click from banner, bell list, or announcements page.
```

> Replaces the old `user_dismissed_announcements` table, now split into two tables with distinct responsibilities.

---

## 22. Admin System

### Admin Role

`users.role = "admin"`. Same GitHub OAuth login flow. Role enforced by middleware on all `/admin` routes.

> Full per-section breakdown of `admin.html` is in **§20 — Page Architecture**. This section covers access rules and backend capabilities only.

### Admin Capabilities

| Feature | Description |
|---------|-------------|
| Manual plan upgrades | Set user's tier, bypass billing; takes effect immediately or next cycle |
| Subscription management | Extend subscription, refund credits, reset credits to tier default |
| Provider management | Enable/disable providers, view health, rotation config via `.env` |
| Tier configuration | Full CRUD on subscription tiers and all parameters |
| Booster pack management | Create / edit / deactivate packs; set store offer window, not credit expiry |
| Model management | Full model catalogue maker (see §20) |
| Announcement management | Create / edit / expire announcements and changelog entries; set `banner_title`, tone, type, dismissibility toggle, optional `expires_at`; disable banner independently of announcement; enforce 3-banner limit |
| Pricing config | Base credit costs, multipliers, context tier prices, batch discount rate |
| User lookup | View user's plan, credits, keys, logs; suspend accounts |
| Batch user operations | Multi-select users → bulk suspend / tier change / credit reset / key revoke |
| Demo key management | Purge (hard delete) or suspend demo keys |
| API key oversight | View all keys platform-wide, filter by user/plan/status, bulk suspend/revoke |
| Provider health dashboard | Real-time status, in-flight counts, rate limit expiry, out-of-credits alerts (>1 day flag) |
| Admin notifications | In-panel notification bell (DB-backed, `admin_notifications` table). Alerts for provider out-of-credits >1 day, provider dead, extended rate limits. No email in v1. |
| Log viewer | Full routing detail (15d); users see only summarised activity |
| SQL query tool | Direct Oracle SQL from admin panel; SELECT by default, destructive queries require per-session override toggle; all queries logged |
| Affiliate settings | Referral rates *(future)* |

### Admin ↔ User Toggle

Documented in §20. Admin can switch to user view at any time to verify the user-facing experience without ending their admin session.

---

## 23. Affiliate / Referral System

**Status: Future Phase — not in v1**

### Planned Mechanics

- Referral code entry on checkout page.
- **Booster packs:** Referrer earns **10%** of purchase value in credits.
- **Subscriptions:** Referrer earns **8% per billing cycle** as long as referred user stays subscribed.
- All percentages Admin-configurable.
- Partner program: same mechanic, different configurable rate tier.

### Data (scaffold from day one to avoid future migrations)

```
users
  └─ referred_by     FK → users | null
  └─ referral_code   unique string (generated on signup)

referral_transactions
  id, referrer_user_id, referred_user_id,
  purchase_id, credit_reward, granted_at
```

---

## 24. Database Schema Outline

Full migrations to be written. This is the complete entity map.

```
users
  id, username (unique), display_name, email,
  avatar_url,
  role: "user" | "admin",
  -- OAuth identity now handled via user_auth_providers (multi-provider)
  strict_params: bool,
  referred_by: FK users | null,
  referral_code: unique string,
  notification_prefs: JSON,
  is_deleted: bool,
  deleted_at: timestamp | null,
  deletion_scheduled_at: timestamp | null,
  created_at, updated_at

user_auth_providers
  id, user_id,
  provider: "github" | "google",
  provider_user_id, email,
  linked_at

user_subscriptions
  id, user_id, tier_id,
  status: active | cancelled | expired | pending_upgrade,
  billing_cycle: monthly | yearly | lifetime,
  currency: IDR | USD,
  current_period_start, current_period_end,
  pending_tier_id,
  created_at

user_credits
  id, user_id,
  credits_standard, credits_fast, credits_rollover,
  credits_reserved,
  last_updated

user_credit_ledger
  id, user_id,
  source: sub | booster | rollover | reservation | reconcile,
  amount, balance_after, reference_id, created_at

subscription_tiers          (see §7)
subscription_tier_billing_options  (see §13)
booster_packs               (see §12)

booster_pack_wallets
  id, pack_id, label,
  credits_amount, queue_priority,
  model_access_tier, context_unlock_tiers

booster_pack_targeting_rules
  id, pack_id, rule_type, operator,
  value_a, value_b, unit,
  timeframe_type, timeframe_start, timeframe_end,
  logic_group

user_booster_packs
  id, user_id, pack_id,
  purchased_at,
  credits_standard_remaining, credits_fast_remaining,
  is_active, invalidated_at, invalidation_reason
  -- No expires_at: pack credits do not expire after purchase.
  -- Pack is invalidated only by plan downgrade (ignore_plan_lock=false) or account deletion.

user_next_cycle_offers      (see §13)
  id, user_id, offer_type, discount_percentage,
  bonus_credits, bonus_credit_type, message,
  applies_to_cycle, is_used, created_at, created_by

model_makers
  id, name,               -- e.g. "Anthropic", "OpenAI", "Google DeepMind"
  slug,                   -- e.g. "anthropic", "openai", "google" — used for filtering
  icon_url,               -- logo/icon for UI dropdown and model cards
  description,            -- short blurb shown on filter UI
  website_url,
  created_at

models
  -- see §5 for full field list
  -- model_maker_id FK → model_makers (replaces free-text model_maker field)
  -- provider association is in model_providers; never exposed directly to users

providers
  id, name, base_url,
  -- NO api_key stored here: all provider keys live in .env only
  -- env_key_prefix: used to resolve keys from .env (e.g. "OPENAI" → reads OPENAI_KEY_1, OPENAI_KEY_2, ...)
  env_key_prefix,
  status: active | rate_limited | out_of_credits | dead | disabled,
  speed_rating,       -- higher = faster. Admin tooltip shown in catalogue.
  notes,
  created_at

model_providers             (see §5)
model_token_multipliers     (see §9)
api_keys                    (see §17)

demo_keys                   (see §17a)
  id (UUID = the key itself), platform, requests_today,
  total_requests, created_at, last_used_at

request_queue
  id, user_id, api_key_id, model_id,
  provider_id (null until assigned),
  priority,
  status: pending | in_flight | completed | failed,
  payload_ref,
  reserved_credits, actual_credits,
  created_at, dispatched_at, completed_at

batch_requests              (see §14)

user_compression_settings   (see §8)
user_context_tier_preferences  (see §8 / §9)

user_dismissed_banners
  id, user_id, announcement_id, dismissed_at
  -- banner dismissals only

user_read_announcements
  id, user_id, announcement_id, read_at
  -- written on click from banner, bell, or page

announcements               (see §21)

admin_sql_query_logs
  id, admin_user_id, query_text, executed_at,
  destructive_override: bool, row_count, duration_ms

admin_notifications
  id,
  type: provider_out_of_credits | provider_dead | provider_rate_limited_extended | system_alert,
  provider_id,              -- FK → providers (nullable for non-provider alerts)
  message,                  -- human-readable detail
  severity: info | warning | error,
  is_read: bool,
  created_at,
  read_at: timestamp | null
  [shown in admin panel notification bell; no email in v1]

request_logs
  id, user_id, api_key_id, model_id, provider_id,
  endpoint, status: success | fail,
  credits_charged, created_at
  [retained 30 days]

routing_logs
  id, request_id,
  provider_id,                  -- internal ID only, never the provider name
  key_ref_hash,                 -- short obfuscated hash of the key used (NOT the key index or raw key)
                                -- sufficient to correlate key issues in debugging without exposing key identity
  user_id,                      -- for cross-referencing without exposing to user
  providers_attempted: JSON,    -- list of provider_ids tried in order
  params_stripped: JSON,
  final_provider_id, routing_reason,
  queue_wait_ms, ttft_ms,
  created_at
  [retained 15 days]

referral_transactions       (see §23)
```

---

## 25. Environment & Configuration

```env
# Core
NODE_ENV=development
APP_URL=http://localhost:3000
# APP_URL=https://orchidllm.vercel.app   ← uncomment for production
API_BASE_URL=http://localhost:3000/api

# Auth — GitHub OAuth (v1, primary)
# Create app at: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_gh_client_id
GITHUB_CLIENT_SECRET=your_gh_client_secret
ADMIN_GITHUB_HANDLES=vendouple   # comma-separated for multiple

# Auth — Session
SESSION_SECRET=your_random_session_secret_here

# Auth — Google OAuth (planned, not yet active)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# Database — Oracle
# Connection string format: (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=...)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=...)))
# Or short wallet format for Oracle Cloud ADB: your_db_name_high / _medium / _low / _tp / _tpurgent
ORACLE_DB_USER=ADMIN
ORACLE_DB_PASSWORD=YourSuperSecretPassword123!
ORACLE_DB_CONNECTION_STRING=

# Redis (queue + RPM counters + demo key daily counters + in-flight tracking)
REDIS_URL=

# Provider Speed Ratings — higher number = faster provider.
# Add one `<PROVIDER_ENV>_SPEED` value for each provider key env var you configure.
# Speed is used for paid traffic only. Free/demo routing ignores speed entirely.
OPENROUTER_API_KEY_SPEED=80
GROQ_API_KEY_SPEED=70
POLLINATIONS_API_KEY_SPEED=20

# Provider Free Eligibility — controls whether a provider can serve free/demo tier users.
# true  = provider is eligible to receive free and demo tier traffic
# false = provider is reserved for paid subscribers only (never receives free/demo requests)
# Speed is irrelevant for free/demo users — only _FREE eligibility is checked.
OPENROUTER_API_KEY_FREE=true
GROQ_API_KEY_FREE=true
POLLINATIONS_API_KEY_FREE=false

# Encryption (for provider API keys stored at rest)
ENCRYPTION_KEY=

# Temporary payload storage (queue payloads — S3/R2 or local)
PAYLOAD_STORAGE_DRIVER=local
PAYLOAD_STORAGE_PATH=./tmp/queue-payloads

# Feature flags (move to DB config later if needed)
FEATURE_BATCH_QUEUE=false
FEATURE_AFFILIATE=false
FEATURE_CONSUMER_APP=false
```

> **Oracle note:** The app uses the `oracledb` Node.js driver (thick or thin client). Ensure Oracle Instant Client is installed if using thick mode, or use thin mode (no native dependency) for Oracle Cloud ADB. Connection pooling is handled by `oracledb.createPool()` at app startup.

---

## 26. Phased Rollout Plan

### Phase 0 — Foundation

- [ ] Database schema + migrations
- [ ] Auth (GitHub OAuth, admin role middleware)
- [ ] Provider management (DB + admin UI)
- [ ] Model registry (DB + admin UI)
- [ ] Basic API gateway skeleton (auth, routing stub, no queue yet)
- [ ] `.env`-driven base URL config

### Phase 1 — Core API Gateway

- [ ] Queue system (Redis sorted set, priority-based)
- [ ] Provider router with health tracking, fallback, in-flight counting
- [ ] `POST /v1/chat/completions` (streaming + non-streaming)
- [ ] Token multiplier + credit reservation + reconciliation
- [ ] RPM enforcement (per user, Redis counter)
- [ ] API key system (full feature set including per-key limits)
- [ ] Demo key system: generation, cookie+localStorage persistence, Redis daily counter, 20-day inactivity cron hard-delete
- [ ] `GET /v1/models` (auth required, plan-filtered; demo key returns demo-tier models only)
- [ ] Request logs + routing logs

### Phase 2 — Billing & Plans

- [ ] Subscription tier CRUD (admin panel)
- [ ] Manual plan upgrade (admin)
- [ ] Credit system (standard, fast, rollover, booster pools)
- [ ] Credit pool depletion order
- [ ] Exhaustion system
- [ ] Rollover cron (end-of-cycle calculation + cap nudge)
- [ ] Booster pack system + stacking logic
- [ ] Dummy checkout endpoints (IDR + USD)
- [ ] Billing cycle + deferred upgrade logic
- [ ] Pre-reservation + reconciliation

### Phase 3 — Advanced Features

- [ ] Compression pipeline (sequential backend)
- [ ] Compression settings UI (per model, per tier, independent model per tier)
- [ ] Context window tier unlock + sequential enforcement
- [ ] Plan-downgrade context auto-lock at billing cycle start
- [ ] Batch queue (schema + logic, provider stubs)
- [ ] Concurrent request limits
- [ ] `POST /v1/images/generations`, `/v1/audio/speech`, `/v1/audio/transcriptions`
- [ ] Music + video generation endpoints (stubbed initially)
- [ ] Announcement system + bell notifications

### Phase 4 — Frontend Polish

- [ ] Material 3 Expressive dashboard
- [ ] Dynamic tier accent colors (DB-driven, animated transitions)
- [ ] Model detail sheet + lock icons + per-tier compression config UI
- [ ] API key management UI
- [ ] Billing / credits dashboard (credit meters, booster store)
- [ ] Logs viewer
- [ ] Public model catalog page (marketing, no auth)

### Phase 5 — Consumer App

- [ ] Demo key system fully live on chat app landing page (already scaffolded in Phase 1)
- [ ] Authenticated chat: logged-in users routed through their own API key automatically
- [ ] Chat interface (conversation view, model selector showing demo > free > ... tier order)
- [ ] Playground mode: system prompt editor, parameter sliders (temperature, top_p, etc.)
- [ ] Roleplay / Characters: selectable personalities, admin-configurable
- [ ] Conversation history: saved chats tied to user account
- [ ] Minigames (LLM-powered, lightweight)
- [ ] Free tier API key access gated (consumer app only, no raw key for free tier)

### Phase 6 — Growth

- [ ] Real payment integration (Midtrans for IDR, Stripe for USD)
- [ ] Affiliate / referral system
- [ ] Google OAuth
- [ ] Admin analytics dashboard

### Phase 7 — Provider Integration (Final Phase)

This is the last major engineering phase. All previous phases run against stub/mock providers or a small set of manually-configured endpoints. Phase 7 implements the full aggregator and distributor layer reading from provider documentation.

**Aggregator / Distributor Manager:**

The aggregator is the core internal service that manages all outbound provider traffic. It sits between the queue worker and the external provider APIs.

| Responsibility | Detail |
|---------------|--------|
| Provider doc integration | For each provider, implement their specific API format per their official docs (OpenAI-compatible, Anthropic native, custom, etc.) |
| Request translation | Normalise all inbound OpenAI-compatible requests into the format each provider expects. Translate responses back to OpenAI-compatible format. |
| Key pool management | Round-robin `.env` key selection per provider; rate-limit detection and backoff; automatic failover to next key |
| Response normalisation | Strip all upstream provider headers and identifying information before returning to caller (see §6 Obfuscation Policy) |
| In-flight tracking | Maintain per-provider in-flight counts in Redis; enforce `max_concurrent` per provider |
| Health monitoring | Detect rate limits (429), auth failures (401/403), out-of-credit signals, and hard errors. Update `providers.status` accordingly. |
| Admin alerts | Notify admin if a provider has been in `out_of_credits` or `dead` state for >1 day on any request attempt |
| Audit trail | Every outbound request logged to `routing_logs` (admin-only, 15d retention) with provider ID, **obfuscated key reference** (shortened hash — never the actual key or index number), user_id, latency, and outcome |

**Provider support scope — adapter-per-provider architecture:**

Every provider gets its **own adapter module**. Adapters are isolated from each other and communicate only with the main aggregator via a standard interface. This isolation is intentional: each provider has different rate limit formats, error codes, polling mechanisms (some use async job polling for image/video/music generation, others stream synchronously), and auth patterns.

```
aggregator/
  adapters/
    openai.js          ← OpenAI REST + streaming
    anthropic.js       ← Anthropic Messages API (native)
    google.js          ← Gemini API
    openrouter.js      ← OpenRouter (OpenAI-compatible passthrough + extras)
    together.js        ← Together AI
    ...                ← one file per provider family
  aggregator.js        ← main orchestrator; calls adapters, enforces obfuscation,
                          handles key pool rotation, health tracking, logging
```

Each adapter implements a standard interface:

- `request(payload, key)` → normalised response
- `translateError(rawError)` → `{ category: 'user_actionable' | 'internal', message: string }`
- `isRateLimited(response)` → bool
- `isAsync` → bool (true for providers that return a job ID to poll)
- `pollResult(jobId, key)` → normalised response (async providers only)

Polling jobs (image, video, music, TTS generation from async providers) are managed per-adapter and do not block the main queue worker thread.

**Aggregator responsibilities:**

- Calls the correct adapter based on `model_providers.env_key_prefix`
- Enforces key pool rotation and health flags
- Strips all upstream headers; passes only normalised response to caller
- Logs to `routing_logs` with obfuscated key reference (`key_ref_hash`)
- Fires `admin_notifications` records for provider health events
- Enforces that no raw provider error text escapes — all errors pass through adapter's `translateError`

**Security:**

- All outbound requests routed through aggregator only — no direct client → provider path
- Provider base URLs and key prefixes in `.env`; resolved at runtime, never returned to client
- TLS enforced on all outbound connections
- Internal metadata fields stripped from payload before forwarding

> Provider priority list for Phase 7 decided at Phase 7 kickoff.

---

## 27. Decision Log (Q&A Sets A–C)

### Set A

- ✅ Queue base priority `n` is DB-configured per tier — not hardcoded.
- ✅ Compression is sequential backend. TTFT slower; spinner shown client-side.
- ✅ **Booster pack credits do not expire after purchase** — credits persist until consumed or account deleted. `available_from`/`available_until` control the store offer window only. Badges like "⏳ 24 HOURS LEFT" refer to the store deal closing, not credit expiry.
- ✅ Plan-lock invalidation controlled by `ignore_plan_lock` only. No `is_permanent` toggle — all packs are permanent by default; `ignore_plan_lock=false` packs are invalidated on downgrade below purchase tier.
- ✅ Compression charge = compression_model cost + primary_model cost.
- ✅ Mid-cycle upgrade defaults to next billing cycle. Immediate opt-in invalidates rollover and current credits.
- ✅ Exhausted paid users treated per tier config — typically same as free. Context locked back to exhaustion limit.

### Set B

- ✅ Compression compresses **full context** — no "recent N messages" retention. API; caller manages own window.
- ✅ Streaming + compression: TTFT delayed, stream shows nothing, spinner shown. Tokens flow once primary starts.
- ✅ Booster pack stacking: **separate pools**, order: Booster packs → Rollover → Sub credits. Highest priority fast first.
- ✅ RPM enforced **per user** (all keys combined).
- ✅ Rollover cap hit: **silent drop** + dashboard nudge.
- ✅ Public model list: frontend marketing page (no auth). `/v1/models` is key-gated + plan-filtered.
- ✅ Batch discount: **50% off final credit cost** (after all multipliers). Admin-configurable.
- ✅ Recharge flow: **cart/checkout** style.
- ✅ Consumer app: **integrated** with dashboard.

### Set C

- ✅ Log retention: request summary 30d, verbose/routing 15d. Users see own 30d activity (summarised).
- ✅ Streaming + queue: SSE stays open during queue wait. Heartbeat prevents timeout.
- ✅ Credit pre-reservation: estimated credits reserved; insufficient balance = rejected before queue.
- ✅ Multi-model / agentic: each provider call = separate billable event.
- ✅ Admin = role flag on `users` table. GitHub OAuth only (v1). Default admin = `vendouple`.
- ✅ Unauthenticated: cannot hit any API endpoint. Public model catalog is a frontend page only.

### Set D

- ✅ Demo key persists via **cookie (primary) + localStorage (secondary)**. If localStorage is cleared, the cookie restores the key on next load. Deleting both resets the demo session.
- ✅ Mobile and PC are **separate demo key namespaces** (`platform` enum). Cross-device sync requires account creation.
- ✅ Different browsers on the same device receive **independent demo keys** by design — no reconciliation without an account.
- ✅ Demo key inactivity threshold: **20 days with no requests → hard delete** (no soft-delete, no recovery). Cron-driven.
- ✅ Demo limits: **20 requests/day, 33k context cap, `demo`-tier models only**.
- ✅ Model dropdown order in chat app: **demo → free → standard → premium → premium+ → max → elite**.
- ✅ Consumer app current state: **barebones intermediary** (demo + redirect to dashboard). Authenticated chat via auto-resolved API key in Phase 5.
- ✅ Playground and roleplay features are **Phase 5**. Social/sharing features are Phase 6+.

### Set E

- ✅ **Provider API keys are `.env`-only** — never stored in DB. `providers` table holds only `env_key_prefix` to resolve keys at runtime.
- ✅ **Multi-key rotation per provider**: multiple `.env` keys (e.g. `OPENAI_KEY_1`, `OPENAI_KEY_2`) pooled and rotated round-robin; rate-limited keys flagged and skipped.
- ✅ **Four-page frontend architecture**: `index.html` (chat/demo), `users.html` (dashboard), `login.html` (OAuth intermediary), `admin.html` (admin panel).
- ✅ **`index.html` file split**: `index.js` owns UI logic, `app.js` is API talker only. Do not expand `index.html` scope until Phase 5.
- ✅ **Login flow**: `index.html` → `login.html` → GitHub OAuth → back to `index.html` → profile dropup → `users.html`.
- ✅ **Admin ↔ User view toggle**: single button for admin users to switch between admin panel and user dashboard view without logging out.
- ✅ **SQL query tool in admin**: SELECT by default; destructive queries require per-session override toggle. All queries logged to `admin_sql_query_logs`.
- ✅ **Provider capability priority** (when strict_params off): `streaming > image > tool_calling > reasoning > search > others`. Best coverage score wins; ties broken by speed rating.
- ✅ **Anonymous endpoint table on model cards**: providers labeled `Endpoint A`, `Endpoint B`, etc. — provider names never exposed to users.
- ✅ **Deprecation date on models**: once reached, model soft-disabled on frontend (greyed + tooltip); still API-accessible with deprecation warning header.
- ✅ **Speed rating convention**: Higher number = faster. Provider-specific `<PROVIDER_ENV>_SPEED` values in `.env` override DB defaults; free/demo traffic can prefer lower-speed providers while paid/fast-credit traffic prefers higher-speed providers.

### Set F

- ✅ **Provider adapters are per-provider** — one adapter module per provider family. Each handles its own rate limit format, error codes, and polling logic (async providers like image/video gen have their own `pollResult()` method). All adapters communicate with the central aggregator via a standard interface.
- ✅ **Error translation is adapter responsibility** — user-actionable errors (context length exceeded, tool calling unsupported, image not supported, invalid request) are translated and surfaced to the user with provider-neutral messages. Internal errors (overloaded, rate limited, auth failure) return a generic "Service temporarily unavailable." Raw provider error text never reaches the user.
- ✅ **Admin alerts are DB-only in v1** — written to `admin_notifications` table, shown via in-panel notification bell. No email notifications yet. Types: `provider_out_of_credits`, `provider_dead`, `provider_rate_limited_extended`, `system_alert`.
- ✅ **`routing_logs` key reference is obfuscated** — stores a `key_ref_hash` (short hash of the key used), not the key index or raw key. Sufficient for correlating key-specific issues in debugging. Also stores `user_id` and `provider_id` for cross-referencing.
- ✅ **`model_maker` is a FK table** — `model_makers` table with `id`, `name`, `slug`, `icon_url`, `description`, `website_url`. `models.model_maker_id` FK → `model_makers`. Enables icon+name dropdown in admin catalogue and beautiful filter UI for users.
- ✅ **Phase 7 provider priority** — decided at Phase 7 kickoff, not pre-planned.

---

## 28. Open TODOs

- [ ] **James:** Fill in tier pricing table in §7 (IDR/USD prices, credit amounts, priority values, accent colours).
- [ ] **James:** Finalise tier names (Free / Basic / Plus / Pro / Elite or similar).
- [ ] **James:** Decide which specific models are available on the `demo` tier.
- [ ] **James:** Define `.env` naming convention for multi-key providers (e.g. `OPENAI_KEY_1` / `OPENAI_KEY_2` assumed).
- [ ] Define heartbeat ping interval for queue-waiting SSE connections *(suggest: 15 seconds)*.
- [ ] Define per-request-type timeout thresholds *(suggest: chat ~30s, image ~120s, video ~300s)*.
- [ ] Confirm `ADMIN_GITHUB_HANDLES` format in `.env` — comma-separated list assumed.
- [ ] Decide if `referral_code` is generated on signup for all users or only on demand.
- [ ] **James:** Decide demo key cookie name and exact expiry duration *(suggest: `orchid_demo_key`, 30-day rolling expiry)*.
- [ ] Confirm demo inactivity cron schedule *(suggest: daily at 03:00 UTC)*.
- [ ] Define Phase 5 scope cut: which roleplay/playground features ship in Phase 5 vs Phase 6.
- [ ] Decide account deletion grace period: 14 days assumed — confirm if shorter/longer is preferred.
- [ ] Confirm username uniqueness rules (min length, allowed characters, reserved words like "admin", "orchid").
- [ ] Confirm Oracle driver mode: **thin** (no native deps, recommended for cloud ADB) vs **thick** (requires Instant Client). Thin mode preferred unless specific features require thick.
- [ ] Fill in `ORACLE_DB_CONNECTION_STRING` in `.env` once Oracle Cloud ADB instance is provisioned.
- [ ] Confirm SQL query tool scope: should read-only SELECT always be permitted, or require a separate role flag above `admin`?
- [ ] Decide param priority order: `streaming > image > tool_calling > reasoning > search` assumed — confirm or reorder.

---

*v3.1.1 — Provider free-eligibility system added. `<PROVIDER_ENV>_FREE=true|false` `.env` flag controls whether a provider can serve free/demo traffic. Free/demo routing now gates on `_FREE` eligibility only — speed is explicitly ignored. Routing decision tree updated (step 2c free-eligibility gate, steps 3–4 paid-only). Parameter handling rules updated to 503 if no free-eligible provider available. `.env` section updated with `_FREE` examples and comments.*

*v3.1.2 — **Booster pack expiry model corrected.** Credits no longer expire after purchase — they persist until consumed. `available_from`/`available_until` are store offer windows only (when the deal is purchasable), not credit countdown timers. `[⏳ 24 HOURS LEFT]` badge = store offer closing, not credits expiring. Removed `is_permanent`, `permanent_base_tier_id`, and `duration_days` fields from `booster_packs`. Removed `expires_at` from `user_booster_packs`. Rewrote pack invalidation section (plan-lock via `ignore_plan_lock` only). Fixed Free-tier lifecycle, Welcome Pack targeting row, checkout flow review items, credit transaction source enum, admin capabilities rows, and decision log. Header updated to v3.1.2.*

*v3.1.3 - **Updated M3E.** The M3E import script has been updated from 2.5.2 to 2.5.5. This update includes 2 new components: Content Pane and Breadcrumbs.
