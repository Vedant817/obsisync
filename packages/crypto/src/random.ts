/**
 * Secure random helpers. Always use these — never `Math.random()` for keys or nonces.
 * Runs on WebCrypto, which is available on Obsidian desktop (Electron) and mobile WebView.
 */

export const KEY_SIZE_BYTES = 32 as const;

export function randomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n <= 0 || n > 1 << 20) {
    throw new RangeError(`randomBytes: invalid size ${String(n)}`);
  }
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function randomKey(): Uint8Array {
  return randomBytes(KEY_SIZE_BYTES);
}

/** 96-bit AES-GCM nonce. A fresh random nonce is generated per encryption op. */
export function randomNonce(): Uint8Array {
  return randomBytes(12);
}

/** Random URL-safe identifier with the given entropy bits (rounds up to bytes). */
export function randomId(bytes = 16): string {
  return toBase64Url(randomBytes(bytes));
}

export function toBase64Url(bytes: Uint8Array): string {
  const b64 = toBase64(bytes);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  return fromBase64(padded);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    throw new Error("invalid base64");
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for ( let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}
