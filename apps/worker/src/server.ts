/**
 * Node HTTP entry for the VaultBridge sync API.
 * Journal and ciphertext both live in Turso. Set TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN in apps/worker/.env (gitignored).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./load-env.js";
import { handleVaultBridgeRequest, type VaultBridgeEnv } from "./routes.js";
import { TursoDatabase } from "./turso-db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.resolve(here, "../.env"));

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

const databaseUrl = requiredEnv("TURSO_DATABASE_URL");
const authToken = requiredEnv("TURSO_AUTH_TOKEN");

const env: VaultBridgeEnv = {
  DB: new TursoDatabase(databaseUrl, authToken),
  TURSO_DATABASE_URL: databaseUrl,
  TURSO_AUTH_TOKEN: authToken,
  WORKER_VERSION: process.env.WORKER_VERSION ?? "0.1.0",
  PROTOCOL_VERSION: process.env.PROTOCOL_VERSION ?? "1",
  BOOTSTRAP_DISABLED: process.env.BOOTSTRAP_DISABLED,
};

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive"]);

function requestHeaders(req: IncomingMessage): Headers {
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
  return headers;
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

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const body = await readBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: requestHeaders(req),
    body: body === undefined ? undefined : copyBytes(body),
  });
  const response = await handleVaultBridgeRequest(request, env);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") {
      return;
    }
    res.setHeader(key, value);
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes);
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const server = createServer((req, res) => {
  onRequest(req, res).catch((err: unknown) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : "server error");
  });
});

server.listen(port, host, () => {
  console.log(`VaultBridge listening on http://${host}:${port}`);
});
