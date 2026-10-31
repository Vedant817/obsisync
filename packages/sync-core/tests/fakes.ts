/**
 * In-memory platform fakes for sync-core tests: a deterministic local vault
 * and a fake server implementing the SyncTransport port with CAS semantics.
 */
import { sha256HexBytes, randomId, toBase64, fromBase64, contentEnvelopeEncrypt, encryptManifest } from "@vaultbridge/crypto";
import type { ChangeEventWire, CommitRequest, CommitResponse, ReserveUploadRequest, ReserveUploadResponse, RevisionMeta } from "@vaultbridge/protocol";
import { SyncTransportUnavailableError, type JournalPersistence, type LocalFileMeta, type LocalVault, type SyncTransport } from "../src/ports.js";
import type { SyncJournalData } from "../src/state.js";

// ---------------------------------------------------------------------------
// FakeVault
// ---------------------------------------------------------------------------

export class FakeVault implements LocalVault {
  private clock = 1;
  files = new Map<string, { bytes: Uint8Array; mtime: number }>();
  snapshots: string[] = [];

  async listFiles(): Promise<LocalFileMeta[]> {
    return [...this.files.entries()].map(([path, f]) => ({ path, size: f.bytes.length, mtimeMs: f.mtime }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) {
      throw new Error(`noread:${path}`);
    }
    return f.bytes;
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, { bytes, mtime: ++this.clock });
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async hashFile(path: string): Promise<string | null> {
    const f = this.files.get(path);
    return f !== undefined ? await sha256HexBytes(f.bytes) : null;
  }

  async snapshot(path: string, label: string): Promise<void> {
    this.snapshots.push(`${label}:${path}`);
  }
}

// ---------------------------------------------------------------------------
// FakeServer: CAS commit semantics for up to N devices through one store.
// ---------------------------------------------------------------------------

export class FakeServerTransport implements SyncTransport {
  vaultId: string;
  /** The device this transport belongs to (used when the ENGINE commits). */
  deviceId: string;
  files = new Map<string, { head: string | null; isDeleted: boolean }>();
  revisions = new Map<string, RevisionMeta>();
  objects = new Map<string, Uint8Array>();
  events: Array<{ seq: number; event: ChangeEventWire }> = [];
  knownOps = new Map<string, { revisionId: string; sha: string }>();
  uploadPuts = 0;
  commits = 0;
  nextSeq = 1;
  /** Apply the commit, then throw, as if the response never reached the device. */
  loseNextCommitResponse = false;
  /** Runs after the engine has already fetched, immediately before its commit. */
  beforeNextCommit: (() => Promise<void>) | null = null;
  /** Key material shared by all test devices (VMK-derived). */
  keys: { contentKey: Uint8Array; manifestKey: Uint8Array; keyEpoch: number };

  constructor(vaultId: string, deviceId: string, keys: { contentKey: Uint8Array; manifestKey: Uint8Array; keyEpoch: number }) {
    this.vaultId = vaultId;
    this.deviceId = deviceId;
    this.keys = keys;
  }

  async health(): Promise<{ status: number }> {
    return { status: 200 };
  }

  async fetchChanges(after: number, limit: number): Promise<{ events: ChangeEventWire[]; endCursor: number; hasMore: boolean; protocolVersion: number }> {
    const page = this.events.filter((e) => e.seq > after).slice(0, limit);
    const endCursor = page.length > 0 ? page[page.length - 1]!.seq : after;
    return {
      events: page.map((e) => e.event),
      endCursor,
      hasMore: this.events.some((e) => e.seq > endCursor),
      protocolVersion: 1,
    };
  }

  async getFileHead(fileId: string): Promise<{ fileId: string; headRevisionId: string | null; isDeleted: boolean; lastEventSeq: number } | null> {
    const f = this.files.get(fileId);
    if (!f) {
      return null;
    }
    return { fileId, headRevisionId: f.head, isDeleted: f.isDeleted, lastEventSeq: this.nextSeq - 1 };
  }

  async getRevision(revisionId: string): Promise<RevisionMeta | null> {
    return this.revisions.get(revisionId) ?? null;
  }

  async reserveUpload(request: ReserveUploadRequest): Promise<ReserveUploadResponse> {
    return { uploadId: request.uploadId, stagingObjectId: request.uploadId, expiresAt: new Date().toISOString() };
  }

  async uploadObject(uploadId: string, bytes: Uint8Array): Promise<void> {
    this.uploadPuts += 1;
    this.objects.set(uploadId, bytes);
  }

  async commit(request: CommitRequest): Promise<CommitResponse> {
    if (this.beforeNextCommit) {
      const hook = this.beforeNextCommit;
      this.beforeNextCommit = null;
      await hook();
    }
    const response = await this.applyCommit(request, this.deviceId);
    if (this.loseNextCommitResponse) {
      this.loseNextCommitResponse = false;
      throw new SyncTransportUnavailableError("network_failure");
    }
    return response;
  }

  /**
   * CAS apply shared by the engine transport and the "other device" simulator.
   * `authorDeviceId` lands in the stored revision meta (feed readers use it to
   * recognize their own echoes).
   */
  async applyCommit(request: CommitRequest, authorDeviceId: string): Promise<CommitResponse> {
    this.commits += 1;
    const known = this.knownOps.get(request.operationId);
    if (known) {
      if (known.sha !== request.ciphertextSha256) {
        throw new Error("operation id reused for different content");
      }
      const seq = this.events.find((e) => e.event.revisionId === known.revisionId)?.seq ?? null;
      return { result: "ALREADY_COMMITTED", receipt: { operationId: request.operationId, revisionId: known.revisionId, seq } };
    }
    const file = this.files.get(request.fileId) ?? { head: null as string | null, isDeleted: false };
    if ((request.parentRevisionId ?? null) !== file.head) {
      return { result: "CONFLICT", conflict: { currentHead: this.headOf(request.fileId), currentRevision: null } };
    }
    const revisionId = request.newRevisionId;
    const meta: RevisionMeta = {
      revisionId,
      parentRevisionId: request.parentRevisionId,
      keyEpoch: request.keyEpoch,
      isTombstone: request.isTombstone,
      ciphertextSha256: request.ciphertextSha256,
      ciphertextBytes: request.ciphertextBytes,
      blobObjectId: request.isTombstone ? null : request.stagingObjectId,
      manifestObjectId: request.manifestObjectId,
      deviceId: authorDeviceId,
      createdAt: new Date().toISOString(),
    };
    this.revisions.set(revisionId, meta);
    // Manifest bytes are stored by the worker (R2) — mirror that here.
    this.objects.set(request.manifestObjectId, fromBase64(request.manifestPayloadB64));
    this.files.set(request.fileId, { head: revisionId, isDeleted: request.isTombstone });
    const seq = this.nextSeq++;
    const event: ChangeEventWire = {
      seq,
      vaultId: this.vaultId,
      fileId: request.fileId,
      revisionId,
      eventType: request.isTombstone ? "tombstone" : "commit",
      createdAt: meta.createdAt,
      revision: meta,
    };
    this.events.push({ seq, event });
    this.knownOps.set(request.operationId, { revisionId, sha: request.ciphertextSha256 });
    return { result: "COMMITTED", receipt: { operationId: request.operationId, revisionId, seq } };
  }

  async getObject(objectId: string): Promise<Uint8Array | null> {
    return this.objects.get(objectId) ?? null;
  }

  async usage(): Promise<{ storageEstimateBytes: number; objectCount: number; revisionCount: number; deviceCount: number; historyRetentionDays: number; counters: { dataObjectWritesToday: number; dataObjectReadsToday: number; uploadBytesToday: number; workerRequestsToday: number; d1WritesToday: number; dateUtc: string } }> {
    return {
      storageEstimateBytes: 0,
      objectCount: 0,
      revisionCount: this.revisions.size,
      deviceCount: 1,
      historyRetentionDays: 3650,
      counters: { dataObjectWritesToday: 0, dataObjectReadsToday: 0, uploadBytesToday: 0, workerRequestsToday: 0, d1WritesToday: 0, dateUtc: "2026-01-01" },
    };
  }

  private headOf(fileId: string): { fileId: string; headRevisionId: string | null; isDeleted: boolean; lastEventSeq: number } {
    const f = this.files.get(fileId);
    return { fileId, headRevisionId: f?.head ?? null, isDeleted: f?.isDeleted ?? false, lastEventSeq: this.nextSeq - 1 };
  }

  // ---- simulator actions for "another device" ----

  /** Another device writes a content revision for the same vault/file. */
  async otherDeviceWrite(
    deviceId: string,
    fileId: string,
    localPath: string,
    text: string,
    revisionId = randomId(16),
  ): Promise<{ revisionId: string }> {
    const bytes = new TextEncoder().encode(text);
    const content = await contentEnvelopeEncrypt({
      plaintext: bytes,
      key: this.keys.contentKey,
      identity: { vaultId: this.vaultId, fileId, revisionId, keyEpoch: this.keys.keyEpoch },
    });
    const uploadId = randomId(16);
    await this.uploadObject(uploadId, content.payload);
    const manifestRes = await encryptManifest(
      { path: localPath, sizeBytes: bytes.byteLength, contentTypeHint: localPath.endsWith(".md") ? "text/markdown" : "binary" },
      this.keys.manifestKey,
      { vaultId: this.vaultId, fileId, revisionId, keyEpoch: this.keys.keyEpoch },
    );
    const head = this.files.get(fileId)?.head ?? null;
    const response = await this.applyCommit(
      {
        operationId: `foreign_${randomId(16)}`,
        fileId,
        parentRevisionId: head,
        newRevisionId: revisionId,
        keyEpoch: this.keys.keyEpoch,
        isTombstone: false,
        stagingObjectId: uploadId,
        manifestObjectId: manifestRes.manifestObjectId,
        manifestPayloadB64: toBase64(manifestRes.payload),
        ciphertextSha256: await sha256HexBytes(content.payload),
        ciphertextBytes: content.payload.byteLength,
        clientProtocolVersion: 1,
      },
      deviceId,
    );
    if (response.result !== "COMMITTED") {
      throw new Error(`otherDeviceWrite failed: ${response.result}`);
    }
    return { revisionId };
  }

  /** Another device tombstones the file. */
  async otherDeviceTombstone(deviceId: string, fileId: string, localPath: string): Promise<{ revisionId: string }> {
    const revisionId = randomId(16);
    const manifestRes = await encryptManifest({ path: localPath, sizeBytes: 0 }, this.keys.manifestKey, {
      vaultId: this.vaultId, fileId, revisionId, keyEpoch: this.keys.keyEpoch,
    });
    const head = this.files.get(fileId)?.head ?? null;
    const response = await this.applyCommit(
      {
        operationId: `foreign_${randomId(16)}`,
        fileId,
        parentRevisionId: head,
        newRevisionId: revisionId,
        keyEpoch: this.keys.keyEpoch,
        isTombstone: true,
        stagingObjectId: randomId(16),
        manifestObjectId: manifestRes.manifestObjectId,
        manifestPayloadB64: toBase64(manifestRes.payload),
        ciphertextSha256: await sha256HexBytes(manifestRes.payload),
        ciphertextBytes: 0,
        clientProtocolVersion: 1,
      },
      deviceId,
    );
    if (response.result !== "COMMITTED") {
      throw new Error(`otherDeviceTombstone failed: ${response.result}`);
    }
    return { revisionId };
  }
}

// ---------------------------------------------------------------------------
// Persistence fakes
// ---------------------------------------------------------------------------

export class MemoryPersistence implements JournalPersistence {
  data: SyncJournalData | null = null;
  saveCount = 0;
  failNextSave = false;

  async save(journal: SyncJournalData): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("disk full (simulated)");
    }
    this.data = JSON.parse(JSON.stringify(journal)) as SyncJournalData;
    this.saveCount += 1;
  }

  async load(): Promise<SyncJournalData | null> {
    return this.data ? (JSON.parse(JSON.stringify(this.data)) as SyncJournalData) : null;
  }
}
