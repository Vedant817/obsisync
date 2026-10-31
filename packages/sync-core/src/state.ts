/**
 * Durable local state model (spec §9.1/§9.2).
 *
 * Everything here is serialized into the device journal and must survive
 * crash/upgrade/eviction. Plaintext paths and hashes live device-side only —
 * nothing in this file ever crosses the network.
 */
import type { FileId, RevisionId } from "@vaultbridge/protocol";

/** Sync state machine, exactly per spec §9.1 (deterministic subset for engine). */
export type SyncStatus =
  | "UNCONFIGURED"
  | "LOCKED"
  | "READY"
  | "SCANNING"
  | "RECONCILING"
  | "SYNCING"
  | "CONFLICT"
  | "OFFLINE"
  | "PAUSED";

export interface FileState {
  fileId: FileId;
  localPath: string;
  /** Remote revision whose content is reflected on disk (or null = never applied). */
  lastAppliedRevisionId: RevisionId | null;
  /** sha256 of the locally synced plaintext (null = unknown/never hashed). */
  plaintextSha256: string | null;
  pendingOperationId?: string;
  deletedLocally: boolean;
  /**
   * This file id was folded into another note. It must not own a path, and
   * later revisions are merged into `supersededBy` instead of a second file.
   */
  supersededBy?: string;
  /** Optimization inputs only — never proof of identity (spec §9.2). */
  lastSyncedSize?: number;
  lastSyncedMtime?: number;
}

export type PendingAction = "upsert" | "delete" | "rename";
export type PendingStage = "captured" | "encrypted" | "uploaded" | "committed";

export interface PendingOperation {
  operationId: string;
  fileId: FileId;
  baseRevisionId: RevisionId | null;
  action: PendingAction;
  /** sha256 hex of plaintext at capture time; re-verified before any push. */
  localContentFingerprint: string;
  /** Stored only for renames: the new device-side path. */
  newLocalPath?: string;
  createdAt: number;
  stage: PendingStage;
  retryCount: number;
  /** Envelope upload facts survive restarts (spec §13.3 recoverPendingStages). */
  stagedUploadId?: string;
  /**
   * Frozen commit attempt. Chosen once, persisted before the RPC, and replayed
   * verbatim if the response is lost. A new revision id under the same
   * operation id is rejected by the worker.
   */
  pinnedRevisionId?: string;
  pinnedUploadId?: string;
  pinnedPlaintextSha256?: string;
  pinnedCiphertextSha256?: string;
  pinnedCiphertextB64?: string;
  pinnedManifestObjectId?: string;
  pinnedManifestB64?: string;
}

/** device-only record of an unresolved divergence (spec §9.6/§9.7). */
export interface ConflictRecord {
  fileId: FileId;
  /** Unused. Older journals may still name a conflict copy. New conflicts keep one path. */
  otherPath: string | null;
  /** This device's text before a same-note merge. Keep mine writes it back. */
  localText?: string;
  /** The other device's text. Keep theirs writes it back when the server copy is gone. */
  remoteText?: string;
  baseRevisionId: RevisionId | null;
  remoteHeadRevisionId: RevisionId | null;
  origin: "remote_changed" | "delete_vs_edit" | "edit_vs_delete" | "rename_divergence";
  createdAt: number;
  resolved: boolean;
}

export interface SyncJournalData {
  journalVersion: 1;
  deviceId: string | null;
  /** monotonic monotonic ack of remote change feed (never ours ahead here). */
  cursor: number;
  files: Record<string, FileState>;
  /** by path for stable rename handling (fileId never changes). */
  pathToFileId: Record<string, FileId>;
  pending: Record<string, PendingOperation>;
  conflicts: Record<string, ConflictRecord>;
  /** Set when a cost/safety pause stopped the engine (spec §12.2). */
  pausedReason: string | null;
  /** Cycle counters for reporting/UI honesty. */
  stats: SyncStats;
}

export interface SyncStats {
  cyclesRun: number;
  lastCycleAt: number | null;
  totalPushes: number;
  totalPulls: number;
  totalConflicts: number;
  dataObjectPutsTotal: number;
  /** last cycle's PUT count — needs to read zero on no-op cycles (T01). */
  lastCyclePuts: number;
}

export function emptyJournal(deviceId: string | null = null): SyncJournalData {
  return {
    journalVersion: 1,
    deviceId,
    cursor: 0,
    files: {},
    pathToFileId: {},
    pending: {},
    conflicts: {},
    pausedReason: null,
    stats: {
      cyclesRun: 0,
      lastCycleAt: null,
      totalPushes: 0,
      totalPulls: 0,
      totalConflicts: 0,
      dataObjectPutsTotal: 0,
      lastCyclePuts: 0,
    },
  };
}

export type JournalParseResult =
  | { ok: true; journal: SyncJournalData }
  | { ok: false; reason: "unparseable" | "unknown-version" };

/** Strict, fail-closed journal decode: corrupted journal => rebuild from server. */
export function parseJournal(raw: string): JournalParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "unparseable" };
  }
  const data = parsed as Partial<SyncJournalData>;
  if (data.journalVersion !== 1) {
    return { ok: false, reason: "unknown-version" };
  }
  return {
    ok: true,
    journal: {
      ...emptyJournal(data.deviceId ?? null),
      ...data,
      files: data.files ?? {},
      pathToFileId: data.pathToFileId ?? {},
      pending: data.pending ?? {},
      conflicts: data.conflicts ?? {},
      stats: { ...emptyJournal().stats, ...(data.stats ?? {}) },
    } as SyncJournalData,
  };
}

export function serializeJournal(j: SyncJournalData): string {
  return JSON.stringify(j);
}
