-- Oracle migration: run these once against your EXISTING database
-- (Only needed if demo_sessions was already created)

-- 1. Make fingerprint_hash nullable (it's now optional for partial fingerprints)
ALTER TABLE demo_sessions MODIFY fingerprint_hash VARCHAR2(64);

-- 2. Add the last_seen index for inactivity scanning
CREATE INDEX idx_demo_last_seen ON demo_sessions(last_seen);

-- 3. Add composite index for the fingerprint-based reconnection query
--    (fingerprint_hash + is_blocked — used in VPN reconnection path)
CREATE INDEX idx_demo_fingerprint2 ON demo_sessions(fingerprint_hash, is_blocked);
