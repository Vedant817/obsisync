/**
 * SQL and object-store ports the sync API depends on.
 *
 * Declared locally so the request handlers stay testable against an in-memory
 * battery: the shared-testkit SQLite fake implements these interfaces and runs
 * the same migration files as production.
 */

export type SqlValue = string | number | Uint8Array | null;

export interface D1RunMeta {
  changes: number;
  lastSeq?: number;
}

export interface D1Statement {
  bind(...values: SqlValue[]): D1Statement;
  run(): Promise<D1StatementResult>;
  all<T = unknown>(): Promise<D1StatementRows<T>>;
  first<T = unknown>(): Promise<T | null>;
  /** Statement text + params, used by test adapters and diagnostics. */
  readonly text: string;
  readonly params: SqlValue[];
}

export interface D1StatementResult {
  success: boolean;
  meta: D1RunMeta;
}

export interface D1StatementRows<T = unknown> {
  success: boolean;
  results: T[];
}

/**
 * `batch` runs all statements as ONE transaction: all succeed or all fail.
 * A statement that changes 0 rows is success, not an error. The CAS commit
 * relies on both of those rules.
 */
export interface D1DatabaseLike {
  prepare(sql: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<D1StatementResult[]>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  uploadedAt: string;
  etag: string;
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  /** Fully-buffered body (VaultBridge objects are small/verified client-side). */
  bytes(): Promise<Uint8Array>;
}

/** Object-store port. Production uses Turso; tests use an in-memory fake. */
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: Uint8Array,
    opts?: { onlyIf?: { etagDoesNotMatch?: string } | string },
  ): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  /** Count and stats for cost guard cleanup; not used on the client path. */
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: R2ObjectLike[] }>;
}
