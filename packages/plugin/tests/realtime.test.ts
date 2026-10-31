import { describe, expect, it } from "vitest";
import type { SyncCycleReport } from "@vaultbridge/sync-core";
import { RealtimeSync } from "../src/realtime.js";

function report(pushes = 0): SyncCycleReport {
  return {
    started: true,
    pausedReason: null,
    status: "READY",
    pulls: 0,
    pushes,
    noAcksSkipped: 0,
    conflicts: 0,
    dataObjectPuts: pushes,
    errors: [],
    cursor: 1,
  };
}

describe("RealtimeSync", () => {
  it("runs a cycle from a change without a manual trigger", async () => {
    let runs = 0;
    const sync = new RealtimeSync(async () => {
      runs += 1;
      return report(1);
    }, () => undefined, 10);
    sync.noteChange();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(runs).toBe(1);
    sync.stop();
  });

  it("collapses overlapping cycles into one follow-up", async () => {
    let runs = 0;
    let release: (() => void) | null = null;
    const sync = new RealtimeSync(async () => {
      runs += 1;
      if (runs === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return report();
    }, () => undefined, 5);
    const first = sync.kick();
    sync.noteChange();
    sync.noteChange();
    release?.();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(runs).toBe(2);
    sync.stop();
  });
});
