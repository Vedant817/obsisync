/**
 * HTTP route table + handlers (API contract v1, spec §9.4).
 *
 * Every route is device-scoped and rate limited; unauthenticated/foreign-vault
 * access is rejected before any storage work happens (fail closed).
 */
import {
  VaultBridgeError,
  ERROR_CLASSES,
  PROTOCOL_LIMITS,
  type CommitRequest,
  type VaultBridgeErrorPayload,
  type ErrorCode,
} from "@vaultbridge/protocol";
import { z } from "zod";
import type { D1DatabaseLike, R2BucketLike } from "./ports.js";
import { authenticate, rateLimit, clientKey, DEFAULT_RATE_LIMIT, hashSha256Hex, type AuthContext } from "./auth.js";
import { ObjectService, contentObjectKey, manifestObjectKey, unavailableBucket, utcDate } from "./object-service.js";
import { TursoBucket } from "./turso-bucket.js";
import * as store from "./store.js";
import { handleLiveRoute, type LiveHooks } from "./live.js";
import { randomId } from "@vaultbridge/crypto";

export interface VaultBridgeEnv {
  DB: D1DatabaseLike;
  /**
   * Test double. Production leaves this unset and uses Turso for ciphertext.
   */
  BUCKET?: R2BucketLike;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  /** Identifies backend build; surfaced via /health only. */
  WORKER_VERSION: string;
  /** Comma-separated revoked-on-boot bootstrap blocklist (optional). */
  BOOTSTRAP_DISABLED?: string;
  /** Optional protocol version negotiation override. */
  PROTOCOL_VERSION?: string;
  RATE_LIMIT_MAX?: number;
  RATE_LIMIT_WINDOW_MS?: number;
  /** Push relay notifications (Cloudflare Durable Object). Unset on Node. */
  LIVE_HOOKS?: LiveHooks;
  /** Live editing polls several times a second, so it has its own bucket. */
  RATE_LIMIT_LIVE_MAX?: number;
  /**
   * Separates rate-limiter buckets between deployments and test harnesses;
   * the limiter is per-isolate memory keyed by `${scope}:${client}`.
   */
  RATE_SCOPE?: string;
}

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function jsonResponse(payload: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function errorResponse(err: VaultBridgeError, requestId: string): Response {
  const payload = err.toPayload();
  const body: VaultBridgeErrorPayload = { ...payload, requestId };
  return jsonResponse(body, err.status);
}

const HEALTH_ID = "health";

// ---------------------------------------------------------------------------
// Route context assembly
// ---------------------------------------------------------------------------

interface RouteContext {
  env: VaultBridgeEnv;
  request: Request;
  url: URL;
  requestId: string;
}

async function withVault(
  ctx: RouteContext,
  vaultId: string,
  fn: (auth: AuthContext, services: Services) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(ctx.env.DB, ctx.request);
  if (auth.vault.vault_id !== vaultId) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device is not a member of this vault", {
      guidance: "Use the vault this device is paired to.",
    });
  }
  if (ctx.request.headers.get("x-requested-vault") && ctx.request.headers.get("x-requested-vault") !== vaultId) {
    throw new VaultBridgeError("INVALID_REQUEST", "header/vault mismatch");
  }
  // protocol version gate (spec T21)
  const client =
    Number(ctx.request.headers.get("x-vb-protocol") ?? "1") ||
    Number((ctx.url.searchParams.get("protocol") as string | null) ?? "1");
  const serverVersion = Number(ctx.env.PROTOCOL_VERSION ?? 1);
  if (!Number.isFinite(client) || client > serverVersion) {
    throw new VaultBridgeError("PROTOCOL_VERSION_MISMATCH", `client protocol ${client} newer than server ${serverVersion}`);
  }
  const services = createServices(ctx.env);
  const res = await fn(auth, services);
  await flushMetricsBestEffort(services, auth.vault.vault_id, 1);
  return res;
}

function objectBucket(env: VaultBridgeEnv): R2BucketLike {
  if (env.BUCKET) {
    return env.BUCKET;
  }
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    return new TursoBucket(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  }
  return unavailableBucket();
}

function createServices(env: VaultBridgeEnv): Services {
  const bucket = objectBucket(env);
  return {
    db: env.DB,
    bucket,
    objects: new ObjectService(env.DB, bucket),
  };
}

interface Services {
  db: D1DatabaseLike;
  bucket: R2BucketLike;
  objects: ObjectService;
}

async function flushMetricsBestEffort(services: Services, vaultId: string, requests: number): Promise<void> {
  try {
    await store.recordMetrics(services.db, vaultId, utcDate(), { writes: 0, reads: 0, uploadBytes: 0, requests });
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleHealth(ctx: RouteContext): Promise<Response> {
  // Health is unauthenticated and has no vault. It must not touch usage counters.
  return jsonResponse(
    {
      status: "ok",
      backendVersion: ctx.env.WORKER_VERSION,
      protocolVersion: Number(ctx.env.PROTOCOL_VERSION ?? 1),
      minClientProtocolVersion: 1,
    },
    200,
  );
}

const BootstrapSchema = z.object({
  bootstrapToken: z.string().min(16).max(256),
  keyEpoch: z.number().int().min(1).readonly().default(1),
  wrappedVaultKeyB64: z.string().min(8).max(4096),
  wrappedVaultKeyRecoveryB64: z.string().min(8).max(4096),
  kdfParamsJson: z.string().min(2).max(1024),
  flagsCiphertextB64: z.string().max(1024).optional(),
  deviceNameCiphertextB64: z.string().max(1024).optional(),
});

async function handleBootstrap(ctx: RouteContext): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await ctx.request.json();
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "body must be JSON");
  }
  const dto = BootstrapSchema.parse(parsed);

  if (ctx.env.BOOTSTRAP_DISABLED === "true") {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap is disabled on this deployment");
  }
  const credentialHash = await hashSha256Hex(dto.bootstrapToken);
  if (!(await store.findUnusedBootstrapCredential(ctx.env.DB, credentialHash))) {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap credential unknown or already used", {
      guidance: "Deployment generates one credential per vault.",
    });
  }

  const vaultId = randomId(12) + randomId(12); // opaque, never a name
  const deviceId = randomId(12) + randomId(12);
  const deviceToken = `vbd_${randomId(24)}`;
  const tokenHash = await hashSha256Hex(deviceToken);
  const at = new Date().toISOString();
  const dateUtc = utcDate(at);

  const created = await store.bootstrapCreateVault(ctx.env.DB, {
    vault: {
      vault_id: vaultId,
      created_at: at,
      protocol_version: 1,
      key_epoch: dto.keyEpoch,
      wrapped_vmk_b64: dto.wrappedVaultKeyB64,
      wrapped_vmk_recovery_b64: dto.wrappedVaultKeyRecoveryB64,
      kdf_params_json: dto.kdfParamsJson,
      flags_ciphertext_b64: dto.flagsCiphertextB64 ?? null,
      materials_version: 1,
      history_retention_days: 3650,
    },
    device: {
      device_id: deviceId,
      vault_id: vaultId,
      name_ciphertext_b64: dto.deviceNameCiphertextB64 ?? null,
      public_key_b64: null,
      auth_token_hash: tokenHash,
      created_at: at,
      last_seen_at: at,
      revoked_at: null,
    },
    bootTokenHash: credentialHash,
    dateUtc,
  });
  if (!created.created) {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap credential unknown or already used", {
      guidance: "Deployment generates one credential per vault.",
    });
  }

  return jsonResponse(
    {
      vaultId,
      deviceId,
      deviceToken,
      serverProtocolVersion: 1,
    },
    201,
  );
}

const InviteSchema = z.object({ ttlSeconds: z.number().int().min(60).max(3600).optional() });

async function handleCreateInvitation(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth) => {
    let dto: z.infer<typeof InviteSchema> = { ttlSeconds: PROTOCOL_LIMITS.invitationTtlMs / 1000 };
    try {
      const body = await ctx.request.json();
      dto = InviteSchema.parse(body ?? {});
    } catch {
      /* default invite params */
    }
    const now = Date.now();
    const inviteId = randomId(12) + randomId(8);
    // verifier hash lets the invitee prove possession of the pairing code
    // without the Worker learning it; client sends proof = sha256(pairingCode+inviteId)
    const pairingCode = randomId(12).slice(0, 10);
    const verifierHash = await hashSha256Hex(`${pairingCode}:${inviteId}`);
    const expiresAt = new Date(now + (dto.ttlSeconds ?? 600) * 1000).toISOString();
    await ctx.env.DB.batch([
      store.insertInvitationStatement(ctx.env.DB, {
        invite_id: inviteId,
        vault_id: auth.vault.vault_id,
        verifier_hash: verifierHash,
        expires_at: expiresAt,
        used_at: null,
        used_by_device_id: null,
        created_at: new Date(now).toISOString(),
      }),
    ]);
    return jsonResponse({ inviteId, pairingCode, expiresAt }, 201);
  });
}

const PairCompleteSchema = z.object({
  inviteId: z.string().min(8).max(64),
  inviteProof: z.string().min(16).max(256),
  deviceNameCiphertextB64: z.string().max(1024).optional(),
});

async function handlePairComplete(ctx: RouteContext): Promise<Response> {
  let parsed: unknown;
  let dto: z.infer<typeof PairCompleteSchema>;
  try {
    parsed = await ctx.request.json();
    dto = PairCompleteSchema.parse(parsed);
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "malformed pairing body");
  }
  const invitation = await store.getInvitationRow(ctx.env.DB, dto.inviteId);
  if (!invitation) {
    throw new VaultBridgeError("INVITATION_INVALID", "unknown invitation");
  }
  if (invitation.used_at !== null) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation already used", {
      guidance: "Ask an existing device for a new invitation.",
    });
  }
  if (Date.parse(invitation.expires_at) < Date.now()) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation expired");
  }
  // proof = sha256(pairingCode + ":" + inviteId); stored verifier must equal it
  if (dto.inviteProof !== invitation.verifier_hash) {
    throw new VaultBridgeError("INVITATION_INVALID", "pairing proof rejected");
  }

  const vault = await store.getVaultRow(ctx.env.DB, invitation.vault_id);
  if (!vault) {
    throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing for invitation");
  }
  const deviceId = randomId(12) + randomId(12);
  const deviceToken = `vbd_${randomId(24)}`;
  const at = new Date().toISOString();
  const maxSeq = (await store.getVaultState(ctx.env.DB, vault.vault_id))?.maxSeq ?? 0;

  const paired = await store.completePairing(ctx.env.DB, {
    inviteId: dto.inviteId,
    cursorSeq: maxSeq,
    at,
    dateUtc: utcDate(at),
    device: {
      device_id: deviceId,
      vault_id: vault.vault_id,
      name_ciphertext_b64: dto.deviceNameCiphertextB64 ?? null,
      public_key_b64: null,
      auth_token_hash: await hashSha256Hex(deviceToken),
      created_at: at,
      last_seen_at: at,
      revoked_at: null,
    },
  });
  if (!paired.paired) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation already used", {
      guidance: "Ask an existing device for a new invitation.",
    });
  }

  return jsonResponse(
    {
      vaultId: vault.vault_id,
      deviceId,
      deviceToken,
      vaultState: vaultStateFromRow(vault),
    },
    201 as const,
  );
}

function vaultStateFromRow(vault: store.VaultRow) {
  return {
    protocolVersion: vault.protocol_version,
    keyEpoch: vault.key_epoch,
    wrappedVaultKeyB64: vault.wrapped_vmk_b64,
    wrappedVaultKeyRecoveryB64: vault.wrapped_vmk_recovery_b64,
    kdfParamsJson: vault.kdf_params_json,
    flagsCiphertextB64: vault.flags_ciphertext_b64,
    materialsVersion: vault.materials_version,
  };
}

const ReserveUploadSchema = z.object({
  uploadId: z.string().min(8).max(64),
  expectedBytes: z.number().int().min(1),
  expectedSha256: z.string().min(32).max(64),
});

async function handleReserveUpload(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    let dto: z.infer<typeof ReserveUploadSchema>;
    try {
      dto = ReserveUploadSchema.parse(await ctx.request.json());
    } catch {
      throw new VaultBridgeError("INVALID_REQUEST", "malformed reserve body");
    }
    const session = await services.objects.reserve(
      {
        vaultId: auth.vault.vault_id,
        deviceId: auth.device.device_id,
        uploadId: dto.uploadId,
        expectedBytes: dto.expectedBytes,
        expectedSha256: dto.expectedSha256,
      },
    );
    return jsonResponse(
      {
        uploadId: session.upload_id,
        stagingObjectId: session.upload_id,
        expiresAt: session.expires_at,
      },
      201,
    );
  });
}

async function handleUploadPut(ctx: RouteContext, vaultId: string, uploadId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const session = await services.objects.getSession(uploadId);
    if (!session || session.vault_id !== auth.vault.vault_id || session.device_id !== auth.device.device_id) {
      throw new VaultBridgeError("NOT_FOUND", "upload session not found for this device");
    }
    const body = new Uint8Array(await ctx.request.arrayBuffer());
    await services.objects.putObject(session, body);
    return jsonResponse({ staged: true }, 200);
  });
}

const CommitSchema = z.object({
  operationId: z.string().min(8).max(64),
  fileId: z.string().min(8).max(64),
  parentRevisionId: z.string().max(64).nullable(),
  newRevisionId: z.string().min(8).max(64),
  keyEpoch: z.number().int().min(1),
  isTombstone: z.boolean(),
  stagingObjectId: z.string().min(8).max(64),
  manifestObjectId: z.string().min(8).max(64),
  manifestPayloadB64: z.string().min(16).max(64 * 1024),
  ciphertextSha256: z.string().min(32).max(64),
  ciphertextBytes: z.number().int().min(0),
  clientProtocolVersion: z.number().int().min(1).max(1000),
});

async function handleCommit(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    let dto: CommitRequest;
    try {
      dto = CommitSchema.parse(await ctx.request.json()) as CommitRequest;
    } catch (e) {
      throw new VaultBridgeError("INVALID_REQUEST", `commit body invalid: ${(e as Error).message}`);
    }
    if (dto.keyEpoch > auth.vault.key_epoch + 1) {
      throw new VaultBridgeError("INVALID_REQUEST", "keyEpoch too advanced (rotation pending key material)");
    }
    const now = new Date().toISOString();

    // resolve upload session (blob present + verified) — tombstones may skip blob
    let session = null;
    let sessionWasCommitted = false;
    if (!dto.isTombstone) {
      session = await services.objects.getSession(dto.stagingObjectId);
      if (!session || session.vault_id !== auth.vault.vault_id) {
        // tombstones/staging mismatches: no session, no commit
        throw new VaultBridgeError("INVALID_REQUEST", "staged upload session not found for vault");
      }
      sessionWasCommitted = session.status === "committed";
      const staging = await services.bucket.head(contentObjectKey(auth.vault.vault_id, session.upload_id));
      if (!staging) {
        throw new VaultBridgeError("INVALID_REQUEST", "staged object missing (upload lost?)");
      }
      if (staging.size !== dto.ciphertextBytes) {
        throw new VaultBridgeError("INVALID_REQUEST", "staged size does not match commit payload");
      }
    }

    // manifest: ensure object exists (idempotent) — manifests are ciphertext,
    // referenced later by the short object id stored on the revision row
    const manifestPayload = base64ToBytes(dto.manifestPayloadB64);
    await services.objects.putManifestObject(
      auth.vault.vault_id,
      dto.manifestObjectId,
      manifestPayload,
    );

    const outcome = await store.commitRevisionConditional(ctx.env.DB, {
      vaultId: auth.vault.vault_id,
      deviceId: auth.device.device_id,
      fileId: dto.fileId,
      parentRevisionId: dto.parentRevisionId,
      newRevisionId: dto.newRevisionId,
      operationId: dto.operationId,
      isTombstone: dto.isTombstone,
      keyEpoch: dto.keyEpoch,
      // Object ids are stored short and qualified to full object keys on read;
      // keeps revisions tabular and lookups equality-based.
      stagedObjectKey: session ? session.upload_id : "",
      manifestObjectKey: dto.manifestObjectId,
      ciphertextSha256: dto.ciphertextSha256,
      ciphertextBytes: dto.ciphertextBytes,
      at: now,
    });

    if (outcome.result === "CONFLICT") {
      const conflictRevision =
        outcome.conflictHead?.headRevisionId != null
          ? await store.getRevisionRow(ctx.env.DB, auth.vault.vault_id, outcome.conflictHead.headRevisionId)
          : null;
      return jsonResponse(
        {
          result: "CONFLICT",
          conflict: {
            currentHead: {
              fileId: dto.fileId,
              headRevisionId: outcome.conflictHead?.headRevisionId ?? null,
              isDeleted: outcome.conflictHead?.isDeleted ?? false,
              lastEventSeq: outcome.conflictHead?.lastEventSeq ?? 0,
            },
            currentRevision: conflictRevision ? revisionRowToWireOrThrow(conflictRevision) : null,
          },
        },
        409,
      );
    }

    const receiptPayload = outcome.receipt
      ? { operationId: outcome.receipt.operationId, revisionId: outcome.receipt.revisionId, seq: outcome.seq ?? null }
      : null;
    // Only after a successful CAS does the session become 'committed' (with the
    // revision id); a conflicted commit leaves the session staging intact so
    // the device can retry against the new head.
    if (outcome.result === "COMMITTED" && session && !sessionWasCommitted) {
      await services.objects.markSessionCommitted(session.upload_id, dto.newRevisionId);
    }
    if (outcome.result === "COMMITTED") {
      try {
        await store.recordMetrics(ctx.env.DB, auth.vault.vault_id, utcDate(now), {
          writes: 0,
          reads: 0,
          uploadBytes: 0,
          requests: 0,
          d1Writes: 1,
        });
      } catch {
        /* metrics best effort */
      }
    }
    return jsonResponse(
      {
        result: outcome.result,
        receipt: receiptPayload,
        seq: outcome.seq ?? null,
      },
      outcome.result === "ALREADY_COMMITTED" ? 200 : 201,
    );
  });
}

async function handleChanges(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const afterRaw = Number(ctx.url.searchParams.get("after") ?? "0");
    const limitRaw = Number(ctx.url.searchParams.get("limit") ?? String(PROTOCOL_LIMITS.changesPageSize));
    if (!Number.isFinite(afterRaw) || afterRaw < 0) {
      throw new VaultBridgeError("INVALID_REQUEST", "after must be non-negative integer");
    }
    const limit = Math.min(
      Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : PROTOCOL_LIMITS.changesPageSize), 1),
      PROTOCOL_LIMITS.changesPageSizeMax,
    );
    const events = await store.listChanges(services.db, auth.vault.vault_id, afterRaw, limit);
    const revisions = await store.listRevisionsForEvents(
      services.db,
      auth.vault.vault_id,
      events.map((e) => e.revision_id),
    );
    const lastSeq = events.length > 0 ? events[events.length - 1]!.seq : afterRaw;
    const hasMore = events.length === limit;
    return jsonResponse(
      {
        events: events.map((event) => {
          const rev = revisions.find((r) => r.revision_id === event.revision_id);
          return {
            seq: event.seq,
            vaultId: event.vault_id,
            fileId: event.file_id,
            revisionId: event.revision_id,
            eventType: event.event_type as "commit" | "tombstone",
            createdAt: event.created_at,
            revision: rev ? revisionRowToWireOrThrow(rev) : undefined,
          };
        }),
        endCursor: lastSeq,
        hasMore,
        protocolVersion: 1,
      },
      200,
    );
  });
}

async function handleFileHead(ctx: RouteContext, vaultId: string, fileId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const row = await store.getFileRow(services.db, auth.vault.vault_id, fileId);
    if (!row) {
      throw new VaultBridgeError("NOT_FOUND", "unknown file");
    }
    void auth;
    return jsonify({
      fileId: row.file_id,
      headRevisionId: row.head_revision_id,
      isDeleted: row.is_deleted === 1,
      lastEventSeq: row.last_event_seq ?? 0,
    });
  });
}

async function handleRevision(ctx: RouteContext, vaultId: string, revisionId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const row = await store.getRevisionRow(services.db, auth.vault.vault_id, revisionId);
    if (!row) {
      throw new VaultBridgeError("NOT_FOUND", "unknown revision");
    }
    void services;
    return jsonify({ revision: revisionRowToWireOrThrow(row) });
  });
}

function revisionRowToWireOrThrow(r: store.RevisionRow) {
  return {
    revisionId: r.revision_id,
    parentRevisionId: r.parent_revision_id,
    keyEpoch: r.key_epoch,
    isTombstone: r.is_tombstone === 1,
    ciphertextSha256: r.ciphertext_sha256,
    ciphertextBytes: r.ciphertext_bytes,
    manifestObjectId: r.manifest_object_key,
    blobObjectId: r.blob_object_key,
    deviceId: r.device_id,
    createdAt: r.created_at,
  };
}

function jsonify(body: unknown): Response {
  return jsonResponse(body, 200);
}

async function handleObjectGet(ctx: RouteContext, vaultId: string, objectId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const rev = await store.findRevisionByObjectId(services.db, auth.vault.vault_id, objectId);
    if (!rev) {
      throw new VaultBridgeError("NOT_FOUND", "no known object for this vault");
    }
    // Object ids are stored short on revision rows; qualify to the full object key here.
    const isManifest = rev.manifest_object_key === objectId;
    const readKey = isManifest
      ? manifestObjectKey(auth.vault.vault_id, objectId)
      : contentObjectKey(auth.vault.vault_id, objectId);
    const bytes = await services.objects.readObject(auth.vault.vault_id, readKey);
    return jsonResponse(
      {
        objectId,
        revisionId: rev.revision_id,
        fileId: rev.file_id,
        kind: isManifest ? "manifest" : "content",
        contentB64: bytesToB64(bytes),
      },
      200,
    );
  });
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const s = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    bin += String.fromCharCode(...s);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function handleFileHistory(ctx: RouteContext, vaultId: string, fileId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const limitRaw = Number(ctx.url.searchParams.get("limit") ?? "50");
    const beforeRaw = ctx.url.searchParams.get("before");
    const limit = Math.min(Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : 50), 1), 500);
    const before = beforeRaw !== null ? Number(beforeRaw) : null;
    const rows = await store.listFileHistory(services.db, auth.vault.vault_id, fileId, limit, Number.isFinite(before) ? before : null);
    const file = await store.getFileRow(services.db, auth.vault.vault_id, fileId);
    void auth;
    void file;
    return jsonify({
      fileId,
      revisions: rows.map((row) => ({ ...revisionRowToWireOrThrow(row), seq: row.event_seq })),
      hasMore: rows.length === limit,
    });
  });
}

async function handleRevoke(ctx: RouteContext, vaultId: string, deviceId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    if (auth.device.device_id === deviceId) {
      throw new VaultBridgeError("INVALID_REQUEST", "self-revocation must be done from another device", {
        guidance: "Revoke this device from another paired device.",
      });
    }
    // NOTE: revocation disables the device credential only. Vault history,
    // contents and other devices are untouched (spec §10.3: revocation is not
    // content erasure).
    const revoked = await store.revokeDevice(services.db, auth.vault.vault_id, deviceId);
    if (!revoked) {
      throw new VaultBridgeError("NOT_FOUND", "device not found in this vault");
    }
    return jsonResponse({ revoked: deviceId }, 200);
  });
}

async function handleListDevices(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const rows = await store.listDevices(services.db, auth.vault.vault_id);
    return jsonResponse(
      {
        devices: rows.map((row) => ({
          deviceId: row.device_id,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          revokedAt: row.revoked_at,
          isCurrent: row.device_id === auth.device.device_id,
        })),
      },
      200,
    );
  });
}

async function handleUsage(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const data = await store.usage(services.db, auth.vault.vault_id, utcDate());
    return jsonify({
      storageEstimateBytes: data.storageEstimateBytes,
      objectCount: data.objectCount,
      revisionCount: data.revisionCount,
      deviceCount: data.deviceCount,
      historyRetentionDays: auth.vault.history_retention_days,
      counters: {
        dataObjectWritesToday: data.metrics?.data_object_writes ?? 0,
        dataObjectReadsToday: data.metrics?.data_object_reads ?? 0,
        uploadBytesToday: data.metrics?.upload_bytes ?? 0,
        workerRequestsToday: data.metrics?.worker_requests ?? 0,
        d1WritesToday: data.metrics?.d1_writes ?? 0,
        dateUtc: utcDate(),
      },
    });
  });
}

async function handleVaultState(ctx: RouteContext, vaultId: string): Promise<Response> {
  return withVault(ctx, vaultId, async (auth, services) => {
    const state = await store.getVaultState(services.db, auth.vault.vault_id);
    if (!state) {
      throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing");
    }
    return jsonify({ vaultState: vaultStateFromRow(state.vault), serverCursor: state.maxSeq });
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function applyRateLimit(request: Request, env: VaultBridgeEnv, requestId: string): void {
  const max = env.RATE_LIMIT_MAX ? Number(env.RATE_LIMIT_MAX) : DEFAULT_RATE_LIMIT.max;
  const windowMs = env.RATE_LIMIT_WINDOW_MS ? Number(env.RATE_LIMIT_WINDOW_MS) : DEFAULT_RATE_LIMIT.windowMs;
  // Buckets are scoped per deployment (and per test harness) so isolates never
  // share quota state with each other.
  const live = new URL(request.url).pathname.includes("/live/");
  const liveMax = env.RATE_LIMIT_LIVE_MAX ? Number(env.RATE_LIMIT_LIVE_MAX) : 2400;
  const scopedKey = `${env.RATE_SCOPE ?? "default"}:${live ? "live:" : ""}${clientKey(request)}`;
  const limit = live ? liveMax : max;
  const verdict = rateLimit(scopedKey, {
    max: Number.isFinite(limit) ? limit : DEFAULT_RATE_LIMIT.max,
    windowMs: Number.isFinite(windowMs) ? windowMs : DEFAULT_RATE_LIMIT.windowMs,
  });
  if (!verdict.allowed) {
    void requestId;
    throw new VaultBridgeError("RATE_LIMITED", "too many requests in window", {
      retryable: true,
    });
  }
}

export function statusOf(err: unknown): number {
  if (err instanceof VaultBridgeError) {
    return err.status;
  }
  return 500;
}

export function codeOf(err: unknown): ErrorCode {
  if (err instanceof VaultBridgeError) {
    return err.code;
  }
  return "UNKNOWN";
}

async function route(ctx: RouteContext): Promise<Response | undefined> {
  const path = ctx.url.pathname.replace(/\/+$/, "") || "/";
  const [ , , apiRoot ] = path.split("/");
  void apiRoot;

  if (path === "/v1/health" && ctx.request.method === "GET") {
    return handleHealth(ctx);
  }
  if (path === "/v1/bootstrap" && ctx.request.method === "POST") {
    return handleBootstrap(ctx);
  }
  if (path === "/v1/pair/complete" && ctx.request.method === "POST") {
    return handlePairComplete(ctx);
  }

  const vaultMatch = path.match(/^\/v1\/vaults\/([A-Za-z0-9_-]+)(\/.*)?$/);
  if (vaultMatch) {
    const vaultId = vaultMatch[1]!;
    const subpath = vaultMatch[2] ?? "";
    if (subpath.startsWith("/live/")) {
      return handleLiveRoute(ctx.env.DB, ctx.request, ctx.url, vaultId, subpath, ctx.env.LIVE_HOOKS);
    }
    if (subpath === "/state") {
      return handleVaultState(ctx, vaultId);
    }
    if (subpath === "/changes") {
      return handleChanges(ctx, vaultId);
    }
    if (subpath === "/uploads" && ctx.request.method === "POST") {
      return handleReserveUpload(ctx, vaultId);
    }
    const uploadPut = subpath.match(/^\/uploads\/([A-Za-z0-9_-]+)$/);
    if (uploadPut && ctx.request.method === "PUT") {
      return handleUploadPut(ctx, vaultId, uploadPut[1]!);
    }
    if (subpath === "/commits" && ctx.request.method === "POST") {
      const committed = await handleCommit(ctx, vaultId);
      if (committed.status >= 200 && committed.status < 300) {
        try {
          await ctx.env.LIVE_HOOKS?.onFilesChanged?.(vaultId);
        } catch {
          /* devices fall back to their slow poll */
        }
      }
      return committed;
    }
    const fileMatch = subpath.match(/^\/files\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (fileMatch) {
      const fileId = fileMatch[1]!;
      const sub = fileMatch[2] ?? "";
      if (sub === "/head") {
        return handleFileHead(ctx, vaultId, fileId);
      }
      if (sub === "/history") {
        return handleFileHistory(ctx, vaultId, fileId);
      }
    }
    const revMatch = subpath.match(/^\/revisions\/([A-Za-z0-9_-]+)$/);
    if (revMatch) {
      return handleRevision(ctx, vaultId, revMatch[1]!);
    }
    const objectMatch = subpath.match(/^\/objects\/([A-Za-z0-9_-]+)$/);
    if (objectMatch) {
      return handleObjectGet(ctx, vaultId, objectMatch[1]!);
    }
    const revokeMatch = subpath.match(/^\/devices\/([A-Za-z0-9_-]+)\/revoke$/);
    if (revokeMatch && ctx.request.method === "POST") {
      return handleRevoke(ctx, vaultId, revokeMatch[1]!);
    }
    if (subpath === "/usage") {
      return handleUsage(ctx, vaultId);
    }
    if (subpath === "/devices" && ctx.request.method === "GET") {
      return handleListDevices(ctx, vaultId);
    }
    if (subpath === "/pair/invitations" && ctx.request.method === "POST") {
      return handleCreateInvitation(ctx, vaultId);
    }
  }

  return undefined;
}

/** Main request entry: rate limit + dispatch + error normalization. */
export async function handleVaultBridgeRequest(request: Request, env: VaultBridgeEnv): Promise<Response> {
  const requestId = randomId(8);
  const url = new URL(request.url);
  const ctx: RouteContext = { env, request, url, requestId };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, x-vb-protocol",
      },
    });
  }

  try {
    // Every route is rate limited, health included (attackers hammer it too).
    applyRateLimit(request, env, requestId);
    const response = await route(ctx);
    if (!response) {
      throw new VaultBridgeError("NOT_FOUND", `no route for ${request.method} ${url.pathname}`);
    }
    const withId = response.headers.has("x-vb-request-id")
      ? response
      : new Response(response.body, { status: response.status, headers: { ...response.headers, "x-vb-request-id": requestId } });
    return withId;
  } catch (err) {
    let vbError: VaultBridgeError;
    if (err instanceof VaultBridgeError) {
      vbError = err;
    } else if (err instanceof z.ZodError) {
      vbError = new VaultBridgeError("INVALID_REQUEST", `schema: ${err.issues.length} issue(s)`, {
        status: 422,
      });
    } else {
      vbError = new VaultBridgeError("RETRYABLE_BACKEND", err instanceof Error ? err.message : "unknown backend failure", {
        status: 500,
      });
    }
    return errorResponse(vbError, requestId);
  }
}

void HEALTH_ID;
void codeOf;
void statusOf;
void ERROR_CLASSES; // re-export surface used by docs tooling
