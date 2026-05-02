-- MIGRATION_004_redesign_foundation.sql
-- Purpose:
--   Add additive schema needed for the approved redesign without modifying
--   the live mirror in db/schema.sql.
--
-- Design goals encoded here:
--   1) Normalize tier targeting around named tiers while preserving current
--      tier_id-based relationships for compatibility.
--   2) Introduce relational model-management tables for canonical models,
--      provider routes, aliases, supported params, whitelist values, and
--      tier targeting instead of relying on JSON-heavy columns alone.
--   3) Add audit-ready tables for admin bulk user operations.
--   4) Prepare for removal of DB/admin provider-key management by adding
--      deprecation metadata first; destructive cleanup is handled separately.
--
-- Notes:
--   * This migration is intentionally additive and compatibility-safe.
--   * Existing tables such as model_catalog and model_provider_mappings are
--     left in place so application code can be migrated in a later phase.
--   * Oracle Autonomous DB compatible SQL only.

-- ============================================================
-- SECTION 1: Tier normalization and named-tier targeting
-- ============================================================

-- Canonical named tiers. This allows defaults like Free/Basic/Plus/Pro/Ultra/
-- Ultimate while supporting future custom tiers and preserving sort order.
CREATE TABLE tier_definitions (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tier_key VARCHAR2(100) NOT NULL,
    display_name VARCHAR2(100) NOT NULL,
    normalized_name VARCHAR2(100) NOT NULL,
    sort_order NUMBER DEFAULT 0 NOT NULL,
    is_system NUMBER(1) DEFAULT 0 NOT NULL,
    is_active NUMBER(1) DEFAULT 1 NOT NULL,
    description VARCHAR2(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),
    CONSTRAINT uq_tier_definitions_key UNIQUE (tier_key),
    CONSTRAINT uq_tier_definitions_name UNIQUE (normalized_name)
);

CREATE INDEX idx_tier_definitions_sort ON tier_definitions(sort_order, is_active);

-- Seed the approved default named tiers if they do not already exist.
INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'free', 'Free', 'FREE', 10, 1, 1, 'Default free tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'free');

INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'basic', 'Basic', 'BASIC', 20, 1, 1, 'Default paid basic tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'basic');

INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'plus', 'Plus', 'PLUS', 30, 1, 1, 'Default plus tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'plus');

INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'pro', 'Pro', 'PRO', 40, 1, 1, 'Default pro tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'pro');

INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'ultra', 'Ultra', 'ULTRA', 50, 1, 1, 'Default ultra tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'ultra');

INSERT INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
SELECT 'ultimate', 'Ultimate', 'ULTIMATE', 60, 1, 1, 'Default ultimate tier'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tier_definitions WHERE tier_key = 'ultimate');

-- Extend existing tiers with a stable FK to canonical named tiers.
ALTER TABLE tiers ADD (
    tier_definition_id NUMBER,
    tier_code VARCHAR2(100),
    updated_at TIMESTAMP,
    updated_by VARCHAR2(255)
);

ALTER TABLE tiers ADD CONSTRAINT fk_tiers_tier_definition
    FOREIGN KEY (tier_definition_id) REFERENCES tier_definitions(id);

CREATE INDEX idx_tiers_tier_definition ON tiers(tier_definition_id);
CREATE INDEX idx_tiers_tier_code ON tiers(tier_code);

-- Backfill tier_definition_id from existing tier_name values where possible.
UPDATE tiers t
SET tier_definition_id = (
        SELECT td.id
        FROM tier_definitions td
        WHERE UPPER(td.display_name) = UPPER(t.tier_name)
           OR UPPER(td.tier_key) = UPPER(t.tier_name)
           OR UPPER(td.normalized_name) = UPPER(t.tier_name)
    ),
    tier_code = LOWER(REPLACE(TRIM(t.tier_name), ' ', '_')),
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'MIGRATION_004'
WHERE t.tier_definition_id IS NULL;

-- Recharge packages should be able to target canonical named tiers directly,
-- while keeping target_tier_name for compatibility during rollout.
ALTER TABLE recharge_packages ADD (
    target_tier_definition_id NUMBER,
    updated_at TIMESTAMP,
    updated_by VARCHAR2(255)
);

ALTER TABLE recharge_packages ADD CONSTRAINT fk_recharge_packages_tier_def
    FOREIGN KEY (target_tier_definition_id) REFERENCES tier_definitions(id);

CREATE INDEX idx_recharge_packages_tier_def ON recharge_packages(target_tier_definition_id, is_active);

UPDATE recharge_packages rp
SET target_tier_definition_id = (
        SELECT td.id
        FROM tier_definitions td
        WHERE UPPER(td.display_name) = UPPER(rp.target_tier_name)
           OR UPPER(td.tier_key) = UPPER(rp.target_tier_name)
           OR UPPER(td.normalized_name) = UPPER(rp.target_tier_name)
    ),
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'MIGRATION_004'
WHERE rp.target_tier_name IS NOT NULL
  AND rp.target_tier_definition_id IS NULL;

-- ============================================================
-- SECTION 2: Unified relational model-management foundation
-- ============================================================

-- Canonical model records managed by admin in one product surface.
CREATE TABLE canonical_models (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category VARCHAR2(40) NOT NULL,
    canonical_key VARCHAR2(255) NOT NULL,
    model_slug VARCHAR2(255) NOT NULL,
    display_name VARCHAR2(255) NOT NULL,
    description VARCHAR2(1000),
    context_window NUMBER,
    max_output_tokens NUMBER,
    timeout_ms NUMBER DEFAULT 60000 NOT NULL,
    deprecates_at TIMESTAMP,
    expires_at TIMESTAMP,
    deprecation_note VARCHAR2(1000),
    supports_caching NUMBER(1) DEFAULT 0 NOT NULL,
    supports_batch NUMBER(1) DEFAULT 0 NOT NULL,
    cache_reads_supported NUMBER(1) DEFAULT 0 NOT NULL,
    cache_writes_supported NUMBER(1) DEFAULT 0 NOT NULL,
    in_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
    out_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
    cache_read_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
    cache_write_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
    status VARCHAR2(30) DEFAULT 'active' NOT NULL,
    is_active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),
    CONSTRAINT uq_canonical_models_key UNIQUE (canonical_key),
    CONSTRAINT uq_canonical_models_slug UNIQUE (model_slug)
);

CREATE INDEX idx_canonical_models_category ON canonical_models(category, is_active);
CREATE INDEX idx_canonical_models_status ON canonical_models(status, deprecates_at, expires_at);

-- Optional tier targeting per canonical model. Empty set means unrestricted.
CREATE TABLE canonical_model_tiers (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    tier_definition_id NUMBER NOT NULL,
    access_mode VARCHAR2(20) DEFAULT 'allow' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR2(255),
    CONSTRAINT fk_canonical_model_tiers_model
        FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT fk_canonical_model_tiers_tier
        FOREIGN KEY (tier_definition_id) REFERENCES tier_definitions(id),
    CONSTRAINT uq_canonical_model_tiers UNIQUE (canonical_model_id, tier_definition_id)
);

CREATE INDEX idx_canonical_model_tiers_lookup ON canonical_model_tiers(canonical_model_id, tier_definition_id);

-- Supported parameters are normalized so admin can manage them relationally.
CREATE TABLE canonical_model_supported_params (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    param_name VARCHAR2(100) NOT NULL,
    param_type VARCHAR2(50),
    is_required NUMBER(1) DEFAULT 0 NOT NULL,
    default_value VARCHAR2(4000),
    min_value NUMBER,
    max_value NUMBER,
    enum_values_json CLOB,
    notes VARCHAR2(1000),
    sort_order NUMBER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_model_supported_params_model
        FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_model_supported_param UNIQUE (canonical_model_id, param_name)
);

CREATE INDEX idx_model_supported_params_model ON canonical_model_supported_params(canonical_model_id, sort_order);

-- Whitelist values are split out so allowed values can be audited and edited.
CREATE TABLE canonical_model_param_whitelist (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supported_param_id NUMBER NOT NULL,
    allowed_value VARCHAR2(4000) NOT NULL,
    display_label VARCHAR2(255),
    sort_order NUMBER DEFAULT 0 NOT NULL,
    is_active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_model_param_whitelist_param
        FOREIGN KEY (supported_param_id) REFERENCES canonical_model_supported_params(id) ON DELETE CASCADE,
    CONSTRAINT uq_model_param_whitelist UNIQUE (supported_param_id, allowed_value)
);

CREATE INDEX idx_model_param_whitelist_param ON canonical_model_param_whitelist(supported_param_id, sort_order, is_active);

-- Provider routes represent concrete upstream routing choices for a canonical model.
CREATE TABLE canonical_model_provider_routes (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    provider_name VARCHAR2(64) NOT NULL,
    provider_model_id VARCHAR2(255) NOT NULL,
    backend_model_id VARCHAR2(255),
    route_label VARCHAR2(255),
    provider_context_window NUMBER,
    timeout_ms NUMBER,
    priority NUMBER DEFAULT 0 NOT NULL,
    supports_batch NUMBER(1) DEFAULT 0 NOT NULL,
    supports_caching NUMBER(1) DEFAULT 0 NOT NULL,
    cache_reads_supported NUMBER(1) DEFAULT 0 NOT NULL,
    cache_writes_supported NUMBER(1) DEFAULT 0 NOT NULL,
    in_multiplier NUMBER(18,6),
    out_multiplier NUMBER(18,6),
    cache_read_multiplier NUMBER(18,6),
    cache_write_multiplier NUMBER(18,6),
    metadata_json CLOB,
    is_active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),
    CONSTRAINT fk_model_provider_routes_model
        FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_model_provider_route UNIQUE (canonical_model_id, provider_name, provider_model_id)
);

CREATE INDEX idx_model_provider_routes_model ON canonical_model_provider_routes(canonical_model_id, is_active, priority);
CREATE INDEX idx_model_provider_routes_provider ON canonical_model_provider_routes(provider_name, is_active, priority);

-- Route-level parameter support/overrides.
CREATE TABLE canonical_model_route_params (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_route_id NUMBER NOT NULL,
    param_name VARCHAR2(100) NOT NULL,
    is_supported NUMBER(1) DEFAULT 1 NOT NULL,
    override_type VARCHAR2(50),
    override_default_value VARCHAR2(4000),
    override_min_value NUMBER,
    override_max_value NUMBER,
    override_enum_values_json CLOB,
    notes VARCHAR2(1000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_model_route_params_route
        FOREIGN KEY (provider_route_id) REFERENCES canonical_model_provider_routes(id) ON DELETE CASCADE,
    CONSTRAINT uq_model_route_param UNIQUE (provider_route_id, param_name)
);

CREATE INDEX idx_model_route_params_route ON canonical_model_route_params(provider_route_id);

-- Aliases let admin map legacy/public names to canonical models cleanly.
CREATE TABLE canonical_model_aliases (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    alias_value VARCHAR2(255) NOT NULL,
    alias_type VARCHAR2(30) DEFAULT 'public' NOT NULL,
    provider_name VARCHAR2(64),
    notes VARCHAR2(1000),
    is_primary NUMBER(1) DEFAULT 0 NOT NULL,
    is_active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),
    CONSTRAINT fk_model_aliases_model
        FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_model_alias_value UNIQUE (alias_value)
);

CREATE INDEX idx_model_aliases_model ON canonical_model_aliases(canonical_model_id, is_active);
CREATE INDEX idx_model_aliases_provider ON canonical_model_aliases(provider_name, is_active);

-- Optional compatibility bridge from legacy model_catalog rows to new canonical rows.
ALTER TABLE model_catalog ADD (
    canonical_model_id NUMBER,
    expires_at TIMESTAMP,
    status VARCHAR2(30),
    cache_reads_supported NUMBER(1),
    cache_writes_supported NUMBER(1)
);

ALTER TABLE model_catalog ADD CONSTRAINT fk_model_catalog_canonical_model
    FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id);

CREATE INDEX idx_model_catalog_canonical_model ON model_catalog(canonical_model_id);

ALTER TABLE model_provider_mappings ADD (
    canonical_route_id NUMBER,
    route_label VARCHAR2(255),
    timeout_ms NUMBER,
    cache_reads_supported NUMBER(1),
    cache_writes_supported NUMBER(1)
);

ALTER TABLE model_provider_mappings ADD CONSTRAINT fk_model_provider_mappings_route
    FOREIGN KEY (canonical_route_id) REFERENCES canonical_model_provider_routes(id);

CREATE INDEX idx_model_provider_mappings_route ON model_provider_mappings(canonical_route_id);

-- ============================================================
-- SECTION 3: Admin bulk user operations and auditability
-- ============================================================

-- Batch header for admin bulk actions such as suspend, plan changes, expiry
-- extensions, credit resets, and refund-style adjustments.
CREATE TABLE admin_user_operation_batches (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_type VARCHAR2(50) NOT NULL,
    operation_reason VARCHAR2(1000),
    requested_by_user_id NUMBER,
    requested_by_github_username VARCHAR2(100),
    request_source VARCHAR2(100),
    target_count NUMBER DEFAULT 0 NOT NULL,
    success_count NUMBER DEFAULT 0 NOT NULL,
    failure_count NUMBER DEFAULT 0 NOT NULL,
    status VARCHAR2(30) DEFAULT 'pending' NOT NULL,
    payload_json CLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT fk_admin_op_batches_user
        FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_admin_op_batches_status ON admin_user_operation_batches(status, created_at);
CREATE INDEX idx_admin_op_batches_type ON admin_user_operation_batches(operation_type, created_at);

-- Per-user audit rows for each bulk or single admin operation.
CREATE TABLE admin_user_operation_logs (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id NUMBER,
    user_id NUMBER NOT NULL,
    operation_type VARCHAR2(50) NOT NULL,
    operation_status VARCHAR2(30) DEFAULT 'applied' NOT NULL,
    previous_tier_id NUMBER,
    new_tier_id NUMBER,
    previous_tier_definition_id NUMBER,
    new_tier_definition_id NUMBER,
    previous_is_banned NUMBER(1),
    new_is_banned NUMBER(1),
    previous_billing_cycle_end TIMESTAMP,
    new_billing_cycle_end TIMESTAMP,
    previous_credits_balance NUMBER,
    new_credits_balance NUMBER,
    previous_credits_rollover NUMBER,
    new_credits_rollover NUMBER,
    credit_delta NUMBER,
    refund_amount NUMBER,
    expires_extension_days NUMBER,
    reason VARCHAR2(1000),
    metadata_json CLOB,
    performed_by_user_id NUMBER,
    performed_by_github_username VARCHAR2(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_admin_op_logs_batch
        FOREIGN KEY (batch_id) REFERENCES admin_user_operation_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_admin_op_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_op_logs_prev_tier
        FOREIGN KEY (previous_tier_id) REFERENCES tiers(id),
    CONSTRAINT fk_admin_op_logs_new_tier
        FOREIGN KEY (new_tier_id) REFERENCES tiers(id),
    CONSTRAINT fk_admin_op_logs_prev_tier_def
        FOREIGN KEY (previous_tier_definition_id) REFERENCES tier_definitions(id),
    CONSTRAINT fk_admin_op_logs_new_tier_def
        FOREIGN KEY (new_tier_definition_id) REFERENCES tier_definitions(id),
    CONSTRAINT fk_admin_op_logs_actor
        FOREIGN KEY (performed_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_admin_op_logs_user_date ON admin_user_operation_logs(user_id, created_at);
CREATE INDEX idx_admin_op_logs_batch ON admin_user_operation_logs(batch_id, created_at);
CREATE INDEX idx_admin_op_logs_type ON admin_user_operation_logs(operation_type, created_at);

-- ============================================================
-- SECTION 4: Provider-key deprecation markers
-- ============================================================

-- Keep existing provider_keys/provider_usage_logs readable for rollback and
-- historical audit, but mark them deprecated so later code can stop writing.
ALTER TABLE provider_keys ADD (
    deprecated_at TIMESTAMP,
    deprecation_note VARCHAR2(1000),
    replaced_by_config_source VARCHAR2(100)
);

UPDATE provider_keys
SET deprecated_at = CURRENT_TIMESTAMP,
    deprecation_note = 'Deprecated by MIGRATION_004: provider keys move to environment/config management.',
    replaced_by_config_source = 'env'
WHERE deprecated_at IS NULL;

ALTER TABLE provider_usage_logs ADD (
    provider_config_source VARCHAR2(100),
    provider_config_ref VARCHAR2(255)
);

UPDATE provider_usage_logs
SET provider_config_source = 'db'
WHERE provider_key_id IS NOT NULL
  AND provider_config_source IS NULL;

COMMIT;
