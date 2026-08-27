CREATE TABLE IF NOT EXISTS pvp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_pvp_events_workspace_id_id
  ON pvp_events(workspace_id, id);

CREATE TABLE IF NOT EXISTS pvp_site_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_salt TEXT NOT NULL,
  password_verifier TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
