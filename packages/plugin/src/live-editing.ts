/**
 * Live editing inside Obsidian.
 *
 * - Every Markdown pane showing an eligible note is bound to that note's live
 *   doc. Several panes on one note share one doc.
 * - File-sync downloads for a note open live do not rewrite the editor: the
 *   live doc is fresher. A download that carries an edit live editing has not
 *   seen (an external editor on another device) is folded into the live doc.
 * - A note edited on disk while not open live (Templater, git, another app)
 *   is folded into its live doc so open editors elsewhere see it.
 */
import { Compartment } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { editorInfoField, MarkdownView, TFile, type Plugin } from "obsidian";
import { sha256HexBytes } from "@vaultbridge/crypto";
import {
  applyTextChange,
  LiveHub,
  mergeText,
  type LiveDocSession,
  type LiveDocStore,
} from "@vaultbridge/live-core";
import { editorChangesTo, liveEditorExtension } from "./live-cm.js";
import { liveEligible } from "./live-eligible.js";

/** A download older than the live text is ignored while anyone typed this recently. */
const QUIET_MS = 15_000;
const RECENT_TEXTS = 64;

const enc = new TextEncoder();
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

async function sha(text: string | Uint8Array): Promise<string> {
  return sha256HexBytes(typeof text === "string" ? enc.encode(text) : text);
}

interface Binding {
  path: string;
  token: object;
  docId: string | null;
}

export type LiveStore = LiveDocStore & { has(docId: string): Promise<boolean> };

export interface LiveEditingDeps {
  plugin: Plugin;
  /** sha256 of the note as file sync last synced it, or null if file sync does not know it. */
  syncedHash(path: string): string | null;
}

export class LiveEditing {
  private readonly compartment = new Compartment();
  private readonly bindings = new Map<EditorView, Binding>();
  private readonly refs = new Map<string, number>();
  private readonly syncWritten = new Map<string, string>();
  private readonly recent = new Map<string, string[]>();
  private readonly recentTimers = new Map<string, number>();
  private readonly ingestTimers = new Map<string, number>();
  private live: { hub: LiveHub; store: LiveStore } | null = null;
  private registered = false;

  constructor(private readonly deps: LiveEditingDeps) {}

  private get stopped(): boolean {
    return this.live === null;
  }

  get hub(): LiveHub | null {
    return this.live?.hub ?? null;
  }

  /** Start live editing with this hub. Replaces a previous one. */
  async attach(hub: LiveHub, store: LiveStore): Promise<void> {
    await this.detach();
    this.live = { hub, store };
    this.register();
    this.scan();
  }

  /** Call once from onload (attach does it too). */
  register(): void {
    if (this.registered) {
      return;
    }
    this.registered = true;
    const { plugin } = this.deps;
    plugin.registerEditorExtension(this.compartment.of([]));
    const rescan = () => {
      if (!this.stopped) {
        this.scan();
      }
    };
    plugin.registerEvent(plugin.app.workspace.on("file-open", rescan));
    plugin.registerEvent(plugin.app.workspace.on("layout-change", rescan));
    plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", rescan));
    plugin.registerEvent(
      plugin.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          this.scheduleIngest(file);
        }
      }),
    );
    plugin.registerEvent(
      plugin.app.vault.on("rename", () => {
        rescan();
      }),
    );
    rescan();
  }

  // -------------------------------------------------------------------------
  // Editor bindings
  // -------------------------------------------------------------------------

  /**
   * Bind at most one editor per note. Obsidian already mirrors split panes of
   * the same note into each other; binding both would apply every remote
   * edit twice. The unbound pane follows the bound one through Obsidian.
   */
  scan(): void {
    if (!this.live) {
      return;
    }
    const panes: { cm: EditorView; file: TFile | null }[] = [];
    for (const leaf of this.deps.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }
      const cm = (view.editor as unknown as { cm?: EditorView }).cm;
      if (cm) {
        panes.push({ cm, file: view.file });
      }
    }
    const seen = new Set(panes.map((p) => p.cm));
    for (const cm of [...this.bindings.keys()]) {
      if (!seen.has(cm)) {
        void this.unbind(cm);
      }
    }
    const claimed = new Set<string>();
    for (const { cm, file } of panes) {
      const current = this.bindings.get(cm);
      if (current && file && current.path === file.path && !claimed.has(file.path)) {
        claimed.add(file.path);
      } else if (current) {
        void this.unbind(cm);
      }
    }
    for (const { cm, file } of panes) {
      if (this.bindings.has(cm) || !file || claimed.has(file.path) || !liveEligible(file.path, file.stat.size, this.deps.plugin.app.vault.configDir)) {
        continue;
      }
      claimed.add(file.path);
      void this.bind(cm, file);
    }
  }

  private async bind(cm: EditorView, file: TFile): Promise<void> {
    const live = this.live;
    if (!live) {
      return;
    }
    const path = file.path;
    const token = {};
    this.bindings.set(cm, { path, token, docId: null });
    const current = () => this.bindings.get(cm)?.token === token && this.live === live;
    let diskText: string;
    let opened;
    try {
      diskText = await this.settledEditorText(cm, file, current);
      if (!current()) {
        return;
      }
      const hash = await sha(diskText);
      const synced = this.deps.syncedHash(path);
      opened = await live.hub.open(path, {
        diskText,
        diskIsRemoteCopy: this.syncWritten.get(path) === hash,
        diskHasUnsyncedEdits: synced === null || synced !== hash,
      });
    } catch {
      // Offline, superseded, or the note cannot go live. File sync still covers it.
      if (this.bindings.get(cm)?.token === token) {
        this.bindings.delete(cm);
      }
      return;
    }
    const { session } = opened;
    const refs = (this.refs.get(session.docId) ?? 0) + 1;
    this.refs.set(session.docId, refs);
    const binding = this.bindings.get(cm);
    if (!binding || !current() || !this.showsPath(cm, path)) {
      await this.release(session.docId);
      return;
    }
    binding.docId = session.docId;

    // Typing during the join: replay it on top of the live text.
    const editorNow = cm.state.doc.toString();
    if (editorNow !== diskText) {
      const merged = mergeText(diskText, editorNow, session.text.toJSON());
      applyTextChange(session.text, merged);
    }
    const target = session.text.toJSON();
    const shown = cm.state.doc.toString();
    try {
      cm.dispatch({
        changes: shown === target ? [] : editorChangesTo(shown, target),
        effects: this.compartment.reconfigure(
          liveEditorExtension({
            ytext: session.text,
            awareness: session.awareness,
            stillBound: (view) => this.showsPath(view, path),
            onDetach: (view) => {
              void this.unbind(view).then(() => this.scan());
            },
          }),
        ),
      });
    } catch {
      await this.unbind(cm);
      return;
    }
    if (refs === 1) {
      session.doc.on("update", () => this.rememberText(session));
    }
    this.rememberText(session);
  }

  /**
   * Obsidian fires file-open before the editor holds the new note. Wait until
   * the editor shows this path with the text on disk, so a live doc is never
   * seeded with the previous note. Unsaved typing wins after two seconds.
   */
  private async settledEditorText(cm: EditorView, file: TFile, current: () => boolean): Promise<string> {
    const disk = await this.deps.plugin.app.vault.read(file);
    for (let i = 0; i < 40; i++) {
      if (!current()) {
        throw new Error("superseded");
      }
      if (this.showsPath(cm, file.path) && cm.state.doc.toString() === disk) {
        return disk;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    if (!this.showsPath(cm, file.path)) {
      throw new Error("the editor moved to another note");
    }
    return cm.state.doc.toString();
  }

  private showsPath(view: EditorView, path: string): boolean {
    try {
      return view.state.field(editorInfoField, false)?.file?.path === path;
    } catch {
      return false;
    }
  }

  private async unbind(cm: EditorView): Promise<void> {
    const binding = this.bindings.get(cm);
    if (!binding) {
      return;
    }
    this.bindings.delete(cm);
    try {
      cm.dispatch({ effects: this.compartment.reconfigure([]) });
    } catch {
      /* the view is already gone */
    }
    if (binding.docId) {
      await this.release(binding.docId);
    }
  }

  private async release(docId: string): Promise<void> {
    const left = (this.refs.get(docId) ?? 1) - 1;
    if (left > 0) {
      this.refs.set(docId, left);
      return;
    }
    this.refs.delete(docId);
    await this.live?.hub.close(docId);
  }

  private boundSession(path: string): LiveDocSession | null {
    for (const binding of this.bindings.values()) {
      if (binding.path === path && binding.docId) {
        return this.live?.hub.sessionFor(binding.docId) ?? null;
      }
    }
    return null;
  }

  /** Hashes of texts this note had recently, to recognise a stale download. */
  private rememberText(session: LiveDocSession): void {
    if (this.recentTimers.has(session.docId)) {
      return;
    }
    this.recentTimers.set(
      session.docId,
      window.setTimeout(() => {
        this.recentTimers.delete(session.docId);
        void sha(session.text.toJSON()).then((hash) => {
          const list = this.recent.get(session.docId) ?? [];
          if (list[list.length - 1] !== hash) {
            list.push(hash);
            if (list.length > RECENT_TEXTS) {
              list.shift();
            }
            this.recent.set(session.docId, list);
          }
        });
      }, 400),
    );
  }

  // -------------------------------------------------------------------------
  // File sync interplay
  // -------------------------------------------------------------------------

  /**
   * File sync is about to write `bytes` to `path`. Returns false when the
   * live doc took care of it and the disk must not be overwritten.
   */
  async beforeSyncWrite(path: string, bytes: Uint8Array): Promise<boolean> {
    const hash = await sha(bytes);
    this.syncWritten.set(path, hash);
    const session = this.boundSession(path);
    if (!session || session.disabledReason) {
      return true;
    }
    let text: string;
    try {
      text = strictUtf8.decode(bytes);
    } catch {
      return true;
    }
    if (text === session.text.toJSON()) {
      return false;
    }
    const stale =
      (this.recent.get(session.docId) ?? []).includes(hash) || Date.now() - session.lastActivityMs < QUIET_MS;
    if (stale) {
      // An older save of what live editing already shows. File sync uploads
      // the live text on its next cycle.
      return false;
    }
    try {
      await session.replaceText(text);
    } catch {
      return true;
    }
    return false;
  }

  private scheduleIngest(file: TFile): void {
    if (this.stopped || !liveEligible(file.path, file.stat.size, this.deps.plugin.app.vault.configDir) || this.boundSession(file.path)) {
      return;
    }
    const existing = this.ingestTimers.get(file.path);
    if (existing) {
      window.clearTimeout(existing);
    }
    this.ingestTimers.set(
      file.path,
      window.setTimeout(() => {
        this.ingestTimers.delete(file.path);
        void this.ingest(file).catch(() => undefined);
      }, 1_500),
    );
  }

  /** Fold an edit made outside the editor into the note's live doc. */
  private async ingest(file: TFile): Promise<void> {
    const live = this.live;
    if (!live || this.boundSession(file.path)) {
      return;
    }
    const docId = await live.hub.cipher.docId(file.path);
    if (!(await live.store.has(docId))) {
      return; // never edited live on this device: file sync alone covers it
    }
    const bytes = new Uint8Array(await this.deps.plugin.app.vault.readBinary(file));
    if (this.syncWritten.get(file.path) === (await sha(bytes))) {
      return; // came from another device; that device folds it in
    }
    let text: string;
    try {
      text = strictUtf8.decode(bytes);
    } catch {
      return;
    }
    if (this.live !== live || this.boundSession(file.path)) {
      return;
    }
    await live.hub.open(file.path, { diskText: text, diskIsRemoteCopy: false });
    if (!this.refs.has(docId)) {
      await live.hub.close(docId);
    }
  }

  setVisible(visible: boolean): void {
    this.live?.hub.setActive(visible);
  }

  /** Flush, unbind every editor, stop the hub. Safe to call twice. */
  async detach(): Promise<void> {
    const live = this.live;
    this.live = null;
    if (!live) {
      return;
    }
    for (const timer of this.ingestTimers.values()) {
      window.clearTimeout(timer);
    }
    for (const timer of this.recentTimers.values()) {
      window.clearTimeout(timer);
    }
    for (const cm of [...this.bindings.keys()]) {
      try {
        cm.dispatch({ effects: this.compartment.reconfigure([]) });
      } catch {
        /* gone */
      }
    }
    this.ingestTimers.clear();
    this.recentTimers.clear();
    this.bindings.clear();
    this.refs.clear();
    await live.hub.stop();
  }
}
