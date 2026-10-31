/**
 * Cloudflare entry: the sync API as a Worker, plus one `LiveRoom` Durable
 * Object per vault that holds that vault's WebSockets.
 *
 * - HTTP routes are the same handlers the Node server runs. Turso stays the
 *   database, reached over HTTPS.
 * - `GET /v1/vaults/:vaultId/live/ws` upgrades into the vault's room. The
 *   socket authenticates with its first frame, so the device token never
 *   appears in a URL or a header that proxies log.
 * - HTTP appends, cursor updates, and file-sync commits are forwarded to the
 *   room, so connected devices hear about them without polling.
 * - Sockets use the hibernation API: an idle room costs nothing.
 */
import { handleVaultBridgeRequest, type VaultBridgeEnv } from "./routes.js";
import { TursoDatabase } from "./turso-db.js";
import type { LiveHooks, LivePushedEvent } from "./live.js";
import { LiveRoomCore, type RoomSocket, type RoomSocketState } from "./live-room.js";
import type { LiveAwarenessWire } from "@vaultbridge/protocol";

// Minimal Workers runtime types, declared locally so the package keeps one
// set of DOM/Node typings.
interface CfWebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectStateLike {
  acceptWebSocket(ws: CfWebSocket): void;
  getWebSockets(): CfWebSocket[];
  setWebSocketAutoResponse(pair: unknown): void;
}
interface DurableObjectStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
  fetch(input: Request): Promise<Response>;
}
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };
declare const WebSocketRequestResponsePair: { new (request: string, response: string): unknown };

export interface CloudflareEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  LIVE_ROOMS: DurableObjectNamespaceLike;
  WORKER_VERSION?: string;
  PROTOCOL_VERSION?: string;
  BOOTSTRAP_DISABLED?: string;
}

const WS_PATH = /^\/v1\/vaults\/([A-Za-z0-9_-]+)\/live\/ws$/;

let db: TursoDatabase | null = null;
function database(env: CloudflareEnv): TursoDatabase {
  db ??= new TursoDatabase(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  return db;
}

function room(env: CloudflareEnv, vaultId: string): DurableObjectStubLike {
  return env.LIVE_ROOMS.get(env.LIVE_ROOMS.idFromName(vaultId));
}

type RoomNotice =
  | { type: "push"; vaultId: string; docId: string; event: LivePushedEvent }
  | { type: "aw"; vaultId: string; docId: string; entry: LiveAwarenessWire }
  | { type: "files"; vaultId: string };

function hooks(env: CloudflareEnv, ctx: ExecutionContextLike): LiveHooks {
  const notify = (notice: RoomNotice) => {
    ctx.waitUntil(
      room(env, notice.vaultId)
        .fetch("https://room.internal/notify", { method: "POST", body: JSON.stringify(notice) })
        .catch(() => undefined),
    );
  };
  return {
    onAppend: (vaultId, docId, event) => notify({ type: "push", vaultId, docId, event }),
    onAwareness: (vaultId, docId, entry) => notify({ type: "aw", vaultId, docId, entry }),
    onFilesChanged: (vaultId) => notify({ type: "files", vaultId }),
  };
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const ws = url.pathname.match(WS_PATH);
    if (ws) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected a WebSocket upgrade", { status: 426 });
      }
      return room(env, ws[1]!).fetch(request);
    }
    const routesEnv: VaultBridgeEnv = {
      DB: database(env),
      TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
      WORKER_VERSION: env.WORKER_VERSION ?? "0.3.1",
      PROTOCOL_VERSION: env.PROTOCOL_VERSION ?? "1",
      BOOTSTRAP_DISABLED: env.BOOTSTRAP_DISABLED,
      LIVE_HOOKS: hooks(env, ctx),
    };
    return handleVaultBridgeRequest(request, routesEnv);
  },
};

interface Attachment extends RoomSocketState {
  vaultId: string;
}

/** One per vault. Holds that vault's sockets and relays between them. */
export class LiveRoom {
  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: CloudflareEnv,
  ) {
    // Keepalive pings are answered without waking the object.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private core(vaultId: string): LiveRoomCore {
    return new LiveRoomCore(database(this.env), vaultId, () =>
      this.state
        .getWebSockets()
        .filter((ws) => (ws.deserializeAttachment() as Attachment | null)?.vaultId === vaultId)
        .map((ws) => wrap(ws)),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const ws = url.pathname.match(WS_PATH);
    if (ws) {
      const pair = new WebSocketPair();
      const server = pair[1];
      this.state.acceptWebSocket(server);
      const attachment: Attachment = { vaultId: ws[1]!, deviceId: null, docs: [] };
      server.serializeAttachment(attachment);
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      const notice = (await request.json()) as RoomNotice;
      const core = this.core(notice.vaultId);
      if (notice.type === "push") {
        core.pushEvent(notice.docId, notice.event);
      } else if (notice.type === "aw") {
        core.pushAwareness(notice.docId, notice.entry);
      } else {
        core.filesChanged();
      }
      return new Response(null, { status: 204 });
    }
    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text === "ping") {
      ws.send("pong");
      return;
    }
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) {
      ws.close(4400, "no session");
      return;
    }
    await this.core(attachment.vaultId).onMessage(wrap(ws), text);
  }

  async webSocketClose(ws: CfWebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "closed");
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: CfWebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      /* already closed */
    }
  }
}

function wrap(ws: CfWebSocket): RoomSocket {
  return {
    key: ws,
    send: (text) => ws.send(text),
    close: (code, reason) => ws.close(code, reason),
    getState: () => {
      const a = ws.deserializeAttachment() as Attachment | null;
      return { deviceId: a?.deviceId ?? null, docs: a?.docs ?? [] };
    },
    setState: (next) => {
      const a = (ws.deserializeAttachment() as Attachment | null) ?? { vaultId: "", deviceId: null, docs: [] };
      ws.serializeAttachment({ ...a, ...next });
    },
  };
}
