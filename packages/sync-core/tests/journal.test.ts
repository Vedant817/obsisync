/**
 * Durable journal semantics (spec §9.1/§9.2): strict parse, monotonic cursor,
 * crash-safe ordering hooks, and fail-closed recovery.
 */
import { describe, expect, it } from "vitest";
import { SyncJournal } from "../src/journal.js";
import { emptyJournal, parseJournal, serializeJournal, type PendingOperation } from "../src/state.js";
import { MemoryPersistence } from "./fakes.js";

function journalWith(persistence: MemoryPersistence) {
  const journal = new SyncJournal(persistence);
  return journal;
}

function fakePending(opId: string, createdAt: number, fileId = "file000000000001"): PendingOperation {
  return {
    operationId: opId,
    fileId,
    baseRevisionId: null,
    action: "upsert",
    localContentFingerprint: "h",
    createdAt,
    stage: "captured",
    retryCount: 0,
  };
}

describe("journal persistence", () => {
  it("round-trips through save/load preserving all fields", async () => {
    const persistence = new MemoryPersistence();
    const a = journalWith(persistence);
    a.raw.deviceId = "device-A";
    a.trackFile({
      fileId: "file000000000001",
      localPath: "notes/a.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: false,
    });
    a.putPending(fakePending("op_a", 1));
    a.addConflict({
      fileId: "file000000000001",
      otherPath: null,
      baseRevisionId: null,
      remoteHeadRevisionId: "r2",
      origin: "remote_changed",
      createdAt: 1,
      resolved: false,
    });
    a.setCursor(7);
    await a.persist();

    const b = new SyncJournal(persistence);
    expect(await b.load()).toBe(true);
    expect(b.raw.deviceId).toBe("device-A");
    expect(b.cursor).toBe(7);
    expect(Object.keys(b.raw.files)).toEqual(["file000000000001"]);
    expect(b.raw.pending["op_a"]?.operationId).toBe("op_a");
    expect(b.unresolvedConflicts()).toHaveLength(1);
  });

  it("cursor is monotonic: never rewinds below the acked seq", () => {
    const j = new SyncJournal(new MemoryPersistence());
    j.setCursor(10);
    j.setCursor(4);
    expect(j.cursor).toBe(10);
  });

  it("pendingList is FIFO (oldest push first)", () => {
    const j = new SyncJournal(new MemoryPersistence());
    j.putPending(fakePending("op_late", 30));
    j.putPending(fakePending("op_early", 5));
    expect(j.pendingList().map((p) => p.operationId)).toEqual(["op_early", "op_late"]);
  });

  it("dropPending clears the file's pendingOperationId pointer", () => {
    const j = new SyncJournal(new MemoryPersistence());
    j.trackFile({
      fileId: "file000000000001",
      localPath: "a.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: false,
    });
    j.putPending(fakePending("op_x", 1));
    expect(j.getFile("file000000000001")?.pendingOperationId).toBe("op_x");
    j.dropPending("op_x");
    expect(j.raw.pending["op_x"]).toBeUndefined();
    expect(j.getFile("file000000000001")?.pendingOperationId).toBeUndefined();
  });

  it("rename via updateFile keeps pathToFileId in sync (old key removed)", () => {
    const j = new SyncJournal(new MemoryPersistence());
    j.trackFile({
      fileId: "file000000000001",
      localPath: "notes/a.md",
      lastAppliedRevisionId: null,
      plaintextSha256: null,
      deletedLocally: false,
    });
    j.updateFile("file000000000001", { localPath: "notes/b.md" });
    expect(j.fileIdForPath("notes/a.md")).toBeNull();
    expect(j.fileIdForPath("notes/b.md")).toBe("file000000000001");
  });

  it("restoreOrReset returns fresh when nothing persisted", async () => {
    const j = new SyncJournal(new MemoryPersistence());
    expect(await j.restoreOrReset()).toBe("fresh");
  });

  it("restoreOrReset restores a valid persisted journal", async () => {
    const persistence = new MemoryPersistence();
    const a = journalWith(persistence);
    a.raw.deviceId = "device-A";
    await a.persist();
    const b = new SyncJournal(persistence);
    expect(await b.restoreOrReset()).toBe("restored");
    expect(b.raw.deviceId).toBe("device-A");
  });

  it("restoreOrReset rebuilds fail-closed from an unparseable/unknown-version journal", async () => {
    const evil = {
      async save(data) { this.saved = serializeJournal(data); },
      async load() { return JSON.parse('{"journalVersion": 2, "legacy": true}'); },
    } as unknown as MemoryPersistence;
    const j = new SyncJournal(evil);
    expect(await j.restoreOrReset()).toBe("corrupt-rebuilt");
    expect(j.raw.files).toEqual({});
    expect(j.raw.journalVersion).toBe(1);
  });
});

describe("parseJournal (strict decode)", () => {
  it("accepts a canonical empty journal", () => {
    const parsed = parseJournal(serializeJournal(emptyJournal("device-A")));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.journal.deviceId).toBe("device-A");
      expect(parsed.journal.cursor).toBe(0);
    }
  });

  it("rejects unparseable bytes", () => {
    expect(parseJournal("{not json")).toEqual({ ok: false, reason: "unparseable" });
    expect(parseJournal("123")).toEqual({ ok: false, reason: "unparseable" });
    expect(parseJournal("null")).toEqual({ ok: false, reason: "unparseable" });
  });

  it("rejects unknown future versions (fail closed, never guess)", () => {
    const future = serializeJournal({ ...emptyJournal(), journalVersion: 2 });
    expect(parseJournal(future)).toEqual({ ok: false, reason: "unknown-version" });
    expect(parseJournal(serializeJournal(emptyJournal())).ok).toBe(true);
  });
});
