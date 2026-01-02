import crypto from "node:crypto";

/**
 * Consolidates all security secrets by deriving them from a single SECRET_KEY.
 * Uses HKDF (HMAC-based Extract-and-Expand Key Derivation Function) with SHA-256.
 */

/**
 * Derives a specific key using HKDF
 */
const keyCache = new Map<string, string>();

function deriveKey(info: string, length: number = 32): string {
  if (keyCache.has(info)) return keyCache.get(info)!;

  const SECRET_KEY = process.env.SECRET_KEY;

  if (!SECRET_KEY) {
    throw new Error(
      "CRITICAL: SECRET_KEY environment variable is missing. The application cannot start safely.",
    );
  }

  const salt = crypto.createHash("sha256").update(SECRET_KEY).digest();
  const ikm = Buffer.from(SECRET_KEY);
  const infoBuffer = Buffer.from(info);

  const derived = crypto.hkdfSync("sha256", ikm, salt, infoBuffer, length);
  const key = Buffer.from(derived).toString("hex");

  keyCache.set(info, key);
  return key;
}

export function getAuthSecret(): string {
  return deriveKey("auth-secret");
}

export function getInternalSecret(): string {
  return deriveKey("internal-bypass");
}

export function getEncryptionKey(): string {
  return deriveKey("encryption-key");
}

export function encryptApiKey(key: string, userSalt: string): string {
  const masterKey = Buffer.from(getEncryptionKey(), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);

  // Add user-specific context to the encryption
  cipher.setAAD(Buffer.from(userSalt));

  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptApiKey(encryptedData: string, userSalt: string): string {
  const masterKey = Buffer.from(getEncryptionKey(), "hex");
  const buffer = Buffer.from(encryptedData, "base64");

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(userSalt));

  const decrypted =
    decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");

  return decrypted;
}
