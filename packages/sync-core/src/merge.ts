/**
 * Three-way diff3 merge for UTF-8 text (spec §9.6: only for Markdown and only
 * with an authentic base). Non-overlapping hunks auto-merge; overlapping
 * divergent hunks produce conflict markers and `needsReview: true`.
 *
 * Safety gates honored:
 *  - non-UTF-8 / binary content => unsupported
 *  - missing base => unsupported (review instead)
 *  - deletion ratio above threshold => needsReview
 */
export interface MergeOutcome {
  kind: "merged" | "needsReview" | "unsupported";
  /** Merged text or original local content when review keeps local. */
  text: string | null;
  /** Human summary for the UI. */
  detail: string;
}

const MAX_MERGE_LINES = 20_000;
const DELETION_RATIO_GATE = 0.6;
const CONTEXT_LABELS = { base: "base", local: "local", remote: "remote" } as const;

type DiffSpan = { baseStart: number; baseEnd: number; otherStart: number; otherEnd: number };

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.replace(/\r\n/g, "\n").split("\n");
}

function lcsSpans(a: string[], b: string[]): DiffSpan[] {
  const n = a.length;
  const m = b.length;
  // LCS DP table (O(n*m) with hard cap upstream — files beyond cap are unsupported).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const spans: DiffSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      // extend or open a matched region
      const last = spans[spans.length - 1];
      if (last && last.baseEnd === i && last.otherEnd === j) {
        last.baseEnd++;
        last.otherEnd++;
      } else {
        spans.push({ baseStart: i, baseEnd: i + 1, otherStart: j, otherEnd: j + 1 });
      }
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return spans.length === 0 ? [{ baseStart: 0, baseEnd: 0, otherStart: 0, otherEnd: 0 }] : spans;
}

interface Hunk {
  baseStart: number;
  baseEnd: number;
  side: "local" | "remote";
  lines: string[];
  start: number;
  end: number;
}

/** Convert LCS spans into coarse changed hunks on BASE coordinates. */
function changedHunks(base: string[], other: string[], side: "local" | "remote"): Hunk[] {
  const spans = lcsSpans(base, other);
  const hunks: Hunk[] = [];
  let cursorOther = 0;
  let cursorBase = 0;
  for (const span of spans) {
    if (span.otherStart > cursorOther || span.baseStart > cursorBase) {
      hunks.push({
        baseStart: cursorBase,
        baseEnd: span.baseStart,
        side,
        lines: other.slice(cursorOther, span.otherStart),
        start: cursorBase,
        end: span.baseStart,
      });
    }
    cursorBase = span.baseEnd;
    cursorOther = span.otherEnd;
  }
  if (cursorOther < other.length || cursorBase < base.length) {
    hunks.push({
      baseStart: cursorBase,
      baseEnd: base.length,
      side,
      lines: other.slice(cursorOther),
      start: cursorBase,
      end: base.length,
    });
  }
  return hunks.filter((h) => h.baseStart !== h.baseEnd || h.lines.length > 0);
}

function charsDeleted(base: string[], hunk: Hunk): number {
  return hunk.baseEnd - hunk.baseStart;
}

export function merge3(baseText: string, localText: string, remoteText: string, labels = CONTEXT_LABELS): MergeOutcome {
  if (isProbablyBinary(baseText) || isProbablyBinary(localText) || isProbablyBinary(remoteText)) {
    return { kind: "unsupported", text: null, detail: "binary-looking content; byte merge is never attempted" };
  }
  const base = splitLines(baseText);
  const local = splitLines(localText);
  const remote = splitLines(remoteText);
  if (base.length > MAX_MERGE_LINES || local.length > MAX_MERGE_LINES || remote.length > MAX_MERGE_LINES) {
    return { kind: "unsupported", text: null, detail: "file exceeds merge safety size" };
  }
  if (baseText === "") {
    return { kind: "unsupported", text: null, detail: "missing or empty base; merge not attempted" };
  }

  const localHunks = changedHunks(base, local, "local");
  const remoteHunks = changedHunks(base, remote, "remote");

  // Deletion-ratio gate (spec: "high deletion ratios ... prompt user review").
  const baseTotal = base.length;
  const deletedByLocal = localHunks.reduce((acc, h) => acc + (h.lines.length === 0 ? charsDeleted(base, h) : 0), 0);
  const deletedByRemote = remoteHunks.reduce((acc, h) => acc + (h.lines.length === 0 ? charsDeleted(base, h) : 0), 0);
  if (baseTotal > 0 && (deletedByLocal / baseTotal > DELETION_RATIO_GATE || deletedByRemote / baseTotal > DELETION_RATIO_GATE)) {
    return { kind: "needsReview", text: null, detail: "high deletion ratio; manual review required" };
  }

  // Merge walk: hunks grouped by overlapping base ranges.
  const all = [...localHunks, ...remoteHunks].sort((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd);
  const merged: string[] = [];
  let basePos = 0;
  for (let idx = 0; idx < all.length; idx++) {
    const h = all[idx]!;
    // Copy unchanged base region.
    if (h.baseStart > basePos) {
      merged.push(...base.slice(basePos, h.baseStart));
      basePos = h.baseStart;
    }
    // Find all overlapping hunks (touching same base range).
    const group = [h];
    let end = h.baseEnd;
    let j = idx + 1;
    while (j < all.length && all[j]!.baseStart <= end) {
      group.push(all[j]!);
      end = Math.max(end, all[j]!.baseEnd);
      j++;
    }
    idx = j - 1;
    const sides = new Set(group.map((g) => g.side));
    const applied = identicalText(group);
    if (group.length === 1 || applied) {
      // One side changed (or both changed identically): take it, dedupe when both.
      merged.push(...group[0]!.lines);
      basePos = end;
      continue;
    }
    if (sides.size === 2 && !applied) {
      // Overlapping divergent edits: conflict markers (UI offers review).
      const mergedText = merged.join("\n");
      return conflictOutcome(base, local, remote, labels, basePos, mergedText, end);
    }
    merged.push(...group[0]!.lines);
    basePos = end;
  }
  if (basePos < base.length) {
    merged.push(...base.slice(basePos));
  }
  return { kind: "merged", text: merged.join("\n"), detail: `auto-merged ${all.length} hun(s)` };
}

function identicalText(group: Hunk[]): boolean {
  if (group.length < 2) {
    return true;
  }
  const first = group[0]!.lines.join("\n");
  return group.every((g) => g.lines.join("\n") === first);
}

function conflictOutcome(
  base: string[],
  local: string[],
  remote: string[],
  labels: { base: string; local: string; remote: string },
  basePos: number,
  mergedSoFarPrefix: string,
  endBase: number,
): MergeOutcome {
  const unmergedBaseRest = base.slice(endBase).join("\n");
  const localRest = local.join("\n");
  const remoteRest = remote.join("\n");
  const text = [
    mergedSoFarPrefix || "",
    `<<<<<<< ${labels.local}`,
    localRest,
    `=======`,
    remoteRest,
    `>>>>>>> ${labels.remote}`,
    "",
  ].join("\n");
  // Context: keep everything after the conflicted base region from local for
  // review; the reviewer decides. Documented limitation: markers cover the
  // whole remainder rather than per-hunk stitching (conservative, never sorter).
  return {
    kind: "needsReview",
    text: text.replace(/<<<<<<< local\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> remote\n/, (_m, l, r) => {
      return `<<<<<<< ${labels.local}\n${l}\n=======\n${r || unmergedBaseRest}\n>>>>>>> ${labels.remote}\n`;
    }),
    detail: `overlapping edits at base line ${basePos}; kept both sides with markers`,
  };
}

function isProbablyBinary(text: string): boolean {
  if (text.includes("\u0000")) {
    return true;
  }
  // More than 1% replacement chars => treat as non-UTF-8-safe text.
  let bad = 0;
  for (let i = 0; i < text.length && bad <= 8; i += 512) {
    if (text[i] === "\uFFFD") {
      bad++;
    }
  }
  return bad > 8;
}

void CONTEXT_LABELS;
