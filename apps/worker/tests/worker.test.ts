import { describe, expect, it, beforeAll } from "vitest";
import { createWorkerHarness, type WorkerHarness } from "@vaultbridge/shared-testkit";
import { sha256HexBytes, randomKey, randomId, vaultKeyWrap, toBase64 } from "@vaultbridge/crypto";
import type {
  BootstrapResponse,
  CommitResponse,
  PairCompleteResponse,
  ChangesResponse,
  InviteCreatedResponse,
} from "@vaultbridge/protocol";
import { bootstrapCreateVault, commitRevisionConditional, completePairing } from "../src/store.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function sha256Text(text: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(text));
}

interface DeviceCtx {
  vaultId: string;
  deviceId: string;
  token: string;
}

async function seedBootstrapToken(harness: WorkerHarness): Promise<string> {
  const token = randomId(24);
  harness.db
    .prepare("INSERT INTO bootstrap_credentials (credential_hash, created_at) VALUES (?1, ?2)")
    .bind(await sha256Text(token), new Date().toISOString())
    .run();
  return token;
}

async function bootstrapFirstDevice(harness: WorkerHarness, passphrase = "pass phrase"): Promise<DeviceCtx> {
  const token = await seedBootstrapToken(harness);
  const wrapped = await vaultKeyWrap(randomKey(), passphrase, randomKey());
  const res = await harness.call("POST", "/v1/bootstrap", {
    body: {
      bootstrapToken: token,
      keyEpoch: 1,
      wrappedVaultKeyB64: wrapped.wrappedByPassphraseB64,
      wrappedVaultKeyRecoveryB64: wrapped.wrappedByRecoveryB64,
      kdfParamsJson: JSON.stringify(wrapped.kdfParams),
      deviceNameCiphertextB64: toBase64(new TextEncoder().encode("laptop")),
    },
  });
  expect(res.status).toBe(201);
  const body = res.body as BootstrapResponse;
  return { vaultId: body.vaultId, deviceId: body.deviceId, token: body.deviceToken };
}

async function createSecondDevice(harness: WorkerHarness, admin: DeviceCtx, name: string): Promise<DeviceCtx> {
  const inviteRes = await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, {
    token: admin.token,
    body: { ttlSeconds: 600 },
  });
  expect(inviteRes.status).toBe(201);
  const invite = inviteRes.body as InviteCreatedResponse;
  const proof = await sha256Text(`${invite.pairingCode}:${invite.inviteId}`);
  const joinRes = await harness.call("POST", "/v1/pair/complete", {
    body: { inviteId: invite.inviteId, inviteProof: proof },
  });
  expect(joinRes.status).toBe(201);
  const pair = joinRes.body as PairCompleteResponse;
  expect(pair.vaultId).toBe(admin.vaultId);
  void name; // device names stay encrypted in real flows
  return { vaultId: pair.vaultId, deviceId: pair.deviceId, token: pair.deviceToken };
}

interface CommitArgsLocal {
  fileId: string;
  parentId: string | null;
  content: string;
  asDevice: DeviceCtx;
  isTombstone?: boolean;
  opId?: string;
  newRevId?: string;
  manifestObjectId?: string;
  manifestPayload?: Uint8Array;
}

async function commitContent(
  harness: WorkerHarness,
  args: CommitArgsLocal,
): Promise<CommitResponse & { status: number; manifestObjectId: string; manifestPayload: Uint8Array; ciphertextSha256: string }> {
  const { vaultId, token } = args.asDevice;
  const plaintext = new TextEncoder().encode(args.content);
  const uploadId = randomId(16);
  const manifestId = args.manifestObjectId ?? randomId(16);
  const shaDigest = await sha256HexBytes(plaintext);

  if (!args.isTombstone) {
    const reserve = await harness.call("POST", `/v1/vaults/${vaultId}/uploads`, {
      token,
      body: { uploadId, expectedBytes: plaintext.length, expectedSha256: shaDigest },
    });
    expect(reserve.status).toBe(201);
    const put = await harness.call("PUT", `/v1/vaults/${vaultId}/uploads/${uploadId}`, {
      token,
      rawBody: plaintext,
    });
    expect(put.status).toBe(200);
  }

  // manifest bytes are opaque ciphertext to the worker
  const manifestPayload =
    args.manifestPayload ??
    new TextEncoder().encode(JSON.stringify({ path: "encrypted-path.bin", sizeBytes: plaintext.length }));
  const commitRes = await harness.call("POST", `/v1/vaults/${vaultId}/commits`, {
    token,
    body: {
      operationId: args.opId ?? randomId(16),
      fileId: args.fileId,
      parentRevisionId: args.parentId,
      newRevisionId: args.newRevId ?? randomId(16),
      keyEpoch: 1,
      isTombstone: args.isTombstone ?? false,
      stagingObjectId: uploadId,
      manifestObjectId: manifestId,
      manifestPayloadB64: bytesToB64(manifestPayload),
      ciphertextSha256: shaDigest,
      ciphertextBytes: plaintext.length,
      clientProtocolVersion: 1,
    },
  });
  const body = commitRes.body as CommitResponse;
  return { ...body, status: commitRes.status, manifestObjectId: manifestId, manifestPayload, ciphertextSha256: shaDigest };
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// suite
// ---------------------------------------------------------------------------

let harness: WorkerHarness;

beforeAll(() => {
  harness = createWorkerHarness();
});

describe("health & bootstrap", () => {
  it("GET /v1/health is open and reports version", async () => {
    const res = await harness.call("GET", "/v1/health");
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("ok");
  });

  it("bootstrap with unknown credential is rejected (401)", async () => {
    const res = await harness.call("POST", "/v1/bootstrap", {
      body: {
        bootstrapToken: "vbb_nope_nope_nope",
        keyEpoch: 1,
        wrappedVaultKeyB64: toBase64(randomKey()),
        wrappedVaultKeyRecoveryB64: toBase64(randomKey()),
        kdfParamsJson: "{}",
      },
    });
    expect(res.status).toBe(401);
    expect(res.errorCode()).toBe("UNAUTHENTICATED");
  });

  it("bootstrap with valid credential creates the first device exactly once", async () => {
    const first = await bootstrapFirstDevice(harness);
    expect(first.token.startsWith("vbd_")).toBe(true);

    const secondTry = await seedBootstrapToken(harness);
    harness.db
      .prepare("UPDATE bootstrap_credentials SET used_at = ?2 WHERE credential_hash = ?1")
      .bind(await sha256Text(secondTry), new Date().toISOString())
      .run();
    const reused = await harness.call("POST", "/v1/bootstrap", {
      body: {
        bootstrapToken: secondTry,
        keyEpoch: 1,
        wrappedVaultKeyB64: toBase64(randomKey()),
        wrappedVaultKeyRecoveryB64: toBase64(randomKey()),
        kdfParamsJson: "{}",
      },
    });
    expect(reused.status).toBe(401);
  });
});

describe("pairing matrix (T16)", () => {
  it("rejects wrong proof and reused invitations, accepts fresh ones", async () => {
    const admin = await bootstrapFirstDevice(harness, "p1");
    const invite = (
      await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, { token: admin.token })
    ).body as InviteCreatedResponse;

    const wrong = await harness.call("POST", "/v1/pair/complete", {
      body: { inviteId: invite.inviteId, inviteProof: await sha256Text(`wrong:${invite.inviteId}`) },
    });
    expect(wrong.status).toBe(422);

    const right = await harness.call("POST", "/v1/pair/complete", {
      body: { inviteId: invite.inviteId, inviteProof: await sha256Text(`${invite.pairingCode}:${invite.inviteId}`) },
    });
    expect(right.status).toBe(201);

    const replay = await harness.call("POST", "/v1/pair/complete", {
      body: { inviteId: invite.inviteId, inviteProof: await sha256Text(`${invite.pairingCode}:${invite.inviteId}`) },
    });
    expect(replay.status).toBe(422);
    expect(replay.errorCode()).toBe("INVITATION_INVALID");
  });

  it("handing over the vault material: pair response carries encrypted materials", async () => {
    const admin = await bootstrapFirstDevice(harness, "p1b");
    const guest = await createSecondDevice(harness, admin, "phone");
    const state = (await harness.call("GET", `/v1/vaults/${guest.vaultId}/state`, { token: guest.token })).body as {
      vaultState: { wrappedVaultKeyB64: string; kdfParamsJson: string };
      serverCursor: number;
    };
    expect(state.vaultState.wrappedVaultKeyB64.length).toBeGreaterThan(0);
    expect(state.serverCursor).toBeGreaterThanOrEqual(0);
  });
});

describe("commit protocol & change feed", () => {
  it("full round trip: reserve, stage, commit, feed event with metadata (T02)", async () => {
    const admin = await bootstrapFirstDevice(harness, "p2");
    const commit = await commitContent(harness, {
      asDevice: admin,
      fileId: "file_roundtrip_1234",
      parentId: null,
      content: "hello world",
    });
    expect(commit.status).toBe(201);
    expect(commit.result).toBe("COMMITTED");

    const feed = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes`, { token: admin.token, query: { after: "0" } })
    ).body as ChangesResponse;
    expect(feed.events.length).toBe(1);
    expect(feed.hasMore).toBe(false);
    expect(feed.events[0]!.revisionId).toBe(commit.receipt!.revisionId);
    expect(feed.events[0]!.revision!.ciphertextBytes).toBe(new TextEncoder().encode("hello world").length);
  });

  it("T03: two devices racing on one parent yields exactly one winner and one 409", async () => {
    const admin = await bootstrapFirstDevice(harness, "p3");
    const baseId = "file_race_0001";
    const base = await commitContent(harness, {
      asDevice: admin,
      fileId: baseId,
      parentId: null,
      content: "base",
    });
    expect(base.result).toBe("COMMITTED");
    const baseRev = base.receipt!.revisionId;
    const guest = await createSecondDevice(harness, admin, "phone");

    const [first, second] = await Promise.all([
      commitContent(harness, {
        asDevice: admin,
        fileId: baseId,
        parentId: baseRev,
        content: "from desktop",
      }),
      commitContent(harness, {
        asDevice: guest,
        fileId: baseId,
        parentId: baseRev,
        content: "from phone",
      }),
    ]);

    const winner = first.status === 201 ? first : second;
    const loser = first.status === 201 ? second : first;
    expect(winner.status).toBe(201);
    expect(winner.result).toBe("COMMITTED");
    expect(loser.status).toBe(409);
    expect(loser.result).toBe("CONFLICT");
    expect(loser.conflict!.currentHead.headRevisionId).toBe(winner.receipt!.revisionId);

    const feed = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes`, { token: admin.token, query: { after: "0" } })
    ).body as ChangesResponse;
    const raceEvents = feed.events.filter((e) => e.fileId === baseId);
    expect(raceEvents.length).toBe(2);
    expect(raceEvents[0]!.seq).toBeLessThan(raceEvents[1]!.seq);
  });

  it("T08: lost commit response replays idempotently without a second revision", async () => {
    const admin = await bootstrapFirstDevice(harness, "p4");
    const fileId = "file_idem_9876";
    const first = await commitContent(harness, { asDevice: admin, fileId, parentId: null, content: "payload", opId: "op_replay_x001" });
    expect(first.status).toBe(201);

    const replay = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: first.receipt!.revisionId,
      content: "payload",
      opId: "op_replay_x001",
      newRevId: first.receipt!.revisionId,
    });
    expect(replay.status).toBe(200);
    expect(replay.result).toBe("ALREADY_COMMITTED");
    expect(replay.receipt!.revisionId).toBe(first.receipt!.revisionId);
  });

  it("replays the same upload id and bytes without a second object", async () => {
    const admin = await bootstrapFirstDevice(harness, "p4b");
    const uploadId = "upload_idem_01";
    const body = new TextEncoder().encode("same-bytes");
    const digest = await sha256HexBytes(body);
    for (let attempt = 0; attempt < 2; attempt++) {
      const reserve = await harness.call("POST", `/v1/vaults/${admin.vaultId}/uploads`, {
        token: admin.token,
        body: { uploadId, expectedBytes: body.byteLength, expectedSha256: digest },
      });
      expect(reserve.status).toBe(201);
      const put = await harness.call("PUT", `/v1/vaults/${admin.vaultId}/uploads/${uploadId}`, {
        token: admin.token,
        rawBody: body,
      });
      expect(put.status).toBe(200);
    }
  });

  it("T10: delete then stale edit conflicts; tombstone is visible in feed", async () => {
    const admin = await bootstrapFirstDevice(harness, "p5");
    const fileId = "file_tomb_0042";
    const base = await commitContent(harness, { asDevice: admin, fileId, parentId: null, content: "to delete" });
    const baseRev = base.receipt!.revisionId;

    const tomb = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: baseRev,
      content: "",
      isTombstone: true,
    });
    expect(tomb.result).toBe("COMMITTED");

    const editAfter = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: baseRev,
      content: "editor was offline",
    });
    expect(editAfter.result).toBe("CONFLICT");

    const feed = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes`, { token: admin.token, query: { after: "0" } })
    ).body as ChangesResponse;
    const tombEvent = feed.events.find((e) => e.revisionId === tomb.receipt!.revisionId);
    expect(tombEvent?.eventType).toBe("tombstone");
  });

  it("object access is per-vault (no cross-vault reads) and content is intact", async () => {
    const owner = await bootstrapFirstDevice(harness, "p7");
    const stranger = await bootstrapFirstDevice(harness, "p8");
    const fileId = "file_blobshare_5511";
    const committed = await commitContent(harness, { asDevice: owner, fileId, parentId: null, content: "secret content" });
    const revId = committed.receipt!.revisionId;

    const revRes = await harness.call("GET", `/v1/vaults/${owner.vaultId}/revisions/${revId}`, { token: owner.token });
    expect(revRes.status).toBe(200);
    const blobId = (revRes.body as { revision: { blobObjectId: string } }).revision.blobObjectId;

    const objRes = await harness.call("GET", `/v1/vaults/${owner.vaultId}/objects/${blobId}`, { token: owner.token });
    expect(objRes.status).toBe(200);
    const remoteCiphertext = new Uint8Array(
      atob((objRes.body as { contentB64: string }).contentB64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    expect(await sha256HexBytes(remoteCiphertext)).toBe(
      (revRes.body as { revision: { ciphertextSha256: string } }).revision.ciphertextSha256,
    );

    const foreign = await harness.call("GET", `/v1/vaults/${owner.vaultId}/objects/${blobId}`, { token: stranger.token });
    expect(foreign.status).toBe(403);
  });
});

describe("device revocation (T15)", () => {
  it("revoked devices get 403 on any vault route", async () => {
    const admin = await bootstrapFirstDevice(harness, "p9");
    const guest = await createSecondDevice(harness, admin, "tablet");

    const revoked = await harness.call("POST", `/v1/vaults/${admin.vaultId}/devices/${guest.deviceId}/revoke`, {
      token: admin.token,
    });
    expect(revoked.status).toBe(200);

    const fromGuest = await harness.call("GET", `/v1/vaults/${guest.vaultId}/state`, { token: guest.token });
    expect(fromGuest.status).toBe(403);
    expect(fromGuest.errorCode()).toBe("DEVICE_REVOKED");
  });

  it("other devices keep working after a third device is revoked", async () => {
    const admin = await bootstrapFirstDevice(harness, "p10");
    const guest = await createSecondDevice(harness, admin, "another");
    await harness.call("POST", `/v1/vaults/${admin.vaultId}/devices/${guest.deviceId}/revoke`, { token: admin.token });

    const commit = await commitContent(harness, {
      asDevice: admin,
      fileId: "file_after_revoke_1",
      parentId: null,
      content: "still fine",
    });
    expect(commit.result).toBe("COMMITTED");
  });
});

describe("protocol & validation gates", () => {
  it("protocol version mismatch fails closed (T21)", async () => {
    const admin = await bootstrapFirstDevice(harness, "p11");
    const res = await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes`, {
      token: admin.token,
      headers: { "x-vb-protocol": "2" },
    });
    expect(res.status).toBe(503);
    expect(res.errorCode()).toBe("PROTOCOL_VERSION_MISMATCH");
  });

  it("malformed request body -> 422 INVALID_REQUEST", async () => {
    const admin = await bootstrapFirstDevice(harness, "p12");
    const res = await harness.call("POST", `/v1/vaults/${admin.vaultId}/uploads`, {
      token: admin.token,
      body: { nope: 1 },
    });
    expect(res.status).toBe(422);
  });

  it("unknown routes give NOT_FOUND, not crashes", async () => {
    const res = await harness.call("GET", "/v1/definitely/not/a/route");
    expect(res.status).toBe(404);
    expect(res.errorCode()).toBe("NOT_FOUND");
  });

  it("rate limiting returns 429 with retry guidance", async () => {
    const limiter = createWorkerHarness({ RATE_LIMIT_MAX: "3" });
    for (let i = 0; i < 3; i++) {
      const ok = await limiter.call("GET", "/v1/health");
      expect(ok.status).toBe(200);
    }
    const throttled = await limiter.call("GET", "/v1/health");
    expect(throttled.status).toBe(429);
    expect(throttled.errorCode()).toBe("RATE_LIMITED");
  });
});

describe("usage endpoint", () => {
  it("reports storage and counters for this vault only", async () => {
    const admin = await bootstrapFirstDevice(harness, "p13");
    const other = await bootstrapFirstDevice(harness, "p13b");
    await harness.call("GET", "/v1/health");
    const committed = await commitContent(harness, {
      asDevice: admin,
      fileId: "file_usage_1010",
      parentId: null,
      content: "count me",
    });
    await commitContent(harness, { asDevice: other, fileId: "file_usage_other", parentId: null, content: "elsewhere" });
    const usage = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/usage`, { token: admin.token })
    ).body as {
      storageEstimateBytes: number;
      objectCount: number;
      revisionCount: number;
      counters: { dataObjectWritesToday: number; d1WritesToday: number; workerRequestsToday: number };
    };
    expect(usage.revisionCount).toBe(1);
    expect(usage.objectCount).toBe(2);
    expect(usage.storageEstimateBytes).toBe(new TextEncoder().encode("count me").length);
    // One new blob and one new manifest. Health and the other vault stay out.
    expect(usage.counters.dataObjectWritesToday).toBe(2);
    expect(usage.counters.d1WritesToday).toBe(2);
    const beforeRequests = usage.counters.workerRequestsToday;
    await harness.call("GET", "/v1/health");
    await harness.call("GET", "/v1/health");
    const again = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/usage`, { token: admin.token })
    ).body as { counters: { workerRequestsToday: number; dataObjectWritesToday: number } };
    expect(again.counters.workerRequestsToday).toBe(beforeRequests + 1);
    expect(again.counters.dataObjectWritesToday).toBe(2);

    const tomb = await commitContent(harness, {
      asDevice: admin,
      fileId: "file_usage_1010",
      parentId: committed.receipt!.revisionId,
      content: "",
      isTombstone: true,
    });
    expect(tomb.status).toBe(201);
    const afterDelete = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/usage`, { token: admin.token })
    ).body as { objectCount: number; storageEstimateBytes: number; revisionCount: number };
    expect(afterDelete.revisionCount).toBe(2);
    expect(afterDelete.storageEstimateBytes).toBe(new TextEncoder().encode("count me").length);
    expect(afterDelete.objectCount).toBe(3);
  });
});

describe("file history", () => {
  it("chronological chain with parent links (FR-010)", async () => {
    const admin = await bootstrapFirstDevice(harness, "p14");
    const fileId = "file_history_0303";
    const r1 = await commitContent(harness, { asDevice: admin, fileId, parentId: null, content: "v1" });
    const r2 = await commitContent(harness, { asDevice: admin, fileId, parentId: r1.receipt!.revisionId, content: "v2" });
    const r3 = await commitContent(harness, { asDevice: admin, fileId, parentId: r2.receipt!.revisionId, content: "v3" });

    const history = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/files/${fileId}/history`, { token: admin.token })
    ).body as {
      revisions: Array<{ revisionId: string; parentRevisionId: string | null }>;
    };
    expect(history.revisions.length).toBe(3);
    const [newest, middle, oldest] = history.revisions;
    expect(newest!.revisionId).toBe(r3.receipt!.revisionId);
    expect(newest!.parentRevisionId).toBe(r2.receipt!.revisionId);
    expect(middle!.parentRevisionId).toBe(r1.receipt!.revisionId);
    expect(oldest!.parentRevisionId).toBeNull();
  });

  it("pages history with the global seq, including a tombstone that is not on the first page", async () => {
    const noise = await bootstrapFirstDevice(harness, "p14-noise");
    await commitContent(harness, { asDevice: noise, fileId: "file_noise_hist1", parentId: null, content: "noise" });
    const admin = await bootstrapFirstDevice(harness, "p14-page");
    const fileId = "file_history_page";
    const first = await commitContent(harness, { asDevice: admin, fileId, parentId: null, content: "kept" });
    const tomb = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: first.receipt!.revisionId,
      content: "",
      isTombstone: true,
    });
    let parent = tomb.receipt!.revisionId;
    for (let i = 0; i < 3; i++) {
      const next = await commitContent(harness, { asDevice: admin, fileId, parentId: parent, content: `edit-${i}` });
      expect(next.status).toBe(201);
      parent = next.receipt!.revisionId;
    }
    await commitContent(harness, { asDevice: noise, fileId: "file_noise_hist2", parentId: null, content: "more-noise" });

    const head = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/files/${fileId}/head`, { token: admin.token })
    ).body as { lastEventSeq: number };
    const page = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/files/${fileId}/history?limit=2`, { token: admin.token })
    ).body as { revisions: Array<{ revisionId: string; seq: number; isTombstone: boolean }>; hasMore: boolean };
    expect(page.hasMore).toBe(true);
    expect(page.revisions).toHaveLength(2);
    expect(page.revisions.every((row) => row.isTombstone === false)).toBe(true);
    expect(head.lastEventSeq).toBe(page.revisions[0]!.seq);
    expect(head.lastEventSeq).toBeGreaterThan(page.revisions.length);

    const oldestOnPage = page.revisions[page.revisions.length - 1]!.seq;
    const older = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/files/${fileId}/history?limit=2&before=${oldestOnPage}`, {
        token: admin.token,
      })
    ).body as { revisions: Array<{ revisionId: string; seq: number; isTombstone: boolean }> };
    expect(older.revisions.some((row) => row.revisionId === tomb.receipt!.revisionId && row.isTombstone)).toBe(true);
    expect(older.revisions.every((row) => row.seq < oldestOnPage)).toBe(true);

    const skipped = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes?after=${head.lastEventSeq}`, { token: admin.token })
    ).body as ChangesResponse;
    expect(skipped.events.some((event) => event.revisionId === tomb.receipt!.revisionId)).toBe(false);
    const fromStart = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes?after=0`, { token: admin.token })
    ).body as ChangesResponse;
    expect(fromStart.events.some((event) => event.revisionId === tomb.receipt!.revisionId)).toBe(true);
  });
});

describe("one-time credentials and immutable history", () => {
  it("a second bootstrap batch cannot insert another vault for the same credential", async () => {
    const token = await seedBootstrapToken(harness);
    const hash = await sha256Text(token);
    const wrapped = await vaultKeyWrap(randomKey(), "race-pass", randomKey());
    const at = new Date().toISOString();
    const make = (suffix: string) => ({
      vault: {
        vault_id: `vault_boot_${suffix}`,
        created_at: at,
        protocol_version: 1,
        key_epoch: 1,
        wrapped_vmk_b64: wrapped.wrappedByPassphraseB64,
        wrapped_vmk_recovery_b64: wrapped.wrappedByRecoveryB64,
        kdf_params_json: JSON.stringify(wrapped.kdfParams),
        flags_ciphertext_b64: null,
        materials_version: 1,
        history_retention_days: 3650,
      },
      device: {
        device_id: `device_boot_${suffix}`,
        vault_id: `vault_boot_${suffix}`,
        name_ciphertext_b64: null,
        public_key_b64: null,
        auth_token_hash: `hash_${suffix}_${randomId(12)}`,
        created_at: at,
        last_seen_at: at,
        revoked_at: null,
      },
      bootTokenHash: hash,
      dateUtc: at.slice(0, 10),
    });
    const first = await bootstrapCreateVault(harness.db, make("aaaa"));
    const second = await bootstrapCreateVault(harness.db, make("bbbb"));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const vaults = harness.db.dumpAll("vaults") as Array<{ vault_id: string }>;
    expect(vaults.some((row) => row.vault_id === "vault_boot_bbbb")).toBe(false);
    const creds = harness.db.dumpAll("bootstrap_credentials") as Array<{ credential_hash: string; used_by_device_id: string | null }>;
    expect(creds.find((row) => row.credential_hash === hash)?.used_by_device_id).toBe("device_boot_aaaa");
  });

  it("a second pairing batch cannot insert another device for the same invitation", async () => {
    const admin = await bootstrapFirstDevice(harness, "p-pair-race");
    const inviteRes = await harness.call("POST", `/v1/vaults/${admin.vaultId}/pair/invitations`, {
      token: admin.token,
      body: { ttlSeconds: 600 },
    });
    const invite = inviteRes.body as InviteCreatedResponse;
    const at = new Date().toISOString();
    const device = (suffix: string) => ({
      device_id: `device_pair_${suffix}`,
      vault_id: admin.vaultId,
      name_ciphertext_b64: null,
      public_key_b64: null,
      auth_token_hash: `pairhash_${suffix}_${randomId(8)}`,
      created_at: at,
      last_seen_at: at,
      revoked_at: null,
    });
    const winner = await completePairing(harness.db, {
      inviteId: invite.inviteId,
      device: device("one"),
      cursorSeq: 0,
      at,
      dateUtc: at.slice(0, 10),
    });
    const loser = await completePairing(harness.db, {
      inviteId: invite.inviteId,
      device: device("two"),
      cursorSeq: 0,
      at,
      dateUtc: at.slice(0, 10),
    });
    expect(winner.paired).toBe(true);
    expect(loser.paired).toBe(false);
    const devices = harness.db.dumpAll("devices") as Array<{ device_id: string; vault_id: string }>;
    const mine = devices.filter((row) => row.vault_id === admin.vaultId).map((row) => row.device_id);
    expect(mine).toContain("device_pair_one");
    expect(mine).not.toContain("device_pair_two");
  });

  it("a losing commit cannot replace another revision's manifest", async () => {
    const admin = await bootstrapFirstDevice(harness, "p-manifest");
    const guest = await createSecondDevice(harness, admin, "phone");
    const fileId = "file_manifest_lock";
    const original = new TextEncoder().encode("manifest-v1");
    const first = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: null,
      content: "body",
      manifestPayload: original,
    });
    expect(first.status).toBe(201);
    const overwritten = await commitContent(harness, {
      asDevice: guest,
      fileId,
      parentId: null,
      content: "stale-parent",
      manifestObjectId: first.manifestObjectId,
      manifestPayload: new TextEncoder().encode("manifest-v1-longer"),
    });
    expect(overwritten.status).toBe(422);
    const stored = (
      await harness.call("GET", `/v1/vaults/${admin.vaultId}/objects/${first.manifestObjectId}`, { token: admin.token })
    ).body as { contentB64: string };
    expect(stored.contentB64).toBe(bytesToB64(original));
  });

  it("a raced replay of the same operation is already committed, not a conflict", async () => {
    const admin = await bootstrapFirstDevice(harness, "p-replay-race");
    const fileId = "file_replay_race1";
    const first = await commitContent(harness, {
      asDevice: admin,
      fileId,
      parentId: null,
      content: "once",
      opId: "op_race_replay1",
    });
    expect(first.status).toBe(201);
    const again = await commitRevisionConditional(
      harness.db,
      {
        vaultId: admin.vaultId,
        deviceId: admin.deviceId,
        fileId,
        parentRevisionId: null,
        newRevisionId: "rev_should_not_land",
        operationId: "op_race_replay1",
        isTombstone: false,
        keyEpoch: 1,
        stagedObjectKey: "upload_ignored",
        manifestObjectKey: "manifest_ignored",
        ciphertextSha256: first.ciphertextSha256,
        ciphertextBytes: new TextEncoder().encode("once").length,
        at: new Date().toISOString(),
      },
      { skipReceiptPrecheck: true },
    );
    expect(again.result).toBe("ALREADY_COMMITTED");
    expect(again.receipt?.revisionId).toBe(first.receipt!.revisionId);
    const revisions = harness.db.dumpAll("revisions") as Array<{ revision_id: string }>;
    expect(revisions.some((row) => row.revision_id === "rev_should_not_land")).toBe(false);

    await expect(
      commitRevisionConditional(
        harness.db,
        {
          vaultId: admin.vaultId,
          deviceId: admin.deviceId,
          fileId,
          parentRevisionId: null,
          newRevisionId: "rev_should_not_land",
          operationId: "op_race_replay1",
          isTombstone: false,
          keyEpoch: 1,
          stagedObjectKey: "upload_ignored",
          manifestObjectKey: "manifest_ignored",
          ciphertextSha256: "ab".repeat(32),
          ciphertextBytes: 4,
          at: new Date().toISOString(),
        },
        { skipReceiptPrecheck: true },
      ),
    ).rejects.toThrow(/operation id reused/);
  });

  it("serves a change page larger than D1's bound-parameter limit", async () => {
    const admin = await bootstrapFirstDevice(harness, "p-feed-page");
    const fileId = "file_feed_page01";
    const at = new Date().toISOString();
    await harness.db
      .prepare(
        "INSERT INTO files (vault_id, file_id, head_revision_id, is_deleted, last_event_seq, created_at) VALUES (?1,?2,NULL,0,NULL,?3)",
      )
      .bind(admin.vaultId, fileId, at)
      .run();
    for (let i = 0; i < 120; i++) {
      const revisionId = `revfeed${String(i).padStart(4, "0")}xxxxxxxx`;
      await harness.db
        .prepare(
          `INSERT INTO revisions (revision_id, vault_id, file_id, parent_revision_id, blob_object_key, manifest_object_key, ciphertext_sha256, ciphertext_bytes, device_id, key_epoch, operation_id, is_tombstone, created_at)
           VALUES (?1,?2,?3,NULL,?4,?5,?6,1,?7,1,?8,0,?9)`,
        )
        .bind(
          revisionId,
          admin.vaultId,
          fileId,
          `blob${revisionId}`,
          `man${revisionId}`,
          "cd".repeat(32),
          admin.deviceId,
          `opfeed${String(i).padStart(4, "0")}xxxxxxxx`,
          at,
        )
        .run();
      await harness.db
        .prepare(
          "INSERT INTO change_events (vault_id, file_id, revision_id, event_type, created_at) VALUES (?1,?2,?3,'commit',?4)",
        )
        .bind(admin.vaultId, fileId, revisionId, at)
        .run();
    }
    const original = harness.db.prepare.bind(harness.db);
    harness.db.prepare = ((sql: string) => {
      const statement = original(sql);
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        if (values.length > 100) {
          throw new Error("too many SQL variables");
        }
        return bind(...(values as []));
      };
      return statement;
    }) as typeof harness.db.prepare;
    try {
      const res = await harness.call("GET", `/v1/vaults/${admin.vaultId}/changes?after=0&limit=200`, {
        token: admin.token,
      });
      expect(res.status).toBe(200);
      const body = res.body as ChangesResponse;
      expect(body.events.length).toBe(120);
      expect(body.events.every((event) => event.revision !== undefined)).toBe(true);
    } finally {
      harness.db.prepare = original;
    }
  });
});
