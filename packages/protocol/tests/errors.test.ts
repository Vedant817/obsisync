import { describe, expect, it } from "vitest";
import {
  ERROR_CLASSES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  VaultBridgeError,
  isProtocolCompatible,
  statusForCode,
  type ErrorCode,
} from "../src/index.js";
import { ERROR_CODES } from "../src/index.js";

describe("protocol version compatibility", () => {
  it("accepts the current version and within-window servers", () => {
    expect(isProtocolCompatible(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolCompatible(MIN_SUPPORTED_PROTOCOL_VERSION)).toBe(true);
  });

  it("rejects versions outside the window", () => {
    expect(isProtocolCompatible(MIN_SUPPORTED_PROTOCOL_VERSION - 1)).toBe(false);
    expect(isProtocolCompatible(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isProtocolCompatible(Number.NaN)).toBe(false);
    expect(isProtocolCompatible(Infinity)).toBe(false);
  });
});

describe("error codes", () => {
  it("every code has a stable class", () => {
    for (const code of ERROR_CODES) {
      expect(["fatal", "retryable", "pause"]).toContain(ERROR_CLASSES[code]);
    }
  });

  it("maps conflict to 409 and preserves guidance", () => {
    const err = new VaultBridgeError("REVISION_CONFLICT", "head moved", {
      guidance: "Review conflicts",
    });
    const payload = err.toPayload();

    expect(err.status).toBe(409);
    expect(statusForCode("REVISION_CONFLICT")).toBe(409);
    expect(payload).toEqual({
      code: "REVISION_CONFLICT",
      message: "head moved",
      guidance: "Review conflicts",
      retryable: false,
      status: 409,
    });
  });

  it("strips the machine prefix from user messages", () => {
    const err = new VaultBridgeError("RATE_LIMITED", "slow down");
    expect(err.toPayload().message).toBe("slow down");
    expect(err.toPayload().retryable).toBe(true);
  });

  it("unknown codes fail loudly at construction time", () => {
    expect(() => new VaultBridgeError("NOT_A_CODE" as ErrorCode, "x")).toThrow();
  });
});
