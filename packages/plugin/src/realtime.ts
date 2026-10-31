import type { SyncCycleReport } from "@vaultbridge/sync-core";

export type RealtimeOutcome = SyncCycleReport | { error: string };

/**
 * Automatic sync only. Local vault events and a short poll both call
 * `noteChange`. Overlapping cycles collapse into one follow-up run.
 */
export class RealtimeSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private queued = false;
  private stopped = false;

  constructor(
    private readonly run: () => Promise<SyncCycleReport>,
    private readonly onReport: (outcome: RealtimeOutcome) => void,
    private readonly debounceMs = 300,
  ) {}

  noteChange(): void {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.kick();
    }, this.debounceMs);
  }

  async kick(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.running) {
      this.queued = true;
      return;
    }
    this.running = true;
    try {
      this.onReport(await this.run());
    } catch (err) {
      this.onReport({ error: err instanceof Error ? err.message : "sync failed" });
    } finally {
      this.running = false;
      if (this.queued && !this.stopped) {
        this.queued = false;
        this.noteChange();
      }
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
