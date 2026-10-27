import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptApiKey, encryptApiKey } from "../server/credential-vault.server";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("API_KEY_ENCRYPTION_KEY", Buffer.alloc(32, 31).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("account-bound API-key encryption", () => {
  it("encrypts and decrypts without placing plaintext in the stored envelope", async () => {
    const row = await encryptApiKey("sk-test-private-value", "user-a", "openai");
    expect(JSON.stringify(row)).not.toContain("sk-test-private-value");
    expect(Buffer.from(row.nonce, "base64")).toHaveLength(12);
    expect(await decryptApiKey(row, "user-a", "openai")).toBe("sk-test-private-value");
  });
  it("uses a fresh nonce for each save", async () => {
    const a = await encryptApiKey("same-key", "user-a", "anthropic");
    const b = await encryptApiKey("same-key", "user-a", "anthropic");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("rejects another user, another provider and tampered ciphertext", async () => {
    const row = await encryptApiKey("test-private-value", "user-a", "openai");
    await expect(decryptApiKey(row, "user-b", "openai")).rejects.toThrow("could not be decrypted");
    await expect(decryptApiKey(row, "user-a", "anthropic")).rejects.toThrow(
      "could not be decrypted",
    );
    const tampered = Buffer.from(row.ciphertext, "base64");
    tampered[0] = tampered[0]! ^ 1;
    await expect(
      decryptApiKey({ ...row, ciphertext: tampered.toString("base64") }, "user-a", "openai"),
    ).rejects.toThrow("could not be decrypted");
  });
  it("fails closed if the server encryption key is missing or invalid", async () => {
    vi.stubEnv("API_KEY_ENCRYPTION_KEY", "");
    await expect(encryptApiKey("test-key", "user-a", "openai")).rejects.toThrow("not configured");
    vi.stubEnv("API_KEY_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    await expect(encryptApiKey("test-key", "user-a", "openai")).rejects.toThrow("not configured");
  });
});
