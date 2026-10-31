/**
 * Live relay transport over the same injectable HTTP sender the file sync
 * uses (Obsidian's requestUrl in the plugin, the worker harness in tests).
 */
import type {
  LiveAppendRequest,
  LiveAppendResponse,
  LivePollResponse,
} from "@vaultbridge/protocol";

export interface LiveHttpInit {
  token: string;
  json?: unknown;
  query?: Record<string, string>;
  protocolVersion?: number;
}

export type LiveHttpSender = (
  method: string,
  path: string,
  init: LiveHttpInit,
) => Promise<{ status: number; body: unknown }>;

/** Network down, throttled, server error, or credential rejected: retry later. */
export class LiveUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "LiveUnavailableError";
  }

  /** A revoked or unknown device will never succeed. Stop instead of retrying. */
  get fatal(): boolean {
    return this.status === 401 || this.status === 403 || this.code === "DEVICE_REVOKED";
  }
}

export interface LiveWatch {
  docId: string;
  after: number;
}

export interface LivePollOptions {
  waitMs?: number;
  awarenessSince?: number;
  includeSelf?: boolean;
}

export interface LiveTransport {
  poll(watches: LiveWatch[], options?: LivePollOptions): Promise<LivePollResponse>;
  append(docId: string, request: LiveAppendRequest): Promise<LiveAppendResponse>;
  setAwareness(docId: string, payload: string | null): Promise<void>;
}

export class HttpLiveTransport implements LiveTransport {
  constructor(
    private readonly options: { vaultId: string; token: string; sender: LiveHttpSender },
  ) {}

  async poll(watches: LiveWatch[], options: LivePollOptions = {}): Promise<LivePollResponse> {
    const query: Record<string, string> = {
      d: watches.map((w) => `${w.docId}:${w.after}`).join(","),
      wait: String(Math.max(0, Math.floor(options.waitMs ?? 0))),
      as: String(Math.max(0, Math.floor(options.awarenessSince ?? 0))),
    };
    if (options.includeSelf) {
      query.self = "1";
    }
    return (await this.call("GET", "/live/poll", { query })) as LivePollResponse;
  }

  async append(docId: string, request: LiveAppendRequest): Promise<LiveAppendResponse> {
    return (await this.call("POST", `/live/docs/${docId}/events`, { json: request })) as LiveAppendResponse;
  }

  async setAwareness(docId: string, payload: string | null): Promise<void> {
    await this.call("POST", `/live/docs/${docId}/awareness`, { json: { payload } });
  }

  private async call(
    method: string,
    suffix: string,
    init: { json?: unknown; query?: Record<string, string> },
  ): Promise<unknown> {
    let result: { status: number; body: unknown };
    try {
      result = await this.options.sender(method, `/vaults/${this.options.vaultId}${suffix}`, {
        token: this.options.token,
        protocolVersion: 1,
        json: init.json,
        query: init.query,
      });
    } catch (err) {
      throw new LiveUnavailableError(err instanceof Error ? err.message : "network failure", null);
    }
    if (result.status >= 200 && result.status < 300) {
      return result.body;
    }
    const body = result.body as { code?: unknown; message?: unknown } | null;
    const code = body && typeof body.code === "string" ? body.code : null;
    const message = body && typeof body.message === "string" ? body.message : `live request failed (${result.status})`;
    throw new LiveUnavailableError(message, result.status, code);
  }
}
