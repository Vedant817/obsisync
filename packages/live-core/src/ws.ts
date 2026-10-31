/**
 * WebSocket channel to the vault's live room.
 *
 * - One socket per device per vault. It authenticates with its first frame.
 * - Appends and cursors go over the socket when it is up, and over HTTP
 *   otherwise or when a frame would be too large. Re-sending an append over
 *   HTTP after a lost ack is safe: CRDT updates are idempotent, and a
 *   compare-and-swap append simply fails the second time.
 * - Joins and catch-up reads keep using HTTP polls (`poll`).
 * - Reconnects with backoff. A keepalive ping every 25 s; no answer within
 *   two intervals means the socket is dead and is replaced.
 * - A rejected credential (401/403) stops reconnecting for good.
 */
import {
  LIVE_WS_MAX_FRAME_CHARS,
  type LiveAppendRequest,
  type LiveAppendResponse,
  type LiveAwarenessWire,
  type LiveClientMessage,
  type LiveDocDelta,
  type LiveEventWire,
  type LivePollResponse,
  type LiveServerMessage,
} from "@vaultbridge/protocol";
import { LiveUnavailableError, type LivePollOptions, type LiveTransport, type LiveWatch } from "./transport.js";

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface LivePushHandlers {
  /** Authenticated. Re-subscribe everything with current cursors. */
  onReady?(): void;
  /** The socket went away. Fall back to polling until onReady. */
  onDown?(error: Error | null): void;
  onPage?(delta: LiveDocDelta): void;
  onPush?(docId: string, event: LiveEventWire & { prev: number }): void;
  onAwareness?(docId: string, entries: LiveAwarenessWire[]): void;
  /** A file-sync commit landed in the vault. */
  onFiles?(): void;
}

/** What the hub needs from a push channel. */
export interface LivePushChannel {
  readonly connected: boolean;
  listen(handlers: LivePushHandlers): () => void;
  subscribe(docs: LiveWatch[]): void;
  unsubscribe(docIds: string[]): void;
}

export interface WsLiveTransportOptions {
  /** wss://host/v1/vaults/{vaultId}/live/ws */
  url: string;
  token: string;
  /** HTTP transport for polls and fallback sends. */
  http: LiveTransport;
  socketFactory?: SocketFactory;
  pingMs?: number;
  ackTimeoutMs?: number;
  maxBackoffMs?: number;
}

const OPEN = 1;

export function liveSocketUrl(serverUrl: string, vaultId: string): string {
  const base = serverUrl.replace(/\/$/, "").replace(/^http/, "ws");
  return `${base}/v1/vaults/${vaultId}/live/ws`;
}

export class WsLiveTransport implements LiveTransport, LivePushChannel {
  private socket: SocketLike | null = null;
  private ready = false;
  private stopped = true;
  private fatal: Error | null = null;
  private backoffMs = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (r: LiveAppendResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly listeners = new Set<LivePushHandlers>();
  private readonly opts: Required<Omit<WsLiveTransportOptions, "socketFactory">> & { socketFactory: SocketFactory };

  constructor(options: WsLiveTransportOptions) {
    this.opts = {
      pingMs: 25_000,
      ackTimeoutMs: 10_000,
      maxBackoffMs: 30_000,
      socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
      ...options,
    };
  }

  get connected(): boolean {
    return this.ready;
  }

  /** Why the channel gave up for good (revoked device), if it did. */
  get fatalError(): Error | null {
    return this.fatal;
  }

  listen(handlers: LivePushHandlers): () => void {
    this.listeners.add(handlers);
    return () => this.listeners.delete(handlers);
  }

  start(): void {
    if (!this.stopped || this.fatal) {
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.teardown(null);
  }

  /** Reconnect now (app came back to the foreground). */
  wake(): void {
    if (this.stopped || this.fatal) {
      return;
    }
    if (this.ready && Date.now() - this.lastHeard < this.opts.pingMs * 2) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoffMs = 0;
    this.teardown(null);
    this.connect();
  }

  // -------------------------------------------------------------------------
  // LivePushChannel
  // -------------------------------------------------------------------------

  subscribe(docs: LiveWatch[]): void {
    if (docs.length > 0) {
      this.sendFrame({ t: "sub", docs });
    }
  }

  unsubscribe(docIds: string[]): void {
    if (docIds.length > 0) {
      this.sendFrame({ t: "unsub", docIds });
    }
  }

  // -------------------------------------------------------------------------
  // LiveTransport
  // -------------------------------------------------------------------------

  poll(watches: LiveWatch[], options?: LivePollOptions): Promise<LivePollResponse> {
    return this.opts.http.poll(watches, options);
  }

  async append(docId: string, request: LiveAppendRequest): Promise<LiveAppendResponse> {
    if (!this.ready || request.payload.length > LIVE_WS_MAX_FRAME_CHARS) {
      return this.opts.http.append(docId, request);
    }
    try {
      return await this.appendOverSocket(docId, request);
    } catch (err) {
      if (err instanceof LiveUnavailableError && err.status !== null) {
        throw err; // the server answered: same answer over HTTP
      }
      return this.opts.http.append(docId, request);
    }
  }

  async setAwareness(docId: string, payload: string | null): Promise<void> {
    if (this.ready && this.sendFrame({ t: "aw", docId, payload })) {
      return;
    }
    await this.opts.http.setAwareness(docId, payload);
  }

  private appendOverSocket(docId: string, request: LiveAppendRequest): Promise<LiveAppendResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LiveUnavailableError("live ack timed out", null));
      }, this.opts.ackTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!this.sendFrame({ t: "append", id, docId, ...request })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new LiveUnavailableError("live socket closed", null));
      }
    });
  }

  // -------------------------------------------------------------------------
  // Socket lifecycle
  // -------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped || this.fatal || this.socket) {
      return;
    }
    let socket: SocketLike;
    try {
      socket = this.opts.socketFactory(this.opts.url);
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err : new Error("could not open live socket"));
      return;
    }
    this.socket = socket;
    this.lastHeard = Date.now();
    socket.onopen = () => {
      this.lastHeard = Date.now();
      try {
        socket.send(JSON.stringify({ t: "auth", token: this.opts.token, protocol: 1 } satisfies LiveClientMessage));
      } catch {
        /* onclose follows */
      }
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket) {
        return;
      }
      this.lastHeard = Date.now();
      this.onFrame(String(ev.data));
    };
    socket.onclose = (ev) => {
      if (this.socket === socket && ev?.code === 4401 && !this.fatal) {
        // The room rejected the credential. Retrying cannot help.
        this.fatal = new LiveUnavailableError(ev.reason || "live credential rejected", 401, "UNAUTHENTICATED");
        this.teardown(this.fatal);
        return;
      }
      if (this.socket === socket) {
        this.teardown(new Error("live socket closed"));
        this.scheduleReconnect(null);
      }
    };
    socket.onerror = () => {
      /* onclose follows */
    };
    this.pingTimer = setInterval(() => {
      if (this.socket !== socket) {
        return;
      }
      if (Date.now() - this.lastHeard > this.opts.pingMs * 2) {
        // Half-open socket (sleep, network change). Replace it.
        this.teardown(new Error("live socket stopped answering"));
        this.scheduleReconnect(null);
        return;
      }
      try {
        socket.send("ping");
      } catch {
        /* onclose follows */
      }
    }, this.opts.pingMs);
  }

  private onFrame(text: string): void {
    if (text === "pong") {
      return;
    }
    let msg: LiveServerMessage;
    try {
      msg = JSON.parse(text) as LiveServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case "ready":
        this.ready = true;
        this.backoffMs = 0;
        this.emit((h) => h.onReady?.());
        return;
      case "page": {
        const { t: _t, ...delta } = msg;
        this.emit((h) => h.onPage?.(delta));
        return;
      }
      case "push":
        this.emit((h) => h.onPush?.(msg.docId, msg.event));
        return;
      case "aw":
        this.emit((h) => h.onAwareness?.(msg.docId, msg.entries));
        return;
      case "files":
        this.emit((h) => h.onFiles?.());
        return;
      case "ack": {
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.pending.delete(msg.id);
          const { t: _t, id: _id, ...response } = msg;
          waiter.resolve(response);
        }
        return;
      }
      case "nack": {
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.pending.delete(msg.id);
          waiter.reject(new LiveUnavailableError(msg.message, msg.status, msg.code));
        }
        return;
      }
      case "error":
        if (msg.status === 401 || msg.status === 403 || msg.code === "DEVICE_REVOKED") {
          this.fatal = new LiveUnavailableError(msg.message, msg.status, msg.code);
          this.teardown(this.fatal);
        }
        return;
    }
  }

  private sendFrame(msg: LiveClientMessage): boolean {
    const socket = this.socket;
    if (!socket || !this.ready || socket.readyState !== OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private teardown(error: Error | null): void {
    const socket = this.socket;
    const wasReady = this.ready;
    this.socket = null;
    this.ready = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new LiveUnavailableError("live socket closed", null));
      this.pending.delete(id);
    }
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close(1000, "bye");
      } catch {
        /* already closed */
      }
    }
    if (wasReady || error) {
      this.emit((h) => h.onDown?.(error));
    }
  }

  private scheduleReconnect(error: Error | null): void {
    if (this.stopped || this.fatal || this.reconnectTimer) {
      return;
    }
    if (error) {
      this.emit((h) => h.onDown?.(error));
    }
    this.backoffMs = Math.min(this.opts.maxBackoffMs, Math.max(1_000, this.backoffMs * 2));
    const jitter = Math.floor(Math.random() * 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs + jitter);
  }

  private emit(fn: (h: LivePushHandlers) => void): void {
    for (const handlers of this.listeners) {
      try {
        fn(handlers);
      } catch {
        /* a listener failing must not break the socket */
      }
    }
  }
}
