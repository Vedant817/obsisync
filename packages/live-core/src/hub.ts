/**
 * LiveHub: every open live note on this device, one poll loop.
 *
 * - The main loop long-polls all open docs. The server answers as soon as any
 *   of them changes, so a remote keystroke arrives in about one probe
 *   interval plus a round trip.
 * - A doc opened while a long poll is in flight is caught up by a short side
 *   poll until the main loop includes it.
 * - Failures back off exponentially (to 30 s). A revoked device stops.
 * - Each doc's full state is persisted on the device (debounced) so offline
 *   edits and unsent updates survive a restart.
 */
import type { LiveCipher } from "./cipher.js";
import { LIVE_REMOTE, LiveDocSession, type LiveJoinInput, type LiveJoinResult } from "./session.js";
import { LiveUnavailableError, type LiveTransport } from "./transport.js";
import type { LivePushChannel } from "./ws.js";
import type { LiveAwarenessWire, LiveDocDelta, LiveEventWire } from "@vaultbridge/protocol";

export interface LiveDocStore {
  load(docId: string): Promise<Uint8Array | null>;
  save(docId: string, state: Uint8Array): Promise<void>;
}

export type LiveHubState = "idle" | "live" | "offline" | "stopped";

export interface LiveHubStatus {
  state: LiveHubState;
  docs: number;
  peers: number;
  lastError: string | null;
}

export interface LiveHubOptions {
  cipher: LiveCipher;
  transport: LiveTransport;
  /**
   * WebSocket channel. While it is connected, edits and cursors arrive pushed
   * and the poll loop sleeps. When it drops, the poll loop takes over.
   */
  push?: LivePushChannel;
  store?: LiveDocStore;
  /** Server long-poll wait. */
  longPollMs?: number;
  sidePollMs?: number;
  maxBackoffMs?: number;
  persistDelayMs?: number;
  /** Shown to other devices next to this device's cursor. */
  user?: { name: string; color: string };
  onStatus?: (status: LiveHubStatus) => void;
  /** A remote edit changed this note's text. */
  onRemoteChange?: (session: LiveDocSession) => void;
}

export interface OpenedLiveDoc {
  session: LiveDocSession;
  join: LiveJoinResult;
}

export class LiveHub {
  private readonly sessions = new Map<string, LiveDocSession>();
  private readonly opening = new Map<string, Promise<OpenedLiveDoc>>();
  private readonly persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;
  private stopped = false;
  private active = true;
  private wake: (() => void) | null = null;
  private backoffMs = 0;
  private awarenessSince = 0;
  private pollStartedAt = 0;
  private sideRunning = false;
  private status: LiveHubStatus = { state: "idle", docs: 0, peers: 0, lastError: null };
  private readonly opts: Required<Omit<LiveHubOptions, "store" | "user" | "onStatus" | "onRemoteChange" | "push">> &
    Pick<LiveHubOptions, "store" | "user" | "onStatus" | "onRemoteChange" | "push">;
  private unlisten: (() => void) | null = null;
  /** Pushed frames are applied one at a time, in arrival order. */
  private pushChain: Promise<void> = Promise.resolve();

  constructor(options: LiveHubOptions) {
    this.opts = {
      longPollMs: 8_000,
      sidePollMs: 400,
      maxBackoffMs: 30_000,
      persistDelayMs: 1_500,
      ...options,
    };
    const push = this.opts.push;
    if (push) {
      this.unlisten = push.listen({
        onReady: () => {
          const watches = [...this.sessions.values()]
            .filter((s) => !s.disabledReason)
            .map((s) => ({ docId: s.docId, after: s.cursor }));
          push.subscribe(watches);
          this.refreshStatus("live", null);
          this.wake?.();
        },
        onDown: () => this.kick(),
        onPage: (delta) => this.enqueue(() => this.applyPage(delta)),
        onPush: (docId, event) => this.enqueue(() => this.applyPush(docId, event)),
        onRelay: (docId, rid, event) =>
          this.enqueue(async () => {
            const session = this.sessions.get(docId);
            if (!session) {
              return;
            }
            await session.applyDelta({
              docId,
              events: [{ ...event, seq: 0 }],
              cursor: session.cursor,
              hasMore: false,
              awareness: [],
            });
            this.relayed.add(`${docId}|${rid}`);
          }),
        onCommit: (docId, rid, seq, prev) => this.enqueue(async () => this.applyCommit(docId, rid, seq, prev)),
        onAwareness: (docId, entries) => this.enqueue(() => this.applyCursors(docId, entries)),
      });
    }
  }

  private enqueue(fn: () => Promise<void>): void {
    this.pushChain = this.pushChain.then(fn).catch(() => undefined);
  }

  private async applyPage(delta: LiveDocDelta): Promise<void> {
    await this.sessions.get(delta.docId)?.applyDelta(delta);
    this.refreshStatus();
  }

  /** A pushed event moves the cursor only when nothing can sit between. */
  private async applyPush(docId: string, event: LiveEventWire & { prev: number }): Promise<void> {
    const session = this.sessions.get(docId);
    if (!session) {
      return;
    }
    const contiguous = event.prev <= session.cursor;
    await session.applyDelta({
      docId,
      events: [event],
      cursor: contiguous ? Math.max(session.cursor, event.seq) : session.cursor,
      hasMore: false,
      awareness: [],
    });
    if (!contiguous) {
      // A gap (a frame lost in a reconnect). Ask the server for what we missed.
      this.opts.push?.subscribe([{ docId, after: session.cursor }]);
    }
  }

  /**
   * Commits can arrive out of order when two appends race to the database.
   * Hold one whose predecessor is not in yet; if the gap is still open
   * shortly after, re-read from the log.
   */
  private readonly heldCommits = new Map<string, Map<number, number>>();
  /** Relays this device applied and has not seen the commit for yet. */
  private readonly relayed = new Set<string>();

  private applyCommit(docId: string, rid: string, seq: number, prev: number): void {
    const session = this.sessions.get(docId);
    if (!session) {
      return;
    }
    if (!this.relayed.delete(`${docId}|${rid}`)) {
      // Stored, but this device never got the content (it subscribed while
      // the write was in flight). Read it from the log.
      this.opts.push?.subscribe([{ docId, after: session.cursor }]);
      return;
    }
    if (this.relayed.size > 5_000) {
      this.relayed.clear();
    }
    const held = this.heldCommits.get(docId) ?? new Map<number, number>();
    held.set(prev, seq);
    // Advance through every commit that is now contiguous.
    let moved = true;
    while (moved) {
      moved = false;
      for (const [p, s] of held) {
        if (p <= session.cursor) {
          session.cursor = Math.max(session.cursor, s);
          held.delete(p);
          moved = true;
        }
      }
    }
    if (held.size === 0) {
      this.heldCommits.delete(docId);
      return;
    }
    this.heldCommits.set(docId, held);
    const waitingFor = session.cursor;
    setTimeout(() => {
      if (this.sessions.get(docId) === session && session.cursor === waitingFor && this.heldCommits.get(docId)?.size) {
        this.heldCommits.delete(docId);
        this.opts.push?.subscribe([{ docId, after: session.cursor }]);
      }
    }, 1_500);
  }

  private async applyCursors(docId: string, entries: LiveAwarenessWire[]): Promise<void> {
    const session = this.sessions.get(docId);
    if (!session) {
      return;
    }
    await session.applyDelta({ docId, events: [], cursor: session.cursor, hasMore: false, awareness: entries });
    this.refreshStatus();
  }

  get cipher(): LiveCipher {
    return this.opts.cipher;
  }

  // -------------------------------------------------------------------------
  // Docs
  // -------------------------------------------------------------------------

  /** Open (or reuse) the live doc for `path`. `input.base` defaults to the persisted state. */
  async open(path: string, input: Omit<LiveJoinInput, "base"> & { base?: Uint8Array | null }): Promise<OpenedLiveDoc> {
    if (this.stopped) {
      throw new Error("live editing is stopped");
    }
    const docId = await this.opts.cipher.docId(path);
    const existing = this.sessions.get(docId);
    if (existing && !existing.isClosed) {
      return { session: existing, join: { text: existing.text.toString(), outcome: "in-sync", skipped: 0 } };
    }
    const pending = this.opening.get(docId);
    if (pending) {
      return pending;
    }
    const opened = (async (): Promise<OpenedLiveDoc> => {
      const base = input.base !== undefined ? input.base : ((await this.opts.store?.load(docId)) ?? null);
      const session = new LiveDocSession({
        docId,
        path,
        cipher: this.opts.cipher,
        transport: this.opts.transport,
        onChange: (s) => this.schedulePersist(s),
        onSendState: (_s, error) => {
          if (error && !(error instanceof LiveUnavailableError && !error.fatal && error.status === null)) {
            this.setStatus({ lastError: error.message });
          }
        },
      });
      const join = await session.join({ ...input, base });
      if (this.opts.user) {
        session.setUser(this.opts.user.name, this.opts.user.color);
      }
      session.doc.on("update", (_u: Uint8Array, origin: unknown) => {
        if (origin === LIVE_REMOTE) {
          this.opts.onRemoteChange?.(session);
        }
      });
      this.sessions.set(docId, session);
      this.schedulePersist(session);
      this.refreshStatus();
      this.opts.push?.subscribe([{ docId, after: session.cursor }]);
      this.kick();
      this.startSidePoll();
      return { session, join };
    })();
    this.opening.set(docId, opened);
    try {
      return await opened;
    } finally {
      this.opening.delete(docId);
    }
  }

  sessionFor(docId: string): LiveDocSession | null {
    return this.sessions.get(docId) ?? null;
  }

  async sessionForPath(path: string): Promise<LiveDocSession | null> {
    return this.sessionFor(await this.opts.cipher.docId(path));
  }

  get openSessions(): LiveDocSession[] {
    return [...this.sessions.values()];
  }

  async close(docId: string): Promise<void> {
    const session = this.sessions.get(docId);
    if (!session) {
      return;
    }
    this.sessions.delete(docId);
    this.opts.push?.unsubscribe([docId]);
    await session.close();
    await this.persistNow(session);
    this.refreshStatus();
  }

  /** The window is visible (true) or hidden (false). Hidden stops polling. */
  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.kick();
    }
  }

  /** Flush every doc, persist state, stop the loop. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.unlisten?.();
    this.unlisten = null;
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(
      all.map(async (session) => {
        await session.close();
        await this.persistNow(session);
      }),
    );
    this.wake?.();
    this.setStatus({ state: "stopped", docs: 0, peers: 0 });
  }

  // -------------------------------------------------------------------------
  // Poll loop
  // -------------------------------------------------------------------------

  private kick(): void {
    if (this.stopped) {
      return;
    }
    if (this.wake) {
      const wake = this.wake;
      this.wake = null;
      wake();
    }
    if (!this.running) {
      this.running = true;
      void this.loop().finally(() => {
        this.running = false;
      });
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const list = [...this.sessions.values()].filter((s) => !s.disabledReason);
      if (this.opts.push?.connected && list.length > 0) {
        // Edits arrive pushed. Sleep until the socket drops.
        this.refreshStatus("live", null);
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
        continue;
      }
      if (!this.active || list.length === 0) {
        if (list.length === 0) {
          this.setStatus({ state: "idle" });
        }
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
        continue;
      }
      const wait = list.some((s) => s.hasMore) ? 0 : this.opts.longPollMs;
      this.pollStartedAt = Date.now();
      this.pollCount++;
      try {
        const res = await this.opts.transport.poll(
          list.map((s) => ({ docId: s.docId, after: s.cursor })),
          { waitMs: wait, awarenessSince: this.awarenessSince },
        );
        for (const delta of res.docs) {
          await this.sessions.get(delta.docId)?.applyDelta(delta);
        }
        this.noteAwareness(res.docs);
        this.backoffMs = 0;
        this.refreshStatus("live", null);
      } catch (err) {
        if (err instanceof LiveUnavailableError && err.fatal) {
          this.setStatus({ state: "stopped", lastError: err.message });
          this.stopped = true;
          return;
        }
        this.backoffMs = Math.min(this.opts.maxBackoffMs, Math.max(1_000, this.backoffMs * 2));
        this.setStatus({ state: "offline", lastError: err instanceof Error ? err.message : "live poll failed" });
        await this.sleep(this.backoffMs);
      }
    }
  }

  /** Docs that joined after the in-flight long poll started get short polls until it returns. */
  private startSidePoll(): void {
    if (this.sideRunning) {
      return;
    }
    this.sideRunning = true;
    void (async () => {
      try {
        while (!this.stopped) {
          const late = [...this.sessions.values()].filter(
            (s) => !s.disabledReason && s.joinedAtMs >= this.pollStartedAt && this.running,
          );
          if (late.length === 0 || !this.active || this.opts.push?.connected) {
            return;
          }
          await this.sleep(this.opts.sidePollMs);
          try {
            const res = await this.opts.transport.poll(
              late.map((s) => ({ docId: s.docId, after: s.cursor })),
              { awarenessSince: this.awarenessSince },
            );
            for (const delta of res.docs) {
              await this.sessions.get(delta.docId)?.applyDelta(delta);
            }
            this.noteAwareness(res.docs);
          } catch {
            return;
          }
        }
      } finally {
        this.sideRunning = false;
      }
    })();
  }

  /**
   * Ask only for cursors newer than the newest one seen. Re-asking for an
   * older window would make every long poll return at once while a cursor
   * row stays inside it.
   */
  private noteAwareness(docs: { awareness: { updatedMs: number }[] }[]): void {
    for (const doc of docs) {
      for (const entry of doc.awareness) {
        this.awarenessSince = Math.max(this.awarenessSince, entry.updatedMs);
      }
    }
  }

  /** Polls issued by the main loop (diagnostics and tests). */
  pollCount = 0;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      // A kick during backoff retries at once.
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  // -------------------------------------------------------------------------
  // Persistence and status
  // -------------------------------------------------------------------------

  private schedulePersist(session: LiveDocSession): void {
    if (!this.opts.store || this.persistTimers.has(session.docId)) {
      return;
    }
    this.persistTimers.set(
      session.docId,
      setTimeout(() => {
        this.persistTimers.delete(session.docId);
        void this.persistNow(session);
      }, this.opts.persistDelayMs),
    );
    this.refreshStatus();
  }

  private async persistNow(session: LiveDocSession): Promise<void> {
    const timer = this.persistTimers.get(session.docId);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(session.docId);
    }
    try {
      await this.opts.store?.save(session.docId, session.encodeState());
    } catch {
      /* the next change persists again */
    }
  }

  private refreshStatus(state?: LiveHubState, lastError?: string | null): void {
    let peers = 0;
    for (const session of this.sessions.values()) {
      peers += session.peers;
    }
    this.setStatus({
      docs: this.sessions.size,
      peers,
      ...(state ? { state } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
    });
  }

  private setStatus(patch: Partial<LiveHubStatus>): void {
    const next = { ...this.status, ...patch };
    if (
      next.state === this.status.state &&
      next.docs === this.status.docs &&
      next.peers === this.status.peers &&
      next.lastError === this.status.lastError
    ) {
      return;
    }
    this.status = next;
    this.opts.onStatus?.(next);
  }

  get currentStatus(): LiveHubStatus {
    return this.status;
  }
}
