-- Daily counters were global (PRIMARY KEY date_utc), so every vault and every
-- unauthenticated health check shared one row. Counters are per vault from here.
-- Historical global rows are dropped: they mixed vaults and cannot be split.

CREATE TABLE IF NOT EXISTS metrics_daily_v2 (
  vault_id TEXT NOT NULL,
  date_utc TEXT NOT NULL,
  data_object_writes INTEGER NOT NULL DEFAULT 0,
  data_object_reads INTEGER NOT NULL DEFAULT 0,
  upload_bytes INTEGER NOT NULL DEFAULT 0,
  worker_requests INTEGER NOT NULL DEFAULT 0,
  d1_writes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vault_id, date_utc)
);

DROP TABLE IF EXISTS metrics_daily;
ALTER TABLE metrics_daily_v2 RENAME TO metrics_daily;
