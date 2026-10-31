import { describe, expect, it } from "vitest";
import { VaultBridgeError } from "@vaultbridge/protocol";
import { splitSqlScript, TursoDatabase } from "../src/turso-db.js";

interface SeenRequest {
  type: string;
  stmt?: { sql: string };
}

function scriptedFetch(scripts: Array<(sqls: string[]) => unknown>): { fetchImpl: typeof fetch; seen: SeenRequest[][] } {
  const seen: SeenRequest[][] = [];
  let call = 0;
  const fetchImpl: typeof fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as { requests: SeenRequest[] };
    seen.push(payload.requests);
    const sqls = payload.requests.map((request) => request.stmt?.sql ?? request.type);
    const body = scripts[Math.min(call, scripts.length - 1)]?.(sqls);
    call += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, seen };
}

function execute(sql: string, affected: number, rows: unknown[][] = [], lastInsert: string | null = null): unknown {
  return {
    type: "ok",
    response: {
      type: "execute",
      result: {
        cols: [{ name: "n" }],
        rows,
        affected_row_count: affected,
        last_insert_rowid: lastInsert,
      },
    },
  };
}

describe("TursoDatabase", () => {
  it("splits migration scripts on semicolons and drops line comments", () => {
    expect(splitSqlScript("-- note\nCREATE TABLE t (id INTEGER); -- tail\n\nINSERT INTO t VALUES (1);")).toEqual([
      "CREATE TABLE t (id INTEGER)",
      "INSERT INTO t VALUES (1)",
    ]);
  });

  it("runs a batch as one transaction and keeps a 0-row update successful", async () => {
    const { fetchImpl, seen } = scriptedFetch([
      (sqls) => ({
        results: sqls.map((sql) => {
          if (sql === "close") {
            return { type: "ok", response: { type: "close" } };
          }
          const affected = sql.startsWith("UPDATE ZERO") ? 0 : 1;
          return execute(sql, affected, [], "9");
        }),
      }),
    ]);
    const db = new TursoDatabase("libsql://example.turso.io/ignored", "token", fetchImpl);
    const results = await db.batch([
      db.prepare("UPDATE ZERO SET a = ?1").bind(1),
      db.prepare("INSERT INTO t VALUES (?1)").bind("x"),
    ]);
    expect(results.map((result) => result.meta.changes)).toEqual([0, 1]);
    expect(results[1]?.meta.lastSeq).toBe(9);
    const sqls = seen[0]?.map((request) => request.stmt?.sql ?? request.type);
    expect(sqls).toEqual([
      "PRAGMA foreign_keys = ON",
      "BEGIN IMMEDIATE",
      "UPDATE ZERO SET a = ?1",
      "INSERT INTO t VALUES (?1)",
      "COMMIT",
      "close",
    ]);
  });

  it("returns integer cells as numbers", async () => {
    const { fetchImpl } = scriptedFetch([
      (sqls) => ({
        results: sqls.map((sql) =>
          sql === "close"
            ? { type: "ok", response: { type: "close" } }
            : sql.startsWith("SELECT")
              ? execute(sql, 0, [[{ type: "integer", value: "7" }]])
              : execute(sql, 0),
        ),
      }),
    ]);
    const db = new TursoDatabase("https://example.turso.io", "token", fetchImpl);
    const row = await db.prepare("SELECT 7 AS n").first<{ n: number }>();
    expect(row).toEqual({ n: 7 });
  });

  it("rejects a failed statement instead of committing it", async () => {
    const { fetchImpl, seen } = scriptedFetch([
      () => ({
        results: [
          execute("PRAGMA", 0),
          execute("BEGIN", 0),
          { type: "error", error: { message: "UNIQUE constraint failed" } },
        ],
      }),
    ]);
    const db = new TursoDatabase("https://example.turso.io", "token", fetchImpl);
    await expect(db.batch([db.prepare("INSERT INTO t VALUES (?1)").bind("x")])).rejects.toBeInstanceOf(VaultBridgeError);
    const sqls = seen[0]?.map((request) => request.stmt?.sql ?? request.type);
    expect(sqls).toContain("BEGIN IMMEDIATE");
    expect(sqls).toContain("COMMIT");
  });

  it("maps HTTP failures to a retryable backend error", async () => {
    const fetchImpl: typeof fetch = async () => new Response("no", { status: 503 });
    const db = new TursoDatabase("https://example.turso.io", "token", fetchImpl);
    await expect(db.prepare("SELECT 1").all()).rejects.toBeInstanceOf(VaultBridgeError);
  });
});
