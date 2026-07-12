import {
  normalizeLocalRuntimeConfig,
  runtimeConfigSupportsLocalCapability,
} from "@customer-agent/core";
import type {
  AppSettings,
  InferenceConfig,
  InferenceRuntimeConfig,
  ModelProvider,
} from "@customer-agent/core";

/** Model operation classes that can require provider-specific capability checks. */
export type ModelProviderCapability = "chat" | "multimodal";

/** Provider selection resolved into one OpenAI-compatible client configuration. */
export type ResolvedModelProvider =
  | { kind: "local"; config: InferenceConfig; runtime: InferenceRuntimeConfig }
  | { kind: "remote"; config: InferenceConfig };

/** Resolves the persisted provider choice, including compatibility with older settings. */
export function resolveModelProvider(settings: AppSettings): ModelProvider {
  if (settings.modelProvider) {
    return settings.modelProvider;
  }
  return settings.inference && !isLocalInferenceBaseUrl(settings.inference.baseUrl) ? "remote" : "local";
}

/** Resolves one operation through only the selected provider and validates its configuration. */
export function resolveModelProviderConfig(
  settings: AppSettings,
  capability: ModelProviderCapability,
): ResolvedModelProvider {
  if (resolveModelProvider(settings) === "local") {
    const runtime = normalizeLocalRuntimeConfig(settings.inferenceRuntime);
    if (capability === "multimodal" && !runtimeConfigSupportsLocalCapability(runtime, "vision")) {
      throw new Error("当前选择的本地 Model Provider 不支持商品图片理解，请选择带 vision 能力的本地模型档案。");
    }
    return {
      kind: "local",
      runtime,
      config: {
        baseUrl: localRuntimeBaseUrl(runtime),
        chatModel: runtime.modelId,
        temperature: settings.inference?.temperature ?? 0.3,
        maxTokens: settings.inference?.maxTokens ?? 1000,
      },
    };
  }

  const config = settings.inference;
  if (!config?.baseUrl.trim() || !config.chatModel.trim()) {
    throw new Error("请先在模型设置中配置远端 Model Provider 的 OpenAI 兼容 endpoint 和模型名。");
  }
  if (isLocalInferenceBaseUrl(config.baseUrl) || isLocalModelIdentifier(config.chatModel)) {
    throw new Error("当前选择的是远端 Model Provider，但 endpoint 或模型仍指向本地运行时。");
  }
  return { kind: "remote", config };
}

/** Returns whether an endpoint points to the local machine. */
function isLocalInferenceBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return true;
  }
}

/** Returns whether a model identifier describes a local model artifact or runtime. */
function isLocalModelIdentifier(model: string): boolean {
  return /(^https?:\/\/|\.gguf(?:$|[?#])|runtime-models|modelscope\.cn)/iu.test(model.trim());
}

/** Builds the OpenAI-compatible base URL for an app-managed local runtime. */
function localRuntimeBaseUrl(runtime: Pick<InferenceRuntimeConfig, "host" | "port">): string {
  return `http://${runtime.host ?? "127.0.0.1"}:${runtime.port ?? 8000}/v1`;
}
