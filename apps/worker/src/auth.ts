import type { D1DatabaseLike } from "./ports.js";
import { sha256Async } from "@vaultbridge/crypto";
import { VaultBridgeError } from "@vaultbridge/protocol";
import type { DeviceRow, VaultRow } from "./store.js";
import { getVaultRow, touchDeviceSeenStatement } from "./store.js";

/**
 * Device-scoped authorization:
 * - Token presented as `Authorization: Bearer vbd_<random>`; only its SHA-256
 *   hash is stored, so a DB dump cannot resurrect credentials.
 * - Every route resolves the device and enforces vault ownership + revocation.
 */
export interface AuthContext {
  vault: VaultRow;
  device: DeviceRow;
  /** true when the token came from this same device row (never expose). */
  tokenHash: string;
}

export async function hashSha256Hex(data: string): Promise<string> {
  const digest = await sha256Async(new TextEncoder().encode(data));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(
  db: D1DatabaseLike,
  request: Request,
): Promise<AuthContext> {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    throw new VaultBridgeError("UNAUTHENTICATED", "missing bearer token", {
      guidance: "Send the device token from pairing.",
    });
  }
  const token = header.slice(prefix.length).trim();
  if (token.length < 16 || token.length > 256) {
    throw new VaultBridgeError("UNAUTHENTICATED", "malformed token length");
  }
  const tokenHash = await hashSha256Hex(token);
  const row = await db.prepare("SELECT * FROM devices WHERE auth_token_hash = ?1").bind(tokenHash).all<DeviceRow>();
  let device: DeviceRow | null = row.success ? (row.results[0] ?? null) : null;
  if (!device) {
    throw new VaultBridgeError("UNAUTHENTICATED", "unknown device credential");
  }
  if (device.revoked_at !== null) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device access was revoked", {
      guidance: "Pair this device again from an authorized one.",
    });
  }
  const vault = await getVaultRow(db, device.vault_id);
  if (!vault) {
    throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing for device");
  }
  // best-effort last-seen; never blocks the request path
  try {
    await touchDeviceSeenStatement(db, device.device_id, new Date().toISOString()).run();
  } catch {
    /* ignore */
  }
  return { vault, device, tokenHash };
}

// ---------------------------------------------------------------------------
// Rate limiting — per-isolate sliding window; free-tier safety valve.
// ---------------------------------------------------------------------------

interface WindowEntry {
  hits: number[];
}

const buckets = new Map<string, WindowEntry>();

/** Defaults; tests override. */
export interface RateLimitOptions {
  /** Max requests across the window. */
  max: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 240, windowMs: 60_000 };

export function rateLimit(key: string, options: RateLimitOptions = DEFAULT_RATE_LIMIT): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = buckets.get(key) ?? { hits: [] as number[] };
  entry.hits = entry.hits.filter((t) => now - t < options.windowMs);
  entry.hits.push(now);
  buckets.set(key, entry);
  if (buckets.size > 50_000) {
    buckets.clear(); // isolate memory safety
  }
  if (entry.hits.length > options.max) {
    const oldestRemaining = entry.hits[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((options.windowMs - (now - oldestRemaining)) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientKey(request: Request, deviceHint?: string): string {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  return deviceHint ? `d:${deviceHint}` : `ip:${ip}`;
}
