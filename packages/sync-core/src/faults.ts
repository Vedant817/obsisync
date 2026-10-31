/**
 * One policy for sync failures.
 *
 * A dropped request retries on the next poll and does not pause the device.
 * A note whose bytes are corrupt is skipped so later notes still sync.
 * A note that fails authentication before any note has opened stays put:
 * that can be the vault key, and skipping it would look like a full sync.
 */
import { HttpTransportError, SyncTransportUnavailableError } from "./ports.js";

export interface FaultContext {
  /** Content objects opened successfully in this cycle. */
  contentOpens: number;
  /** Earlier attempts to apply this same revision. */
  attempts: number;
}

export type FaultAction = "retry-cycle" | "retry-event" | "skip-event";

export interface FaultDecision {
  action: FaultAction;
  message: string;
}

const STRUCTURAL =
  /integrity hash|not valid JSON|unsupported|missing nonce|missing integrity|envelope missing|manifest format|manifest payload too short|manifest JSON|absolute path|unsafe /i;

export function classifySyncFault(err: unknown, ctx: FaultContext): FaultDecision {
  if (err instanceof SyncTransportUnavailableError) {
    if (err.reason.startsWith("auth_")) {
      return { action: "retry-cycle", message: "Sync could not sign in. The next poll retries." };
    }
    return { action: "retry-cycle", message: "The network dropped. The next poll retries." };
  }
  const text = err instanceof Error ? err.message : String(err);
  if (STRUCTURAL.test(text) || isSharpClientError(err)) {
    return {
      action: "skip-event",
      message: "One note on the server could not be read. Sync continued with the other notes.",
    };
  }
  if (/AEAD|CryptoError|authentication failed/i.test(text)) {
    if (ctx.contentOpens > 0) {
      return {
        action: "skip-event",
        message: "One older note could not be opened. Sync continued with the other notes.",
      };
    }
    return { action: "retry-event", message: "One note could not be opened. Sync will retry it." };
  }
  if (/missing revision|missing object|object missing/i.test(text)) {
    if (ctx.attempts >= 2) {
      return {
        action: "skip-event",
        message: "One note is missing on the server. Sync continued with the other notes.",
      };
    }
    return { action: "retry-event", message: "One note was not on the server yet. Sync will retry it." };
  }
  return { action: "retry-event", message: "Sync hit a problem and will retry." };
}

function isSharpClientError(err: unknown): boolean {
  return err instanceof HttpTransportError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}
