import { sha256HexBytes } from "@vaultbridge/crypto";
import type { LocalFileMeta, LocalVault } from "@vaultbridge/sync-core";
import { TFile, TFolder, type Vault } from "obsidian";

/**
 * Obsidian vault adapter.
 * `getFiles()` lists every path except `.obsidian` so sync can see adds, edits, and deletes.
 * Conflict names are repaired by the engine.
 */
export class ObsidianLocalVault implements LocalVault {
  constructor(private readonly vault: Vault) {}

  async listFiles(): Promise<LocalFileMeta[]> {
    const out: LocalFileMeta[] = [];
    for (const file of this.vault.getFiles()) {
      if (excluded(file.path)) {
        continue;
      }
      out.push({ path: file.path, size: file.stat.size, mtimeMs: file.stat.mtime });
    }
    return out;
  }

  async readFile(rel: string): Promise<Uint8Array> {
    const file = this.file(rel);
    return new Uint8Array(await this.vault.readBinary(file));
  }

  async writeFile(rel: string, bytes: Uint8Array): Promise<void> {
    const body = copyBytes(bytes);
    const existing = this.vault.getAbstractFileByPath(rel);
    if (existing instanceof TFile) {
      await this.vault.modifyBinary(existing, body);
      return;
    }
    await this.ensureFolder(rel);
    await this.vault.createBinary(rel, body);
  }

  async deleteFile(rel: string): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(rel);
    if (existing instanceof TFile) {
      await this.vault.delete(existing);
    }
  }

  async exists(rel: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(rel) instanceof TFile;
  }

  async hashFile(rel: string): Promise<string | null> {
    if (!(await this.exists(rel))) {
      return null;
    }
    return sha256HexBytes(await this.readFile(rel));
  }

  async snapshot(rel: string, label: string): Promise<void> {
    if (!(await this.exists(rel))) {
      return;
    }
    const bytes = await this.readFile(rel);
    const dest = `.obsidian/plugins/vaultbridge/snapshots/${label}/${rel}`;
    const folder = dest.slice(0, dest.lastIndexOf("/"));
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
    await adapter.writeBinary(dest, copyBytes(bytes));
  }

  private file(rel: string): TFile {
    const existing = this.vault.getAbstractFileByPath(rel);
    if (!(existing instanceof TFile)) {
      throw new Error(`missing vault file ${rel}`);
    }
    return existing;
  }

  private async ensureFolder(rel: string): Promise<void> {
    const slash = rel.lastIndexOf("/");
    if (slash <= 0) {
      return;
    }
    const folder = rel.slice(0, slash);
    const existing = this.vault.getAbstractFileByPath(folder);
    if (existing instanceof TFolder) {
      return;
    }
    await this.vault.createFolder(folder);
  }
}

function excluded(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  return norm === ".obsidian" || norm.startsWith(".obsidian/");
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
