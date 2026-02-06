-- AI Trade Journal — D1 Database Schema
-- Version: 1.0.0

-- License keys table
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused', 'active', 'revoked')),
  user_notion_id TEXT,
  activated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking for cost control
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT NOT NULL REFERENCES licenses(key),
  date TEXT NOT NULL,
  analysis_count INTEGER NOT NULL DEFAULT 0,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  UNIQUE(license_key, date)
);

-- Index for fast usage lookups
CREATE INDEX IF NOT EXISTS idx_usage_license_date ON usage(license_key, date);
