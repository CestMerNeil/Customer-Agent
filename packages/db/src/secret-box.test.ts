import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-secret-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("SecretBox", () => {
  it("encrypts and decrypts stored session data without exposing plaintext", async () => {
    const box = await SecretBox.open(dir);
    const plaintext = "{\"PDDAccessToken\":\"token-value\"}";
    const encrypted = box.encrypt(plaintext);

    expect(encrypted).toBeDefined();
    if (!encrypted) throw new Error("encryption failed");
    expect(encrypted).not.toContain("token-value");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(box.decrypt(encrypted)).toBe(plaintext);
  });

  it("migrates a legacy raw key to an OS-protected wrapper without losing encrypted sessions", async () => {
    const legacyKey = crypto.randomBytes(32);
    await writeFile(path.join(dir, "session-secret.key"), legacyKey, { mode: 0o600 });
    const legacyBox = await SecretBox.open(dir);
    const encrypted = legacyBox.encrypt("session-token");
    const protector = {
      isAvailable: () => true,
      protect: (value: string) => Buffer.from(`protected:${value}`, "utf8"),
      unprotect: (value: Buffer) => value.toString("utf8").replace("protected:", ""),
    };

    const migratedBox = await SecretBox.open(dir, { protector });

    expect(migratedBox.decrypt(encrypted)).toBe("session-token");
    expect((await readFile(path.join(dir, "session-secret.key"), "utf8"))).toMatch(/^safe-storage:v1:/);
  });

  it("keeps the legacy key when OS protection fails during migration", async () => {
    const legacyKey = crypto.randomBytes(32);
    const keyPath = path.join(dir, "session-secret.key");
    await writeFile(keyPath, legacyKey, { mode: 0o600 });

    await expect(SecretBox.open(dir, {
      protector: {
        isAvailable: () => true,
        protect: () => {
          throw new Error("keychain unavailable");
        },
        unprotect: () => "",
      },
    })).rejects.toThrow("keychain unavailable");

    expect(await readFile(keyPath)).toEqual(legacyKey);
  });

  it("rejects protected keys when the operating system credential service is unavailable", async () => {
    const protectedBox = await SecretBox.open(dir, {
      protector: {
        isAvailable: () => true,
        protect: (value: string) => Buffer.from(value, "utf8"),
        unprotect: (value: Buffer) => value.toString("utf8"),
      },
    });
    expect(protectedBox.encrypt("session-token")).toBeDefined();

    await expect(SecretBox.open(dir, {
      protector: {
        isAvailable: () => false,
        protect: () => Buffer.alloc(0),
        unprotect: () => "",
      },
    })).rejects.toThrow("OS-backed secret storage is unavailable");
  });
});
