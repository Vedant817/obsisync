/**
 * Sealed Sync Live: two and three devices editing the same note through the
 * real sync API (SQLite fake + live relay). Every assertion that matters is
 * "all devices read byte-identical text, and nothing was lost or doubled".
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { defaultKdfParams, randomId, randomKey, sha256HexBytes, vaultKeyWrap } from "@vaultbridge/crypto";
import type { BootstrapResponse, InviteCreatedResponse, PairCompleteResponse } from "@vaultbridge/protocol";
import { createWorkerHarness, type WorkerHarness } from "@vaultbridge/shared-testkit";
import {
  HttpLiveTransport,
  LiveCipher,
  LiveDocSession,
  LiveHub,
  type LiveDocStore,
  type LiveHttpSender,
} from "@vaultbridge/live-core";

const enc = new TextEncoder();

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
  const wrapped = await vaultKeyWrap(vmk, "live pass phrase", randomKey());
  const res = await harness.call("POST", "/v1/bootstrap", {
    body: {
      bootstrapToken: token,
      keyEpoch: 1,
      wrappedVaultKeyB64: wrapped.wrappedByPassphraseB64,
      wrappedVaultKeyRecoveryB64: wrapped.wrappedByRecoveryB64,
      kdfParamsJson: JSON.stringify(defaultKdfParams()),
    },
  });
  expect([200, 201]).toContain(res.status);
  const body = res.body as BootstrapResponse;
  return { admin: { vaultId: body.vaultId, deviceId: body.deviceId, token: body.deviceToken }, vmk };
}

async function pairDevice(harness: WorkerHarness, admin: DeviceCtx): Promise<DeviceCtx> {
  const inviteRes = await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, {
    token: admin.token,
    body: { ttlSeconds: 600 },
  });
  const invite = inviteRes.body as InviteCreatedResponse;
  const proof = await sha256HexBytes(enc.encode(`${invite.pairingCode}:${invite.inviteId}`));
  const joinRes = await harness.call("POST", "/v1/pair/complete", {
    body: { inviteId: invite.inviteId, inviteProof: proof },
  });
  const pair = joinRes.body as PairCompleteResponse;
  return { vaultId: pair.vaultId, deviceId: pair.deviceId, token: pair.deviceToken };
}

function sender(harness: WorkerHarness): LiveHttpSender {
  return async (method, path, init) => {
    const res = await harness.call(method, `/v1${path}`, { token: init.token, body: init.json, query: init.query });
    return { status: res.status, body: res.body };
  };
}

class MemoryStore implements LiveDocStore {
  readonly states = new Map<string, Uint8Array>();
  async load(docId: string) {
    return this.states.get(docId) ?? null;
  }
  async save(docId: string, state: Uint8Array) {
    this.states.set(docId, state);
  }
}

interface Device {
  ctx: DeviceCtx;
  cipher: LiveCipher;
  transport: HttpLiveTransport;
  session(path: string, extra?: { compactAfterEvents?: number }): Promise<LiveDocSession>;
}

async function device(harness: WorkerHarness, ctx: DeviceCtx, vmk: Uint8Array): Promise<Device> {
  const cipher = await LiveCipher.fromVaultKey(vmk, ctx.vaultId);
  const transport = new HttpLiveTransport({ vaultId: ctx.vaultId, token: ctx.token, sender: sender(harness) });
  return {
    ctx,
    cipher,
    transport,
    async session(path, extra = {}) {
      return new LiveDocSession({ docId: await cipher.docId(path), path, cipher, transport, ...extra });
    },
  };
}

async function setup(count = 2): Promise<{ harness: WorkerHarness; devices: Device[] }> {
  const harness = createWorkerHarness();
  const { admin, vmk } = await createVault(harness);
  const devices = [await device(harness, admin, vmk)];
  for (let i = 1; i < count; i++) {
    devices.push(await device(harness, await pairDevice(harness, admin), vmk));
  }
  return { harness, devices };
}

async function eventually(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not reached in time");
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const PATH = "Projects/Plan.md";

describe("live editing relay", () => {
  it("seeds a note once and the second device joins in sync", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    const b = await devices[1]!.session(PATH);
    expect((await a.join({ diskText: "hello world", base: null })).outcome).toBe("seeded");
    const joined = await b.join({ diskText: "hello world", base: null });
    expect(joined.outcome).toBe("in-sync");
    expect(b.text.toString()).toBe("hello world");
  });

  it("two devices seeding the same note at once do not double the text", async () => {
    const { devices } = await setup();
    const [a, b] = await Promise.all([devices[0]!.session(PATH), devices[1]!.session(PATH)]);
    await Promise.all([
      a.join({ diskText: "# Plan\nship it\n", base: null }),
      b.join({ diskText: "# Plan\nship it\n", base: null }),
    ]);
    await a.catchUp();
    await b.catchUp();
    expect(a.text.toString()).toBe("# Plan\nship it\n");
    expect(b.text.toString()).toBe("# Plan\nship it\n");
  });

  it("merges concurrent typing at the character level", async () => {
    const { devices } = await setup(3);
    const [a, b, c] = await Promise.all(devices.map((d) => d.session(PATH)));
    await a!.join({ diskText: "The quick fox.", base: null });
    await b!.join({ diskText: "The quick fox.", base: null });
    await c!.join({ diskText: "The quick fox.", base: null });

    a!.text.insert(4, "very ");
    b!.text.insert(b!.text.length - 1, " jumps");
    c!.text.delete(0, 4);
    c!.text.insert(0, "A ");
    await Promise.all([a!.flush(), b!.flush(), c!.flush()]);
    await Promise.all([a!.catchUp(), b!.catchUp(), c!.catchUp()]);

    const text = a!.text.toString();
    expect(b!.text.toString()).toBe(text);
    expect(c!.text.toString()).toBe(text);
    // Two inserts at the same spot are ordered by client id, which is random.
    expect(["A very quick fox jumps.", "very A quick fox jumps."]).toContain(text);
  });

  it("random concurrent edits from three devices converge byte for byte", async () => {
    const { devices } = await setup(3);
    const sessions = await Promise.all(devices.map((d) => d.session(PATH)));
    for (const s of sessions) {
      await s.join({ diskText: "0123456789", base: null });
    }
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 12; round++) {
      for (const s of sessions) {
        const len = s.text.length;
        if (len > 0 && rand(3) === 0) {
          s.text.delete(rand(len), Math.min(1 + rand(3), len - 1 || 1));
        } else {
          s.text.insert(rand(len + 1), String.fromCharCode(97 + rand(26)));
        }
      }
      if (round % 3 === 0) {
        await Promise.all(sessions.map((s) => s.flush()));
        await Promise.all(sessions.map((s) => s.catchUp()));
      }
    }
    await Promise.all(sessions.map((s) => s.flush()));
    await Promise.all(sessions.map((s) => s.catchUp()));
    const text = sessions[0]!.text.toString();
    for (const s of sessions) {
      expect(s.text.toString()).toBe(text);
    }
  });

  it("folds offline disk edits into the live note against the last state this device saw", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    const b = await devices[1]!.session(PATH);
    await a.join({ diskText: "line one\nline two\n", base: null });
    await b.join({ diskText: "line one\nline two\n", base: null });
    const bBase = b.encodeState();
    await b.close();

    // A keeps typing live. B edits the file while live editing is closed.
    a.text.delete(0, 8);
    a.text.insert(0, "LINE ONE");
    await a.flush();

    const b2 = await devices[1]!.session(PATH);
    const result = await b2.join({ diskText: "line one\nline two\nline three\n", base: bBase });
    expect(result.outcome).toBe("merged-disk");
    await a.catchUp();
    expect(b2.text.toString()).toBe("LINE ONE\nline two\nline three\n");
    expect(a.text.toString()).toBe("LINE ONE\nline two\nline three\n");
  });

  it("does not fold the same external edit in twice when two devices reopen together", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    const b = await devices[1]!.session(PATH);
    await a.join({ diskText: "alpha\n", base: null });
    await b.join({ diskText: "alpha\n", base: null });
    const aBase = a.encodeState();
    const bBase = b.encodeState();
    await a.close();
    await b.close();

    // A script appended a line on both disks (e.g. file sync copied it).
    const disk = "alpha\nbeta\n";
    const [a2, b2] = await Promise.all([devices[0]!.session(PATH), devices[1]!.session(PATH)]);
    await Promise.all([a2.join({ diskText: disk, base: aBase }), b2.join({ diskText: disk, base: bBase })]);
    await a2.catchUp();
    await b2.catchUp();
    expect(a2.text.toString()).toBe(disk);
    expect(b2.text.toString()).toBe(disk);
  });

  it("a stale disk copy adopts the live text instead of reverting it", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    await a.join({ diskText: "draft", base: null });
    a.text.insert(5, " v2");
    await a.flush();
    const b = await devices[1]!.session(PATH);
    const result = await b.join({ diskText: "draft", base: null });
    expect(result.outcome).toBe("adopted-server");
    expect(result.text).toBe("draft v2");
  });

  it("re-sends edits that never reached the server before a restart", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    await a.join({ diskText: "base", base: null });
    // Offline edit: applied locally, persisted, never sent.
    const offline = new Y.Doc();
    Y.applyUpdate(offline, a.encodeState());
    offline.getText("content").insert(4, " + offline");
    await a.close();

    const a2 = await devices[0]!.session(PATH);
    await a2.join({ diskText: "base + offline", base: Y.encodeStateAsUpdate(offline) });
    const b = await devices[1]!.session(PATH);
    await b.join({ diskText: "base", base: null });
    expect(b.text.toString()).toBe("base + offline");
  });

  it("replaceText folds a file-sync download into the live note once", async () => {
    const { devices } = await setup();
    const a = await devices[0]!.session(PATH);
    const b = await devices[1]!.session(PATH);
    await a.join({ diskText: "one\ntwo\n", base: null });
    await b.join({ diskText: "one\ntwo\n", base: null });
    await Promise.all([a.replaceText("one\ntwo\nthree\n"), b.replaceText("one\ntwo\nthree\n")]);
    await a.catchUp();
    await b.catchUp();
    expect(a.text.toString()).toBe("one\ntwo\nthree\n");
    expect(b.text.toString()).toBe("one\ntwo\nthree\n");
  });

  it("the server stores only ciphertext and an opaque document id", async () => {
    const { harness, devices } = await setup();
    const a = await devices[0]!.session("Secret/Diary.md");
    await a.join({ diskText: "my secret-word lives here", base: null });
    a.setUser("Laptop", "#ff0066");
    a.text.insert(0, "classified ");
    await a.flush();
    await new Promise((r) => setTimeout(r, 200));
    const events = await harness.db.prepare("SELECT doc_id, payload FROM live_events").all<{ doc_id: string; payload: string }>();
    const cursors = await harness.db.prepare("SELECT payload FROM live_awareness").all<{ payload: string }>();
    const dump = JSON.stringify([events.results, cursors.results]);
    expect(events.results.length).toBeGreaterThan(0);
    for (const needle of ["secret-word", "classified", "Diary", "Secret", "Laptop"]) {
      expect(dump.includes(needle)).toBe(false);
      expect(dump.includes(Buffer.from(needle).toString("base64").slice(0, 6))).toBe(false);
    }
  });

  it("a device with the wrong vault key cannot read the note and does not seed over it", async () => {
    const { harness, devices } = await setup();
    const a = await devices[0]!.session(PATH);
    await a.join({ diskText: "real text", base: null });
    const wrong = LiveCipher.fromLiveKey(randomKey(), devices[1]!.ctx.vaultId);
    const transport = new HttpLiveTransport({
      vaultId: devices[1]!.ctx.vaultId,
      token: devices[1]!.ctx.token,
      sender: sender(harness),
    });
    // Same doc id as the real one, wrong sealing key.
    const intruder = new LiveDocSession({ docId: await devices[0]!.cipher.docId(PATH), path: PATH, cipher: wrong, transport });
    await expect(intruder.join({ diskText: "garbage", base: null })).rejects.toThrow(/decrypt/);
    const b = await devices[1]!.session(PATH);
    await b.join({ diskText: "real text", base: null });
    expect(b.text.toString()).toBe("real text");
  });

  it("skips a corrupt event and keeps the rest of the note", async () => {
    const { harness, devices } = await setup();
    const a = await devices[0]!.session(PATH);
    await a.join({ diskText: "keep me", base: null });
    const docId = await devices[0]!.cipher.docId(PATH);
    await harness.call("POST", `/v1/vaults/${devices[0]!.ctx.vaultId}/live/docs/${docId}/events`, {
      token: devices[0]!.ctx.token,
      body: { kind: "u", payload: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    });
    a.text.insert(7, "!");
    await a.flush();
    const b = await devices[1]!.session(PATH);
    const joined = await b.join({ diskText: "keep me", base: null });
    expect(joined.skipped).toBe(1);
    expect(b.text.toString()).toBe("keep me!");
  });

  it("compacts a long log into a snapshot that new devices load", async () => {
    const { harness, devices } = await setup();
    const a = await devices[0]!.session(PATH, { compactAfterEvents: 5 });
    await a.join({ diskText: "", base: null });
    for (let i = 0; i < 12; i++) {
      a.text.insert(a.text.length, `${i},`);
      await a.flush();
    }
    // Snapshots replace only what this device has seen through the poll cursor.
    await a.catchUp();
    for (let i = 12; i < 15; i++) {
      a.text.insert(a.text.length, `${i},`);
      await a.flush();
    }
    const rows = await harness.db.prepare("SELECT kind FROM live_events").all<{ kind: string }>();
    expect(rows.results.length).toBeLessThan(15);
    expect(rows.results.some((r) => r.kind === "s")).toBe(true);
    const b = await devices[1]!.session(PATH);
    await b.join({ diskText: "", base: null });
    expect(b.text.toString()).toBe(a.text.toString());
    expect(b.text.toString().startsWith("0,1,2,")).toBe(true);
  });

  it("rejects a malformed doc id and an oversized update", async () => {
    const { harness, devices } = await setup();
    const { vaultId, token } = devices[0]!.ctx;
    const bad = await harness.call("POST", `/v1/vaults/${vaultId}/live/docs/x/events`, {
      token,
      body: { kind: "u", payload: "abc" },
    });
    expect(bad.status).toBe(422);
    const docId = await devices[0]!.cipher.docId(PATH);
    const huge = await harness.call("POST", `/v1/vaults/${vaultId}/live/docs/${docId}/events`, {
      token,
      body: { kind: "u", payload: "a".repeat(800_000) },
    });
    expect(huge.status).toBe(413);
    const anon = await harness.call("GET", `/v1/vaults/${vaultId}/live/poll`, { query: { d: `${docId}:0` } });
    expect(anon.status).toBe(401);
  });

  it("another vault's device cannot read this vault's live log", async () => {
    const { harness, devices } = await setup();
    const a = await devices[0]!.session(PATH);
    await a.join({ diskText: "private", base: null });
    const other = await createVault(harness);
    const res = await harness.call("GET", `/v1/vaults/${devices[0]!.ctx.vaultId}/live/poll`, {
      token: other.admin.token,
      query: { d: `${a.docId}:0`, self: "1" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const own = await harness.call("GET", `/v1/vaults/${other.admin.vaultId}/live/poll`, {
      token: other.admin.token,
      query: { d: `${a.docId}:0`, self: "1" },
    });
    expect((own.body as { docs: { events: unknown[] }[] }).docs[0]!.events).toHaveLength(0);
  });
});

describe("live hub", () => {
  it("delivers a remote keystroke and the remote cursor through the poll loop", async () => {
    const { devices } = await setup();
    const storeA = new MemoryStore();
    const hubs = devices.map(
      (d, i) =>
        new LiveHub({
          cipher: d.cipher,
          transport: d.transport,
          store: i === 0 ? storeA : new MemoryStore(),
          longPollMs: 1_500,
          persistDelayMs: 50,
          user: { name: i === 0 ? "Laptop" : "Phone", color: "#3366ff" },
        }),
    );
    try {
      const a = await hubs[0]!.open(PATH, { diskText: "Shopping list\n" });
      const b = await hubs[1]!.open(PATH, { diskText: "Shopping list\n" });
      expect(b.join.text).toBe("Shopping list\n");

      a.session.text.insert(a.session.text.length, "- milk\n");
      await eventually(() => b.session.text.toString() === "Shopping list\n- milk\n");

      b.session.text.insert(0, "# ");
      await eventually(() => a.session.text.toString() === "# Shopping list\n- milk\n");

      a.session.awareness.setLocalStateField("cursor", { anchor: 1, head: 1 });
      await eventually(() => b.session.peers === 1, 6_000);
      const remote = [...b.session.awareness.getStates().values()].find((s) => s.user?.name === "Laptop");
      expect(remote?.user?.name).toBe("Laptop");

      await eventually(() => storeA.states.has(a.session.docId));

      // A cursor sitting still must not make the long poll return at once.
      const before = hubs[1]!.pollCount;
      await new Promise((r) => setTimeout(r, 1_600));
      expect(hubs[1]!.pollCount - before).toBeLessThanOrEqual(3);
    } finally {
      await Promise.all(hubs.map((h) => h.stop()));
    }
  });

  it("a note reopened after closing resumes from the persisted state", async () => {
    const { devices } = await setup();
    const store = new MemoryStore();
    const hub = new LiveHub({ cipher: devices[0]!.cipher, transport: devices[0]!.transport, store, longPollMs: 500 });
    try {
      const first = await hub.open(PATH, { diskText: "v1" });
      first.session.text.insert(2, " edited");
      await hub.close(first.session.docId);
      expect(store.states.has(first.session.docId)).toBe(true);
      const again = await hub.open(PATH, { diskText: "v1 edited" });
      expect(again.join.outcome).toBe("in-sync");
      expect(again.session.text.toString()).toBe("v1 edited");
    } finally {
      await hub.stop();
    }
  });

  it("a device opening a note sees cursors that are already there", async () => {
    const { devices } = await setup();
    const hubA = new LiveHub({ cipher: devices[0]!.cipher, transport: devices[0]!.transport, longPollMs: 500, user: { name: "Laptop", color: "#f00" } });
    const hubB = new LiveHub({ cipher: devices[1]!.cipher, transport: devices[1]!.transport, longPollMs: 500 });
    try {
      await hubA.open(PATH, { diskText: "x" });
      await new Promise((r) => setTimeout(r, 300));
      const b = await hubB.open(PATH, { diskText: "x" });
      expect(b.session.peers).toBe(1);
    } finally {
      await Promise.all([hubA.stop(), hubB.stop()]);
    }
  });
});
