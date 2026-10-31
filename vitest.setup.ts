// Plugin code uses `window.setTimeout` and friends, as Obsidian's review
// requires for popout windows. Node has no `window`; its globals serve.
const g = globalThis as unknown as { window?: unknown };
if (typeof g.window === "undefined") {
  g.window = globalThis;
}
