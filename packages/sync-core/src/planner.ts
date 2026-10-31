/**
 * Conflict matrix as a pure decision function (spec §9.6).
 *
 * Inputs are: the local view of one file (journal state + current content
 * hash), and the remote view (change feed event / file head). The output is a
 * deterministic, reviewable action — the engine executes `Action` steps; it
 * never second-guesses the planner.
 */
import type { RevisionId } from "@vaultbridge/protocol";
import type { FileState, SyncJournalData } from "./state.js";

export type MatrixAction =
  | { kind: "noop" }
  | { kind: "pull"; revisionId: RevisionId }
  | { kind: "push"; baseRevisionId: RevisionId | null }
  | { kind: "push_delete"; baseRevisionId: RevisionId | null }
  /** Both sides advanced: attempt merge, else preserve both. */
  | { kind: "merge_then_push"; baseRevisionId: RevisionId; remoteRevisionId: RevisionId }
  | { kind: "preserve_both"; remoteRevisionId: RevisionId; origin: "remote_changed" | "edit_vs_delete" | "delete_vs_edit" | "rename_divergence" }
  /** Local says deleted, remote never knew and edit stream is untouched. */
  | { kind: "excluded_folder" };

export interface PlannerLocal {
  fileState: FileState | null;
  /** sha256 of the plaintext on disk right now (null = gone). */
  currentSha256: string | null;
  /** True when the local file is not represented by this fileId (unknown path). */
  pathKnown: boolean;
}

export interface PlannerRemote {
  /** Latest competing revision for this file (tombstone or content). */
  remoteRevisionId: RevisionId | null;
  remoteDeleted: boolean;
  /** True when the local device has already applied this remote revision. */
  localApplied: boolean;
  upfrontBase: RevisionId | null;
}

/** True when local content is exactly the last applied revision content. */
function localClean(local: PlannerLocal, remote: PlannerRemote): boolean {
  if (!local.fileState) {
    return true;
  }
  if (local.fileState.pendingOperationId) {
    return false;
  }
  if (local.currentSha256 === null) {
    return local.fileState.deletedLocally;
  }
  // clean when current content hash equals the last synced hash
  return local.fileState.plaintextSha256 !== null && local.currentSha256 === local.fileState.plaintextSha256;
}

/**
 * Decision matrix implementation. Note: `localApplied` is derived from reading
 * the remote event revision against the journal (remote revision === ours).
 */
export function decideForFile(local: PlannerLocal, remote: PlannerRemote): MatrixAction {
  const remoteRev = remote.remoteRevisionId;

  // Remote already applied locally and nothing dirty => normal no-op.
  if (remote.localApplied && localClean(local, remote)) {
    return { kind: "noop" };
  }

  // Excluded/not-tracked path: treat as no-op (never a deletion, spec §9.6).
  if (!local.pathKnown && !remote.localApplied) {
    return { kind: "excluded_folder" };
  }

  // New local file, nothing on the server.
  if (!local.fileState && local.currentSha256 !== null) {
    return { kind: "push", baseRevisionId: null };
  }

  const dirty = !localClean(local, remote);
  const hasPendingOp = !!local.fileState?.pendingOperationId;

  if (dirty || hasPendingOp) {
    if (remoteRev === null || remote.localApplied) {
      // Local changed, remote still at base (or remote got nothing new).
      return { kind: "push", baseRevisionId: remote.localApplied ? remote.upfrontBase : (local.fileState?.lastAppliedRevisionId ?? null) };
    }
    if (remote.remoteDeleted) {
      // Local edit vs remote delete: preserve both (spec row 5).
      return { kind: "preserve_both", remoteRevisionId: remoteRev, origin: "edit_vs_delete" };
    }
    const baseRev = local.fileState?.lastAppliedRevisionId ?? null;
    if (baseIsAuthentic(local, remote) && baseRev !== null) {
      // Local changed, remote independently advanced: attempt three-way merge.
      return { kind: "merge_then_push", baseRevisionId: baseRev, remoteRevisionId: remoteRev };
    }
    return { kind: "preserve_both", remoteRevisionId: remoteRev, origin: "remote_changed" };
  }

  // Local clean:
  if (remote.remoteDeleted) {
    if (remoteRev !== null) {
      return { kind: "pull", revisionId: remoteRev };
    }
    return { kind: "noop" }; // remote deleted before any known revision
  }
  if (!remote.localApplied && remoteRev !== null) {
    return { kind: "pull", revisionId: remoteRev };
  }
  return { kind: "noop" };
}

/**
 * Base revision is authentic for merging only when it is the revision the
 * local edits actually forked from AND we can retrieve its content from the
 * server (engine enforces retrievability; here we check identity).
 */
function baseIsAuthentic(local: PlannerLocal, _remote: PlannerRemote): boolean {
  return !!local.fileState?.lastAppliedRevisionId;
}

/** Helper used by engine to detect divergent-rename ambiguity (spec §9.7). */
export function detectRenameDivergence(
  journal: SyncJournalData,
  fileId: string,
  newLocalPaths: Record<string, string>,
): boolean {
  const first = newLocalPaths[fileId];
  if (!first) {
    return false;
  }
  // The journal may already hold a different pending rename target.
  const pendingId = journal.files[fileId]?.pendingOperationId;
  const pending = pendingId ? journal.pending[pendingId] : null;
  return !!(pending?.newLocalPath && pending.newLocalPath !== first);
}
