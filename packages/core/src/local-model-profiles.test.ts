import { describe, expect, it } from "vitest";
import {
  createDefaultLocalRuntimeConfig,
  getDefaultLocalModelProfile,
  getLocalModelProfileForRuntime,
  localModelProfiles,
  normalizeLocalRuntimeConfig,
  runtimeConfigSupportsLocalCapability,
  validateLocalModelProfiles,
} from "./local-model-profiles.js";

describe("local model profiles", () => {
  it("offers exactly three ModelScope multimodal profiles up to Qwen3.6 35B-A3B", () => {
    expect(localModelProfiles.map((profile) => profile.id)).toEqual([
      "local-qwen3_5-4b-q4_k_m",
      "local-qwen3_5-9b-q4_k_m",
      "local-qwen3_6-35b-a3b-ud-q4_k_m",
    ]);
    expect(localModelProfiles.every((profile) => profile.capabilities.includes("chat") && profile.capabilities.includes("vision"))).toBe(true);
    expect(localModelProfiles.every((profile) => profile.model.source === "modelscope")).toBe(true);
    expect(Math.max(...localModelProfiles.map((profile) => profile.parameters.totalBillions))).toBe(35);
    expect(localModelProfiles.at(-1)?.parameters).toEqual({ totalBillions: 35, activeBillions: 3 });
  });

  it("uses Qwen3.5 9B as the balanced default", () => {
    const profile = getDefaultLocalModelProfile("chat");

    expect(profile?.id).toBe("local-qwen3_5-9b-q4_k_m");
    expect(profile?.model.baseModelId).toBe("Qwen/Qwen3.5-9B");
    expect(profile?.model.url).toContain(`/resolve/${profile?.model.revision}/`);
  });

  it("pins every GGUF and mmproj artifact to ModelScope metadata", () => {
    expect(validateLocalModelProfiles()).toEqual({ ok: true, errors: [] });
    for (const profile of localModelProfiles) {
      expect(profile.model.url).toMatch(/^https:\/\/modelscope\.cn\//);
      expect(profile.model.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(profile.model.sizeBytes).toBeGreaterThan(0);
      expect(profile.auxiliaryModels).toHaveLength(1);
      const mmproj = profile.auxiliaryModels?.[0];
      expect(mmproj).toMatchObject({
        purpose: "mmproj",
        source: "modelscope",
        format: "gguf",
      });
      expect(mmproj?.url).toContain(`/resolve/${mmproj?.revision}/`);
      expect(mmproj?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(profile.runtime.contextSize).toBe(32_768);
      expect(profile.runtime.platforms).toContain("win32-x64");
    }
  });

  it("creates the default managed llama-server runtime from the ModelScope profile", () => {
    const config = createDefaultLocalRuntimeConfig();

    expect(config).toMatchObject({
      runtimeKind: "managed_llama_server",
      modelId: expect.stringContaining("Qwen3.5-9B-GGUF"),
      modelPath: "",
      mmprojModelId: expect.stringContaining("Qwen3.5-9B-GGUF"),
      mmprojPath: "",
      command: "llama-server",
      host: "127.0.0.1",
      port: 8000,
    });
  });

  it("migrates retired or arbitrary local model settings to the approved default", () => {
    const config = normalizeLocalRuntimeConfig({
      runtimeKind: "managed_llama_server",
      modelId: "https://example.com/custom.gguf",
      modelPath: "/models/custom.gguf",
      command: "llama-server",
    });

    expect(config.modelId).toContain("Qwen3.5-9B-GGUF");
    expect(config.modelPath).toBe("");
    expect(config.mmprojPath).toBe("");
  });

  it("keeps an explicitly selected approved profile and its matching paths", () => {
    const profile = localModelProfiles.at(-1)!;
    const mmproj = profile.auxiliaryModels![0]!;
    const config = normalizeLocalRuntimeConfig({
      runtimeKind: "managed_llama_server",
      modelId: profile.model.id,
      modelPath: "/models/qwen3_6.gguf",
      mmprojModelId: mmproj.id,
      mmprojPath: "/models/qwen3_6-mmproj.gguf",
      command: "llama-server",
    });

    expect(config.modelId).toBe(profile.model.url);
    expect(config.modelPath).toBe("/models/qwen3_6.gguf");
    expect(config.mmprojModelId).toBe(mmproj.url);
    expect(config.mmprojPath).toBe("/models/qwen3_6-mmproj.gguf");
  });

  it("matches approved runtime settings and requires the matching mmproj for vision", () => {
    const runtime = createDefaultLocalRuntimeConfig();

    expect(getLocalModelProfileForRuntime(runtime)?.id).toBe("local-qwen3_5-9b-q4_k_m");
    expect(runtimeConfigSupportsLocalCapability(runtime, "vision")).toBe(true);
    expect(runtimeConfigSupportsLocalCapability({ modelId: runtime.modelId }, "vision")).toBe(false);
    expect(runtimeConfigSupportsLocalCapability({ modelId: "custom/text-only.gguf" }, "vision")).toBe(false);
  });
});
