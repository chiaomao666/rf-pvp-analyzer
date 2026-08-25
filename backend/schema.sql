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
