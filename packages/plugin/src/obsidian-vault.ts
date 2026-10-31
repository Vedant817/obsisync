import { sha256HexBytes } from "@vaultbridge/crypto";
import type { LocalFileMeta, LocalVault } from "@vaultbridge/sync-core";
import { TFile, TFolder, type App, type Vault } from "obsidian";

/** Obsidian's own trash folder at the vault root. Deleted notes land here; it never syncs. */
const OBSIDIAN_TRASH = ".trash";

/**
 * Obsidian vault adapter.
 * `getFiles()` lists every path except the configuration folder and `.trash`,
 * so sync can see adds, edits, and deletes. Conflict names are repaired by the engine.
 */
export class ObsidianLocalVault implements LocalVault {
  /**
   * `beforeWrite` may take over a download (a note open in live editing) and
   * return false so the editor is not overwritten. File sync then sees the
   * live text on disk and uploads it as the later edit.
   */
  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    /** This plugin's folder, for safety snapshots. */
    private readonly pluginDir: string,
    private readonly beforeWrite?: (path: string, bytes: Uint8Array) => Promise<boolean>,
  ) {
    this.vault = app.vault;
  }

  async listFiles(): Promise<LocalFileMeta[]> {
    const out: LocalFileMeta[] = [];
    for (const file of this.vault.getFiles()) {
      if (excluded(file.path, this.vault.configDir)) {
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
    const existing = this.vault.getAbstractFileByPath(rel);
    if (this.beforeWrite && !(await this.beforeWrite(rel, bytes))) {
      return;
    }
    const body = copyBytes(bytes);
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
      // Follows the user's "Deleted files" preference (system trash, Obsidian
      // trash, or permanent), so a delete from another device is recoverable.
      await this.app.fileManager.trashFile(existing);
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
    const dest = `${this.pluginDir}/snapshots/${label}/${rel}`;
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

function excluded(rel: string, configDir: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  return (
    norm === configDir ||
    norm.startsWith(`${configDir}/`) ||
    norm === OBSIDIAN_TRASH ||
    norm.startsWith(`${OBSIDIAN_TRASH}/`)
  );
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
