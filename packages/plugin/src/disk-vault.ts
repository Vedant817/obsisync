import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256HexBytes } from "@vaultbridge/crypto";
import type { LocalFileMeta, LocalVault } from "@vaultbridge/sync-core";

/** Filesystem vault used to prove a sync cycle outside Obsidian. */
export class DiskVault implements LocalVault {
  constructor(private readonly root: string) {}

  async listFiles(): Promise<LocalFileMeta[]> {
    const out: LocalFileMeta[] = [];
    await this.walk(this.root, "", out);
    return out;
  }

  async readFile(rel: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(rel)));
  }

  async writeFile(rel: string, bytes: Uint8Array): Promise<void> {
    const abs = this.resolve(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  }

  async deleteFile(rel: string): Promise<void> {
    await rm(this.resolve(rel), { force: true });
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await stat(this.resolve(rel));
      return true;
    } catch {
      return false;
    }
  }

  async hashFile(rel: string): Promise<string | null> {
    try {
      return await sha256HexBytes(await this.readFile(rel));
    } catch {
      return null;
    }
  }

  async snapshot(rel: string, label: string): Promise<void> {
    if (!(await this.exists(rel))) {
      return;
    }
    const bytes = await this.readFile(rel);
    const dest = path.join(this.root, ".obsidian", "plugins", "vaultbridge", "snapshots", label, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }

  private async walk(dir: string, prefix: string, out: LocalFileMeta[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (excluded(rel)) {
        continue;
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(abs, rel, out);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const info = await stat(abs);
      out.push({ path: rel, size: info.size, mtimeMs: info.mtimeMs });
    }
  }

  private resolve(rel: string): string {
    const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.split("/").includes("..")) {
      throw new Error("path escapes the vault");
    }
    const abs = path.resolve(this.root, normalized);
    const rootAbs = path.resolve(this.root);
    const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
    if (abs !== rootAbs && !abs.startsWith(prefix)) {
      throw new Error("path escapes the vault");
    }
    return abs;
  }
}

function excluded(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  if (norm === ".obsidian" || norm.startsWith(".obsidian/")) {
    return true;
  }
  return norm.includes(".vb-conflict-");
}
