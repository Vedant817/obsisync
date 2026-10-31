import { describe, expect, it } from "vitest";
import { ChangeSet, Text } from "@codemirror/state";
import * as Y from "yjs";
import { applyChangesToYText, deltaToChanges, editorChangesTo } from "../src/live-cm.js";
import { liveEligible } from "../src/live-eligible.js";

function textOf(s: string): Text {
  return Text.of(s.split("\n"));
}

let seed = 42;
function rand(n: number): number {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed % n;
}

function randomEdit(s: string): string {
  const pos = rand(s.length + 1);
  const del = Math.min(rand(4), s.length - pos);
  const ins = ["", "x", "ab", "\n", "😀", "hello\nworld"][rand(6)]!;
  return s.slice(0, pos) + ins + s.slice(pos + del);
}

describe("editor <-> Y.Text translation", () => {
  it("editorChangesTo turns any editor text into the target in one transaction", () => {
    let current = "line one\nline two\nline three";
    for (let i = 0; i < 200; i++) {
      let target = current;
      for (let k = 0; k < 1 + rand(4); k++) {
        target = randomEdit(target);
      }
      const doc = textOf(current);
      const next = ChangeSet.of(editorChangesTo(current, target), doc.length).apply(doc);
      expect(next.toString()).toBe(target);
      current = target;
    }
  });

  it("local editor changes land in Y.Text at the right offsets", () => {
    for (let i = 0; i < 200; i++) {
      const before = "alpha\nbeta\ngamma\n".repeat(1 + rand(3));
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText("content");
      ytext.insert(0, before);
      // A multi-range change, like multi-cursor typing.
      const a = rand(before.length);
      const b = Math.min(before.length, a + 2 + rand(5));
      const spec = [
        { from: 0, to: Math.min(1, a), insert: "Z" },
        { from: a, to: b, insert: "mid" },
        { from: before.length, insert: "\nend" },
      ].filter((c, idx, all) => idx === 0 || c.from >= (all[idx - 1]!.to ?? all[idx - 1]!.from));
      const changes = ChangeSet.of(spec, before.length);
      const expected = changes.apply(textOf(before)).toString();
      ydoc.transact(() => applyChangesToYText(ytext, (fn) => changes.iterChanges(fn)));
      expect(ytext.toString()).toBe(expected);
    }
  });

  it("remote Y.Text deltas replay onto the editor text", () => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    ytext.insert(0, "The quick brown fox");
    let editor = textOf(ytext.toString());
    ytext.observe((event) => {
      const { changes, lengthBefore, lengthAfter } = deltaToChanges(event.delta as never);
      expect(editor.length).toBe(ytext.length - lengthAfter + lengthBefore);
      editor = ChangeSet.of(changes, editor.length).apply(editor);
    });
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(ydoc));
    for (let i = 0; i < 100; i++) {
      const rt = remote.getText("content");
      remote.transact(() => {
        const pos = rand(rt.length + 1);
        if (rand(2) === 0 && pos < rt.length) {
          rt.delete(pos, Math.min(1 + rand(3), rt.length - pos));
        }
        rt.insert(rand(rt.length + 1), ["a", "\n", "xyz", "😀"][rand(4)]!);
      });
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(ydoc)));
      expect(editor.toString()).toBe(ytext.toString());
    }
  });
});

describe("which notes go live", () => {
  it("covers markdown and text under the size cap only", () => {
    expect(liveEligible("Notes/a.md", 10, ".obsidian")).toBe(true);
    expect(liveEligible("Notes/a.MD", 10, ".obsidian")).toBe(true);
    expect(liveEligible("todo.txt", 10, ".obsidian")).toBe(true);
    expect(liveEligible("img.png", 10, ".obsidian")).toBe(false);
    expect(liveEligible("board.canvas", 10, ".obsidian")).toBe(false);
    expect(liveEligible("big.md", 2_000_000, ".obsidian")).toBe(false);
    expect(liveEligible(".obsidian/app.md", 10, ".obsidian")).toBe(false);
  });
});
