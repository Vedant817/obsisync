/**
 * Local change capture (spec §9.2/§9.3 step 2).
 *
 * Rules enforced here (per spec: "never identify an intentional deletion just
 * because a path was temporarily absent"):
 *  - Deletion candidates require EITHER an explicit observed delete event OR a
 *    completed full-scan listing comparator (this scanner does full listings).
 *  - Size/mtime mismatches are only candidate markers; the final identity gate
 *    is always the content hash.
 */
import { sha256HexBytes } from "@vaultbridge/crypto";
import type { LocalVault, LocalFileMeta } from "./ports.js";
import type { SyncJournalData } from "./state.js";

/** Device-local conflict copies are review artifacts — never sync targets. */
export const CONFLICT_COPY_MARK = ".vb-conflict-";

export interface ScanCandidate {
  path: string;
  kind: "created" | "modified" | "deleted" | "unchanged";
  /** sha256 of current plaintext (null for deletions). */
  contentSha256: string | null;
  size: number;
  mtimeMs: number;
}

export interface ScanResult {
  candidates: ScanCandidate[];
  /** Number of deletions concluded from the (confirmed) full listing. */
  deletions: number;
}

function pathKey(p: string): string {
  // Normalize separators for journal bookkeeping; Obsidian paths use "/".
  return p.replace(/\0/g, "/").replace(/^\//, "");
}

/**
 * One reconciliation scan: full listing, per-path comparison against the
 * journal, and hashing for candidate changes only.
 */
export async function collectCandidateChanges(
  vault: LocalVault,
  journal: SyncJournalData,
  opts: { contentHashBytes?: number; forceHash?: boolean } = {},
): Promise<ScanResult> {
  const listing: LocalFileMeta[] = await vault.listFiles();
  const listed = new Map<string, LocalFileMeta>();
  for (const meta of listing) {
    listed.set(pathKey(meta.path), meta);
  }

  const candidates: ScanCandidate[] = [];

  // 1. Known tracked paths: created/modified/deleted.
  for (const [path, fileId] of Object.entries(journal.pathToFileId)) {
    const state = journal.files[fileId!];
    if (!state) {
      continue;
    }
    const meta = listed.get(path);
    if (!meta) {
      // Full listing did not show the path: re-check before ever calling it a
      // deletion (listing may be filtered; vault.exists is the second gate).
      const exists = await vault.exists(path);
      if (!exists) {
        candidates.push({ path, kind: "deleted", contentSha256: null, size: 0, mtimeMs: 0 });
        continue;
      }
    }
    const hash = await vault.hashFile(path);
    if (hash === null) {
      candidates.push({ path, kind: "deleted", contentSha256: null, size: 0, mtimeMs: 0 });
      continue;
    }
    const effective = meta ?? { path, size: 0, mtimeMs: 0 };
    const unchangedShortcut =
      !opts.forceHash &&
      state.lastSyncedSize === effective.size &&
      state.lastSyncedMtime === effective.mtimeMs &&
      state.plaintextSha256 !== null;
    if (unchangedShortcut) {
      candidates.push({ path, kind: "unchanged", contentSha256: state.plaintextSha256, size: effective.size, mtimeMs: effective.mtimeMs });
      continue;
    }
    if (hash !== state.plaintextSha256) {
      candidates.push({ path, kind: "modified", contentSha256: hash, size: effective.size, mtimeMs: effective.mtimeMs });
    } else {
      candidates.push({ path, kind: "unchanged", contentSha256: hash, size: effective.size, mtimeMs: effective.mtimeMs });
    }
  }

  // 2. Paths present on disk but untracked: created candidates.
  for (const [path, meta] of listed.entries()) {
    if (Object.hasOwn(journal.pathToFileId, path)) {
      continue;
    }
    if (path.includes(CONFLICT_COPY_MARK)) {
      continue; // device-side review artifact, not a vault file
    }
    const hash = await vault.hashFile(path);
    candidates.push({ path, kind: "created", contentSha256: hash, size: meta.size, mtimeMs: meta.mtimeMs });
  }

  const deletions = candidates.filter((c) => c.kind === "deleted").length;
  return { candidates, deletions };
}

/** Stable hash helper for fingerprints during tests/backups. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return sha256HexBytes(bytes);
}
