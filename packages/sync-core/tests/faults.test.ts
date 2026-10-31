import { describe, expect, it } from "vitest";
import { CryptoError } from "@vaultbridge/crypto";
import { classifySyncFault } from "../src/faults.js";
import { HttpTransportError, SyncTransportUnavailableError } from "../src/ports.js";

describe("sync fault policy", () => {
  it("retries a dropped request without treating it as a bad note", () => {
    const decision = classifySyncFault(new SyncTransportUnavailableError("network_failure"), {
      contentOpens: 0,
      attempts: 0,
    });
    expect(decision.action).toBe("retry-cycle");
    expect(decision.message).toContain("next poll");
  });

  it("retries a sign-in failure on the next poll", () => {
    const decision = classifySyncFault(new SyncTransportUnavailableError("auth_401"), {
      contentOpens: 2,
      attempts: 4,
    });
    expect(decision.action).toBe("retry-cycle");
  });

  it("skips a corrupt envelope so later notes can sync", () => {
    const decision = classifySyncFault(new CryptoError("envelope is not valid JSON (corrupted transfer?)"), {
      contentOpens: 0,
      attempts: 0,
    });
    expect(decision.action).toBe("skip-event");
  });

  it("keeps a sealed note in place until some other note has opened", () => {
    const decision = classifySyncFault(
      new CryptoError("AEAD authentication failed (corrupted ciphertext, wrong key or mismatched AAD)"),
      { contentOpens: 0, attempts: 5 },
    );
    expect(decision.action).toBe("retry-event");
  });

  it("skips one sealed note after another note in the same cycle opened", () => {
    const decision = classifySyncFault(
      new CryptoError("AEAD authentication failed (corrupted ciphertext, wrong key or mismatched AAD)"),
      { contentOpens: 1, attempts: 0 },
    );
    expect(decision.action).toBe("skip-event");
  });

  it("retries a missing object twice, then continues", () => {
    const first = classifySyncFault(new Error("blob object missing on server"), { contentOpens: 0, attempts: 0 });
    const later = classifySyncFault(new Error("blob object missing on server"), { contentOpens: 0, attempts: 2 });
    expect(first.action).toBe("retry-event");
    expect(later.action).toBe("skip-event");
  });

  it("does not skip an unexpected error", () => {
    const decision = classifySyncFault(new HttpTransportError(500, null, "commit"), { contentOpens: 3, attempts: 9 });
    expect(decision.action).toBe("retry-event");
  });
});
