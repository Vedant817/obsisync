/**
 * One automatic sync of a vault folder against a running VaultBridge server.
 * Writes plugin settings into the vault so Obsidian continues that same device.
 * Does not print credentials.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiskVault } from "./disk-vault.js";
import { createFetchSender, ensureDevice, openEngine } from "./session.js";
import { emptySettings } from "./settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const vaultRoot = process.argv[2] ?? "C:\\Users\\vedan\\Documents\\Vedant";
const serverUrl = process.env.VAULTBRIDGE_URL ?? "http://127.0.0.1:8787";
const credentialPath = process.argv[3] ?? path.resolve(pluginRoot, "../../apps/worker/.bootstrap-credential");

const pluginDir = path.join(vaultRoot, ".obsidian", "plugins", "vaultbridge");
mkdirSync(pluginDir, { recursive: true });
const dataPath = path.join(pluginDir, "data.json");
const settings = existsSync(dataPath)
  ? { ...emptySettings(serverUrl), ...JSON.parse(readFileSync(dataPath, "utf8")) }
  : emptySettings(serverUrl);
settings.serverUrl = serverUrl;
if (!settings.deviceToken && existsSync(credentialPath)) {
  settings.bootstrapToken = readFileSync(credentialPath, "utf8").trim();
}

const sender = createFetchSender(serverUrl);
const health = await sender("GET", "/health", { token: "" });
if (health.status !== 200) {
  throw new Error(`VaultBridge server is not healthy (${health.status}). Start it, then retry.`);
}
await ensureDevice(settings, sender);
const persist = async (next: typeof settings) => {
  writeFileSync(dataPath, JSON.stringify(next), { encoding: "utf8" });
};
await persist(settings);
const engine = await openEngine(new DiskVault(vaultRoot), settings, sender, persist);
const report = await engine.runCycle();
settings.lastError = report.errors[0] ?? "";
settings.lastCycleAt = new Date().toISOString();
settings.lastPushes = report.pushes;
settings.lastPulls = report.pulls;
await persist(settings);

copyFileSync(path.join(pluginRoot, "manifest.json"), path.join(pluginDir, "manifest.json"));
copyFileSync(path.join(pluginRoot, "styles.css"), path.join(pluginDir, "styles.css"));
copyFileSync(path.join(pluginRoot, "main.js"), path.join(pluginDir, "main.js"));

const communityPath = path.join(vaultRoot, ".obsidian", "community-plugins.json");
const enabled = existsSync(communityPath) ? (JSON.parse(readFileSync(communityPath, "utf8")) as string[]) : [];
if (!enabled.includes("vaultbridge")) {
  enabled.push("vaultbridge");
  writeFileSync(communityPath, JSON.stringify(enabled, null, 2), { encoding: "utf8" });
}

console.log(
  `vault ${settings.vaultId} status ${report.status} pushes ${report.pushes} pulls ${report.pulls} puts ${report.dataObjectPuts} errors ${report.errors.length}`,
);
if (report.errors.length > 0) {
  console.log(report.errors.slice(0, 5).join(" | "));
  process.exitCode = 1;
}
