/**
 * WP-06: two real sync-core devices against the REAL sync API (SQLite +
 * in-memory object store through the harness). Exercises the spec test matrix shapes:
 *   T04 — paged change-feed convergence across devices
 *   T05 — the later edit replaces the note on the other device
 *   T06 — tombstone lifecycle (delete / recreate / edit-vs-delete resolution)
 */
import { describe, expect, it } from "vitest";
import {
  contentEnvelopeDecrypt,
  defaultKdfParams,
  deriveContentKey,
  deriveManifestKey,
  fromBase64,
  randomId,
  randomKey,
  sha256HexBytes,
  vaultKeyWrap,
} from "@vaultbridge/crypto";
import type { BootstrapResponse, InviteCreatedResponse, PairCompleteResponse } from "@vaultbridge/protocol";
import { createWorkerHarness, type WorkerHarness } from "@vaultbridge/shared-testkit";
import {
  createSyncEngine,
  HttpSyncTransport,
  SyncJournal,
  type HttpSender,
  type SyncEngine,
} from "@vaultbridge/sync-core";
import { FakeVault, MemoryPersistence } from "../packages/sync-core/tests/fakes.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

interface DeviceCtx {
  vaultId: string;
  deviceId: string;
  token: string;
}

async function sha256HexText(text: string): Promise<string> {
  return sha256HexBytes(enc.encode(text));
}

/** Seed a one-time bootstrap credential directly (same trick the API tests use). */
async function seedBootstrapToken(harness: WorkerHarness): Promise<string> {
  const token = randomId(24);
  await harness.db
    .prepare("INSERT INTO bootstrap_credentials (credential_hash, created_at) VALUES (?1, ?2)")
    .bind(await sha256HexText(token), new Date().toISOString())
    .run();
  return token;
}

async function createVault(harness: WorkerHarness): Promise<{ admin: DeviceCtx; vmk: Uint8Array }> {
  const token = await seedBootstrapToken(harness);
  const vmk = randomKey();
  const wrapped = await vaultKeyWrap(vmk, "integration pass phrase", randomKey());
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
  expect(body.deviceToken.startsWith("vbd_")).toBe(true);
  return { admin: { vaultId: body.vaultId, deviceId: body.deviceId, token: body.deviceToken }, vmk };
}

async function pairSecondDevice(harness: WorkerHarness, admin: DeviceCtx): Promise<DeviceCtx> {
  const inviteRes = await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, {
    token: admin.token,
    body: { ttlSeconds: 600 },
  });
  expect(inviteRes.status).toBe(201);
  const invite = inviteRes.body as InviteCreatedResponse;
  const proof = await sha256HexText(`${invite.pairingCode}:${invite.inviteId}`);
  const joinRes = await harness.call("POST", "/v1/pair/complete", {
    body: { inviteId: invite.inviteId, inviteProof: proof },
  });
  expect(joinRes.status).toBe(201);
  const pair = joinRes.body as PairCompleteResponse;
  expect(pair.vaultId).toBe(admin.vaultId);
  return { vaultId: pair.vaultId, deviceId: pair.deviceId, token: pair.deviceToken };
}

function harnessSender(harness: WorkerHarness): HttpSender {
  return async (method, path, init) => {
    const res = await harness.call(method, `/v1${path}`, {
      token: init.token,
      body: init.json,
      rawBody: init.rawBody,
      query: init.query,
      headers: { "x-vb-protocol": String(init.protocolVersion ?? 1) },
    });
    return { status: res.status, body: res.body };
  };
}

async function makeDevice(
  harness: WorkerHarness,
  ctx: DeviceCtx,
  vmk: Uint8Array,
  vault: FakeVault,
  maxChangesPage?: number,
): Promise<{ engine: SyncEngine; journal: SyncJournal }> {
  const journal = new SyncJournal(new MemoryPersistence());
  const keyMaterial = {
    contentKey: await deriveContentKey(vmk, 1),
    manifestKey: await deriveManifestKey(vmk, 1),
    keyEpoch: 1,
  };
  const engine = createSyncEngine({
    vault,
    transport: new HttpSyncTransport({
      vaultId: ctx.vaultId,
      token: ctx.token,
      maxChangesPage,
      sender: harnessSender(harness),
    }),
    journal,
    vaultId: ctx.vaultId,
    deviceId: ctx.deviceId,
    keyMaterial,
  });
  return { engine, journal };
}

async function headMeta(
  harness: WorkerHarness,
  vaultId: string,
  token: string,
  fileId: string,
): Promise<{ headRevisionId: string; isDeleted: boolean }> {
  const res = await harness.call("GET", `/v1/vaults/${vaultId}/files/${fileId}/head`, { token });
  expect(res.status).toBe(200);
  return res.body as { headRevisionId: string; isDeleted: boolean };
}

async function headPlaintextFromApi(
  harness: WorkerHarness,
  vaultId: string,
  token: string,
  fileId: string,
  vmk: Uint8Array,
): Promise<string> {
  const head = await headMeta(harness, vaultId, token, fileId);
  const revRes = await harness.call("GET", `/v1/vaults/${vaultId}/revisions/${head.headRevisionId}`, { token });
  expect(revRes.status).toBe(200);
  const revision = (revRes.body as { revision: { blobObjectId: string | null } }).revision;
  const objRes = await harness.call("GET", `/v1/vaults/${vaultId}/objects/${revision.blobObjectId}`, { token });
  expect(objRes.status).toBe(200);
  const cipher = fromBase64((objRes.body as { contentB64: string }).contentB64);
  const plain = await contentEnvelopeDecrypt({
    payload: cipher,
    key: await deriveContentKey(vmk, 1),
    identity: { vaultId, fileId, revisionId: head.headRevisionId, keyEpoch: 1 },
  });
  return dec.decode(plain);
}

async function usageOf(
  harness: WorkerHarness,
  vaultId: string,
  token: string,
): Promise<{ revisionCount: number; storageEstimateBytes: number }> {
  const res = await harness.call("GET", `/v1/vaults/${vaultId}/usage`, { token });
  expect(res.status).toBe(200);
  return res.body as { revisionCount: number; storageEstimateBytes: number };
}

describe("two-device integration over the real worker (WP-06)", () => {
  it("T04: converges through a paged change feed, both directions", async () => {
    const harness = createWorkerHarness();
    const { admin, vmk } = await createVault(harness);
    const guest = await pairSecondDevice(harness, admin);

    const vaultA = new FakeVault();
    for (let i = 1; i <= 6; i++) {
      await vaultA.writeFile(`notes/n${i}.md`, enc.encode(`note ${i}: alpha`));
    }
    const devA = await makeDevice(harness, admin, vmk, vaultA);
    const rA1 = await devA.engine.runCycle();
    expect(rA1.pushes).toBe(6);
    expect(rA1.dataObjectPuts).toBe(6);
    expect(rA1.errors).toEqual([]);

    // Transport-side page clamp of 2 forces real pagination over /changes.
    const vaultB = new FakeVault();
    const devB = await makeDevice(harness, guest, vmk, vaultB, 2);

    const rB1 = await devB.engine.runCycle();
    expect(rB1.pulls).toBe(6);
    expect(rB1.conflicts).toBe(0);
    expect(rB1.dataObjectPuts).toBe(0); // pulls never stage content
    expect(rB1.errors).toEqual([]);
    expect(rB1.cursor).toBe(6);
    for (let i = 1; i <= 6; i++) {
      expect(dec.decode(await vaultA.readFile(`notes/n${i}.md`))).toBe(`note ${i}: alpha`);
      expect(dec.decode(await vaultB.readFile(`notes/n${i}.md`))).toBe(`note ${i}: alpha`);
    }

    await vaultB.writeFile("notes/b-side.md", enc.encode("from B"));
    const rB2 = await devB.engine.runCycle();
    expect(rB2.pushes).toBe(1);
    expect(rB2.conflicts).toBe(0);

    const rA2 = await devA.engine.runCycle();
    expect(rA2.pulls).toBe(1);
    expect(dec.decode(await vaultA.readFile("notes/b-side.md"))).toBe("from B");

    const usage = await usageOf(harness, admin.vaultId, admin.token);
    expect(usage.revisionCount).toBe(7);
    expect(usage.storageEstimateBytes).toBeGreaterThan(0);
    expect(devA.engine.unresolvedConflicts()).toHaveLength(0);
    expect(devA.engine.status()).toBe("READY");
    expect(devB.engine.status()).toBe("READY");
  });

  it("T05: the later edit replaces the note on the other device", async () => {
    const harness = createWorkerHarness();
    const { admin, vmk } = await createVault(harness);
    const guest = await pairSecondDevice(harness, admin);

    const vaultA = new FakeVault();
    await vaultA.writeFile("data/draft.bin", enc.encode("AAA-base"));
    const devA = await makeDevice(harness, admin, vmk, vaultA);
    await devA.engine.runCycle(); // r1

    const vaultB = new FakeVault();
    const devB = await makeDevice(harness, guest, vmk, vaultB);
    await devB.engine.runCycle(); // pulls r1
    expect(dec.decode(await vaultB.readFile("data/draft.bin"))).toBe("AAA-base");

    // Both sides edit independently while unread; push admin first (wins CAS).
    await vaultB.writeFile("data/draft.bin", enc.encode("BBB-guest"));
    await vaultA.writeFile("data/draft.bin", enc.encode("CCC-admin"));
    await devA.engine.runCycle(); // r2 onto r1

    const rB2 = await devB.engine.runCycle();
    expect(rB2.pushes).toBe(0);
    expect(rB2.conflicts).toBe(0);
    expect(devB.engine.status()).toBe("READY");
    expect(devB.engine.unresolvedConflicts()).toHaveLength(0);
    expect(dec.decode(await vaultB.readFile("data/draft.bin"))).toBe("CCC-admin");
    expect([...vaultB.files.keys()].some((p) => p.includes(".vb-conflict-"))).toBe(false);

    const fileId = devB.journal.fileStates.find((f) => f.localPath === "data/draft.bin")!.fileId;
    const headBefore = await headMeta(harness, admin.vaultId, admin.token, fileId);
    expect(headBefore.isDeleted).toBe(false);
    expect(await headPlaintextFromApi(harness, admin.vaultId, admin.token, fileId, vmk)).toBe("CCC-admin");

    const rA3 = await devA.engine.runCycle();
    expect(rA3.conflicts).toBe(0);
    expect(dec.decode(await vaultA.readFile("data/draft.bin"))).toBe("CCC-admin");

    const usage = await usageOf(harness, admin.vaultId, admin.token);
    expect(usage.revisionCount).toBe(2);
  });

  it("T06: tombstones propagate, recreation re-CASes onto the tombstone, edit-vs-delete resolves remote", async () => {
    const harness = createWorkerHarness();
    const { admin, vmk } = await createVault(harness);
    const guest = await pairSecondDevice(harness, admin);

    const vaultA = new FakeVault();
    await vaultA.writeFile("notes/temp.md", enc.encode("tomb me"));
    const devA = await makeDevice(harness, admin, vmk, vaultA);
    await devA.engine.runCycle(); // r1

    const vaultB = new FakeVault();
    const devB = await makeDevice(harness, guest, vmk, vaultB);
    const rB1 = await devB.engine.runCycle();
    expect(rB1.pulls).toBe(1);
    expect(await vaultB.exists("notes/temp.md")).toBe(true);

    // Admin deletes → tombstone, never a content PUT.
    await vaultA.deleteFile("notes/temp.md");
    const rDel = await devA.engine.runCycle();
    expect(rDel.pushes).toBe(1);
    expect(rDel.dataObjectPuts).toBe(0);

    const rApply = await devB.engine.runCycle();
    expect(rApply.conflicts).toBe(0);
    expect(await vaultB.exists("notes/temp.md")).toBe(false);
    const fileId = devB.journal.fileStates.find((f) => f.localPath === "notes/temp.md")!.fileId;
    expect(devB.journal.getFile(fileId)!.deletedLocally).toBe(true);
    expect((await headMeta(harness, admin.vaultId, admin.token, fileId)).isDeleted).toBe(true);

    // Guest recreates content locally: upsert CASes straight onto the tombstone head.
    await vaultB.writeFile("notes/temp.md", enc.encode("guest revival"));
    const rRev = await devB.engine.runCycle();
    expect(rRev.pushes).toBe(1);
    expect(rRev.conflicts).toBe(0);
    expect(devB.engine.status()).toBe("READY");
    expect((await headMeta(harness, admin.vaultId, admin.token, fileId)).isDeleted).toBe(false);

    await devA.engine.runCycle();
    expect(dec.decode(await vaultA.readFile("notes/temp.md"))).toBe("guest revival");

    // Divergence round 2: guest edits while admin deletes.
    await vaultB.writeFile("notes/temp.md", enc.encode("guest divergence"));
    await vaultA.deleteFile("notes/temp.md");
    await devA.engine.runCycle(); // tombstone r4

    const rDiv = await devB.engine.runCycle();
    expect(rDiv.pushes).toBe(0);
    expect(devB.engine.unresolvedConflicts()[0]?.origin).toBe("edit_vs_delete");
    expect(dec.decode(await vaultB.readFile("notes/temp.md"))).toBe("guest divergence");
    expect((await headMeta(harness, admin.vaultId, admin.token, fileId)).isDeleted).toBe(true);

    await devB.engine.resolveConflict(fileId, "remote");
    expect(devB.engine.unresolvedConflicts()).toHaveLength(0);
    expect(await vaultB.exists("notes/temp.md")).toBe(false);
    expect(devB.journal.getFile(fileId)!.deletedLocally).toBe(true);
    expect(devB.journal.getFile(fileId)!.pendingOperationId).toBeUndefined();

    const rAfter = await devB.engine.runCycle();
    expect(rAfter.pushes).toBe(0);
    expect(rAfter.dataObjectPuts).toBe(0);

    const usage = await usageOf(harness, admin.vaultId, admin.token);
    expect(usage.revisionCount).toBe(4); // r1 + tomb + revival + tomb
  });
});
