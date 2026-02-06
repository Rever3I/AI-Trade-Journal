-- AI Trade Journal — D1 Database Schema
-- Version: 2.0.0

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

-- Notion OAuth connections (server-side token storage)
CREATE TABLE IF NOT EXISTS notion_connections (
  license_key TEXT PRIMARY KEY REFERENCES licenses(key),
  access_token TEXT NOT NULL,
  workspace_id TEXT,
  workspace_name TEXT,
  bot_id TEXT,
  template_db_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth state tokens for CSRF prevention
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  license_key TEXT NOT NULL REFERENCES licenses(key),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
