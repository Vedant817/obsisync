-- VaultBridge D1 schema v1 (0001_initial.sql)
-- Contract notes (see docs/protocol.md):
-- * change_events.seq is a GLOBAL monotonically increasing rowid; per-vault
--   cursors query WHERE vault_id = ? AND seq > ? ORDER BY seq ASC.
-- * The atomic commit is a single D1 batch (implicit transaction): guarded
--   file-head CAS UPDATE followed by conditional INSERTs that only run when
--   the head actually moved. No read-then-write locking in JavaScript.
-- * Plaintext metadata never reaches this database: manifests are ciphertext.

CREATE TABLE IF NOT EXISTS vaults (
  vault_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  key_epoch INTEGER NOT NULL DEFAULT 1,
  wrapped_vmk_b64 TEXT NOT NULL,
  wrapped_vmk_recovery_b64 TEXT NOT NULL,
  kdf_params_json TEXT NOT NULL,
  flags_ciphertext_b64 TEXT,
  materials_version INTEGER NOT NULL DEFAULT 1,
  history_retention_days INTEGER NOT NULL DEFAULT 3650
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(vault_id),
  name_ciphertext_b64 TEXT,
  public_key_b64 TEXT,
  auth_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_vault ON devices(vault_id);

CREATE TABLE IF NOT EXISTS files (
  vault_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  head_revision_id TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  last_event_seq INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, file_id)
);

CREATE TABLE IF NOT EXISTS revisions (
  revision_id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  parent_revision_id TEXT,
  blob_object_key TEXT,
  manifest_object_key TEXT NOT NULL,
  ciphertext_sha256 TEXT NOT NULL,
  ciphertext_bytes INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  key_epoch INTEGER NOT NULL DEFAULT 1,
  operation_id TEXT NOT NULL,
  is_tombstone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (vault_id, operation_id),
  UNIQUE (vault_id, revision_id),
  FOREIGN KEY (vault_id, file_id) REFERENCES files(vault_id, file_id)
);
CREATE INDEX IF NOT EXISTS idx_revisions_blob_key ON revisions(vault_id, blob_object_key);
CREATE INDEX IF NOT EXISTS idx_revisions_manifest_key ON revisions(vault_id, manifest_object_key);
CREATE INDEX IF NOT EXISTS idx_revisions_file_time ON revisions(vault_id, file_id, created_at);

CREATE TABLE IF NOT EXISTS change_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('commit', 'tombstone')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_change_events_vault_seq ON change_events(vault_id, seq);

CREATE TABLE IF NOT EXISTS invitations (
  invite_id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(vault_id),
  verifier_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invitations_vault ON invitations(vault_id);

CREATE TABLE IF NOT EXISTS bootstrap_credentials (
  credential_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  used_at TEXT,
  used_by_device_id TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  upload_id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(vault_id),
  device_id TEXT NOT NULL REFERENCES devices(device_id),
  staging_object_key TEXT NOT NULL UNIQUE,
  expected_sha256 TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'staged', 'committed', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  revision_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_vault ON upload_sessions(vault_id, status);

CREATE TABLE IF NOT EXISTS operation_receipts (
  vault_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  result_code TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  ciphertext_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, operation_id),
  FOREIGN KEY (vault_id, revision_id) REFERENCES revisions(vault_id, revision_id)
);

CREATE TABLE IF NOT EXISTS device_cursors (
  vault_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  acknowledged_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (vault_id, device_id)
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  date_utc TEXT PRIMARY KEY,
  data_object_writes INTEGER NOT NULL DEFAULT 0,
  data_object_reads INTEGER NOT NULL DEFAULT 0,
  upload_bytes INTEGER NOT NULL DEFAULT 0,
  worker_requests INTEGER NOT NULL DEFAULT 0,
  d1_writes INTEGER NOT NULL DEFAULT 0
);
