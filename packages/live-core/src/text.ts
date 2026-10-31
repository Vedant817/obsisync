/**
 * Text edits for Y.Text.
 *
 * `applyTextChange` turns "the text is now X" into the smallest set of
 * character inserts and deletes, so concurrent edits elsewhere in the note
 * survive the merge. `mergeText` is a fuzzy three-way merge used when no CRDT
 * history covers both sides (typing during join, external edits).
 */
import DiffMatchPatch from "diff-match-patch";
import type * as Y from "yjs";

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5;
dmp.Match_Threshold = 0.4;
dmp.Patch_DeleteThreshold = 0.5;

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;

export interface TextOp {
  index: number;
  delete: number;
  insert: string;
}

/** Ordered ops that turn `from` into `to`. Indexes are in the evolving text. */
export function textOps(from: string, to: string): TextOp[] {
  if (from === to) {
    return [];
  }
  const diffs = dmp.diff_main(from, to, true);
  dmp.diff_cleanupSemanticLossless(diffs);
  const ops: TextOp[] = [];
  let index = 0;
  for (const [op, text] of diffs) {
    if (op === DIFF_DELETE) {
      const last = ops[ops.length - 1];
      if (last && last.index === index && last.insert === "") {
        last.delete += text.length;
      } else {
        ops.push({ index, delete: text.length, insert: "" });
      }
    } else if (op === DIFF_INSERT) {
      const last = ops[ops.length - 1];
      if (last && last.index === index && last.insert === "") {
        last.insert = text;
      } else {
        ops.push({ index, delete: 0, insert: text });
      }
      index += text.length;
    } else {
      index += text.length;
    }
  }
  return ops;
}

/** Edit `ytext` (which currently reads `from`) so it reads `to`. */
export function applyTextChange(ytext: Y.Text, to: string, origin: unknown = null): boolean {
  const from = ytext.toJSON();
  const ops = textOps(from, to);
  if (ops.length === 0) {
    return false;
  }
  const doc = ytext.doc;
  const run = () => {
    for (const op of ops) {
      if (op.delete > 0) {
        ytext.delete(op.index, op.delete);
      }
      if (op.insert) {
        ytext.insert(op.index, op.insert);
      }
    }
  };
  if (doc) {
    doc.transact(run, origin);
  } else {
    run();
  }
  return true;
}

/**
 * Apply the change `base -> mine` on top of `theirs`. Hunks that no longer
 * match are dropped rather than corrupting the text; the result always
 * contains `theirs` where the patches did not apply.
 */
export function mergeText(base: string, mine: string, theirs: string): string {
  if (base === mine) {
    return theirs;
  }
  if (base === theirs) {
    return mine;
  }
  if (mine === theirs) {
    return mine;
  }
  const patches = dmp.patch_make(base, mine);
  const [merged] = dmp.patch_apply(patches, theirs);
  return merged;
}
