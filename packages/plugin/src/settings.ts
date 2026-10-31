/** Public sync API. Phones on any network use this address. */
export const PRODUCTION_SERVER_URL = "https://vaultbridge-three.vercel.app";

export function canonicalServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) {
    return PRODUCTION_SERVER_URL;
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const privateHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("100.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (url.protocol !== "https:" || privateHost) {
      return PRODUCTION_SERVER_URL;
    }
  } catch {
    return PRODUCTION_SERVER_URL;
  }
  return trimmed;
}

export interface VaultBridgeSettings {
  serverUrl: string;
  bootstrapToken: string;
  vaultId: string;
  deviceId: string;
  deviceToken: string;
  passphrase: string;
  wrappedVaultKeyB64: string;
  wrappedVaultKeyRecoveryB64: string;
  kdfParamsJson: string;
  recoveryPhrase: string;
  journalJson: string;
  pollMs: number;
  lastError: string;
  lastCycleAt: string;
  lastPushes: number;
  lastPulls: number;
  uploadsPaused: boolean;
  inviteId: string;
  inviteCode: string;
  inviteExpiresAt: string;
}

export function emptySettings(serverUrl: string = PRODUCTION_SERVER_URL): VaultBridgeSettings {
  return {
    serverUrl,
    bootstrapToken: "",
    vaultId: "",
    deviceId: "",
    deviceToken: "",
    passphrase: "",
    wrappedVaultKeyB64: "",
    wrappedVaultKeyRecoveryB64: "",
    kdfParamsJson: "",
    recoveryPhrase: "",
    journalJson: "",
    pollMs: 1000,
    lastError: "",
    lastCycleAt: "",
    lastPushes: 0,
    lastPulls: 0,
    uploadsPaused: false,
    inviteId: "",
    inviteCode: "",
    inviteExpiresAt: "",
  };
}
