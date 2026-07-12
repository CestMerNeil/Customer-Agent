import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

/** Prefix used for encrypted values stored in the application database. */
const valuePrefix = "enc:v1:";
/** Prefix used to distinguish an OS-protected master key from the legacy raw key file. */
const protectedKeyPrefix = "safe-storage:v1:";

/** Adapts an operating system credential service without making the database package depend on Electron. */
export interface SecretKeyProtector {
  isAvailable(): boolean;
  protect(value: string): Buffer;
  unprotect(value: Buffer): string;
}

/** Configures deterministic test keys or an optional OS-backed master-key protector. */
export interface SecretBoxOptions {
  key?: Buffer;
  protector?: SecretKeyProtector;
}

/** Encrypts persistent session material using an application-specific AES-GCM master key. */
export class SecretBox {
  /** Creates a secret box from an already validated 32-byte master key. */
  private constructor(private readonly key: Buffer) {}

  /** Opens the stored master key, migrating a legacy raw key into OS-protected storage when available. */
  static async open(dataDir: string, options: SecretBoxOptions = {}): Promise<SecretBox> {
    if (options.key) {
      return new SecretBox(validateKey(options.key));
    }
    await mkdir(dataDir, { recursive: true });
    const keyPath = path.join(dataDir, "session-secret.key");
    let storedKey: Buffer | undefined;
    try {
      storedKey = await readFile(keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (!storedKey) {
      const key = crypto.randomBytes(32);
      await writeStoredKey(keyPath, key, options.protector);
      return new SecretBox(key);
    }
    if (storedKey.toString("utf8").startsWith(protectedKeyPrefix)) {
      if (!options.protector?.isAvailable()) {
        throw new Error("OS-backed secret storage is unavailable for the existing session key.");
      }
      return new SecretBox(decodeProtectedKey(storedKey, options.protector));
    }

    const legacyKey = validateKey(storedKey);
    if (options.protector?.isAvailable()) {
      await writeStoredKey(keyPath, legacyKey, options.protector);
    }
    return new SecretBox(legacyKey);
  }

  /** Encrypts plaintext unless it is empty or already in this box's encrypted representation. */
  encrypt(plaintext: string | undefined): string | undefined {
    if (!plaintext) {
      return undefined;
    }
    if (plaintext.startsWith(valuePrefix)) {
      return plaintext;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${valuePrefix}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
  }

  /** Decrypts a value previously encrypted by this box and returns plaintext values unchanged. */
  decrypt(value: string | undefined): string | undefined {
    if (!value || !value.startsWith(valuePrefix)) {
      return value;
    }
    const payload = Buffer.from(value.slice(valuePrefix.length), "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}

/** Rejects malformed master keys before they are used for AES-256-GCM operations. */
function validateKey(key: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error("Session master key must be exactly 32 bytes.");
  }
  return key;
}

/** Decodes a master key protected by the operating system's credential service. */
function decodeProtectedKey(storedKey: Buffer, protector: SecretKeyProtector): Buffer {
  const protectedPayload = Buffer.from(storedKey.toString("utf8").slice(protectedKeyPrefix.length), "base64");
  return validateKey(Buffer.from(protector.unprotect(protectedPayload), "base64"));
}

/** Stores a master key atomically, using OS protection whenever the caller supplies an available protector. */
async function writeStoredKey(keyPath: string, key: Buffer, protector: SecretKeyProtector | undefined): Promise<void> {
  const content = protector?.isAvailable()
    ? Buffer.from(`${protectedKeyPrefix}${protector.protect(key.toString("base64")).toString("base64")}`, "utf8")
    : key;
  const temporaryPath = `${keyPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { mode: 0o600 });
  await rename(temporaryPath, keyPath);
}
