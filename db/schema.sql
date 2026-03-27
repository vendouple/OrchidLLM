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
-- Anti-abuse tracking for demo users
-- ============================================

CREATE TABLE demo_sessions (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    composite_hash VARCHAR2(64) NOT NULL UNIQUE,
    fingerprint_hash VARCHAR2(64) NOT NULL,
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
CREATE INDEX idx_demo_fingerprint ON demo_sessions(fingerprint_hash);
CREATE INDEX idx_demo_blocked ON demo_sessions(is_blocked);

-- ============================================
-- Insert default demo key (optional)
-- ============================================

-- Uncomment to create a default demo key
-- INSERT INTO api_keys (key, name, key_type, rpm, rpd, input_token_limit, output_token_limit, queue_priority, created_by)
-- VALUES ('nobindes_default_demo_key', 'Default Demo Key', 'demo', 5, 20, 10000, -1, 0, 'system');

COMMIT;