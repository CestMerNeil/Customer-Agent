import { describe, expect, it } from "vitest";
import {
  createDefaultLocalRuntimeConfig,
  getDefaultLocalModelProfile,
  getLocalModelProfileForRuntime,
  isLegacyDefaultLocalModelId,
  localModelProfiles,
  normalizeLocalRuntimeConfig,
  runtimeConfigSupportsLocalCapability,
  validateLocalModelProfiles,
} from "./local-model-profiles.js";

describe("local model profiles", () => {
  it("defines a default chat profile backed by a ModelScope GGUF source", () => {
    const profile = getDefaultLocalModelProfile("chat");

    expect(profile).toBeDefined();
    expect(profile?.id).toBe("local-gemma-3-4b-it-q4_k_m-vision");
    expect(profile?.capabilities).toContain("chat");
    expect(profile?.capabilities).toContain("vision");
    expect(profile?.model.format).toBe("gguf");
    expect(profile?.model.source).toBe("modelscope");
    expect(profile?.model.id).toContain("google_gemma-3-4b-it-GGUF");
    expect(profile?.model.url).toMatch(/^https:\/\/(www\.)?modelscope\.cn\//);
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

    expect(config.provider).toBe("managed_llama_server");
    expect(config.modelId).toMatch(/^https:\/\/(www\.)?modelscope\.cn\//);
    expect(config.modelPath).toBe("");
    expect(config.mmprojModelId).toMatch(/^https:\/\/(www\.)?modelscope\.cn\//);
    expect(config.mmprojPath).toBe("");
    expect(config.command).toBe("llama-server");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8000);
  });

  it("validates release manifest metadata for declared local profiles", () => {
    const result = validateLocalModelProfiles();

    expect(result.ok).toBe(true);
    expect(localModelProfiles[0]?.model.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(localModelProfiles[0]?.model.sizeBytes).toBeGreaterThan(0);
    expect(localModelProfiles[0]?.auxiliaryModels?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(localModelProfiles[0]?.auxiliaryModels?.[0]?.sizeBytes).toBeGreaterThan(0);
    expect(localModelProfiles[0]?.runtime.platforms).toContain("win32-x64");
  });

  it("migrates legacy and embedded runtime settings to managed llama-server", () => {
    const config = normalizeLocalRuntimeConfig({
      provider: "llama_cpp",
      modelId: "",
      modelPath: "",
      command: "llama-server",
      host: "127.0.0.1",
      port: 8000,
    });

    expect(config.provider).toBe("managed_llama_server");
    expect(config.modelId).toMatch(/^https:\/\/(www\.)?modelscope\.cn\//);
    expect(config.command).toBe("llama-server");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8000);
  });

  it("migrates previous defaults to the Gemma multimodal default", () => {
    const config = normalizeLocalRuntimeConfig({
      provider: "managed_llama_server",
      modelId: "https://modelscope.cn/models/ggml-org/gemma-3n-E2B-it-GGUF/resolve/master/gemma-3n-E2B-it-Q8_0.gguf",
      modelPath: "/old/gemma3n.gguf",
      mmprojPath: "/old/mmproj.gguf",
    });

    expect(config.modelId).toContain("google_gemma-3-4b-it-GGUF");
    expect(config.modelPath).toBe("");
    expect(config.mmprojModelId).toContain("mmproj-google_gemma-3-4b-it-f16.gguf");
    expect(config.mmprojPath).toBe("");
  });

  it("identifies all previous built-in defaults as legacy model ids", () => {
    expect(isLegacyDefaultLocalModelId("qwen/Qwen2.5-0.5B-Instruct-GGUF:q4_k_m")).toBe(true);
    expect(isLegacyDefaultLocalModelId("ggml-org/gemma-3n-E2B-it-GGUF:Q8_0")).toBe(true);
    expect(isLegacyDefaultLocalModelId(localModelProfiles[0]!.model.id)).toBe(false);
  });

  it("matches runtime config to a declared local model profile and gates vision support", () => {
    const runtime = createDefaultLocalRuntimeConfig();
    const profile = getLocalModelProfileForRuntime(runtime);

    expect(profile?.id).toBe("local-gemma-3-4b-it-q4_k_m-vision");
    expect(runtimeConfigSupportsLocalCapability(runtime, "vision")).toBe(true);
    expect(runtimeConfigSupportsLocalCapability({ modelId: "custom/text-only.gguf" }, "vision")).toBe(false);
  });
});
