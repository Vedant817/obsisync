import {
  deriveContentKey,
  deriveManifestKey,
  generateRecoveryKey,
  generateVaultMasterKey,
  keyToPhrase,
  randomId,
  sha256HexBytes,
  unwrapWithPassphrase,
  unwrapWithRecoveryPhrase,
  vaultKeyWrap,
} from "@vaultbridge/crypto";
import type { BootstrapResponse, PairCompleteResponse, VaultStateWire } from "@vaultbridge/protocol";
import {
  createSyncEngine,
  HttpSyncTransport,
  parseJournal,
  serializeJournal,
  SyncJournal,
  type HttpSender,
  type JournalPersistence,
  type LocalVault,
  type SyncEngine,
} from "@vaultbridge/sync-core";
import type { VaultBridgeSettings } from "./settings.js";

export function createFetchSender(baseUrl: string, fetchImpl: typeof fetch = fetch): HttpSender {
  const root = baseUrl.replace(/\/$/, "");
  return async (method, path, init) => {
    const url = new URL(`${root}/v1${path.startsWith("/") ? path : `/${path}`}`);
    if (init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        url.searchParams.set(key, value);
      }
    }
    const headers: Record<string, string> = {
      "x-vb-protocol": String(init.protocolVersion ?? 1),
    };
    if (init.token) {
      headers.authorization = `Bearer ${init.token}`;
    }
    let body: BodyInit | undefined;
    if (init.rawBody) {
      headers["content-type"] = "application/octet-stream";
      body = copyBytes(init.rawBody);
    } else if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.json);
    }
    const response = await fetchImpl(url, { method, headers, body });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed };
  };
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export async function ensureDevice(
  settings: VaultBridgeSettings,
  sender: HttpSender,
): Promise<VaultBridgeSettings> {
  if (settings.deviceToken && settings.vaultId && settings.deviceId && settings.passphrase) {
    return settings;
  }
  if (!settings.bootstrapToken) {
    throw new Error("This device has no VaultBridge credential yet.");
  }
  const vmk = generateVaultMasterKey();
  const recoveryKey = generateRecoveryKey();
  const passphrase = randomId(24);
  const wrapped = await vaultKeyWrap(vmk, passphrase, recoveryKey);
  const kdfParams = wrapped.kdfParams;
  const result = await sender("POST", "/bootstrap", {
    token: "",
    json: {
      bootstrapToken: settings.bootstrapToken,
      keyEpoch: 1,
      wrappedVaultKeyB64: wrapped.wrappedByPassphraseB64,
      wrappedVaultKeyRecoveryB64: wrapped.wrappedByRecoveryB64,
      kdfParamsJson: JSON.stringify(kdfParams),
    },
  });
  if (result.status !== 201 && result.status !== 200) {
    const message = result.body && typeof result.body === "object" && "message" in result.body
      ? String((result.body as { message: unknown }).message)
      : `bootstrap failed (${result.status})`;
    throw new Error(message);
  }
  const body = result.body as BootstrapResponse;
  settings.vaultId = body.vaultId;
  settings.deviceId = body.deviceId;
  settings.deviceToken = body.deviceToken;
  settings.passphrase = passphrase;
  settings.wrappedVaultKeyB64 = wrapped.wrappedByPassphraseB64;
  settings.wrappedVaultKeyRecoveryB64 = wrapped.wrappedByRecoveryB64;
  settings.kdfParamsJson = JSON.stringify(kdfParams);
  settings.recoveryPhrase = keyToPhrase(recoveryKey);
  settings.bootstrapToken = "";
  return settings;
}

export interface PairingInvite {
  inviteId: string;
  pairingCode: string;
  expiresAt: string;
}

export async function createInvitation(settings: VaultBridgeSettings, sender: HttpSender): Promise<PairingInvite> {
  if (!settings.deviceToken || !settings.vaultId) {
    throw new Error("This device is not in a vault yet.");
  }
  const result = await sender("POST", `/vaults/${settings.vaultId}/pair/invitations`, {
    token: settings.deviceToken,
    json: { ttlSeconds: 600 },
  });
  if (result.status !== 201) {
    throw new Error(messageOf(result.body, `could not create an invitation (${result.status})`));
  }
  const body = result.body as PairingInvite;
  settings.inviteId = body.inviteId;
  settings.inviteCode = body.pairingCode;
  settings.inviteExpiresAt = body.expiresAt;
  return body;
}

/** Second device. `recoveryPhrase` is the phrase from the first device. */
export async function joinWithInvitation(
  settings: VaultBridgeSettings,
  sender: HttpSender,
  inviteId: string,
  pairingCode: string,
  recoveryPhrase: string,
): Promise<VaultBridgeSettings> {
  const proof = await sha256HexBytes(new TextEncoder().encode(`${pairingCode.trim()}:${inviteId.trim()}`));
  const result = await sender("POST", "/pair/complete", {
    token: "",
    json: { inviteId: inviteId.trim(), inviteProof: proof },
  });
  if (result.status !== 201 && result.status !== 200) {
    throw new Error(messageOf(result.body, `join failed (${result.status})`));
  }
  const body = result.body as PairCompleteResponse;
  await unlockFromPhrase(body.vaultState, recoveryPhrase.trim());
  settings.vaultId = body.vaultId;
  settings.deviceId = body.deviceId;
  settings.deviceToken = body.deviceToken;
  settings.passphrase = "";
  settings.wrappedVaultKeyB64 = body.vaultState.wrappedVaultKeyB64;
  settings.wrappedVaultKeyRecoveryB64 = body.vaultState.wrappedVaultKeyRecoveryB64;
  settings.kdfParamsJson = body.vaultState.kdfParamsJson;
  settings.recoveryPhrase = recoveryPhrase.trim();
  settings.bootstrapToken = "";
  settings.journalJson = "";
  return settings;
}

export async function openEngine(
  vault: LocalVault,
  settings: VaultBridgeSettings,
  sender: HttpSender,
  persistSettings: (settings: VaultBridgeSettings) => Promise<void>,
): Promise<SyncEngine> {
  if (!settings.deviceToken || !settings.vaultId) {
    throw new Error("VaultBridge is not set up on this device.");
  }
  const vmk = await unlockSettings(settings);
  const journal = new SyncJournal(settingsJournal(settings, persistSettings));
  await journal.load();
  return createSyncEngine({
    vault,
    transport: new HttpSyncTransport({
      vaultId: settings.vaultId,
      token: settings.deviceToken,
      sender,
    }),
    journal,
    vaultId: settings.vaultId,
    deviceId: settings.deviceId,
    keyMaterial: {
      contentKey: await deriveContentKey(vmk, 1),
      manifestKey: await deriveManifestKey(vmk, 1),
      keyEpoch: 1,
    },
  });
}

async function unlockSettings(settings: VaultBridgeSettings): Promise<Uint8Array> {
  if (settings.passphrase && settings.wrappedVaultKeyB64 && settings.kdfParamsJson) {
    return unwrapWithPassphrase(
      settings.wrappedVaultKeyB64,
      settings.passphrase,
      JSON.parse(settings.kdfParamsJson) as Parameters<typeof unwrapWithPassphrase>[2],
    );
  }
  if (settings.recoveryPhrase && settings.wrappedVaultKeyRecoveryB64) {
    return unwrapWithRecoveryPhrase(settings.wrappedVaultKeyRecoveryB64, settings.recoveryPhrase);
  }
  throw new Error("VaultBridge is locked. Enter the recovery phrase on this device.");
}

async function unlockFromPhrase(state: VaultStateWire, recoveryPhrase: string): Promise<void> {
  await unwrapWithRecoveryPhrase(state.wrappedVaultKeyRecoveryB64, recoveryPhrase);
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  return fallback;
}

function settingsJournal(
  settings: VaultBridgeSettings,
  persistSettings: (settings: VaultBridgeSettings) => Promise<void>,
): JournalPersistence {
  return {
    async load() {
      if (!settings.journalJson) {
        return null;
      }
      const parsed = parseJournal(settings.journalJson);
      return parsed.ok ? parsed.journal : null;
    },
    async save(journal) {
      settings.journalJson = serializeJournal(journal);
      await persistSettings(settings);
    },
  };
}
