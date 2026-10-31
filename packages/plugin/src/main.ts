import { Notice, Platform, Plugin, PluginSettingTab, requestUrl } from "obsidian";
import type { HttpSender, SyncCycleOptions, SyncCycleReport, SyncEngine } from "@vaultbridge/sync-core";
import { ObsidianLocalVault } from "./obsidian-vault.js";
import { RealtimeSync, type RealtimeOutcome } from "./realtime.js";
import { createInvitation, ensureDevice, joinWithInvitation, openEngine } from "./session.js";
import {
  conflictsFromJournal,
  filesFromJournal,
  renderSettings,
  type ConflictRow,
  type SettingsHost,
  type TrackedFile,
} from "./settings-tab.js";
import { parsePairingParams, type PairingPayload } from "./pairing-link.js";
import { canonicalServerUrl, emptySettings, type VaultBridgeSettings } from "./settings.js";

export default class VaultBridgePlugin extends Plugin implements SettingsHost {
  override settings: VaultBridgeSettings = emptySettings();
  readonly plugin = this;
  private realtime: RealtimeSync | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private status: HTMLElement | null = null;
  private engine: SyncEngine | null = null;
  private wired = false;

  override async onload(): Promise<void> {
    this.status = this.addStatusBarItem();
    this.settings = Object.assign(emptySettings(), await this.loadData());
    this.settings.serverUrl = canonicalServerUrl(this.settings.serverUrl);
    this.settings.pollMs = this.settings.pollMs > 0 ? this.settings.pollMs : 1000;
    await this.saveSettings();
    this.addSettingTab(new VaultBridgeSettingTab(this));
    this.registerObsidianProtocolHandler("obsisync", (params) => {
      void this.joinFromScan(params);
    });
    this.setStatus("Sealed Sync live · starting");
    this.app.workspace.onLayoutReady(() => {
      void this.start();
    });
  }

  override onunload(): void {
    this.stopLoops();
  }

  async start(): Promise<void> {
    this.stopLoops();
    this.engine = null;
    try {
      const sender = this.sender();
      if (!this.settings.deviceToken) {
        if (!this.settings.bootstrapToken) {
          this.setStatus("Sealed Sync live · set up");
          return;
        }
        await ensureDevice(this.settings, sender);
        await this.saveSettings();
      }
      if (!this.settings.passphrase && !this.settings.recoveryPhrase) {
        this.setStatus("Sealed Sync live · locked");
        return;
      }
      const engine = await openEngine(new ObsidianLocalVault(this.app.vault), this.settings, sender, async (next) => {
        this.settings = next;
        await this.saveSettings();
      });
      this.engine = engine;
      if (this.settings.uploadsPaused) {
        await engine.pause("uploads paused");
      }
      this.realtime = new RealtimeSync(async () => engine.runCycle(cycleOptions()), (outcome) => {
        void this.showOutcome(outcome);
      });
      this.wireVault();
      const pollMs = Platform.isMobile && this.settings.pollMs === 1000 ? 5_000 : this.settings.pollMs;
      this.poll = setInterval(() => this.realtime?.noteChange(), pollMs);
      this.registerInterval(this.poll as unknown as number);
      if (!this.settings.uploadsPaused) {
        this.realtime.noteChange();
      }
      this.setStatus(this.settings.uploadsPaused ? "Sealed Sync live · paused" : "Sealed Sync live");
      if (officialSyncEnabled(this.app)) {
        new Notice("Sealed Sync is syncing this vault in realtime. Obsidian Sync is also enabled. Use one sync service so they do not overwrite each other.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync failed to start";
      this.settings.lastError = message;
      await this.saveSettings();
      this.setStatus("Sealed Sync live · offline");
      new Notice(`Sealed Sync: ${message}`);
    }
  }

  private async joinFromScan(params: Record<string, string>): Promise<void> {
    const payload = parsePairingParams(params);
    if (!payload) {
      new Notice("Sealed Sync could not read that pairing QR.");
      return;
    }
    await this.joinFromPayload(payload);
  }

  private async joinFromPayload(payload: PairingPayload): Promise<void> {
    if (this.settings.deviceToken) {
      new Notice("This device is already in a vault. Scan the QR on a device that has not joined yet.");
      return;
    }
    this.settings.serverUrl = canonicalServerUrl(payload.serverUrl);
    await this.saveSettings();
    try {
      await this.joinVault(payload.inviteId, payload.pairingCode, payload.recoveryPhrase);
    } catch (err) {
      new Notice(err instanceof Error ? err.message : "Sealed Sync could not join from that QR.");
    }
  }

  async makeInvite(): Promise<void> {
    const invite = await createInvitation(this.settings, this.sender());
    await this.saveSettings();
    new Notice(`Pairing code ready until ${invite.expiresAt}.`);
  }

  async joinVault(inviteId: string, pairingCode: string, recoveryPhrase: string): Promise<void> {
    await joinWithInvitation(this.settings, this.sender(), inviteId, pairingCode, recoveryPhrase);
    await this.saveSettings();
    await this.start();
    new Notice("Joined the vault. Sync is running.");
  }

  async setUploadsPaused(paused: boolean): Promise<void> {
    this.settings.uploadsPaused = paused;
    await this.saveSettings();
    if (!this.engine) {
      return;
    }
    if (paused) {
      await this.engine.pause("uploads paused");
      this.setStatus("Sealed Sync live · paused");
      return;
    }
    await this.engine.resume();
    this.realtime?.noteChange();
    this.setStatus("Sealed Sync live");
  }

  async resolveConflict(fileId: string, choice: "local" | "remote"): Promise<void> {
    if (!this.engine) {
      return;
    }
    await this.engine.resolveConflict(fileId, choice);
    this.realtime?.noteChange();
  }

  conflictRows(): ConflictRow[] {
    return conflictsFromJournal(this.settings.journalJson);
  }

  trackedFiles(): TrackedFile[] {
    return filesFromJournal(this.settings.journalJson);
  }

  sender(): HttpSender {
    return obsidianSender(this.settings.serverUrl);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async showOutcome(outcome: RealtimeOutcome): Promise<void> {
    if ("error" in outcome) {
      this.settings.lastError = outcome.error;
      this.setStatus("Sealed Sync live · offline");
      await this.saveSettings();
      return;
    }
    const report: SyncCycleReport = outcome;
    this.settings.lastError = report.errors[0] ?? "";
    this.settings.lastCycleAt = new Date().toISOString();
    this.settings.lastPushes = report.pushes;
    this.settings.lastPulls = report.pulls;
    if (report.pausedReason) {
      this.setStatus("Sealed Sync live · paused");
    } else if (report.status === "OFFLINE" || report.errors.length > 0) {
      this.setStatus("Sealed Sync live · offline");
    } else if (report.conflicts > 0 || report.status === "CONFLICT") {
      this.setStatus("Sealed Sync live · conflict");
    } else if (report.pushes > 0 || report.pulls > 0) {
      this.setStatus("Sealed Sync live · syncing");
    } else {
      this.setStatus("Sealed Sync live");
    }
    await this.saveSettings();
  }

  private setStatus(text: string): void {
    this.status?.setText(text);
  }

  private stopLoops(): void {
    this.realtime?.stop();
    this.realtime = null;
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }

  private wireVault(): void {
    if (this.wired) {
      return;
    }
    this.wired = true;
    this.registerEvent(this.app.vault.on("create", () => this.realtime?.noteChange()));
    this.registerEvent(this.app.vault.on("modify", () => this.realtime?.noteChange()));
    this.registerEvent(this.app.vault.on("delete", () => this.realtime?.noteChange()));
    this.registerEvent(this.app.vault.on("rename", () => this.realtime?.noteChange()));
  }
}

class VaultBridgeSettingTab extends PluginSettingTab {
  constructor(private readonly bridge: VaultBridgePlugin) {
    super(bridge.app, bridge);
  }

  override display(): void {
    const { containerEl } = this;
    const redraw = (): void => {
      containerEl.empty();
      renderSettings(containerEl, this.bridge, redraw);
    };
    redraw();
  }
}

function cycleOptions(): SyncCycleOptions | undefined {
  if (!Platform.isMobile) {
    return undefined;
  }
  return { budget: { maxUploadsPerCycle: 8, maxPendingForAutoRun: 200 } };
}

function obsidianSender(baseUrl: string): HttpSender {
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
    let body: string | ArrayBuffer | undefined;
    if (init.rawBody) {
      headers["content-type"] = "application/octet-stream";
      body = copyBytes(init.rawBody);
    } else if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.json);
    }
    const response = await requestUrl({
      url: url.toString(),
      method,
      headers,
      body,
      throw: false,
    });
    let parsed: unknown = null;
    if (response.text) {
      try {
        parsed = response.json as unknown;
      } catch {
        parsed = response.text;
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

function officialSyncEnabled(app: VaultBridgePlugin["app"]): boolean {
  const internal = app as unknown as {
    internalPlugins?: { getPluginById?: (id: string) => { enabled?: boolean } | null };
  };
  return internal.internalPlugins?.getPluginById?.("sync")?.enabled === true;
}
