-- OrchidLLM API Keys Database Schema
-- Run this in PlanetScale or your MySQL database

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(64) NOT NULL UNIQUE,
  providers JSON NOT NULL,
  rate_limit INT NOT NULL DEFAULT 100,
  models JSON,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  last_used TIMESTAMP NULL,
  usage_count INT DEFAULT 0,
  INDEX idx_key (`key`),
  INDEX idx_created_at (created_at)
);

-- Usage tracking table (for demo mode)
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(128) NOT NULL,
  date DATE NOT NULL,
  count INT DEFAULT 1,
  last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_identifier_date (identifier, date),
  INDEX idx_identifier (identifier),
  INDEX idx_date (date)
);

-- API request logs (optional, for analytics)
CREATE TABLE IF NOT EXISTS request_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  api_key VARCHAR(64),
  session_id VARCHAR(64),
  ip_address VARCHAR(45),
  model VARCHAR(255),
  provider VARCHAR(50),
  tokens_used INT,
  request_type ENUM('chat', 'image', 'video', 'audio', 'transcription'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_key (api_key),
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
);
