/**
 * Second device joins through the plugin session helpers against the harness.
 * A wrong recovery phrase must fail before the guest settings are stored.
 */
import { describe, expect, it } from "vitest";
import { randomId, sha256HexBytes } from "@vaultbridge/crypto";
import type { DevicesResponse } from "@vaultbridge/protocol";
import { createWorkerHarness, type WorkerHarness } from "@vaultbridge/shared-testkit";
import type { HttpSender } from "@vaultbridge/sync-core";
import { FakeVault } from "../packages/sync-core/tests/fakes.js";
import { ensureDevice, createInvitation, joinWithInvitation, openEngine } from "../packages/plugin/src/session.js";
import { emptySettings } from "../packages/plugin/src/settings.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function seedBootstrapToken(harness: WorkerHarness): Promise<string> {
  const token = randomId(24);
  await harness.db
    .prepare("INSERT INTO bootstrap_credentials (credential_hash, created_at) VALUES (?1, ?2)")
    .bind(await sha256HexBytes(enc.encode(token)), new Date().toISOString())
    .run();
  return token;
}

function harnessSender(harness: WorkerHarness): HttpSender {
  return async (method, path, init) => {
    const res = await harness.call(method, `/v1${path}`, {
      token: init.token,
      body: init.json,
      rawBody: init.rawBody,
      query: init.query,
      headers: { "x-vb-protocol": String(init.protocolVersion ?? 1) },
    });
    return { status: res.status, body: res.body };
  };
}

describe("plugin join on a second device", () => {
  it("copies a note onto the guest after the recovery phrase unlocks the vault", async () => {
    const harness = createWorkerHarness();
    const sender = harnessSender(harness);
    const admin = emptySettings("http://harness");
    admin.bootstrapToken = await seedBootstrapToken(harness);
    await ensureDevice(admin, sender);
    expect(admin.deviceToken.startsWith("vbd_")).toBe(true);
    expect(admin.recoveryPhrase.length).toBeGreaterThan(10);
    expect(admin.bootstrapToken).toBe("");

    const adminVault = new FakeVault();
    await adminVault.writeFile("Hello.md", enc.encode("from the first device"));
    const adminEngine = await openEngine(adminVault, admin, sender, async () => undefined);
    const pushed = await adminEngine.runCycle();
    expect(pushed.pushes).toBe(1);

    const burned = await createInvitation(admin, sender);
    const guestWrong = emptySettings("http://harness");
    await expect(
      joinWithInvitation(guestWrong, sender, burned.inviteId, burned.pairingCode, "vbrk1wrongphrasewrongphrase"),
    ).rejects.toThrow();
    expect(guestWrong.deviceToken).toBe("");

    const invite = await createInvitation(admin, sender);
    const guest = emptySettings("http://harness");
    await joinWithInvitation(guest, sender, invite.inviteId, invite.pairingCode, admin.recoveryPhrase);
    expect(guest.vaultId).toBe(admin.vaultId);
    expect(guest.deviceId).not.toBe(admin.deviceId);
    expect(guest.passphrase).toBe("");
    expect(guest.deviceToken.startsWith("vbd_")).toBe(true);

    const guestVault = new FakeVault();
    const guestEngine = await openEngine(guestVault, guest, sender, async () => undefined);
    const pulled = await guestEngine.runCycle();
    expect(pulled.pulls).toBeGreaterThan(0);
    expect(dec.decode(await guestVault.readFile("Hello.md"))).toBe("from the first device");

    await guestVault.writeFile("Back.md", enc.encode("from the second device"));
    expect((await guestEngine.runCycle()).pushes).toBe(1);
    expect((await adminEngine.runCycle()).pulls).toBeGreaterThan(0);
    expect(dec.decode(await adminVault.readFile("Back.md"))).toBe("from the second device");

    const listed = await harness.call("GET", `/v1/vaults/${admin.vaultId}/devices`, { token: admin.deviceToken });
    expect(listed.status).toBe(200);
    const devices = listed.body as DevicesResponse;
    const ids = devices.devices.map((row) => row.deviceId);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(admin.deviceId);
    expect(ids).toContain(guest.deviceId);
    expect(devices.devices.find((row) => row.deviceId === admin.deviceId)?.isCurrent).toBe(true);
    expect(JSON.stringify(devices)).not.toContain("vbd_");
  });
});
