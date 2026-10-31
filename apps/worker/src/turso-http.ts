/**
 * Minimal Turso / libSQL HTTP pipeline client.
 * One pipeline request runs on one database connection, so BEGIN/COMMIT stay together.
 */
import { VaultBridgeError } from "@vaultbridge/protocol";

export type SqlArg =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

export interface SqlCell {
  type?: string;
  value?: string;
  base64?: string;
}

export interface ExecuteResult {
  cols: Array<{ name?: string }>;
  rows: SqlCell[][];
  affected_row_count: number;
  last_insert_rowid?: string | number | null;
}

export interface PipelineStep {
  kind: "execute" | "close" | "other";
  result?: ExecuteResult;
}

/** libsql:// or a host becomes the HTTPS pipeline URL. */
export function tursoPipelineUrl(databaseUrl: string): string {
  let raw = databaseUrl.trim();
  raw = raw.replace(/^libsql:\/\//i, "https://").replace(/^turso:\/\//i, "https://");
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  const url = new URL(raw);
  url.pathname = "/v2/pipeline";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function textArg(value: string): SqlArg {
  return { type: "text", value };
}

export function intArg(value: number): SqlArg {
  return { type: "integer", value: String(value) };
}

export function blobArg(bytes: Uint8Array): SqlArg {
  return { type: "blob", base64: bytesToBase64(bytes) };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function cellText(cell: SqlCell | null | undefined): string | null {
  if (!cell || cell.type === "null") {
    return null;
  }
  if (cell.type === "blob") {
    return null;
  }
  return cell.value ?? null;
}

export function cellBytes(cell: SqlCell | null | undefined): Uint8Array | null {
  if (!cell || cell.type === "null") {
    return null;
  }
  const encoded = cell.base64 ?? cell.value;
  if (!encoded) {
    return null;
  }
  return base64ToBytes(encoded);
}

export async function postTursoPipeline(
  fetchImpl: typeof fetch,
  pipelineUrl: string,
  authToken: string,
  requests: unknown[],
): Promise<PipelineStep[]> {
  let response: Response;
  try {
    response = await fetchImpl(pipelineUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
  } catch (err) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", `database unreachable: ${err instanceof Error ? err.message : "network"}`);
  }
  if (!response.ok) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", `database returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    results?: Array<{
      type?: string;
      error?: { message?: string };
      response?: { type?: string; result?: ExecuteResult };
    }>;
  };
  const steps: PipelineStep[] = [];
  for (const item of payload.results ?? []) {
    if (item.type === "error") {
      throw new VaultBridgeError("RETRYABLE_BACKEND", item.error?.message ?? "database query failed");
    }
    const responseType = item.response?.type;
    if (responseType === "execute" && item.response?.result) {
      steps.push({ kind: "execute", result: item.response.result });
      continue;
    }
    if (responseType === "close") {
      steps.push({ kind: "close" });
      continue;
    }
    steps.push({ kind: "other" });
  }
  return steps;
}
