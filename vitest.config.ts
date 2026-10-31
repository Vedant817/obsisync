import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts", "tests/**/*.test.ts"],
    // 'forks' keeps a single V8 realm: avoids globalThis.crypto's strict
    // ArrayBuffer/TypedArray instanceof checks across different contexts
    // (a known source of 'not instance of ArrayBuffer' failures under vm isolation)
    pool: "forks",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
