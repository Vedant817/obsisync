import { argon2id } from "hash-wasm";
import type { KdfParams } from "./types.js";
import { randomBytes, toBase64, fromBase64 } from "./random.js";
import { CryptoError } from "./aead.js";

/**
 * Key derivation: Argon2id (memory-hard) implemented by the reviewed `hash-wasm`
 * WASM module — no custom primitives. Parameters are versioned and stored with
 * the wrapped key so parameters can move without breaking old vaults.
 *
 * Mobile budgets: defaults chosen to fit WebView memory limits (~64 Mi OS cap —
 * verified against spec §10.2); tests pin exact behavior.
 */
export const DEFAULT_KDF_PARAMS_TEMPLATE = {
  algo: "argon2id-left-1",
  timeCost: 2,
  memoryCostKiB: 16384, // 16 MiB
  parallelism: 1,
  hashLen: 32,
} as const;

/** Complete default params template with salt generated per-vault at setup. */
export function defaultKdfParams(): KdfParams {
  return { ...DEFAULT_KDF_PARAMS_TEMPLATE, saltB64: generateKdfSalt(16) };
}

export function generateKdfSalt(saltBytes = 16): string {
  return toBase64(randomBytes(saltBytes));
}

export async function deriveKek(
  passphrase: string,
  params: KdfParams,
): Promise<Uint8Array> {
  if (passphrase.length < 1) {
    throw new CryptoError("passphrase must not be empty");
  }
  const salt = fromBase64(params.saltB64);
  if (salt.length < 12) {
    throw new CryptoError("KDF salt too short (needs >= 96 bits)");
  }
  const out = await argon2id({
    password: passphrase,
    salt,
    iterations: params.timeCost,
    // hash-wasm takes memory in KiB
    memorySize: params.memoryCostKiB,
    parallelism: params.parallelism,
    hashLength: params.hashLen,
    outputType: "binary",
  });
  if (out.length !== params.hashLen) {
    throw new CryptoError(`Argon2id produced unexpected hash length ${out.length}`);
  }
  return out;
}
