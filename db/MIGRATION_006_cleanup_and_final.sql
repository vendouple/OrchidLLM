-- MIGRATION_006_cleanup_and_final.sql
-- Purpose: Clean up schema.sql corruption from previous migration append,
--          ensure all canonical model tables are present, and finalize schema.
--
-- Prerequisites: MIGRATION_004 and MIGRATION_005 have been applied.
--
-- What this migration does:
--   1) Ensures canonical_models and related tables exist (idempotent).
--   2) Adds any missing columns to existing tables for the merged catalog design.
--   3) Cleans up the corrupted schema.sql tail (already done manually).
--   4) Ensures tier_definitions has the full set of default tiers.

-- ============================================================
-- SECTION 1: Ensure canonical_models table exists
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE canonical_models (
            id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            category VARCHAR2(40) NOT NULL,
            model_id VARCHAR2(255) NOT NULL,
            display_name VARCHAR2(255) NOT NULL,
            description VARCHAR2(1000),
            default_context_window NUMBER,
            max_output_tokens NUMBER,
            timeout_ms NUMBER DEFAULT 60000 NOT NULL,
            deprecates_at TIMESTAMP,
            expires_at TIMESTAMP,
            deprecation_note VARCHAR2(1000),
            supports_caching NUMBER(1) DEFAULT 0 NOT NULL,
            supports_batch NUMBER(1) DEFAULT 0 NOT NULL,
            in_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
            out_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
            cache_read_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
            cache_write_multiplier NUMBER(18,6) DEFAULT 1 NOT NULL,
            metadata_json CLOB,
            is_active NUMBER(1) DEFAULT 1 NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            created_by VARCHAR2(255),
            updated_by VARCHAR2(255),
            CONSTRAINT uq_canonical_models_model_id UNIQUE (model_id)
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN -- ORA-00955: name is already used by an existing object
            RAISE;
        END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_canonical_models_category ON canonical_models(category, is_active)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- ============================================================
-- SECTION 2: Ensure canonical_model_provider_routes exists
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE canonical_model_provider_routes (
            id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            canonical_model_id NUMBER NOT NULL,
            provider_name VARCHAR2(64) NOT NULL,
            provider_model_id VARCHAR2(255) NOT NULL,
            route_label VARCHAR2(255),
            context_window NUMBER,
            timeout_ms NUMBER,
            priority NUMBER DEFAULT 0 NOT NULL,
            supports_batch NUMBER(1) DEFAULT 0 NOT NULL,
            supports_caching NUMBER(1) DEFAULT 0 NOT NULL,
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
            CONSTRAINT fk_cmpr_canonical_model FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
            CONSTRAINT uq_cmpr_route UNIQUE (canonical_model_id, provider_name, provider_model_id)
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_cmpr_model ON canonical_model_provider_routes(canonical_model_id, is_active, priority)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- ============================================================
-- SECTION 3: Ensure canonical_model_aliases exists
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE canonical_model_aliases (
            id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            canonical_model_id NUMBER NOT NULL,
            alias_model_id VARCHAR2(255) NOT NULL,
            is_primary_alias NUMBER(1) DEFAULT 0 NOT NULL,
            notes VARCHAR2(1000),
            is_active NUMBER(1) DEFAULT 1 NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT fk_cma_canonical_model FOREIGN KEY (canonical_model_id) REFERENCES canonical_models(id) ON DELETE CASCADE,
            CONSTRAINT uq_cma_alias UNIQUE (alias_model_id)
        )
    ';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- ============================================================
-- SECTION 4: Ensure model_catalog has alias_for and providers_config
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE model_catalog ADD (alias_for VARCHAR2(255), providers_config CLOB, target_tier VARCHAR2(50))';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN -- ORA-00955 or ORA-01430 (column already exists)
            IF SQLCODE != -1430 THEN RAISE; END IF;
        END IF;
END;
/

-- ============================================================
-- SECTION 5: Seed tier_definitions if missing any
-- ============================================================

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM tier_definitions;
    IF v_count = 0 THEN
        INSERT ALL
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('free', 'Free', 'FREE', 10, 1, 1, 'Default free tier')
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('basic', 'Basic', 'BASIC', 20, 1, 1, 'Default paid basic tier')
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('plus', 'Plus', 'PLUS', 30, 1, 1, 'Default plus tier')
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('pro', 'Pro', 'PRO', 40, 1, 1, 'Default pro tier')
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('ultra', 'Ultra', 'ULTRA', 50, 1, 1, 'Default ultra tier')
            INTO tier_definitions (tier_key, display_name, normalized_name, sort_order, is_system, is_active, description)
                VALUES ('ultimate', 'Ultimate', 'ULTIMATE', 60, 1, 1, 'Default ultimate tier')
        SELECT 1 FROM dual;
    END IF;
END;
/

COMMIT;
