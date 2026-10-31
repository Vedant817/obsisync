/**
 * Live editing relay (Sealed Sync Live).
 *
 * Stateless HTTP so it runs on Vercel functions as well as the Node server:
 * - an append-only, per-document log of sealed CRDT updates with an optional
 *   compare-and-swap on the doc head (seeding and reconcile edits),
 * - client-driven compaction (`kind: "s"` + `replaceUpTo`),
 * - sealed cursor states with a short TTL,
 * - a batched poll that long-polls when nothing is new.
 *
 * Payloads are opaque base64url strings sealed on the device. The server
 * checks sizes and shapes only.
 */
import {
  LIVE_DOC_ID_PATTERN,
  LIVE_LIMITS,
  VaultBridgeError,
  type LiveAppendResponse,
  type LiveAwarenessWire,
  type LiveDocDelta,
  type LiveEventKind,
  type LiveEventWire,
  type LivePollResponse,
} from "@vaultbridge/protocol";
import { z } from "zod";
import { authenticate, type AuthContext } from "./auth.js";
import type { D1DatabaseLike } from "./ports.js";

const PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;

export const LIVE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS live_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    device_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS live_events_doc ON live_events (vault_id, doc_id, seq)`,
  `CREATE TABLE IF NOT EXISTS live_awareness (
    vault_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY (vault_id, doc_id, device_id)
  )`,
];

/**
 * Production databases were migrated before live editing existed. The tables
 * are created on first use so a deploy needs no manual migration step.
 */
const ready = new WeakSet<object>();
async function ensureLiveSchema(db: D1DatabaseLike): Promise<void> {
  if (ready.has(db)) {
    return;
  }
  for (const sql of LIVE_SCHEMA) {
    await db.prepare(sql).run();
  }
  ready.add(db);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "body must be JSON");
  }
}

function checkDocId(docId: string): void {
  if (!LIVE_DOC_ID_PATTERN.test(docId)) {
    throw new VaultBridgeError("INVALID_REQUEST", "malformed live document id");
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns undefined when `subpath` is not a live route. */
export async function handleLiveRoute(
  db: D1DatabaseLike,
  request: Request,
  url: URL,
  vaultId: string,
  subpath: string,
): Promise<Response | undefined> {
  if (!subpath.startsWith("/live/")) {
    return undefined;
  }
  const auth = await authenticate(db, request, { touch: false });
  if (auth.vault.vault_id !== vaultId) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device is not a member of this vault", {
      guidance: "Use the vault this device is paired to.",
    });
  }
  await ensureLiveSchema(db);
  if (subpath === "/live/poll" && request.method === "GET") {
    return json(await poll(db, auth, url));
  }
  const docMatch = subpath.match(/^\/live\/docs\/([^/]+)\/(events|awareness)$/);
  if (docMatch && request.method === "POST") {
    const docId = docMatch[1]!;
    checkDocId(docId);
    if (docMatch[2] === "events") {
      return json(await append(db, auth, docId, await readJson(request)));
    }
    await setAwareness(db, auth, docId, await readJson(request));
    return json({ ok: true });
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

const appendSchema = z
  .object({
    kind: z.enum(["u", "s"]),
    payload: z.string().min(1).regex(PAYLOAD_PATTERN),
    ifHead: z.number().int().min(0).optional(),
    replaceUpTo: z.number().int().min(0).optional(),
  })
  .strict();

async function append(db: D1DatabaseLike, auth: AuthContext, docId: string, raw: unknown): Promise<LiveAppendResponse> {
  const body = appendSchema.parse(raw);
  const limit = body.kind === "s" ? LIVE_LIMITS.maxSnapshotChars : LIVE_LIMITS.maxUpdateChars;
  if (body.payload.length > limit) {
    throw new VaultBridgeError("INVALID_REQUEST", "live payload too large", { status: 413 });
  }
  if (body.replaceUpTo !== undefined && body.kind !== "s") {
    throw new VaultBridgeError("INVALID_REQUEST", "only a snapshot can replace events");
  }
  if (body.replaceUpTo !== undefined && body.ifHead !== undefined) {
    throw new VaultBridgeError("INVALID_REQUEST", "a snapshot cannot also be conditional");
  }
  const vaultId = auth.vault.vault_id;
  const deviceId = auth.device.device_id;
  const now = new Date().toISOString();
  const insert =
    body.ifHead === undefined
      ? db
          .prepare(
            "INSERT INTO live_events (vault_id, doc_id, kind, device_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
          )
          .bind(vaultId, docId, body.kind, deviceId, body.payload, now)
      : db
          .prepare(
            `INSERT INTO live_events (vault_id, doc_id, kind, device_id, payload, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6
             WHERE COALESCE((SELECT MAX(seq) FROM live_events WHERE vault_id = ?1 AND doc_id = ?2), 0) = ?7`,
          )
          .bind(vaultId, docId, body.kind, deviceId, body.payload, now, body.ifHead);
  const statements = [insert];
  if (body.replaceUpTo !== undefined) {
    statements.push(
      db
        .prepare("DELETE FROM live_events WHERE vault_id = ?1 AND doc_id = ?2 AND seq <= ?3")
        .bind(vaultId, docId, body.replaceUpTo),
    );
  }
  const results = await db.batch(statements);
  const inserted = results[0]!;
  const applied = inserted.meta.changes > 0;
  const headRow = await db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS head FROM live_events WHERE vault_id = ?1 AND doc_id = ?2")
    .bind(vaultId, docId)
    .first<{ head: number }>();
  return {
    applied,
    seq: applied ? Number(inserted.meta.lastSeq ?? 0) || null : null,
    head: Number(headRow?.head ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Awareness
// ---------------------------------------------------------------------------

const awarenessSchema = z
  .object({ payload: z.string().min(1).max(LIVE_LIMITS.maxAwarenessChars).regex(PAYLOAD_PATTERN).nullable() })
  .strict();

async function setAwareness(db: D1DatabaseLike, auth: AuthContext, docId: string, raw: unknown): Promise<void> {
  const body = awarenessSchema.parse(raw);
  const vaultId = auth.vault.vault_id;
  const deviceId = auth.device.device_id;
  const now = Date.now();
  if (body.payload === null) {
    await db
      .prepare("DELETE FROM live_awareness WHERE vault_id = ?1 AND doc_id = ?2 AND device_id = ?3")
      .bind(vaultId, docId, deviceId)
      .run();
    return;
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO live_awareness (vault_id, doc_id, device_id, payload, updated_ms) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (vault_id, doc_id, device_id) DO UPDATE SET payload = excluded.payload, updated_ms = excluded.updated_ms`,
      )
      .bind(vaultId, docId, deviceId, body.payload, now),
    db
      .prepare("DELETE FROM live_awareness WHERE vault_id = ?1 AND updated_ms < ?2")
      .bind(vaultId, now - LIVE_LIMITS.awarenessTtlMs * 4),
  ]);
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

interface Watch {
  docId: string;
  after: number;
}

function parseWatches(raw: string | null): Watch[] {
  if (!raw) {
    throw new VaultBridgeError("INVALID_REQUEST", "poll needs at least one document");
  }
  const out: Watch[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const [docId, afterRaw] = part.split(":");
    if (!docId) {
      continue;
    }
    checkDocId(docId);
    const after = Number(afterRaw ?? "0");
    if (!Number.isInteger(after) || after < 0) {
      throw new VaultBridgeError("INVALID_REQUEST", "malformed live cursor");
    }
    if (!seen.has(docId)) {
      seen.add(docId);
      out.push({ docId, after });
    }
  }
  if (out.length === 0 || out.length > LIVE_LIMITS.maxDocsPerPoll) {
    throw new VaultBridgeError("INVALID_REQUEST", `poll watches 1-${LIVE_LIMITS.maxDocsPerPoll} documents`);
  }
  return out;
}

interface EventRow {
  seq: number;
  kind: string;
  device_id: string;
  payload: string;
}

interface AwarenessRow {
  doc_id: string;
  device_id: string;
  payload: string;
  updated_ms: number;
}

async function poll(db: D1DatabaseLike, auth: AuthContext, url: URL): Promise<LivePollResponse> {
  const watches = parseWatches(url.searchParams.get("d"));
  const waitRaw = Number(url.searchParams.get("wait") ?? "0");
  const wait = Number.isFinite(waitRaw) ? Math.min(Math.max(0, Math.floor(waitRaw)), LIVE_LIMITS.maxWaitMs) : 0;
  const sinceRaw = Number(url.searchParams.get("as") ?? "0");
  const awarenessSince = Number.isFinite(sinceRaw) ? Math.max(0, sinceRaw) : 0;
  const includeSelf = url.searchParams.get("self") === "1";
  const vaultId = auth.vault.vault_id;
  const me = auth.device.device_id;
  const deadline = Date.now() + wait;

  for (;;) {
    const changed = await probe(db, vaultId, me, watches, awarenessSince);
    if (changed.size > 0 || Date.now() >= deadline) {
      const docs: LiveDocDelta[] = [];
      const awareness = await readAwareness(db, vaultId, me, watches, awarenessSince);
      for (const watch of watches) {
        const delta = changed.has(watch.docId)
          ? await readEvents(db, vaultId, me, watch, includeSelf)
          : { docId: watch.docId, events: [], cursor: watch.after, hasMore: false, awareness: [] };
        delta.awareness = awareness.get(watch.docId) ?? [];
        docs.push(delta);
      }
      return { docs, serverMs: Date.now() };
    }
    await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
  }
}

/** One cheap query: which watched docs have newer events or cursors. */
async function probe(
  db: D1DatabaseLike,
  vaultId: string,
  me: string,
  watches: Watch[],
  awarenessSince: number,
): Promise<Set<string>> {
  const placeholders = watches.map((_, i) => `?${i + 4}`).join(", ");
  // Cursors older than the TTL are gone for readers; they must not wake a long poll.
  const fresh = Math.max(awarenessSince, Date.now() - LIVE_LIMITS.awarenessTtlMs);
  const rows = await db
    .prepare(
      `SELECT doc_id AS d, MAX(seq) AS v, 'e' AS t FROM live_events
         WHERE vault_id = ?1 AND doc_id IN (${placeholders}) GROUP BY doc_id
       UNION ALL
       SELECT doc_id AS d, MAX(updated_ms) AS v, 'a' AS t FROM live_awareness
         WHERE vault_id = ?1 AND device_id != ?2 AND updated_ms > ?3 AND doc_id IN (${placeholders}) GROUP BY doc_id`,
    )
    .bind(vaultId, me, fresh, ...watches.map((w) => w.docId))
    .all<{ d: string; v: number; t: string }>();
  const after = new Map(watches.map((w) => [w.docId, w.after]));
  const changed = new Set<string>();
  for (const row of rows.results) {
    if (row.t === "a" || Number(row.v) > (after.get(row.d) ?? 0)) {
      changed.add(row.d);
    }
  }
  return changed;
}

async function readEvents(
  db: D1DatabaseLike,
  vaultId: string,
  me: string,
  watch: Watch,
  includeSelf: boolean,
): Promise<LiveDocDelta> {
  const rows = await db
    .prepare(
      `SELECT seq, kind, device_id, payload FROM live_events
       WHERE vault_id = ?1 AND doc_id = ?2 AND seq > ?3 ORDER BY seq ASC LIMIT ?4`,
    )
    .bind(vaultId, watch.docId, watch.after, LIVE_LIMITS.maxEventsPerDoc + 1)
    .all<EventRow>();
  const scanned = rows.results.slice(0, LIVE_LIMITS.maxEventsPerDoc);
  const events: LiveEventWire[] = [];
  for (const row of scanned) {
    if (!includeSelf && row.device_id === me) {
      continue;
    }
    events.push({ seq: Number(row.seq), kind: row.kind as LiveEventKind, deviceId: row.device_id, payload: row.payload });
  }
  const last = scanned[scanned.length - 1];
  return {
    docId: watch.docId,
    events,
    cursor: last ? Number(last.seq) : watch.after,
    hasMore: rows.results.length > LIVE_LIMITS.maxEventsPerDoc,
    awareness: [],
  };
}

async function readAwareness(
  db: D1DatabaseLike,
  vaultId: string,
  me: string,
  watches: Watch[],
  awarenessSince: number,
): Promise<Map<string, LiveAwarenessWire[]>> {
  const placeholders = watches.map((_, i) => `?${i + 4}`).join(", ");
  const fresh = Math.max(awarenessSince, Date.now() - LIVE_LIMITS.awarenessTtlMs);
  const rows = await db
    .prepare(
      `SELECT doc_id, device_id, payload, updated_ms FROM live_awareness
       WHERE vault_id = ?1 AND device_id != ?2 AND updated_ms > ?3 AND doc_id IN (${placeholders})`,
    )
    .bind(vaultId, me, fresh, ...watches.map((w) => w.docId))
    .all<AwarenessRow>();
  const out = new Map<string, LiveAwarenessWire[]>();
  for (const row of rows.results) {
    const list = out.get(row.doc_id) ?? [];
    list.push({ deviceId: row.device_id, payload: row.payload, updatedMs: Number(row.updated_ms) });
    out.set(row.doc_id, list);
  }
  return out;
}
