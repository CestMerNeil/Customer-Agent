import { mkdtemp, rm } from "node:fs/promises";
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
});
