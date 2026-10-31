/**
 * Vault Master Key lifecycle (spec §10.2):
 *
 *   passphrase --argon2id--> KEK --AES-GCM-wrap--> wrappedByPassphrase
 *   recoveryKey --HKDF(recovery)--> KEK2 --AES-GCM-wrap--> wrappedByRecovery
 *   VMK --HKDF(domain, epoch)--> contentKey / manifestKey / ...
 *
 * The VMK never leaves the device unwrapped. Servers receive only wrapped
 * envelopes and versioned KDF parameters — no secrets, no plaintext.
 */
import type { KdfParams, WrappedKeyMaterial, AADPurpose } from "./types.js";
import { AAD_PURPOSES } from "./types.js";
import {
  aeadEncrypt,
  aeadDecrypt,
  CryptoError,
  hkdf,
  KEY_DOMAINS,
} from "./aead.js";
import { deriveKek, DEFAULT_KDF_PARAMS_TEMPLATE, generateKdfSalt } from "./kdf.js";
import { encodeAad, concatArrays } from "./encoding.js";
import { randomKey, randomNonce, fromBase64, toBase64 } from "./random.js";
import { keyToPhrase, phraseToKey } from "./phrase.js";

export {
  DEFAULT_KDF_PARAMS_TEMPLATE,
  generateKdfSalt,
  deriveKek,
  aeadEncrypt,
  aeadDecrypt,
  CryptoError,
  hkdf,
  KEY_DOMAINS,
  keyToPhrase,
  phraseToKey,
  randomKey,
  randomNonce,
};
export type { KdfParams, WrappedKeyMaterial, AADPurpose };
export { AAD_PURPOSES };

export function generateRecoveryKey(): Uint8Array {
  return randomKey();
}

export function generateVaultMasterKey(): Uint8Array {
  return randomKey();
}

// ---------------------------------------------------------------------------
// Low-level wrap helpers (coded envelope: version || nonce || ciphertext)
// ---------------------------------------------------------------------------

const WRAP_ENVELOPE_VERSION = 1;

async function wrapBytes(
  plaintext: Uint8Array,
  key: Uint8Array,
  aad: Uint8Array,
): Promise<string> {
  const nonce = randomNonce();
  const enc = await aeadEncrypt({ key, nonce, plaintext, aad });
  const coded = concatArrays([Uint8Array.of(WRAP_ENVELOPE_VERSION), nonce, enc.ciphertext]);
  return toBase64(coded);
}

async function unwrapBytes(
  codedB64: string,
  key: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const coded = fromBase64(codedB64);
  if (coded.length < 1 + 12 + 1 + 16) {
    throw new CryptoError("wrapped envelope too short");
  }
  const version = coded[0]!;
  if (version !== WRAP_ENVELOPE_VERSION) {
    throw new CryptoError(`unsupported wrap envelope version ${version}`);
  }
  const nonce = coded.slice(1, 13);
  return aeadDecrypt({
    key,
    nonce,
    plaintext: coded.slice(13),
    aad,
  }).then((r) => r.ciphertext);
}

// ---------------------------------------------------------------------------
// Passphrase / recovery wrapping
// ---------------------------------------------------------------------------

export async function vaultKeyWrap(
  vmk: Uint8Array,
  passphrase: string,
  recoveryKey: Uint8Array,
): Promise<WrappedKeyMaterial> {
  const params: KdfParams = { ...DEFAULT_KDF_PARAMS_TEMPLATE, saltB64: generateKdfSalt(16) };
  const kek = await deriveKek(passphrase, params);
  const wrappedByPassphraseB64 = await wrapBytes(
    vmk,
    kek,
    encodeAad({ purpose: AAD_PURPOSES.vmkWrap }),
  );

  const recoveryWrapKey = await hkdf(recoveryKey, "vb/recovery-wrapping/v1");
  const wrappedByRecoveryB64 = await wrapBytes(
    vmk,
    recoveryWrapKey,
    encodeAad({ purpose: AAD_PURPOSES.vmkRecovery }),
  );

  return {
    wrappedByPassphraseB64,
    wrappedByRecoveryB64,
    kdfParams: params,
    keyEpoch: 1,
  };
}

export async function unwrapWithPassphrase(
  wrappedB64: string,
  passphrase: string,
  params: KdfParams,
): Promise<Uint8Array> {
  const kek = await deriveKek(passphrase, params);
  return unwrapBytes(wrappedB64, kek, encodeAad({ purpose: AAD_PURPOSES.vmkWrap }));
}

export async function unwrapWithRecoveryKey(
  wrappedB64: string,
  recoveryKey: Uint8Array,
): Promise<Uint8Array> {
  const recoveryWrapKey = await hkdf(recoveryKey, "vb/recovery-wrapping/v1");
  return unwrapBytes(wrappedB64, recoveryWrapKey, encodeAad({ purpose: AAD_PURPOSES.vmkRecovery }));
}

export async function unwrapWithRecoveryPhrase(
  wrappedB64: string,
  phrase: string,
): Promise<Uint8Array> {
  const recoveryKey = await phraseToKey(phrase);
  return unwrapWithRecoveryKey(wrappedB64, recoveryKey);
}

// ---------------------------------------------------------------------------
// Sub-key derivation (domain-separated)
// ---------------------------------------------------------------------------

export async function deriveContentKey(vmk: Uint8Array, keyEpoch: number): Promise<Uint8Array> {
  return hkdf(vmk, KEY_DOMAINS.content(keyEpoch));
}

export async function deriveManifestKey(vmk: Uint8Array, keyEpoch: number): Promise<Uint8Array> {
  return hkdf(vmk, KEY_DOMAINS.manifest(keyEpoch));
}

/** Seals live-editing CRDT updates and cursors, and keys the document-id PRF. */
export async function deriveLiveKey(vmk: Uint8Array, keyEpoch: number): Promise<Uint8Array> {
  return hkdf(vmk, KEY_DOMAINS.live(keyEpoch));
}

