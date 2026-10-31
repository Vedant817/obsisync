/**
 * Encrypted object store on Turso (libSQL over HTTP).
 *
 * Callers still use the object-store port. The same Turso database holds the
 * sync journal (see turso-db.ts) and these ciphertext rows.
 */
import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from "./ports.js";
import {
  blobArg,
  cellBytes,
  cellText,
  intArg,
  postTursoPipeline,
  textArg,
  tursoPipelineUrl,
  type ExecuteResult,
  type SqlArg,
  type SqlCell,
} from "./turso-http.js";

const CREATE_OBJECTS = `CREATE TABLE IF NOT EXISTS stored_objects (
  object_key TEXT PRIMARY KEY,
  body BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  etag TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
)`;

export { tursoPipelineUrl };

function likePrefix(prefix: string): string {
  const escaped = prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `${escaped}%`;
}

export class TursoBucket implements R2BucketLike {
  private readonly pipelineUrl: string;
  private ready: Promise<void> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(
    databaseUrl: string,
    private readonly authToken: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.pipelineUrl = tursoPipelineUrl(databaseUrl);
    // Workers and some runtimes reject an unbound fetch (`Illegal invocation`).
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    const result = await this.execute(
      "SELECT body, size_bytes, etag, uploaded_at FROM stored_objects WHERE object_key = ?",
      [textArg(key)],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const bytes = cellBytes(row[0]) ?? new Uint8Array();
    const meta = this.meta(key, row[1], row[2], row[3], bytes.length);
    return { ...meta, bytes: () => Promise.resolve(bytes) };
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    const result = await this.execute(
      "SELECT size_bytes, etag, uploaded_at FROM stored_objects WHERE object_key = ?",
      [textArg(key)],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return this.meta(key, row[0], row[1], row[2]);
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { onlyIf?: { etagDoesNotMatch?: string } | string },
  ): Promise<R2ObjectLike | null> {
    if (opts?.onlyIf) {
      const current = await this.head(key);
      const condition = typeof opts.onlyIf === "string" ? opts.onlyIf : opts.onlyIf.etagDoesNotMatch;
      if (condition !== undefined && current && condition === current.etag) {
        return null;
      }
    }
    const uploadedAt = new Date().toISOString();
    const etag = `${value.length.toString(16)}-${uploadedAt}`;
    await this.execute(
      `INSERT INTO stored_objects (object_key, body, size_bytes, etag, uploaded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(object_key) DO UPDATE SET
         body = excluded.body,
         size_bytes = excluded.size_bytes,
         etag = excluded.etag,
         uploaded_at = excluded.uploaded_at`,
      [textArg(key), blobArg(value), intArg(value.length), textArg(etag), textArg(uploadedAt)],
    );
    return { key, size: value.length, uploadedAt, etag };
  }

  async delete(keyOrKeys: string | string[]): Promise<void> {
    const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
    for (const key of keys) {
      await this.execute("DELETE FROM stored_objects WHERE object_key = ?", [textArg(key)]);
    }
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: R2ObjectLike[] }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const result = await this.execute(
      `SELECT object_key, size_bytes, etag, uploaded_at FROM stored_objects
       WHERE object_key LIKE ? ESCAPE '\\'
       ORDER BY object_key
       LIMIT ?`,
      [textArg(likePrefix(prefix)), intArg(limit)],
    );
    const keys = result.rows.map((row) => this.meta(cellText(row[0]) ?? "", row[1], row[2], row[3]));
    return { keys };
  }

  private meta(key: string, sizeCell: SqlCell | undefined, etagCell: SqlCell | undefined, atCell: SqlCell | undefined, fallbackSize = 0): R2ObjectLike {
    const sizeText = cellText(sizeCell);
    return {
      key,
      size: sizeText === null ? fallbackSize : Number(sizeText),
      etag: cellText(etagCell) ?? "",
      uploadedAt: cellText(atCell) ?? "",
    };
  }

  private async execute(sql: string, args: SqlArg[]): Promise<ExecuteResult> {
    await this.ensureSchema();
    const steps = await postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, [
      { type: "execute", stmt: { sql, args } },
      { type: "close" },
    ]);
    return steps.find((step) => step.kind === "execute")?.result ?? { cols: [], rows: [], affected_row_count: 0 };
  }

  private async ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, [
        { type: "execute", stmt: { sql: CREATE_OBJECTS } },
        { type: "close" },
      ])
        .then(() => undefined)
        .catch((err: unknown) => {
          this.ready = null;
          throw err;
        });
    }
    await this.ready;
  }
}
