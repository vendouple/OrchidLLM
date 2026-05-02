-- OrchidLLM Oracle DB Schema (Production - Migrations 002-006 Merged)
-- Run this in Oracle Cloud Autonomous DB
-- This is the complete schema with all required fields from the codebase

-- ============================================
-- Table: TIERS
-- Defines the available plans, pricing, and limits
-- ============================================

CREATE TABLE tiers (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL UNIQUE,
    tier_name VARCHAR2(50) NOT NULL UNIQUE,
    tier_level VARCHAR2(50) NOT NULL UNIQUE,
    sort_order NUMBER DEFAULT 0,
    price_idr NUMBER DEFAULT 0,
    price_usd NUMBER DEFAULT 0,               -- USD price for global market
    monthly_credits NUMBER DEFAULT 0,
    rollover_pct NUMBER,                       -- Percentage of remaining credits that roll over (e.g., 15 = 15%). NULL = no rollover
    rollover_cap NUMBER,                       -- Absolute max rollover credits (e.g., 50000). NULL = unlimited
    queue_priority_fast NUMBER DEFAULT 0,
    queue_priority_std NUMBER DEFAULT 0,
    queue_priority_exhausted NUMBER DEFAULT 0,
    concurrent_requests NUMBER DEFAULT 1,
    concurrent_batches NUMBER DEFAULT 0,
    batch_discount_pct NUMBER,
    model_access_level VARCHAR2(50) DEFAULT 'free',
    is_active NUMBER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tiers_sort_order ON tiers(sort_order);

-- ============================================
-- Table: USERS
-- Persistent users from GitHub OAuth
-- ============================================

CREATE TABLE users (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    github_id VARCHAR2(64) NOT NULL UNIQUE,
    github_username VARCHAR2(100),
    github_avatar VARCHAR2(500),
    tier_id NUMBER,
    is_admin NUMBER DEFAULT 0,
    credits_balance NUMBER DEFAULT 0,
    credits_rollover NUMBER DEFAULT 0,
    billing_cycle_start TIMESTAMP,
    billing_cycle_end TIMESTAMP,
    is_banned NUMBER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    
    CONSTRAINT fk_users_tier FOREIGN KEY (tier_id) REFERENCES tiers(id)
);

CREATE INDEX idx_users_github ON users(github_id);
CREATE INDEX idx_users_tier ON users(tier_id);

-- ============================================
-- Table: RECHARGE_PACKAGES
-- Credit top-ups (with expiry, discount, and tier targeting)
-- ============================================

CREATE TABLE recharge_packages (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL,
    description VARCHAR2(500),
    credits NUMBER NOT NULL,
    price_idr NUMBER NOT NULL,
    original_price_idr NUMBER,
    price_usd NUMBER DEFAULT 0,                -- USD price for global market
    original_price_usd NUMBER,                 -- Original USD price before discount
    discount_pct NUMBER(5,2) DEFAULT 0,
    target_tier_name VARCHAR2(50),
    expiry_date TIMESTAMP,
    is_disabled NUMBER(1) DEFAULT 0,
    discount_start_date TIMESTAMP,
    discount_end_date TIMESTAMP,
    is_active NUMBER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table: USER_RECHARGE_BALANCES
-- User purchased top-up balances
-- ============================================

CREATE TABLE user_recharge_balances (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id NUMBER NOT NULL,
    tier_id NUMBER NOT NULL,
    credits_remaining NUMBER DEFAULT 0,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    CONSTRAINT fk_recharge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_recharge_tier FOREIGN KEY (tier_id) REFERENCES tiers(id)
);

CREATE INDEX idx_recharge_user ON user_recharge_balances(user_id, expires_at);

-- ============================================
-- Table: USER_MODEL_PREFERENCES
-- Context routing preferences per user per model
-- ============================================

CREATE TABLE user_model_preferences (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id NUMBER NOT NULL,
    model_id VARCHAR2(255) NOT NULL,
    heavy_action VARCHAR2(10) DEFAULT 'RAW',
    massive_action VARCHAR2(10) DEFAULT 'BLOCK',
    worker_model_id VARCHAR2(255),
    compression_prompt CLOB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_model_pref UNIQUE (user_id, model_id)
);

-- ============================================
-- Table: ANNOUNCEMENTS
-- Admin broadcast messages (with banner, urgency, dismissal tracking)
-- ============================================

CREATE TABLE announcements (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR2(255) NOT NULL,
    content CLOB NOT NULL,
    type VARCHAR2(20) DEFAULT 'info',
    is_active NUMBER DEFAULT 1,
    is_banner NUMBER DEFAULT 0,
    is_urgent NUMBER DEFAULT 0,
    dismissible NUMBER DEFAULT 1,
    expires_at TIMESTAMP,
    read_by CLOB,    -- JSON array of github_ids who dismissed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(100)
);

-- ============================================
-- Table: API_KEYS
-- Stores all API keys (demo, global, and user)
-- ============================================

CREATE TABLE api_keys (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key VARCHAR2(64) NOT NULL UNIQUE,
    name VARCHAR2(100) DEFAULT 'Untitled Key',  -- User-given name for the key
    key_type VARCHAR2(20) DEFAULT 'user',        -- 'demo', 'global', or 'user'
    user_id NUMBER,                              -- Linked user for personal keys
    
    -- Rate Limits
    rpm NUMBER DEFAULT 5,                        -- Requests per minute
    rpd NUMBER DEFAULT 20,                       -- Requests per day
    
    -- Token Limits (-1 = unlimited/disabled)
    input_token_limit NUMBER DEFAULT 10000,
    output_token_limit NUMBER DEFAULT -1,
    
    -- Credit Limits (-1 = unlimited/disabled)
    daily_credit_limit NUMBER DEFAULT -1,
    monthly_credit_limit NUMBER DEFAULT -1,
    overall_credit_limit NUMBER DEFAULT -1,
    
    -- Credit Cap (per reset period)
    credit_cap_amount NUMBER DEFAULT -1,         -- Max credits per reset period (-1 = disabled)
    credit_cap_period VARCHAR2(20) DEFAULT 'none', -- 'daily', 'weekly', 'monthly', 'none'
    credit_cap_reset_at TIMESTAMP,               -- When the credit cap was last reset
    
    -- Queue System
    queue_priority NUMBER DEFAULT 0,             -- 0 = lowest, -1 = highest
    
    -- Access Control
    providers VARCHAR2(4000),                    -- JSON array: ['nvidia', 'pollinations']
    allowed_models VARCHAR2(4000),               -- JSON array or '*' for wildcard
    
    -- Metadata
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    last_used TIMESTAMP,
    usage_count NUMBER DEFAULT 0,
    is_active NUMBER DEFAULT 1,
    
    -- Token Usage Tracking
    total_input_tokens NUMBER DEFAULT 0,
    total_output_tokens NUMBER DEFAULT 0,
    
    CONSTRAINT fk_apikey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for fast lookup
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_active ON api_keys(is_active, expires_at);
CREATE INDEX idx_api_keys_type ON api_keys(key_type);
CREATE INDEX idx_apikey_user ON api_keys(user_id);

-- ============================================
-- Table: CREDIT_TRANSACTIONS
-- Tracks all credit additions and deductions
-- ============================================

CREATE TABLE credit_transactions (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id NUMBER NOT NULL,
    amount NUMBER NOT NULL,
    type VARCHAR2(50) NOT NULL,
    description VARCHAR2(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_credit_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id, created_at);

-- ============================================
-- Table: USAGE_LOGS
-- Tracks all API usage
-- ============================================

CREATE TABLE usage_logs (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier VARCHAR2(255) NOT NULL,
    api_key_id NUMBER,
    
    -- Request Details
    endpoint VARCHAR2(100) NOT NULL,
    model VARCHAR2(100),
    
    -- Token Tracking
    input_tokens NUMBER DEFAULT 0,
    output_tokens NUMBER DEFAULT 0,
    
    -- Anti-Abuse Tracking
    ip_address VARCHAR2(45),
    fingerprint_hash VARCHAR2(64),
    user_agent VARCHAR2(500),
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_usage_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Indexes for usage queries
CREATE INDEX idx_usage_identifier_date ON usage_logs(identifier, created_at);
CREATE INDEX idx_usage_api_key ON usage_logs(api_key_id);
CREATE INDEX idx_usage_fingerprint ON usage_logs(fingerprint_hash, created_at);
CREATE INDEX idx_usage_ip ON usage_logs(ip_address, created_at);

-- ============================================
-- Table: SESSIONS
-- GitHub OAuth sessions
-- ============================================

CREATE TABLE sessions (
    id VARCHAR2(64) PRIMARY KEY,
    github_id NUMBER,
    github_username VARCHAR2(100),
    github_avatar VARCHAR2(500),
    is_admin NUMBER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_accessed TIMESTAMP
);

CREATE INDEX idx_sessions_github ON sessions(github_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- Table: DEMO_SESSIONS
-- Tracks anonymous demo users by composite hash
-- ============================================

CREATE TABLE demo_sessions (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    composite_hash VARCHAR2(64) NOT NULL UNIQUE,
    fingerprint_hash VARCHAR2(64),
    ip_address VARCHAR2(45),
    user_agent VARCHAR2(500),
    api_key_id NUMBER,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    request_count NUMBER DEFAULT 0,
    is_blocked NUMBER DEFAULT 0,

    CONSTRAINT fk_demo_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX idx_demo_composite ON demo_sessions(composite_hash);
CREATE INDEX idx_demo_fingerprint ON demo_sessions(fingerprint_hash, is_blocked);
CREATE INDEX idx_demo_last_seen ON demo_sessions(last_seen);
CREATE INDEX idx_demo_blocked ON demo_sessions(is_blocked);

-- ============================================
-- Table: MODEL_CATALOG
-- Admin-managed model metadata and availability
-- Includes parameter-based pricing, caching, deprecation, tier access
-- ============================================

CREATE TABLE model_catalog (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category VARCHAR2(40) NOT NULL,
    model_id VARCHAR2(255) NOT NULL,
    display_name VARCHAR2(255) NOT NULL,
    description VARCHAR2(1000),
    context_window VARCHAR2(64),

    -- JSON arrays
    capabilities_json VARCHAR2(4000),
    tags_json VARCHAR2(4000),
    compatible_providers_json VARCHAR2(4000),
    supported_parameters CLOB,
    parameter_whitelist CLOB,
    available_tiers CLOB,

    -- Runtime/deprecation metadata
    timeout_ms NUMBER DEFAULT 60000,
    deprecates_at TIMESTAMP,
    deprecation_date TIMESTAMP,
    deprecation_note VARCHAR2(500),

    -- Routing / Multipliers
    model_access_level VARCHAR2(50) DEFAULT 'free',
    in_multiplier NUMBER DEFAULT 1.0,
    out_multiplier NUMBER DEFAULT 1.0,
    cache_read_multiplier NUMBER(10,6) DEFAULT 1.0,
    cache_write_multiplier NUMBER(10,6) DEFAULT 1.0,

    -- Flags
    is_pro NUMBER DEFAULT 0,
    supports_caching NUMBER(1) DEFAULT 0,
    supports_batch NUMBER DEFAULT 0,
    is_active NUMBER DEFAULT 1,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),

    CONSTRAINT uq_model_catalog_cat_model UNIQUE (category, model_id)
);

CREATE INDEX idx_model_catalog_cat_active ON model_catalog(category, is_active);
CREATE INDEX idx_model_catalog_deprecates ON model_catalog(deprecates_at);

-- ============================================
-- Table: MODEL_PROVIDER_MAPPINGS
-- Global model ID to provider model ID translation
-- ============================================

CREATE TABLE model_provider_mappings (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_catalog_id NUMBER NOT NULL,
    provider_name VARCHAR2(64) NOT NULL,
    provider_model_id VARCHAR2(255) NOT NULL,
    backend_model_id VARCHAR2(255),
    provider_context_window VARCHAR2(64),
    metadata_json CLOB,
    mapping_multipliers CLOB,
    priority NUMBER DEFAULT 0,
    is_active NUMBER(1) DEFAULT 1,
    supports_batch NUMBER DEFAULT 0,
    in_multiplier NUMBER,
    out_multiplier NUMBER,
    allowed_params_json CLOB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    updated_by VARCHAR2(255),

    CONSTRAINT fk_model_provider_mapping_model
        FOREIGN KEY (model_catalog_id) REFERENCES model_catalog(id),
    CONSTRAINT uq_model_provider_mapping
        UNIQUE (model_catalog_id, provider_name, provider_model_id)
);

CREATE INDEX idx_model_provider_map_model_active ON model_provider_mappings(model_catalog_id, is_active, priority);
CREATE INDEX idx_model_provider_map_provider_active ON model_provider_mappings(provider_name, is_active, priority);
CREATE INDEX idx_model_provider_map_provider_model ON model_provider_mappings(provider_name, provider_model_id, is_active);

-- ============================================
-- Table: PROVIDER_KEYS
-- Multiple upstream API keys per provider
-- ============================================

CREATE TABLE provider_keys (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name VARCHAR2(64) NOT NULL,
    key_name VARCHAR2(120) NOT NULL,
    api_key VARCHAR2(4000) NOT NULL,
    is_active NUMBER DEFAULT 1,
    priority NUMBER DEFAULT 0,

    usage_counter_type VARCHAR2(64) DEFAULT 'tokens',
    daily_limit NUMBER DEFAULT -1,
    minute_limit NUMBER DEFAULT -1,
    tokens_daily_limit NUMBER DEFAULT -1,
    units_daily_limit NUMBER DEFAULT -1,

    requests_today NUMBER DEFAULT 0,
    tokens_today NUMBER DEFAULT 0,
    units_today NUMBER DEFAULT 0,

    reset_interval VARCHAR2(20) DEFAULT 'daily',
    resets_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    last_used TIMESTAMP,
    last_error VARCHAR2(1000),
    last_rate_limit_json CLOB
);

CREATE INDEX idx_provider_keys_provider_active ON provider_keys(provider_name, is_active);
CREATE INDEX idx_provider_keys_priority ON provider_keys(provider_name, priority, last_used);

-- ============================================
-- Table: PROVIDER_USAGE_LOGS
-- Provider-level usage telemetry
-- ============================================

CREATE TABLE provider_usage_logs (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name VARCHAR2(64) NOT NULL,
    provider_key_id NUMBER,
    key_name VARCHAR2(120),
    endpoint VARCHAR2(120),
    model VARCHAR2(255),
    status_code NUMBER,

    prompt_tokens NUMBER DEFAULT 0,
    completion_tokens NUMBER DEFAULT 0,
    total_tokens NUMBER DEFAULT 0,
    usage_units NUMBER DEFAULT 0,
    usage_counter_type VARCHAR2(64),

    rate_limit_snapshot CLOB,
    identifier VARCHAR2(255),
    api_key_id NUMBER,
    error_message VARCHAR2(1000),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_provider_usage_key
        FOREIGN KEY (provider_key_id) REFERENCES provider_keys(id)
);

CREATE INDEX idx_provider_usage_provider_date ON provider_usage_logs(provider_name, created_at);
CREATE INDEX idx_provider_usage_key_date ON provider_usage_logs(provider_key_id, created_at);

-- ============================================
-- Table: REQUEST_QUEUE
-- Priority queue for endpoint-level scheduling.
-- ============================================

CREATE TABLE request_queue (
    id VARCHAR2(80) PRIMARY KEY,
    endpoint VARCHAR2(120) NOT NULL,
    identifier VARCHAR2(255),
    api_key_id NUMBER,
    model VARCHAR2(255),
    priority NUMBER DEFAULT 0,
    provider_name VARCHAR2(64),
    status VARCHAR2(32) DEFAULT 'queued',
    status_code NUMBER,
    error_message VARCHAR2(1000),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    heartbeat_at TIMESTAMP,

    CONSTRAINT fk_queue_api_key
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX idx_queue_status_priority ON request_queue(endpoint, status, priority, created_at);
CREATE INDEX idx_queue_provider_processing ON request_queue(provider_name, status, heartbeat_at);

-- ============================================
-- Table: ADMIN_USER_OPERATION_BATCHES
-- Tracks bulk admin operations on users
-- ============================================

CREATE TABLE admin_user_operation_batches (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_type VARCHAR2(50) NOT NULL,
    reason VARCHAR2(500),
    filters_json CLOB,
    payload_json CLOB,
    created_by VARCHAR2(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table: ADMIN_USER_OPERATION_LOGS
-- Per-user audit log for admin operations
-- ============================================

CREATE TABLE admin_user_operation_logs (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id NUMBER,
    user_id NUMBER,
    operation_type VARCHAR2(50),
    previous_tier_name VARCHAR2(100),
    new_tier_name VARCHAR2(100),
    previous_credits_balance NUMBER,
    new_credits_balance NUMBER,
    previous_credits_rollover NUMBER,
    new_credits_rollover NUMBER,
    status VARCHAR2(20),
    message VARCHAR2(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_batch FOREIGN KEY (batch_id) REFERENCES admin_user_operation_batches(id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_batch ON admin_user_operation_logs(batch_id);
CREATE INDEX idx_audit_user ON admin_user_operation_logs(user_id);
