/** Shared types for the crypto package. */

/** Versioned, serialized KDF parameters (stored with the wrapped key). */
export interface KdfParams {
  algo: string;
  saltB64: string;
  timeCost: number;
  memoryCostKiB: number;
  parallelism: number;
  hashLen: number;
}

/** What the server sees; everything is client-side ciphertext or metadata. */
export interface WrappedKeyMaterial {
  /** VMK wrapped under the passphrase-derived KEK. */
  wrappedByPassphraseB64: string;
  /** VMK wrapped under the recovery key. */
  wrappedByRecoveryB64: string;
  kdfParams: KdfParams;
  keyEpoch: number;
}

/** AAD purpose tags bind every envelope to exactly one use. */
export const AAD_PURPOSES = {
  vmkWrap: "vb.kdf.vmk-wrap.v1",
  vmkRecovery: "vb.kdf.vmk-recovery.v1",
  content: "vb.file.content.v1",
  manifest: "vb.file.manifest.v1",
  vaultFlags: "vb.vault.flags.v1",
  localJournal: "vb.local.journal.v1",
  snapshot: "vb.backup.snapshot.v1",
} as const;

export type AADPurpose = (typeof AAD_PURPOSES)[keyof typeof AAD_PURPOSES];
