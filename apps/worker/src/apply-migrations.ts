/**
 * Apply apps/worker/migrations/*.sql to Turso once, then write a fresh
 * bootstrap credential to apps/worker/.bootstrap-credential if that file
 * is absent. The credential is not printed.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./load-env.js";
import { TursoDatabase } from "./turso-db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
loadEnvFile(path.join(workerRoot, ".env"));

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

const database = new TursoDatabase(requiredEnv("TURSO_DATABASE_URL"), requiredEnv("TURSO_AUTH_TOKEN"));
const migrationsDir = path.join(workerRoot, "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const applied = await database.appliedMigrations();
const now = new Date().toISOString();
for (const name of files) {
  if (applied.has(name)) {
    console.log(`skip ${name}`);
    continue;
  }
  await database.execScript(readFileSync(path.join(migrationsDir, name), "utf8"));
  await database.markMigration(name, now);
  console.log(`applied ${name}`);
}

const credentialPath = path.join(workerRoot, ".bootstrap-credential");
const existingToken = existsSync(credentialPath) ? readFileSync(credentialPath, "utf8").trim() : "";
const existingHash = existingToken ? createHash("sha256").update(existingToken).digest("hex") : "";
const known = existingHash
  ? await database.query("SELECT credential_hash FROM bootstrap_credentials WHERE credential_hash = ?1", [existingHash])
  : { rows: [] };
if (known.rows.length > 0) {
  console.log("bootstrap credential already stored");
} else {
  const token = `vbb_${randomBytes(32).toString("base64url")}`;
  const credentialHash = createHash("sha256").update(token).digest("hex");
  await database.executeOne(
    `INSERT INTO bootstrap_credentials (credential_hash, created_at, used_at, used_by_device_id, note)
     VALUES (?1, ?2, NULL, NULL, ?3)`,
    [credentialHash, now, "initial-turso"],
  );
  writeFileSync(credentialPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(existingToken ? "replaced apps/worker/.bootstrap-credential" : "wrote apps/worker/.bootstrap-credential");
}

const vaults = await database.query("SELECT COUNT(*) AS n FROM vaults", []);
const countCell = vaults.rows[0]?.[0];
const count = countCell && "value" in countCell ? countCell.value : "0";
console.log(`vaults ${count ?? "0"}`);
