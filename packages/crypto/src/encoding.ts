/** Byte/string encoding helpers shared across the crypto package. */

export function concatArrays(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) {
    total += p.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface AadParts {
  purpose: string;
  protocolVersion?: number;
  vaultId?: string;
  fileId?: string;
  revisionId?: string;
  keyEpoch?: number;
  /** Free-form trailing context, e.g. upload session id. */
  context?: string;
}

/**
 * Encode AAD parts into deterministic bytes. Order is fixed so both sides agree
 * (the wire format is private; only sender/receiver must agree, tamper-safety).
 *
 * Every field is length-prefixed to prevent ambiguity between boundaries.
 */
export function encodeAad(parts: AadParts): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [enc.encode("vb.aad.v1"), Uint8Array.of(0)];
  let present = 0;

  const push = (value: string | number | undefined) => {
    if (value === undefined) {
      return;
    }
    present += 1;
    const asText = String(value);
    const raw = enc.encode(asText);
    chunks.push(Uint8Array.of(raw.length & 0xff, raw.length >>> 8));
    chunks.push(raw);
  };

  push(parts.purpose);
  push(parts.protocolVersion ?? "");
  push(parts.vaultId ?? "");
  push(parts.fileId ?? "");
  push(parts.revisionId ?? "");
  push(parts.keyEpoch === undefined ? "" : String(parts.keyEpoch));
  push(parts.context ?? "");

  chunks[1] = Uint8Array.of(present);
  return concatArrays(chunks);
}

/** Universal JSON encoder with sorted keys for canonical hashing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value instanceof Uint8Array) {
    throw new Error("canonicalJson: encode Uint8Array to base64 before calling");
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
