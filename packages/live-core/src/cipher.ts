/**
 * Live payload sealing.
 *
 * - Document id: keyed PRF of the note path (HKDF over the live key). Stable on
 *   every device of the vault, meaningless to the server.
 * - Payload: base64url(nonce || AES-256-GCM(ciphertext)), AAD binds vault,
 *   document and kind, so a payload replayed into another note, vault, or
 *   channel fails to open.
 */
import {
  aeadDecrypt,
  aeadEncrypt,
  CryptoError,
  deriveLiveKey,
  fromBase64Url,
  hkdf,
  randomNonce,
  toBase64Url,
} from "@vaultbridge/crypto";

/** `u` update, `s` snapshot, `a` awareness (cursor). */
export type LiveSealKind = "u" | "s" | "a";

const enc = new TextEncoder();

export function normalizeLivePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
}

export class LiveCipher {
  private readonly ids = new Map<string, string>();

  private constructor(
    private readonly key: Uint8Array,
    readonly vaultId: string,
  ) {}

  static async fromVaultKey(vmk: Uint8Array, vaultId: string, keyEpoch = 1): Promise<LiveCipher> {
    return new LiveCipher(await deriveLiveKey(vmk, keyEpoch), vaultId);
  }

  /** Tests and tools that already hold a derived live key. */
  static fromLiveKey(key: Uint8Array, vaultId: string): LiveCipher {
    return new LiveCipher(key, vaultId);
  }

  async docId(path: string): Promise<string> {
    const norm = normalizeLivePath(path);
    const cached = this.ids.get(norm);
    if (cached) {
      return cached;
    }
    const id = toBase64Url(await hkdf(this.key, `vb/live/doc-id/v1/${this.vaultId}/${norm}`, 18));
    this.ids.set(norm, id);
    return id;
  }

  async seal(docId: string, kind: LiveSealKind, plaintext: Uint8Array): Promise<string> {
    const nonce = randomNonce();
    const { ciphertext } = await aeadEncrypt({ key: this.key, nonce, plaintext, aad: this.aad(docId, kind) });
    const out = new Uint8Array(nonce.length + ciphertext.length);
    out.set(nonce, 0);
    out.set(ciphertext, nonce.length);
    return toBase64Url(out);
  }

  /** Throws CryptoError when the payload was tampered with or belongs elsewhere. */
  async open(docId: string, kind: LiveSealKind, payload: string): Promise<Uint8Array> {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64Url(payload);
    } catch {
      throw new CryptoError("live payload is not base64url");
    }
    if (bytes.length < 12 + 16) {
      throw new CryptoError("live payload too short");
    }
    const { ciphertext } = await aeadDecrypt({
      key: this.key,
      nonce: bytes.subarray(0, 12),
      plaintext: bytes.subarray(12),
      aad: this.aad(docId, kind),
    });
    return ciphertext;
  }

  private aad(docId: string, kind: LiveSealKind): Uint8Array {
    return enc.encode(`vb-live-v1|${this.vaultId}|${docId}|${kind}`);
  }
}
