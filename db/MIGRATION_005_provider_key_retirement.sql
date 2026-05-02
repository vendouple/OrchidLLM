-- MIGRATION_005_provider_key_retirement.sql
-- Purpose:
--   Finalize database-side retirement of DB/admin-managed provider keys after
--   MIGRATION_004 introduced additive redesign tables.
--
-- What this migration does:
--   1) Preserves historical provider-key and provider-usage data in archive
--      tables for audit/reporting.
--   2) Removes foreign-key dependencies that keep legacy provider-key tables
--      in the active runtime path.
--   3) Drops legacy provider-key tables from the active schema so future code
--      cannot continue relying on DB/admin provider-key management.
--
-- Important rollout note:
--   Run this migration only after application/runtime code has been switched to
--   environment/config-based provider credentials. It is intentionally more
--   destructive than MIGRATION_004.

-- ============================================================
-- SECTION 1: Archive legacy provider-key data
-- ============================================================

CREATE TABLE provider_keys_archive AS
SELECT
    pk.id,
    pk.provider_name,
    pk.key_name,
    pk.api_key,
    pk.is_active,
    pk.priority,
    pk.usage_counter_type,
    pk.daily_limit,
    pk.minute_limit,
    pk.tokens_daily_limit,
    pk.units_daily_limit,
    pk.requests_today,
    pk.tokens_today,
    pk.units_today,
    pk.reset_interval,
    pk.resets_at,
    pk.created_at,
    pk.created_by,
    pk.last_used,
    pk.last_error,
    pk.last_rate_limit_json,
    pk.deprecated_at,
    pk.deprecation_note,
    pk.replaced_by_config_source,
    CURRENT_TIMESTAMP AS archived_at,
    'MIGRATION_005' AS archived_by
FROM provider_keys pk;

ALTER TABLE provider_keys_archive ADD CONSTRAINT pk_provider_keys_archive PRIMARY KEY (id);
CREATE INDEX idx_provider_keys_archive_provider ON provider_keys_archive(provider_name, archived_at);

CREATE TABLE provider_usage_logs_archive AS
SELECT
    pul.id,
    pul.provider_name,
    pul.provider_key_id,
    pul.key_name,
    pul.endpoint,
    pul.model,
    pul.status_code,
    pul.prompt_tokens,
    pul.completion_tokens,
    pul.total_tokens,
    pul.usage_units,
    pul.usage_counter_type,
    pul.rate_limit_snapshot,
    pul.identifier,
    pul.api_key_id,
    pul.error_message,
    pul.created_at,
    pul.provider_config_source,
    pul.provider_config_ref,
    CURRENT_TIMESTAMP AS archived_at,
    'MIGRATION_005' AS archived_by
FROM provider_usage_logs pul;

ALTER TABLE provider_usage_logs_archive ADD CONSTRAINT pk_provider_usage_logs_archive PRIMARY KEY (id);
CREATE INDEX idx_provider_usage_logs_archive_provider ON provider_usage_logs_archive(provider_name, created_at);
CREATE INDEX idx_provider_usage_logs_archive_key ON provider_usage_logs_archive(provider_key_id, created_at);

-- ============================================================
-- SECTION 2: Remove active-schema dependencies
-- ============================================================

-- provider_usage_logs depends on provider_keys via fk_provider_usage_key.
ALTER TABLE provider_usage_logs DROP CONSTRAINT fk_provider_usage_key;

-- ============================================================
-- SECTION 3: Drop legacy active tables
-- ============================================================

DROP TABLE provider_usage_logs;
DROP TABLE provider_keys;

COMMIT;
