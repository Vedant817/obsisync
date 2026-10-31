/**
 * In-memory R2 test double implementing the minimal R2BucketLike port.
 * Adds observability counters so cost/PUT-invariant tests can assert "0 PUTs".
 */
import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from "@vaultbridge/worker";

interface Stored {
  bytes: Uint8Array;
  uploadedAt: string;
  etag: string;
}

export class FakeR2 implements R2BucketLike {
  private readonly map = new Map<string, Stored>();
  /** Operation counters for cost tests (T01: zero PUTs on no-op sync). */
  stats = { puts: 0, gets: 0, deletes: 0, heads: 0, bytesStored: 0 };

  bytesForPrefix(prefix: string): number {
    let total = 0;
    for (const [key, v] of this.map) {
      if (key.startsWith(prefix)) {
        total += v.bytes.length;
      }
    }
    return total;
  }

  private snapshot(key: string): R2ObjectLike {
    const data = this.map.get(key)!;
    return { key, size: data.bytes.length, uploadedAt: data.uploadedAt, etag: data.etag };
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    this.stats.gets++;
    const data = this.map.get(key);
    if (!data) {
      return null;
    }
    const base = this.snapshot(key);
    const bytes = data.bytes.slice();
    return { ...base, bytes: () => Promise.resolve(bytes) };
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    this.stats.heads++;
    const data = this.map.get(key);
    return data ? this.snapshot(key) : null;
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { onlyIf?: { etagDoesNotMatch?: string } | string },
  ): Promise<R2ObjectLike | null> {
    this.stats.puts++;
    const existing = this.map.get(key);
    if (opts?.onlyIf) {
      // R2 semantics: precondition fails -> null, nothing written
      const currentEtag = existing?.etag ?? "";
      const condition = typeof opts.onlyIf === "string" ? opts.onlyIf : opts.onlyIf.etagDoesNotMatch;
      if (condition !== undefined && condition === currentEtag) {
        return null;
      }
    }
    const uploadedAt = new Date().toISOString();
    const etag = `${this.stats.puts}-${Math.random().toString(36).slice(2, 10)}`;
    const bytes = value.slice();
    this.map.set(key, { bytes, uploadedAt, etag });
    this.stats.bytesStored += bytes.length;
    return { key, size: bytes.length, uploadedAt, etag };
  }

  async delete(keyOrKeys: string | string[]): Promise<void> {
    const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
    for (const key of keys) {
      const data = this.map.get(key);
      if (data) {
        this.stats.bytesStored -= data.bytes.length;
      }
      this.map.delete(key);
    }
    this.stats.deletes++;
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: R2ObjectLike[] }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const keys: R2ObjectLike[] = [];
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(this.snapshot(key));
        if (keys.length >= limit) {
          break;
        }
      }
    }
    return { keys };
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Debugging aid in tests. */
  keys(): string[] {
    return [...this.map.keys()];
  }
}
