/**
 * One vault's live room: every connected device of the vault, one socket each.
 *
 * Platform-agnostic. The Cloudflare Durable Object (cf-entry.ts) adapts real
 * hibernatable WebSockets to `RoomSocket`; tests use in-memory sockets.
 *
 * The Turso log stays the source of truth. The room appends to it, then
 * pushes the new event to the other subscribed sockets, so a keystroke
 * reaches the other device in one hop instead of waiting for a poll.
 * HTTP pollers (older plugins, blocked WebSockets) still read the same log.
 */
import {
  LIVE_DOC_ID_PATTERN,
  LIVE_LIMITS,
  VaultBridgeError,
  type LiveAwarenessWire,
  type LiveClientMessage,
  type LiveServerMessage,
} from "@vaultbridge/protocol";
import { z } from "zod";
import { authenticate } from "./auth.js";
import type { D1DatabaseLike } from "./ports.js";
import {
  ensureLiveSchema,
  liveAppend,
  liveSetAwareness,
  readAwareness,
  readEvents,
  type LivePushedEvent,
} from "./live.js";

/** Documents one socket may follow at once. */
export const MAX_DOCS_PER_SOCKET = 64;

export interface RoomSocketState {
  deviceId: string | null;
  docs: string[];
}

export interface RoomSocket {
  /** Identity of the underlying connection (wrappers may be recreated). */
  readonly key: unknown;
  send(text: string): void;
  close(code: number, reason: string): void;
  getState(): RoomSocketState;
  setState(state: RoomSocketState): void;
}

const docIdSchema = z.string().regex(LIVE_DOC_ID_PATTERN);
const messageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("auth"), token: z.string().min(16).max(256), protocol: z.number().int() }),
  z.object({
    t: z.literal("sub"),
    docs: z.array(z.object({ docId: docIdSchema, after: z.number().int().min(0) })).max(MAX_DOCS_PER_SOCKET),
  }),
  z.object({ t: z.literal("unsub"), docIds: z.array(docIdSchema).max(MAX_DOCS_PER_SOCKET) }),
  z.object({
    t: z.literal("append"),
    id: z.number().int(),
    docId: docIdSchema,
    kind: z.enum(["u", "s"]),
    payload: z.string(),
    ifHead: z.number().int().min(0).optional(),
    replaceUpTo: z.number().int().min(0).optional(),
  }),
  z.object({ t: z.literal("aw"), docId: docIdSchema, payload: z.string().nullable() }),
]);

export class LiveRoomCore {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly vaultId: string,
    private readonly sockets: () => Iterable<RoomSocket>,
  ) {}

  async onMessage(ws: RoomSocket, raw: string): Promise<void> {
    let msg: LiveClientMessage;
    try {
      msg = messageSchema.parse(JSON.parse(raw)) as LiveClientMessage;
    } catch {
      this.send(ws, { t: "error", status: 422, code: "INVALID_REQUEST", message: "malformed live frame" });
      return;
    }
    if (msg.t === "auth") {
      await this.auth(ws, msg.token);
      return;
    }
    const state = ws.getState();
    if (!state.deviceId) {
      this.send(ws, { t: "error", status: 401, code: "UNAUTHENTICATED", message: "send auth first" });
      ws.close(4401, "unauthenticated");
      return;
    }
    try {
      await ensureLiveSchema(this.db);
      switch (msg.t) {
        case "sub":
          await this.subscribe(ws, state, msg.docs);
          return;
        case "unsub":
          ws.setState({ ...state, docs: state.docs.filter((d) => !msg.docIds.includes(d)) });
          return;
        case "append":
          await this.append(ws, state.deviceId, msg);
          return;
        case "aw":
          await this.awareness(ws, state.deviceId, msg.docId, msg.payload);
          return;
      }
    } catch (err) {
      const { status, code, message } = describe(err);
      if (msg.t === "append") {
        this.send(ws, { t: "nack", id: msg.id, status, code, message });
      } else {
        this.send(ws, { t: "error", status, code, message });
      }
    }
  }

  private async auth(ws: RoomSocket, token: string): Promise<void> {
    try {
      const request = new Request("https://live.invalid/", { headers: { authorization: `Bearer ${token}` } });
      const auth = await authenticate(this.db, request, { touch: false });
      if (auth.vault.vault_id !== this.vaultId) {
        throw new VaultBridgeError("DEVICE_REVOKED", "device is not a member of this vault");
      }
      ws.setState({ deviceId: auth.device.device_id, docs: [] });
      this.send(ws, { t: "ready", deviceId: auth.device.device_id });
    } catch (err) {
      const { status, code, message } = describe(err);
      this.send(ws, { t: "error", status, code, message });
      ws.close(4401, code);
    }
  }

  private async subscribe(ws: RoomSocket, state: RoomSocketState, docs: { docId: string; after: number }[]): Promise<void> {
    const next = [...new Set([...state.docs, ...docs.map((d) => d.docId)])];
    if (next.length > MAX_DOCS_PER_SOCKET) {
      throw new VaultBridgeError("INVALID_REQUEST", `a socket follows at most ${MAX_DOCS_PER_SOCKET} notes`);
    }
    ws.setState({ ...state, docs: next });
    const me = state.deviceId!;
    for (const doc of docs) {
      let after = doc.after;
      for (;;) {
        const delta = await readEvents(this.db, this.vaultId, me, { docId: doc.docId, after }, false);
        this.send(ws, { t: "page", ...delta });
        if (!delta.hasMore) {
          break;
        }
        after = delta.cursor;
      }
    }
    if (docs.length > 0) {
      const cursors = await readAwareness(this.db, this.vaultId, me, docs.map((d) => ({ docId: d.docId, after: 0 })), 0);
      for (const [docId, entries] of cursors) {
        this.send(ws, { t: "aw", docId, entries });
      }
    }
  }

  private async append(
    ws: RoomSocket,
    deviceId: string,
    msg: Extract<LiveClientMessage, { t: "append" }>,
  ): Promise<void> {
    const { t: _t, id, docId, ...request } = msg;
    // Plain typing cannot be rejected for content, so relay it before the
    // database round trips. Conditional appends and snapshots wait: the
    // server may refuse them.
    const relayFirst =
      request.kind === "u" &&
      request.ifHead === undefined &&
      request.payload.length > 0 &&
      request.payload.length <= LIVE_LIMITS.maxUpdateChars;
    const rid = `${deviceId}:${id}`;
    if (relayFirst) {
      this.broadcast(docId, { t: "relay", docId, rid, event: { kind: "u", deviceId, payload: request.payload } }, ws);
    }
    const result = await liveAppend(this.db, this.vaultId, deviceId, docId, request);
    const { event, ...wire } = result;
    this.send(ws, { t: "ack", id, ...wire });
    if (event) {
      if (relayFirst) {
        this.broadcast(docId, { t: "commit", docId, rid, seq: event.seq, prev: event.prev }, ws);
      } else {
        this.pushEvent(docId, event, ws);
      }
    }
  }

  private async awareness(ws: RoomSocket, deviceId: string, docId: string, payload: string | null): Promise<void> {
    if (payload !== null && payload.length > LIVE_LIMITS.maxAwarenessChars) {
      throw new VaultBridgeError("INVALID_REQUEST", "cursor state too large", { status: 413 });
    }
    if (payload !== null) {
      // Relay first: cursors are latency-sensitive, and the row is only for pollers.
      this.pushAwareness(docId, { deviceId, payload, updatedMs: Date.now() }, ws);
    }
    await liveSetAwareness(this.db, this.vaultId, deviceId, docId, { payload });
  }

  /** Forward an appended event to every other socket following the doc. */
  pushEvent(docId: string, event: LivePushedEvent, except?: RoomSocket): void {
    this.broadcast(docId, { t: "push", docId, event }, except);
  }

  pushAwareness(docId: string, entry: LiveAwarenessWire, except?: RoomSocket): void {
    this.broadcast(docId, { t: "aw", docId, entries: [entry] }, except);
  }

  /** A file-sync commit landed: every device in the vault can pull now. */
  filesChanged(): void {
    for (const ws of this.sockets()) {
      if (ws.getState().deviceId) {
        this.send(ws, { t: "files" });
      }
    }
  }

  private broadcast(docId: string, msg: LiveServerMessage, except?: RoomSocket): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets()) {
      if (except && ws.key === except.key) {
        continue;
      }
      const state = ws.getState();
      if (state.deviceId && state.docs.includes(docId)) {
        try {
          ws.send(text);
        } catch {
          /* a dead socket is cleaned up by its close event */
        }
      }
    }
  }

  private send(ws: RoomSocket, msg: LiveServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }
}

function describe(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof VaultBridgeError) {
    return { status: err.status, code: err.code, message: err.message };
  }
  if (err instanceof z.ZodError) {
    return { status: 422, code: "INVALID_REQUEST", message: "malformed live frame" };
  }
  return { status: 500, code: "RETRYABLE_BACKEND", message: err instanceof Error ? err.message : "live relay failed" };
}
