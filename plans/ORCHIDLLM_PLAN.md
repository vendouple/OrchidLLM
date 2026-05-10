# OrchidLLM — Comprehensive Product & Architecture Plan
> **Status:** Draft v2.0 | Last updated: 2026-05-10
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
21. [Announcement System](#21-announcement-system)
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
IF user is on FREE tier:
  → Strip all unsupported parameters silently
  → Route to any available provider

IF user is on PAID tier + strict_params = false (default):
  → Strip unsupported params, proceed
  → Add response header: X-OrchidLLM-Param-Dropped: <param_name>

IF user is on PAID tier + strict_params = true:
  → Only route to providers supporting ALL requested parameters
  → If no provider available → FAIL request (no credit charge)
```

`strict_params` is a paid-only account toggle. Default: `false`.

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
├── access_tier               enum: free|standard|premium|premium+|max|elite|admin
├── context_window_tiers      JSON: [{ tokens: 33000, required_plan: "basic" }, ...]
├── modality                  enum: text|image|audio|video|music|multimodal
├── is_active                 bool
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
│   ⚠️ REVERSED SCALE: 0 = fastest, higher = slower
│   Admin tooltip: "0 is fastest. Higher = slower fallback."
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

### Routing Decision Tree (per request)

```
1. Filter models matching requested model_slug
2. Filter model_providers by:
   a. status = active
   b. context_limit >= message_token_count
   c. (paid + strict_params) supports ALL required params
      OR (free / strict_params off) any available
3. Sort by speed_priority ASC (0 = fastest first)
4. Pick first provider where current_in_flight < max_concurrent
5. Increment current_in_flight
6. Dispatch request
7. On completion → decrement current_in_flight
```

### Context Window Routing Optimisation

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

---

## 7. Billing, Credits & Plans

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

This configuration lives in the **Models tab** of the dashboard. Each model expands to show compression config per context tier — model dropdown + prompt editor per tier.

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
├── duration_days             int (-1 = permanent while conditions met)
├── is_permanent              bool
├── permanent_base_tier_id    FK → subscription_tiers | null
│   Pack persists as long as user is on this tier or above
├── ignore_plan_lock          bool
│   true = pack stays even if user drops below base tier (promo packs)
├── max_purchases_per_user    int (-1 = unlimited)
├── max_total_purchases       int (-1 = unlimited)
├── available_from            timestamp | null
├── available_until           timestamp | null
└── is_active                 bool
```

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

### Permanent Pack Invalidation

```
IF is_permanent = true AND ignore_plan_lock = false:
  Pack VALID while:  user_plan >= permanent_base_tier_id
  Pack INVALID when: user_plan < permanent_base_tier_id

IF is_permanent = true AND ignore_plan_lock = true:
  Pack VALID regardless of plan changes (promo / new user packs)

Example:
  UPGRADE:   Basic → Plus   → pack still valid (Plus ≥ Basic)
  DOWNGRADE: Plus  → Basic  → pack still valid (Basic = purchase tier)
  DOWNGRADE: Basic → Free   → pack INVALIDATED (Free < Basic)
  LATER:     Free  → Basic  → pack RESTORED (back at purchase tier)
```

### Credit Survival on Plan Change

Booster pack credits are **never wiped** on plan upgrade/downgrade. They persist until exhausted or expired, subject to `ignore_plan_lock` rules above.

### Checkout Flow

Cart/checkout style (not one-click):
- User browses packs filtered to their current tier.
- Reviews: credit breakdown, queue priority, model access, expiry date.
- Referral/affiliate code field on checkout page.
- Confirms payment in IDR or USD.

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

### Mid-Cycle Upgrade Flow

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

| Log Type | Retention | Contents |
|----------|-----------|---------|
| `request_logs` | 30 days | Status, model, endpoint, credits charged, timestamp |
| `routing_logs` | 15 days | Provider chain, fallbacks, params stripped, queue wait ms, TTFT ms |
| User activity view | 30 days | Summarised — no payload content, no routing detail shown |

Detailed payload logs (request/response body) not stored by default. Admin can enable per-user with consent flag for debugging.

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
| Models | Public catalog + authenticated detail view |
| API Keys | CRUD + per-key config (limits, whitelist, expose_balance) |
| Billing | Plan status, credits breakdown, booster store, invoices (future) |
| Settings | Compression config per model, strict_params toggle, context preferences |
| Account | Profile, email, avatar, connected providers, active sessions, notification prefs, request history, danger zone (account deletion) — see §19a |
| Announcements | Banner list, expandable, dismissible |
| Logs | 30d request activity + 15d routing detail |

### Model Detail Sheet

Clicking a model opens a detail sheet showing:
- Provider(s), access tier, context tiers available.
- Token multipliers (input / output / cache read / cache write).
- User's enabled context tier toggles (sequential unlock enforced).
- Per-tier compression config: compression model dropdown + prompt editor (one per context tier, independently configurable).
- Budget action selector (Allow / Compress / Error) per context tier.
- Lock icons with upgrade CTA for tiers above the user's plan.

### Rollover Cap Nudge

Dashboard shows a persistent nudge when rollover cap is hit: *"You've hit your rollover cap — spend your credits before the cycle ends to avoid losing them."*

### Consumer App Integration

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

## 21. Announcement System

### Record (DB)

```
announcements
├── id
├── title                  text
├── description            markdown | null
├── tone                   enum: info | warning | error | success | neutral
├── is_banner              bool
├── banner_expires_at      timestamp | null
├── is_active              bool
├── created_at
└── created_by             FK → users (admin)
```

### Banner Rules

- Max **3 active banners** simultaneously (most recent 3 by `created_at` if more exist).
- Banners are **thin, unobtrusive** — single line: title + tone colour strip + dismiss button.
- Clicking banner → navigates to Announcements page → auto-expands clicked item.
- Dismiss → stored in `user_dismissed_announcements` → never shown again to that user.

### Bell Icon

- Located at bottom of sidebar/nav.
- Red badge count = undismissed announcements.
- Expands to preview list; click item to expand full description.
- Items with null or very short description display inline (no expand toggle needed).

---

## 22. Admin System

### Admin Role

`users.role = "admin"`. Same GitHub OAuth login flow. Role enforced by middleware on all `/admin` routes.

### Admin Capabilities

| Feature | Description |
|---------|-------------|
| Manual plan upgrades | Set user's tier, bypass billing |
| Provider management | Add/edit/disable providers, manage API keys at rest, view health |
| Tier configuration | Full CRUD on subscription tiers and all parameters |
| Booster pack management | Create / edit / expire packs |
| Model management | Add models, link providers, set multipliers, set access tiers |
| Announcement management | Create / expire banners and announcements |
| Pricing config | Base credit costs, multipliers, context tier prices, batch discount rate |
| User lookup | View user's plan, credits, keys, logs |
| Provider health dashboard | Real-time status, in-flight counts, rate limit expiry, out-of-credits alerts (>1 day flag) |
| Log viewer | Full routing detail (15d); users see only summarised activity |
| Affiliate settings | Referral rates *(future)* |

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
  source: sub | booster | rollover | reservation | reconcile | expiry,
  amount, balance_after, reference_id, created_at

subscription_tiers          (see §7)
subscription_tier_billing_options  (see §13)
booster_packs               (see §12)

user_booster_packs
  id, user_id, pack_id,
  purchased_at, expires_at,
  credits_standard_remaining, credits_fast_remaining,
  is_active, invalidated_at, invalidation_reason

models                      (see §5)

providers
  id, name, base_url, auth_type, auth_key_encrypted,
  status, notes, created_at

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

user_dismissed_announcements
  id, user_id, announcement_id, dismissed_at

announcements               (see §21)

request_logs
  id, user_id, api_key_id, model_id, provider_id,
  endpoint, status: success | fail,
  credits_charged, created_at
  [retained 30 days]

routing_logs
  id, request_id,
  providers_attempted: JSON,
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
- [ ] More provider integrations
- [ ] Admin analytics dashboard

---

## 27. Decision Log (Q&A Sets A–C)

### Set A
- ✅ Queue base priority `n` is DB-configured per tier — not hardcoded.
- ✅ Compression is sequential backend. TTFT slower; spinner shown client-side.
- ✅ Permanent packs survive upgrades; lost only on downgrade below purchase tier. `ignore_plan_lock` for promo exceptions.
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

---

## 28. Open TODOs

- [ ] **James:** Fill in tier pricing table in §7 (IDR/USD prices, credit amounts, priority values, accent colours).
- [ ] **James:** Finalise tier names (Free / Basic / Plus / Pro / Elite or similar).
- [ ] **James:** Decide which specific models are available on the `demo` tier.
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

---

*v2.2 — Oracle DB config, GitHub OAuth env vars, SESSION_SECRET documented. Added §19a Account Center (profile, history, deletion flow, session management). Added `user_auth_providers` multi-provider table. §19 Auth expanded with Google OAuth roadmap and account linking. §20 dashboard sections updated.*
