/**
 * HTTP implementation of the SyncTransport port against the VaultBridge API.
 *
 * The sender is injectable: the Obsidian plugin can bind it to fetch or
 * Obsidian's requestUrl, while tests drive it through the worker harness.
 * The version prefix (`/v1`) belongs to the sender; path arguments below are
 * vault-relative (`/vaults/{vaultId}/...`, `/health`).
 *
 * Error classification (spec §9.4/§12.2):
 *  - GET-style lookups map 404 to `null` (semantically "not present").
 *  - Commit maps 409 **with a CONFLICT envelope** to a normal response: CAS
 *    divergence is data, not a failure.
 *  - Network faults, 429, 401/403, 5xx => SyncTransportUnavailableError so
 *    the engine pauses cleanly instead of error-storming every pending op.
 *  - Any other >= 400 => HttpTransportError (sharp failure for callers).
 */
import { fromBase64 } from "@vaultbridge/crypto";
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
import { HttpTransportError, SyncTransportUnavailableError, type SyncTransport } from "./ports.js";

export interface HttpCallInit {
  token: string;
  json?: unknown;
  rawBody?: Uint8Array;
  query?: Record<string, string>;
  protocolVersion?: number;
}

export interface HttpCallResult {
  status: number;
  body: unknown;
}

export type HttpSender = (method: string, path: string, init: HttpCallInit) => Promise<HttpCallResult>;

export interface HttpSyncTransportOptions {
  vaultId: string;
  token: string;
  protocolVersion?: number;
  /** Transport-side clamp for /changes pages (tests small; production unset). */
  maxChangesPage?: number;
  sender: HttpSender;
}

export class HttpSyncTransport implements SyncTransport {
  constructor(private readonly options: HttpSyncTransportOptions) {}

  private vaultPath(suffix: string): string {
    return `/vaults/${this.options.vaultId}${suffix}`;
  }

  private codeOf(body: unknown): string | null {
    if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
      return (body as { code: string }).code;
    }
    return null;
  }

  private async request(
    method: string,
    path: string,
    init: { json?: unknown; rawBody?: Uint8Array; query?: Record<string, string> } = {},
  ): Promise<{ status: number; body: unknown }> {
    let result: HttpCallResult;
    try {
      result = await this.options.sender(method, path, {
        token: this.options.token,
        protocolVersion: this.options.protocolVersion ?? 1,
        json: init.json,
        rawBody: init.rawBody,
        query: init.query,
      });
    } catch (err) {
      throw new SyncTransportUnavailableError("network_failure", { cause: err });
    }
    if (result.status === 429) {
      throw new SyncTransportUnavailableError("rate_limited");
    }
    if (result.status === 401 || result.status === 403) {
      throw new SyncTransportUnavailableError(`auth_${result.status}`);
    }
    if (result.status >= 500 || result.status === 408) {
      throw new SyncTransportUnavailableError(`server_${result.status}`);
    }
    return result;
  }

  private hardFailure(status: number, body: unknown, what: string): never {
    throw new HttpTransportError(status, this.codeOf(body), what);
  }

  async health(): Promise<{ status: number }> {
    const result = await this.request("GET", "/health");
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "health");
    }
    return { status: result.status };
  }

  async fetchChanges(after: number, limit: number): Promise<ChangesResponse> {
    const effectiveLimit = this.options.maxChangesPage
      ? Math.min(limit, this.options.maxChangesPage)
      : limit;
    const result = await this.request("GET", this.vaultPath("/changes"), {
      query: { after: String(Math.max(0, Math.floor(after))), limit: String(Math.max(1, Math.floor(effectiveLimit))) },
    });
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "changes");
    }
    return result.body as ChangesResponse;
  }

  async getFileHead(fileId: string): Promise<FileHeadWire | null> {
    const result = await this.request("GET", this.vaultPath(`/files/${encodeURIComponent(fileId)}/head`));
    if (result.status === 404) {
      return null;
    }
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "file head");
    }
    return result.body as FileHeadWire;
  }

  async getRevision(revisionId: string): Promise<RevisionMeta | null> {
    const result = await this.request("GET", this.vaultPath(`/revisions/${encodeURIComponent(revisionId)}`));
    if (result.status === 404) {
      return null;
    }
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "revision lookup");
    }
    const wrapped = result.body as { revision?: RevisionMeta } | null;
    return wrapped?.revision ?? null;
  }

  async reserveUpload(request: ReserveUploadRequest): Promise<ReserveUploadResponse> {
    const result = await this.request("POST", this.vaultPath("/uploads"), { json: request });
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "reserve upload");
    }
    return result.body as ReserveUploadResponse;
  }

  async uploadObject(uploadId: string, bytes: Uint8Array): Promise<void> {
    const result = await this.request("PUT", this.vaultPath(`/uploads/${encodeURIComponent(uploadId)}`), {
      rawBody: bytes,
    });
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "staging upload");
    }
  }

  async commit(request: CommitRequest): Promise<CommitResponse> {
    const result = await this.request("POST", this.vaultPath("/commits"), { json: request });
    if (result.status >= 400) {
      if (result.status === 409) {
        const body = result.body as CommitResponse;
        if (body && typeof body === "object" && typeof body.result === "string") {
          return body; // CAS divergence is data
        }
      }
      this.hardFailure(result.status, result.body, "commit");
    }
    const body = result.body as CommitResponse;
    if (!body || typeof body !== "object" || typeof body.result !== "string") {
      throw new HttpTransportError(result.status, "BAD_RESPONSE", "commit response missing result");
    }
    return body;
  }

  async getObject(objectId: string): Promise<Uint8Array | null> {
    const result = await this.request("GET", this.vaultPath(`/objects/${encodeURIComponent(objectId)}`));
    if (result.status === 404) {
      return null;
    }
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "object fetch");
    }
    const body = result.body as { contentB64?: string } | null;
    if (!body || typeof body.contentB64 !== "string") {
      throw new HttpTransportError(result.status, "BAD_RESPONSE", "object response missing contentB64");
    }
    return fromBase64(body.contentB64);
  }

  async usage(): Promise<UsageResponse | null> {
    const result = await this.request("GET", this.vaultPath("/usage"));
    if (result.status === 404) {
      return null;
    }
    if (result.status >= 400) {
      this.hardFailure(result.status, result.body, "usage");
    }
    return result.body as UsageResponse;
  }
}
