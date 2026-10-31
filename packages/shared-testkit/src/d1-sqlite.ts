/**
 * SQLite-backed D1 test double.
 *
 * Runs the same apps/worker/migrations/*.sql files as production so the worker
 * layer executes production SQL verbatim, including the atomic CAS batch semantics:
 * `batch()` here is one transaction (BEGIN IMMEDIATE ... COMMIT/ROLLBACK).
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  D1DatabaseLike,
  D1Statement,
  D1StatementResult,
  D1StatementRows,
  SqlValue,
} from "@vaultbridge/worker";

// node:sqlite is resolved at runtime via createRequire because Vite 5 (bundled
// with vitest 2) does not recognize `node:sqlite` as a Node builtin and fails
// module resolution when it sees the bare import specifier.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;
type SqlInputValue = import("node:sqlite").SQLInputValue;

type SqlValueJs = string | number | bigint | Uint8Array | null;

function toSqliteValue(v: SqlValue | undefined): SqlValueJs {
  if (v === undefined) {
    return null;
  }
  return v as SqlValueJs;
}

class Prepared implements D1Statement {
  private readonly values: SqlValueJs[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sqlText: string,
  ) {}

  bind(...values: SqlValue[]): D1Statement {
    this.values.push(...values.map(toSqliteValue));
    return this;
  }

  get text(): string {
    return this.sqlText;
  }

  get params(): SqlValue[] {
    return this.values as unknown as SqlValue[];
  }

  run(): Promise<D1StatementResult> {
    const before = this.db.prepare("SELECT total_changes() AS n").get() as { n: number | bigint } | undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const info = this.db.prepare(this.sqlText).run(...(this.values as SqlInputValue[]));
      this.db.exec("COMMIT");
      const after = this.db.prepare("SELECT total_changes() AS n").get() as { n: number | bigint } | undefined;
      const delta = Number(after?.n ?? 0) - Number(before?.n ?? 0);
      return Promise.resolve({ success: true, meta: { changes: Number(info.changes ?? delta), lastSeq: Number(info.lastInsertRowid ?? 0) } });
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  all<T = unknown>(): Promise<D1StatementRows<T>> {
    const stmt = this.db.prepare(this.sqlText);
    const raw = stmt.all(...(this.values as SqlInputValue[])) as Record<string, unknown>[];
    return Promise.resolve({ success: true, results: raw.map(sanitizeRow) as T[] });
  }

  first<T = unknown>(): Promise<T | null> {
    return this.all<T>().then((r) => r.results[0] ?? null);
  }
}

export class FakeD1 implements D1DatabaseLike {
  private constructor(private readonly db: DatabaseSync) {}

  static createFromSchema(schemaSql: string): FakeD1 {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    // D1 runs every statement session with foreign_keys enabled; mirror that
    // here so FK-related SQL bugs surface in tests instead of in production.
    db.exec("PRAGMA foreign_keys = ON");
    return new FakeD1(db);
  }

  /**
   * Convenience: apply the packaged migration file so tests always exercise the
   * production schema.
   */
  static createFromMigrationFile(rootDirHint?: string): FakeD1 {
    const here = path.dirname(fileURLToPath(rootDirHint ?? import.meta.url));
    const candidates = [
      path.resolve(here, "../../../apps/worker/migrations"),
      path.resolve(here, "../../../../apps/worker/migrations"),
    ];
    for (const dir of candidates) {
      if (!existsSync(path.join(dir, "0001_initial.sql"))) {
        continue;
      }
      const files = readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort();
      const sql = files.map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
      return FakeD1.createFromSchema(sql);
    }
    throw new Error("FakeD1: cannot locate apps/worker/migrations from " + here);
  }

  prepare(sql: string): D1Statement {
    return new Prepared(this.db, sql);
  }

  async batch<T = unknown>(statements: D1Statement[]): Promise<D1StatementResult[]> {
    if (statements.length === 0) {
      return [];
    }
    const preparedStatement = this.db.prepare("SELECT total_changes() AS n").get() as
      | { n: number | bigint }
      | undefined;
    this.db.exec("BEGIN IMMEDIATE");
    const results: D1StatementResult[] = [];
    try {
      for (const statement of statements) {
        const before = this.db.prepare("SELECT total_changes() AS n").get() as { n: number | bigint } | undefined;
        const info = this.db.prepare(statement.text).run(...(statement.params as SqlInputValue[]));
        const after = this.db.prepare("SELECT total_changes() AS n").get() as { n: number | bigint } | undefined;
        const delta = Number(after?.n ?? 0) - Number(before?.n ?? 0);
        results.push({ success: true, meta: { changes: Number(info.changes ?? delta), lastSeq: Number(info.lastInsertRowid ?? 0) } });
      }
      this.db.exec("COMMIT");
      void preparedStatement;
      return results as unknown as D1StatementResult[];
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err as Error;
    }
  }

  async dispose(): Promise<void> {
    this.db.close();
  }

  /** Test introspection: raw table dump (never a production interface). */
  dumpAll(table: string): unknown[] {
    return this.db.prepare(`SELECT * FROM ${table}`).all() as unknown[];
  }

  count(table: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint };
    return Number(row.n);
  }
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  // node:sqlite returns bigint for large integers; normalize to numbers
  for (const key of Object.keys(row)) {
    if (typeof row[key] === "bigint") {
      row[key] = Number(row[key]);
    }
  }
  return row;
}
