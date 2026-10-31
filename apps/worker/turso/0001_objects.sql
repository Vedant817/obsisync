-- Encrypted object bytes. The sync journal lives in the same Turso database.
CREATE TABLE IF NOT EXISTS stored_objects (
  object_key TEXT PRIMARY KEY,
  body BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  etag TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);
