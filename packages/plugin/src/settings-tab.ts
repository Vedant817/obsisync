import { Notice, Setting, type App, type Plugin } from "obsidian";
import type { HttpSender } from "@vaultbridge/sync-core";
import { parseJournal } from "@vaultbridge/sync-core";
import type { VaultBridgeSettings } from "./settings.js";

export interface ConflictRow {
  fileId: string;
  path: string;
  otherPath: string | null;
  origin: string;
}

export interface TrackedFile {
  fileId: string;
  path: string;
}

export interface SettingsHost {
  app: App;
  plugin: Plugin;
  settings: VaultBridgeSettings;
  saveSettings(): Promise<void>;
  start(): Promise<void>;
  makeInvite(): Promise<void>;
  joinVault(inviteId: string, pairingCode: string, recoveryPhrase: string): Promise<void>;
  setUploadsPaused(paused: boolean): Promise<void>;
  resolveConflict(fileId: string, choice: "local" | "remote"): Promise<void>;
  conflictRows(): ConflictRow[];
  trackedFiles(): TrackedFile[];
  sender(): HttpSender;
}

interface DeviceWire {
  deviceId: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
}

interface UsageWire {
  storageEstimateBytes: number;
  objectCount: number;
  revisionCount: number;
  deviceCount: number;
}

export function renderSettings(container: HTMLElement, host: SettingsHost, redraw: () => void): void {
  container.addClass("vaultbridge-settings");
  container.createEl("h2", { text: "VaultBridge" });
  const ready = Boolean(host.settings.deviceToken && host.settings.vaultId);
  container.createEl("p", {
    cls: "vaultbridge-live",
    text: ready
      ? "Realtime sync is on. Edits upload on their own, and this device checks for remote changes about once a second."
      : "This device is not in a vault yet. Join with a pairing code, or paste a one-time setup token.",
  });

  new Setting(container)
    .setName("API address")
    .setDesc("Already set to the VaultBridge server. A phone on mobile data uses this same address. Reload Obsidian after you change it.")
    .addText((text) => {
      text.setValue(host.settings.serverUrl).onChange(async (value) => {
        host.settings.serverUrl = value.trim() || "http://127.0.0.1:8787";
        await host.saveSettings();
      });
    });

  if (!ready) {
    renderJoin(container, host);
    renderBootstrap(container, host);
    return;
  }

  renderRecovery(container, host);
  renderInvite(container, host, redraw);
  renderPause(container, host);
  renderStatus(container, host);
  renderConflicts(container, host, redraw);
  renderHistory(container, host);
  renderRemote(container, host, redraw);
}

function renderJoin(container: HTMLElement, host: SettingsHost): void {
  container.createEl("h3", { text: "Join a vault" });
  let inviteId = "";
  let pairingCode = "";
  let recoveryPhrase = "";
  new Setting(container).setName("Invite id").addText((text) => {
    text.onChange((value) => {
      inviteId = value.trim();
    });
  });
  new Setting(container).setName("Pairing code").addText((text) => {
    text.onChange((value) => {
      pairingCode = value.trim();
    });
  });
  new Setting(container)
    .setName("Recovery phrase")
    .setDesc("The phrase shown on the first device. A wrong phrase uses up the pairing code.")
    .addTextArea((text) => {
      text.onChange((value) => {
        recoveryPhrase = value.trim();
      });
    });
  new Setting(container).addButton((button) => {
    button.setButtonText("Join vault").setCta().onClick(() => {
      void host.joinVault(inviteId, pairingCode, recoveryPhrase).catch((err: unknown) => {
        new Notice(messageOf(err));
      });
    });
  });
}

function renderBootstrap(container: HTMLElement, host: SettingsHost): void {
  container.createEl("h3", { text: "Or start a new vault" });
  new Setting(container)
    .setName("Setup token")
    .setDesc("One-time token from the server. Leave this empty when you are joining an existing vault.")
    .addText((text) => {
      text.setValue(host.settings.bootstrapToken).onChange(async (value) => {
        host.settings.bootstrapToken = value.trim();
        await host.saveSettings();
      });
    });
  new Setting(container).addButton((button) => {
    button.setButtonText("Create vault on this device").onClick(() => {
      void host.start().catch((err: unknown) => {
        new Notice(messageOf(err));
      });
    });
  });
}

function renderRecovery(container: HTMLElement, host: SettingsHost): void {
  container.createEl("h3", { text: "Recovery phrase" });
  container.createEl("p", {
    text: "Type this phrase on the second device. It unwraps the vault key. It stays on this device only.",
  });
  const box = container.createEl("textarea", { cls: "vaultbridge-secret" });
  box.value = host.settings.recoveryPhrase;
  box.rows = 3;
  box.addEventListener("change", () => {
    host.settings.recoveryPhrase = box.value.trim();
    void host.saveSettings();
  });
}

function renderInvite(container: HTMLElement, host: SettingsHost, redraw: () => void): void {
  container.createEl("h3", { text: "Pair a second device" });
  container.createEl("p", {
    text: "The code works once and expires ten minutes after you create it. Create a new one if it expires.",
  });
  if (host.settings.inviteId && host.settings.inviteCode) {
    container.createEl("p", { text: `Invite id: ${host.settings.inviteId}` });
    container.createEl("p", { cls: "vaultbridge-secret", text: `Pairing code: ${host.settings.inviteCode}` });
    container.createEl("p", { text: host.settings.inviteExpiresAt ? `Expires ${host.settings.inviteExpiresAt}` : "" });
  }
  new Setting(container).addButton((button) => {
    button.setButtonText("Create a pairing code").setCta().onClick(() => {
      void host.makeInvite().then(redraw).catch((err: unknown) => {
        new Notice(messageOf(err));
      });
    });
  });
}

function renderPause(container: HTMLElement, host: SettingsHost): void {
  new Setting(container)
    .setName("Pause sync")
    .setDesc("Holds uploads and downloads until you turn this off.")
    .addToggle((toggle) => {
      toggle.setValue(host.settings.uploadsPaused).onChange((value) => {
        void host.setUploadsPaused(value);
      });
    });
}

function renderStatus(container: HTMLElement, host: SettingsHost): void {
  const last = host.settings.lastCycleAt
    ? `Last cycle ${host.settings.lastCycleAt}. Pushed ${host.settings.lastPushes}, pulled ${host.settings.lastPulls}.`
    : "Waiting for the first cycle.";
  container.createEl("p", { text: last });
  if (host.settings.lastError) {
    container.createEl("p", { text: host.settings.lastError });
  }
}

function renderConflicts(container: HTMLElement, host: SettingsHost, redraw: () => void): void {
  const rows = host.conflictRows();
  if (rows.length === 0) {
    return;
  }
  container.createEl("h3", { text: "Conflicts" });
  for (const row of rows) {
    const setting = new Setting(container)
      .setName(row.path)
      .setDesc(`${row.origin}${row.otherPath ? `. Other copy: ${row.otherPath}` : ""}`);
    setting.addButton((button) => {
      button.setButtonText("Keep mine").onClick(() => {
        void host.resolveConflict(row.fileId, "local").then(redraw);
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Keep theirs").onClick(() => {
        void host.resolveConflict(row.fileId, "remote").then(redraw);
      });
    });
  }
}

function renderHistory(container: HTMLElement, host: SettingsHost): void {
  const files = host.trackedFiles();
  container.createEl("h3", { text: "Notes on this device" });
  if (files.length === 0) {
    container.createEl("p", { text: "No synced notes yet." });
    return;
  }
  const list = container.createEl("ul");
  for (const file of files.slice(0, 40)) {
    list.createEl("li", { text: file.path });
  }
  if (files.length > 40) {
    container.createEl("p", { text: `${files.length - 40} more notes are in the journal.` });
  }
}

function renderRemote(container: HTMLElement, host: SettingsHost, redraw: () => void): void {
  container.createEl("h3", { text: "Vault" });
  const summary = container.createEl("p", { text: "Open this page again after a cycle to refresh, or use the button." });
  const list = container.createEl("div");
  new Setting(container).addButton((button) => {
    button.setButtonText("Refresh vault info").onClick(() => {
      void loadRemote(host, summary, list, redraw);
    });
  });
}

async function loadRemote(
  host: SettingsHost,
  summary: HTMLElement,
  list: HTMLElement,
  redraw: () => void,
): Promise<void> {
  try {
    const sender = host.sender();
    const vaultId = host.settings.vaultId;
    const usageResult = await sender("GET", `/vaults/${vaultId}/usage`, { token: host.settings.deviceToken });
    const devicesResult = await sender("GET", `/vaults/${vaultId}/devices`, { token: host.settings.deviceToken });
    if (usageResult.status !== 200) {
      throw new Error(messageOf(usageResult.body));
    }
    const usage = usageResult.body as UsageWire;
    summary.setText(
      `${usage.deviceCount} devices, ${usage.revisionCount} revisions, ${usage.objectCount} objects, about ${usage.storageEstimateBytes} bytes.`,
    );
    list.empty();
    if (devicesResult.status === 200) {
      const devices = (devicesResult.body as { devices: DeviceWire[] }).devices ?? [];
      for (const device of devices) {
        const label = device.isCurrent ? `${device.deviceId} (this device)` : device.deviceId;
        const state = device.revokedAt ? `revoked ${device.revokedAt}` : `joined ${device.createdAt}`;
        const setting = new Setting(list).setName(label).setDesc(state);
        if (!device.isCurrent && !device.revokedAt) {
          setting.addButton((button) => {
            button.setButtonText("Revoke").onClick(() => {
              void revokeDevice(host, device.deviceId).then(redraw);
            });
          });
        }
      }
    }
  } catch (err) {
    new Notice(messageOf(err));
  }
}

async function revokeDevice(host: SettingsHost, deviceId: string): Promise<void> {
  const result = await host.sender()("POST", `/vaults/${host.settings.vaultId}/devices/${deviceId}/revoke`, {
    token: host.settings.deviceToken,
  });
  if (result.status !== 200) {
    throw new Error(messageOf(result.body));
  }
  new Notice("Device revoked. It can no longer sync this vault.");
}

export function filesFromJournal(journalJson: string): TrackedFile[] {
  if (!journalJson) {
    return [];
  }
  const parsed = parseJournal(journalJson);
  if (!parsed.ok) {
    return [];
  }
  return Object.values(parsed.journal.files)
    .filter((file) => !file.localPath.startsWith(".vb-conflict-"))
    .map((file) => ({ fileId: file.fileId, path: file.localPath }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function conflictsFromJournal(journalJson: string): ConflictRow[] {
  if (!journalJson) {
    return [];
  }
  const parsed = parseJournal(journalJson);
  if (!parsed.ok) {
    return [];
  }
  return Object.values(parsed.journal.conflicts)
    .filter((row) => !row.resolved)
    .map((row) => ({
      fileId: row.fileId,
      path: parsed.journal.files[row.fileId]?.localPath ?? row.fileId,
      otherPath: row.otherPath,
      origin: row.origin,
    }));
}

function messageOf(body: unknown): string {
  if (body instanceof Error) {
    return body.message;
  }
  if (body && typeof body === "object" && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  return "VaultBridge request failed";
}
