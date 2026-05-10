-- Migration 012: Add provider context multipliers
-- Run this on Oracle Cloud Autonomous DB

CREATE TABLE provider_context_multipliers (
    id                       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name            VARCHAR2(100) NOT NULL,
    context_threshold_tokens NUMBER DEFAULT 0 NOT NULL,
    multiplier_in            NUMBER(10,6) DEFAULT 1 NOT NULL,
    multiplier_out           NUMBER(10,6) DEFAULT 1 NOT NULL,
    multiplier_cache_read    NUMBER(10,6) DEFAULT 1,
    multiplier_cache_write   NUMBER(10,6) DEFAULT 1,
    is_active                NUMBER(1) DEFAULT 1 NOT NULL,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by               VARCHAR2(255),
    updated_by               VARCHAR2(255),
    CONSTRAINT uq_pcm_provider_threshold UNIQUE (provider_name, context_threshold_tokens),
    CONSTRAINT ck_pcm_threshold_nonneg CHECK (context_threshold_tokens >= 0),
    CONSTRAINT ck_pcm_active_bool CHECK (is_active IN (0, 1))
);

CREATE INDEX idx_pcm_provider_active ON provider_context_multipliers(provider_name, is_active, context_threshold_tokens);

INSERT INTO provider_context_multipliers (
    provider_name,
    context_threshold_tokens,
    multiplier_in,
    multiplier_out,
    multiplier_cache_read,
    multiplier_cache_write,
    is_active,
    created_by,
    updated_by
)
SELECT provider_name, context_threshold_tokens, 1, 1, 1, 1, 1, 'migration_012', 'migration_012'
FROM (
    SELECT 'pollinations' provider_name FROM dual UNION ALL
    SELECT 'nvidia' FROM dual UNION ALL
    SELECT 'mistral' FROM dual UNION ALL
    SELECT 'cerebras' FROM dual UNION ALL
    SELECT 'voidai' FROM dual UNION ALL
    SELECT 'navy' FROM dual
) providers
CROSS JOIN (
    SELECT 0 context_threshold_tokens FROM dual UNION ALL
    SELECT 33000 FROM dual UNION ALL
    SELECT 200000 FROM dual UNION ALL
    SELECT 1000000 FROM dual
) thresholds;

COMMIT;
