/**
 * Engine cycle behavior (spec §9.3 + §13.3), exercised through the same fake
 * stack the Obsidian adapter will substitute: capture → reconcile → push with
 * durable checkpoints, no-op zero-PUT cycles, CAS merges, conflict copies.
 */
import { describe, expect, it } from "vitest";
import { contentEnvelopeDecrypt, sha256HexBytes } from "@vaultbridge/crypto";
import type {
  ChangesResponse,
  CommitRequest,
  CommitResponse,
  FileHeadWire,
  ReserveUploadRequest,
  ReserveUploadResponse,
  RevisionMeta,
  UsageResponse,
} from "@vaultbridge/protocol";
import {
  conflictCopyPath,
  createSyncEngine,
  normalizeLocalPath,
  SyncJournal,
  SyncTransportUnavailableError,
  type SyncCycleReport,
  type SyncTransport,
} from "../src/index.js";
import { FakeServerTransport, FakeVault, MemoryPersistence } from "./fakes.js";

const VAULT_ID = "vault_it_0001a";
const enc = new TextEncoder();
const dec = new TextDecoder();

function newKeyMaterial() {
  return {
    contentKey: crypto.getRandomValues(new Uint8Array(32)),
    manifestKey: crypto.getRandomValues(new Uint8Array(32)),
    keyEpoch: 1,
  };
}

function harness(deviceId = "device-A") {
  const vault = new FakeVault();
  const persistence = new MemoryPersistence();
  const journal = new SyncJournal(persistence);
  const keyMaterial = newKeyMaterial();
  const server = new FakeServerTransport(VAULT_ID, deviceId, keyMaterial);
  const engine = createSyncEngine({
    vault,
    transport: server,
    journal,
    vaultId: VAULT_ID,
    deviceId,
    keyMaterial,
  });
  return { vault, persistence, journal, server, engine, keyMaterial };
}

function firstFile(h: ReturnType<typeof harness>) {
  const states = h.journal.fileStates;
  if (states.length !== 1) {
    throw new Error(`expected exactly one tracked file, got ${states.length}`);
  }
  return states[0]!;
}

/** Decrypt the current head revision plaintext straight from the fake server. */
async function headPlaintext(h: ReturnType<typeof harness>, fileId: string): Promise<string | null> {
  const head = await h.server.getFileHead(fileId);
  if (!head?.headRevisionId) {
    return null;
  }
  const meta = await h.server.getRevision(head.headRevisionId);
  const bytes = meta?.blobObjectId ? await h.server.getObject(meta.blobObjectId) : null;
  if (!meta || !bytes) {
    return null;
  }
  const plain = await contentEnvelopeDecrypt({
    payload: bytes,
    key: h.keyMaterial.contentKey,
    identity: { vaultId: VAULT_ID, fileId, revisionId: meta.revisionId, keyEpoch: meta.keyEpoch },
  });
  return dec.decode(plain);
}

const conflictCopiesIn = (vault: FakeVault) =>
  [...vault.files.keys()].filter((p) => p.includes(".vb-conflict-"));

describe("push cycle", () => {
  it("pushes a new note exactly once, then idles with zero PUTs (mini-T01)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/intro.md", enc.encode("# Hello"));
    const r1 = await h.engine.runCycle();
    expect(r1.started).toBe(true);
    expect(r1.pushes).toBe(1);
    expect(r1.dataObjectPuts).toBe(1);
    expect(r1.errors).toEqual([]);
    expect(h.server.uploadPuts).toBe(1);
    expect(h.server.commits).toBe(1);
    expect(h.journal.raw.pending).toEqual({});

    const file = firstFile(h);
    const head = (await h.server.getFileHead(file.fileId))!;
    expect(head.headRevisionId).toBe(file.lastAppliedRevisionId);

    const r2 = await h.engine.runCycle();
    expect(r2.pushes).toBe(0);
    expect(r2.dataObjectPuts).toBe(0);
    expect(r2.errors).toEqual([]);
    expect(h.server.uploadPuts).toBe(1);
    expect(h.engine.stats().lastCyclePuts).toBe(0);
  });

  it("stays zero-PUT for 10 straight idle cycles (T01 shape)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/calm.md", enc.encode("calm"));
    await h.engine.runCycle();
    const putsAfterPush = h.server.uploadPuts;
    const reports: SyncCycleReport[] = [];
    for (let i = 0; i < 10; i++) {
      reports.push(await h.engine.runCycle());
    }
    for (const r of reports) {
      expect(r.dataObjectPuts).toBe(0);
      expect(r.pushes).toBe(0);
      expect(r.errors).toEqual([]);
    }
    expect(h.server.uploadPuts).toBe(putsAfterPush);
    expect(h.engine.stats().cyclesRun).toBe(11);
  });

  it("pushes a local deletion as a tombstone with no blob PUT (T04)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/doomed.md", enc.encode("doomed"));
    await h.engine.runCycle();
    const file = firstFile(h);
    expect(h.server.uploadPuts).toBe(1);

    await h.vault.deleteFile("notes/doomed.md");
    const r = await h.engine.runCycle();
    expect(r.pushes).toBe(1);
    expect(r.dataObjectPuts).toBe(0);
    expect(h.server.uploadPuts).toBe(1); // tombstones never stage content
    const head = (await h.server.getFileHead(file.fileId))!;
    expect(head.isDeleted).toBe(true);
    const state = h.journal.getFile(file.fileId)!;
    expect(state.deletedLocally).toBe(true);
  });

  it("does not commit twice for an already-tombstoned file on later cycles", async () => {
    const h = harness();
    await h.vault.writeFile("notes/gone.md", enc.encode("gone soon"));
    await h.engine.runCycle();
    await h.vault.deleteFile("notes/gone.md");
    await h.engine.runCycle();
    const commitsAfterDelete = h.server.commits;

    await h.engine.runCycle();
    expect(h.server.commits).toBe(commitsAfterDelete);
    expect(h.server.uploadPuts).toBe(1);
  });
});

describe("pull cycle", () => {
  it("pulls an unseen remote file into the vault and journals it", async () => {
    const h = harness();
    await h.server.otherDeviceWrite("device-B", "aaaaaaaaaaaaaaaa", "remote.md", "from B");
    const r = await h.engine.runCycle();
    expect(r.pulls).toBe(1);
    expect(r.errors).toEqual([]);
    expect(h.server.uploadPuts).toBe(1); // foreign staging PUT only; engine uploaded nothing
    expect(dec.decode(await h.vault.readFile("remote.md"))).toBe("from B");
    const head = (await h.server.getFileHead("aaaaaaaaaaaaaaaa"))!;
    expect(firstFile(h).lastAppliedRevisionId).toBe(head.headRevisionId);
  });

  it("adopts a remote edit into a clean local file without conflict", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("v1"));
    await h.engine.runCycle();
    const file = firstFile(h);
    const remoteRev = (await h.server.otherDeviceWrite("device-B", file.fileId, "notes/a.md", "v2 from B")).revisionId;

    const r = await h.engine.runCycle();
    expect(r.pulls).toBe(1);
    expect(r.conflicts).toBe(0);
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("v2 from B");
    expect(h.journal.getFile(file.fileId)!.lastAppliedRevisionId).toBe(remoteRev);
    expect(h.server.uploadPuts).toBe(2); // own original push + foreign staging PUT
  });

  it("auto-merges a divergent note and CAS-pushes the merge onto the remote head", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("line1\nline2\nline3"));
    await h.engine.runCycle();
    const file = firstFile(h);
    await h.server.otherDeviceWrite("device-B", file.fileId, "notes/a.md", "line1\nline2\nline3-REMOTE");
    await h.vault.writeFile("notes/a.md", enc.encode("line1-LOCAL\nline2\nline3"));

    const r = await h.engine.runCycle();
    expect(r.conflicts).toBe(0);
    expect(r.errors).toEqual([]);
    expect(h.journal.unresolvedConflicts()).toHaveLength(0);
    // Merged text (both edits) landed on the server via CAS onto remote head…
    expect(await headPlaintext(h, file.fileId)).toBe("line1-LOCAL\nline2\nline3-REMOTE");
    expect(h.server.uploadPuts).toBe(3); // own r1 + foreign staging + merged push
    // …and the journal reflects the acknowledged state (no stuck pending).
    const state = h.journal.getFile(file.fileId)!;
    expect(state.pendingOperationId).toBeUndefined();
    expect(state.plaintextSha256).toBe(await sha256HexBytes(enc.encode("line1-LOCAL\nline2\nline3-REMOTE")));

    const r2 = await h.engine.runCycle();
    expect(r2.dataObjectPuts).toBe(0);
  });

  it("keeps both edits in the same note when a divergent note cannot merge", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("alpha\nbeta\ngamma"));
    await h.engine.runCycle();
    const file = firstFile(h);
    const remoteRev = (await h.server.otherDeviceWrite("device-B", file.fileId, "notes/a.md", "alpha-B\nbeta\ngamma")).revisionId;
    await h.vault.writeFile("notes/a.md", enc.encode("alpha-LOCAL\nbeta\ngamma"));

    const r = await h.engine.runCycle();
    expect(r.pushes).toBe(0);
    expect(h.engine.status()).toBe("CONFLICT");
    const conflicts = h.journal.unresolvedConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.origin).toBe("remote_changed");
    expect(conflicts[0]!.otherPath).toBeNull();
    expect(conflicts[0]!.remoteHeadRevisionId).toBe(remoteRev);
    const note = dec.decode(await h.vault.readFile("notes/a.md"));
    expect(note).toContain("alpha-LOCAL\nbeta\ngamma");
    expect(note).toContain("alpha-B\nbeta\ngamma");
    expect(conflictCopiesIn(h.vault)).toEqual([]);
    expect((await h.server.getFileHead(file.fileId))!.headRevisionId).toBe(remoteRev);
    expect(h.server.uploadPuts).toBe(2);

    await h.engine.resolveConflict(file.fileId, "local");
    const pushed = await h.engine.runCycle();
    expect(pushed.pushes).toBe(1);
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("alpha-LOCAL\nbeta\ngamma");
    expect(await headPlaintext(h, file.fileId)).toBe("alpha-LOCAL\nbeta\ngamma");
  });

  it("keeps the local binary and does not add a second file", async () => {
    const h = harness();
    await h.vault.writeFile("data.bin", new Uint8Array([0, 1, 2, 3]));
    await h.engine.runCycle();
    const file = firstFile(h);
    await h.server.otherDeviceWrite("device-B", file.fileId, "data.bin", "B bytes");
    await h.vault.writeFile("data.bin", new Uint8Array([9, 9, 9]));

    const r = await h.engine.runCycle();
    expect(r.pushes).toBe(0);
    expect(r.conflicts).toBeGreaterThanOrEqual(1);
    expect(h.engine.status()).toBe("CONFLICT");
    const conflict = h.journal.unresolvedConflicts()[0]!;
    expect(conflict.otherPath).toBeNull();
    expect(conflictCopiesIn(h.vault)).toEqual([]);
    expect(new Uint8Array(await h.vault.readFile("data.bin"))).toEqual(new Uint8Array([9, 9, 9]));
  });
});

describe("deletion divergence", () => {
  it("local delete vs remote edit: conflict, remote edit preserved via copy (T05 shape)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("base"));
    await h.engine.runCycle();
    const file = firstFile(h);
    const remoteRev = (await h.server.otherDeviceWrite("device-B", file.fileId, "notes/a.md", "edited by B")).revisionId;
    await h.vault.deleteFile("notes/a.md");

    const r = await h.engine.runCycle();
    expect(r.pushes).toBe(0);
    const conflicts = h.journal.unresolvedConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.origin).toBe("delete_vs_edit");
    expect(conflicts[0]!.otherPath).toBeNull();
    const head = (await h.server.getFileHead(file.fileId))!;
    expect(head.isDeleted).toBe(false);
    expect(head.headRevisionId).toBe(remoteRev);
    await expect(headPlaintext(h, file.fileId)).resolves.toBe("edited by B");
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("edited by B");
    expect(conflictCopiesIn(h.vault)).toEqual([]);
    expect(h.engine.status()).toBe("CONFLICT");
  });

  it("remote tombstone vs clean local: file removed, journal tombstoned", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("soon gone"));
    await h.engine.runCycle();
    const file = firstFile(h);
    await h.server.otherDeviceTombstone("device-B", file.fileId, "notes/a.md");

    const r = await h.engine.runCycle();
    expect(r.conflicts).toBe(0);
    expect(await h.vault.exists("notes/a.md")).toBe(false);
    const state = h.journal.getFile(file.fileId)!;
    expect(state.deletedLocally).toBe(true);
    expect(state.plaintextSha256).toBeNull();
    expect(h.vault.snapshots).toContain("remote-delete:notes/a.md");

    // later cycles stay idle and never resurrect the tombstone
    const r2 = await h.engine.runCycle();
    expect(r2.pushes).toBe(0);
    expect(r2.dataObjectPuts).toBe(0);
    expect((await h.server.getFileHead(file.fileId))!.isDeleted).toBe(true);
  });

  it("remote tombstone vs locally-modified file: local edit preserved (edit_vs_delete)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("base"));
    await h.engine.runCycle();
    const file = firstFile(h);
    await h.server.otherDeviceTombstone("device-B", file.fileId, "notes/a.md");
    await h.vault.writeFile("notes/a.md", enc.encode("precious local edit"));

    const r = await h.engine.runCycle();
    expect(r.pushes).toBe(0);
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("precious local edit");
    expect(h.journal.getFile(file.fileId)!.deletedLocally).toBe(false);
    // remote stays tombstoned; the divergence is flagged, not resolved silently
    expect((await h.server.getFileHead(file.fileId))!.isDeleted).toBe(true);
    expect(h.journal.unresolvedConflicts()[0]?.origin).toBe("edit_vs_delete");
    expect(h.engine.status()).toBe("CONFLICT");
  });

  it("does not delete a note when a superseded id is tombstoned", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("keep"));
    await h.engine.runCycle();
    const file = firstFile(h);
    const parked = "parkedfileid0001";
    h.journal.raw.files[parked] = {
      fileId: parked,
      localPath: "notes/a.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: false,
      supersededBy: file.fileId,
    };
    await h.server.otherDeviceTombstone("device-B", parked, "notes/a.md");

    await h.engine.runCycle();

    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("keep");
    expect((await h.server.getFileHead(file.fileId))!.isDeleted).toBe(false);
  });

  it("downloads notes again when this device lost most of them", async () => {
    const h = harness();
    await h.vault.writeFile("Companies Resource/a.md", enc.encode("a"));
    await h.vault.writeFile("Imagine Cup/b.md", enc.encode("b"));
    await h.vault.writeFile("System Design Notes/c.md", enc.encode("c"));
    await h.engine.runCycle();
    await h.vault.deleteFile("Companies Resource/a.md");
    await h.vault.deleteFile("Imagine Cup/b.md");
    await h.vault.deleteFile("System Design Notes/c.md");

    const report = await h.engine.runCycle();

    expect(report.pushes).toBe(0);
    expect(dec.decode(await h.vault.readFile("Companies Resource/a.md"))).toBe("a");
    expect(dec.decode(await h.vault.readFile("Imagine Cup/b.md"))).toBe("b");
    expect(dec.decode(await h.vault.readFile("System Design Notes/c.md"))).toBe("c");
  });

  it("downloads one server note the journal already gave up on", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("laptop"));
    await h.vault.writeFile("notes/b.md", enc.encode("stay"));
    await h.engine.runCycle();
    const canonical = h.journal.fileIdForPath("notes/a.md")!;
    const parked = "parkedfileid0001";
    h.journal.raw.files[parked] = {
      fileId: parked,
      localPath: "notes/a.md.vb-conflict-abcdefgh.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: true,
      supersededBy: canonical,
    };
    await h.server.otherDeviceWrite("device-B", parked, "notes/a.md", "phone");
    await h.server.otherDeviceTombstone("device-B", canonical, "notes/a.md");
    await h.vault.deleteFile("notes/a.md");
    h.journal.updateFile(canonical, { deletedLocally: true, plaintextSha256: null });
    h.journal.setCursor(99999);

    const report = await h.engine.runCycle();

    expect(report.pushes).toBe(0);
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("phone");
    expect(dec.decode(await h.vault.readFile("notes/b.md"))).toBe("stay");
  });

  it("keeps a note when the other device publishes it and then tombstones the old id", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("laptop"));
    await h.engine.runCycle();
    const canonical = h.journal.fileIdForPath("notes/a.md")!;
    const parked = "parkedfileid0002";
    h.journal.raw.files[parked] = {
      fileId: parked,
      localPath: "notes/a.md.vb-conflict-abcdefgh.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: true,
      supersededBy: canonical,
    };
    await h.server.otherDeviceWrite("device-B", parked, "notes/a.md", "phone");
    await h.server.otherDeviceTombstone("device-B", canonical, "notes/a.md");

    await h.engine.runCycle();

    const text = dec.decode(await h.vault.readFile("notes/a.md"));
    expect(text).toContain("phone");
    expect(h.journal.fileIdForPath("notes/a.md")).toBe(parked);
    expect((await h.server.getFileHead(canonical))!.isDeleted).toBe(true);
  });
});

describe("rename handling", () => {
  it("applies a remote rename under the same fileId (old path cleaned up)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("moving"));
    await h.engine.runCycle();
    const file = firstFile(h);
    await h.server.otherDeviceWrite("device-B", file.fileId, "notes/b.md", "moving (renamed)");

    const r = await h.engine.runCycle();
    expect(r.pulls).toBe(1);
    expect(await h.vault.exists("notes/a.md")).toBe(false);
    expect(dec.decode(await h.vault.readFile("notes/b.md"))).toBe("moving (renamed)");
    const state = h.journal.getFile(file.fileId)!;
    expect(state.localPath).toBe("notes/b.md");
    expect(h.journal.fileIdForPath("notes/b.md")).toBe(file.fileId);
    expect(h.journal.fileIdForPath("notes/a.md")).toBeNull();
  });
});

describe("cost + safety guards", () => {
  it("pauseRequested hook stops pushes before any upload", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("hook"));
    const r = await h.engine.runCycle({ pauseRequested: () => "cost guard" });
    expect(r.pushes).toBe(0);
    expect(r.dataObjectPuts).toBe(0);
    expect(h.server.uploadPuts).toBe(0);
    expect(h.journal.raw.pausedReason).toBe("cost guard");
    expect((await h.engine.runCycle()).started).toBe(false);
    await h.engine.resume();
    expect((await h.engine.runCycle()).pushes).toBe(1);
  });

  it("engine.pause blocks cycles entirely until resume", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("paused pending"));
    await h.engine.pause("user paused");
    const paused = await h.engine.runCycle();
    expect(paused.started).toBe(false);
    expect(paused.pausedReason).toBe("user paused");
    expect(paused.status).toBe("PAUSED");
    expect(h.server.uploadPuts).toBe(0);
    await h.engine.resume();
    expect((await h.engine.runCycle()).pushes).toBe(1);
  });

  it("cycle upload budget pauses mid-wave and completes on resume", async () => {
    const h = harness();
    await h.vault.writeFile("a.md", enc.encode("1"));
    await h.vault.writeFile("b.md", enc.encode("2"));
    await h.vault.writeFile("c.md", enc.encode("3"));
    const r = await h.engine.runCycle({ budget: { maxUploadsPerCycle: 2 } });
    expect(r.pushes).toBe(2);
    expect(r.dataObjectPuts).toBe(2);
    expect(h.journal.raw.pausedReason).toBe("cycle_budget_exhausted");
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(1);
    expect(h.server.uploadPuts).toBe(2);
    await h.engine.resume();
    const r2 = await h.engine.runCycle();
    expect(r2.pushes).toBe(1);
    expect(h.server.uploadPuts).toBe(3);
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(0);
    expect(h.engine.status()).toBe("READY");
  });

  it("a bulk pending storm trips the pause guard before any PUT", async () => {
    const h = harness();
    await h.vault.writeFile("a.md", enc.encode("1"));
    await h.vault.writeFile("b.md", enc.encode("2"));
    await h.vault.writeFile("c.md", enc.encode("3"));
    const r = await h.engine.runCycle({ budget: { maxPendingForAutoRun: 1 } });
    expect(r.pushes).toBe(0);
    expect(r.dataObjectPuts).toBe(0);
    expect(h.journal.raw.pausedReason).toBe("bulk_pending_wave");
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(3);
    await h.engine.resume();
    const r2 = await h.engine.runCycle();
    expect(r2.pushes).toBe(3);
    expect(h.server.uploadPuts).toBe(3);
  });

  it("persistence failure before any network action aborts the cycle (zero PUTs)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("durability first"));
    h.persistence.failNextSave = true;
    await expect(h.engine.runCycle()).rejects.toThrow(/disk full/);
    expect(h.server.uploadPuts).toBe(0);
    expect(h.server.commits).toBe(0);
  });
});

describe("own-echo rule", () => {
  it("skips feed events authored by this device (no duplicate pulls)", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("echo"));
    await h.engine.runCycle();
    // Fresh replica with a rebuilt (empty) journal must not re-ingest its own
    // commit from the feed: the echo rule short-circuits it.
    const freshVault = new FakeVault();
    const freshJournal = new SyncJournal(new MemoryPersistence());
    const freshEngine = createSyncEngine({
      vault: freshVault,
      transport: h.server,
      journal: freshJournal,
      vaultId: VAULT_ID,
      deviceId: "device-A",
      keyMaterial: h.keyMaterial,
    });
    const r = await freshEngine.runCycle();
    expect(r.pulls).toBe(0);
    expect(r.pushes).toBe(0);
    expect(freshVault.files.size).toBe(0);
  });
});

describe("normalizeLocalPath (spec §9.7)", () => {
  it("accepts ordinary vault-relative paths", () => {
    expect(normalizeLocalPath("notes/sub/a.md")).toBe("notes/sub/a.md");
    expect(normalizeLocalPath("./a.md")).toBe("a.md");
    expect(normalizeLocalPath("a\\b.md")).toBe("a/b.md");
  });

  it("rejects traversal, absolute paths, control chars and overlong names", () => {
    expect(() => normalizeLocalPath("../etc/passwd")).toThrow();
    expect(() => normalizeLocalPath("notes/../../evil.md")).toThrow();
    expect(() => normalizeLocalPath("/absolute/a.md")).toThrow();
    expect(() => normalizeLocalPath("C:\\evil\\a.md")).toThrow();
    expect(() => normalizeLocalPath("bad\u0000name.md")).toThrow();
    expect(() => normalizeLocalPath("long/" + "x".repeat(300))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Outage handling (spec §12.2): transport failures degrade to a durable pause
// instead of error-storming every pending operation.
// ---------------------------------------------------------------------------

class OutageDelegate implements SyncTransport {
  constructor(
    private readonly real: FakeServerTransport,
    private readonly failing: Set<"fetchChanges" | "uploadObject">,
  ) {}

  health() {
    return this.real.health();
  }

  fetchChanges(after: number, limit: number): Promise<ChangesResponse> {
    if (this.failing.has("fetchChanges")) {
      return Promise.reject(new SyncTransportUnavailableError("network_failure"));
    }
    return this.real.fetchChanges(after, limit);
  }

  getFileHead(fileId: string): Promise<FileHeadWire | null> {
    return this.real.getFileHead(fileId);
  }

  getRevision(revisionId: string): Promise<RevisionMeta | null> {
    return this.real.getRevision(revisionId);
  }

  reserveUpload(request: ReserveUploadRequest): Promise<ReserveUploadResponse> {
    return this.real.reserveUpload(request);
  }

  uploadObject(uploadId: string, bytes: Uint8Array): Promise<void> {
    if (this.failing.has("uploadObject")) {
      return Promise.reject(new SyncTransportUnavailableError("network_failure"));
    }
    return this.real.uploadObject(uploadId, bytes);
  }

  commit(request: CommitRequest): Promise<CommitResponse> {
    return this.real.commit(request);
  }

  getObject(objectId: string): Promise<Uint8Array | null> {
    return this.real.getObject(objectId);
  }

  usage(): Promise<UsageResponse | null> {
    return this.real.usage();
  }
}

describe("outage handling", () => {
  it("pauses cleanly when staging uploads fail and keeps pendings durable", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("outage"));
    const engine = createSyncEngine({
      vault: h.vault,
      transport: new OutageDelegate(h.server, new Set(["uploadObject"])),
      journal: h.journal,
      vaultId: VAULT_ID,
      deviceId: "device-A",
      keyMaterial: h.keyMaterial,
    });
    const report = await engine.runCycle();
    expect(report.pushes).toBe(0);
    expect(report.errors).toEqual([]); // digested into a pause, not an error storm
    expect(h.journal.raw.pausedReason).toBe("unavailable:network_failure");
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(1);
    expect(h.server.commits).toBe(0);
    expect(engine.status()).toBe("PAUSED");
  });

  it("pauses when the change feed is unreachable, with revert-safe cursor", async () => {
    const h = harness();
    await h.server.otherDeviceWrite("device-B", "aaaaaaaaaaaaaaaa", "remote.md", "from B");
    const outageEngine = createSyncEngine({
      vault: h.vault,
      transport: new OutageDelegate(h.server, new Set(["fetchChanges"])),
      journal: h.journal,
      vaultId: VAULT_ID,
      deviceId: "device-A",
      keyMaterial: h.keyMaterial,
    });
    const report = await outageEngine.runCycle();
    expect(report.started).toBe(true);
    expect(h.journal.cursor).toBe(0); // nothing acked mid-outage
    expect(h.vault.files.size).toBe(0);
    expect(h.journal.raw.pausedReason).toBe("unavailable:network_failure");

    await outageEngine.resume();
    const recovery = createSyncEngine({
      vault: h.vault,
      transport: h.server,
      journal: h.journal,
      vaultId: VAULT_ID,
      deviceId: "device-A",
      keyMaterial: h.keyMaterial,
    });
    const r2 = await recovery.runCycle();
    expect(r2.pulls).toBe(1);
    expect(dec.decode(await h.vault.readFile("remote.md"))).toBe("from B");
    expect(h.journal.raw.pausedReason).toBeNull();
  });
});

describe("review fixes: retries, cursor, paths, deletes", () => {
  it("replays a lost commit response with the same operation instead of a new revision", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("once"));
    h.server.loseNextCommitResponse = true;
    const lost = await h.engine.runCycle();
    expect(lost.pushes).toBe(0);
    expect(h.journal.raw.pausedReason).toBe("unavailable:network_failure");
    expect(h.server.revisions.size).toBe(1);
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(1);

    // The echo is already behind the cursor, so only the pinned replay can ack.
    h.journal.setCursor(100);
    await h.engine.resume();
    const again = await h.engine.runCycle();
    expect(again.errors).toEqual([]);
    expect(again.pushes).toBe(0);
    expect(h.server.revisions.size).toBe(1);
    expect(Object.keys(h.journal.raw.pending)).toHaveLength(0);
    expect(await headPlaintext(h, firstFile(h).fileId)).toBe("once");
    expect(h.engine.status()).toBe("READY");
  });

  it("does not skip a foreign event that landed between fetch and our commit", async () => {
    const h = harness();
    h.server.beforeNextCommit = async () => {
      await h.server.otherDeviceWrite("device-B", "bbbbbbbbbbbbbbbb", "notes/other.md", "from B");
    };
    await h.vault.writeFile("notes/mine.md", enc.encode("mine"));
    await h.engine.runCycle();
    expect(await h.vault.exists("notes/other.md")).toBe(false);

    const second = await h.engine.runCycle();
    expect(second.pulls).toBe(1);
    expect(dec.decode(await h.vault.readFile("notes/other.md"))).toBe("from B");
    expect(dec.decode(await h.vault.readFile("notes/mine.md"))).toBe("mine");
    expect(h.journal.cursor).toBe(2);
  });

  it("leaves the cursor behind a revision whose blob is missing, then applies it", async () => {
    const h = harness();
    const wrote = await h.server.otherDeviceWrite("device-B", "cccccccccccccccc", "notes/late.md", "later");
    const meta = h.server.revisions.get(wrote.revisionId)!;
    const blob = h.server.objects.get(meta.blobObjectId!)!;
    h.server.objects.delete(meta.blobObjectId!);

    const blocked = await h.engine.runCycle();
    expect(blocked.pulls).toBe(0);
    expect(blocked.errors.length).toBeGreaterThan(0);
    expect(h.journal.cursor).toBe(0);
    expect(await h.vault.exists("notes/late.md")).toBe(false);

    h.server.objects.set(meta.blobObjectId!, blob);
    const recovered = await h.engine.runCycle();
    expect(recovered.pulls).toBe(1);
    expect(dec.decode(await h.vault.readFile("notes/late.md"))).toBe("later");
    expect(h.journal.cursor).toBe(1);
  });

  it("renames a conflict copy back to the real note", async () => {
    const h = harness();
    await h.vault.writeFile("Companies Resource/Meta.md", enc.encode("same"));
    await h.vault.writeFile("Companies Resource/Meta.md.vb-conflict-wyKfnMkW.md", enc.encode("same"));
    await h.vault.writeFile("Challenges.md.vb-conflict-nl53ebSU.md", enc.encode("only copy"));

    await h.engine.runCycle();

    expect(conflictCopiesIn(h.vault)).toEqual([]);
    expect(dec.decode(await h.vault.readFile("Companies Resource/Meta.md"))).toBe("same");
    expect(dec.decode(await h.vault.readFile("Challenges.md"))).toBe("only copy");
  });

  it("adopts the server file when a fresh journal already has the same bytes", async () => {
    const h = harness();
    await h.vault.writeFile("notes/same.md", enc.encode("hello"));
    await h.server.otherDeviceWrite("device-B", "dddddddddddddddd", "notes/same.md", "hello");

    const report = await h.engine.runCycle();

    expect(report.errors).toEqual([]);
    expect(report.pushes).toBe(0);
    expect(conflictCopiesIn(h.vault)).toEqual([]);
    expect(h.journal.fileIdForPath("notes/same.md")).toBe("dddddddddddddddd");
    expect(h.journal.fileStates).toHaveLength(1);
    expect(dec.decode(await h.vault.readFile("notes/same.md"))).toBe("hello");
  });

  it("keeps two file ids that independently created the same path", async () => {
    const h = harness();
    await h.vault.writeFile("notes/same.md", enc.encode("local-wins-path"));
    await h.engine.runCycle();
    const localId = firstFile(h).fileId;
    await h.server.otherDeviceWrite("device-B", "dddddddddddddddd", "notes/same.md", "remote twin");

    const pulled = await h.engine.runCycle();
    expect(pulled.errors).toEqual([]);
    const note = dec.decode(await h.vault.readFile("notes/same.md"));
    expect(note).toContain("local-wins-path");
    expect(note).toContain("remote twin");
    expect(h.journal.fileIdForPath("notes/same.md")).toBe(localId);
    expect(conflictCopiesIn(h.vault)).toEqual([]);
    const remote = h.journal.getFile("dddddddddddddddd");
    expect(remote?.supersededBy).toBe(localId);
  });

  it("turns an unpushed delete into an upsert when the file comes back", async () => {
    const h = harness();
    await h.vault.writeFile("notes/a.md", enc.encode("alive"));
    await h.engine.runCycle();
    const fileId = firstFile(h).fileId;
    await h.vault.deleteFile("notes/a.md");
    const held = await h.engine.runCycle({ pauseRequested: () => "hold" });
    expect(held.pushes).toBe(0);
    expect(Object.values(h.journal.raw.pending)[0]?.action).toBe("delete");
    expect((await h.server.getFileHead(fileId))!.isDeleted).toBe(false);

    await h.vault.writeFile("notes/a.md", enc.encode("came back"));
    await h.engine.resume();
    const pushed = await h.engine.runCycle();
    expect(pushed.pushes).toBe(1);
    expect(pushed.conflicts).toBe(0);
    expect((await h.server.getFileHead(fileId))!.isDeleted).toBe(false);
    expect(await headPlaintext(h, fileId)).toBe("came back");
    expect(dec.decode(await h.vault.readFile("notes/a.md"))).toBe("came back");
  });

  it("refuses a conflict-copy path that would escape the vault", () => {
    const hostile = conflictCopyPath("notes/a.md", "/../../abcd");
    expect(hostile).toBe("notes/a.md.vb-conflict-abcd0000.md");
    expect(normalizeLocalPath(hostile)).toBe(hostile);
    expect(hostile.includes("..")).toBe(false);
  });
});
