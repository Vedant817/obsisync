import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyTextChange, mergeText, textOps } from "../src/text.js";
import { LiveCipher, normalizeLivePath } from "../src/cipher.js";
import { randomKey } from "@vaultbridge/crypto";

function ytext(initial: string): Y.Text {
  const doc = new Y.Doc();
  const text = doc.getText("content");
  text.insert(0, initial);
  return text;
}

describe("text ops", () => {
  const cases: [string, string][] = [
    ["", "hello"],
    ["hello", ""],
    ["hello world", "hello brave world"],
    ["abc\ndef\nghi\n", "abc\nDEF\nghi\njkl\n"],
    ["same", "same"],
    ["emoji 😀 here", "emoji 😀😀 there"],
    ["a".repeat(5000), "a".repeat(2500) + "b" + "a".repeat(2500)],
  ];
  for (const [from, to] of cases) {
    it(`turns ${JSON.stringify(from.slice(0, 20))} into ${JSON.stringify(to.slice(0, 20))}`, () => {
      const text = ytext(from);
      applyTextChange(text, to);
      expect(text.toString()).toBe(to);
    });
  }

  it("touches only the changed span so concurrent edits elsewhere survive", () => {
    const ops = textOps("one two three", "one 2 three");
    expect(ops).toEqual([{ index: 4, delete: 3, insert: "2" }]);
  });

  it("three-way merge keeps both sides", () => {
    expect(mergeText("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n")).toBe("A\nb\nC\n");
    expect(mergeText("x", "x", "y")).toBe("y");
    expect(mergeText("x", "y", "x")).toBe("y");
  });
});

describe("live cipher", () => {
  it("binds payloads to their document and kind", async () => {
    const cipher = LiveCipher.fromLiveKey(randomKey(), "vault1");
    const a = await cipher.docId("Notes/a.md");
    const b = await cipher.docId("Notes/b.md");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await cipher.docId("Notes\\a.md")).toBe(a);
    const sealed = await cipher.seal(a, "u", new Uint8Array([1, 2, 3]));
    expect([...(await cipher.open(a, "u", sealed))]).toEqual([1, 2, 3]);
    await expect(cipher.open(b, "u", sealed)).rejects.toThrow();
    await expect(cipher.open(a, "a", sealed)).rejects.toThrow();
  });

  it("ids differ between vaults and keys", async () => {
    const key = randomKey();
    const one = await LiveCipher.fromLiveKey(key, "v1").docId("x.md");
    const two = await LiveCipher.fromLiveKey(key, "v2").docId("x.md");
    const three = await LiveCipher.fromLiveKey(randomKey(), "v1").docId("x.md");
    expect(new Set([one, two, three]).size).toBe(3);
    expect(normalizeLivePath("/a\\b.md")).toBe("a/b.md");
  });
});
