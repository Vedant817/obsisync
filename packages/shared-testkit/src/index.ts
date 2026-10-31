export { FakeD1 } from "./d1-sqlite.js";
export { FakeR2 } from "./r2-memory.js";
export { createWorkerHarness } from "./worker-harness.js";
export type { WorkerHarness, CallOptions, CallResult } from "./worker-harness.js";

/**
 * Fault injector: wrap any await point and make the nth call throw.
 * Used by tests/chaos to simulate worker/R2/network failures mid-flow.
 */
export class FaultInjector {
  private execCounter = 0;

  constructor(
    private readonly failAt: number,
    private readonly errorFactory: () => Error = () => new Error("injected fault"),
  ) {}

  async through<T>(op: () => Promise<T>): Promise<T> {
    this.execCounter++;
    if (this.execCounter === this.failAt) {
      throw this.errorFactory();
    }
    return op();
  }

  get executed(): number {
    return this.execCounter;
  }
}
