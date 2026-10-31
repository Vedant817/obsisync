/**
 * VaultBridge sync API.
 *
 * Request handling is plain TypeScript over the SQL and object ports in
 * ports.ts. Tests run it against in-memory fakes. Production entry is
 * server.ts, which stores the journal and ciphertext in Turso.
 */
export { handleVaultBridgeRequest } from "./routes.js";
export type { VaultBridgeEnv } from "./routes.js";
export type {
  D1DatabaseLike,
  D1Statement,
  D1StatementResult,
  D1StatementRows,
  SqlValue,
  R2BucketLike,
  R2ObjectLike,
  R2ObjectBodyLike,
} from "./ports.js";
