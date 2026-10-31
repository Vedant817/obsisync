/**
 * Per-note live state on this device, in the plugin folder. It is the base
 * for folding offline edits in, and it carries updates that never reached the
 * server across a restart. Bounded: the oldest states are dropped first.
 */
import type { DataAdapter } from "obsidian";
import type { LiveStore } from "./live-editing.js";

const MAX_STATES = 500;

export class AdapterLiveStore implements LiveStore {
  private pruned = false;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly dir: string,
  ) {}

  private file(docId: string): string {
    return `${this.dir}/${docId}.bin`;
  }

  async has(docId: string): Promise<boolean> {
    return this.adapter.exists(this.file(docId));
  }

  async load(docId: string): Promise<Uint8Array | null> {
    const path = this.file(docId);
    if (!(await this.adapter.exists(path))) {
      return null;
    }
    try {
      return new Uint8Array(await this.adapter.readBinary(path));
    } catch {
      return null;
    }
  }

  async save(docId: string, state: Uint8Array): Promise<void> {
    if (!(await this.adapter.exists(this.dir))) {
      await this.adapter.mkdir(this.dir);
    }
    const copy = new ArrayBuffer(state.byteLength);
    new Uint8Array(copy).set(state);
    await this.adapter.writeBinary(this.file(docId), copy);
    if (!this.pruned) {
      this.pruned = true;
      await this.prune();
    }
  }

  private async prune(): Promise<void> {
    try {
      const listed = await this.adapter.list(this.dir);
      if (listed.files.length <= MAX_STATES) {
        return;
      }
      const stats = await Promise.all(
        listed.files.map(async (path) => ({ path, mtime: (await this.adapter.stat(path))?.mtime ?? 0 })),
      );
      stats.sort((a, b) => a.mtime - b.mtime);
      for (const old of stats.slice(0, stats.length - MAX_STATES)) {
        await this.adapter.remove(old.path);
      }
    } catch {
      /* pruning is housekeeping */
    }
  }
}
