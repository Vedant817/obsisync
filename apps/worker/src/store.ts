/**
 * Data access over the SQL port (ports.ts).
 *
 * All SQL lives here so the same statements run against the production D1
 * binding and the test-kit's SQLite adapter (which replays migrations/*.sql).
 *
 * Binding rule: every `?N` placeholder has exactly one bound value and all
 * statements in this file keep positional order documented inline.
 */
import type { D1DatabaseLike, D1Statement, SqlValue } from "./ports.js";
import { VaultBridgeError } from "@vaultbridge/protocol";

type Row = Record<string, unknown>;
export type { Row };

function stmt(db: D1DatabaseLike, sql: string, params: SqlValue[]): D1Statement {
  return db.prepare(sql).bind(...params);
}

async function one<T>(db: D1DatabaseLike, sql: string, params: SqlValue[]): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  if (!result.success) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", "statement reported failure");
  }
  return result.results[0] ?? null;
}

async function many<T>(db: D1DatabaseLike, sql: string, params: SqlValue[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.success ? (result.results as T[]) : [];
}

// ---------------------------------------------------------------------------
// Vault rows
// ---------------------------------------------------------------------------

export interface VaultRow {
  vault_id: string;
  created_at: string;
  protocol_version: number;
  key_epoch: number;
  wrapped_vmk_b64: string;
  wrapped_vmk_recovery_b64: string;
  kdf_params_json: string;
  flags_ciphertext_b64: string | null;
  materials_version: number;
  history_retention_days: number;
}

export interface DeviceRow {
  device_id: string;
  vault_id: string;
  name_ciphertext_b64: string | null;
  public_key_b64: string | null;
  auth_token_hash: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export function getVaultRow(db: D1DatabaseLike, vaultId: string): Promise<VaultRow | null> {
  return one<VaultRow>(db, "SELECT * FROM vaults WHERE vault_id = ?1", [vaultId]);
}

export async function getVaultState(db: D1DatabaseLike, vaultId: string): Promise<{ vault: VaultRow; maxSeq: number } | null> {
  const vault = await getVaultRow(db, vaultId);
  if (!vault) {
    return null;
  }
  const seqRow = await one<{ max_seq: number | null }>(
    db,
    "SELECT MAX(seq) AS max_seq FROM change_events WHERE vault_id = ?1",
    [vaultId],
  );
  return { vault, maxSeq: seqRow?.max_seq ?? 0 };
}

export function touchDeviceSeenStatement(db: D1DatabaseLike, deviceId: string, at: string): D1Statement {
  // 1=device 2=at
  return stmt(db, "UPDATE devices SET last_seen_at = ?2 WHERE device_id = ?1", [deviceId, at]);
}

// ---------------------------------------------------------------------------
// Bootstrap (first device) — consumes the deployment-created credential once.
// ---------------------------------------------------------------------------

export async function bootstrapCreateVault(
  db: D1DatabaseLike,
  args: { vault: VaultRow; device: DeviceRow; bootTokenHash: string; dateUtc: string },
): Promise<{ created: boolean }> {
  const at = args.vault.created_at;
  const vault = args.vault;
  const device = args.device;
  // A SQL batch does not abort when an UPDATE changes 0 rows. Every later
  // insert is a SELECT ... WHERE the credential was consumed by THIS device,
  // so a concurrent bootstrap that lost the UPDATE cannot insert a second vault.
  const consume = stmt(
    db,
    `UPDATE bootstrap_credentials
       SET used_at = ?2, used_by_device_id = ?3
     WHERE credential_hash = ?1 AND used_at IS NULL`,
    [args.bootTokenHash, at, device.device_id],
  );
  const insertVault = stmt(
    db,
    `INSERT INTO vaults (vault_id, created_at, protocol_version, key_epoch, wrapped_vmk_b64,
        wrapped_vmk_recovery_b64, kdf_params_json, flags_ciphertext_b64, materials_version, history_retention_days)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?11 AND used_by_device_id = ?12 AND used_at IS NOT NULL
     )`,
    [
      vault.vault_id, vault.created_at, vault.protocol_version, vault.key_epoch,
      vault.wrapped_vmk_b64, vault.wrapped_vmk_recovery_b64, vault.kdf_params_json,
      vault.flags_ciphertext_b64, vault.materials_version, vault.history_retention_days,
      args.bootTokenHash, device.device_id,
    ],
  );
  const insertDevice = stmt(
    db,
    `INSERT INTO devices (device_id, vault_id, name_ciphertext_b64, public_key_b64, auth_token_hash, created_at, last_seen_at, revoked_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,NULL
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?8 AND used_by_device_id = ?1 AND used_at IS NOT NULL
     )`,
    [
      device.device_id, device.vault_id, device.name_ciphertext_b64, device.public_key_b64,
      device.auth_token_hash, device.created_at, device.last_seen_at, args.bootTokenHash,
    ],
  );
  const insertCursor = stmt(
    db,
    `INSERT OR IGNORE INTO device_cursors (vault_id, device_id, acknowledged_seq, updated_at)
     SELECT ?1,?2,?3,?4
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?5 AND used_by_device_id = ?2 AND used_at IS NOT NULL
     )`,
    [device.vault_id, device.device_id, 0, at, args.bootTokenHash],
  );
  const countD1Write = stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, d1_writes)
     SELECT ?1, ?2, 1
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?3 AND used_by_device_id = ?4 AND used_at IS NOT NULL
     )
     ON CONFLICT(vault_id, date_utc) DO UPDATE SET d1_writes = d1_writes + 1`,
    [device.vault_id, args.dateUtc, args.bootTokenHash, device.device_id],
  );
  await db.batch([consume, insertVault, insertDevice, insertCursor, countD1Write]);
  const owner = await one<{ used_by_device_id: string | null }>(
    db,
    "SELECT used_by_device_id FROM bootstrap_credentials WHERE credential_hash = ?1",
    [args.bootTokenHash],
  );
  const createdVault = await getVaultRow(db, vault.vault_id);
  return { created: owner?.used_by_device_id === device.device_id && createdVault != null };
}

export async function findUnusedBootstrapCredential(db: D1DatabaseLike, credentialHash: string): Promise<boolean> {
  const row = await one<{ used_at: string | null }>(
    db,
    "SELECT used_at FROM bootstrap_credentials WHERE credential_hash = ?1",
    [credentialHash],
  );
  return row != null && row.used_at === null;
}

// ---------------------------------------------------------------------------
// Atomic CAS commit — the heart of the protocol (spec §8.2/§9.5)
// ---------------------------------------------------------------------------

export interface CommitOutcome {
  result: "COMMITTED" | "ALREADY_COMMITTED" | "CONFLICT";
  seq?: number;
  receipt?: { operationId: string; revisionId: string };
  conflictHead?: {
    fileId: string;
    headRevisionId: string | null;
    isDeleted: boolean;
    lastEventSeq: number;
  };
}

export interface CommitArgs {
  vaultId: string;
  deviceId: string;
  fileId: string;
  parentRevisionId: string | null;
  newRevisionId: string;
  operationId: string;
  isTombstone: boolean;
  keyEpoch: number;
  stagedObjectKey: string;
  manifestObjectKey: string;
  ciphertextSha256: string;
  ciphertextBytes: number;
  at: string;
}

/**
 * Guard predicate used by the conditional INSERTs: only true when the file's
 * head moved to the new revision (i.e. CAS step-2 succeeded in this batch).
 * Placeholder plan: ?1=vault_id ?2=file_id ?3=new_revision_id.
 */
const HEAD_IS_NEW = "(SELECT head_revision_id FROM files WHERE vault_id = ?1 AND file_id = ?2) IS ?3";

/**
 * One-batch semantics for the atomic commit:
 *   1. ensure files row (INSERT OR IGNORE — no-op when present)
 *   2. guarded CAS UPDATE on head_revision_id -> meta.changes == 0 -> conflict
 *   3. conditional INSERT revision      (SELECT ... WHERE HEAD_IS_NEW)
 *   4. conditional INSERT change_event
 *   5. conditional INSERT operation_receipt
 *
 * If any statement throws, the whole batch rolls back atomically.
 */
interface OperationReceiptHit {
  revision_id: string;
  ciphertext_sha256: string;
}

function lookupOperationReceipt(db: D1DatabaseLike, vaultId: string, operationId: string): Promise<OperationReceiptHit | null> {
  return one<OperationReceiptHit>(
    db,
    "SELECT r.revision_id AS revision_id, r.ciphertext_sha256 AS ciphertext_sha256 FROM operation_receipts e JOIN revisions r ON r.vault_id = e.vault_id AND r.revision_id = e.revision_id WHERE e.vault_id = ?1 AND e.operation_id = ?2",
    [vaultId, operationId],
  );
}

async function alreadyCommitted(db: D1DatabaseLike, args: CommitArgs, existing: OperationReceiptHit): Promise<CommitOutcome> {
  if (existing.ciphertext_sha256 !== args.ciphertextSha256) {
    throw new VaultBridgeError("INVALID_REQUEST", "operation id reused for different content", {
      guidance: "Generate a new operation id for a different upload.",
    });
  }
  const seqRow = await one<{ seq: number | null }>(
    db,
    "SELECT seq FROM change_events WHERE vault_id = ?1 AND revision_id = ?2",
    [args.vaultId, existing.revision_id],
  );
  return {
    result: "ALREADY_COMMITTED",
    receipt: { operationId: args.operationId, revisionId: existing.revision_id },
    seq: seqRow?.seq ?? undefined,
  };
}

export async function commitRevisionConditional(
  db: D1DatabaseLike,
  args: CommitArgs,
  opts?: { skipReceiptPrecheck?: boolean },
): Promise<CommitOutcome> {
  // Fast path for a retry that arrives after the winner committed. The check
  // is repeated after the batch: two in-flight calls can both miss this row.
  if (!opts?.skipReceiptPrecheck) {
    const existing = await lookupOperationReceipt(db, args.vaultId, args.operationId);
    if (existing) {
      return alreadyCommitted(db, args, existing);
    }
  }

  const ensureFile = stmt(
    db,
    `INSERT OR IGNORE INTO files (vault_id, file_id, head_revision_id, is_deleted, last_event_seq, created_at)
     VALUES (?1,?2,NULL,0,NULL,?3)`,
    [args.vaultId, args.fileId, args.at],
  );

  const casHead = stmt(
    db,
    `UPDATE files SET head_revision_id = ?4, is_deleted = ?5
     WHERE vault_id = ?1 AND file_id = ?2 AND head_revision_id IS ?3`,
    // ?1 vault ?2 file ?3 expected-parent ?4 new-rev ?5 tombstone
    [args.vaultId, args.fileId, args.parentRevisionId, args.newRevisionId, args.isTombstone ? 1 : 0],
  );

  const insertRevision = stmt(
    db,
    `INSERT INTO revisions (revision_id, vault_id, file_id, parent_revision_id, blob_object_key,
        manifest_object_key, ciphertext_sha256, ciphertext_bytes, device_id, key_epoch, operation_id, is_tombstone, created_at)
     SELECT ?4,?1,?2,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE ${HEAD_IS_NEW}`,
    // ?3 consumed by HEAD_IS_NEW; ?4.. = new fields (see column order above)
    [
      args.vaultId, args.fileId, args.newRevisionId,
      args.newRevisionId, args.parentRevisionId,
      args.isTombstone ? null : args.stagedObjectKey,
      args.manifestObjectKey,
      args.ciphertextSha256, args.ciphertextBytes,
      args.deviceId, args.keyEpoch, args.operationId,
      args.isTombstone ? 1 : 0, args.at,
    ],
  );

  const insertEvent = stmt(
    db,
    `INSERT INTO change_events (vault_id, file_id, revision_id, event_type, created_at)
     SELECT ?1,?2,?4, CASE WHEN ?6 = 1 THEN 'tombstone' ELSE 'commit' END, ?5 WHERE ${HEAD_IS_NEW}`,
    // ?1 vault ?2 file ?3 new-revision (HEAD guard) ?4 new-revision ?5 at ?6 tombstone flag
    [
      args.vaultId, args.fileId, args.newRevisionId,
      args.newRevisionId, args.at, args.isTombstone ? 1 : 0,
    ],
  );

  // last_event_seq is the global change_events.seq, not a per-file counter.
  // Guarded by the new head so a losing CAS does not rewrite another revision.
  const setLastEventSeq = stmt(
    db,
    `UPDATE files SET last_event_seq = (
        SELECT seq FROM change_events
        WHERE vault_id = ?1 AND file_id = ?2 AND revision_id = ?3
        ORDER BY seq DESC LIMIT 1
      )
      WHERE vault_id = ?1 AND file_id = ?2 AND head_revision_id IS ?3`,
    [args.vaultId, args.fileId, args.newRevisionId],
  );

  const insertReceipt = stmt(
    db,
    `INSERT INTO operation_receipts (vault_id, operation_id, result_code, revision_id, ciphertext_sha256, created_at)
     SELECT ?1,?5,'COMMITTED',?4,?6,?7 WHERE ${HEAD_IS_NEW}`,
    // ?1 vault ?2 file ?3 new-revision (HEAD guard) ?4 new-revision ?5 operationId ?6 sha ?7 at
    [
      args.vaultId, args.fileId, args.newRevisionId,
      args.newRevisionId, args.operationId, args.ciphertextSha256, args.at,
    ],
  );

  const batchStatements = [
    ensureFile,
    casHead,
    insertRevision,
    insertEvent,
    setLastEventSeq,
    insertReceipt,
  ];

  const results = await db.batch(batchStatements);
  const casMeta = results[1]?.meta;
  if (!casMeta || casMeta.changes === 0) {
    const raced = await lookupOperationReceipt(db, args.vaultId, args.operationId);
    if (raced) {
      return alreadyCommitted(db, args, raced);
    }
    const remote = await getFileRow(db, args.vaultId, args.fileId);
    return {
      result: "CONFLICT",
      conflictHead: remote
        ? {
            fileId: args.fileId,
            headRevisionId: remote.head_revision_id,
            isDeleted: remote.is_deleted === 1,
            lastEventSeq: remote.last_event_seq ?? 0,
          }
        : undefined,
    };
  }

  const seqRow = await one<{ seq: number | null }>(
    db,
    "SELECT seq FROM change_events WHERE vault_id = ?1 AND revision_id = ?2 ORDER BY seq DESC LIMIT 1",
    [args.vaultId, args.newRevisionId],
  );
  return {
    result: "COMMITTED",
    seq: seqRow?.seq ?? undefined,
    receipt: { operationId: args.operationId, revisionId: args.newRevisionId },
  };
}

export interface FileRow {
  vault_id: string;
  file_id: string;
  head_revision_id: string | null;
  is_deleted: number;
  last_event_seq: number | null;
  created_at: string;
}

export function getFileRow(db: D1DatabaseLike, vaultId: string, fileId: string): Promise<FileRow | null> {
  return one<FileRow>(db, "SELECT * FROM files WHERE vault_id = ?1 AND file_id = ?2", [vaultId, fileId]);
}

// ---------------------------------------------------------------------------
// Change feed / revisions / history / devices
// ---------------------------------------------------------------------------

export interface ChangeEventRow {
  seq: number;
  vault_id: string;
  file_id: string;
  revision_id: string;
  event_type: string;
  created_at: string;
}

export function listChanges(db: D1DatabaseLike, vaultId: string, afterSeq: number, limit: number): Promise<ChangeEventRow[]> {
  return many<ChangeEventRow>(
    db,
    "SELECT * FROM change_events WHERE vault_id = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3",
    [vaultId, afterSeq, limit],
  );
}

export interface RevisionRow {
  revision_id: string;
  vault_id: string;
  file_id: string;
  parent_revision_id: string | null;
  blob_object_key: string | null;
  manifest_object_key: string;
  ciphertext_sha256: string;
  ciphertext_bytes: number;
  device_id: string;
  key_epoch: number;
  is_tombstone: number;
  created_at: string;
}

/** The SQL port rejects a statement with more than 100 bound parameters. */
const D1_MAX_SQL_VARIABLES = 100;

export async function listRevisionsForEvents(db: D1DatabaseLike, vaultId: string, revisionIds: string[]): Promise<RevisionRow[]> {
  if (revisionIds.length === 0) {
    return [];
  }
  // vault_id consumes one bind, so each IN-list stays at 99 ids. The sync
  // client asks for up to 200 events; one query would throw on D1.
  const chunkSize = D1_MAX_SQL_VARIABLES - 1;
  const rows: RevisionRow[] = [];
  for (let offset = 0; offset < revisionIds.length; offset += chunkSize) {
    const chunk = revisionIds.slice(offset, offset + chunkSize);
    const placeholders = chunk.map((_, i) => `?${i + 2}`).join(",");
    const part = await many<RevisionRow>(
      db,
      `SELECT * FROM revisions WHERE vault_id = ?1 AND revision_id IN (${placeholders})`,
      [vaultId, ...chunk],
    );
    rows.push(...part);
  }
  return rows;
}

export function findRevisionByObjectId(db: D1DatabaseLike, vaultId: string, objectId: string): Promise<RevisionRow | null> {
  return one<RevisionRow>(
    db,
    "SELECT * FROM revisions WHERE vault_id = ?1 AND (blob_object_key = ?2 OR manifest_object_key = ?2) LIMIT 1",
    [vaultId, objectId],
  );
}

export function getRevisionRow(db: D1DatabaseLike, vaultId: string, revisionId: string): Promise<RevisionRow | null> {
  return one<RevisionRow>(
    db,
    "SELECT * FROM revisions WHERE vault_id = ?1 AND revision_id = ?2 LIMIT 1",
    [vaultId, revisionId],
  );
}

export interface HistoryRevisionRow extends RevisionRow {
  event_seq: number;
}

export function listFileHistory(db: D1DatabaseLike, vaultId: string, fileId: string, limit: number, beforeSeq: number | null): Promise<HistoryRevisionRow[]> {
  const base = `SELECT r.*, e.seq AS event_seq FROM change_events e
       JOIN revisions r ON r.vault_id = e.vault_id AND r.revision_id = e.revision_id
     WHERE e.vault_id = ?1 AND e.file_id = ?2`;
  if (beforeSeq === null) {
    return many<HistoryRevisionRow>(db, `${base} ORDER BY e.seq DESC LIMIT ?3`, [vaultId, fileId, limit]);
  }
  return many<HistoryRevisionRow>(db, `${base} AND e.seq < ?4 ORDER BY e.seq DESC LIMIT ?3`, [
    vaultId, fileId, limit, beforeSeq,
  ]);
}

export function listDevices(db: D1DatabaseLike, vaultId: string): Promise<DeviceRow[]> {
  return many<DeviceRow>(
    db,
    "SELECT * FROM devices WHERE vault_id = ?1 ORDER BY created_at ASC",
    [vaultId],
  );
}

export async function revokeDevice(db: D1DatabaseLike, vaultId: string, deviceId: string): Promise<boolean> {
  const result = await stmt(
    db,
    "UPDATE devices SET revoked_at = ?3 WHERE vault_id = ?1 AND device_id = ?2",
    [vaultId, deviceId, new Date().toISOString()],
  ).run();
  return result.meta.changes > 0;
}

// ---------------------------------------------------------------------------
// Pairing invitations
// ---------------------------------------------------------------------------

export interface InvitationRow {
  invite_id: string;
  vault_id: string;
  verifier_hash: string;
  expires_at: string;
  used_at: string | null;
  used_by_device_id: string | null;
  created_at: string;
}

export function insertInvitationStatement(db: D1DatabaseLike, inv: InvitationRow): D1Statement {
  return stmt(
    db,
    `INSERT INTO invitations (invite_id, vault_id, verifier_hash, expires_at, used_at, used_by_device_id, created_at)
     VALUES (?1,?2,?3,?4,NULL,NULL,?5)`,
    [inv.invite_id, inv.vault_id, inv.verifier_hash, inv.expires_at, inv.created_at],
  );
}

export function getInvitationRow(db: D1DatabaseLike, inviteId: string): Promise<InvitationRow | null> {
  return one<InvitationRow>(db, "SELECT * FROM invitations WHERE invite_id = ?1", [inviteId]);
}

export function markInvitationUsedStatement(db: D1DatabaseLike, inviteId: string, deviceId: string, at: string): D1Statement {
  return stmt(
    db,
    "UPDATE invitations SET used_at = ?3, used_by_device_id = ?2 WHERE invite_id = ?1 AND used_at IS NULL",
    [inviteId, deviceId, at],
  );
}

/**
 * Consume an invitation and insert the device in one batch. The device insert
 * runs only when this device won the `used_at IS NULL` update. A concurrent
 * redemption that loses the update does not get a device row or a token.
 */
export async function completePairing(
  db: D1DatabaseLike,
  args: { inviteId: string; device: DeviceRow; cursorSeq: number; at: string; dateUtc: string },
): Promise<{ paired: boolean }> {
  const device = args.device;
  const insertDevice = stmt(
    db,
    `INSERT INTO devices (device_id, vault_id, name_ciphertext_b64, public_key_b64, auth_token_hash, created_at, last_seen_at, revoked_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,NULL
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?8 AND used_by_device_id = ?1 AND used_at IS NOT NULL
     )`,
    [
      device.device_id, device.vault_id, device.name_ciphertext_b64, device.public_key_b64,
      device.auth_token_hash, device.created_at, device.last_seen_at, args.inviteId,
    ],
  );
  const insertCursor = stmt(
    db,
    `INSERT OR IGNORE INTO device_cursors (vault_id, device_id, acknowledged_seq, updated_at)
     SELECT ?1,?2,?3,?4
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?5 AND used_by_device_id = ?2 AND used_at IS NOT NULL
     )`,
    [device.vault_id, device.device_id, args.cursorSeq, args.at, args.inviteId],
  );
  const countD1Write = stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, d1_writes)
     SELECT ?1, ?2, 1
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?3 AND used_by_device_id = ?4 AND used_at IS NOT NULL
     )
     ON CONFLICT(vault_id, date_utc) DO UPDATE SET d1_writes = d1_writes + 1`,
    [device.vault_id, args.dateUtc, args.inviteId, device.device_id],
  );
  await db.batch([
    markInvitationUsedStatement(db, args.inviteId, device.device_id, args.at),
    insertDevice,
    insertCursor,
    countD1Write,
  ]);
  const invitation = await getInvitationRow(db, args.inviteId);
  const deviceRow = await one<{ device_id: string }>(
    db,
    "SELECT device_id FROM devices WHERE device_id = ?1 AND vault_id = ?2",
    [device.device_id, device.vault_id],
  );
  return { paired: invitation?.used_by_device_id === device.device_id && deviceRow != null };
}

// ---------------------------------------------------------------------------
// Usage + metrics
// ---------------------------------------------------------------------------

export interface UsageCounters {
  storageEstimateBytes: number;
  objectCount: number;
  revisionCount: number;
  deviceCount: number;
  metrics: MetricsRow | null;
}

export interface MetricsRow {
  date_utc: string;
  data_object_writes: number;
  data_object_reads: number;
  upload_bytes: number;
  worker_requests: number;
  d1_writes: number;
}

export async function usage(db: D1DatabaseLike, vaultId: string, dateUtc: string): Promise<UsageCounters> {
  const revisionRow = await one<{ n: number; bytes: number }>(
    db,
    "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN is_tombstone = 0 THEN ciphertext_bytes ELSE 0 END), 0) AS bytes FROM revisions WHERE vault_id = ?1",
    [vaultId],
  );
  const deviceRow = await one<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM devices WHERE vault_id = ?1 AND revoked_at IS NULL",
    [vaultId],
  );
  // Distinct stored objects, including history. A tombstone drops the live
  // head but the previous blob and both manifests stay in the bucket.
  const objectRow = await one<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM (
       SELECT 'b:' || blob_object_key AS object_key FROM revisions
        WHERE vault_id = ?1 AND blob_object_key IS NOT NULL AND length(blob_object_key) > 0
       UNION
       SELECT 'm:' || manifest_object_key AS object_key FROM revisions
        WHERE vault_id = ?1 AND manifest_object_key IS NOT NULL AND length(manifest_object_key) > 0
     ) AS stored_objects`,
    [vaultId],
  );
  const metrics = await one<MetricsRow>(
    db,
    "SELECT * FROM metrics_daily WHERE vault_id = ?1 AND date_utc = ?2",
    [vaultId, dateUtc],
  );
  return {
    storageEstimateBytes: revisionRow?.bytes ?? 0,
    objectCount: objectRow?.n ?? 0,
    revisionCount: revisionRow?.n ?? 0,
    deviceCount: deviceRow?.n ?? 0,
    metrics,
  };
}

export type MetricField = "data_object_writes" | "data_object_reads" | "upload_bytes" | "worker_requests" | "d1_writes";

export function bumpMetricStatement(
  db: D1DatabaseLike,
  vaultId: string,
  dateUtc: string,
  field: MetricField,
  amount: number,
): D1Statement {
  // Safe field values are guaranteed by the MetricField literal type.
  return stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, ${field}) VALUES (?1, ?2, ?3)
       ON CONFLICT(vault_id, date_utc) DO UPDATE SET ${field} = ${field} + ?3`,
    [vaultId, dateUtc, amount],
  );
}

/** Non-critical metrics bump — failures must not break the sync path. */
export async function recordMetrics(
  db: D1DatabaseLike,
  vaultId: string,
  dateUtc: string,
  data: { writes: number; reads: number; uploadBytes: number; requests: number; d1Writes?: number },
): Promise<void> {
  try {
    await db.batch([
      bumpMetricStatement(db, vaultId, dateUtc, "data_object_writes", data.writes),
      bumpMetricStatement(db, vaultId, dateUtc, "data_object_reads", data.reads),
      bumpMetricStatement(db, vaultId, dateUtc, "upload_bytes", data.uploadBytes),
      bumpMetricStatement(db, vaultId, dateUtc, "worker_requests", data.requests),
      bumpMetricStatement(db, vaultId, dateUtc, "d1_writes", data.d1Writes ?? 0),
    ]);
  } catch {
    // metrics are best-effort estimates (documented); a metrics write failure
    // must never produce a user-visible sync error
  }
}
