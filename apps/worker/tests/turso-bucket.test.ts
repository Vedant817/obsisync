import { describe, expect, it } from "vitest";
import { TursoBucket, tursoPipelineUrl } from "../src/turso-bucket.js";
import { VaultBridgeError } from "@vaultbridge/protocol";

interface Stored {
  bodyB64: string;
  size: string;
  etag: string;
  at: string;
}

function memoryFetch(): { fetchImpl: typeof fetch; objects: Map<string, Stored> } {
  const objects = new Map<string, Stored>();
  const fetchImpl: typeof fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as {
      requests: Array<{ type: string; stmt?: { sql: string; args?: Array<{ value?: string; base64?: string }> } }>;
    };
    const results = [];
    for (const req of payload.requests) {
      if (req.type === "close" || !req.stmt) {
        results.push({ type: "ok", response: { type: "close" } });
        continue;
      }
      const sql = req.stmt.sql;
      const args = req.stmt.args ?? [];
      if (sql.startsWith("CREATE")) {
        results.push(okExecute([]));
        continue;
      }
      if (sql.startsWith("SELECT body")) {
        const row = objects.get(args[0]?.value ?? "");
        results.push(okExecute(row ? [[blob(row.bodyB64), integer(row.size), text(row.etag), text(row.at)]] : []));
        continue;
      }
      if (sql.startsWith("SELECT size_bytes")) {
        const row = objects.get(args[0]?.value ?? "");
        results.push(okExecute(row ? [[integer(row.size), text(row.etag), text(row.at)]] : []));
        continue;
      }
      if (sql.startsWith("INSERT")) {
        objects.set(args[0]?.value ?? "", {
          bodyB64: args[1]?.base64 ?? "",
          size: args[2]?.value ?? "0",
          etag: args[3]?.value ?? "",
          at: args[4]?.value ?? "",
        });
        results.push(okExecute([]));
        continue;
      }
      if (sql.startsWith("DELETE")) {
        objects.delete(args[0]?.value ?? "");
        results.push(okExecute([]));
        continue;
      }
      if (sql.includes("LIKE")) {
        const prefix = (args[0]?.value ?? "").replace(/\\/g, "").replace(/%$/, "");
        const rows = [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, row]) => [text(key), integer(row.size), text(row.etag), text(row.at)]);
        results.push(okExecute(rows));
        continue;
      }
      results.push({ type: "error", error: { message: `unexpected sql: ${sql}` } });
    }
    return new Response(JSON.stringify({ results }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, objects };
}

function okExecute(rows: unknown[][]): unknown {
  return { type: "ok", response: { type: "execute", result: { cols: [], rows, affected_row_count: rows.length } } };
}

function text(value: string): unknown {
  return { type: "text", value };
}

function integer(value: string): unknown {
  return { type: "integer", value };
}

function blob(base64: string): unknown {
  return { type: "blob", base64 };
}

describe("Turso object store", () => {
  it("normalizes database URLs to the HTTP pipeline", () => {
    expect(tursoPipelineUrl("libsql://vaultbridge-org.turso.io")).toBe("https://vaultbridge-org.turso.io/v2/pipeline");
    expect(tursoPipelineUrl("https://vaultbridge-org.turso.io/extra")).toBe("https://vaultbridge-org.turso.io/v2/pipeline");
  });

  it("stores, reads, lists, and deletes ciphertext", async () => {
    const { fetchImpl } = memoryFetch();
    const bucket = new TursoBucket("libsql://vaultbridge-org.turso.io", "token", fetchImpl);
    const body = new TextEncoder().encode("ciphertext-bytes");
    const stored = await bucket.put("vb-objects/vaults/v1/blobs/abc", body);
    expect(stored?.size).toBe(body.length);
    const loaded = await bucket.get("vb-objects/vaults/v1/blobs/abc");
    expect(loaded).not.toBeNull();
    expect(await loaded!.bytes()).toEqual(body);
    const head = await bucket.head("vb-objects/vaults/v1/blobs/abc");
    expect(head?.size).toBe(body.length);
    const listed = await bucket.list({ prefix: "vb-objects/vaults/v1/" });
    expect(listed.keys.map((key) => key.key)).toEqual(["vb-objects/vaults/v1/blobs/abc"]);
    const blocked = await bucket.put("vb-objects/vaults/v1/blobs/abc", new Uint8Array([1]), {
      onlyIf: { etagDoesNotMatch: stored!.etag },
    });
    expect(blocked).toBeNull();
    expect(await (await bucket.get("vb-objects/vaults/v1/blobs/abc"))!.bytes()).toEqual(body);
    await bucket.delete("vb-objects/vaults/v1/blobs/abc");
    expect(await bucket.get("vb-objects/vaults/v1/blobs/abc")).toBeNull();
  });

  it("surfaces a Turso HTTP failure as a retryable error", async () => {
    const fetchImpl: typeof fetch = async () => new Response("no", { status: 503 });
    const bucket = new TursoBucket("https://vaultbridge-org.turso.io", "token", fetchImpl);
    await expect(bucket.get("missing")).rejects.toBeInstanceOf(VaultBridgeError);
  });
});
