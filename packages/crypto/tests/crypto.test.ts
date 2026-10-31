import { describe, expect, it } from "vitest";
import {
  aeadDecrypt,
  aeadEncrypt,
  constantTimeEquals,
  CryptoError,
  DEFAULT_KDF_PARAMS_TEMPLATE,
  decryptManifest,
  deriveContentKey,
  deriveKek,
  deriveManifestKey,
  encodeAad,
  encryptManifest,
  generateKdfSalt,
  generateRecoveryKey,
  generateVaultMasterKey,
  hkdf,
  keyToPhrase,
  phraseToKey,
  randomKey,
  randomNonce,
  sha256Async,
  toBase64,
  toBase64Url,
  unwrapWithPassphrase,
  unwrapWithRecoveryKey,
  unwrapWithRecoveryPhrase,
  vaultKeyWrap,
  fromBase64,
  fromBase64Url,
  serializeEnvelope,
  deserializeEnvelope,
} from "../src/index.js";
import { contentAad, envelopeDecrypt } from "../src/envelope.js";

describe("KDF (Argon2id via hash-wasm)", () => {
  it("derives the same 32-byte KEK for identical inputs (deterministic)", async () => {
    const params = { ...DEFAULT_KDF_PARAMS_TEMPLATE, saltB64: generateKdfSalt() };
    const a = await deriveKek("correct horse", params);
    const b = await deriveKek("correct horse", params);
    expect(a.length).toBe(32);
    expect(constantTimeEquals(a, b)).toBe(true);
  });

  it("different passphrase or salt yields a different KEK", async () => {
    const params = { ...DEFAULT_KDF_PARAMS_TEMPLATE, saltB64: generateKdfSalt() };
    const a = await deriveKek("one", params);
    const b = await deriveKek("two", params);
    expect(constantTimeEquals(a, b)).toBe(false);
    const c = await deriveKek("one", {
      ...params,
      saltB64: generateKdfSalt(),
    });
    expect(constantTimeEquals(a, c)).toBe(false);
  });
});

describe("vault key wrapping (passphrase + recovery)", () => {
  it("wraps the VMK and unwraps with the same passphrase", async () => {
    const vmk = generateVaultMasterKey();
    const recovery = generateRecoveryKey();
    const wrapped = await vaultKeyWrap(vmk, "pass phrase", recovery);

    const out = await unwrapWithPassphrase(wrapped.wrappedByPassphraseB64, "pass phrase", wrapped.kdfParams);
    expect(constantTimeEquals(out, vmk)).toBe(true);
  });

  it("wrong passphrase fails closed", async () => {
    const wrapped = await vaultKeyWrap(generateVaultMasterKey(), "pass phrase", generateRecoveryKey());
    await expect(
      unwrapWithPassphrase(wrapped.wrappedByPassphraseB64, "wrong", wrapped.kdfParams),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("unwraps with raw recovery key and with the printable phrase", async () => {
    const vmk = generateVaultMasterKey();
    const recovery = generateRecoveryKey();
    const wrapped = await vaultKeyWrap(vmk, "p", recovery);

    const byRaw = await unwrapWithRecoveryKey(wrapped.wrappedByRecoveryB64, recovery);
    expect(constantTimeEquals(byRaw, vmk)).toBe(true);

    const phrase = keyToPhrase(recovery);
    expect(phrase.startsWith("vbrk1")).toBe(true);

    const byPhrase = await unwrapWithRecoveryPhrase(wrapped.wrappedByRecoveryB64, phrase);
    expect(constantTimeEquals(byPhrase, vmk)).toBe(true);
  });

  it("sub-keys are domain separated per epoch and never equal the VMK", async () => {
    const vmk = generateVaultMasterKey();
    const c1 = await deriveContentKey(vmk, 1);
    const c2 = await deriveContentKey(vmk, 2);
    const m1 = await deriveManifestKey(vmk, 1);
    expect(constantTimeEquals(c1, c2)).toBe(false);
    expect(constantTimeEquals(c1, m1)).toBe(false);
    expect(constantTimeEquals(c1, vmk)).toBe(false);
  });
});

describe("recovery phrase (bech32)", () => {
  it("round-trips 32 bytes with checksum", async () => {
    const key = randomKey();
    const phrase = keyToPhrase(key);
    const decoded = await phraseToKey(phrase);
    expect(constantTimeEquals(decoded, key)).toBe(true);
  });

  it("detects tampering in any single character", async () => {
    const key = randomKey();
    const phrase = keyToPhrase(key);
    const flat = phrase.replace(/-/g, "").toUpperCase();
    let foundValidBut = 0;
    for (let i = 0; i < flat.length; i++) {
      const candidate = (flat[i] === "Q" ? "R" : "Q").toLowerCase();
      const tampered = (flat.slice(0, i) + candidate + flat.slice(i + 1)).match(/.{1,6}/g)!.join("-");
      const attempt = phraseToKey(tampered);
      try {
        await attempt;
        foundValidBut++;
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
    expect(foundValidBut).toBe(0);
  });
});

describe("AEAD envelope", () => {
  const vaultId = "vault-aaaa-bbbb";
  const fileId = "file-1111-2222";
  const rev = "rev-3333-4444";

  it("round-trips content with bound AAD", async () => {
    const key = randomKey();
    const plaintext = new TextEncoder().encode("# hello\nline two\n");
    const aadParts = contentAad({ vaultId, fileId, revisionId: rev, keyEpoch: 1 });
    const aad = encodeAad(aadParts);
    const nonce = randomNonce();
    const enc = await aeadEncrypt({ key, nonce, plaintext, aad });
    const dec = await aeadDecrypt({ key, nonce, plaintext: enc.ciphertext, aad });
    expect(new TextDecoder().decode(dec.ciphertext)).toBe("# hello\nline two\n");
  });

  it("fails when AAD, key, or ciphertext changes (fail closed)", async () => {
    const key = randomKey();
    const ciphertextPlain = new Uint8Array([1, 2, 3, 4]);
    const aad = encodeAad(contentAad({ vaultId, fileId, revisionId: rev, keyEpoch: 1 }));
    const nonce = randomNonce();
    const enc = await aeadEncrypt({ key, nonce, plaintext: ciphertextPlain, aad });

    await expect(
      aeadDecrypt({ key, nonce, plaintext: enc.ciphertext, aad: encodeAad(contentAad({ vaultId, fileId: "other", revisionId: rev, keyEpoch: 1 })) }),
    ).rejects.toBeInstanceOf(CryptoError);

    await expect(
      aeadDecrypt({ key: randomKey(), nonce, plaintext: enc.ciphertext, aad }),
    ).rejects.toBeInstanceOf(CryptoError);

    const flipped = enc.ciphertext.slice();
    flipped[0] ^= 1;
    await expect(aeadDecrypt({ key, nonce, plaintext: flipped, aad })).rejects.toBeInstanceOf(CryptoError);
  });

  it("produces unique ciphertexts for identical plaintext (fresh nonce)", async () => {
    const key = randomKey();
    const plaintext = new Uint8Array(64).fill(0);
    const aad = encodeAad(contentAad({ vaultId, fileId, revisionId: rev, keyEpoch: 1 }));
    const e1 = await aeadEncrypt({ key, nonce: randomNonce(), plaintext, aad });
    const e2 = await aeadEncrypt({ key, nonce: randomNonce(), plaintext, aad });
    expect(constantTimeEquals(e1.ciphertext, e2.ciphertext)).toBe(false);
  });

  it("wire envelope: serializing and deserializing keeps integrity and revision binding", async () => {
    const key = randomKey();
    const plaintext = new TextEncoder().encode("body");
    const identity = { vaultId, fileId, revisionId: rev, keyEpoch: 1 };
    const aad = encodeAad(contentAad(identity));
    const nonce = randomNonce();
    const { ciphertext } = await aeadEncrypt({ key, nonce, plaintext, aad });
    const hash = await sha256Async(ciphertext);
    const env = {
      protocol: 1,
      envelopeFormat: 1,
      cipher: "AES-256-GCM" as const,
      nonceB64: toBase64(nonce),
      ciphertextB64: toBase64(ciphertext),
      integritySha256B64: toBase64(hash),
      aadHint: { purpose: "vb.file.content.v1", vaultId, fileId, keyEpoch: 1 },
    };
    const payload = serializeEnvelope(env);
    const parsed = deserializeEnvelope(payload);
    const dec = await envelopeDecrypt(parsed, key, {
      purpose: "vb.file.content.v1",
      vaultId,
      fileId,
      revisionId: rev,
      keyEpoch: 1,
    });
    expect(new TextDecoder().decode(dec)).toBe("body");
  });
});

describe("manifest encryption", () => {
  it("round-trips and enforces identity binding", async () => {
    const vmk = generateVaultMasterKey();
    const manifestKey = await hkdf(vmk, "vb/manifest/path-key/v1/epoch-1");
    const manifest = { path: "Notes ideas/Brainstorms.md", sizeBytes: 4242, mtimeMs: 1730000000000 };
    const identity = {
      vaultId: "v1",
      fileId: "f1",
      revisionId: "r1",
      keyEpoch: 1,
    };
    const { payload } = await encryptManifest(manifest, manifestKey, identity);
    const decoded = await decryptManifest(payload, manifestKey, identity);
    expect(decoded.path).toBe("Notes ideas/Brainstorms.md");
    expect(decoded.sizeBytes).toBe(4242);

    const wrongKey = await hkdf(generateVaultMasterKey(), "vb/manifest/path-key/v1/epoch-1");
    await expect(decryptManifest(payload, wrongKey, identity)).rejects.toBeInstanceOf(CryptoError);
  });
});

describe("base64 helpers", () => {
  it("base64 url round trip", () => {
    const bytes = randomKey();
    const s = toBase64Url(bytes);
    expect(s.includes("+") || s.includes("/") || s.includes("=")).toBe(false);
    expect(constantTimeEquals(fromBase64Url(s), bytes)).toBe(true);
  });

  it("fromBase64 rejects malformed input", () => {
    expect(() => fromBase64("!!!!")).toThrow();
  });
});

