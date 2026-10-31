/**
 * One live document: a Y.Doc whose updates are sealed and relayed through the
 * server log, plus the cursors of everyone editing it.
 *
 * Invariants:
 * - `cursor` only advances past events this doc has applied (or that failed
 *   to open and are skipped as poison). Own appends do not move it, except a
 *   compare-and-swap append, which proves no event sits between.
 * - Seeding and reconcile edits use compare-and-swap on the head, so two
 *   devices folding the same disk text in at once cannot double it.
 * - Edits typed in the editor go out unconditionally: CRDT ops are unique.
 * - An update that never reached the server stays in the persisted state and
 *   is re-sent on the next join.
 */
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { LIVE_LIMITS, type LiveDocDelta, type LiveEventWire } from "@vaultbridge/protocol";
import type { LiveCipher } from "./cipher.js";
import { applyTextChange } from "./text.js";
import { LiveUnavailableError, type LiveTransport } from "./transport.js";

/** Origin of updates that came from the server. Never echoed back. */
export const LIVE_REMOTE = Symbol("live-remote");
/** Origin of updates already posted by a compare-and-swap. Never echoed back. */
export const LIVE_RECONCILE = Symbol("live-reconcile");

export const TEXT_FIELD = "content";

/** Sends allowed in flight at once per note. */
const MAX_IN_FLIGHT = 8;

export interface LiveJoinInput {
  /** Text currently on disk / in the editor. */
  diskText: string;
  /** Persisted Y state from this device's last live session on this note. */
  base: Uint8Array | null;
  /**
   * The disk copy was written by file sync from another device. Another
   * device's edits reach the CRDT from that device, so the server text wins.
   */
  diskIsRemoteCopy?: boolean;
  /** No base, and file sync says the disk has edits it has not uploaded yet. */
  diskHasUnsyncedEdits?: boolean;
}

export type LiveJoinOutcome = "seeded" | "in-sync" | "adopted-server" | "merged-disk";

export interface LiveJoinResult {
  text: string;
  outcome: LiveJoinOutcome;
  /** Events that could not be opened and were skipped. */
  skipped: number;
}

export interface LiveSessionOptions {
  docId: string;
  path: string;
  cipher: LiveCipher;
  transport: LiveTransport;
  flushDelayMs?: number;
  compactAfterEvents?: number;
  maxRetryDelayMs?: number;
  /** Fired on any local or remote change to the text. */
  onChange?: (session: LiveDocSession) => void;
  /** Fired when sending fails or recovers. */
  onSendState?: (session: LiveDocSession, error: Error | null) => void;
}

export class LiveDocSession {
  readonly docId: string;
  readonly path: string;
  readonly doc: Y.Doc;
  readonly text: Y.Text;
  readonly awareness: Awareness;
  cursor = 0;
  hasMore = false;
  /** ms timestamp of the last local or remote text change. */
  lastActivityMs = 0;
  /** Live editing was given up for this note (too large, or key mismatch). */
  disabledReason: string | null = null;
  joinedAtMs = 0;

  private outbox: Uint8Array[] = [];
  private flushTimer: number | null = null;
  private awarenessTimer: number | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private snapshotting: Promise<void> | null = null;
  private retryDelayMs = 0;
  private eventsSinceSnapshot = 0;
  private needsSnapshot = false;
  private closed = false;
  private readonly opts: Required<Omit<LiveSessionOptions, "onChange" | "onSendState">> &
    Pick<LiveSessionOptions, "onChange" | "onSendState">;

  constructor(options: LiveSessionOptions) {
    this.opts = {
      flushDelayMs: 40,
      compactAfterEvents: 200,
      maxRetryDelayMs: 30_000,
      ...options,
    };
    this.docId = options.docId;
    this.path = options.path;
    this.doc = new Y.Doc();
    this.text = this.doc.getText(TEXT_FIELD);
    this.awareness = new Awareness(this.doc);
  }

  // -------------------------------------------------------------------------
  // Join
  // -------------------------------------------------------------------------

  async join(input: LiveJoinInput): Promise<LiveJoinResult> {
    let skipped = 0;
    let loaded = 0;
    const page = async (): Promise<void> => {
      do {
        const res = await this.opts.transport.poll([{ docId: this.docId, after: this.cursor }], { includeSelf: true });
        const delta = res.docs.find((d) => d.docId === this.docId);
        if (!delta) {
          break;
        }
        const applied = await this.applyEvents(delta.events);
        await this.applyAwareness(delta.awareness);
        skipped += applied.skipped;
        loaded += delta.events.length;
        this.cursor = Math.max(this.cursor, delta.cursor);
        this.hasMore = delta.hasMore;
      } while (this.hasMore);
    };

    await page();
    if (loaded > 0 && skipped === loaded) {
      // Nothing opened. A wrong key must not be "repaired" by seeding over it.
      this.disabledReason = "live history could not be decrypted with this vault key";
      throw new Error(this.disabledReason);
    }
    this.eventsSinceSnapshot = loaded;

    // Edits this device made in an earlier session that never reached the server.
    let baseDoc: Y.Doc | null = null;
    if (input.base) {
      baseDoc = new Y.Doc();
      Y.applyUpdate(baseDoc, input.base);
      if (this.cursor > 0) {
        const missing = captureUpdate(this.doc, () => {
          Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(baseDoc!, Y.encodeStateVector(this.doc)), LIVE_RECONCILE);
        });
        if (missing) {
          await this.appendUnconditional(missing);
        }
      }
    }

    let outcome: LiveJoinOutcome = "in-sync";
    for (let attempt = 0; attempt < 5; attempt++) {
      if (this.cursor === 0) {
        const seed = new Y.Doc();
        seed.getText(TEXT_FIELD).insert(0, input.diskText);
        if (await this.casAppend(Y.encodeStateAsUpdate(seed))) {
          outcome = "seeded";
          break;
        }
        await page();
        continue;
      }
      const serverText = this.text.toJSON();
      if (serverText === input.diskText) {
        break;
      }
      const baseText = baseDoc ? baseDoc.getText(TEXT_FIELD).toJSON() : null;
      const diskIsStale =
        input.diskIsRemoteCopy === true ||
        baseText === input.diskText ||
        (baseText === null && input.diskHasUnsyncedEdits !== true);
      if (diskIsStale) {
        outcome = "adopted-server";
        break;
      }
      // The disk has edits made outside live editing. Fold them in as a diff
      // against what this device last saw, so remote edits elsewhere survive.
      const fork = new Y.Doc();
      Y.applyUpdate(fork, Y.encodeStateAsUpdate(baseDoc ?? this.doc));
      const forkSv = Y.encodeStateVector(fork);
      applyTextChange(fork.getText(TEXT_FIELD), input.diskText);
      const change = Y.encodeStateAsUpdate(fork, forkSv);
      if (await this.casAppend(change)) {
        outcome = "merged-disk";
        break;
      }
      // Someone appended first, maybe the very same edit. Re-read and re-check.
      await page();
    }
    this.joinedAtMs = Date.now();
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    return { text: this.text.toJSON(), outcome, skipped };
  }

  /**
   * Make the text read `target` (an edit that arrived outside live editing,
   * e.g. a file-sync download). Compare-and-swap so it is folded in once.
   */
  async replaceText(target: string): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (this.text.toJSON() === target) {
        return false;
      }
      await this.flush();
      const fork = new Y.Doc();
      Y.applyUpdate(fork, Y.encodeStateAsUpdate(this.doc));
      const sv = Y.encodeStateVector(fork);
      applyTextChange(fork.getText(TEXT_FIELD), target);
      if (await this.casAppend(Y.encodeStateAsUpdate(fork, sv))) {
        return true;
      }
      await this.catchUp();
    }
    // Contended for five rounds: apply as an ordinary local edit.
    applyTextChange(this.text, target);
    return true;
  }

  // -------------------------------------------------------------------------
  // Incoming
  // -------------------------------------------------------------------------

  /** Apply one poll result for this doc. Returns true when the text changed. */
  async applyDelta(delta: LiveDocDelta): Promise<boolean> {
    if (this.closed) {
      return false;
    }
    const before = this.text.length;
    const beforeText = before < 200_000 ? this.text.toJSON() : null;
    await this.applyEvents(delta.events);
    this.cursor = Math.max(this.cursor, delta.cursor);
    this.hasMore = delta.hasMore;
    this.eventsSinceSnapshot += delta.events.length;
    await this.applyAwareness(delta.awareness);
    this.maybeCompact();
    return beforeText === null ? this.text.length !== before : this.text.toJSON() !== beforeText;
  }

  /** Pull everything newer than the cursor right now (used after a failed CAS). */
  async catchUp(): Promise<void> {
    do {
      const res = await this.opts.transport.poll([{ docId: this.docId, after: this.cursor }]);
      const delta = res.docs.find((d) => d.docId === this.docId);
      if (!delta) {
        return;
      }
      await this.applyDelta(delta);
    } while (this.hasMore);
  }

  private async applyAwareness(entries: LiveDocDelta["awareness"]): Promise<void> {
    for (const entry of entries) {
      try {
        const bytes = await this.opts.cipher.open(this.docId, "a", entry.payload);
        applyAwarenessUpdate(this.awareness, bytes, LIVE_REMOTE);
      } catch {
        /* a cursor that cannot be opened is dropped */
      }
    }
  }

  private async applyEvents(events: LiveEventWire[]): Promise<{ skipped: number }> {
    let skipped = 0;
    for (const event of events) {
      try {
        const bytes = await this.opts.cipher.open(this.docId, event.kind, event.payload);
        Y.applyUpdate(this.doc, bytes, LIVE_REMOTE);
      } catch {
        // Poison event (tampered, or sealed by a buggy client). Skip it; the
        // rest of the log still applies.
        skipped++;
      }
    }
    return { skipped };
  }

  // -------------------------------------------------------------------------
  // Outgoing
  // -------------------------------------------------------------------------

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    this.lastActivityMs = Date.now();
    this.opts.onChange?.(this);
    if (origin === LIVE_REMOTE || origin === LIVE_RECONCILE || this.closed) {
      return;
    }
    this.outbox.push(update);
    this.scheduleFlush(this.opts.flushDelayMs);
  };

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer || this.closed) {
      return;
    }
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch(() => undefined);
    }, delayMs);
  }

  get pendingUpdates(): number {
    return this.outbox.length;
  }

  /**
   * Send queued edits now. Sends overlap (up to MAX_IN_FLIGHT): CRDT updates
   * merge in any order, so a keystroke never waits for the previous one to be
   * stored. Resolves once everything queued at call time has been answered;
   * transient failures stay queued and retry.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const mine: Promise<void>[] = [];
    if (this.outbox.length > 0) {
      while (this.inFlight.size >= MAX_IN_FLIGHT) {
        await Promise.race([...this.inFlight]).catch(() => undefined);
      }
      if (this.outbox.length > 0) {
        mine.push(this.track(this.sendBatch()));
      }
    }
    if (this.needsSnapshot && !this.snapshotting) {
      this.snapshotting = this.sendSnapshotGuarded().finally(() => {
        this.snapshotting = null;
      });
      mine.push(this.snapshotting);
    }
    const results = await Promise.allSettled([...mine, ...this.inFlight]);
    const failed = results.slice(0, mine.length).find((r) => r.status === "rejected");
    if (failed) {
      throw (failed).reason;
    }
  }

  private track(p: Promise<void>): Promise<void> {
    this.inFlight.add(p);
    const done = () => this.inFlight.delete(p);
    p.then(done, done);
    return p;
  }

  private async sendBatch(): Promise<void> {
    const batch = this.outbox;
    this.outbox = [];
    try {
      const merged = batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch);
      const payload = await this.opts.cipher.seal(this.docId, "u", merged);
      if (payload.length > LIVE_LIMITS.maxUpdateChars) {
        // A paste too big for one update: a snapshot carries it instead.
        this.needsSnapshot = true;
        this.scheduleFlush(0);
        return;
      }
      const res = await this.opts.transport.append(this.docId, { kind: "u", payload });
      this.advancePastOwn(res);
      this.eventsSinceSnapshot++;
      if (this.eventsSinceSnapshot >= this.opts.compactAfterEvents && !this.needsSnapshot) {
        this.needsSnapshot = true;
        this.scheduleFlush(0);
      }
      this.retryDelayMs = 0;
      this.opts.onSendState?.(this, null);
    } catch (err) {
      this.onSendFailure(err, batch);
      throw err;
    }
  }

  private async sendSnapshotGuarded(): Promise<void> {
    try {
      await this.sendSnapshot();
      this.retryDelayMs = 0;
    } catch (err) {
      this.onSendFailure(err, []);
      throw err;
    }
  }

  private onSendFailure(err: unknown, batch: Uint8Array[]): void {
    if (err instanceof LiveUnavailableError && isPermanent(err)) {
      // The server will never take this update. Everything is still in the
      // doc, so a snapshot can carry it.
      this.needsSnapshot = true;
      if (err.status === 413) {
        this.disabledReason = "this note is too large for live editing";
      }
      this.opts.onSendState?.(this, err);
      return;
    }
    this.outbox = batch.concat(this.outbox);
    this.retryDelayMs = Math.min(this.opts.maxRetryDelayMs, Math.max(500, this.retryDelayMs * 2));
    this.opts.onSendState?.(this, err instanceof Error ? err : new Error("live send failed"));
    if (!(err instanceof LiveUnavailableError && err.fatal)) {
      this.scheduleFlush(this.retryDelayMs);
    }
  }

  private async appendUnconditional(update: Uint8Array): Promise<void> {
    this.outbox.push(update);
    try {
      await this.flush();
    } catch {
      /* queued for retry */
    }
  }

  /** Append only if nobody appended since our cursor. Applies locally on success. */
  private async casAppend(update: Uint8Array): Promise<boolean> {
    let kind: "u" | "s" = "u";
    let payload = await this.opts.cipher.seal(this.docId, "u", update);
    if (payload.length > LIVE_LIMITS.maxUpdateChars) {
      // A large seed or paste travels under the snapshot size limit.
      kind = "s";
      payload = await this.opts.cipher.seal(this.docId, "s", update);
      if (payload.length > LIVE_LIMITS.maxSnapshotChars) {
        this.disabledReason = "this note is too large for live editing";
        throw new Error(this.disabledReason);
      }
    }
    const res = await this.opts.transport.append(this.docId, { kind, payload, ifHead: this.cursor });
    if (!res.applied) {
      return false;
    }
    Y.applyUpdate(this.doc, update, LIVE_RECONCILE);
    if (res.seq !== null) {
      // The compare-and-swap proved no event sits between the old cursor and ours.
      this.cursor = Math.max(this.cursor, res.seq);
    }
    this.eventsSinceSnapshot++;
    return true;
  }

  /**
   * Our own event is in the doc already. If nothing sits between the cursor
   * and it, the cursor can move past it (fewer events to re-read, and
   * compaction can cover it).
   */
  private advancePastOwn(res: { seq: number | null; prev?: number | null } | undefined): void {
    if (res && res.seq !== null && typeof res.prev === "number" && res.prev <= this.cursor) {
      this.cursor = Math.max(this.cursor, res.seq);
    }
  }

  private maybeCompact(): void {
    if (this.eventsSinceSnapshot >= this.opts.compactAfterEvents && !this.snapshotting && !this.needsSnapshot) {
      this.needsSnapshot = true;
      void this.flush().catch(() => undefined);
    }
  }

  private async sendSnapshot(): Promise<void> {
    // A snapshot replaces events up to the cursor, so bring the cursor up to
    // the head first. Otherwise compaction deletes nothing.
    do {
      const res = await this.opts.transport.poll([{ docId: this.docId, after: this.cursor }]);
      const delta = res.docs.find((d) => d.docId === this.docId);
      if (!delta) {
        break;
      }
      await this.applyEvents(delta.events);
      this.cursor = Math.max(this.cursor, delta.cursor);
      this.hasMore = delta.hasMore;
    } while (this.hasMore);
    const state = Y.encodeStateAsUpdate(this.doc);
    const payload = await this.opts.cipher.seal(this.docId, "s", state);
    if (payload.length > LIVE_LIMITS.maxSnapshotChars) {
      this.needsSnapshot = false;
      this.disabledReason = "this note is too large for live editing";
      return;
    }
    const res = await this.opts.transport.append(this.docId, { kind: "s", payload, replaceUpTo: this.cursor });
    this.advancePastOwn(res);
    this.needsSnapshot = false;
    this.eventsSinceSnapshot = 1;
  }

  // -------------------------------------------------------------------------
  // Cursors
  // -------------------------------------------------------------------------

  /** Show this device in other editors. */
  setUser(name: string, color: string): void {
    this.awareness.setLocalStateField("user", { name, color, colorLight: `${color}33` });
  }

  /** Other devices editing this note right now. */
  get peers(): number {
    let count = 0;
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId !== this.doc.clientID && state && Object.keys(state).length > 0) {
        count++;
      }
    }
    return count;
  }

  private readonly onAwarenessUpdate = (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === LIVE_REMOTE || this.closed) {
      return;
    }
    const mine = this.doc.clientID;
    if (![...change.added, ...change.updated, ...change.removed].includes(mine)) {
      return;
    }
    if (this.awarenessTimer) {
      return;
    }
    this.awarenessTimer = window.setTimeout(() => {
      this.awarenessTimer = null;
      void this.sendAwareness();
    }, 120);
  };

  private async sendAwareness(): Promise<void> {
    if (this.closed || this.awareness.getLocalState() === null) {
      return;
    }
    try {
      const bytes = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
      await this.opts.transport.setAwareness(this.docId, await this.opts.cipher.seal(this.docId, "a", bytes));
    } catch {
      /* cursors are best effort; the 15 s renewal resends */
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Full state, persisted on the device as the base for the next join. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      await this.flush();
    } catch {
      /* unsent edits stay in the persisted state and go out on the next join */
    }
    if (this.awareness.getLocalState() !== null) {
      // Tell peers right away that this cursor is gone.
      try {
        this.awareness.setLocalState(null);
        const bytes = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
        await this.opts.transport.setAwareness(this.docId, await this.opts.cipher.seal(this.docId, "a", bytes));
      } catch {
        /* peers drop the cursor after the TTL */
      }
    }
    this.closed = true;
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.awarenessTimer) {
      window.clearTimeout(this.awarenessTimer);
      this.awarenessTimer = null;
    }
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "leave");
    this.awareness.destroy();
    try {
      await this.opts.transport.setAwareness(this.docId, null);
    } catch {
      /* the server drops it after the TTL */
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

function isPermanent(err: LiveUnavailableError): boolean {
  const status = err.status ?? 0;
  return status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 408 && status !== 429;
}

/** Run `fn` and return the update it produced on `doc`, or null if nothing changed. */
function captureUpdate(doc: Y.Doc, fn: () => void): Uint8Array | null {
  let captured: Uint8Array | null = null;
  const listener = (update: Uint8Array) => {
    captured = captured ? Y.mergeUpdates([captured, update]) : update;
  };
  doc.on("update", listener);
  try {
    fn();
  } finally {
    doc.off("update", listener);
  }
  return captured;
}
