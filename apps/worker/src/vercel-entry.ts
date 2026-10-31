/**
 * Vercel Node function. One HTTPS request in, one sync response out.
 * The journal and ciphertext stay in Turso. Secrets come from the project env.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVaultBridgeRequest, type VaultBridgeEnv } from "./routes.js";
import { TursoDatabase } from "./turso-db.js";

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive"]);

let cached: VaultBridgeEnv | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function env(): VaultBridgeEnv {
  if (cached) {
    return cached;
  }
  const databaseUrl = requiredEnv("TURSO_DATABASE_URL");
  const authToken = requiredEnv("TURSO_AUTH_TOKEN");
  cached = {
    DB: new TursoDatabase(databaseUrl, authToken),
    TURSO_DATABASE_URL: databaseUrl,
    TURSO_AUTH_TOKEN: authToken,
    WORKER_VERSION: process.env.WORKER_VERSION ?? "0.1.0",
    PROTOCOL_VERSION: process.env.PROTOCOL_VERSION ?? "1",
    BOOTSTRAP_DISABLED: process.env.BOOTSTRAP_DISABLED,
  };
  return cached;
}

function copyBytes(body: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}

async function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const host = req.headers.host ?? "localhost";
    const forwarded = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || "https";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);
    const hinted = url.searchParams.get("vbpath");
    if (hinted) {
      url.pathname = hinted.startsWith("/") ? hinted : `/${hinted}`;
      url.searchParams.delete("vbpath");
    } else if (url.pathname === "/api/sync" || url.pathname.startsWith("/api/sync/")) {
      url.pathname = "/v1/health";
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else {
        headers.set(key, value);
      }
    }
    const body = await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: body ? copyBytes(body) : undefined,
    });
    const response = await handleVaultBridgeRequest(request, env());
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") {
        return;
      }
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : "server error");
  }
}
