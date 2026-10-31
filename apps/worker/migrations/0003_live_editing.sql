-- Live editing relay. The server stores sealed CRDT updates and sealed cursor
-- states. live.ts also creates these tables on first use.

CREATE TABLE IF NOT EXISTS live_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  device_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS live_events_doc ON live_events (vault_id, doc_id, seq);

CREATE TABLE IF NOT EXISTS live_awareness (
  vault_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_ms INTEGER NOT NULL,
  PRIMARY KEY (vault_id, doc_id, device_id)
);
