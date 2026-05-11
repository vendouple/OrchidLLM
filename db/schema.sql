-- OrchidLLM Schema v3.1 — Aligned with ORCHIDLLM_PLAN.md v2.5
-- Run on Oracle Cloud ADB after DROP ALL TABLES
-- Nothing is hardcoded that should be a DB value.

-- ── SUBSCRIPTION_TIERS ───────────────────────────────────────────────────────
CREATE TABLE subscription_tiers (
    id                          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                        VARCHAR2(100) NOT NULL UNIQUE,
    display_color_token         VARCHAR2(100),           -- e.g. "tier-basic" → M3 color scheme
    sort_order                  NUMBER DEFAULT 0,
    -- Pricing
    price_idr_monthly           NUMBER DEFAULT 0,
    price_usd_monthly           NUMBER DEFAULT 0,
    price_idr_yearly            NUMBER DEFAULT 0,
    price_usd_yearly            NUMBER DEFAULT 0,
    -- Credits
    credits_standard_monthly    NUMBER DEFAULT 0,
    credits_fast_monthly        NUMBER DEFAULT 0,
    -- Queue Priority
    queue_priority_standard     NUMBER DEFAULT 0,
    queue_priority_fast         NUMBER DEFAULT 0,
    queue_priority_exhausted    NUMBER DEFAULT 0,        -- 0 = still queued; -999 = locked
    -- Rate Limits
    rpm_normal                  NUMBER DEFAULT 3,
    rpm_exhausted               NUMBER DEFAULT 0,        -- 0 = locked
    -- Concurrency
    max_concurrent_requests     NUMBER DEFAULT 1,        -- -1 = infinite
    max_concurrent_exhausted    NUMBER DEFAULT 0,
    -- Batch
    batch_queue_slots           NUMBER DEFAULT 0,        -- 0 = no access
    -- API Keys
    max_api_keys                NUMBER DEFAULT 1,
    -- Rollover
    supports_rollover           NUMBER(1) DEFAULT 0,
    rollover_percentage         NUMBER DEFAULT 0,        -- 0.0–1.0
    rollover_max_cap            NUMBER DEFAULT 0,
    -- Features
    supports_compression        NUMBER(1) DEFAULT 0,
    strict_params_option        NUMBER(1) DEFAULT 0,     -- can tier enable strict_params?
    -- Model Access
    model_access_tier           VARCHAR2(50) DEFAULT 'free', -- enum: free|standard|premium|premium+|max|elite
    -- Billing Cycles
    supports_monthly_billing    NUMBER(1) DEFAULT 1,
    supports_yearly_billing     NUMBER(1) DEFAULT 0,
    -- Exhaustion Behaviour
    exhaustion_model_access     VARCHAR2(50) DEFAULT 'locked', -- free_only|standard|locked
    exhaustion_context_lock     VARCHAR2(50) DEFAULT 'lock_to_base', -- lock_to_base|retain|custom
    exhaustion_batch_access     NUMBER(1) DEFAULT 0,
    exhaustion_message          VARCHAR2(500),
    -- Status
    is_active                   NUMBER(1) DEFAULT 1,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_st_sort   ON subscription_tiers(sort_order);
CREATE INDEX idx_st_active ON subscription_tiers(is_active);

-- ── SUBSCRIPTION_TIER_BILLING_OPTIONS ────────────────────────────────────────
CREATE TABLE subscription_tier_billing_options (
    id                  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tier_id             NUMBER NOT NULL,
    cycle               VARCHAR2(20) NOT NULL,  -- monthly|yearly|lifetime
    is_available        NUMBER(1) DEFAULT 1,
    discount_percentage NUMBER DEFAULT 0,
    discount_expires_at TIMESTAMP,
    CONSTRAINT fk_stbo_tier FOREIGN KEY (tier_id) REFERENCES subscription_tiers(id) ON DELETE CASCADE,
    CONSTRAINT uq_stbo UNIQUE (tier_id, cycle)
);

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username                VARCHAR2(100) NOT NULL UNIQUE,
    display_name            VARCHAR2(100),
    email                   VARCHAR2(255),
    avatar_url              VARCHAR2(500),
    role                    VARCHAR2(20) DEFAULT 'user',    -- user|admin
    strict_params           NUMBER(1) DEFAULT 0,
    -- Referral
    referred_by             NUMBER,
    referral_code           VARCHAR2(32) UNIQUE,
    -- Notification Preferences
    notification_prefs      CLOB DEFAULT '{"billing":true,"announcements":true,"newsletter":false}',
    -- Soft Delete
    is_deleted              NUMBER(1) DEFAULT 0,
    deleted_at              TIMESTAMP,
    deletion_scheduled_at   TIMESTAMP,
    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_referrer FOREIGN KEY (referred_by) REFERENCES users(id)
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role     ON users(role);
CREATE INDEX idx_users_deleted  ON users(is_deleted);
CREATE INDEX idx_users_referral ON users(referral_code);

-- ── USER_AUTH_PROVIDERS ──────────────────────────────────────────────────────
CREATE TABLE user_auth_providers (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          NUMBER NOT NULL,
    provider         VARCHAR2(20) NOT NULL,     -- github|google
    provider_user_id VARCHAR2(100) NOT NULL,
    email            VARCHAR2(255),
    linked_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uap_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_uap UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_uap_user     ON user_auth_providers(user_id);
CREATE INDEX idx_uap_provider ON user_auth_providers(provider, provider_user_id);

-- ── USER_SUBSCRIPTIONS ───────────────────────────────────────────────────────
CREATE TABLE user_subscriptions (
    id                   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              NUMBER NOT NULL UNIQUE,
    tier_id              NUMBER NOT NULL,
    status               VARCHAR2(30) DEFAULT 'active', -- active|cancelled|expired|pending_upgrade
    billing_cycle        VARCHAR2(20) DEFAULT 'monthly',
    currency             VARCHAR2(10) DEFAULT 'IDR',
    current_period_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_period_end   TIMESTAMP,
    pending_tier_id      NUMBER,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_us_user FOREIGN KEY (user_id)          REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_us_tier FOREIGN KEY (tier_id)          REFERENCES subscription_tiers(id),
    CONSTRAINT fk_us_ptier FOREIGN KEY (pending_tier_id) REFERENCES subscription_tiers(id)
);
CREATE INDEX idx_us_user ON user_subscriptions(user_id);
CREATE INDEX idx_us_tier ON user_subscriptions(tier_id);

-- ── USER_CREDITS ─────────────────────────────────────────────────────────────
CREATE TABLE user_credits (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          NUMBER NOT NULL UNIQUE,
    credits_standard NUMBER DEFAULT 0,
    credits_fast     NUMBER DEFAULT 0,
    credits_rollover NUMBER DEFAULT 0,
    credits_reserved NUMBER DEFAULT 0,
    last_updated     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_uc_user ON user_credits(user_id);

-- ── USER_CREDIT_LEDGER ───────────────────────────────────────────────────────
CREATE TABLE user_credit_ledger (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       NUMBER NOT NULL,
    source        VARCHAR2(30) NOT NULL, -- sub|booster|rollover|reservation|reconcile|expiry|admin
    amount        NUMBER NOT NULL,
    balance_after NUMBER NOT NULL,
    reference_id  VARCHAR2(100),
    notes         VARCHAR2(500),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ucl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ucl_user ON user_credit_ledger(user_id, created_at);

-- ── BOOSTER_PACKS ────────────────────────────────────────────────────────────
CREATE TABLE booster_packs (
    id                      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                    VARCHAR2(100) NOT NULL,
    description             VARCHAR2(500),
    eligible_tiers          CLOB DEFAULT '[]',          -- JSON array of tier IDs; empty = all
    price_idr               NUMBER NOT NULL,
    price_usd               NUMBER DEFAULT 0,
    credits_standard        NUMBER DEFAULT 0,
    credits_fast            NUMBER DEFAULT 0,
    queue_priority_standard NUMBER DEFAULT 0,
    queue_priority_fast     NUMBER DEFAULT 0,
    model_access_tier       VARCHAR2(50) DEFAULT 'free',
    context_unlock_tiers    CLOB DEFAULT '[]',
    duration_days           NUMBER DEFAULT -1,           -- -1 = permanent while conditions met
    is_permanent            NUMBER(1) DEFAULT 0,
    permanent_base_tier_id  NUMBER,
    ignore_plan_lock        NUMBER(1) DEFAULT 0,
    max_purchases_per_user  NUMBER DEFAULT -1,
    max_total_purchases     NUMBER DEFAULT -1,
    available_from          TIMESTAMP,
    available_until         TIMESTAMP,
    is_active               NUMBER(1) DEFAULT 1,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bp_base_tier FOREIGN KEY (permanent_base_tier_id) REFERENCES subscription_tiers(id)
);
CREATE INDEX idx_bp_active ON booster_packs(is_active);

-- ── USER_BOOSTER_PACKS ───────────────────────────────────────────────────────
CREATE TABLE user_booster_packs (
    id                        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                   NUMBER NOT NULL,
    pack_id                   NUMBER NOT NULL,
    purchased_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at                TIMESTAMP,
    credits_standard_remaining NUMBER DEFAULT 0,
    credits_fast_remaining    NUMBER DEFAULT 0,
    is_active                 NUMBER(1) DEFAULT 1,
    invalidated_at            TIMESTAMP,
    invalidation_reason       VARCHAR2(200),
    CONSTRAINT fk_ubp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ubp_pack FOREIGN KEY (pack_id) REFERENCES booster_packs(id)
);
CREATE INDEX idx_ubp_user   ON user_booster_packs(user_id, is_active);
CREATE INDEX idx_ubp_expiry ON user_booster_packs(expires_at, is_active);

-- ── PROVIDERS ────────────────────────────────────────────────────────────────
CREATE TABLE providers (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             VARCHAR2(100) NOT NULL UNIQUE,
    base_url         VARCHAR2(500) NOT NULL,
    auth_type        VARCHAR2(30) DEFAULT 'bearer',
    env_key_prefix   VARCHAR2(100),                     -- preferred env var prefix/name; e.g. OPENAI_KEY resolves OPENAI_KEY or OPENAI_KEY_1
    auth_key_env     VARCHAR2(100),                     -- legacy alias for env_key_prefix; retained for admin/backward compatibility
    status           VARCHAR2(30) DEFAULT 'active',     -- active|rate_limited|out_of_credits|dead|disabled
    rate_limit_until TIMESTAMP,
    notes            CLOB,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_prov_status ON providers(status);

-- ── MODEL_MAKERS ──────────────────────────────────────────────────────────────
-- Visible model labs/makers only (OpenAI, Anthropic, Google, etc.); never routing providers/aggregators.
CREATE TABLE model_makers (
    id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR2(100) NOT NULL UNIQUE,
    slug         VARCHAR2(100) NOT NULL UNIQUE,
    icon_url     VARCHAR2(500),
    description  CLOB,
    website_url  VARCHAR2(500),
    sort_order   NUMBER DEFAULT 0,
    is_active    NUMBER(1) DEFAULT 1,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mm_slug   ON model_makers(slug);
CREATE INDEX idx_mm_active ON model_makers(is_active, sort_order);

-- ── MODELS ───────────────────────────────────────────────────────────────────
CREATE TABLE models (
    id                        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name              VARCHAR2(255) NOT NULL,
    model_maker_id            NUMBER,                      -- FK to visible lab/maker; not provider/aggregator
    model_slug                VARCHAR2(255) NOT NULL UNIQUE,
    access_tier               VARCHAR2(30) DEFAULT 'free', -- demo|free|standard|premium|premium+|max|elite|admin
    modality                  VARCHAR2(30) DEFAULT 'text', -- text|image|audio|video|music|multimodal
    context_window_tiers      CLOB DEFAULT '[]',           -- JSON: [{tokens,required_plan}]
    supports_streaming        NUMBER(1) DEFAULT 1,
    supports_vision           NUMBER(1) DEFAULT 0,
    supports_reasoning        NUMBER(1) DEFAULT 0,
    supports_search           NUMBER(1) DEFAULT 0,
    supports_caching          NUMBER(1) DEFAULT 0,
    supports_function_calling NUMBER(1) DEFAULT 0,
    max_output_tokens         NUMBER,
    public_description        CLOB,
    deprecation_date          TIMESTAMP,
    is_active                 NUMBER(1) DEFAULT 1,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_models_maker FOREIGN KEY (model_maker_id) REFERENCES model_makers(id)
);
CREATE INDEX idx_models_slug   ON models(model_slug);
CREATE INDEX idx_models_tier   ON models(access_tier, is_active);
CREATE INDEX idx_models_active ON models(is_active);
CREATE INDEX idx_models_maker  ON models(model_maker_id);

-- ── MODEL_PROVIDERS ──────────────────────────────────────────────────────────
-- Maps each model to upstream providers with routing metadata
CREATE TABLE model_providers (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id         NUMBER NOT NULL,
    provider_id      NUMBER NOT NULL,
    provider_model_id VARCHAR2(255) NOT NULL,           -- the model ID used in provider API calls
    speed_priority   NUMBER DEFAULT 0,                  -- 0=fastest; higher=slower fallback
    context_limit    NUMBER,                            -- provider-specific context cap
    supports_params  CLOB DEFAULT '{}',                 -- JSON {reasoning,search,vision,...}
    max_concurrent   NUMBER DEFAULT 5,
    status           VARCHAR2(30) DEFAULT 'active',     -- active|rate_limited|out_of_credits|dead|disabled
    rate_limit_until TIMESTAMP,
    last_checked     TIMESTAMP,
    notes            CLOB,
    is_active        NUMBER(1) DEFAULT 1,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mp_model    FOREIGN KEY (model_id)    REFERENCES models(id) ON DELETE CASCADE,
    CONSTRAINT fk_mp_provider FOREIGN KEY (provider_id) REFERENCES providers(id),
    CONSTRAINT uq_mp          UNIQUE (model_id, provider_id)
);
CREATE INDEX idx_mp_model    ON model_providers(model_id, is_active, speed_priority);
CREATE INDEX idx_mp_provider ON model_providers(provider_id, status);
CREATE INDEX idx_mp_status   ON model_providers(status);

-- ── MODEL_TOKEN_MULTIPLIERS ──────────────────────────────────────────────────
CREATE TABLE model_token_multipliers (
    id                   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id             NUMBER NOT NULL,
    context_tier_min     NUMBER NOT NULL,               -- e.g. 0, 33000, 200000
    context_tier_max     NUMBER,                        -- null = no upper bound
    multiplier_input     NUMBER DEFAULT 1.0,
    multiplier_output    NUMBER DEFAULT 1.0,
    multiplier_cache_read  NUMBER DEFAULT 1.0,
    multiplier_cache_write NUMBER DEFAULT 1.0,
    notes                VARCHAR2(500),
    CONSTRAINT fk_mtm_model FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);
CREATE INDEX idx_mtm_model ON model_token_multipliers(model_id);

-- ── API_KEYS ─────────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id                   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              NUMBER NOT NULL,
    key_hash             VARCHAR2(64) NOT NULL UNIQUE,  -- SHA-256 of key, never store plaintext
    key_preview          VARCHAR2(30) NOT NULL,         -- "sk-orch-abc...xyz"
    label                VARCHAR2(100) DEFAULT 'My Key',
    is_active            NUMBER(1) DEFAULT 1,
    credit_limit_total   NUMBER,                        -- null = unlimited
    credit_limit_daily   NUMBER,
    credit_limit_reset   VARCHAR2(20) DEFAULT 'daily',  -- daily|weekly|monthly|never
    credit_used_today    NUMBER DEFAULT 0,
    credit_used_total    NUMBER DEFAULT 0,
    model_whitelist      CLOB,                          -- JSON array of model slugs; null = all
    expose_balance       NUMBER(1) DEFAULT 0,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at         TIMESTAMP,
    expires_at           TIMESTAMP,
    CONSTRAINT fk_ak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ak_user   ON api_keys(user_id, is_active);
CREATE INDEX idx_ak_hash   ON api_keys(key_hash);
CREATE INDEX idx_ak_active ON api_keys(is_active, expires_at);

-- ── DEMO_KEYS ────────────────────────────────────────────────────────────────
CREATE TABLE demo_keys (
    id               VARCHAR2(36) PRIMARY KEY,            -- UUID = the key itself
    platform         VARCHAR2(20) DEFAULT 'web_desktop',  -- web_desktop|web_mobile
    requests_today   NUMBER DEFAULT 0,
    total_requests   NUMBER DEFAULT 0,
    last_request_day DATE DEFAULT TRUNC(SYS_EXTRACT_UTC(SYSTIMESTAMP)),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dk_last_used ON demo_keys(last_used_at);
CREATE INDEX idx_dk_request_day ON demo_keys(last_request_day);

-- ── REQUEST_QUEUE ────────────────────────────────────────────────────────────
CREATE TABLE request_queue (
    id               VARCHAR2(80) PRIMARY KEY,
    user_id          NUMBER,
    api_key_id       NUMBER,
    model_id         NUMBER,
    provider_id      NUMBER,
    priority         NUMBER DEFAULT 0,
    status           VARCHAR2(20) DEFAULT 'pending',    -- pending|in_flight|completed|failed
    payload_ref      VARCHAR2(500),
    reserved_credits NUMBER DEFAULT 0,
    actual_credits   NUMBER,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dispatched_at    TIMESTAMP,
    completed_at     TIMESTAMP,
    CONSTRAINT fk_rq_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_rq_status   ON request_queue(status, priority DESC, created_at);
CREATE INDEX idx_rq_user     ON request_queue(user_id, status);

-- ── BATCH_REQUESTS ───────────────────────────────────────────────────────────
CREATE TABLE batch_requests (
    id                      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 NUMBER NOT NULL,
    api_key_id              NUMBER,
    model_id                NUMBER,
    provider_batch_job_id   VARCHAR2(200),
    payload                 CLOB,
    status                  VARCHAR2(20) DEFAULT 'pending', -- pending|submitted|polling|completed|failed
    queue_priority          NUMBER DEFAULT 0,
    discount_rate           NUMBER DEFAULT 0.5,
    reserved_credits        NUMBER DEFAULT 0,
    actual_credits_charged  NUMBER,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at            TIMESTAMP,
    completed_at            TIMESTAMP,
    response_payload        CLOB,
    CONSTRAINT fk_br_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_br_user   ON batch_requests(user_id, status);
CREATE INDEX idx_br_status ON batch_requests(status, created_at);

-- ── USER_COMPRESSION_SETTINGS ────────────────────────────────────────────────
CREATE TABLE user_compression_settings (
    id                    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               NUMBER NOT NULL,
    model_id              NUMBER NOT NULL,
    tier_index            NUMBER NOT NULL,              -- 1,2,3 matching context tier
    enabled               NUMBER(1) DEFAULT 0,
    compression_model_id  NUMBER,
    base_prompt_locked    CLOB,                         -- admin-set read-only base prompt for this tier/model
    system_prompt_append  CLOB,
    CONSTRAINT fk_ucs_user  FOREIGN KEY (user_id)             REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ucs_model FOREIGN KEY (model_id)            REFERENCES models(id),
    CONSTRAINT fk_ucs_cmod  FOREIGN KEY (compression_model_id) REFERENCES models(id),
    CONSTRAINT uq_ucs       UNIQUE (user_id, model_id, tier_index)
);
CREATE INDEX idx_ucs_user ON user_compression_settings(user_id, model_id);

-- ── USER_CONTEXT_TIER_PREFERENCES ────────────────────────────────────────────
CREATE TABLE user_context_tier_preferences (
    id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    NUMBER NOT NULL,
    model_id   NUMBER NOT NULL,
    tier_index NUMBER NOT NULL,
    behaviour  VARCHAR2(20) DEFAULT 'allow',            -- allow|compress|error
    CONSTRAINT fk_uctp_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uctp_model FOREIGN KEY (model_id) REFERENCES models(id),
    CONSTRAINT uq_uctp       UNIQUE (user_id, model_id, tier_index)
);

-- ── ANNOUNCEMENTS / CHANGELOG ────────────────────────────────────────────────
-- Unified announcement + changelog system. Type controls where/how an entry appears.
CREATE TABLE announcements (
    id                      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                   VARCHAR2(255) NOT NULL,
    description             CLOB,
    type                    VARCHAR2(20) DEFAULT 'announcement', -- announcement|changelog|both
    tone                    VARCHAR2(20) DEFAULT 'info',         -- info|warning|error|success|neutral|changelog
    version_tag             VARCHAR2(100),                       -- e.g. v1.4.2 or Model Update - May 2026
    related_announcement_id NUMBER,
    is_banner               NUMBER(1) DEFAULT 0,
    banner_expires_at       TIMESTAMP,
    is_active               NUMBER(1) DEFAULT 1,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by              NUMBER,
    CONSTRAINT fk_ann_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_ann_related FOREIGN KEY (related_announcement_id) REFERENCES announcements(id)
);
CREATE INDEX idx_ann_active  ON announcements(is_active, is_banner, created_at);
CREATE INDEX idx_ann_type    ON announcements(type, is_active, created_at);
CREATE INDEX idx_ann_related ON announcements(related_announcement_id);

-- ── ADMIN_NOTIFICATIONS ──────────────────────────────────────────────────────
-- DB-only admin alerts for v1; no email/webhook delivery in this phase.
CREATE TABLE admin_notifications (
    id             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type           VARCHAR2(50) DEFAULT 'system',          -- system|provider|billing|security|routing|user
    severity       VARCHAR2(20) DEFAULT 'info',            -- info|warning|error|critical
    title          VARCHAR2(255) NOT NULL,
    message        CLOB,
    entity_type    VARCHAR2(50),
    entity_id      VARCHAR2(100),
    metadata       CLOB DEFAULT '{}',
    is_read        NUMBER(1) DEFAULT 0,
    read_at        TIMESTAMP,
    read_by        NUMBER,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_admn_read_by FOREIGN KEY (read_by) REFERENCES users(id)
);
CREATE INDEX idx_admn_read     ON admin_notifications(is_read, created_at);
CREATE INDEX idx_admn_severity ON admin_notifications(severity, created_at);
CREATE INDEX idx_admn_type     ON admin_notifications(type, created_at);

-- ── USER_DISMISSED_ANNOUNCEMENTS ─────────────────────────────────────────────
CREATE TABLE user_dismissed_announcements (
    id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         NUMBER NOT NULL,
    announcement_id NUMBER NOT NULL,
    dismissed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uda_user FOREIGN KEY (user_id)         REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uda_ann  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    CONSTRAINT uq_uda UNIQUE (user_id, announcement_id)
);
CREATE INDEX idx_uda_user ON user_dismissed_announcements(user_id);

-- ── REQUEST_LOGS (30 day retention) ──────────────────────────────────────────
CREATE TABLE request_logs (
    id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         NUMBER,
    api_key_id      NUMBER,
    model_id        NUMBER,
    provider_id     NUMBER,
    endpoint        VARCHAR2(100) NOT NULL,
    status          VARCHAR2(10) DEFAULT 'success',     -- success|fail
    credits_charged NUMBER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rl_user    ON request_logs(user_id, created_at);
CREATE INDEX idx_rl_created ON request_logs(created_at);

-- ── ROUTING_LOGS (15 day retention) ──────────────────────────────────────────
CREATE TABLE routing_logs (
    id                  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id          VARCHAR2(80),
    user_id             NUMBER,
    key_ref_hash        VARCHAR2(64),                   -- obfuscated API/demo/session key reference; never plaintext
    providers_attempted CLOB,                           -- JSON array of obfuscated route references
    params_stripped     CLOB,                           -- JSON array
    final_provider_id   NUMBER,
    routing_reason      VARCHAR2(200),
    queue_wait_ms       NUMBER,
    ttft_ms             NUMBER,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rogl_created ON routing_logs(created_at);
CREATE INDEX idx_rogl_req     ON routing_logs(request_id);
CREATE INDEX idx_rogl_key_ref ON routing_logs(key_ref_hash, created_at);
CREATE INDEX idx_rogl_user    ON routing_logs(user_id, created_at);

-- ── REFERRAL_TRANSACTIONS ────────────────────────────────────────────────────
CREATE TABLE referral_transactions (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    referrer_user_id NUMBER NOT NULL,
    referred_user_id NUMBER NOT NULL,
    purchase_id      VARCHAR2(100),
    credit_reward    NUMBER DEFAULT 0,
    granted_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rt_referrer  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
    CONSTRAINT fk_rt_referred  FOREIGN KEY (referred_user_id) REFERENCES users(id)
);
CREATE INDEX idx_rt_referrer ON referral_transactions(referrer_user_id);

-- ── SYSTEM_SETTINGS ──────────────────────────────────────────────────────────
CREATE TABLE system_settings (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    setting_key   VARCHAR2(100) NOT NULL UNIQUE,
    setting_value CLOB,
    description   VARCHAR2(500),
    is_active     NUMBER(1) DEFAULT 1,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by    NUMBER,
    CONSTRAINT fk_ss_user FOREIGN KEY (updated_by) REFERENCES users(id)
);
CREATE INDEX idx_ss_key ON system_settings(setting_key);

-- ── ADMIN_SQL_QUERY_LOGS ─────────────────────────────────────────────────────
CREATE TABLE admin_sql_query_logs (
    id                  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id       NUMBER,
    query_text          CLOB NOT NULL,
    destructive_override NUMBER(1) DEFAULT 0,
    row_count           NUMBER DEFAULT 0,
    duration_ms         NUMBER DEFAULT 0,
    executed_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asql_user FOREIGN KEY (admin_user_id) REFERENCES users(id)
);
CREATE INDEX idx_asql_user ON admin_sql_query_logs(admin_user_id, executed_at);

-- ── SEED DATA ────────────────────────────────────────────────────────────────
-- Common maker records; admins can extend this list before adding catalog models.
INSERT INTO model_makers (name, slug, sort_order) VALUES ('OpenAI', 'openai', 10);
INSERT INTO model_makers (name, slug, sort_order) VALUES ('Anthropic', 'anthropic', 20);
INSERT INTO model_makers (name, slug, sort_order) VALUES ('Google', 'google', 30);
INSERT INTO model_makers (name, slug, sort_order) VALUES ('Meta', 'meta', 40);
INSERT INTO model_makers (name, slug, sort_order) VALUES ('Mistral AI', 'mistral-ai', 50);

-- Tiers and billing options are admin-configured via /api/admin/tiers
-- No seed tiers — create them from the admin panel.

-- System settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('default_signup_tier', 'Free', 'Name of the default tier assigned to new users on signup');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('demo_requests_per_day', '20', 'Max demo key requests per day');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('demo_context_cap', '33000', 'Max context tokens for demo key users');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('heartbeat_interval_seconds', '15', 'SSE heartbeat interval while request is queued');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('batch_discount_rate', '0.5', 'Default batch request discount (0.5 = 50% off)');
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('admin_github_handles', 'vendouple', 'Comma-separated GitHub usernames with admin role');

COMMIT;
