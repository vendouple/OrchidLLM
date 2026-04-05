-- OrchidLLM Oracle DB Schema
-- Run this in Oracle Cloud Autonomous DB

-- ============================================
-- Table: API_KEYS
-- Stores all API keys (demo and global)
-- ============================================

CREATE TABLE api_keys (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key VARCHAR2(64) NOT NULL UNIQUE,
    name VARCHAR2(100) NOT NULL,
    key_type VARCHAR2(20) NOT NULL,        -- 'demo' or 'global'
    
    -- Rate Limits
    rpm NUMBER DEFAULT 5,                  -- Requests per minute
    rpd NUMBER DEFAULT 20,                 -- Requests per day
    
    -- Token Limits (-1 = unlimited/disabled)
    input_token_limit NUMBER DEFAULT 10000,
    output_token_limit NUMBER DEFAULT -1,
    
    -- Queue System (for future implementation)
    queue_priority NUMBER DEFAULT 0,       -- 0 = lowest, -1 = highest
    
    -- Access Control
    providers VARCHAR2(4000),              -- JSON array: ['nvidia', 'pollinations']
    allowed_models VARCHAR2(4000),         -- JSON array or '*' for wildcard
    
    -- Metadata
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR2(255),
    last_used TIMESTAMP,
    usage_count NUMBER DEFAULT 0,
    is_active NUMBER DEFAULT 1,
    
    -- Token Usage Tracking
    total_input_tokens NUMBER DEFAULT 0,
    total_output_tokens NUMBER DEFAULT 0
);

-- Indexes for fast lookup
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_active ON api_keys(is_active, expires_at);
CREATE INDEX idx_api_keys_type ON api_keys(key_type);

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
-- (fingerprint + IP + date) with fallback to
-- fingerprint_hash for VPN / new-day reconnection.
--
-- Keys expire after 15 days of inactivity
-- (enforced in app logic, not a DB constraint).
-- ============================================

CREATE TABLE demo_sessions (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Primary identity: fingerprint + IP + date combined hash
    composite_hash VARCHAR2(64) NOT NULL UNIQUE,
    -- Device fingerprint without IP/date — used for VPN reconnection
    fingerprint_hash VARCHAR2(64),
    ip_address VARCHAR2(45),
    user_agent VARCHAR2(500),
    api_key_id NUMBER,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Updated on every request; NULL until first use after creation
    last_seen TIMESTAMP,
    request_count NUMBER DEFAULT 0,
    is_blocked NUMBER DEFAULT 0,

    CONSTRAINT fk_demo_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Exact-match lookup (primary path)
CREATE INDEX idx_demo_composite ON demo_sessions(composite_hash);
-- Fallback lookup by device fingerprint (VPN / new-day reconnection)
CREATE INDEX idx_demo_fingerprint ON demo_sessions(fingerprint_hash, is_blocked);
-- Inactivity expiry scan
CREATE INDEX idx_demo_last_seen ON demo_sessions(last_seen);
CREATE INDEX idx_demo_blocked ON demo_sessions(is_blocked);

-- ============================================
-- Table: MODEL_CATALOG
-- Admin-managed model metadata and availability
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

    -- Runtime/deprecation metadata
    timeout_ms NUMBER DEFAULT 60000,
    deprecates_at TIMESTAMP,
    deprecation_note VARCHAR2(500),

    -- Flags
    is_pro NUMBER DEFAULT 0,
    supports_caching NUMBER DEFAULT 0,
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
    provider_context_window VARCHAR2(64),
    metadata_json CLOB,
    priority NUMBER DEFAULT 0,
    is_active NUMBER DEFAULT 1,

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
-- Multiple upstream API keys per provider, with
-- per-key rate-limit counters and priority.
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
-- Provider-level usage telemetry for admin dashboards.
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
-- Insert default demo key (optional)
-- ============================================

-- Uncomment to create a default demo key
-- INSERT INTO api_keys (key, name, key_type, rpm, rpd, input_token_limit, output_token_limit, queue_priority, created_by)
-- VALUES ('nobindes_default_demo_key', 'Default Demo Key', 'demo', 5, 20, 10000, -1, 0, 'system');

COMMIT;