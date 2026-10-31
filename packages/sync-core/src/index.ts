/**
 * VaultBridge sync-core: device-side engine with injectable ports.
 * See docs/sync-engine.md for the cycle semantics (spec §9.3).
 */
export {
  SyncJournal,
} from "./journal.js";
export {
  emptyJournal,
  parseJournal,
  serializeJournal,
  type ConflictRecord,
  type FileState,
  type PendingAction,
  type PendingOperation,
  type PendingStage,
  type SyncJournalData,
  type SyncStats,
  type SyncStatus,
} from "./state.js";
export {
  DEFAULT_CYCLE_BUDGET,
  DEFAULT_SYNC_CYCLE_OPTIONS,
  HttpTransportError,
  SyncTransportUnavailableError,
  type CycleBudget,
  type JournalPersistence,
  type LocalFileMeta,
  type LocalVault,
  type SyncCycleOptions,
  type SyncTransport,
} from "./ports.js";
export {
  HttpSyncTransport,
  type HttpCallInit,
  type HttpCallResult,
  type HttpSender,
  type HttpSyncTransportOptions,
} from "./transport-http.js";
export {
  collectCandidateChanges,
  type ScanCandidate,
  type ScanResult,
} from "./scanner.js";
export { decideForFile, type MatrixAction } from "./planner.js";
export { merge3, type MergeOutcome } from "./merge.js";
export { conflictCopyPath, createSyncEngine, normalizeLocalPath, type SyncCycleReport, type SyncEngine, type SyncEngineDeps } from "./engine.js";
