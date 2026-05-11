# OrchidLLM Backend API Reference

> **Version:** v3.0 — Phase 0+1 Foundation  
> **Runtime:** Vercel Serverless Functions (Node.js ≥ 18)  
> **Database:** Oracle Cloud ADB (thin driver)  
> **Queue/RPM:** Redis (Upstash) with in-memory fallback

---

## Authentication

All API requests require one of:
- **API Key** — `Authorization: Bearer sk-orch-...`
- **Demo Key** — `Authorization: Bearer <uuid>` or cookie `orchid_demo_key`
- **Session Cookie** — Set by GitHub OAuth login flow

### OAuth Flow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/github` | GET | Redirect to GitHub OAuth |
| `/api/auth/callback/github` | GET | OAuth callback — creates user, sets session cookie |
| `/api/auth/session` | GET | Check current session status |
| `/api/auth/logout` | POST | Clear session cookie |

---

## API Gateway (OpenAI-Compatible)

### Chat Completions

```
POST /api/v1/chat/completions
POST /api/chat/completions        (legacy alias)
```

**Headers:** `Authorization: Bearer sk-orch-...`

**Request body:** Standard OpenAI chat completions format.

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true
}
```

**Lifecycle:**
1. Auth → RPM check → Model access check → Context window check
2. Credit reservation (estimated cost)
3. Queue entry + priority-based dispatch
4. Provider routing (speed_priority ASC, fallback on failure)
5. Forward to upstream → stream/return response
6. Credit reconciliation (actual cost)
7. Logging (request_logs + routing_logs)

### Models

```
GET /api/v1/models       (auth required, plan-filtered)
GET /api/models          (public catalog, no auth)
```

### Stub Endpoints (Phase 3+)

| Endpoint | Status |
|----------|--------|
| `POST /api/images/generations` | 501 — Not yet implemented |
| `POST /api/audio/speech` | 501 — Not yet implemented |
| `POST /api/audio/transcriptions` | 501 — Not yet implemented |
| `POST /api/video/generations` | 501 — Not yet implemented |

---

## Demo Key System

```
GET /api/demo/key
```

- Returns existing demo key from cookie or creates a new one
- 30-day rolling cookie expiry
- 20 requests/day limit
- 33k context token cap
- Only `demo`-tier models accessible
- Inactive keys purged after 20 days (cron)

---

## Admin Endpoints

All admin endpoints require session auth with `role = 'admin'`.

### Subscription Tiers — `/api/admin/tiers`

| Method | Params | Description |
|--------|--------|-------------|
| GET | — | List all tiers |
| GET | `?id=N` | Single tier |
| POST | body | Create tier |
| PUT | `?id=N` + body | Update tier |
| DELETE | `?id=N` | Soft-delete (deactivate) |

### Providers — `/api/admin/providers`

| Method | Params | Description |
|--------|--------|-------------|
| GET | — | List all providers |
| GET | `?id=N` | Single provider |
| POST | body | Create provider |
| PUT | `?id=N` + body | Update provider |
| DELETE | `?id=N` | Disable provider |

### Models — `/api/admin/models`

Full CRUD with fields: `display_name`, `model_slug`, `access_tier`, `modality`, `context_window_tiers`, capability booleans, `max_output_tokens`, `public_description`, `deprecation_date`.

### Model Makers — `/api/admin/model-makers`

CRUD for labs/orgs: `name`, `slug`, `icon_url`, `description`, `website_url`, `sort_order`.

### Model↔Provider Mappings — `/api/admin/model-providers`

CRUD for routing config: `model_id`, `provider_id`, `provider_model_id`, `speed_priority`, `context_limit`, `supports_params` (JSON), `max_concurrent`, `status`.

Filter by `?model_id=N` to see all providers for a model.

### Announcements — `/api/admin/announcements`

Unified announcement/changelog system: `title`, `description`, `type` (announcement|changelog|both), `tone`, `version_tag`, `is_banner`, `banner_expires_at`.

### Booster Packs — `/api/admin/boosters`

Recharge pack CRUD: `name`, `credits_standard`, `credits_fast`, `price_idr`, `price_usd`, `duration_days`, `is_permanent`, `eligible_tiers` (JSON), `context_unlock_tiers` (JSON).

### System Settings — `/api/admin/settings`

Key-value config store. Query by `?key=setting_key`. Common keys:
- `default_signup_tier` — tier name for new users
- `demo_requests_per_day` — daily demo limit
- `demo_context_cap` — demo context token cap
- `batch_discount_rate` — batch request discount

### Users — `/api/admin/users`

| Method | Params | Description |
|--------|--------|-------------|
| GET | `?search=&limit=&offset=` | Search/list users |
| GET | `?id=N` | Full user detail (subscription + credits) |
| PUT | `?id=N` + body | Update role, tier, credits, suspend |

### Other Admin Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/stats` | Platform overview (users, subs, providers, models, keys, requests) |
| `GET /api/admin/notifications` | Admin alert bell (`?unread=1` for unread only) |
| `PUT /api/admin/notifications?id=N` | Mark notification read |
| `GET /api/admin/keys` | Platform-wide API key list (`?user_id=N` filter) |
| `GET /api/admin/demo-keys` | List demo keys |
| `DELETE /api/admin/demo-keys?id=UUID` | Hard-delete demo key |
| `GET /api/admin/logs` | Request/routing logs (`?type=routing&user_id=N&limit=&offset=`) |
| `POST /api/admin/sql` | Direct SQL query (destructive requires `?override=1`) |

---

## User Dashboard Endpoints

All require session auth.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user/profile` | GET | Full profile with subscription info |
| `/api/user/profile` | PUT | Update username, display_name, email, avatar |
| `/api/user/credits` | GET | Credit breakdown (standard, fast, rollover, boosters) |
| `/api/user/keys` | GET | List user's API keys |
| `/api/user/keys` | POST | Create new API key (returns plaintext once) |
| `/api/user/keys?id=N` | PUT | Update key config |
| `/api/user/keys?id=N` | DELETE | Delete key |
| `/api/user/keys?action=rotate&id=N` | POST | Rotate key (new secret, keep config) |
| `/api/user/subscription` | GET | Current plan details |
| `/api/user/logs` | GET | 30-day request history (paginated) |
| `/api/user/announcements` | GET | Active announcements (excluding dismissed) |
| `/api/user/announcements?action=dismiss&id=N` | POST | Dismiss announcement |

---

## Cron Jobs

Configured in `vercel.json`, protected by `CRON_SECRET`.

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/cleanup-demo` | Daily 03:00 UTC | Purge demo keys inactive 20+ days |
| `/api/cron/rollover` | Daily 04:00 UTC | End-of-cycle credit rollover + reset |
| `/api/cron/queue-worker` | Every 5 min | Recycle stale queue items, cleanup |

---

## Error Format

All errors follow OpenAI-compatible format:

```json
{
  "error": {
    "message": "Human-readable error description",
    "type": "error_code",
    "code": "error_code"
  }
}
```

Common codes: `unauthorized`, `forbidden`, `rate_limit`, `insufficient_credits`, `no_provider`, `model_not_found`, `model_not_allowed`, `context_limit_exceeded`, `not_implemented`.

---

## Credit System

**Depletion order:**
1. Booster fast credits (highest priority first)
2. Booster standard credits
3. Rollover credits
4. Subscription fast credits
5. Subscription standard credits

**Pre-reservation:** Credits estimated before queuing. On completion, actual cost reconciled. On failure, reservation released (no charge).
