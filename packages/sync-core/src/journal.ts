/**
 * Durable journal (spec §9.2: "journal must be committed before a destructive
 * or network action"). The engine awaits `persist()` before staging, uploading
 * or acknowledging; persistence failures abort the cycle (fail closed).
 */
import type { FileId } from "@vaultbridge/protocol";
import type { JournalPersistence } from "./ports.js";
import {
  emptyJournal,
  parseJournal,
  serializeJournal,
  type ConflictRecord,
  type FileState,
  type PendingOperation,
  type SyncJournalData,
} from "./state.js";

export class SyncJournal {
  private data: SyncJournalData;
  private persistence: JournalPersistence;

  constructor(persistence: JournalPersistence) {
    this.persistence = persistence;
    this.data = emptyJournal();
  }

  get raw(): SyncJournalData {
    return this.data;
  }

  async load(): Promise<boolean> {
    const loaded = await this.persistence.load();
    if (loaded) {
      this.data = loaded;
      return true;
    }
    return false;
  }

  /** Durable write helper — every mutating engine step funnels through here. */
  async persist(): Promise<void> {
    await this.persistence.save(this.data);
  }

  getFile(fileId: FileId): FileState | null {
    return this.data.files[fileId] ?? null;
  }

  get fileIdForPath(): (path: string) => FileId | null {
    return (path) => this.data.pathToFileId[path] ?? null;
  }

  /** Drop a local file id so another id can own its path. Does not touch the vault. */
  forgetFile(fileId: string): void {
    const file = this.data.files[fileId];
    if (!file) {
      return;
    }
    if (this.data.pathToFileId[file.localPath] === fileId) {
      delete this.data.pathToFileId[file.localPath];
    }
    for (const [operationId, pending] of Object.entries(this.data.pending)) {
      if (pending.fileId === fileId) {
        delete this.data.pending[operationId];
      }
    }
    delete this.data.files[fileId];
    delete this.data.conflicts[fileId];
  }

  /**
   * Keep a file id in the journal without a path. Used when its bytes were
   * merged into another note, so a later pull does not create a second file.
   */
  foldAway(fileId: string, supersededBy: string, revisionId: string | null): void {
    const previous = this.data.files[fileId];
    if (previous && this.data.pathToFileId[previous.localPath] === fileId) {
      delete this.data.pathToFileId[previous.localPath];
    }
    for (const [operationId, pending] of Object.entries(this.data.pending)) {
      if (pending.fileId === fileId) {
        delete this.data.pending[operationId];
      }
    }
    this.data.files[fileId] = {
      fileId,
      localPath: previous?.localPath ?? supersededBy,
      lastAppliedRevisionId: revisionId,
      plaintextSha256: previous?.plaintextSha256 ?? null,
      deletedLocally: true,
      supersededBy,
      pendingOperationId: undefined,
    };
  }

  /** Drop path ownership without deleting the file record. */
  releasePath(path: string, fileId: string): void {
    if (this.data.pathToFileId[path] === fileId) {
      delete this.data.pathToFileId[path];
    }
  }

  trackFile(state: FileState): void {
    const owner = this.data.pathToFileId[state.localPath];
    if (owner && owner !== state.fileId) {
      throw new Error(`path ${state.localPath} belongs to ${owner}`);
    }
    const previous = this.data.files[state.fileId];
    if (previous && previous.localPath !== state.localPath && this.data.pathToFileId[previous.localPath] === state.fileId) {
      delete this.data.pathToFileId[previous.localPath];
    }
    this.data.files[state.fileId] = state;
    this.data.pathToFileId[state.localPath] = state.fileId;
  }

  updateFile(fileId: FileId, patch: Partial<FileState>): FileState {
    const current = this.data.files[fileId]!;
    const next = { ...current, ...patch };
    if (next.localPath !== current.localPath) {
      const destOwner = this.data.pathToFileId[next.localPath];
      if (destOwner && destOwner !== fileId) {
        throw new Error(`path ${next.localPath} belongs to ${destOwner}`);
      }
      const staleId = this.data.pathToFileId[current.localPath];
      if (staleId === fileId) {
        delete this.data.pathToFileId[current.localPath];
      }
      this.data.pathToFileId[next.localPath] = fileId;
    }
    this.data.files[fileId] = next;
    return next;
  }

  get fileStates(): FileState[] {
    return Object.values(this.data.files);
  }

  pendingList(): PendingOperation[] {
    return Object.values(this.data.pending).sort((a, b) => a.createdAt - b.createdAt);
  }

  putPending(op: PendingOperation): void {
    this.data.pending[op.operationId] = op;
    const file = this.data.files[op.fileId];
    if (file) {
      this.data.files[op.fileId] = { ...file, pendingOperationId: op.operationId };
    }
  }

  dropPending(operationId: string): void {
    const op = this.data.pending[operationId];
    if (op) {
      delete this.data.pending[operationId];
      const file = this.data.files[op.fileId];
      if (file && file.pendingOperationId === operationId) {
        this.data.files[op.fileId] = { ...file, pendingOperationId: undefined };
      }
    }
  }

  bumpPendingRetry(operationId: string): void {
    const op = this.data.pending[operationId];
    if (op) {
      this.data.pending[operationId] = { ...op, retryCount: op.retryCount + 1 };
    }
  }

  addConflict(record: ConflictRecord): void {
    this.data.conflicts[record.fileId] = record;
  }

  resolveConflict(fileId: FileId): void {
    const rec = this.data.conflicts[fileId];
    if (rec) {
      this.data.conflicts[fileId] = { ...rec, resolved: true };
    }
  }

  unresolvedConflicts(): ConflictRecord[] {
    return Object.values(this.data.conflicts).filter((c) => !c.resolved);
  }

  get cursor(): number {
    return this.data.cursor;
  }

  setCursor(seq: number): void {
    if (seq > this.data.cursor) {
      this.data.cursor = seq;
    }
  }

  pause(reason: string): void {
    this.data.pausedReason = reason;
  }

  resume(): void {
    this.data.pausedReason = null;
  }

  bumpStats(patch: Partial<SyncJournalData["stats"]>): void {
    this.data.stats = { ...this.data.stats, ...patch };
  }

  /** Strict recovery of a persisted snapshot (fail closed on corruption). */
  async restoreOrReset(): Promise<"restored" | "fresh" | "corrupt-rebuilt"> {
    const loaded = await this.persistence.load();
    if (!loaded) {
      return "fresh";
    }
    const parsed = parseJournal(serializeJournal(loaded));
    if (parsed.ok) {
      this.data = parsed.journal;
      return "restored";
    }
    // Corrupt journal: start clean; the server change feed + rescan rebuild state.
    this.data = emptyJournal();
    await this.persist();
    return "corrupt-rebuilt";
  }
}
