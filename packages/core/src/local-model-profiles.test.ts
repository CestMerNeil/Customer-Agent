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
  it("defines only the Qwen2.5-VL 3B multimodal profile for the local release path", () => {
    expect(localModelProfiles).toHaveLength(1);
    expect(localModelProfiles.map((profile) => profile.id)).toEqual([
      "local-qwen2_5-vl-3b-instruct-q4_k_m",
    ]);
    expect(localModelProfiles.every((profile) => profile.capabilities.includes("vision"))).toBe(true);
    expect(localModelProfiles.every((profile) => profile.auxiliaryModels?.some((model) => model.purpose === "mmproj"))).toBe(true);
  });

  it("defines a default chat profile backed by a reviewed ModelScope GGUF source", () => {
    const profile = getDefaultLocalModelProfile("chat");

    expect(profile).toBeDefined();
    expect(profile?.id).toBe("local-qwen2_5-vl-3b-instruct-q4_k_m");
    expect(profile?.capabilities).toContain("chat");
    expect(profile?.capabilities).toContain("vision");
    expect(profile?.model.format).toBe("gguf");
    expect(profile?.model.source).toBe("modelscope");
    expect(profile?.model.id).toContain("Qwen2.5-VL-3B-Instruct-GGUF");
    expect(profile?.model.url).toMatch(/^https:\/\/modelscope\.cn\//);
    expect(profile?.auxiliaryModels?.[0]).toMatchObject({
      purpose: "mmproj",
      source: "modelscope",
      format: "gguf",
    });
  });

  it("keeps embedding capability explicit instead of implied", () => {
    const chatProfile = getDefaultLocalModelProfile("chat");
    expect(chatProfile?.capabilities).not.toContain("embedding");
    expect(localModelProfiles.every((profile) => profile.capabilities.length > 0)).toBe(true);
  });

  it("creates a default managed llama-server runtime config from the chat profile", () => {
    const config = createDefaultLocalRuntimeConfig();

    expect(config.runtimeKind).toBe("managed_llama_server");
    expect(config.modelId).toMatch(/^https:\/\/modelscope\.cn\//);
    expect(config.modelPath).toBe("");
    expect(config.mmprojModelId).toMatch(/^https:\/\/modelscope\.cn\//);
    expect(config.mmprojPath).toBe("");
    expect(config.command).toBe("llama-server");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8000);
  });

  it("validates release manifest metadata for declared local profiles", () => {
    const result = validateLocalModelProfiles();

    expect(result.ok).toBe(true);
    for (const profile of localModelProfiles) {
      expect(profile.model.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(profile.model.sizeBytes).toBeGreaterThan(0);
      expect(profile.auxiliaryModels?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(profile.auxiliaryModels?.[0]?.sizeBytes).toBeGreaterThan(0);
      expect(profile.runtime.contextSize).toBeLessThanOrEqual(8192);
      expect(profile.runtime.platforms).toContain("win32-x64");
    }
  });

  it("migrates legacy and embedded runtime settings to managed llama-server", () => {
    const config = normalizeLocalRuntimeConfig({
      modelId: "",
      modelPath: "",
      command: "llama-server",
      host: "127.0.0.1",
      port: 8000,
    });

    expect(config.runtimeKind).toBe("managed_llama_server");
    expect(config.modelId).toMatch(/^https:\/\/modelscope\.cn\//);
    expect(config.command).toBe("llama-server");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8000);
  });

  it("keeps an explicitly chosen non-default model id as-is", () => {
    const config = normalizeLocalRuntimeConfig({
      runtimeKind: "managed_llama_server",
      modelId: "https://modelscope.cn/models/ggml-org/gemma-3n-E2B-it-GGUF/resolve/master/gemma-3n-E2B-it-Q8_0.gguf",
      modelPath: "/some/gemma3n.gguf",
    });

    expect(config.modelId).toContain("gemma-3n");
    expect(config.modelPath).toBe("/some/gemma3n.gguf");
  });

  it("matches runtime config to a declared local model profile and gates vision support", () => {
    const runtime = createDefaultLocalRuntimeConfig();
    const profile = getLocalModelProfileForRuntime(runtime);

    expect(profile?.id).toBe("local-qwen2_5-vl-3b-instruct-q4_k_m");
    expect(runtimeConfigSupportsLocalCapability(runtime, "vision")).toBe(true);
    expect(runtimeConfigSupportsLocalCapability({ modelId: "custom/text-only.gguf" }, "vision")).toBe(false);
  });
});
