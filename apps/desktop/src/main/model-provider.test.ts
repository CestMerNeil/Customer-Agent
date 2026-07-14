import { describe, expect, it } from "vitest";
import { createDefaultLocalRuntimeConfig } from "@customer-agent/core";
import type { AppSettings } from "@customer-agent/core";
import { resolveModelProviderConfig } from "./model-provider.js";

/** Creates the minimum persisted settings needed by provider-routing tests. */
function settings(patch: Partial<AppSettings>): AppSettings {
  return {
    businessHours: { start: "09:00", end: "21:00" },
    knowledge: { topK: 5 },
    ...patch,
  };
}

describe("Model Provider routing", () => {
  it("routes remote multimodal work through the configured remote endpoint", () => {
    const resolved = resolveModelProviderConfig(settings({
      modelProvider: "remote",
      inference: {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "secret",
        chatModel: "qwen-vl-max",
      },
    }), "multimodal");

    expect(resolved).toMatchObject({
      kind: "remote",
      config: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", chatModel: "qwen-vl-max" },
    });
    expect("runtime" in resolved).toBe(false);
  });

  it("routes local multimodal work through the declared vision runtime", () => {
    const runtime = createDefaultLocalRuntimeConfig();
    const resolved = resolveModelProviderConfig(settings({ modelProvider: "local", inferenceRuntime: runtime }), "multimodal");

    expect(resolved).toMatchObject({ kind: "local", runtime: { modelId: runtime.modelId } });
  });

  it("migrates an unapproved local model to the multimodal default without using remote settings", () => {
    const resolved = resolveModelProviderConfig(settings({
      modelProvider: "local",
      inferenceRuntime: {
        ...createDefaultLocalRuntimeConfig(),
        modelId: "custom/text-only.gguf",
        mmprojModelId: "",
      },
      inference: {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        chatModel: "qwen-vl-max",
      },
    }), "multimodal");

    expect(resolved).toMatchObject({
      kind: "local",
      runtime: { modelId: createDefaultLocalRuntimeConfig().modelId },
    });
  });

  it("rejects a remote provider that points back to a local runtime", () => {
    expect(() => resolveModelProviderConfig(settings({
      modelProvider: "remote",
      inference: { baseUrl: "http://localhost:8000/v1", chatModel: "local.gguf" },
    }), "chat")).toThrow("仍指向本地运行时");
  });
});
