/**
 * Conflict-matrix rows (spec §9.6) as deterministic planner decisions.
 */
import { describe, expect, it } from "vitest";
import { decideForFile, type PlannerLocal, type PlannerRemote } from "../src/planner.js";
import type { FileState } from "../src/state.js";

function fileState(patch: Partial<FileState> = {}): FileState {
  return {
    fileId: "file000000000001",
    localPath: "notes/a.md",
    lastAppliedRevisionId: null,
    plaintextSha256: null,
    deletedLocally: false,
    ...patch,
  };
}

function local(
  patch: { currentSha256?: string | null; pathKnown?: boolean; file?: Partial<FileState> } = {},
): PlannerLocal {
  const { currentSha256 = null, pathKnown = true, file } = patch;
  return {
    fileState: file ? fileState(file) : null,
    currentSha256,
    pathKnown,
  };
}

function remote(patch: Partial<PlannerRemote> = {}): PlannerRemote {
  return { remoteRevisionId: null, remoteDeleted: false, localApplied: false, upfrontBase: null, ...patch };
}

describe("decideForFile (spec §9.6 conflict matrix)", () => {
  it("row: everything applied and local clean => noop", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r2", plaintextSha256: "h2" }, currentSha256: "h2" }),
      remote({ remoteRevisionId: "r2", localApplied: true }),
    );
    expect(action).toEqual({ kind: "noop" });
  });

  it("row: unknown/untracked path => excluded_folder (never a deletion)", () => {
    const action = decideForFile(local({ pathKnown: false }), remote({}));
    expect(action).toEqual({ kind: "excluded_folder" });
  });

  it("row: brand-new local file, server has nothing => push", () => {
    const action = decideForFile(local({ currentSha256: "h" }), remote({}));
    expect(action).toEqual({ kind: "push", baseRevisionId: null });
  });

  it("row: local edit, remote still at base => push onto base", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: "h1-edit" }),
      remote({}),
    );
    expect(action).toEqual({ kind: "push", baseRevisionId: "r1" });
  });

  it("row: local edit vs remote delete => preserve both (edit_vs_delete)", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: "h1-edit" }),
      remote({ remoteRevisionId: "r2", remoteDeleted: true }),
    );
    expect(action).toEqual({ kind: "preserve_both", remoteRevisionId: "r2", origin: "edit_vs_delete" });
  });

  it("row: divergent edits with authentic base => merge_then_push", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: "h1-edit" }),
      remote({ remoteRevisionId: "r2" }),
    );
    expect(action).toEqual({ kind: "merge_then_push", baseRevisionId: "r1", remoteRevisionId: "r2" });
  });

  it("row: divergent edits without an authentic base => preserve both (remote_changed)", () => {
    const action = decideForFile(
      local({ file: { plaintextSha256: "h1" }, currentSha256: "h1-edit" }),
      remote({ remoteRevisionId: "r2" }),
    );
    expect(action).toEqual({ kind: "preserve_both", remoteRevisionId: "r2", origin: "remote_changed" });
  });

  it("row: clean local vs remote tombstone => pull (tombstone applies deletion)", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: "h1" }),
      remote({ remoteRevisionId: "r2", remoteDeleted: true }),
    );
    expect(action).toEqual({ kind: "pull", revisionId: "r2" });
  });

  it("row: clean local vs remote content advance => pull", () => {
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: "h1" }),
      remote({ remoteRevisionId: "r2" }),
    );
    expect(action).toEqual({ kind: "pull", revisionId: "r2" });
  });

  it("row: unapplied remote on an ignored path => excluded_folder still (never deletes)", () => {
    const action = decideForFile(local({ pathKnown: false }), remote({ remoteRevisionId: "r9" }));
    expect(action).toEqual({ kind: "excluded_folder" });
  });

  it("row: tracked path whose disk content vanished without a pending delete => push onto base", () => {
    // hashFile null + deletedLocally false => not clean; remote at base => push
    const action = decideForFile(
      local({ file: { lastAppliedRevisionId: "r1", plaintextSha256: "h1" }, currentSha256: null }),
      remote({}),
    );
    expect(action).toEqual({ kind: "push", baseRevisionId: "r1" });
  });
});
