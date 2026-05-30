import { mkdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const prefix = "enc:v1:";

export class SecretBox {
  private constructor(private readonly key: Buffer) {}

  static async open(dataDir: string): Promise<SecretBox> {
    await mkdir(dataDir, { recursive: true });
    const keyPath = path.join(dataDir, "session-secret.key");
    try {
      return new SecretBox(await readFile(keyPath));
    } catch {
      const key = crypto.randomBytes(32);
      await writeFile(keyPath, key, { mode: 0o600 });
      return new SecretBox(key);
    }
  }

  encrypt(plaintext: string | undefined): string | undefined {
    if (!plaintext) {
      return undefined;
    }
    if (plaintext.startsWith(prefix)) {
      return plaintext;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${prefix}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
  }

  decrypt(value: string | undefined): string | undefined {
    if (!value || !value.startsWith(prefix)) {
      return value;
    }
    const payload = Buffer.from(value.slice(prefix.length), "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
