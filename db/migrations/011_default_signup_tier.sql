-- Migration 011: Add default_signup_tier setting
-- Run this on Oracle Cloud Autonomous DB

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('default_signup_tier_id', NULL, 'Tier ID assigned to new users on GitHub signup. NULL = no tier assigned.');

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('max_banners', '3', 'Maximum number of banners to show at once.');

COMMIT;
