import { FakeD1 } from "./d1-sqlite.js";
import { FakeR2 } from "./r2-memory.js";
import { handleVaultBridgeRequest, type VaultBridgeEnv } from "@vaultbridge/worker";
import { randomId } from "@vaultbridge/crypto";

/**
 * Worker test harness: real worker logic over FakeD1 (SQLite) + FakeR2.
 * Returns an ergonomic client for the JSON API.
 */

export interface WorkerHarness {
  env: VaultBridgeEnv;
  db: FakeD1;
  r2: FakeR2;
  call(method: string, path: string, opts?: CallOptions): Promise<CallResult>;
}

export interface CallOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  rawBody?: Uint8Array;
}

export interface CallResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  /** Typed accessor for common failure codes. */
  errorCode(): string | null;
}

export function createWorkerHarness(overrides: Partial<VaultBridgeEnv> = {}): WorkerHarness {
  const db = FakeD1.createFromMigrationFile();
  const r2 = new FakeR2();
  const env: VaultBridgeEnv = {
    DB: db,
    BUCKET: r2,
    WORKER_VERSION: "test-1.0.0",
    // Unique limiter scope per harness so test suites never share quota state.
    RATE_SCOPE: `harness-${randomId(8)}`,
    ...overrides,
  };

  async function call(method: string, path: string, opts: CallOptions = {}): Promise<CallResult> {
    const url = new URL(path.startsWith("http") ? path : `https://worker.test${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) };
    if (opts.token) {
      headers.authorization = `Bearer ${opts.token}`;
    }
    let body: BodyInit | undefined;
    if (opts.rawBody) {
      body = new Uint8Array(opts.rawBody);
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
    }
    const request = new Request(url.toString(), { method, headers, body });
    const response = await handleVaultBridgeRequest(request, env);
    const headerRecord: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headerRecord[k] = v;
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    const result = {
      status: response.status,
      body: parsed,
      headers: headerRecord,
      errorCode(): string | null {
        const asRecord = parsed as Record<string, unknown> | null;
        return asRecord && typeof asRecord.code === "string" ? (asRecord.code) : null;
      },
    };
    return result;
  }

  return { env, db, r2, call };
}

export { FakeD1, FakeR2 };
