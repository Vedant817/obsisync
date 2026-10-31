import type { R2BucketLike, D1DatabaseLike } from "./ports.js";
import { PROTOCOL_LIMITS, VaultBridgeError } from "./worker-utils.js";
import { sha256HexBytes } from "@vaultbridge/crypto";
import { recordMetrics } from "./store.js";

/** Day-scope helper: all metrics bucket by UTC date. */
export function utcDate(iso: string = new Date().toISOString()): string {
  return iso.slice(0, 10);
}

const VAULT_PREFIX = "vb-objects";

export function contentObjectKey(vaultId: string, objectId: string): string {
  return `${VAULT_PREFIX}/vaults/${vaultId}/blobs/${objectId}`;
}

export function manifestObjectKey(vaultId: string, objectId: string): string {
  return `${VAULT_PREFIX}/vaults/${vaultId}/manifests/${objectId}`;
}

export interface ReserveUploadArgs {
  vaultId: string;
  deviceId: string;
  uploadId: string;
  expectedBytes: number;
  expectedSha256: string;
}

export interface UploadSessionRow {
  upload_id: string;
  vault_id: string;
  device_id: string;
  staging_object_key: string;
  expected_sha256: string;
  expected_bytes: number;
  status: "reserved" | "staged" | "committed" | "expired";
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  revision_id: string | null;
}

async function recordMetricsSafe(
  db: D1DatabaseLike,
  vaultId: string,
  counters: { writes: number; reads: number; uploadBytes: number },
): Promise<void> {
  try {
    await recordMetrics(db, vaultId, utcDate(), { ...counters, requests: 0 });
  } catch {
    /* metrics are best-effort (documented) */
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/** Used when neither a test bucket nor Turso credentials are configured. */
export function unavailableBucket(): R2BucketLike {
  const fail = (): never => {
    throw new VaultBridgeError(
      "RETRYABLE_BACKEND",
      "object storage is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    );
  };
  return {
    get: fail,
    head: fail,
    put: fail,
    delete: fail,
    list: fail,
  };
}

export class ObjectService {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly bucket: R2BucketLike,
  ) {}

  async reserve(
    args: ReserveUploadArgs,
    allowedMaxBytes: number = PROTOCOL_LIMITS.maxObjectBytes,
  ): Promise<UploadSessionRow> {
    if (args.expectedBytes > allowedMaxBytes || args.expectedBytes < 1) {
      throw new VaultBridgeError(
        "OBJECT_TOO_LARGE",
        `payload ${args.expectedBytes} outside limits (${allowedMaxBytes})`,
      );
    }
    const existing = await this.getSession(args.uploadId);
    if (existing) {
      if (
        existing.vault_id !== args.vaultId ||
        existing.device_id !== args.deviceId ||
        existing.expected_sha256 !== args.expectedSha256 ||
        existing.expected_bytes !== args.expectedBytes
      ) {
        throw new VaultBridgeError("INVALID_REQUEST", "upload id reused for a different payload");
      }
      return existing;
    }
    const now = Date.now();
    const at = new Date(now).toISOString();
    const expiresAt = new Date(now + PROTOCOL_LIMITS.uploadSessionTtlMs).toISOString();
    const stagingKey = contentObjectKey(args.vaultId, args.uploadId);
    await this.db
      .prepare(
        `INSERT INTO upload_sessions (upload_id, vault_id, device_id, staging_object_key, expected_sha256, expected_bytes, status, created_at, expires_at, verified_at, revision_id)
         VALUES (?1,?2,?3,?4,?5,?6,'reserved',?7,?8,NULL,NULL)`,
      )
      .bind(
        args.uploadId,
        args.vaultId,
        args.deviceId,
        stagingKey,
        args.expectedSha256,
        args.expectedBytes,
        at,
        expiresAt,
      )
      .run();
    return {
      upload_id: args.uploadId,
      vault_id: args.vaultId,
      device_id: args.deviceId,
      staging_object_key: stagingKey,
      expected_sha256: args.expectedSha256,
      expected_bytes: args.expectedBytes,
      status: "reserved",
      created_at: at,
      expires_at: expiresAt,
      verified_at: null,
      revision_id: null,
    };
  }

  /** Stream the encrypted object into the reserved key (idempotent by digest). */
  async putObject(session: UploadSessionRow, body: Uint8Array): Promise<{ staged: boolean }> {
    if (body.length > PROTOCOL_LIMITS.maxObjectBytes) {
      throw new VaultBridgeError("OBJECT_TOO_LARGE", `payload exceeds ${PROTOCOL_LIMITS.maxObjectBytes}`);
    }
    const digest = await sha256HexBytes(body);
    if (digest !== session.expected_sha256) {
      throw new VaultBridgeError("CORRUPT_ENVELOPE", "uploaded bytes do not match reserved digest");
    }
    // A retry after a lost response repeats the same bytes. Staged and committed
    // sessions already hold that object; do not fail the replay.
    if (session.status === "staged" || session.status === "committed") {
      return { staged: true };
    }
    if (session.status !== "reserved") {
      throw new VaultBridgeError("INVALID_REQUEST", `upload session is ${session.status}`);
    }
    await this.bucket.put(session.staging_object_key, body);
    await this.markSessionStatus(session.upload_id, "staged");
    await recordMetricsSafe(this.db, session.vault_id, { writes: 1, reads: 0, uploadBytes: body.length });
    return { staged: true };
  }

  async getSession(uploadId: string): Promise<UploadSessionRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM upload_sessions WHERE upload_id = ?1")
      .bind(uploadId)
      .all<UploadSessionRow>();
    return row.success ? (row.results[0] ?? null) : null;
  }

  async markSessionStatus(uploadId: string, status: UploadSessionRow["status"]): Promise<void> {
    await this.db
      .prepare("UPDATE upload_sessions SET status = ?2 WHERE upload_id = ?1")
      .bind(uploadId, status)
      .run();
  }

  async markSessionCommitted(uploadId: string, revisionId: string): Promise<void> {
    await this.db
      .prepare("UPDATE upload_sessions SET status = 'committed', revision_id = ?2 WHERE upload_id = ?1")
      .bind(uploadId, revisionId)
      .run();
  }

  /**
   * Write a manifest once. The id is client-chosen and published on the feed,
   * so a later commit must not replace bytes that an older revision still names.
   * Identical bytes are a retry and do not count as another write.
   */
  async putManifestObject(vaultId: string, manifestObjectId: string, payload: Uint8Array): Promise<{ key: string }> {
    if (payload.length > 64 * 1024) {
      throw new VaultBridgeError("OBJECT_TOO_LARGE", "manifest above 64KB is a protocol violation");
    }
    const key = manifestObjectKey(vaultId, manifestObjectId);
    const existing = await this.bucket.get(key);
    if (existing) {
      const previous = await existing.bytes();
      if (!sameBytes(previous, payload)) {
        throw new VaultBridgeError("INVALID_REQUEST", "manifest object id already stores different bytes");
      }
      return { key };
    }
    await this.bucket.put(key, payload);
    await recordMetricsSafe(this.db, vaultId, { writes: 1, reads: 0, uploadBytes: payload.length });
    return { key };
  }

  /** Authorized encrypted object read for GET /objects/:objectId. */
  async readObject(vaultId: string, objectKey: string): Promise<Uint8Array> {
    const body = await this.bucket.get(objectKey);
    if (!body) {
      throw new VaultBridgeError("NOT_FOUND", "object missing from storage");
    }
    await recordMetricsSafe(this.db, vaultId, { reads: 1, writes: 0, uploadBytes: 0 });
    return body.bytes();
  }

  /** Remove an unreferenced object (classified staging cleanup only). */
  async deleteObject(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

/** Deterministic token-role helper kept for diagnostics only. */
export { PROTOCOL_LIMITS };
