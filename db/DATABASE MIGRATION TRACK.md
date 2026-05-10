- The online database has been DROPPED and will be rebuilt from schema.sql
- Run schema.sql on a fresh Oracle Autonomous DB to recreate all tables
- After schema.sql, no additional migrations are needed (all migrations merged in)

## Schema Version: v2 (2026-05-02)


### What schema.sql creates:
- tier_definitions, tiers, users
- recharge_packages, user_recharge_balances
- announcements, api_keys
- credit_transactions, usage_logs
- sessions (stateless, for reference), demo_sessions
- model_catalog (legacy fallback), model_provider_mappings (legacy fallback)
- canonical_models (full columns: model_id, model_slug, display_name, name, category,
  context_window, default_context_window, timeout_ms, multipliers, deprecates_at,
  deprecation_date, expires_at, model_access_level, supports_caching/batch)
- canonical_model_tiers, canonical_model_supported_params
- canonical_model_param_whitelist, canonical_model_provider_routes
  (both context_window AND provider_context_window columns)
- canonical_model_route_params (canonical_route_id, support_mode, allowed_value)
- canonical_model_aliases (alias_model_id, is_primary_alias)
- canonical_model_multipliers (new: label/type/value array)
- user_model_preferences, provider_keys, provider_usage_logs
- request_queue, admin_user_operation_batches, admin_user_operation_logs
- system_settings (with seed data)

### Key fixes vs old schema:
- tier_definitions: has tier_name + tier_code (NOT display_name/tier_key)
- canonical_models: has model_slug, display_name, default_context_window,
  timeout_ms, all multipliers, deprecates_at, deprecation_note, expires_at,
  model_access_level, supports_caching, supports_batch
- canonical_model_provider_routes: has BOTH context_window AND provider_context_window
- canonical_model_route_params: uses canonical_route_id / support_mode / allowed_value
- canonical_model_aliases: uses alias_model_id / is_primary_alias
- tiers: has billing_periods, disable_buying, fast_credits, standard_credits
- users: has fast_credits_balance, billing_period, next_billing_date, subscription_status
- recharge_packages: has credit_type, fast_credits, standard_credits, price_usd, original_price_usd
- api_keys: has credit_cap_amount, credit_cap_period, name, model_access_level

## Migration History (all merged)
- 001-006: Original schema
- 007: tier_definitions + canonical_models tables
- 008: tier_code, rollover_months on tiers
- 009: category on canonical_models
- 010: MEGA_FIX — all missing columns, new tables
- 011: default_signup_tier_id and max_banners seed in system_settings

## Next migration: 012
