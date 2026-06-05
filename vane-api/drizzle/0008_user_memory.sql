CREATE TABLE IF NOT EXISTS user_memory (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);
