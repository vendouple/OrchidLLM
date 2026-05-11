# OrchidLLM Database Schema Reference

> **Version:** v3.1  
> **Engine:** Oracle Cloud Autonomous Database (thin driver)

## Table Overview

| Table | Purpose | Retention |
|-------|---------|-----------|
| `system_settings` | Global key-value config | Permanent |
| `subscription_tiers` | Plan definitions (Free, Basic, Plus, etc.) | Permanent |
| `subscription_tier_billing_options` | Monthly/yearly billing availability per tier | Permanent |
| `users` | User accounts | Permanent (soft-delete) |
| `user_auth_providers` | GitHub/Google OAuth links | Permanent |
| `user_subscriptions` | Active plan per user | Permanent |
| `user_credits` | Current credit pools | Permanent |
| `user_credit_ledger` | Credit transaction history | Permanent |
| `booster_packs` | Purchasable credit packs | Permanent |
| `user_booster_packs` | Purchased boosters per user | Permanent |
| `providers` | Upstream API providers | Permanent |
| `model_makers` | Labs/orgs (OpenAI, Anthropic, etc.) | Permanent |
| `models` | Model catalog | Permanent |
| `model_providers` | Model↔Provider routing links | Permanent |
| `model_token_multipliers` | Context-tier pricing multipliers | Permanent |
| `api_keys` | User API keys (stored as SHA-256 hash) | Permanent |
| `demo_keys` | Anonymous demo keys (UUID) | 20-day inactivity purge |
| `request_queue` | Priority request queue | 24h after completion |
| `batch_requests` | Batch job queue | Permanent |
| `user_compression_settings` | Per-model compression prefs | Permanent |
| `user_context_tier_preferences` | Context tier unlock prefs | Permanent |
| `announcements` | Platform announcements/changelogs | Permanent |
| `user_dismissed_announcements` | User dismissed announcements | Permanent |
| `admin_notifications` | Provider health alerts | Permanent |
| `admin_sql_query_logs` | SQL query audit trail | Permanent |
| `request_logs` | Request summaries | 30 days |
| `routing_logs` | Detailed routing audit | 15 days |
| `referral_transactions` | Affiliate tracking | Permanent |

## Key Relationships

```
users ──┬── user_auth_providers
        ├── user_subscriptions ── subscription_tiers
        ├── user_credits
        ├── user_credit_ledger
        ├── user_booster_packs ── booster_packs
        ├── api_keys
        ├── request_queue
        ├── request_logs
        └── user_dismissed_announcements ── announcements

models ──┬── model_makers
         ├── model_providers ── providers
         └── model_token_multipliers

providers ── admin_notifications
```

## Credit System Tables

### `user_credits`
Single row per user tracking current balances:
- `credits_standard` — Monthly standard pool
- `credits_fast` — Monthly fast/priority pool
- `credits_rollover` — Accumulated rollover
- `credits_reserved` — Currently reserved for in-flight requests

### `user_credit_ledger`
Immutable audit trail of all credit transactions:
- `source` — `subscription`, `booster`, `reservation`, `reconcile`, `rollover`, `admin_adjustment`
- `amount` — Positive (credit) or negative (debit)
- `balance_after` — Running balance snapshot

### Depletion Order
1. Booster fast credits (highest priority pack first)
2. Booster standard credits
3. Rollover credits
4. Subscription fast credits
5. Subscription standard credits

## Provider Routing Tables

### `model_providers`
Maps each model to one or more upstream providers:
- `speed_priority` — `0` = fastest (sorted ASC)
- `status` — `active`, `rate_limited`, `out_of_credits`, `dead`, `disabled`
- `supports_params` — JSON of capability flags
- `rate_limit_until` — Timestamp for rate-limit backoff

### `providers`
Provider base config:
- `base_url` — Upstream API URL
- `env_key_prefix` — Resolves to `.env` keys at runtime (never stored in DB)
- `auth_type` — `bearer`, `header`, `query_param`

## Security Notes

- **API keys** stored as SHA-256 hash, never plaintext
- **Provider keys** in `.env` only, resolved by `env_key_prefix`
- **Routing logs** use `key_ref_hash` (obfuscated), never raw key
- **Users** soft-deleted (`is_deleted = 1`) with 14-day grace period
- **Demo keys** hard-deleted after 20 days of inactivity
