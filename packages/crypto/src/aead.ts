/**
 * AEAD primitives: AES-256-GCM over WebCrypto.
 *
 * Contract (fail-closed):
 * - Fresh random 96-bit nonce per operation.
 * - AAD (additional authenticated data) binds the envelope to its identity and
 *   protocol context: an envelope copied to another file/vault fails decrypt.
 * - Authentication failures throw `CryptoError` — callers MUST NOT fall back
 *   to any plaintext, local file, or previous revision.
 */

export class CryptoError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`CryptoError: ${detail}`);
    this.name = "CryptoError";
    this.detail = detail;
  }
}

export interface AeadInput {
  key: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  aad: Uint8Array;
}

export interface AeadOutput {
  ciphertext: Uint8Array;
}

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new CryptoError("WebCrypto subtle is unavailable in this runtime");
  }
  return s;
};

function importAesKey(key: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  if (key.length !== 32) {
    return Promise.reject(new CryptoError(`AES-256 key must be 32 bytes, got ${key.length}`));
  }
  return subtle().importKey("raw", key as BufferSource, { name: "AES-GCM" }, false, usages);
}

export async function aeadEncrypt(input: AeadInput): Promise<AeadOutput> {
  const { key, nonce, plaintext, aad } = input;
  if (nonce.length !== 12) {
    throw new CryptoError("AES-GCM nonce must be 12 bytes (96 bits)");
  }
  const cryptoKey = await importAesKey(key, ["encrypt"]);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
    cryptoKey,
    plaintext as BufferSource,
  );
  return { ciphertext: new Uint8Array(ct) };
}

export async function aeadDecrypt(input: AeadInput): Promise<AeadOutput> {
  const { key, nonce, plaintext: ciphertext, aad } = input;
  if (nonce.length !== 12) {
    throw new CryptoError("AES-GCM nonce must be 12 bytes (96 bits)");
  }
  const cryptoKey = await importAesKey(key, ["decrypt"]);
  let pt: ArrayBuffer;
  try {
    pt = await subtle().decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
      cryptoKey,
      ciphertext as BufferSource,
    );
  } catch {
    throw new CryptoError("AEAD authentication failed (corrupted ciphertext, wrong key or mismatched AAD)");
  }
  return { ciphertext: new Uint8Array(pt) };
}

// ---------------------------------------------------------------------------
// HKDF (derive, not wrap) — domain separation for sub-purposes
// ---------------------------------------------------------------------------

const HKDF_SALT_VB = new TextEncoder().encode("VaultBridge HKDF v1");

export async function hkdf(
  ikm: Uint8Array,
  info: string,
  length = 32,
): Promise<Uint8Array> {
  const base = await subtle().importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT_VB as BufferSource,
      info: new TextEncoder().encode(info) as BufferSource,
    },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Domain prefixes are versioned; changing any of these invalidates derivations. */
export const KEY_DOMAINS = {
  content: (keyEpoch: number) => `vb/content/content-key/v1/epoch-${keyEpoch}`,
  manifest: (keyEpoch: number) => `vb/manifest/path-key/v1/epoch-${keyEpoch}`,
  localWrap: (deviceId: string, deviceKeyEpoch: number) =>
    `vb/local/device-wrap/v1/device-${deviceId}/epoch-${deviceKeyEpoch}`,
  kitChecksum: "vb/tools/checksum/v1",
  live: (keyEpoch: number) => `vb/live/doc-key/v1/epoch-${keyEpoch}`,
} as const;

export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  const d = await subtle().digest("SHA-256", data as BufferSource);
  return new Uint8Array(d);
}

/** Canonical transport-fingerprint: lowercase hex sha256 of raw bytes. */
export async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const digest = await sha256Async(data);
  let out = "";
  for (const b of digest) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export async function constantTimeEqualsAsync(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}
