/**
 * Revision manifest encryption: paths in the cloud are ciphertext, always
 * (spec §8.2 "Display path: encrypted in revision manifest").
 */
import { aeadEncrypt, aeadDecrypt, CryptoError, sha256Async } from "./aead.js";
import { encodeAad } from "./encoding.js";
import { randomBytes, randomNonce, toBase64, fromBase64, toBase64Url } from "./random.js";
import { manifestAad } from "./envelope.js";

export interface RevisionManifest {
  path: string;
  sizeBytes: number;
  mtimeMs?: number;
  contentTypeHint?: "text/markdown" | "text/plain" | "binary";
  createdMs?: number;
  /** Set when a rename moved this file id; path is the NEW path. */
  renamedFrom?: string;
}

/** Encrypt the manifest object sent to the Worker for one revision. */
export async function encryptManifest(
  manifest: RevisionManifest,
  manifestKey: Uint8Array,
  identity: { vaultId: string; fileId: string; revisionId: string; keyEpoch: number },
): Promise<{ payload: Uint8Array; manifestObjectId: string; sha256B64: string }> {
  const nonce = randomNonce();
  const aad = encodeAad(manifestAad(identity));
  const plaintext = new TextEncoder().encode(JSON.stringify(manifest));
  const { ciphertext } = await aeadEncrypt({
    key: manifestKey,
    nonce,
    plaintext,
    aad,
  });
  const payload = concat([Uint8Array.of(MANIFEST_FORMAT), nonce, ciphertext]);
  const sha256B64 = toBase64(await sha256Async(payload));
  const manifestObjectId = toBase64Url(randomBytes(16));
  return { payload, manifestObjectId, sha256B64 };
}

export const MANIFEST_FORMAT = 1;

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) {
    total += p.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Decrypt a manifest payload fetched from the Worker (bytes = format|nonce|ct). */
export async function decryptManifest(
  payload: Uint8Array,
  manifestKey: Uint8Array,
  identity: { vaultId: string; fileId: string; revisionId: string; keyEpoch: number },
): Promise<RevisionManifest> {
  if (payload.length < 1 + 12 + 17) {
    throw new CryptoError("manifest payload too short");
  }
  if (payload[0] !== MANIFEST_FORMAT) {
    throw new CryptoError(`manifest format ${payload[0]} not supported`);
  }
  const nonce = payload.slice(1, 13);
  const ciphertext = payload.slice(13);
  const aad = encodeAad(manifestAad(identity));
  let pt: Uint8Array;
  try {
    pt = (
      await aeadDecrypt({
        key: manifestKey,
        nonce,
        plaintext: ciphertext,
        aad,
      })
    ).ciphertext;
  } catch (err) {
    throw new CryptoError(
      `manifest AEAD failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  try {
    return JSON.parse(new TextDecoder().decode(pt)) as RevisionManifest;
  } catch {
    throw new CryptoError("manifest JSON corrupt after successful decrypt");
  }
}

export { toBase64, fromBase64 };
