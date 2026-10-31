/**
 * diff3 merge gates (spec §9.6): auto-merge only safe, text, based content;
 * everything else escalates to review instead of guessing.
 */
import { describe, expect, it } from "vitest";
import { merge3 } from "../src/merge.js";

describe("merge3", () => {
  it("auto-merges non-overlapping local and remote edits", () => {
    const base = "line1\nline2\nline3";
    const out = merge3(base, "line1-LOCAL\nline2\nline3", "line1\nline2\nline3-REMOTE");
    expect(out.kind).toBe("merged");
    expect(out.text).toBe("line1-LOCAL\nline2\nline3-REMOTE");
  });

  it("takes identical changes once (both sides made the same edit)", () => {
    const base = "a\nb\nc";
    const out = merge3(base, "A\nb\nc", "A\nb\nc");
    expect(out.kind).toBe("merged");
    expect(out.text).toBe("A\nb\nc");
  });

  it("returns needsReview with conflict markers for overlapping divergent edits", () => {
    const base = "one\ntwo\nthree";
    const out = merge3(base, "ONE\ntwo\nthree", "UNO\ntwo\nthree");
    expect(out.kind).toBe("needsReview");
    expect(out.text).toContain("<<<<<<< local");
    expect(out.text).toContain("ONE");
    expect(out.text).toContain("UNO");
    expect(out.text).toContain("=======");
    expect(out.text).toContain(">>>>>>> remote");
  });

  it("never attempts a byte merge on binary-looking content", () => {
    const binary = "\u0000\u0001\u0002 binary-ish";
    const out = merge3(binary, binary + "x", binary + "y");
    expect(out.kind).toBe("unsupported");
    expect(out.detail).toMatch(/binary/i);
  });

  it("refuses an empty or missing base (no authentic base => review)", () => {
    const out = merge3("", "local text", "remote text");
    expect(out.kind).toBe("unsupported");
    expect(out.detail).toMatch(/base/i);
  });

  it("escalates a high deletion ratio to review instead of merging", () => {
    const base = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const local = base.split("\n").slice(0, 3).join("\n"); // deletes 7/10 lines
    const remote = "line 0 edited\n" + base.split("\n").slice(1).join("\n");
    const out = merge3(base, local, remote);
    expect(out.kind).toBe("needsReview");
    expect(out.detail).toMatch(/deletion/i);
  });

  it("normalizes CRLF to LF in the merged output", () => {
    const base = "l1\r\nl2\r\nl3\r\nl4";
    const out = merge3(base, "L1\r\nl2\r\nl3\r\nl4", "l1\r\nl2\r\nl3\r\nl4");
    expect(out.kind).toBe("merged");
    expect(out.text).toBe("L1\nl2\nl3\nl4");
  });

  it("keeps base-only content when only one side edits a region", () => {
    const base = "keep\nedit\nkeep2";
    const out = merge3(base, base, "keep\nedit\nkeep2-REMOTE");
    expect(out.kind).toBe("merged");
    expect(out.text).toBe("keep\nedit\nkeep2-REMOTE");
  });
});
