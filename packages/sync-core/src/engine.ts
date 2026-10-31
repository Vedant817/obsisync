/**
 * The sync engine: one per-device cycle exactly as spec §9.3 orders it —
 * validate → capture local → fetch remote delta → reconcile (never overwriting
 * dirty local) → push pending → acknowledge → report.
 *
 * Durability rule (spec §9.2): the journal is persisted BEFORE any destructive
 * or network action, and after every acknowledged outcome. A no-op cycle
 * issues zero content PUTs (T01); a tombstone commit issues no blob PUT.
 */
import {
  decryptManifest,
  contentEnvelopeDecrypt,
  contentEnvelopeEncrypt,
  encryptManifest,
  fromBase64,
  randomId,
  sha256HexBytes,
  toBase64,
  type RevisionManifest,
} from "@vaultbridge/crypto";
import type {
  ChangeEventWire,
  ChangesResponse,
  CommitRequest,
  FileId,
  RevisionMeta,
} from "@vaultbridge/protocol";
import { SyncJournal } from "./journal.js";
import { merge3 } from "./merge.js";
import {
  DEFAULT_CYCLE_BUDGET,
  DEFAULT_SYNC_CYCLE_OPTIONS,
  SyncTransportUnavailableError,
  type CycleBudget,
  type LocalVault,
  type SyncCycleOptions,
  type SyncTransport,
} from "./ports.js";
import { collectCandidateChanges, CONFLICT_COPY_MARK, type ScanCandidate } from "./scanner.js";
import type { FileState, PendingOperation, SyncJournalData, SyncStatus } from "./state.js";

export interface SyncEngineDeps {
  vault: LocalVault;
  transport: SyncTransport;
  journal: SyncJournal;
  vaultId: string;
  deviceId: string;
  /** Unwrapped vault material for this key epoch (device-only). */
  keyMaterial: { contentKey: Uint8Array; manifestKey: Uint8Array; keyEpoch: number };
  options?: SyncCycleOptions;
  now?: () => number;
}

export interface SyncCycleReport {
  started: boolean;
  pausedReason: string | null;
  status: SyncStatus;
  pulls: number;
  pushes: number;
  noAcksSkipped: number;
  conflicts: number;
  dataObjectPuts: number;
  errors: string[];
  cursor: number;
}

export interface SyncEngine {
  runCycle(cycleOptions?: SyncCycleOptions): Promise<SyncCycleReport>;
  status(): SyncStatus;
  pause(reason: string): Promise<void>;
  resume(): Promise<void>;
  stats(): SyncJournalData["stats"];
  unresolvedConflicts(): SyncJournalData["conflicts"][string][];
  /** Plugin UX resolves divergence (spec §9.6/§11); next cycle executes it. */
  resolveConflict(fileId: FileId, choice: "local" | "remote"): Promise<void>;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const options = { ...DEFAULT_SYNC_CYCLE_OPTIONS, ...deps.options };
  const now = deps.now ?? Date.now;
  if (!deps.journal.raw.deviceId) {
    deps.journal.raw.deviceId = deps.deviceId;
  }
  let currentStatus: SyncStatus = "READY";

  // ---------------------------------------------------------------------------
  // Cycle
  // ---------------------------------------------------------------------------

  async function runCycle(cycleOptions?: SyncCycleOptions): Promise<SyncCycleReport> {
    const opts: SyncCycleOptions = { ...options, ...cycleOptions };
    const budget: CycleBudget = {
      maxUploadsPerCycle: opts.budget?.maxUploadsPerCycle ?? DEFAULT_CYCLE_BUDGET.maxUploadsPerCycle,
      maxPendingForAutoRun: opts.budget?.maxPendingForAutoRun ?? DEFAULT_CYCLE_BUDGET.maxPendingForAutoRun,
    };
    const errors: string[] = [];
    let pulls = 0;
    let pushes = 0;
    let noAcksSkipped = 0;
    let conflicts = 0;
    let dataObjectPuts = 0;

    // Repair renamed conflict copies before anything else, including while paused.
    // Those names were showing up as the notes themselves.
    await foldConflictCopies();

    // 1. Validate: paused engines never start (spec §9.1 PAUSED state).
    if (deps.journal.raw.pausedReason) {
      currentStatus = "PAUSED";
      return {
        started: false,
        pausedReason: deps.journal.raw.pausedReason,
        status: currentStatus,
        pulls: 0, pushes: 0, noAcksSkipped: 0, conflicts: 0, dataObjectPuts: 0,
        errors: [],
        cursor: deps.journal.cursor,
      };
    }
    currentStatus = "SCANNING";

    // A device that lost most of its notes must download them again.
    // Scanning first would upload those gaps as deletes.
    await restoreMissingNotes();

    // 2. Capture local changes (full-scan reconciliation, deletion rules).
    const scan = await collectCandidateChanges(deps.vault, deps.journal.raw);
    mutateOnCapture(deps.journal, scan.candidates, now());
    await deps.journal.persist(); // durable BEFORE any network action

    // 3-4. Fetch + reconcile remote delta, page by page (never overwrite dirty).
    currentStatus = "RECONCILING";
    let after = deps.journal.cursor;
    for (let page = 0; page < 1000; page++) {
      let changes: ChangesResponse;
      try {
        changes = await deps.transport.fetchChanges(after, 200);
      } catch (err) {
        if (err instanceof SyncTransportUnavailableError) {
          // Degrade cleanly: durable cursor survives; next cycle resumes.
          deps.journal.pause(`unavailable:${err.reason}`);
        } else {
          errors.push(`fetch changes after ${after}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await deps.journal.persist();
        break;
      }
      let blocked = false;
      for (const event of changes.events) {
        const result = await reconcileRemoteEvent(event, { autoMerge: opts.autoMerge !== false });
        pulls += result.pulled;
        conflicts += result.conflicts;
        errors.push(...result.errors);
        if (result.blocked) {
          // This seq was not applied. Leave the cursor behind it so the next
          // cycle retries. Never jump to endCursor past a hole.
          blocked = true;
          break;
        }
        after = event.seq;
        deps.journal.setCursor(event.seq);
        await deps.journal.persist();
      }
      if (blocked || !changes.hasMore) {
        break;
      }
    }

    // 5. Push pending operations, oldest first, under budget + pause checks.
    currentStatus = "SYNCING";
    for (const pending of deps.journal.pendingList()) {
      if (deps.journal.pendingList().length > budget.maxPendingForAutoRun) {
        deps.journal.pause("bulk_pending_wave");
        break;
      }
      const pauseReason = opts.pauseRequested?.() ?? deps.journal.raw.pausedReason;
      if (pauseReason) {
        deps.journal.pause(pauseReason);
        break;
      }
      if (pushes >= budget.maxUploadsPerCycle) {
        deps.journal.pause("cycle_budget_exhausted");
        break;
      }
      try {
        const outcome = await pushPending(pending, {
          autoMerge: opts.autoMerge !== false,
          maxObjectBytes: opts.maxObjectBytes ?? DEFAULT_SYNC_CYCLE_OPTIONS.maxObjectBytes!,
          countsAsPut: () => {
            dataObjectPuts += 1;
          },
        });
        pushes += outcome.pushed;
        noAcksSkipped += outcome.skipped;
        conflicts += outcome.conflicts;
      } catch (err) {
        if (err instanceof SyncTransportUnavailableError) {
          // Stop pushing and persist the pause; pendings survive for the next run.
          deps.journal.pause(`unavailable:${err.reason}`);
          await deps.journal.persist();
          break;
        }
        errors.push(`push ${pending.operationId}: ${err instanceof Error ? err.message : String(err)}`);
        deps.journal.bumpPendingRetry(pending.operationId);
        await deps.journal.persist();
      }
    }

    // 6. Acknowledge + report (never claims up-to-date with unresolved work).
    const stats = deps.journal.raw.stats;
    deps.journal.bumpStats({
      cyclesRun: stats.cyclesRun + 1,
      lastCycleAt: now(),
      totalPushes: stats.totalPushes + pushes,
      totalPulls: stats.totalPulls + pulls,
      totalConflicts: stats.totalConflicts + conflicts,
      dataObjectPutsTotal: stats.dataObjectPutsTotal + dataObjectPuts,
      lastCyclePuts: dataObjectPuts,
    });
    await deps.journal.persist();
    if (deps.journal.unresolvedConflicts().length > 0) {
      currentStatus = "CONFLICT";
    } else if (deps.journal.raw.pausedReason) {
      currentStatus = "PAUSED";
    } else {
      currentStatus = "READY";
    }
    return {
      started: true,
      pausedReason: deps.journal.raw.pausedReason,
      status: currentStatus,
      cursor: deps.journal.cursor,
      pulls, pushes, noAcksSkipped, conflicts, dataObjectPuts, errors,
    };
  }

  // ---------------------------------------------------------------------------
  // Push pipeline
  // ---------------------------------------------------------------------------

  interface PushOutcome {
    pushed: number;
    skipped: number;
    conflicts: number;
  }

  /**
   * Push one pending operation per §13.3: content re-read and re-verified
   * (fingerprints may be stale), absolute no-op detection BEFORE the network,
   * durable stage checkpoints, and conflict collapse to `CONFLICT` records.
   */
  async function pushPending(
    pending: PendingOperation,
    env: { autoMerge: boolean; maxObjectBytes: number; countsAsPut: () => void },
  ): Promise<PushOutcome> {
    const file = deps.journal.getFile(pending.fileId);
    if (!file) {
      deps.journal.dropPending(pending.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 1, conflicts: 0 };
    }
    const openConflict = deps.journal.raw.conflicts[pending.fileId];
    if (openConflict && !openConflict.resolved) {
      return { pushed: 0, skipped: 1, conflicts: 0 };
    }

    const currentHash = await deps.vault.hashFile(file.localPath);
    const contentBytes = currentHash === null ? null : await deps.vault.readFile(file.localPath);
    const contentIsGone = contentBytes === null;

    // Absolute no-op: current plaintext identical to last synced hash.
    if (!contentIsGone && currentHash !== null && currentHash === file.plaintextSha256 && pending.action === "upsert") {
      deps.journal.dropPending(pending.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 1, conflicts: 0 };
    }

    // Same-operation dedupe: fingerprint update when content changed since capture.
    if (!contentIsGone && pending.action === "upsert" && currentHash !== pending.localContentFingerprint) {
      deps.journal.raw.pending[pending.operationId] = { ...pending, localContentFingerprint: currentHash! };
      await deps.journal.persist();
    }

    // A delete that has not left the device is cancelled when the bytes return.
    // Pushing it would tombstone a file the user just restored.
    if (pending.action === "delete" && !contentIsGone) {
      deps.journal.dropPending(pending.operationId);
      const revived: PendingOperation = blankPin({
        operationId: pending.pinnedRevisionId ? `op_${randomId(16)}` : pending.operationId,
        fileId: pending.fileId,
        baseRevisionId: pending.baseRevisionId ?? file.lastAppliedRevisionId,
        action: "upsert",
        localContentFingerprint: currentHash!,
        createdAt: pending.createdAt,
        stage: "captured",
        retryCount: pending.retryCount,
      });
      deps.journal.putPending(revived);
      deps.journal.updateFile(pending.fileId, { deletedLocally: false });
      await deps.journal.persist();
      pending = revived;
    }

    // Content that came back on an already-acked tombstone is an upsert.
    // deletedLocally alone must not turn that upsert into another delete.
    if (pending.action === "delete" || (contentIsGone && file.deletedLocally)) {
      return pushDelete(pending, file);
    }
    if (contentIsGone) {
      // Content vanished between capture and push but nothing confirms intent.
      // Conservative: do NOT synthesize a delete; wait for the next full scan.
      deps.journal.bumpPendingRetry(pending.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 0, conflicts: 0 };
    }

    // ------- content push (upsert) -------
    const remoteHead = await deps.transport.getFileHead(pending.fileId);
    const remoteHeadId = remoteHead?.headRevisionId ?? null;
    // The pinned attempt is already the server head (lost response). Ack it
    // when the bytes still match. If the user edited since, rebase onto that
    // head instead of opening a conflict against our own revision.
    if (pending.pinnedRevisionId && remoteHeadId === pending.pinnedRevisionId) {
      if (pending.pinnedPlaintextSha256 === currentHash) {
        await acknowledgeCommit(pending, file.localPath, currentHash, {
          receipt: { revisionId: remoteHeadId, seq: null },
        });
        return { pushed: 0, skipped: 1, conflicts: 0 };
      }
      const fresh = retireOperation(pending, currentHash!);
      deps.journal.raw.pending[fresh.operationId] = { ...fresh, baseRevisionId: remoteHeadId };
      deps.journal.updateFile(pending.fileId, {
        lastAppliedRevisionId: remoteHeadId,
        plaintextSha256: pending.pinnedPlaintextSha256 ?? null,
      });
      await deps.journal.persist();
      pending = deps.journal.raw.pending[fresh.operationId]!;
    }
    const localBase = pending.baseRevisionId ?? file.lastAppliedRevisionId;
    const remoteIsAdvanced = remoteHeadId !== null && remoteHeadId !== localBase;
    if (remoteIsAdvanced && remoteHead?.isDeleted) {
      // Local edit vs remote delete: preserve both (never discard local work).
      deps.journal.addConflict({
        fileId: pending.fileId,
        otherPath: null,
        baseRevisionId: localBase,
        remoteHeadRevisionId: remoteHeadId,
        origin: "edit_vs_delete",
        createdAt: now(),
        resolved: false,
      });
      deps.journal.bumpPendingRetry(pending.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 0, conflicts: 1 };
    }

    let outgoingBytes: Uint8Array = contentBytes!;
    let outgoingHash: string = currentHash!;
    let outgoingBase: string | null = localBase;

    if (remoteIsAdvanced) {
      if (env.autoMerge && mergeable(file.localPath)) {
        const merged = await attemptMerge(pending.fileId, file, remoteHeadId!, outgoingBytes);
        if (merged.status === "merged") {
          outgoingBytes = merged.bytes;
          outgoingHash = await sha256HexBytes(merged.bytes);
          outgoingBase = remoteHeadId; // merged revision spans remote; CAS onto it
        } else if (merged.remoteBytes !== undefined) {
          await keepOneNote(file.localPath, contentBytes!, merged.remoteBytes, {
            fileId: pending.fileId,
            remoteRevisionId: remoteHeadId,
            baseRevisionId: localBase,
            origin: "remote_changed",
          });
          deps.journal.bumpPendingRetry(pending.operationId);
          await deps.journal.persist();
          return { pushed: 0, skipped: 0, conflicts: 1 };
        }
      } else {
        const remoteBytes = await fetchRemoteContent(pending.fileId, remoteHeadId!);
        if (remoteBytes !== null && contentBytes !== null) {
          await keepOneNote(file.localPath, contentBytes, remoteBytes, {
            fileId: pending.fileId,
            remoteRevisionId: remoteHeadId,
            baseRevisionId: localBase,
            origin: "remote_changed",
          });
        }
        deps.journal.bumpPendingRetry(pending.operationId);
        await deps.journal.persist();
        return { pushed: 0, skipped: 0, conflicts: 1 };
      }
    }

    if (outgoingBytes.byteLength > env.maxObjectBytes) {
      deps.journal.pause(`object_too_large:${file.localPath}`);
      await deps.journal.persist();
      return { pushed: 0, skipped: 0, conflicts: 0 };
    }

    return pushContent(pending, file, outgoingBytes, outgoingHash, outgoingBase, env.countsAsPut);
  }

  /** Upsert push: encrypt → reserve → PUT → commit → ack (durable stages). */
  async function pushContent(
    pending: PendingOperation,
    file: FileState,
    bytes: Uint8Array,
    plaintextHash: string,
    baseRevisionId: string | null,
    countsAsPut: () => void,
  ): Promise<PushOutcome> {
    let current = pending;
    if (current.pinnedPlaintextSha256 && current.pinnedPlaintextSha256 !== plaintextHash) {
      // The pinned ciphertext is for older bytes. That operation id may already
      // be burned on the server, so the new bytes travel under a fresh id.
      current = retireOperation(current, plaintextHash);
      await deps.journal.persist();
    }
    if (!isPinnedAttempt(current)) {
      const revisionId = randomId(16);
      const uploadId = randomId(16);
      const encrypted = await contentEnvelopeEncrypt({
        plaintext: bytes,
        key: deps.keyMaterial.contentKey,
        identity: { vaultId: deps.vaultId, fileId: pending.fileId, revisionId, keyEpoch: deps.keyMaterial.keyEpoch },
      });
      const payloadSha = await sha256HexBytes(encrypted.payload);
      const manifest = await encryptManifest(
        { path: file.localPath, sizeBytes: bytes.byteLength, contentTypeHint: mimeOf(file.localPath) },
        deps.keyMaterial.manifestKey,
        { vaultId: deps.vaultId, fileId: pending.fileId, revisionId, keyEpoch: deps.keyMaterial.keyEpoch },
      );
      current = {
        ...current,
        stage: "encrypted",
        pinnedRevisionId: revisionId,
        pinnedUploadId: uploadId,
        pinnedPlaintextSha256: plaintextHash,
        pinnedCiphertextSha256: payloadSha,
        pinnedCiphertextB64: toBase64(encrypted.payload),
        pinnedManifestObjectId: manifest.manifestObjectId,
        pinnedManifestB64: toBase64(manifest.payload),
        stagedUploadId: uploadId,
      };
      // Durable before any RPC: a lost response must replay this exact attempt.
      deps.journal.raw.pending[current.operationId] = current;
      await deps.journal.persist();
    }
    const payload = fromBase64(current.pinnedCiphertextB64!);
    const reserve = await deps.transport.reserveUpload({
      uploadId: current.pinnedUploadId!,
      expectedBytes: payload.byteLength,
      expectedSha256: current.pinnedCiphertextSha256!,
    });
    await deps.transport.uploadObject(reserve.uploadId, payload);
    countsAsPut();

    current = { ...current, stage: "uploaded", stagedUploadId: reserve.uploadId };
    deps.journal.raw.pending[current.operationId] = current;
    await deps.journal.persist();

    const commitRequest: CommitRequest = {
      operationId: current.operationId,
      fileId: current.fileId,
      parentRevisionId: baseRevisionId,
      newRevisionId: current.pinnedRevisionId!,
      keyEpoch: deps.keyMaterial.keyEpoch,
      isTombstone: false,
      stagingObjectId: current.pinnedUploadId!,
      manifestObjectId: current.pinnedManifestObjectId!,
      manifestPayloadB64: current.pinnedManifestB64!,
      ciphertextSha256: current.pinnedCiphertextSha256!,
      ciphertextBytes: payload.byteLength,
      clientProtocolVersion: 1,
    };
    const response = await deps.transport.commit(commitRequest);
    if (response.result === "CONFLICT") {
      deps.journal.addConflict({
        fileId: current.fileId,
        otherPath: null,
        baseRevisionId: baseRevisionId,
        remoteHeadRevisionId: response.conflict?.currentHead.headRevisionId ?? null,
        origin: "remote_changed",
        createdAt: now(),
        resolved: false,
      });
      deps.journal.bumpPendingRetry(current.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 0, conflicts: 1 };
    }
    await acknowledgeCommit(current, file.localPath, plaintextHash, response);
    return { pushed: 1, skipped: 0, conflicts: 0 };
  }

  /** Delete push: no blob PUT ever (T04/T10), manifest-only commit. */
  async function pushDelete(pending: PendingOperation, file: FileState): Promise<PushOutcome> {
    const fileHead = await deps.transport.getFileHead(pending.fileId);
    if (fileHead?.isDeleted) {
      // Remote already deleted: acknowledge without a commit (no-op).
      deps.journal.updateFile(pending.fileId, {
        deletedLocally: true,
        lastAppliedRevisionId: fileHead.headRevisionId ?? file.lastAppliedRevisionId,
        plaintextSha256: null,
        pendingOperationId: undefined,
      });
      deps.journal.dropPending(pending.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 1, conflicts: 0 };
    }

    let current = pending;
    if (!current.pinnedRevisionId || !current.pinnedManifestB64 || !current.pinnedManifestObjectId || !current.pinnedCiphertextSha256 || !current.pinnedUploadId) {
      const revisionId = randomId(16);
      const uploadId = randomId(16);
      const manifest = await encryptManifest(
        { path: file.localPath, sizeBytes: 0, contentTypeHint: mimeOf(file.localPath) },
        deps.keyMaterial.manifestKey,
        { vaultId: deps.vaultId, fileId: pending.fileId, revisionId, keyEpoch: deps.keyMaterial.keyEpoch },
      );
      current = {
        ...current,
        stage: "encrypted",
        pinnedRevisionId: revisionId,
        pinnedUploadId: uploadId,
        pinnedPlaintextSha256: "deleted",
        pinnedCiphertextSha256: await sha256HexBytes(manifest.payload),
        pinnedManifestObjectId: manifest.manifestObjectId,
        pinnedManifestB64: toBase64(manifest.payload),
      };
      deps.journal.raw.pending[current.operationId] = current;
      await deps.journal.persist();
    }

    const commitRequest: CommitRequest = {
      operationId: current.operationId,
      fileId: current.fileId,
      parentRevisionId: current.baseRevisionId ?? file.lastAppliedRevisionId,
      newRevisionId: current.pinnedRevisionId!,
      keyEpoch: deps.keyMaterial.keyEpoch,
      isTombstone: true,
      stagingObjectId: current.pinnedUploadId!,
      manifestObjectId: current.pinnedManifestObjectId!,
      manifestPayloadB64: current.pinnedManifestB64!,
      ciphertextSha256: current.pinnedCiphertextSha256!,
      ciphertextBytes: 0,
      clientProtocolVersion: 1,
    };
    const response = await deps.transport.commit(commitRequest);
    if (response.result === "CONFLICT") {
      deps.journal.addConflict({
        fileId: pending.fileId,
        otherPath: null,
        baseRevisionId: commitRequest.parentRevisionId,
        remoteHeadRevisionId: response.conflict?.currentHead.headRevisionId ?? null,
        origin: "delete_vs_edit",
        createdAt: now(),
        resolved: false,
      });
      deps.journal.bumpPendingRetry(current.operationId);
      await deps.journal.persist();
      return { pushed: 0, skipped: 0, conflicts: 1 };
    }
    await acknowledgeCommit(current, file.localPath, null, response);
    return { pushed: 1, skipped: 0, conflicts: 0 };
  }

  async function acknowledgeCommit(
    pending: PendingOperation,
    _path: string,
    contentHash: string | null,
    response: { receipt?: { revisionId: string; seq: number | null } | null },
  ): Promise<void> {
    // Do not move the change-feed cursor here. receipt.seq can sit past events
    // that were inserted after we fetched and before this ack, and setCursor
    // never moves backward. The feed consumes those events in order.
    const patch: Partial<FileState> = {
      lastAppliedRevisionId: response.receipt?.revisionId ?? undefined,
      pendingOperationId: undefined,
    };
    if (contentHash === null) {
      patch.deletedLocally = true;
      patch.plaintextSha256 = null;
    } else {
      patch.plaintextSha256 = contentHash;
      patch.deletedLocally = false;
    }
    deps.journal.updateFile(pending.fileId, patch);
    deps.journal.dropPending(pending.operationId);
    await deps.journal.persist();
  }

  /**
   * Three-way merge of a divergent file (spec §9.6 row 3 + merge rules):
   * base = the revision local edits forked from (authentic, server-fetched),
   * remote = server head. Only UTF-8 Markdown-ish text merges.
   */
  async function attemptMerge(
    fileId: string,
    file: FileState,
    remoteRevisionId: string,
    localBytes: Uint8Array,
  ): Promise<{ status: "merged"; bytes: Uint8Array } | { status: "needsReview" | "unsupported"; remoteBytes?: Uint8Array }> {
    const remoteMeta = await deps.transport.getRevision(remoteRevisionId);
    const baseMeta = file.lastAppliedRevisionId ? await deps.transport.getRevision(file.lastAppliedRevisionId) : null;
    if (!remoteMeta || !remoteMeta.blobObjectId || !remoteMeta.manifestObjectId) {
      return { status: "unsupported" };
    }
    const remoteBytes = await fetchRemoteContent(fileId, remoteMeta.revisionId);
    if (remoteBytes === null) {
      return { status: "unsupported" };
    }
    if (!baseMeta || !baseMeta.blobObjectId) {
      return { status: "needsReview", remoteBytes };
    }
    const baseBytes = await fetchRemoteContent(fileId, baseMeta.revisionId);
    if (baseBytes === null) {
      return { status: "needsReview", remoteBytes };
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let baseText: string;
    let localText: string;
    let remoteText: string;
    try {
      baseText = decoder.decode(baseBytes);
      localText = decoder.decode(localBytes);
      remoteText = decoder.decode(remoteBytes);
    } catch {
      return { status: "needsReview", remoteBytes };
    }
    const merged = merge3(baseText, localText, remoteText);
    if (merged.kind === "merged" && merged.text !== null) {
      return { status: "merged", bytes: new TextEncoder().encode(merged.text) };
    }
    return { status: "needsReview", remoteBytes };
  }

  interface ReconcileResult {
    pulled: number;
    conflicts: number;
    errors: string[];
    /** Cursor must stay behind this event so a later cycle can retry it. */
    blocked?: boolean;
  }

  async function reconcileRemoteEvent(
    event: ChangeEventWire,
    env: { autoMerge: boolean },
  ): Promise<ReconcileResult> {
    const empty: ReconcileResult = { pulled: 0, conflicts: 0, errors: [] };
    let rev = event.revision;
    if (!rev) {
      const loaded = await deps.transport.getRevision(event.revisionId);
      if (!loaded) {
        return { pulled: 0, conflicts: 0, errors: [`missing revision ${event.revisionId}`], blocked: true };
      }
      rev = loaded;
    }
    if (rev.deviceId === deps.deviceId) {
      return adoptOwnEcho(event, rev);
    }
    let file = deps.journal.getFile(event.fileId);
    if (file?.supersededBy && event.eventType !== "tombstone" && !rev.isTombstone) {
      const survivorId = file.supersededBy;
      const survivor = deps.journal.getFile(survivorId);
      const remoteBytes = await fetchRemoteContent(event.fileId, rev.revisionId);
      const desired = await manifestPath(event.fileId, rev, file.localPath);
      const survivorOnDisk = survivor ? await deps.vault.exists(survivor.localPath) : false;
      let wroteMerge = false;
      if (survivor && survivorOnDisk && remoteBytes !== null) {
        const localBytes = await deps.vault.readFile(survivor.localPath).catch(() => null);
        if (localBytes !== null && !sameBytes(localBytes, remoteBytes)) {
          await keepOneNote(survivor.localPath, localBytes, remoteBytes, {
            fileId: survivor.fileId,
            remoteRevisionId: rev.revisionId,
            baseRevisionId: survivor.lastAppliedRevisionId,
            origin: "remote_changed",
          });
          wroteMerge = true;
        }
      }
      if (remoteBytes !== null) {
        // This id is the live server copy. It has to own the real path, or a
        // tombstone of the old id deletes the only note on disk.
        if (deps.journal.fileIdForPath(desired) === survivorId) {
          deps.journal.releasePath(desired, survivorId);
        }
        if (survivor) {
          deps.journal.updateFile(survivorId, { deletedLocally: true, supersededBy: event.fileId });
        }
        const stale = deps.journal.fileIdForPath(desired);
        if (stale && stale !== event.fileId && !(await deps.vault.exists(desired))) {
          deps.journal.releasePath(desired, stale);
        }
        if (!wroteMerge) {
          const current = await deps.vault.readFile(desired).catch(() => null);
          if (current === null || !sameBytes(current, remoteBytes)) {
            await deps.vault.writeFile(desired, remoteBytes);
          }
        }
        const stored = await deps.vault.readFile(desired).catch(() => null);
        deps.journal.updateFile(event.fileId, {
          localPath: desired,
          deletedLocally: false,
          supersededBy: undefined,
          lastAppliedRevisionId: rev.revisionId,
          plaintextSha256: stored ? await sha256HexBytes(stored) : await sha256HexBytes(remoteBytes),
        });
      } else {
        deps.journal.foldAway(event.fileId, survivorId, rev.revisionId);
      }
      await deps.journal.persist();
      return { pulled: remoteBytes === null ? 0 : 1, conflicts: 0, errors: [] };
    }

    if (!file) {
      if (event.eventType === "tombstone") {
        return empty;
      }
      try {
        await pullRevisionContent(event.fileId, rev);
        return { pulled: 1, conflicts: 0, errors: [] };
      } catch (err) {
        return { pulled: 0, conflicts: 0, errors: [`pull ${event.revisionId}: ${err instanceof Error ? err.message : String(err)}`], blocked: true };
      }
    }

    const localDirty = !!file.pendingOperationId || (await isContentDirty(file));

    if (event.eventType === "tombstone") {
      if (localDirty) {
        // Edit-vs-delete: preserve local content + remote stays tombstoned.
        deps.journal.addConflict({
          fileId: event.fileId,
          otherPath: null,
          baseRevisionId: file.lastAppliedRevisionId,
          remoteHeadRevisionId: rev.revisionId,
          origin: "edit_vs_delete",
          createdAt: now(),
          resolved: false,
        });
        await deps.journal.persist();
        return { pulled: 0, conflicts: 1, errors: [] };
      }
      // A folded conflict id can still name the real note. Deleting that path
      // would erase the note the other file id is keeping.
      const owner = deps.journal.fileIdForPath(file.localPath);
      const keepPath = Boolean(file.supersededBy) || (owner !== null && owner !== event.fileId);
      if (!keepPath) {
        await deps.vault.snapshot(file.localPath, "remote-delete");
        await safeDeleteLocal(file.localPath);
      }
      deps.journal.updateFile(event.fileId, {
        deletedLocally: true,
        lastAppliedRevisionId: rev.revisionId,
        plaintextSha256: null,
      });
      await deps.journal.persist();
      return { pulled: 0, conflicts: 0, errors: [] };
    }

    if (localDirty) {
      // Divergence while local pending: try auto-merge (same fileId), else
      // preserve both with a remote conflict copy (spec §9.6 row 3).
      const currentBytes = await deps.vault.readFile(file.localPath).catch(() => null);
      if (currentBytes !== null && env.autoMerge && mergeable(file.localPath)) {
        const merged = await attemptMerge(event.fileId, file, rev.revisionId, currentBytes);
        if (merged.status === "merged") {
          await deps.vault.writeFile(file.localPath, merged.bytes);
          const mergedHash = await sha256HexBytes(merged.bytes);
          const pendingId = file.pendingOperationId;
          if (pendingId && deps.journal.raw.pending[pendingId]) {
            // Refresh the open pending op to carry the merged bytes with the
            // remote head as its CAS base. Do NOT mark the file "applied" here:
            // that would make pushPending treat the merged content as an
            // absolute no-op and silently drop the merge from the server.
            deps.journal.raw.pending[pendingId] = {
              ...deps.journal.raw.pending[pendingId]!,
              localContentFingerprint: mergedHash,
              baseRevisionId: rev.revisionId,
            };
            await deps.journal.persist();
            return { pulled: 0, conflicts: 0, errors: [] };
          }
        }
      }
      const remoteBytes = await fetchRemoteContent(event.fileId, rev.revisionId);
      if (remoteBytes === null) {
        return { pulled: 0, conflicts: 0, errors: [`missing remote object for ${rev.revisionId}`], blocked: true };
      }
      if (currentBytes === null) {
        await deps.vault.writeFile(file.localPath, remoteBytes);
        deps.journal.addConflict({
          fileId: event.fileId,
          otherPath: null,
          baseRevisionId: file.lastAppliedRevisionId,
          remoteHeadRevisionId: rev.revisionId,
          origin: "delete_vs_edit",
          createdAt: now(),
          resolved: false,
          remoteText: decodeUtf8(remoteBytes) ?? undefined,
        });
        await deps.journal.persist();
        return { pulled: 0, conflicts: 1, errors: [] };
      }
      await keepOneNote(file.localPath, currentBytes, remoteBytes, {
        fileId: event.fileId,
        remoteRevisionId: rev.revisionId,
        baseRevisionId: file.lastAppliedRevisionId,
        origin: "remote_changed",
      });
      await deps.journal.persist();
      return { pulled: 0, conflicts: 1, errors: [] };
    }

    // Clean local: apply remote (write THEN journal — crash-safe ordering).
    try {
      await applyRemoteRevision(event.fileId, rev, file);
      return { pulled: 1, conflicts: 0, errors: [] };
    } catch (err) {
      return {
        pulled: 0,
        conflicts: 0,
        errors: [`apply ${event.revisionId}: ${err instanceof Error ? err.message : String(err)}`],
        blocked: true,
      };
    }
  }

  /**
   * Our own change-feed row. A lost commit response leaves the pending op open;
   * ignoring the echo (because the device id matches) would skip the ack forever.
   * Matching plaintext acknowledges the server revision. Diverged local bytes
   * keep their pending op, rebased onto that revision.
   */
  async function adoptOwnEcho(event: ChangeEventWire, rev: RevisionMeta): Promise<ReconcileResult> {
    const ok: ReconcileResult = { pulled: 0, conflicts: 0, errors: [] };
    const file = deps.journal.getFile(event.fileId);
    if (!file || file.lastAppliedRevisionId === rev.revisionId) {
      return ok;
    }
    const pending = file.pendingOperationId ? deps.journal.raw.pending[file.pendingOperationId] : undefined;
    if (rev.isTombstone || event.eventType === "tombstone") {
      const localHash = await deps.vault.hashFile(file.localPath);
      if (localHash === null) {
        deps.journal.updateFile(event.fileId, {
          deletedLocally: true,
          lastAppliedRevisionId: rev.revisionId,
          plaintextSha256: null,
          pendingOperationId: undefined,
        });
        if (pending) {
          deps.journal.dropPending(pending.operationId);
        }
        await deps.journal.persist();
        return ok;
      }
      deps.journal.updateFile(event.fileId, {
        deletedLocally: false,
        lastAppliedRevisionId: rev.revisionId,
        plaintextSha256: null,
      });
      if (pending) {
        deps.journal.dropPending(pending.operationId);
      }
      deps.journal.putPending({
        operationId: `op_${randomId(16)}`,
        fileId: event.fileId,
        baseRevisionId: rev.revisionId,
        action: "upsert",
        localContentFingerprint: localHash,
        createdAt: now(),
        stage: "captured",
        retryCount: 0,
      });
      await deps.journal.persist();
      return ok;
    }
    let remoteBytes: Uint8Array;
    try {
      const got = await fetchRemoteContent(event.fileId, rev.revisionId);
      if (got === null) {
        return { pulled: 0, conflicts: 0, errors: [`missing remote object for ${rev.revisionId}`], blocked: true };
      }
      remoteBytes = got;
    } catch (err) {
      return {
        pulled: 0,
        conflicts: 0,
        errors: [`echo ${rev.revisionId}: ${err instanceof Error ? err.message : String(err)}`],
        blocked: true,
      };
    }
    const remoteHash = await sha256HexBytes(remoteBytes);
    const localHash = await deps.vault.hashFile(file.localPath);
    if (localHash !== null && localHash === remoteHash) {
      deps.journal.updateFile(event.fileId, {
        lastAppliedRevisionId: rev.revisionId,
        plaintextSha256: remoteHash,
        deletedLocally: false,
        pendingOperationId: undefined,
      });
      if (pending) {
        deps.journal.dropPending(pending.operationId);
      }
      await deps.journal.persist();
      return ok;
    }
    deps.journal.updateFile(event.fileId, {
      lastAppliedRevisionId: rev.revisionId,
      plaintextSha256: remoteHash,
      deletedLocally: localHash === null,
    });
    if (pending) {
      deps.journal.dropPending(pending.operationId);
    }
    if (localHash === null) {
      deps.journal.putPending({
        operationId: `op_${randomId(16)}`,
        fileId: event.fileId,
        baseRevisionId: rev.revisionId,
        action: "delete",
        localContentFingerprint: "deleted",
        createdAt: now(),
        stage: "captured",
        retryCount: 0,
      });
    } else {
      deps.journal.putPending({
        operationId: `op_${randomId(16)}`,
        fileId: event.fileId,
        baseRevisionId: rev.revisionId,
        action: "upsert",
        localContentFingerprint: localHash,
        createdAt: now(),
        stage: "captured",
        retryCount: 0,
      });
    }
    await deps.journal.persist();
    return ok;
  }

  function retireOperation(pending: PendingOperation, fingerprint: string): PendingOperation {
    deps.journal.dropPending(pending.operationId);
    const fresh: PendingOperation = blankPin({
      ...pending,
      operationId: `op_${randomId(16)}`,
      localContentFingerprint: fingerprint,
      stage: "captured",
      retryCount: 0,
    });
    deps.journal.putPending(fresh);
    return fresh;
  }

  async function isContentDirty(file: FileState): Promise<boolean> {
    const hash = await deps.vault.hashFile(file.localPath);
    if (hash === null) {
      return !file.deletedLocally;
    }
    if (file.plaintextSha256 === null) {
      return true;
    }
    return hash !== file.plaintextSha256;
  }

  async function pullRevisionContent(fileId: string, rev: RevisionMeta): Promise<void> {
    if (!rev.blobObjectId || !rev.manifestObjectId) {
      throw new Error("revision missing object ids");
    }
    const manifestBytes = await deps.transport.getObject(rev.manifestObjectId);
    if (manifestBytes === null) {
      throw new Error("manifest object missing on server");
    }
    const manifest = await decryptManifest(manifestBytes, deps.keyMaterial.manifestKey, {
      vaultId: deps.vaultId, fileId, revisionId: rev.revisionId, keyEpoch: rev.keyEpoch,
    });
    const content = await fetchRemoteContent(fileId, rev.revisionId);
    if (content === null) {
      throw new Error("blob object missing on server");
    }
    const desired = normalizeLocalPath(manifest.path);
    const remoteHash = await sha256HexBytes(content);
    const owner = deps.journal.fileIdForPath(desired);
    if (owner && owner !== fileId) {
      const localHash = await deps.vault.hashFile(desired);
      const localBytes = localHash === null ? null : await deps.vault.readFile(desired);
      if (localHash !== null && localHash === remoteHash) {
        // The note is already on disk from a fresh scan. Keep the server id
        // instead of writing a second copy beside it.
        deps.journal.forgetFile(owner);
        deps.journal.trackFile({
          fileId,
          localPath: desired,
          lastAppliedRevisionId: rev.revisionId,
          plaintextSha256: remoteHash,
          deletedLocally: false,
          lastSyncedSize: manifest.sizeBytes,
        });
        await deps.journal.persist();
        return;
      }
      if (localBytes !== null) {
        await keepOneNote(desired, localBytes, content, {
          fileId: owner,
          remoteRevisionId: rev.revisionId,
          baseRevisionId: deps.journal.getFile(owner)?.lastAppliedRevisionId ?? null,
          origin: "remote_changed",
        });
        deps.journal.foldAway(fileId, owner, rev.revisionId);
        await deps.journal.persist();
        return;
      }
      // The journal still names this path, but the note is gone. The incoming
      // id is the copy that should be written back.
      deps.journal.forgetFile(owner);
    }
    const safePath = claimPath(fileId, desired, rev.revisionId);
    await deps.vault.writeFile(safePath, content);
    deps.journal.trackFile({
      fileId,
      localPath: safePath,
      lastAppliedRevisionId: rev.revisionId,
      plaintextSha256: await sha256HexBytes(content),
      deletedLocally: false,
      lastSyncedSize: manifest.sizeBytes,
    });
    await deps.journal.persist();
  }

  /**
   * Put both versions in the note that already has this path. The file list
   * keeps one name. Keep mine / Keep theirs rewrite that same note.
   */
  async function keepOneNote(
    path: string,
    localBytes: Uint8Array,
    remoteBytes: Uint8Array,
    meta: {
      fileId: string;
      remoteRevisionId: string | null;
      baseRevisionId: string | null;
      origin: "remote_changed" | "delete_vs_edit";
    },
  ): Promise<void> {
    if (sameBytes(localBytes, remoteBytes)) {
      return;
    }
    const localText = mergeable(path) ? decodeUtf8(localBytes) : null;
    const remoteText = mergeable(path) ? decodeUtf8(remoteBytes) : null;
    if (localText === null || remoteText === null) {
      deps.journal.addConflict({
        fileId: meta.fileId,
        otherPath: null,
        baseRevisionId: meta.baseRevisionId,
        remoteHeadRevisionId: meta.remoteRevisionId,
        origin: meta.origin,
        createdAt: now(),
        resolved: false,
      });
      return;
    }
    const combined = oneDocument(localText, remoteText);
    if (combined !== localText) {
      await deps.vault.writeFile(path, new TextEncoder().encode(combined));
    }
    const marked = combined !== localText && combined !== remoteText;
    if (!marked) {
      return;
    }
    deps.journal.addConflict({
      fileId: meta.fileId,
      otherPath: null,
      localText,
      remoteText,
      baseRevisionId: meta.baseRevisionId,
      remoteHeadRevisionId: meta.remoteRevisionId,
      origin: meta.origin,
      createdAt: now(),
      resolved: false,
    });
  }

  /**
   * The server still has a note this device does not. Download it before the
   * scanner can treat the gap as a delete.
   * One or two notes this journal still calls present are a normal local delete.
   * A note the journal already gave up on, or that lives under another file id,
   * is downloaded even when the rest of the vault looks complete.
   */
  async function restoreMissingNotes(): Promise<void> {
    const listed = await deps.vault.listFiles();
    const onDisk = new Set(
      listed
        .map((meta) => meta.path.replace(/\\/g, "/"))
        .filter((path) => !path.includes(CONFLICT_COPY_MARK)),
    );
    const liveJournal = Object.values(deps.journal.raw.files).filter(
      (file) => !file.deletedLocally && !file.supersededBy,
    ).length;
    if (deps.journal.cursor === 0 && liveJournal === 0) {
      return;
    }

    const latest = new Map<string, ChangeEventWire>();
    let after = 0;
    for (let page = 0; page < 1000; page++) {
      const batch = await deps.transport.fetchChanges(after, 200);
      if (batch.events.length === 0) {
        break;
      }
      for (const event of batch.events) {
        latest.set(event.fileId, event);
        after = event.seq;
      }
      if (!batch.hasMore) {
        break;
      }
    }

    const pendingDeletes = new Set(
      Object.values(deps.journal.raw.pending)
        .filter((op) => op.action === "delete")
        .map((op) => op.fileId),
    );
    const fresh: ChangeEventWire[] = [];
    const lost: ChangeEventWire[] = [];
    for (const event of latest.values()) {
      if (event.eventType === "tombstone" || event.revision?.isTombstone) {
        continue;
      }
      if (pendingDeletes.has(event.fileId)) {
        continue;
      }
      const known = deps.journal.getFile(event.fileId);
      const journalPath = known?.localPath.replace(/\\/g, "/");
      const journalPathIsReal = Boolean(
        journalPath && !journalPath.includes(CONFLICT_COPY_MARK) && !known?.supersededBy && !known?.deletedLocally,
      );
      if (journalPathIsReal && journalPath && onDisk.has(journalPath)) {
        continue;
      }
      let rev = event.revision;
      if (!rev) {
        const loaded = await deps.transport.getRevision(event.revisionId);
        if (!loaded || loaded.isTombstone) {
          continue;
        }
        rev = loaded;
        event.revision = rev;
      }
      const path = await manifestPath(event.fileId, rev, journalPath ?? "");
      if (!path || onDisk.has(path)) {
        continue;
      }
      const ownerId = deps.journal.fileIdForPath(path);
      const owner = ownerId ? deps.journal.getFile(ownerId) : null;
      const freshDelete = Boolean(
        owner && ownerId === event.fileId && !owner.deletedLocally && !owner.supersededBy && !owner.pendingOperationId,
      );
      if (freshDelete) {
        fresh.push(event);
      } else {
        lost.push(event);
      }
    }
    const todo = fresh.length >= 3 ? [...lost, ...fresh] : lost;
    if (todo.length === 0) {
      return;
    }

    for (const event of todo) {
      const rev = event.revision;
      if (!rev || rev.isTombstone) {
        continue;
      }
      const known = deps.journal.getFile(event.fileId);
      if (known?.pendingOperationId) {
        deps.journal.dropPending(known.pendingOperationId);
      }
      if (known) {
        deps.journal.updateFile(event.fileId, { deletedLocally: false, supersededBy: undefined });
      }
      await pullRevisionContent(event.fileId, rev);
    }
    await deps.journal.persist();
  }

  async function manifestPath(fileId: string, rev: RevisionMeta, fallback: string): Promise<string> {
    if (!rev.manifestObjectId) {
      return fallback;
    }
    const manifestBytes = await deps.transport.getObject(rev.manifestObjectId);
    if (!manifestBytes) {
      return fallback;
    }
    const manifest = await decryptManifest(manifestBytes, deps.keyMaterial.manifestKey, {
      vaultId: deps.vaultId,
      fileId,
      revisionId: rev.revisionId,
      keyEpoch: rev.keyEpoch,
    });
    return normalizeLocalPath(manifest.path);
  }

  /** Rename leftover `.vb-conflict-` files back to the note they belong to. */
  async function foldConflictCopies(): Promise<void> {
    const listed = await deps.vault.listFiles();
    for (const meta of listed) {
      const canonical = canonicalPathFromConflict(meta.path);
      if (!canonical || canonical === meta.path) {
        continue;
      }
      const extra = await deps.vault.readFile(meta.path).catch(() => null);
      if (extra === null) {
        continue;
      }
      const canonicalExists = await deps.vault.exists(canonical);
      if (!canonicalExists) {
        await deps.vault.writeFile(canonical, extra);
      } else {
        const current = await deps.vault.readFile(canonical);
        if (!sameBytes(current, extra)) {
          const localText = decodeUtf8(current);
          const remoteText = decodeUtf8(extra);
          const combined = localText !== null && remoteText !== null
            ? new TextEncoder().encode(oneDocument(localText, remoteText))
            : current;
          if (!sameBytes(current, combined)) {
            await deps.vault.writeFile(canonical, combined);
            const owner = deps.journal.fileIdForPath(canonical);
            if (owner) {
              deps.journal.updateFile(owner, { plaintextSha256: null });
            }
          }
        }
      }
      await deps.vault.deleteFile(meta.path);
      const parked = deps.journal.fileIdForPath(meta.path);
      if (!parked) {
        continue;
      }
      const owner = deps.journal.fileIdForPath(canonical);
      if (owner && owner !== parked) {
        deps.journal.foldAway(parked, owner, deps.journal.getFile(parked)?.lastAppliedRevisionId ?? null);
      } else {
        deps.journal.updateFile(parked, { localPath: canonical, deletedLocally: false });
      }
    }
  }

  /** One manifest path, one note. A taken path is merged by the caller, never renamed. */
  function claimPath(fileId: string, desired: string, _disambiguator: string): string {
    void fileId;
    return desired;
  }

  async function applyRemoteRevision(fileId: string, rev: RevisionMeta, file: FileState): Promise<void> {
    if (!rev.manifestObjectId || !rev.blobObjectId) {
      throw new Error("revision missing object ids");
    }
    const manifestBytes = await deps.transport.getObject(rev.manifestObjectId);
    if (manifestBytes === null) {
      throw new Error("manifest object missing on server");
    }
    const manifest = await decryptManifest(manifestBytes, deps.keyMaterial.manifestKey, {
      vaultId: deps.vaultId, fileId, revisionId: rev.revisionId, keyEpoch: rev.keyEpoch,
    });
    const content = await fetchRemoteContent(fileId, rev.revisionId);
    if (content === null) {
      throw new Error("blob object missing on server");
    }
    const desired = normalizeLocalPath(manifest.path);
    const pathOwner = deps.journal.fileIdForPath(desired);
    if (pathOwner && pathOwner !== fileId) {
      const localBytes = await deps.vault.readFile(desired).catch(() => null);
      if (localBytes !== null) {
        await keepOneNote(desired, localBytes, content, {
          fileId: pathOwner,
          remoteRevisionId: rev.revisionId,
          baseRevisionId: deps.journal.getFile(pathOwner)?.lastAppliedRevisionId ?? null,
          origin: "remote_changed",
        });
        deps.journal.foldAway(fileId, pathOwner, rev.revisionId);
        await deps.journal.persist();
        return;
      }
    }
    const safePath = claimPath(fileId, desired, rev.revisionId);
    if (safePath !== file.localPath) {
      // Remote rename onto a free path, or a disambiguated path when the
      // manifest path already belongs to a different fileId (spec §9.7).
      await deps.vault.snapshot(file.localPath, safePath === desired ? "remote-rename" : "path-collision");
      await deps.vault.writeFile(safePath, content);
      if (deps.journal.fileIdForPath(file.localPath) === fileId) {
        await safeDeleteLocal(file.localPath);
      }
      deps.journal.updateFile(fileId, {
        localPath: safePath,
        lastAppliedRevisionId: rev.revisionId,
        plaintextSha256: await sha256HexBytes(content),
        lastSyncedSize: manifest.sizeBytes,
        deletedLocally: false,
      });
      await deps.journal.persist();
      return;
    }
    await deps.vault.snapshot(file.localPath, "remote-apply");
    await deps.vault.writeFile(file.localPath, content);
    deps.journal.updateFile(fileId, {
      lastAppliedRevisionId: rev.revisionId,
      plaintextSha256: await sha256HexBytes(content),
      lastSyncedSize: manifest.sizeBytes,
      deletedLocally: false,
    });
    await deps.journal.persist();
  }

  async function fetchRemoteContent(fileId: string, revisionId: string): Promise<Uint8Array | null> {
    const meta = await deps.transport.getRevision(revisionId);
    if (!meta || !meta.blobObjectId) {
      return null;
    }
    const bytes = await deps.transport.getObject(meta.blobObjectId);
    if (bytes === null) {
      return null;
    }
    return contentEnvelopeDecrypt({
      payload: bytes,
      key: deps.keyMaterial.contentKey,
      identity: { vaultId: deps.vaultId, fileId, revisionId, keyEpoch: meta.keyEpoch },
    });
  }

  async function safeDeleteLocal(path: string): Promise<void> {
    if (await deps.vault.exists(path)) {
      await deps.vault.deleteFile(path);
    }
  }

  /**
   * Conflict resolution for the plugin UX (spec §9.6/§11).
   *  - "local": rebase the open pending operation onto the remote head so the
   *    next cycle CAS-pushes on top of it (even over a tombstone = recreate).
   *  - "remote": re-apply the remote head locally, deleting when it is a
   *    tombstone, and drop the local pending as stale.
   * Both clear the conflict record; the next cycle executes the resolution.
   */
  async function resolveConflict(fileId: FileId, choice: "local" | "remote"): Promise<void> {
    const file = deps.journal.getFile(fileId);
    const record = deps.journal.raw.conflicts[fileId];
    if (!file || !record || record.resolved) {
      return;
    }
    if (choice === "local") {
      if (record.origin === "delete_vs_edit") {
        await safeDeleteLocal(file.localPath);
        deps.journal.updateFile(fileId, { deletedLocally: true, plaintextSha256: null });
        deps.journal.resolveConflict(fileId);
        await deps.journal.persist();
        return;
      }
      if (record.localText !== undefined) {
        await deps.vault.writeFile(file.localPath, new TextEncoder().encode(record.localText));
      }
      const pendingId = file.pendingOperationId;
      if (pendingId && deps.journal.raw.pending[pendingId]) {
        deps.journal.raw.pending[pendingId] = {
          ...deps.journal.raw.pending[pendingId]!,
          baseRevisionId: record.remoteHeadRevisionId,
        };
      }
      deps.journal.updateFile(fileId, { deletedLocally: false });
      deps.journal.resolveConflict(fileId);
      await deps.journal.persist();
      return;
    }
    // choice === "remote": mirror the remote head onto this device.
    const head = await deps.transport.getFileHead(fileId);
    const headRevId = record.remoteHeadRevisionId ?? head?.headRevisionId ?? null;
    const rev = headRevId ? await deps.transport.getRevision(headRevId) : null;
    if (!rev || rev.isTombstone) {
      await deps.vault.snapshot(file.localPath, "resolve-remote-delete");
      await safeDeleteLocal(file.localPath);
      deps.journal.updateFile(fileId, {
        deletedLocally: true,
        plaintextSha256: null,
        lastAppliedRevisionId: rev?.revisionId ?? file.lastAppliedRevisionId,
        pendingOperationId: undefined,
      });
      if (file.pendingOperationId) {
        deps.journal.dropPending(file.pendingOperationId);
      }
      deps.journal.resolveConflict(fileId);
      await deps.journal.persist();
      return;
    }
    if (!rev.manifestObjectId || !rev.blobObjectId) {
      return; // content unreachable right now; leave the conflict for a later attempt
    }
    await applyRemoteRevision(fileId, rev, file);
    if (file.pendingOperationId) {
      deps.journal.dropPending(file.pendingOperationId);
    }
    deps.journal.resolveConflict(fileId);
    await deps.journal.persist();
  }

  return {
    runCycle,
    status(): SyncStatus {
      return currentStatus;
    },
    async pause(reason: string): Promise<void> {
      deps.journal.pause(reason);
      await deps.journal.persist();
    },
    async resume(): Promise<void> {
      deps.journal.resume();
      await deps.journal.persist();
    },
    stats(): SyncJournalData["stats"] {
      return deps.journal.raw.stats;
    },
    unresolvedConflicts(): SyncJournalData["conflicts"][string][] {
      return deps.journal.unresolvedConflicts();
    },
    resolveConflict,
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function mimeOf(path: string): RevisionManifest["contentTypeHint"] {
  if (path.endsWith(".md")) {
    return "text/markdown";
  }
  if (path.endsWith(".txt")) {
    return "text/plain";
  }
  return "binary";
}

function mergeable(path: string): boolean {
  return path.endsWith(".md");
}

export function canonicalPathFromConflict(path: string): string | null {
  const norm = path.replace(/\\/g, "/");
  const mark = norm.lastIndexOf(CONFLICT_COPY_MARK);
  if (mark <= 0) {
    return null;
  }
  try {
    return normalizeLocalPath(norm.slice(0, mark));
  } catch {
    return null;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Both edits, one note. A later Keep mine / Keep theirs picks a side. */
export function oneDocument(local: string, remote: string): string {
  if (local === remote || local.includes(remote)) {
    return local;
  }
  if (remote.includes(local)) {
    return remote;
  }
  return [
    "This device",
    local,
    "---",
    "Other device",
    remote,
    "",
  ].join("\n");
}

export function conflictCopyPath(path: string, revisionId: string): string {
  // Revision ids are an open string on the wire (length 8–64). Never splice
  // them into a path raw: a prefix of `/../../ab` would escape the vault.
  const suffix = revisionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).padEnd(8, "0");
  let base = "note.md";
  try {
    base = normalizeLocalPath(path);
  } catch {
    base = "note.md";
  }
  return normalizeLocalPath(`${base}${CONFLICT_COPY_MARK}${suffix}.md`);
}

function isPinnedAttempt(pending: PendingOperation): boolean {
  return Boolean(
    pending.pinnedRevisionId &&
      pending.pinnedUploadId &&
      pending.pinnedCiphertextSha256 &&
      pending.pinnedCiphertextB64 &&
      pending.pinnedManifestObjectId &&
      pending.pinnedManifestB64,
  );
}

function blankPin(pending: PendingOperation): PendingOperation {
  return {
    ...pending,
    pinnedRevisionId: undefined,
    pinnedUploadId: undefined,
    pinnedPlaintextSha256: undefined,
    pinnedCiphertextSha256: undefined,
    pinnedCiphertextB64: undefined,
    pinnedManifestObjectId: undefined,
    pinnedManifestB64: undefined,
    stagedUploadId: undefined,
  };
}

/** Spec §9.7 path safety: reject traversal, absolute paths, control chars. */
export function normalizeLocalPath(raw: string): string {
  if (/^[/\\]/.test(raw) || /^[A-Za-z]:/.test(raw)) {
    throw new Error("absolute path from manifest");
  }
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new Error("unsafe empty or traversing path from manifest");
  }
  const normalized = parts.join("/");
  if (/[\u0000-\u001f]/.test(normalized)) {
    throw new Error("unsafe control character in path");
  }
  if (new TextEncoder().encode(normalized).byteLength > 255) {
    throw new Error("path exceeds portable byte length");
  }
  return normalized;
}

/**
 * Capture-step journal mutation: create/modify/delete candidates become
 * FileStates + PendingOperations with durable fingerprints and dedup.
 */
function mutateOnCapture(journal: SyncJournal, candidates: ScanCandidate[], at: number): void {
  for (const candidate of candidates) {
    if (candidate.kind === "unchanged") {
      continue;
    }
    const existingId = journal.fileIdForPath(candidate.path);
    const fileId = existingId ?? randomId(16);

    if (candidate.kind === "deleted") {
      if (!existingId) {
        continue; // untracked path disappeared: NOT a deletion (spec rule)
      }
      const already = journal.getFile(fileId)!;
      // Absence after a tombstone we already applied is the synced state.
      // Re-queueing a delete would fight a later remote recreate in the same cycle.
      if (already.deletedLocally && !already.pendingOperationId) {
        continue;
      }
      journal.updateFile(fileId, { deletedLocally: true });
      if (!journal.getFile(fileId)!.pendingOperationId) {
        journal.putPending({
          operationId: `op_${randomId(16)}`,
          fileId,
          baseRevisionId: journal.getFile(fileId)?.lastAppliedRevisionId ?? null,
          action: "delete",
          localContentFingerprint: "deleted",
          createdAt: at,
          stage: "captured",
          retryCount: 0,
        });
      }
      continue;
    }

    const isNew = existingId === null;
    if (isNew) {
      // plaintextSha256 stays null until the revision is acknowledged: the
      // last-synced hash of a never-synced file is unknown, and pushPending's
      // absolute no-op gate relies on that to actually push new content.
      journal.trackFile({
        fileId,
        localPath: candidate.path,
        lastAppliedRevisionId: null,
        plaintextSha256: null,
        deletedLocally: false,
      });
    } else if (journal.getFile(fileId)!.deletedLocally) {
      // Same file id came back on disk after a tombstone: this is a recreate.
      journal.updateFile(fileId, { deletedLocally: false });
    }
    // Skip putting a second pending op when one is already open for the file.
    const file = journal.getFile(fileId)!;
    if (file.pendingOperationId) {
      // refresh the fingerprint so the push re-reads current content
      deps_pendingRefresh(journal, file.pendingOperationId, candidate.contentSha256 ?? file.plaintextSha256 ?? "");
      continue;
    }
    journal.putPending({
      operationId: `op_${randomId(16)}`,
      fileId,
      baseRevisionId: file.lastAppliedRevisionId,
      action: "upsert",
      localContentFingerprint: candidate.contentSha256 ?? file.plaintextSha256 ?? "",
      createdAt: at,
      stage: "captured",
      retryCount: 0,
    });
  }
}

function deps_pendingRefresh(journal: SyncJournal, operationId: string, fingerprint: string): void {
  const pending = journal.raw.pending[operationId];
  if (!pending) {
    return;
  }
  if (pending.action === "delete" && fingerprint !== "deleted") {
    const nextId = pending.pinnedRevisionId ? `op_${randomId(16)}` : pending.operationId;
    if (nextId !== pending.operationId) {
      delete journal.raw.pending[pending.operationId];
    }
    journal.raw.pending[nextId] = blankPin({
      ...pending,
      operationId: nextId,
      action: "upsert",
      localContentFingerprint: fingerprint,
      stage: "captured",
    });
    const file = journal.getFile(pending.fileId);
    if (file) {
      journal.updateFile(pending.fileId, { pendingOperationId: nextId, deletedLocally: false });
    }
    return;
  }
  if (pending.stage === "captured") {
    journal.raw.pending[operationId] = { ...pending, localContentFingerprint: fingerprint };
  }
}
