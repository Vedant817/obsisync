/**
 * SQL port over Turso. `batch` is one connection: foreign keys on, BEGIN IMMEDIATE,
 * the statements, then COMMIT. A 0-row update is success. Any error skips COMMIT,
 * and closing the connection rolls the open transaction back.
 */
import type { D1DatabaseLike, D1Statement, D1StatementResult, D1StatementRows, SqlValue } from "./ports.js";
import {
  blobArg,
  cellText,
  intArg,
  postTursoPipeline,
  textArg,
  tursoPipelineUrl,
  type ExecuteResult,
  type SqlArg,
  type SqlCell,
} from "./turso-http.js";

const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

export function splitSqlScript(sql: string): string[] {
  const withoutLineComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function toArg(value: SqlValue): SqlArg {
  if (value === null) {
    return { type: "null" };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return intArg(value);
    }
    return textArg(String(value));
  }
  if (typeof value === "string") {
    return textArg(value);
  }
  return blobArg(value);
}

function cellValue(cell: SqlCell | null | undefined): unknown {
  if (!cell || cell.type === "null" || cell.type === undefined) {
    return null;
  }
  if (cell.type === "integer") {
    return cell.value === undefined ? null : Number(cell.value);
  }
  if (cell.type === "float" || cell.type === "real") {
    return cell.value === undefined ? null : Number(cell.value);
  }
  if (cell.type === "blob") {
    return cell.base64 ?? null;
  }
  return cellText(cell);
}

function rowObject(result: ExecuteResult, row: SqlCell[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < result.cols.length; i++) {
    const name = result.cols[i]?.name;
    if (!name) {
      continue;
    }
    obj[name] = cellValue(row[i]);
  }
  return obj;
}

function runMeta(result: ExecuteResult | undefined): D1StatementResult {
  const last = result?.last_insert_rowid;
  return {
    success: true,
    meta: {
      changes: Number(result?.affected_row_count ?? 0),
      lastSeq: last === undefined || last === null ? 0 : Number(last),
    },
  };
}

class TursoStatement implements D1Statement {
  private values: SqlValue[] = [];

  constructor(
    private readonly db: TursoDatabase,
    private readonly sqlText: string,
  ) {}

  bind(...values: SqlValue[]): D1Statement {
    this.values.push(...values);
    return this;
  }

  get text(): string {
    return this.sqlText;
  }

  get params(): SqlValue[] {
    return this.values;
  }

  run(): Promise<D1StatementResult> {
    return this.db.executeOne(this.sqlText, this.values);
  }

  async all<T = unknown>(): Promise<D1StatementRows<T>> {
    const result = await this.db.query(this.sqlText, this.values);
    return { success: true, results: result.rows.map((row) => rowObject(result, row) as T) };
  }

  async first<T = unknown>(): Promise<T | null> {
    const rows = await this.all<T>();
    return rows.results[0] ?? null;
  }
}

export class TursoDatabase implements D1DatabaseLike {
  private readonly pipelineUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    databaseUrl: string,
    private readonly authToken: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.pipelineUrl = tursoPipelineUrl(databaseUrl);
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  prepare(sql: string): D1Statement {
    return new TursoStatement(this, sql);
  }

  async batch(statements: D1Statement[]): Promise<D1StatementResult[]> {
    if (statements.length === 0) {
      return [];
    }
    const requests: unknown[] = [
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql: "BEGIN IMMEDIATE" } },
    ];
    for (const statement of statements) {
      requests.push({ type: "execute", stmt: { sql: statement.text, args: statement.params.map(toArg) } });
    }
    requests.push({ type: "execute", stmt: { sql: "COMMIT" } }, { type: "close" });
    const steps = await this.pipeline(requests);
    const executed = steps.filter((step) => step.kind === "execute");
    const firstStatement = 2;
    return statements.map((_, index) => runMeta(executed[firstStatement + index]?.result));
  }

  async executeOne(sql: string, params: SqlValue[]): Promise<D1StatementResult> {
    const steps = await this.pipeline([
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql, args: params.map(toArg) } },
      { type: "close" },
    ]);
    const executed = steps.filter((step) => step.kind === "execute");
    return runMeta(executed[1]?.result);
  }

  async query(sql: string, params: SqlValue[]): Promise<ExecuteResult> {
    const steps = await this.pipeline([
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql, args: params.map(toArg) } },
      { type: "close" },
    ]);
    const executed = steps.filter((step) => step.kind === "execute");
    return executed[1]?.result ?? { cols: [], rows: [], affected_row_count: 0 };
  }

  /** Apply one migration file. Statements run in order; a failure stops the rest. */
  async execScript(sql: string): Promise<void> {
    for (const statement of splitSqlScript(sql)) {
      await this.executeOne(statement, []);
    }
  }

  async appliedMigrations(): Promise<Set<string>> {
    await this.executeOne(MIGRATION_TABLE, []);
    const result = await this.query("SELECT name FROM schema_migrations", []);
    const names = new Set<string>();
    for (const row of result.rows) {
      const name = cellText(row[0]);
      if (name) {
        names.add(name);
      }
    }
    return names;
  }

  async markMigration(name: string, at: string): Promise<void> {
    await this.executeOne("INSERT INTO schema_migrations (name, applied_at) VALUES (?1, ?2)", [name, at]);
  }

  private pipeline(requests: unknown[]) {
    return postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, requests);
  }
}
