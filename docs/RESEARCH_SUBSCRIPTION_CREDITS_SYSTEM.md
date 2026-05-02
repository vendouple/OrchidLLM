# OrchidLLM Subscription & Credits System — Comprehensive Research

> Generated from codebase analysis of `db/schema.sql`, `lib/credits.js`, `api/user/me.js`, `api/user/recharge.js`, `api/user/keys.js`, `api/admin/tiers.js`, `api/admin/recharge-packages.js`

---

## 1. Subscription Tiers

### 1.1 Database Schema (`tiers` table — `db/schema.sql:10-30`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | NUMBER (PK, identity) | auto | Primary key |
| `name` | VARCHAR2(100) | — | Display name (e.g., "Free", "Pro") — **UNIQUE** |
| `tier_name` | VARCHAR2(50) | — | Internal slug (e.g., "free", "pro") — **UNIQUE** |
| `tier_level` | VARCHAR2(50) | — | Legacy alias of tier_name — **UNIQUE** |
| `tier_code` | VARCHAR2(50) | — | Slugified code (from migration, not in schema.sql DDL but used in code) |
| `tier_definition_id` | NUMBER (FK) | — | Links to `tier_definitions` table (not in schema.sql DDL but used in code) |
| `sort_order` | NUMBER | 0 | Hierarchy ordering (lower = lower tier) |
| `price_idr` | NUMBER | 0 | Price in Indonesian Rupiah |
| `price_usd` | NUMBER | 0 | Price in USD — **EXISTS in schema but NOT used in any API code** |
| `monthly_credits` | NUMBER | 0 | Credits allocated per monthly cycle |
| `rollover_pct` | NUMBER | NULL | Percentage of remaining credits that roll over — **EXISTS in schema but NOT used in code** |
| `rollover_cap` | NUMBER | NULL | Absolute max rollover credits. NULL = unlimited, -1 = no rollover |
| `rollover_months` | — | — | **NOT in schema.sql DDL** but used in `api/admin/tiers.js` and `lib/credits.js` — controls how many months recharge credits last |
| `queue_priority_fast` | NUMBER | 0 | Queue priority for fast lane |
| `queue_priority_std` | NUMBER | 0 | Queue priority for standard lane |
| `queue_priority_exhausted` | NUMBER | 0 | Queue priority when credits exhausted (0 = block, >0 = allow with deprioritization) |
| `concurrent_requests` | NUMBER | 1 | Max concurrent API requests |
| `concurrent_batches` | NUMBER | 0 | Max concurrent batch requests |
| `batch_discount_pct` | NUMBER | NULL | Discount % for batch requests |
| `model_access_level` | VARCHAR2(50) | 'free' | Access level gate for models |
| `is_active` | NUMBER | 1 | Soft-delete flag |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Creation timestamp |

### 1.2 Tier Definitions Table (referenced but **NOT in schema.sql**)

The `tier_definitions` table is referenced extensively in `api/admin/tiers.js`, `lib/credits.js`, `api/user/recharge.js`, and `api/admin/recharge-packages.js`. It acts as a canonical tier registry that multiple `tiers` rows can link to via `tier_definition_id`.

**Inferred schema** (from code usage):
| Column | Type | Description |
|--------|------|-------------|
| `id` | NUMBER (PK) | Primary key |
| `tier_name` | VARCHAR2(50) | Canonical tier name |
| `tier_code` | VARCHAR2(50) | Slugified code |
| `display_name` | VARCHAR2(100) | Display name |
| `sort_order` | NUMBER | Hierarchy ordering |
| `is_active` | NUMBER | Active flag |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### 1.3 Admin Tier CRUD (`api/admin/tiers.js`)

- **GET**: Lists all tiers with `tier_definitions` join, ordered by `sort_order`
- **POST**: Creates tier with fields: `name`, `tierName`, `tierLevel`, `tierCode`, `sortOrder`, `priceIdr`, `monthlyCredits`, `rolloverCap`, `rolloverMonths`, `queuePriorityFast`, `queuePriorityStd`, `queuePriorityExhausted`, `concurrentRequests`, `concurrentBatches`, `batchDiscountPct`, `modelAccessLevel`, `isActive`
- **PUT**: Updates existing tier (same fields + `id`)
- **DELETE**: Soft-deletes (`is_active = 0`) — blocks if users are assigned

**⚠️ Note**: `price_usd` and `rollover_pct` exist in schema but are NOT handled by the admin CRUD API.

---

## 2. Credits System

### 2.1 User Credit Fields (`users` table — `db/schema.sql:39-55`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `credits_balance` | NUMBER | 0 | Current monthly credit balance |
| `credits_rollover` | NUMBER | 0 | Rolled-over credits from previous cycles |
| `billing_cycle_start` | TIMESTAMP | NULL | When current billing cycle started |
| `billing_cycle_end` | TIMESTAMP | NULL | When current billing cycle ends (= next billing date) |

### 2.2 Credit Deduction Flow (`lib/credits.js:149-277` — `deductCredits()`)

**Cost Calculation:**
```
baseCost = ceil((promptTokens × inMultiplier) + (completionTokens × outMultiplier))
```
- If cached: uses `cacheReadMultiplier` / `cacheWriteMultiplier` instead
- If batch: applies `batch_discount_pct` discount

**Deduction Priority Order:**
1. **Lower-tier recharge balances** — Recharge credits from tiers with `sort_order < user's tier sort_order`
2. **Rollover credits** (`credits_rollover`)
3. **Monthly credits** (`credits_balance`)
4. **Current-tier recharge balances** — Recharge credits from same tier
5. **Exhausted fallback** — If `queue_priority_exhausted > 0`, allows negative balance (deprioritized). If `= 0`, blocks request with `insufficient_credits`

**Return value:**
```js
{ allowed: boolean, cost: number, queuePriority: number, source: string }
```
- `source`: `'lower_tier_recharge'` | `'rollover'` | `'monthly'` | `'current_recharge'` | `'exhausted'`

### 2.3 Monthly Cycle Reset (`lib/credits.js:279-304` — `resetMonthlyCycle()`)

```js
newRollover = credits_rollover + credits_balance
if (rollover_cap === -1) newRollover = 0        // No rollover
else if (rollover_cap !== null && newRollover > rollover_cap) newRollover = rollover_cap

UPDATE users SET
    credits_balance = tier.monthly_credits,      // Refresh to tier's allocation
    credits_rollover = newRollover,               // Carry over (capped)
    billing_cycle_start = CURRENT_TIMESTAMP,
    billing_cycle_end = ADD_MONTHS(CURRENT_TIMESTAMP, 1)
```

**Key insight**: The rollover is `rollover_cap` (absolute number), NOT `rollover_pct` (percentage). The `rollover_pct` column exists in schema but is unused.

### 2.4 Recharge Application (`lib/credits.js:350-422` — `applyRecharge()`)

1. Validates package (active, not disabled, not expired)
2. Resolves target tier by `target_tier_definition_id` or `target_tier_name`
3. Gets `rollover_months` from target tier
4. Inserts into `user_recharge_balances` with `expires_at = now + rollover_months`

### 2.5 Downgrade Handling (`lib/credits.js:306-348` — `expireRechargesOnDowngrade()`)

When a user downgrades, all recharge balances from tiers with `sort_order > new_tier.sort_order` are deleted.

---

## 3. Recharge Packages

### 3.1 Schema (`recharge_packages` table — `db/schema.sql:65-85`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | NUMBER (PK) | auto | Primary key |
| `name` | VARCHAR2(100) | — | Package name |
| `description` | VARCHAR2(500) | — | Package description |
| `credits` | NUMBER | — | Credits included |
| `price_idr` | NUMBER | — | Price in IDR |
| `original_price_idr` | NUMBER | — | Original price before discount |
| `price_usd` | NUMBER | 0 | Price in USD — **EXISTS in schema but NOT used in API code** |
| `original_price_usd` | NUMBER | — | Original USD price — **EXISTS in schema but NOT used in API code** |
| `discount_pct` | NUMBER(5,2) | 0 | Discount percentage |
| `target_tier_name` | VARCHAR2(50) | — | Target tier name for filtering |
| `target_tier_definition_id` | — | — | **NOT in schema.sql DDL** but used in all recharge queries — FK to tier_definitions |
| `expiry_date` | TIMESTAMP | — | Package expiry |
| `is_disabled` | NUMBER(1) | 0 | Disabled flag |
| `discount_start_date` | TIMESTAMP | — | Discount window start |
| `discount_end_date` | TIMESTAMP | — | Discount window end |
| `is_active` | NUMBER | 1 | Active flag |
| `created_at` | TIMESTAMP | CURRENT_TIMESTAMP | Creation timestamp |
| `created_by` | VARCHAR2(255) | — | Creator |
| `updated_by` | VARCHAR2(255) | — | Last updater |
| `updated_at` | TIMESTAMP | CURRENT_TIMESTAMP | Last update |

### 3.2 User Recharge Balances (`user_recharge_balances` table — `db/schema.sql:92-104`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | NUMBER (PK) | Primary key |
| `user_id` | NUMBER (FK → users) | Owner |
| `tier_id` | NUMBER (FK → tiers) | Tier this recharge is associated with |
| `credits_remaining` | NUMBER | Remaining credits in this recharge |
| `purchased_at` | TIMESTAMP | Purchase timestamp |
| `expires_at` | TIMESTAMP | Expiry timestamp (NULL = never) |

### 3.3 User Recharge API (`api/user/recharge.js`)

**GET** — Lists available packages:
- Filters: `is_active = 1`, `is_disabled = 0`, not expired
- Tier filtering: Shows packages where `target_sort_order <= user_sort_order` (i.e., same or lower tier)
- Returns array of package objects with: `id`, `name`, `description`, `credits`, `priceIdr`, `originalPriceIdr`, `discountPct`, `targetTierName`, `expiryDate`, `isDisabled`, `isDiscountActive`, `tierDisplayName`

**POST** — Purchases a package:
- Validates package availability and tier eligibility
- Calls `applyRecharge(userId, packageId)`

### 3.4 Admin Recharge CRUD (`api/admin/recharge-packages.js`)

Full CRUD with: `name`, `description`, `credits`, `priceIdr`, `discountPct`, `targetTierName`, `expiryDate`, `isDisabled`, `discountStartDate`, `discountEndDate`, `isActive`

**⚠️ Note**: `price_usd` and `original_price_usd` exist in schema but are NOT handled by admin CRUD.

---

## 4. User API (`/api/user/me` — `api/user/me.js`)

### Response Structure:
```json
{
    "user": {
        "id": "NUMBER",
        "username": "string (from session)",
        "avatar": "string (from session)",
        "isAdmin": "boolean",
        "is_admin": "boolean"
    },
    "tier": {
        "id": "NUMBER",
        "name": "string (tier.name — display name)",
        "tierName": "string (tier.tier_name — internal name)",
        "level": "string (tier.tier_level)",
        "monthlyCredits": "number",
        "modelAccessLevel": "string"
    },
    "credits": {
        "balance": "number (credits_balance)",
        "rollover": "number (credits_rollover)",
        "billingCycleStart": "timestamp",
        "billingCycleEnd": "timestamp",
        "rechargeBalances": [
            {
                "id": "number",
                "tierId": "number",
                "tierName": "string",
                "tierLevel": "string",
                "remaining": "number",
                "expiresAt": "timestamp"
            }
        ]
    }
}
```

### Missing Fields (needed for Billing page):
- `tier.priceIdr` / `tier.priceUsd` — tier pricing
- `tier.rolloverCap` — rollover limit
- `tier.queuePriorityFast/Std/Exhausted` — queue priorities
- `tier.concurrentRequests` — concurrency limits
- `tier.batchDiscountPct` — batch discount
- `tier.sortOrder` — tier hierarchy position
- `credits.totalAvailable` — computed: balance + rollover + sum(recharge.remaining)
- `credits.nextBillingDate` — same as `billingCycleEnd` but not explicitly named
- `user.githubId` — for account info

---

## 5. API Keys (`api/user/keys.js`)

### Schema (`api_keys` table — `db/schema.sql:150-195`)

Key fields for user keys:
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | VARCHAR2(64) | — | SHA-256 hash of the key |
| `name` | VARCHAR2(100) | 'Untitled Key' | User-given name |
| `key_type` | VARCHAR2(20) | 'user' | 'demo', 'global', or 'user' |
| `user_id` | NUMBER (FK) | — | Owner |
| `rpm` | NUMBER | 5 | Requests per minute |
| `rpd` | NUMBER | 20 | Requests per day |
| `input_token_limit` | NUMBER | 10000 | Input token limit |
| `output_token_limit` | NUMBER | -1 | Output token limit (-1 = unlimited) |
| `daily_credit_limit` | NUMBER | -1 | Daily credit limit (-1 = disabled) |
| `monthly_credit_limit` | NUMBER | -1 | Monthly credit limit (-1 = disabled) |
| `overall_credit_limit` | NUMBER | -1 | Overall credit limit (-1 = disabled) |
| `credit_cap_amount` | NUMBER | -1 | Max credits per reset period (-1 = disabled) |
| `credit_cap_period` | VARCHAR2(20) | 'none' | 'daily', 'weekly', 'monthly', 'none' |
| `credit_cap_reset_at` | TIMESTAMP | — | When credit cap was last reset |
| `queue_priority` | NUMBER | 0 | 0 = lowest, -1 = highest |
| `providers` | VARCHAR2(4000) | — | JSON array of allowed providers |
| `allowed_models` | VARCHAR2(4000) | — | JSON array or '*' for wildcard |
| `expires_at` | TIMESTAMP | — | Key expiration |
| `is_active` | NUMBER | 1 | Active flag |
| `total_input_tokens` | NUMBER | 0 | Cumulative input tokens |
| `total_output_tokens` | NUMBER | 0 | Cumulative output tokens |

### User Keys API:
- **GET**: Returns `id`, `key`, `name`, `is_active`, `daily_credit_limit`, `monthly_credit_limit`, `overall_credit_limit`, `created_at`, `last_used`, `usage_count`, `total_input_tokens`, `total_output_tokens`
- **POST**: Creates key with `name`, `dailyLimit`, `monthlyLimit`, `overallLimit`. Max 5 keys per user.
- **PUT**: Updates `name`, `dailyLimit`, `monthlyLimit`, `overallLimit`
- **DELETE**: Hard delete

**⚠️ Note**: Many schema fields (`rpm`, `rpd`, `input_token_limit`, `output_token_limit`, `credit_cap_amount`, `credit_cap_period`, `queue_priority`, `providers`, `allowed_models`, `expires_at`) exist in schema but are NOT exposed in the user API.

---

## 6. Billing/Subscription Dates

### How it works:
- **No explicit `subscription_start` or `next_billing_date` field**
- Uses `billing_cycle_start` and `billing_cycle_end` on the `users` table
- `billing_cycle_end` effectively IS the next billing date
- Monthly refresh via `resetMonthlyCycle()`:
  - `billing_cycle_start = CURRENT_TIMESTAMP`
  - `billing_cycle_end = ADD_MONTHS(CURRENT_TIMESTAMP, 1)`
- The cycle is triggered externally (likely a cron job or admin action — not found in codebase)

### Credit Transaction Logging (`credit_transactions` table — `db/schema.sql:208-218`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | NUMBER (PK) | Primary key |
| `user_id` | NUMBER (FK) | User |
| `amount` | NUMBER | Credit amount (+ for add, - for deduct) |
| `type` | VARCHAR2(50) | Transaction type |
| `description` | VARCHAR2(500) | Description |
| `created_at` | TIMESTAMP | Timestamp |

**⚠️ Note**: This table exists in schema but is NOT used anywhere in the current codebase. The `deductCredits()` function does NOT log to this table.

---

## 7. Identified Bugs & Schema-Code Mismatches

### Critical:
1. **`rollover_months` missing from schema DDL** — Used in `api/admin/tiers.js` (INSERT/UPDATE) and `lib/credits.js` (`applyRecharge`) but NOT in `db/schema.sql` CREATE TABLE statement
2. **`target_tier_definition_id` missing from `recharge_packages` schema DDL** — Used in all recharge queries (`api/user/recharge.js`, `api/admin/recharge-packages.js`, `lib/credits.js`) but NOT in `db/schema.sql`
3. **`tier_definitions` table not in schema DDL** — Referenced in 6+ files but CREATE TABLE statement is missing from `db/schema.sql`
4. **`tier_code` missing from `tiers` schema DDL** — Used in `api/admin/tiers.js` but NOT in `db/schema.sql`

### Schema-Code Mismatches:
5. **`price_usd`** — In `tiers` and `recharge_packages` schema but NOT used in any API code
6. **`original_price_usd`** — In `recharge_packages` schema but NOT used in any API code
7. **`rollover_pct`** — In `tiers` schema but NOT used in any code (code uses `rollover_cap` and `rollover_months`)
8. **`credit_transactions` table** — Exists in schema but never written to by `deductCredits()` or `applyRecharge()`

### API Gaps:
9. **`/api/user/me`** — Missing tier pricing, rollover cap, queue priorities, concurrency limits
10. **`/api/user/keys`** — Missing `rpm`, `rpd`, token limits, credit cap, queue priority, providers, allowed_models, expires_at
11. **`/api/admin/tiers`** — Missing `price_usd` handling
12. **`/api/admin/recharge-packages`** — Missing `price_usd`, `original_price_usd` handling

---

## 8. End-to-End Flow Summary

```
User signs up (GitHub OAuth)
    → Created in `users` table with default tier_id
    → billing_cycle_start/end set

Monthly cycle:
    → resetMonthlyCycle() refreshes credits_balance to tier.monthly_credits
    → Remaining balance rolls over to credits_rollover (capped by rollover_cap)
    → billing_cycle_end advances by 1 month

API request:
    → deductCredits() calculates cost from token counts × model multipliers
    → Deducts from: lower-tier recharge → rollover → monthly → current-tier recharge → exhausted
    → Returns queue priority based on source

Recharge purchase:
    → applyRecharge() adds credits to user_recharge_balances
    → Credits expire based on tier's rollover_months
    → On downgrade, higher-tier recharges are deleted

Tier change:
    → Admin updates user's tier_id
    → expireRechargesOnDowngrade() cleans up incompatible recharges
    → Next monthly cycle uses new tier's monthly_credits
```
