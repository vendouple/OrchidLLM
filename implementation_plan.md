# Dynamic Context Routing & Orchestration Overhaul

This plan outlines the architecture and implementation steps to transform OneLLM's backend into a dynamic AI orchestration gateway, supporting tiered plans, global cost thresholds, user-defined context routing, and comprehensive API key management.

## User Review Required

> [!IMPORTANT]
> **Database Schema Changes**: This overhaul requires significant database schema changes (Oracle Autonomous DB). We will need to run migrations to add `users`, `user_model_preferences`, `tiers`, `recharge_packages`, `user_recharge_balances`, and `announcements` tables, and modify `api_keys` and `model_catalog`.
> **Batch Processing**: The batching discount implies an asynchronous completion system. We will design a polling endpoint system for users to retrieve batch results.

## Proposed Changes

---

### Database Schema Updates
We will introduce new tables and update existing ones to support the business logic.

#### [MODIFY] `db/schema.sql`
- **Users Table**: Create a persistent `users` table linked to GitHub OAuth. Fields: `github_id`, `tier_id`, `monthly_fast_credits_balance`, `monthly_std_credits_balance`, `billing_cycle_end`.
- **Tiers Definition**: Create a `tiers` table defining: `id`, `name` (Free, Basic, etc.), `level` (numeric value to track upgrades/downgrades), `monthly_fast_credits`, `monthly_std_credits`, `rollover_cap`, `queue_priority_fast`, `queue_priority_std`, `queue_priority_exhausted`, `concurrent_requests`, `concurrent_batches`, `batch_discount_pct`, `model_access_level`.
- **Recharge Packages**: Create `recharge_packages` table: `id`, `name`, `fast_credits`, `std_credits`, `price`, `target_tier_id`.
- **User Recharge Balances**: Create a new table `user_recharge_balances` to track recharges tied to specific tiers: `user_id`, `tier_id`, `fast_credits_remaining`, `std_credits_remaining`. (This supports retaining past tier recharges during an upgrade).
- **API Keys**: Add `user_id` to link keys to users. Add per-key limit tracking: `daily_credit_limit`, `monthly_credit_limit`, `overall_credit_limit`.
- **Model Catalog & Provider Mapping**: 
  - Admin will manually set `context_window` in both `model_catalog` and `model_provider_mappings` to handle different provider limits.
  - Add cost multipliers: `in_multiplier`, `out_multiplier`, `cache_read_multiplier`, `cache_write_multiplier`.
  - Add Context Threshold multipliers: `heavy_threshold_tokens`, `heavy_multiplier`, `massive_threshold_tokens`, `massive_multiplier`.
- **User Model Preferences**: New table mapping `user_id` + `model_id`.
  - `heavy_action`, `massive_action` (ENUM: `RAW`, `COMPRESS`, `BLOCK`)
  - `worker_model_id` (User chosen model for compression)
  - `compression_prompt` (User's custom suffix prompt)
- **Announcements**: New table `announcements` with `id`, `title`, `content`, `type`, `created_at`.

---

### Backend Logic & Aggregator

#### [NEW] `lib/context-router.js`
- Implement the **Dynamic Context Routing** engine.
- Logic:
  1. Count prompt tokens.
  2. Evaluate requested model's cost multipliers based on context size and cache status.
  3. If tokens > threshold, look up user's preference for that model.
  4. If `BLOCK`: Return 400 error immediately.
  5. If `RAW`: Apply the multiplier to the expected cost, queue with penalty, and proceed.
  6. If `COMPRESS`: 
     - Check if `worker_model_id` supports the context size based on admin-defined `context_window`.
     - Inject a pre-flight request to the chosen Worker model. System uses hardcoded prefix: `"You are a message summarization expert. Summarize all the messages below:\n"` + user custom prompt + payload.
     - Proceed to requested model with the compressed prompt.

#### [MODIFY] `providers/distributor.js`
- Integrate Tier-based queue prioritization. The priority value will now be dynamically assigned based on the active credits being used. 
  - If using retained lower-tier recharge credits (e.g., upgraded from Basic to Pro but using leftover Basic recharge), the queue priority will match the lower tier (Basic) for that request.

#### [MODIFY] `lib/provider-keys.js` & Credit Usage Tracking
- Integrate the credit deduction system. 1 credit = 1 token at 1.0x multiplier. Apply In/Out/Read/Write multipliers.
- Deduct in specific order: 
  1. **Retained Lower Tier Recharge** (e.g., Basic recharge remaining on Pro account) - *Only valid for Basic-compatible models.*
  2. **Monthly Fast** -> **Monthly Std** (from current active tier)
  3. **Current Tier Recharge Fast** -> **Current Tier Recharge Std**
- **Downgrade Invalidations**: If a user downgrades (e.g., Pro -> Basic, or Basic -> Free), all higher-tier recharge credits instantly EXPIRE.
- Support Batching request flag (e.g., `is_batch: true`), applying the tier-based discount to the credit deduction.

---

### API Endpoints

#### [NEW] `api/user/preferences.js`
- Endpoints to GET/PUT dynamic context routing settings per model. Includes validation to ensure the selected worker model supports the context size, returning a warning payload if it triggers a multiplier.

#### [NEW] `api/user/recharge.js`
- Endpoints to list available recharge packages for the user's tier, and mock endpoint to purchase/apply recharge packages.

#### [NEW] `api/user/keys.js`
- Endpoints to create, revoke, and manage the max 5 API keys with their specific limits.

#### [NEW] `api/admin/announcements.js`
- Endpoints for admins to create and list announcements.

#### [MODIFY] `api/models.js`
- Expose the Model Access Level requirement, token multipliers (in/out/cache_read/cache_write), and admin-defined Context Thresholds.
- This endpoint will supply the exact provider `context_window` limits so the frontend can filter the Worker Model dropdown.

## Verification Plan

### Automated Tests
- Integration scripts in a new `scratch/test_routing.js` file to simulate:
  - Token counting, compression routing, and exact credit cost calculations (in/out/read/write with multipliers).
  - Recharge expiration upon downgrade.
  - Using retained lower-tier recharge credits during an upgrade (ensuring lower queue priority and correct model access).

### Manual Verification
- **Admin Dashboard**: Verify setting model thresholds, `context_window`, multipliers, creating tiers, and creating recharge packages.
- **User Dashboard**: 
  - Verify worker model selection correctly filters based on admin-defined `context_window`.
  - Verify downgrade warning messages correctly display that recharge credits will expire.
- **Provider Fallback**: Force a provider failure and ensure the gateway silently routes to the next available provider.
