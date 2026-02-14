import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptApiKey,
  decryptApiKey,
  getAuthSecret,
  getEncryptionKey,
} from "./crypto";

describe("crypto library", () => {
  beforeAll(() => {
    process.env.SECRET_KEY = "test-secret-key-at-least-32-chars-long";
  });

  it("should derive auth secret and encryption key", () => {
    const authSecret = getAuthSecret();
    const encryptionKey = getEncryptionKey();

    expect(authSecret).toBeDefined();
    expect(encryptionKey).toBeDefined();
    expect(authSecret).not.toBe(encryptionKey);
  });

  it("should encrypt and decrypt a string correctly", () => {
    const originalText = "sensitive-api-key-123";
    const userSalt = "user-uuid-salt";

    const encrypted = encryptApiKey(originalText, userSalt);
    expect(encrypted).not.toBe(originalText);

    const decrypted = decryptApiKey(encrypted, userSalt);
    expect(decrypted).toBe(originalText);
  });

  it("should fail to decrypt with wrong user salt", () => {
    const originalText = "sensitive-api-key-123";
    const userSalt = "user-uuid-salt";
    const wrongSalt = "wrong-salt";

    const encrypted = encryptApiKey(originalText, userSalt);

    expect(() => decryptApiKey(encrypted, wrongSalt)).toThrow();
  });

  it("should fail to decrypt with tampered data", () => {
    const originalText = "sensitive-api-key-123";
    const userSalt = "user-uuid-salt";

    const encrypted = encryptApiKey(originalText, userSalt);
    const tampered = Buffer.from(encrypted, "base64");
    // Flip one bit in the encrypted payload (after IV and Tag)
    tampered[30] ^= 0x01;

    expect(() =>
      decryptApiKey(tampered.toString("base64"), userSalt),
    ).toThrow();
  });
});
