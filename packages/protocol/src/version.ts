/**
 * VaultBridge wire protocol.
 *
 * All constants and shapes in this file are part of the v1 contract documented
 * in docs/protocol.md. Breaking changes require a new PROTOCOL_WIRE_VERSION and
 * a compatibility window (see `isProtocolCompatible`).
 *
 * Design authority: Obsidian_Vault_Sync_Master_Specification §9.4 / §8.
 */

/** Current wire protocol version produced by this code base. */
export const PROTOCOL_VERSION = 1;

/** Client refuses to talk to servers whose version falls outside this window. */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;
export const MAX_SUPPORTED_PROTOCOL_VERSION = 1;

/**
 * A server is compatible when its version is >= our minimum (so we speak its
 * language) and <= our max (so we never rely on features newer than us).
 */
export function isProtocolCompatible(serverVersion: number): boolean {
  return (
    Number.isFinite(serverVersion) &&
    serverVersion >= MIN_SUPPORTED_PROTOCOL_VERSION &&
    serverVersion <= MAX_SUPPORTED_PROTOCOL_VERSION
  );
}

/** Hard server-side limits mirrored by client guards (Turso). */
export const PROTOCOL_LIMITS = {
  /** Default page size for the change feed. */
  changesPageSize: 200,
  /** Never ask for more than this in one page regardless of settings. */
  changesPageSizeMax: 500,
  /** Encrypted blob hard ceiling per object (v1 rejects bigger uploads). */
  maxObjectBytes: 25 * 1024 * 1024,
  /** Default per-file attachment limit configurable in settings. */
  defaultAttachmentMaxBytes: 4 * 1024 * 1024,
  /** Upload session lifetime. */
  uploadSessionTtlMs: 15 * 60 * 1000,
  /** One-time pairing invitation lifetime. */
  invitationTtlMs: 10 * 60 * 1000,
  /** Staging objects older than this are GC-eligible. */
  stagingGcAfterMs: 24 * 60 * 60 * 1000,
  /** Begin refusing history commits when live estimate passes this. */
  maxVaultStorageEstimateBytes: 9 * 1024 * 1024 * 1024,
} as const;

export type ProtocolLimits = typeof PROTOCOL_LIMITS;
