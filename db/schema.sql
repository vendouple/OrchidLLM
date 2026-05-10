-- OrchidLLM Complete Schema v2 (Rebuilt from codebase audit)
-- Run on Oracle Cloud Autonomous DB (fresh drop)

-- ── TIER_DEFINITIONS ────────────────────────────────────────────────────────
CREATE TABLE tier_definitions (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tier_name    VARCHAR2(50)  NOT NULL UNIQUE,
    tier_code    VARCHAR2(20)  NOT NULL UNIQUE,
    sort_order   NUMBER DEFAULT 0,
    is_active    NUMBER DEFAULT 1,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_td_sort   ON tier_definitions(sort_order);
CREATE INDEX idx_td_active ON tier_definitions(is_active);

-- ── TIERS ───────────────────────────────────────────────────────────────────
CREATE TABLE tiers (
    id                       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                     VARCHAR2(100) NOT NULL UNIQUE,
    tier_name                VARCHAR2(50)  NOT NULL UNIQUE,
    tier_level               VARCHAR2(50)  NOT NULL UNIQUE,
    tier_code                VARCHAR2(20),
    tier_definition_id       NUMBER,
    sort_order               NUMBER DEFAULT 0,
    -- Pricing
    price_idr                NUMBER DEFAULT 0,
    price_usd                NUMBER DEFAULT 0,
    -- Credits
    monthly_credits          NUMBER DEFAULT 0,
    fast_credits             NUMBER DEFAULT 0,
    standard_credits         NUMBER DEFAULT 0,
    -- Rollover
    rollover_pct             NUMBER,
    rollover_cap             NUMBER,
    rollover_months          NUMBER DEFAULT 0,
    -- Billing
    billing_periods          VARCHAR2(200) DEFAULT '["monthly"]',
    -- Queue
    queue_priority_fast      NUMBER DEFAULT 0,
    queue_priority_std       NUMBER DEFAULT 0,
    queue_priority_exhausted NUMBER DEFAULT 0,
    -- Concurrency
    concurrent_requests      NUMBER DEFAULT 1,
    concurrent_batches       NUMBER DEFAULT 0,
    batch_discount_pct       NUMBER,
    -- Access
    model_access_level       VARCHAR2(50) DEFAULT 'free',
    -- Flags
    disable_buying           NUMBER(1) DEFAULT 0,
    is_active                NUMBER DEFAULT 1,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tiers_td FOREIGN KEY (tier_definition_id) REFERENCES tier_definitions(id)
);
CREATE INDEX idx_tiers_sort ON tiers(sort_order);
CREATE INDEX idx_tiers_code ON tiers(tier_code);

-- ── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    github_id             VARCHAR2(64) NOT NULL UNIQUE,
    github_username       VARCHAR2(100),
    github_avatar         VARCHAR2(500),
    tier_id               NUMBER,
    is_admin              NUMBER DEFAULT 0,
    credits_balance       NUMBER DEFAULT 0,
    credits_rollover      NUMBER DEFAULT 0,
    fast_credits_balance  NUMBER DEFAULT 0,
    billing_cycle_start   TIMESTAMP,
    billing_cycle_end     TIMESTAMP,
    billing_period        VARCHAR2(20) DEFAULT 'monthly',
    next_billing_date     TIMESTAMP,
    subscription_status   VARCHAR2(20) DEFAULT 'active',
    is_banned             NUMBER DEFAULT 0,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen             TIMESTAMP,
    CONSTRAINT fk_users_tier FOREIGN KEY (tier_id) REFERENCES tiers(id)
);
CREATE INDEX idx_users_github ON users(github_id);
CREATE INDEX idx_users_tier   ON users(tier_id);

-- ── RECHARGE_PACKAGES ───────────────────────────────────────────────────────
CREATE TABLE recharge_packages (
    id                        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                      VARCHAR2(100) NOT NULL,
    description               VARCHAR2(500),
    credits                   NUMBER NOT NULL,
    credit_type               VARCHAR2(20) DEFAULT 'standard',
    fast_credits              NUMBER DEFAULT 0,
    standard_credits          NUMBER DEFAULT 0,
    price_idr                 NUMBER NOT NULL,
    original_price_idr        NUMBER,
    price_usd                 NUMBER DEFAULT 0,
    original_price_usd        NUMBER,
    discount_pct              NUMBER(5,2) DEFAULT 0,
    target_tier_name          VARCHAR2(50),
    target_tier_definition_id NUMBER,
    expiry_date               TIMESTAMP,
    is_disabled               NUMBER(1) DEFAULT 0,
    discount_start_date       TIMESTAMP,
    discount_end_date         TIMESTAMP,
    queue_priority_fast       NUMBER DEFAULT 0,
    queue_priority_std        NUMBER DEFAULT 0,
    is_active                 NUMBER DEFAULT 1,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by                VARCHAR2(255),
    updated_by                VARCHAR2(255),
    CONSTRAINT fk_rp_td FOREIGN KEY (target_tier_definition_id) REFERENCES tier_definitions(id)
);

-- ── USER_RECHARGE_BALANCES ──────────────────────────────────────────────────
CREATE TABLE user_recharge_balances (
    id                         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                    NUMBER NOT NULL,
    tier_id                    NUMBER NOT NULL,
    credits_remaining          NUMBER DEFAULT 0,
    fast_credits_remaining     NUMBER DEFAULT 0,
    standard_credits_remaining NUMBER DEFAULT 0,
    credit_type                VARCHAR2(20) DEFAULT 'standard',
    plan_tier_name             VARCHAR2(100),
    package_id                 NUMBER,
    purchased_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at                 TIMESTAMP,
    CONSTRAINT fk_urb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_urb_tier FOREIGN KEY (tier_id) REFERENCES tiers(id)
);
CREATE INDEX idx_urb_user ON user_recharge_balances(user_id, expires_at);

-- ── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
CREATE TABLE announcements (
    id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       VARCHAR2(255) NOT NULL,
    content     CLOB NOT NULL,
    type        VARCHAR2(20) DEFAULT 'info',
    is_active   NUMBER DEFAULT 1,
    is_banner   NUMBER DEFAULT 0,
    is_urgent   NUMBER DEFAULT 0,
    dismissible NUMBER DEFAULT 1,
    expires_at  TIMESTAMP,
    read_by     CLOB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by  VARCHAR2(100)
);

-- ── API_KEYS ────────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id                   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key                  VARCHAR2(64) NOT NULL UNIQUE,
    name                 VARCHAR2(100) DEFAULT 'Untitled Key',
    key_type             VARCHAR2(20) DEFAULT 'user',
    user_id              NUMBER,
    rpm                  NUMBER DEFAULT 5,
    rpd                  NUMBER DEFAULT 20,
    input_token_limit    NUMBER DEFAULT 10000,
    output_token_limit   NUMBER DEFAULT -1,
    daily_credit_limit   NUMBER DEFAULT -1,
    monthly_credit_limit NUMBER DEFAULT -1,
    overall_credit_limit NUMBER DEFAULT -1,
    credit_cap_amount    NUMBER DEFAULT -1,
    credit_cap_period    VARCHAR2(20) DEFAULT 'none',
    credit_cap_reset_at  TIMESTAMP,
    queue_priority       NUMBER DEFAULT 0,
    providers            VARCHAR2(4000),
    allowed_models       VARCHAR2(4000),
    model_access_level   VARCHAR2(50) DEFAULT 'all',
    expires_at           TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by           VARCHAR2(255),
    last_used            TIMESTAMP,
    usage_count          NUMBER DEFAULT 0,
    is_active            NUMBER DEFAULT 1,
    total_input_tokens   NUMBER DEFAULT 0,
    total_output_tokens  NUMBER DEFAULT 0,
    CONSTRAINT fk_ak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ak_active ON api_keys(is_active, expires_at);
CREATE INDEX idx_ak_type   ON api_keys(key_type);
CREATE INDEX idx_ak_user   ON api_keys(user_id);

-- ── CREDIT_TRANSACTIONS ─────────────────────────────────────────────────────
CREATE TABLE credit_transactions (
    id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     NUMBER NOT NULL,
    amount      NUMBER NOT NULL,
    type        VARCHAR2(50) NOT NULL,
    description VARCHAR2(500),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ct_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ct_user ON credit_transactions(user_id, created_at);

-- ── USAGE_LOGS ──────────────────────────────────────────────────────────────
CREATE TABLE usage_logs (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier       VARCHAR2(255) NOT NULL,
    api_key_id       NUMBER,
    endpoint         VARCHAR2(100) NOT NULL,
    model            VARCHAR2(100),
    input_tokens     NUMBER DEFAULT 0,
    output_tokens    NUMBER DEFAULT 0,
    ip_address       VARCHAR2(45),
    fingerprint_hash VARCHAR2(64),
    user_agent       VARCHAR2(500),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ul_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
CREATE INDEX idx_ul_id_date  ON usage_logs(identifier, created_at);
CREATE INDEX idx_ul_key      ON usage_logs(api_key_id);
CREATE INDEX idx_ul_fp       ON usage_logs(fingerprint_hash, created_at);
CREATE INDEX idx_ul_ip       ON usage_logs(ip_address, created_at);

-- ── SESSIONS (stateless — kept for reference/compat) ────────────────────────
CREATE TABLE sessions (
    id              VARCHAR2(64) PRIMARY KEY,
    github_id       NUMBER,
    github_username VARCHAR2(100),
    github_avatar   VARCHAR2(500),
    is_admin        NUMBER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP,
    last_accessed   TIMESTAMP
);
CREATE INDEX idx_sess_github  ON sessions(github_id);
CREATE INDEX idx_sess_expires ON sessions(expires_at);

-- ── DEMO_SESSIONS ───────────────────────────────────────────────────────────
CREATE TABLE demo_sessions (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    composite_hash   VARCHAR2(64) NOT NULL UNIQUE,
    fingerprint_hash VARCHAR2(64),
    ip_address       VARCHAR2(45),
    user_agent       VARCHAR2(500),
    api_key_id       NUMBER,
    first_seen       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen        TIMESTAMP,
    request_count    NUMBER DEFAULT 0,
    is_blocked       NUMBER DEFAULT 0,
    CONSTRAINT fk_ds_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
CREATE INDEX idx_ds_fp      ON demo_sessions(fingerprint_hash, is_blocked);
CREATE INDEX idx_ds_last    ON demo_sessions(last_seen);
CREATE INDEX idx_ds_blocked ON demo_sessions(is_blocked);

-- ── MODEL_CATALOG (legacy fallback) ─────────────────────────────────────────
CREATE TABLE model_catalog (
    id                       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category                 VARCHAR2(40) NOT NULL,
    model_id                 VARCHAR2(255) NOT NULL,
    display_name             VARCHAR2(255) NOT NULL,
    description              VARCHAR2(1000),
    context_window           VARCHAR2(64),
    capabilities_json        VARCHAR2(4000),
    tags_json                VARCHAR2(4000),
    compatible_providers_json VARCHAR2(4000),
    supported_parameters     CLOB,
    parameter_whitelist      CLOB,
    available_tiers          CLOB,
    timeout_ms               NUMBER DEFAULT 60000,
    deprecates_at            TIMESTAMP,
    deprecation_date         TIMESTAMP,
    deprecation_note         VARCHAR2(500),
    model_access_level       VARCHAR2(50) DEFAULT 'free',
    in_multiplier            NUMBER DEFAULT 1.0,
    out_multiplier           NUMBER DEFAULT 1.0,
    cache_read_multiplier    NUMBER(10,6) DEFAULT 1.0,
    cache_write_multiplier   NUMBER(10,6) DEFAULT 1.0,
    is_pro                   NUMBER DEFAULT 0,
    supports_caching         NUMBER(1) DEFAULT 0,
    supports_batch           NUMBER DEFAULT 0,
    is_active                NUMBER DEFAULT 1,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by               VARCHAR2(255),
    updated_by               VARCHAR2(255),
    CONSTRAINT uq_mc UNIQUE (category, model_id)
);
CREATE INDEX idx_mc_cat    ON model_catalog(category, is_active);
CREATE INDEX idx_mc_depr   ON model_catalog(deprecates_at);

-- ── MODEL_PROVIDER_MAPPINGS (legacy) ────────────────────────────────────────
CREATE TABLE model_provider_mappings (
    id                     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_catalog_id       NUMBER NOT NULL,
    provider_name          VARCHAR2(64) NOT NULL,
    provider_model_id      VARCHAR2(255) NOT NULL,
    backend_model_id       VARCHAR2(255),
    provider_context_window VARCHAR2(64),
    metadata_json          CLOB,
    mapping_multipliers    CLOB,
    priority               NUMBER DEFAULT 0,
    is_active              NUMBER(1) DEFAULT 1,
    supports_batch         NUMBER DEFAULT 0,
    in_multiplier          NUMBER,
    out_multiplier         NUMBER,
    allowed_params_json    CLOB,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by             VARCHAR2(255),
    updated_by             VARCHAR2(255),
    CONSTRAINT fk_mpm_mc FOREIGN KEY (model_catalog_id) REFERENCES model_catalog(id),
    CONSTRAINT uq_mpm UNIQUE (model_catalog_id, provider_name, provider_model_id)
);
CREATE INDEX idx_mpm_mc  ON model_provider_mappings(model_catalog_id, is_active, priority);
CREATE INDEX idx_mpm_prov ON model_provider_mappings(provider_name, is_active, priority);

-- ── CANONICAL_MODELS ────────────────────────────────────────────────────────
-- All columns required by lib/model-catalog.js AND api/admin/catalog.js
CREATE TABLE canonical_models (
    id                     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Identity (both columns kept for compat; model_slug = primary slug ID)
    model_id               VARCHAR2(255),
    model_slug             VARCHAR2(255),
    name                   VARCHAR2(255),
    display_name           VARCHAR2(255),
    category               VARCHAR2(40) DEFAULT 'text',
    description            VARCHAR2(1000),
    -- Context
    context_window         NUMBER,
    default_context_window NUMBER,
    -- Runtime
    timeout_ms             NUMBER DEFAULT 60000,
    -- Multipliers
    in_multiplier          NUMBER DEFAULT 1.0,
    out_multiplier         NUMBER DEFAULT 1.0,
    cache_read_multiplier  NUMBER(10,6) DEFAULT 1.0,
    cache_write_multiplier NUMBER(10,6) DEFAULT 1.0,
    -- Flags
    supports_caching       NUMBER(1) DEFAULT 0,
    supports_batch         NUMBER DEFAULT 0,
    model_access_level     VARCHAR2(50) DEFAULT 'free',
    is_active              NUMBER DEFAULT 1,
    -- Deprecation
    deprecation_date       TIMESTAMP,
    deprecates_at          TIMESTAMP,
    deprecation_note       VARCHAR2(500),
    expires_at             TIMESTAMP,
    -- Metadata
    metadata_json          CLOB,
    provider               VARCHAR2(100),
    input_price            NUMBER DEFAULT 0,
    output_price           NUMBER DEFAULT 0,
    -- Audit
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by             VARCHAR2(255),
    updated_by             VARCHAR2(255)
);
CREATE INDEX idx_cm_active   ON canonical_models(is_active);
CREATE INDEX idx_cm_cat      ON canonical_models(category, is_active);
CREATE INDEX idx_cm_slug     ON canonical_models(model_slug);
CREATE INDEX idx_cm_access   ON canonical_models(model_access_level);

-- ── CANONICAL_MODEL_TIERS ───────────────────────────────────────────────────
CREATE TABLE canonical_model_tiers (
    id                  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id  NUMBER NOT NULL,
    tier_definition_id  NUMBER NOT NULL,
    is_active           NUMBER DEFAULT 1,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cmt_m  FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT fk_cmt_td FOREIGN KEY (tier_definition_id) REFERENCES tier_definitions(id) ON DELETE CASCADE,
    CONSTRAINT uq_cmt    UNIQUE (canonical_model_id, tier_definition_id)
);
CREATE INDEX idx_cmt_m  ON canonical_model_tiers(canonical_model_id);
CREATE INDEX idx_cmt_td ON canonical_model_tiers(tier_definition_id);

-- ── CANONICAL_MODEL_SUPPORTED_PARAMS ────────────────────────────────────────
CREATE TABLE canonical_model_supported_params (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    param_name         VARCHAR2(100) NOT NULL,
    sort_order         NUMBER DEFAULT 0,
    is_active          NUMBER DEFAULT 1,
    CONSTRAINT fk_cmsp_m  FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_cmsp    UNIQUE (canonical_model_id, param_name)
);
CREATE INDEX idx_cmsp_m ON canonical_model_supported_params(canonical_model_id);

-- ── CANONICAL_MODEL_PARAM_WHITELIST ─────────────────────────────────────────
CREATE TABLE canonical_model_param_whitelist (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    param_name         VARCHAR2(100) NOT NULL,
    allowed_value      VARCHAR2(255) NOT NULL,
    sort_order         NUMBER DEFAULT 0,
    is_active          NUMBER DEFAULT 1,
    CONSTRAINT fk_cmpw_m FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE
);
CREATE INDEX idx_cmpw_m ON canonical_model_param_whitelist(canonical_model_id, param_name);

-- ── CANONICAL_MODEL_PROVIDER_ROUTES ─────────────────────────────────────────
-- Both context_window and provider_context_window kept (model-catalog.js uses provider_context_window)
CREATE TABLE canonical_model_provider_routes (
    id                      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id      NUMBER NOT NULL,
    provider_name           VARCHAR2(100) NOT NULL,
    provider_model_id       VARCHAR2(255) NOT NULL,
    route_label             VARCHAR2(100),
    context_window          NUMBER,
    provider_context_window NUMBER,
    timeout_ms              NUMBER DEFAULT 30000,
    priority                NUMBER DEFAULT 0,
    supports_batch          NUMBER DEFAULT 0,
    supports_caching        NUMBER DEFAULT 0,
    in_multiplier           NUMBER DEFAULT 1,
    out_multiplier          NUMBER DEFAULT 1,
    cache_read_multiplier   NUMBER DEFAULT 0.001,
    cache_write_multiplier  NUMBER DEFAULT 1,
    metadata_json           CLOB,
    expires_at              TIMESTAMP,
    deprecation_date        TIMESTAMP,
    deprecation_note        VARCHAR2(500),
    is_active               NUMBER DEFAULT 1,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by              VARCHAR2(255),
    updated_by              VARCHAR2(255),
    CONSTRAINT fk_cmpr_m FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE
);
CREATE INDEX idx_cmpr_m    ON canonical_model_provider_routes(canonical_model_id);
CREATE INDEX idx_cmpr_prov ON canonical_model_provider_routes(provider_name);
CREATE INDEX idx_cmpr_act  ON canonical_model_provider_routes(is_active);

-- ── CANONICAL_MODEL_ROUTE_PARAMS ─────────────────────────────────────────────
CREATE TABLE canonical_model_route_params (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_route_id NUMBER NOT NULL,
    param_name         VARCHAR2(100) NOT NULL,
    support_mode       VARCHAR2(20) DEFAULT 'allowed',
    allowed_value      VARCHAR2(255),
    sort_order         NUMBER DEFAULT 0,
    is_active          NUMBER DEFAULT 1,
    CONSTRAINT fk_cmrp_r FOREIGN KEY (canonical_route_id) REFERENCES canonical_model_provider_routes(id) ON DELETE CASCADE
);
CREATE INDEX idx_cmrp_r ON canonical_model_route_params(canonical_route_id);

-- ── CANONICAL_MODEL_ALIASES ─────────────────────────────────────────────────
CREATE TABLE canonical_model_aliases (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    alias_model_id     VARCHAR2(255) NOT NULL,
    is_primary_alias   NUMBER DEFAULT 0,
    notes              VARCHAR2(500),
    is_active          NUMBER DEFAULT 1,
    sort_order         NUMBER DEFAULT 0,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cma_m FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_cma   UNIQUE (canonical_model_id, alias_model_id)
);
CREATE INDEX idx_cma_m ON canonical_model_aliases(canonical_model_id);

-- ── CANONICAL_MODEL_MULTIPLIERS (new: array of multiplier definitions) ───────
CREATE TABLE canonical_model_multipliers (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_model_id NUMBER NOT NULL,
    multiplier_label   VARCHAR2(100) NOT NULL,
    multiplier_type    VARCHAR2(20) DEFAULT 'input',
    multiplier_value   NUMBER DEFAULT 1.0,
    sort_order         NUMBER DEFAULT 0,
    is_active          NUMBER(1) DEFAULT 1,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cmm_m  FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
    CONSTRAINT uq_cmm    UNIQUE (canonical_model_id, multiplier_label, multiplier_type)
);
CREATE INDEX idx_cmm_m ON canonical_model_multipliers(canonical_model_id, is_active);

-- ── USER_MODEL_PREFERENCES ──────────────────────────────────────────────────
CREATE TABLE user_model_preferences (
    id                 NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            NUMBER NOT NULL,
    model_id           VARCHAR2(255) NOT NULL,
    heavy_action       VARCHAR2(10) DEFAULT 'RAW',
    massive_action     VARCHAR2(10) DEFAULT 'BLOCK',
    worker_model_id    VARCHAR2(255),
    compression_prompt CLOB,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ump_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_ump   UNIQUE (user_id, model_id)
);

-- ── PROVIDER_KEYS ───────────────────────────────────────────────────────────
CREATE TABLE provider_keys (
    id                   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name        VARCHAR2(64) NOT NULL,
    key_name             VARCHAR2(120) NOT NULL,
    api_key              VARCHAR2(4000) NOT NULL,
    is_active            NUMBER DEFAULT 1,
    priority             NUMBER DEFAULT 0,
    usage_counter_type   VARCHAR2(64) DEFAULT 'tokens',
    daily_limit          NUMBER DEFAULT -1,
    minute_limit         NUMBER DEFAULT -1,
    tokens_daily_limit   NUMBER DEFAULT -1,
    units_daily_limit    NUMBER DEFAULT -1,
    requests_today       NUMBER DEFAULT 0,
    tokens_today         NUMBER DEFAULT 0,
    units_today          NUMBER DEFAULT 0,
    reset_interval       VARCHAR2(20) DEFAULT 'daily',
    resets_at            TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by           VARCHAR2(255),
    last_used            TIMESTAMP,
    last_error           VARCHAR2(1000),
    last_rate_limit_json CLOB
);
CREATE INDEX idx_pk_prov ON provider_keys(provider_name, is_active);
CREATE INDEX idx_pk_pri  ON provider_keys(provider_name, priority, last_used);

-- ── PROVIDER_USAGE_LOGS ─────────────────────────────────────────────────────
CREATE TABLE provider_usage_logs (
    id                  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name       VARCHAR2(64) NOT NULL,
    provider_key_id     NUMBER,
    key_name            VARCHAR2(120),
    endpoint            VARCHAR2(120),
    model               VARCHAR2(255),
    status_code         NUMBER,
    prompt_tokens       NUMBER DEFAULT 0,
    completion_tokens   NUMBER DEFAULT 0,
    total_tokens        NUMBER DEFAULT 0,
    usage_units         NUMBER DEFAULT 0,
    usage_counter_type  VARCHAR2(64),
    rate_limit_snapshot CLOB,
    identifier          VARCHAR2(255),
    api_key_id          NUMBER,
    error_message       VARCHAR2(1000),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pul_pk FOREIGN KEY (provider_key_id) REFERENCES provider_keys(id)
);
CREATE INDEX idx_pul_prov ON provider_usage_logs(provider_name, created_at);
CREATE INDEX idx_pul_key  ON provider_usage_logs(provider_key_id, created_at);

-- ── REQUEST_QUEUE ───────────────────────────────────────────────────────────
CREATE TABLE request_queue (
    id            VARCHAR2(80) PRIMARY KEY,
    endpoint      VARCHAR2(120) NOT NULL,
    identifier    VARCHAR2(255),
    api_key_id    NUMBER,
    model         VARCHAR2(255),
    priority      NUMBER DEFAULT 0,
    provider_name VARCHAR2(64),
    status        VARCHAR2(32) DEFAULT 'queued',
    status_code   NUMBER,
    error_message VARCHAR2(1000),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at    TIMESTAMP,
    finished_at   TIMESTAMP,
    heartbeat_at  TIMESTAMP,
    CONSTRAINT fk_rq_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
CREATE INDEX idx_rq_status ON request_queue(endpoint, status, priority, created_at);
CREATE INDEX idx_rq_prov   ON request_queue(provider_name, status, heartbeat_at);

-- ── ADMIN_USER_OPERATION_BATCHES ────────────────────────────────────────────
CREATE TABLE admin_user_operation_batches (
    id             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_type VARCHAR2(50) NOT NULL,
    reason         VARCHAR2(500),
    filters_json   CLOB,
    payload_json   CLOB,
    created_by     VARCHAR2(100),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── ADMIN_USER_OPERATION_LOGS ───────────────────────────────────────────────
CREATE TABLE admin_user_operation_logs (
    id                       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id                 NUMBER,
    user_id                  NUMBER,
    operation_type           VARCHAR2(50),
    previous_tier_name       VARCHAR2(100),
    new_tier_name            VARCHAR2(100),
    previous_credits_balance NUMBER,
    new_credits_balance      NUMBER,
    previous_credits_rollover NUMBER,
    new_credits_rollover     NUMBER,
    status                   VARCHAR2(20),
    message                  VARCHAR2(500),
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_aol_batch FOREIGN KEY (batch_id) REFERENCES admin_user_operation_batches(id),
    CONSTRAINT fk_aol_user  FOREIGN KEY (user_id)  REFERENCES users(id)
);
CREATE INDEX idx_aol_batch ON admin_user_operation_logs(batch_id);
CREATE INDEX idx_aol_user  ON admin_user_operation_logs(user_id);

-- ── SYSTEM_SETTINGS ─────────────────────────────────────────────────────────
CREATE TABLE system_settings (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    setting_key   VARCHAR2(100) NOT NULL UNIQUE,
    setting_value VARCHAR2(4000),
    description   VARCHAR2(500),
    is_active     NUMBER DEFAULT 1,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by    VARCHAR2(255)
);
CREATE INDEX idx_ss_key ON system_settings(setting_key);

-- ── SEED: system_settings ───────────────────────────────────────────────────
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('model_access_levels', '["free","plus","pro","max","elite"]', 'Ordered model access tiers');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('default_billing_period', 'monthly', 'Default billing period for new subscriptions');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('credit_types_enabled', 'fast,standard', 'Active credit types');
COMMIT;
