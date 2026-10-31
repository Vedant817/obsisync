import { describe, expect, it } from "vitest";
import { pairingLink, pairingQrSvg, parsePairingLink } from "../src/pairing-link.js";

const payload = {
  serverUrl: "https://vaultbridge-three.vercel.app",
  inviteId: "inv-1",
  pairingCode: "code-2",
  recoveryPhrase: "vbrk1examplephrasevalue",
};

describe("pairing link", () => {
  it("round-trips the four fields", () => {
    expect(parsePairingLink(pairingLink(payload))).toEqual(payload);
  });

  it("rejects a link that is missing the phrase", () => {
    expect(parsePairingLink("obsidian://obsisync?server=https://example.com&invite=a&code=b")).toBeNull();
  });

  it("rejects a non-https server", () => {
    expect(parsePairingLink(pairingLink({ ...payload, serverUrl: "javascript:alert(1)" }))).toBeNull();
  });

  it("draws a QR that does not print the phrase", () => {
    const svg = pairingQrSvg(pairingLink(payload));
    expect(svg).toContain("<svg");
    expect(svg.includes(payload.recoveryPhrase)).toBe(false);
    expect(svg.includes(payload.pairingCode)).toBe(false);
  });
});
