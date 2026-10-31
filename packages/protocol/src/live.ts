/**
 * Live editing wire contract (Sealed Sync Live).
 *
 * The server relays opaque, client-sealed CRDT updates and cursor states. It
 * never sees plaintext, paths, or device names. Document ids are a keyed PRF
 * of the note path, computed on the device.
 */

/** `u` = incremental CRDT update, `s` = compaction snapshot (full state). */
export type LiveEventKind = "u" | "s";

export const LIVE_LIMITS = {
  /** Sealed payload ceiling for an incremental update batch (base64url chars). */
  maxUpdateChars: 700_000,
  /** Sealed payload ceiling for a snapshot (base64url chars). Sent over HTTP, never over the socket. */
  maxSnapshotChars: 3_000_000,
  /** Sealed awareness (cursor) payload ceiling. */
  maxAwarenessChars: 8_000,
  /** Docs one poll may watch. */
  maxDocsPerPoll: 24,
  /** Events returned per doc per poll. More means `hasMore`. */
  maxEventsPerDoc: 400,
  /** Longest server-side long-poll wait. */
  maxWaitMs: 8_000,
  /** A cursor is dropped when its device has not refreshed it within this window. */
  awarenessTtlMs: 30_000,
} as const;

export const LIVE_DOC_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface LiveEventWire {
  seq: number;
  kind: LiveEventKind;
  deviceId: string;
  /** base64url(nonce || AES-GCM ciphertext). */
  payload: string;
}

export interface LiveAwarenessWire {
  deviceId: string;
  payload: string;
  updatedMs: number;
}

export interface LiveDocDelta {
  docId: string;
  events: LiveEventWire[];
  /** Highest seq the server scanned for this doc. Next poll uses it as `after`. */
  cursor: number;
  hasMore: boolean;
  awareness: LiveAwarenessWire[];
}

export interface LivePollResponse {
  docs: LiveDocDelta[];
  serverMs: number;
}

export interface LiveAppendRequest {
  kind: LiveEventKind;
  payload: string;
  /**
   * Compare-and-swap on the doc head: append only if the newest event seq for
   * this doc equals `ifHead` (0 = empty doc). Used for seeding and reconcile
   * edits so two devices cannot insert the same text twice.
   */
  ifHead?: number;
  /** Snapshot only: delete every event of this doc with seq <= replaceUpTo. */
  replaceUpTo?: number;
}

export interface LiveAppendResponse {
  /** false when `ifHead` did not match. Not an error: reload and retry. */
  applied: boolean;
  seq: number | null;
  head: number;
  /** Newest event seq below `seq`. A cursor at or past it may move to `seq`. */
  prev?: number | null;
}

export interface LiveAwarenessRequest {
  /** null removes this device's cursor (editor closed). */
  payload: string | null;
}

// ---------------------------------------------------------------------------
// WebSocket channel (one socket per device per vault)
// ---------------------------------------------------------------------------

/** Text frames larger than this go over HTTP instead (Cloudflare caps frames at 1 MiB). */
export const LIVE_WS_MAX_FRAME_CHARS = 900_000;

export type LiveClientMessage =
  | { t: "auth"; token: string; protocol: number }
  | { t: "sub"; docs: { docId: string; after: number }[] }
  | { t: "unsub"; docIds: string[] }
  | ({ t: "append"; id: number; docId: string } & LiveAppendRequest)
  | { t: "aw"; docId: string; payload: string | null };

export type LiveServerMessage =
  | { t: "ready"; deviceId: string }
  /** Catch-up page read from the log after a `sub`. Same cursor rules as a poll. */
  | ({ t: "page" } & LiveDocDelta)
  /** Someone appended. Advance the cursor to `event.seq` only if `event.prev` <= cursor. */
  | { t: "push"; docId: string; event: LiveEventWire & { prev: number } }
  | { t: "aw"; docId: string; entries: LiveAwarenessWire[] }
  | ({ t: "ack"; id: number } & LiveAppendResponse)
  | { t: "nack"; id: number; status: number; code: string; message: string }
  /** A file-sync commit landed in this vault. */
  | { t: "files" }
  | { t: "error"; status: number; code: string; message: string };
