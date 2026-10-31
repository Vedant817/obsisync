/**
 * Live editing over WebSockets: the real room logic (the same class the
 * Cloudflare Durable Object runs) wired to WsLiveTransport through in-memory
 * sockets, on top of the real API and SQLite log.
 */
import { describe, expect, it } from "vitest";
import { defaultKdfParams, randomId, randomKey, sha256HexBytes, vaultKeyWrap } from "@vaultbridge/crypto";
import type { BootstrapResponse, InviteCreatedResponse, PairCompleteResponse } from "@vaultbridge/protocol";
import { createWorkerHarness, type WorkerHarness } from "@vaultbridge/shared-testkit";
import {
  HttpLiveTransport,
  LiveCipher,
  LiveHub,
  WsLiveTransport,
  type LiveHttpSender,
  type SocketFactory,
  type SocketLike,
} from "@vaultbridge/live-core";
import { LiveRoomCore, type RoomSocket, type RoomSocketState } from "../apps/worker/src/live-room.js";

const enc = new TextEncoder();
const PATH = "Daily/2026-11-01.md";

interface DeviceCtx {
  vaultId: string;
  deviceId: string;
  token: string;
}

async function createVault(harness: WorkerHarness): Promise<{ admin: DeviceCtx; vmk: Uint8Array }> {
  const token = randomId(24);
  await harness.db
    .prepare("INSERT INTO bootstrap_credentials (credential_hash, created_at) VALUES (?1, ?2)")
    .bind(await sha256HexBytes(enc.encode(token)), new Date().toISOString())
    .run();
  const vmk = randomKey();
  const wrapped = await vaultKeyWrap(vmk, "ws pass phrase", randomKey());
  const res = await harness.call("POST", "/v1/bootstrap", {
    body: {
      bootstrapToken: token,
      keyEpoch: 1,
      wrappedVaultKeyB64: wrapped.wrappedByPassphraseB64,
      wrappedVaultKeyRecoveryB64: wrapped.wrappedByRecoveryB64,
      kdfParamsJson: JSON.stringify(defaultKdfParams()),
    },
  });
  const body = res.body as BootstrapResponse;
  return { admin: { vaultId: body.vaultId, deviceId: body.deviceId, token: body.deviceToken }, vmk };
}

async function pairDevice(harness: WorkerHarness, admin: DeviceCtx): Promise<DeviceCtx> {
  const invite = (
    await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, { token: admin.token, body: { ttlSeconds: 600 } })
  ).body as InviteCreatedResponse;
  const proof = await sha256HexBytes(enc.encode(`${invite.pairingCode}:${invite.inviteId}`));
  const pair = (await harness.call("POST", "/v1/pair/complete", { body: { inviteId: invite.inviteId, inviteProof: proof } }))
    .body as PairCompleteResponse;
  return { vaultId: pair.vaultId, deviceId: pair.deviceId, token: pair.deviceToken };
}

/** In-memory stand-in for the Durable Object and the network between. */
class FakeRoom {
  readonly core: LiveRoomCore;
  readonly servers = new Set<ServerEnd>();
  /** Return true to drop a server->client frame (simulates a lost frame). */
  dropFrame: ((text: string, server: ServerEnd) => boolean) | null = null;
  connections = 0;

  constructor(harness: WorkerHarness, vaultId: string) {
    this.core = new LiveRoomCore(harness.db, vaultId, () => this.servers);
  }

  factory(): SocketFactory {
    return () => {
      this.connections++;
      const server = new ServerEnd(this);
      this.servers.add(server);
      return server.client;
    };
  }

  /** Network drop: every socket dies without a close handshake. */
  dropAll(): void {
    for (const server of [...this.servers]) {
      server.kill();
    }
  }
}

class ServerEnd implements RoomSocket {
  readonly key = {};
  private state: RoomSocketState = { deviceId: null, docs: [] };
  private alive = true;
  readonly client: SocketLike;

  constructor(private readonly room: FakeRoom) {
    const server = this;
    this.client = {
      readyState: 0,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data: string) {
        if (!server.alive) {
          throw new Error("socket closed");
        }
        setTimeout(() => server.receive(data), 1);
      },
      close() {
        server.kill();
      },
    };
    setTimeout(() => {
      if (this.alive) {
        (this.client as { readyState: number }).readyState = 1;
        this.client.onopen?.({});
      }
    }, 1);
  }

  private receive(text: string): void {
    if (!this.alive) {
      return;
    }
    if (text === "ping") {
      this.send("pong");
      return;
    }
    void this.room.core.onMessage(this, text);
  }

  send(text: string): void {
    if (!this.alive || this.room.dropFrame?.(text, this)) {
      return;
    }
    // Frames sent before a close are still delivered, as on a real socket.
    setTimeout(() => this.client.onmessage?.({ data: text }), 1);
  }

  close(code?: number): void {
    this.kill(code);
  }

  kill(code = 1006): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.room.servers.delete(this);
    (this.client as { readyState: number }).readyState = 3;
    setTimeout(() => this.client.onclose?.({ code }), 2);
  }

  getState(): RoomSocketState {
    return this.state;
  }

  setState(state: RoomSocketState): void {
    this.state = state;
  }
}

interface Device {
  ctx: DeviceCtx;
  cipher: LiveCipher;
  http: HttpLiveTransport;
  ws: WsLiveTransport;
  polls: () => number;
  hub(options?: { longPollMs?: number; name?: string }): LiveHub;
}

async function setup(): Promise<{ harness: WorkerHarness; room: FakeRoom; a: Device; b: Device }> {
  const harness = createWorkerHarness();
  const { admin, vmk } = await createVault(harness);
  const second = await pairDevice(harness, admin);
  const room = new FakeRoom(harness, admin.vaultId);
  // HTTP appends and commits reach the room, like the Worker forwarding to the Durable Object.
  harness.env.LIVE_HOOKS = {
    onAppend: (_v, docId, event) => room.core.pushEvent(docId, event),
    onAwareness: (_v, docId, entry) => room.core.pushAwareness(docId, entry),
    onFilesChanged: () => room.core.filesChanged(),
  };
  const make = async (ctx: DeviceCtx): Promise<Device> => {
    let polls = 0;
    const send: LiveHttpSender = async (method, path, init) => {
      if (path.endsWith("/live/poll")) {
        polls++;
      }
      const res = await harness.call(method, `/v1${path}`, { token: init.token, body: init.json, query: init.query });
      return { status: res.status, body: res.body };
    };
    const cipher = await LiveCipher.fromVaultKey(vmk, ctx.vaultId);
    const http = new HttpLiveTransport({ vaultId: ctx.vaultId, token: ctx.token, sender: send });
    const ws = new WsLiveTransport({ url: "wss://test/live", token: ctx.token, http, socketFactory: room.factory(), pingMs: 60_000 });
    return {
      ctx,
      cipher,
      http,
      ws,
      polls: () => polls,
      hub: (options = {}) =>
        new LiveHub({
          cipher,
          transport: ws,
          push: ws,
          longPollMs: options.longPollMs ?? 60_000,
          user: { name: options.name ?? ctx.deviceId.slice(0, 6), color: "#1971c2" },
        }),
    };
  };
  return { harness, room, a: await make(admin), b: await make(second) };
}

async function eventually(check: () => boolean, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not reached in time");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("live editing over WebSockets", () => {
  it("pushes keystrokes and cursors without polling", async () => {
    const { a, b } = await setup();
    a.ws.start();
    b.ws.start();
    await eventually(() => a.ws.connected && b.ws.connected);
    const hubA = a.hub({ name: "Laptop" });
    const hubB = b.hub({ name: "Phone" });
    try {
      const docA = await hubA.open(PATH, { diskText: "# Today\n" });
      const docB = await hubB.open(PATH, { diskText: "# Today\n" });
      const pollsAfterJoin = b.polls();

      for (const ch of "- call mom\n") {
        docA.session.text.insert(docA.session.text.length, ch);
        await new Promise((r) => setTimeout(r, 5));
      }
      await eventually(() => docB.session.text.toString() === "# Today\n- call mom\n");
      docB.session.text.insert(0, "x");
      await eventually(() => docA.session.text.toString() === "x# Today\n- call mom\n");

      docA.session.awareness.setLocalStateField("cursor", { anchor: 2, head: 2 });
      await eventually(() => docB.session.peers === 1);
      const remote = [...docB.session.awareness.getStates().values()].find((s) => s.user?.name === "Laptop");
      expect(remote).toBeTruthy();

      // Nothing above needed a poll: it all came over the socket.
      expect(b.polls()).toBe(pollsAfterJoin);

      // Closing the note removes the cursor on the other device at once.
      await hubA.close(docA.session.docId);
      await eventually(() => docB.session.peers === 0, 2_000);
    } finally {
      await Promise.all([hubA.stop(), hubB.stop()]);
      a.ws.stop();
      b.ws.stop();
    }
  });

  it("falls back to HTTP while the socket is down and catches up after reconnecting", async () => {
    const { a, b, room } = await setup();
    a.ws.start();
    b.ws.start();
    await eventually(() => a.ws.connected && b.ws.connected);
    const hubA = a.hub({ longPollMs: 300 });
    const hubB = b.hub({ longPollMs: 300 });
    try {
      const docA = await hubA.open(PATH, { diskText: "start\n" });
      const docB = await hubB.open(PATH, { diskText: "start\n" });

      room.dropAll();
      await eventually(() => !a.ws.connected && !b.ws.connected);
      docA.session.text.insert(docA.session.text.length, "typed offline\n");
      // B's poll loop takes over while the socket is down.
      await eventually(() => docB.session.text.toString() === "start\ntyped offline\n");

      await eventually(() => a.ws.connected && b.ws.connected, 6_000);
      docB.session.text.insert(0, "> ");
      await eventually(() => docA.session.text.toString() === "> start\ntyped offline\n");
      expect(room.connections).toBeGreaterThanOrEqual(4);
    } finally {
      await Promise.all([hubA.stop(), hubB.stop()]);
      a.ws.stop();
      b.ws.stop();
    }
  });

  it("recovers a lost frame by asking for what it missed", async () => {
    const { a, b, room } = await setup();
    a.ws.start();
    b.ws.start();
    await eventually(() => a.ws.connected && b.ws.connected);
    const hubA = a.hub();
    const hubB = b.hub();
    try {
      const docA = await hubA.open(PATH, { diskText: "" });
      const docB = await hubB.open(PATH, { diskText: "" });
      let dropped = 0;
      room.dropFrame = (text) => {
        if (dropped === 0 && text.includes('"t":"push"')) {
          dropped++;
          return true;
        }
        return false;
      };
      docA.session.text.insert(0, "one ");
      await docA.session.flush();
      await new Promise((r) => setTimeout(r, 30));
      docA.session.text.insert(4, "two");
      await eventually(() => docB.session.text.toString() === "one two");
      expect(dropped).toBe(1);
    } finally {
      await Promise.all([hubA.stop(), hubB.stop()]);
      a.ws.stop();
      b.ws.stop();
    }
  });

  it("relays HTTP appends from an older client and file-sync commits to sockets", async () => {
    const { a, b } = await setup();
    b.ws.start();
    await eventually(() => b.ws.connected);
    let files = 0;
    b.ws.listen({ onFiles: () => files++ });
    // A is an HTTP-only client (no socket at all).
    const hubA = new LiveHub({ cipher: a.cipher, transport: a.http, longPollMs: 300 });
    const hubB = b.hub();
    try {
      const docA = await hubA.open(PATH, { diskText: "old client\n" });
      const docB = await hubB.open(PATH, { diskText: "old client\n" });
      const pollsBefore = b.polls();
      docA.session.text.insert(0, "* ");
      await eventually(() => docB.session.text.toString() === "* old client\n");
      expect(b.polls()).toBe(pollsBefore);
      expect(files).toBe(0);
    } finally {
      await Promise.all([hubA.stop(), hubB.stop()]);
      b.ws.stop();
    }
  });

  it("tells sockets when a file-sync commit lands", async () => {
    const { b, room } = await setup();
    b.ws.start();
    await eventually(() => b.ws.connected);
    let files = 0;
    b.ws.listen({ onFiles: () => files++ });
    room.core.filesChanged();
    await eventually(() => files === 1);
    b.ws.stop();
  });

  it("a rejected credential stops reconnecting", async () => {
    const { harness, a, room } = await setup();
    const bad = new WsLiveTransport({
      url: "wss://test/live",
      token: "vbd_this_token_is_not_real_000000",
      http: a.http,
      socketFactory: room.factory(),
    });
    let down: Error | null = null;
    bad.listen({ onDown: (e) => (down = e) });
    bad.start();
    await eventually(() => bad.fatalError !== null);
    expect(bad.connected).toBe(false);
    expect(String(down)).toMatch(/credential|UNAUTHENTICATED/i);
    const before = room.connections;
    await new Promise((r) => setTimeout(r, 1_200));
    expect(room.connections).toBe(before);
    void harness;
    bad.stop();
  });
});
