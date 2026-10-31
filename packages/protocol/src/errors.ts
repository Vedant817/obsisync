
/**
 * Stable machine-readable error codes.
 *
 * Contract: every user-visible failure surfaces exactly one of these codes plus
 * human-readable guidance (spec §11.4, NFR-OBSERVABILITY). Codes may only be
 * added, never re-purposed, within a wire version.
 */
export const ERROR_CODES = [
  // ---- transport / auth ----
  "UNAUTHENTICATED",
  "DEVICE_REVOKED",
  "INVALID_REQUEST",
  "PROTOCOL_VERSION_MISMATCH",
  "RATE_LIMITED",
  "RETRYABLE_BACKEND",
  "REMOTE_UNAVAILABLE",
  // ---- vault / keys ----
  "INVITATION_INVALID",
  "VAULT_NOT_FOUND",
  "STORAGE_LIMIT",
  "KEY_UNAVAILABLE",
  // ---- objects / revisions ----
  "OBJECT_TOO_LARGE",
  "ATTACHMENT_TOO_LARGE",
  "REVISION_CONFLICT",
  "NOT_FOUND",
  "CORRUPT_ENVELOPE",
  "DECRYPTION_FAILED",
  "UNSUPPORTED_PATH",
  // ---- safety / cost ----
  "BUDGET_PAUSED",
  "MUTATION_RATIO_PAUSED",
  "SYNC_LOOP_SUSPECTED",
  "PAUSED",
  "INITIAL_SYNC_INTERRUPTED",
  // ---- local ----
  "PATH_REJECTED",
  "STALE_REMOTE_HEAD",
  "UNKNOWN",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Stable classification used by retry logic and metering. */
export type ErrorClass = "fatal" | "retryable" | "pause";

export const ERROR_CLASSES: Record<ErrorCode, ErrorClass> = {
  UNAUTHENTICATED: "fatal",
  DEVICE_REVOKED: "fatal",
  INVALID_REQUEST: "fatal",
  PROTOCOL_VERSION_MISMATCH: "fatal",
  RATE_LIMITED: "retryable",
  RETRYABLE_BACKEND: "retryable",
  REMOTE_UNAVAILABLE: "retryable",
  INVITATION_INVALID: "fatal",
  VAULT_NOT_FOUND: "fatal",
  STORAGE_LIMIT: "pause",
  KEY_UNAVAILABLE: "pause",
  OBJECT_TOO_LARGE: "fatal",
  ATTACHMENT_TOO_LARGE: "fatal",
  REVISION_CONFLICT: "fatal", // conflict resolution is a user workflow, not an auto-retry
  NOT_FOUND: "fatal",
  CORRUPT_ENVELOPE: "fatal",
  DECRYPTION_FAILED: "fatal",
  UNSUPPORTED_PATH: "fatal",
  BUDGET_PAUSED: "pause",
  MUTATION_RATIO_PAUSED: "pause",
  SYNC_LOOP_SUSPECTED: "pause",
  PAUSED: "pause",
  INITIAL_SYNC_INTERRUPTED: "retryable",
  PATH_REJECTED: "fatal",
  STALE_REMOTE_HEAD: "fatal",
  UNKNOWN: "retryable",
};

/**
 * Canonical error body carried by every non-2xx API response and surfaced by
 * the plugin across the local/remote boundary.
 */
export interface VaultBridgeErrorPayload {
  code: ErrorCode;
  /** Short, stable English explanation. Localization happens in the plugin. */
  message: string;
  /** Concrete next action for the user ("Pair again", "Review conflicts"...). */
  guidance?: string;
  /** True when the same request may be retried automatically. */
  retryable: boolean;
  /** Per-request diagnostic id (safe to share in bug reports). */
  requestId?: string;
  /** HTTP status used only for transport; `code` is the real contract. */
  status?: number;
}

export class VaultBridgeError extends Error implements VaultBridgeErrorPayload {
  readonly code: ErrorCode;
  readonly guidance?: string;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { guidance?: string; retryable?: boolean; status?: number; requestId?: string } = {},
  ) {
    super(`${code}: ${message}`);
    if (!(ERROR_CODES as readonly string[]).includes(code)) {
      throw new TypeError(`VaultBridgeError: unknown error code "${String(code)}"`);
    }
    this.name = "VaultBridgeError";
    this.code = code;
    this.guidance = options.guidance;
    this.retryable = options.retryable ?? ERROR_CLASSES[code] === "retryable";
    this.status = options.status ?? statusForCode(code);
    this.requestId = options.requestId;
  }

  toPayload(): VaultBridgeErrorPayload {
    return {
      code: this.code,
      message: this.message.replace(/^[A-Z_]+: /, ""),
      guidance: this.guidance,
      retryable: this.retryable,
      requestId: this.requestId,
      status: this.status,
    };
  }
}

export function statusForCode(code: ErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "DEVICE_REVOKED":
      return 403;
    case "VAULT_NOT_FOUND":
    case "NOT_FOUND":
      return 404;
    case "REVISION_CONFLICT":
      return 409;
    case "OBJECT_TOO_LARGE":
    case "ATTACHMENT_TOO_LARGE":
      return 413;
    case "INVALID_REQUEST":
    case "UNSUPPORTED_PATH":
    case "INVITATION_INVALID":
    case "CORRUPT_ENVELOPE":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "DECRYPTION_FAILED":
    case "KEY_UNAVAILABLE":
    case "STORAGE_LIMIT":
    case "BUDGET_PAUSED":
    case "MUTATION_RATIO_PAUSED":
    case "SYNC_LOOP_SUSPECTED":
    case "INITIAL_SYNC_INTERRUPTED":
    case "STALE_REMOTE_HEAD":
    case "PATH_REJECTED":
    case "PAUSED":
      return 400;
    case "PROTOCOL_VERSION_MISMATCH":
    case "RETRYABLE_BACKEND":
    case "REMOTE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}


