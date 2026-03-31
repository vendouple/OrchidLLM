-- Oracle migration: provider key pool + queue + provider usage logs
-- Run this once against an existing OrchidLLM database.

-- =============================================================
-- Table: provider_keys
-- Multiple upstream keys per provider, with per-key counters.
-- =============================================================
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE provider_keys (
            id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            provider_name VARCHAR2(64) NOT NULL,
            key_name VARCHAR2(120) NOT NULL,
            api_key VARCHAR2(4000) NOT NULL,
            is_active NUMBER DEFAULT 1,
            priority NUMBER DEFAULT 0,

            usage_counter_type VARCHAR2(64) DEFAULT ''tokens'',
            daily_limit NUMBER DEFAULT -1,
            minute_limit NUMBER DEFAULT -1,
            tokens_daily_limit NUMBER DEFAULT -1,
            units_daily_limit NUMBER DEFAULT -1,

            requests_today NUMBER DEFAULT 0,
            tokens_today NUMBER DEFAULT 0,
            units_today NUMBER DEFAULT 0,

            reset_interval VARCHAR2(20) DEFAULT ''daily'',
            resets_at TIMESTAMP,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR2(255),
            last_used TIMESTAMP,
            last_error VARCHAR2(1000),
            last_rate_limit_json CLOB
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_provider_keys_provider_active ON provider_keys(provider_name, is_active)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_provider_keys_priority ON provider_keys(provider_name, priority, last_used)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

-- =============================================================
-- Table: provider_usage_logs
-- Provider-level usage telemetry for admin dashboards.
-- =============================================================
BEGIN
    EXECUTE IMMEDIATE '
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
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_provider_usage_provider_date ON provider_usage_logs(provider_name, created_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_provider_usage_key_date ON provider_usage_logs(provider_key_id, created_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

-- =============================================================
-- Table: request_queue
-- Priority queue for endpoint-level scheduling.
-- =============================================================
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE request_queue (
            id VARCHAR2(80) PRIMARY KEY,
            endpoint VARCHAR2(120) NOT NULL,
            identifier VARCHAR2(255),
            api_key_id NUMBER,
            model VARCHAR2(255),
            priority NUMBER DEFAULT 0,
            provider_name VARCHAR2(64),
            status VARCHAR2(32) DEFAULT ''queued'',
            status_code NUMBER,
            error_message VARCHAR2(1000),

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            heartbeat_at TIMESTAMP,

            CONSTRAINT fk_queue_api_key
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_queue_status_priority ON request_queue(endpoint, status, priority, created_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_queue_provider_processing ON request_queue(provider_name, status, heartbeat_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

-- =============================================================
-- Table: model_catalog
-- Admin-managed model metadata and availability.
-- =============================================================
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE model_catalog (
            id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            category VARCHAR2(40) NOT NULL,
            model_id VARCHAR2(255) NOT NULL,
            display_name VARCHAR2(255) NOT NULL,
            description VARCHAR2(1000),
            context_window VARCHAR2(64),

            capabilities_json VARCHAR2(4000),
            tags_json VARCHAR2(4000),
            compatible_providers_json VARCHAR2(4000),

            timeout_ms NUMBER DEFAULT 60000,
            deprecates_at TIMESTAMP,
            deprecation_note VARCHAR2(500),

            is_pro NUMBER DEFAULT 0,
            supports_caching NUMBER DEFAULT 0,
            is_active NUMBER DEFAULT 1,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR2(255),
            updated_by VARCHAR2(255),

            CONSTRAINT uq_model_catalog_cat_model UNIQUE (category, model_id)
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_model_catalog_cat_active ON model_catalog(category, is_active)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_model_catalog_deprecates ON model_catalog(deprecates_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

COMMIT;
