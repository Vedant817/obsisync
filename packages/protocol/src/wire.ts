import { z } from "zod";

/**
 * Logical entities shared between plugin and worker (spec §8).
 *
 * Wire encoding: canonical minimal JSON with **camelCase** field names
 * (docs/protocol.md documents this decision; spec examples were logical).
 * Every identifier crossing the wire is opaque. Plaintext paths never appear
 * in the API; manifests are encrypted client-side.
 */

const idLike = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

/** Random, path-independent identity for a note or attachment. */
export const FileIdSchema = idLike;
export type FileId = z.infer<typeof FileIdSchema>;

/** Immutable revision identity (never clock-ordered). */
export const RevisionIdSchema = idLike;
export type RevisionId = z.infer<typeof RevisionIdSchema>;

/** Opaque object id namespace (blobs / manifests). */
export const ObjectIdSchema = idLike;
export type ObjectId = z.infer<typeof ObjectIdSchema>;

const b64 = z.string().max(96).regex(/^[A-Za-z0-9+/=]+$/);
const bigB64 = z.string().max(64 * 1024 + 32).regex(/^[A-Za-z0-9+/=]*$/);

/** Minimal per-revision envelope metadata exchanged with the server. */
export interface RevisionMeta {
  revisionId: RevisionId;
  parentRevisionId: RevisionId | null;
  keyEpoch: number;
  isTombstone: boolean;
  ciphertextSha256: string;
  ciphertextBytes: number;
  blobObjectId: string | null;
  manifestObjectId: string | null;
  deviceId: string;
  createdAt: string;
}

/** Feed event: one commit, in cursor order. */
export interface ChangeEventWire {
  seq: number;
  vaultId: string;
  fileId: FileId;
  revisionId: RevisionId;
  eventType: "commit" | "tombstone";
  createdAt: string;
  revision?: RevisionMeta;
}

/** Server-reported file head. */
export interface FileHeadWire {
  fileId: FileId;
  headRevisionId: RevisionId | null;
  isDeleted: boolean;
  lastEventSeq: number;
}

/** Encrypted vault material shared with every device (decryptable client-side only). */
export interface VaultStateWire {
  protocolVersion: number;
  keyEpoch: number;
  wrappedVaultKeyB64: string;
  wrappedVaultKeyRecoveryB64: string;
  /** Canonical JSON of versioned KdfParams produced by packages/crypto. */
  kdfParamsJson: string;
  flagsCiphertextB64?: string;
  /** Bumped whenever key material changes (rotation). */
  materialsVersion: number;
}

// ---------------------------------------------------------------------------
// Health / bootstrap / pairing
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: "ok" | "degraded";
  backendVersion: string;
  protocolVersion: number;
  minClientProtocolVersion: number;
}

export const BootstrapRequestSchema = z.object({
  bootstrapToken: z.string().min(16).max(256),
  keyEpoch: z.number().int().min(1).default(1),
  wrappedVaultKeyB64: b64,
  wrappedVaultKeyRecoveryB64: b64,
  kdfParamsJson: z.string().min(2).max(1024),
  flagsCiphertextB64: b64.optional(),
  deviceNameCiphertextB64: b64.optional(),
});
export type BootstrapRequest = z.infer<typeof BootstrapRequestSchema>;

export interface BootstrapResponse {
  vaultId: string;
  deviceId: string;
  deviceToken: string;
  serverProtocolVersion: number;
}

export const CreateInvitationRequestSchema = z.object({
  ttlSeconds: z.number().int().min(60).max(3600).default(600),
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export interface InviteCreatedResponse {
  inviteId: string;
  /** Shown to the new device on the trusted channel (QR/link). */
  pairingCode: string;
  expiresAt: string;
}

export const CompletePairingRequestSchema = z.object({
  inviteId: idLike,
  /** sha256(pairingCode + ":" + inviteId) hex — proves possession without the code. */
  inviteProof: z.string().min(32).max(128).regex(/^[a-f0-9]+$/),
  deviceNameCiphertextB64: b64.optional(),
});
export type CompletePairingRequest = z.infer<typeof CompletePairingRequestSchema>;

export interface PairCompleteResponse {
  vaultId: string;
  deviceId: string;
  deviceToken: string;
  vaultState: VaultStateWire;
}

// ---------------------------------------------------------------------------
// Uploads / commits
// ---------------------------------------------------------------------------

export const ReserveUploadRequestSchema = z.object({
  uploadId: idLike,
  expectedBytes: z.number().int().min(1),
  /** sha256 hex of the exact bytes that will be PUT. */
  expectedSha256: z.string().min(32).max(128).regex(/^[a-f0-9]+$/),
});
export type ReserveUploadRequest = z.infer<typeof ReserveUploadRequestSchema>;

export interface ReserveUploadResponse {
  uploadId: string;
  stagingObjectId: string;
  expiresAt: string;
}

export const CommitRequestSchema = z.object({
  operationId: idLike,
  fileId: FileIdSchema,
  parentRevisionId: RevisionIdSchema.nullable(),
  newRevisionId: RevisionIdSchema,
  keyEpoch: z.number().int().min(1).max(1_000_000),
  isTombstone: z.boolean(),
  stagingObjectId: ObjectIdSchema,
  manifestObjectId: ObjectIdSchema,
  /** Encrypted manifest payload (small); storage is handled by the Worker. */
  manifestPayloadB64: bigB64,
  ciphertextSha256: z.string().min(32).max(128).regex(/^[a-f0-9]*$/),
  ciphertextBytes: z.number().int().min(0).max(2 ** 31),
  clientProtocolVersion: z.number().int().min(1).max(1_000),
});
export type CommitRequest = z.infer<typeof CommitRequestSchema>;

export interface CommitResponse {
  result: "COMMITTED" | "ALREADY_COMMITTED" | "CONFLICT";
  receipt?: { operationId: string; revisionId: RevisionId; seq: number | null } | null;
  conflict?: {
    currentHead: FileHeadWire;
    currentRevision: RevisionMeta | null;
  };
  seq?: number | null;
}

export interface ChangesResponse {
  events: ChangeEventWire[];
  endCursor: number;
  hasMore: boolean;
  protocolVersion: number;
}

export const AckCursorRequestSchema = z.object({
  acknowledgedSeq: z.number().int().min(0),
});
export type AckCursorRequest = z.infer<typeof AckCursorRequestSchema>;

export interface UsageResponse {
  storageEstimateBytes: number;
  objectCount: number;
  revisionCount: number;
  deviceCount: number;
  historyRetentionDays: number;
  counters: {
    dataObjectWritesToday: number;
    dataObjectReadsToday: number;
    uploadBytesToday: number;
    workerRequestsToday: number;
    d1WritesToday: number;
    dateUtc: string;
  };
}

/** One history row. `seq` is the global change-feed cursor for this revision. */
export interface HistoryRevision extends RevisionMeta {
  seq: number;
}

export interface HistoryResponse {
  fileId: FileId;
  revisions: HistoryRevision[];
  hasMore: boolean;
}

export interface DeviceInfoWire {
  deviceId: string;
  nameHintB64?: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
}

export interface DevicesResponse {
  devices: DeviceInfoWire[];
}
