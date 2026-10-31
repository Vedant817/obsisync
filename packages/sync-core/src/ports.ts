/**
 * Platform ports (spec §13.1 packages/sync-core is platform-agnostic).
 *
 * The Obsidian plugin provides implementations of LocalVault + durable
 * persistence; the worker-harness or the real HTTP API provides SyncTransport.
 */
import type {
  ChangesResponse,
  CommitRequest,
  CommitResponse,
  FileHeadWire,
  ReserveUploadRequest,
  ReserveUploadResponse,
  RevisionMeta,
  UsageResponse,
} from "@vaultbridge/protocol";
import type { SyncJournalData } from "./state.js";

export interface LocalFileMeta {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Vault filesystem port. Adapters must return the FULL tracked listing from
 * `listFiles()` when configured (using the plugin's settings for exclusions);
 * the engine never infers deletions from partial listings.
 */
export interface LocalVault {
  listFiles(): Promise<LocalFileMeta[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** sha256 hex of current file content; null when the path is gone. */
  hashFile(path: string): Promise<string | null>;
  /**
   * Snapshot local state before overwriting it remotely — the safety net of
   * spec §9.2 (never destroy unsynced local edits silently).
   */
  snapshot(path: string, label: string): Promise<void>;
}

/** Byte-level API port (implemented by worker-harness client or fetch client). */
export interface SyncTransport {
  health(): Promise<{ status: number }>;
  fetchChanges(after: number, limit: number): Promise<ChangesResponse>;
  getFileHead(fileId: string): Promise<FileHeadWire | null>;
  getRevision(revisionId: string): Promise<RevisionMeta | null>;
  reserveUpload(request: ReserveUploadRequest): Promise<ReserveUploadResponse>;
  uploadObject(uploadId: string, bytes: Uint8Array): Promise<void>;
  commit(request: CommitRequest): Promise<CommitResponse>;
  /** Encrypted bytes (blob or manifest object) for an object id. */
  getObject(objectId: string): Promise<Uint8Array | null>;
  usage(): Promise<UsageResponse | null>;
}

export interface JournalPersistence {
  /** Must throw on failure: the engine treats a failed persist as stop-the-cycle. */
  save(journal: SyncJournalData): Promise<void>;
  load(): Promise<SyncJournalData | null>;
}

/**
 * Thrown by transports for temporarily un-makable conditions (network down,
 * 5xx, rate limit, auth revoked). The engine pauses cleanly instead of
 * error-storming every pending operation (spec §12.2 degraded modes).
 */
export class SyncTransportUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(`transport unavailable: ${reason}`, options);
    this.name = "SyncTransportUnavailableError";
    this.reason = reason;
  }
}

/** Decisive transport HTTP failure (not temporary): surfaces to callers. */
export class HttpTransportError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, detail: string) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}: ${detail}`);
    this.name = "HttpTransportError";
    this.status = status;
    this.code = code;
  }
}

export interface CycleBudget {
  /** Per-cycle caps enforced BEFORE each network action. */
  maxUploadsPerCycle: number;
  /** Pending-queue storm threshold (bulk delete/edit wave). */
  maxPendingForAutoRun: number;
}

export const DEFAULT_CYCLE_BUDGET: CycleBudget = {
  maxUploadsPerCycle: 200,
  maxPendingForAutoRun: 2_000,
};

export interface SyncCycleOptions {
  budget?: Partial<CycleBudget>;
  /** Safety pause predicate checked before each push (cost guard, WP-08). */
  pauseRequested?: () => string | null;
  /** Enable automatic three-way merge for UTF-8 markdown conflicts. */
  autoMerge?: boolean;
  /** Max single-object bytes to stage to the server. */
  maxObjectBytes?: number;
}

export const DEFAULT_SYNC_CYCLE_OPTIONS: SyncCycleOptions = {
  budget: DEFAULT_CYCLE_BUDGET,
  autoMerge: true,
  maxObjectBytes: 50 * 1024 * 1024,
};
