/**
 * Versioned AEAD envelope for file content and revision manifests.
 *
 * Byte format (private canonical, still fail-closed over the wire):
 *   version(1) | nonce(12) | ciphertext(N) | lengthPrefixAadHash? no:
 * Keep it simple: JSON envelope is transmitted; binary payload in object is raw.
 */
import { aeadEncrypt, aeadDecrypt, CryptoError } from "./aead.js";
import { encodeAad, AadParts, canonicalJson, concatArrays } from "./encoding.js";
import { randomNonce, toBase64, fromBase64, randomId } from "./random.js";
import { sha256Async } from "./aead.js";

export const ENVELOPE_VERSION = 1;

export interface Envelope {
  protocol: number;
  envelopeFormat: number;
  cipher: "AES-256-GCM";
  nonceB64: string;
  ciphertextB64: string;
  /** SHA-256 of ciphertext (transport corruption check; AEAD is the real gate). */
  integritySha256B64: string;
  /** Location/identity binding for quick pre-check; tampering fails AEAD too. */
  aadHint: { purpose: string; vaultId?: string; fileId?: string; keyEpoch?: number };
}

export interface EncryptResult {
  envelope: Envelope;
  /** Raw bytes the caller sends to the Worker (JSON envelope serialization). */
  payload: Uint8Array;
  ciphertextBytes: number;
  ciphertextSha256B64: string;
  plaintextBytes: number;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function serializeEnvelope(env: Envelope): Uint8Array {
  return textEncoder.encode(canonicalJson(env));
}

export function deserializeEnvelope(payload: Uint8Array): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(payload));
  } catch {
    throw new CryptoError("envelope is not valid JSON (corrupted transfer?)");
  }
  const env = parsed as Envelope;
  checkEnvelopeShape(env);
  if (env.envelopeFormat !== ENVELOPE_VERSION) {
    throw new CryptoError(`unsupported envelope format ${env.envelopeFormat}`);
  }
  if (env.cipher !== "AES-256-GCM") {
    throw new CryptoError(`unsupported cipher ${env.cipher}`);
  }
  return env;
}

function checkEnvelopeShape(env: Envelope): void {
  if (!env || typeof env !== "object") {
    throw new CryptoError("envelope missing");
  }
  if (typeof env.nonceB64 !== "string" || typeof env.ciphertextB64 !== "string") {
    throw new CryptoError("envelope missing nonce or ciphertext");
  }
  if (typeof env.integritySha256B64 !== "string") {
    throw new CryptoError("envelope missing integrity hash");
  }
}

export async function envelopeDecrypt(
  env: Envelope,
  key: Uint8Array,
  aad: AadParts,
): Promise<Uint8Array> {
  // Match the encrypt-side binding: default the protocol version when the
  // caller omits it, so AAD bytes are identical on both paths.
  const aadBytes = encodeAad({
    purpose: aad.purpose ?? env.aadHint.purpose,
    protocolVersion: aad.protocolVersion ?? ENVELOPE_VERSION,
    vaultId: aad.vaultId,
    fileId: aad.fileId,
    revisionId: aad.revisionId,
    keyEpoch: aad.keyEpoch,
  });
  if (!aadBytes.byteLength) {
    throw new CryptoError("empty AAD is not allowed");
  }
  const nonce = fromBase64(env.nonceB64);
  const cipher = fromBase64(env.ciphertextB64);
  const integrity = await sha256Async(cipher);
  if (!constantTimeB64(integrity, env.integritySha256B64)) {
    throw new CryptoError("integrity hash mismatch (ciphertext corrupted in transport)");
  }
  const result = await aeadDecrypt({
    key,
    nonce,
    plaintext: cipher,
    aad: aadBytes,
  });
  return result.ciphertext;
}

function constantTimeB64(actual: Uint8Array, expectedB64: string): boolean {
  const expected = fromBase64(expectedB64 || "");
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i]! ^ expected[i]!;
  }
  return diff === 0;
}

/** High-level helper used by sync-core: bind content to file+revision+epoch. */
export function contentAad(opts: {
  vaultId: string;
  fileId: string;
  revisionId: string;
  keyEpoch: number;
}): AadParts {
  return {
    purpose: "vb.file.content.v1",
    protocolVersion: 1,
    vaultId: opts.vaultId,
    fileId: opts.fileId,
    revisionId: opts.revisionId,
    keyEpoch: opts.keyEpoch,
  };
}

export function manifestAad(opts: {
  vaultId: string;
  fileId: string;
  revisionId: string;
  keyEpoch: number;
}): AadParts {
  return {
    purpose: "vb.file.manifest.v1",
    protocolVersion: 1,
    vaultId: opts.vaultId,
    fileId: opts.fileId,
    revisionId: opts.revisionId,
    keyEpoch: opts.keyEpoch,
  };
}

/** Full content encrypt path used by sync-core (decrypt path: envelopeDecrypt). */
export async function contentEnvelopeEncrypt(input: {
  plaintext: Uint8Array;
  key: Uint8Array;
  identity: { vaultId: string; fileId: string; revisionId: string; keyEpoch: number };
}): Promise<EncryptResult> {
  const nonce = randomNonce();
  const aad = encodeAad(contentAad(input.identity));
  const { ciphertext } = await aeadEncrypt({
    key: input.key,
    nonce,
    plaintext: input.plaintext,
    aad,
  });
  const envelope: Envelope = {
    protocol: 1,
    envelopeFormat: ENVELOPE_VERSION,
    cipher: "AES-256-GCM",
    nonceB64: toBase64(nonce),
    ciphertextB64: toBase64(ciphertext),
    integritySha256B64: toBase64(await sha256Async(ciphertext)),
    aadHint: {
      purpose: "vb.file.content.v1",
      vaultId: input.identity.vaultId,
      fileId: input.identity.fileId,
      keyEpoch: input.identity.keyEpoch,
    },
  };
  const payload = serializeEnvelope(envelope);
  return {
    envelope,
    payload,
    ciphertextBytes: payload.byteLength,
    ciphertextSha256B64: toBase64(await sha256Async(payload)),
    plaintextBytes: input.plaintext.byteLength,
  };
}

/** Full content decrypt path used by sync-core. */
export async function contentEnvelopeDecrypt(input: {
  payload: Uint8Array;
  key: Uint8Array;
  identity: { vaultId: string; fileId: string; revisionId: string; keyEpoch: number };
}): Promise<Uint8Array> {
  return envelopeDecrypt(deserializeEnvelope(input.payload), input.key, contentAad(input.identity));
}
