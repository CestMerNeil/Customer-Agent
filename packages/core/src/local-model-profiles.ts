import type { InferenceRuntimeConfig } from "./domain.js";

export type LocalModelCapability = "chat" | "embedding" | "vision";
export type LocalModelSource = "modelscope" | "https" | "local";
export type LocalModelFormat = "gguf";

export interface LocalModelProfile {
  id: string;
  label: string;
  description: string;
  defaultFor?: LocalModelCapability;
  capabilities: LocalModelCapability[];
  model: {
    id: string;
    source: LocalModelSource;
    url: string;
    fileName: string;
    format: LocalModelFormat;
    license: string;
    sizeBytes?: number;
    sha256?: string;
  };
  auxiliaryModels?: Array<{
    purpose: "mmproj";
    id: string;
    source: LocalModelSource;
    url: string;
    fileName: string;
    format: LocalModelFormat;
    license: string;
    sizeBytes?: number;
    sha256?: string;
  }>;
  runtime: {
    provider: "managed_llama_server";
    contextSize: number;
    recommendedThreads?: number;
    platforms: Array<"darwin-arm64" | "darwin-x64" | "win32-x64">;
  };
}

export const localModelProfiles: readonly LocalModelProfile[] = [
  {
    id: "local-gemma-3-4b-it-q4_k_m-vision",
    label: "Gemma 3 4B 多模态模型",
    description: "用于客服对话、Agent 工具决策与商品图片理解的设备端 Gemma 多模态 GGUF 模型。",
    defaultFor: "chat",
    capabilities: ["chat", "vision"],
    model: {
      id: "bartowski/google_gemma-3-4b-it-GGUF:Q4_K_M",
      source: "modelscope",
      url: "https://modelscope.cn/models/bartowski/google_gemma-3-4b-it-GGUF/resolve/master/google_gemma-3-4b-it-Q4_K_M.gguf",
      fileName: "google_gemma-3-4b-it-Q4_K_M.gguf",
      format: "gguf",
      license: "Gemma",
      sizeBytes: 2_489_758_112,
      sha256: "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94",
    },
    auxiliaryModels: [
      {
        purpose: "mmproj",
        id: "bartowski/google_gemma-3-4b-it-GGUF:mmproj-f16",
        source: "modelscope",
        url: "https://modelscope.cn/models/bartowski/google_gemma-3-4b-it-GGUF/resolve/master/mmproj-google_gemma-3-4b-it-f16.gguf",
        fileName: "mmproj-google_gemma-3-4b-it-f16.gguf",
        format: "gguf",
        license: "Gemma",
        sizeBytes: 851_251_104,
        sha256: "8c0fb064b019a6972856aaae2c7e4792858af3ca4561be2dbf649123ba6c40cb",
      },
    ],
    runtime: {
      provider: "managed_llama_server",
      contextSize: 32768,
      platforms: ["darwin-arm64", "darwin-x64", "win32-x64"],
    },
  },
];

export interface LocalModelProfileValidationResult {
  ok: boolean;
  errors: string[];
}

const legacyDefaultModelIds = [
  "https://modelscope.cn/models/qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  "qwen/Qwen2.5-0.5B-Instruct-GGUF:q4_k_m",
  "https://modelscope.cn/models/ggml-org/gemma-3n-E2B-it-GGUF/resolve/master/gemma-3n-E2B-it-Q8_0.gguf",
  "ggml-org/gemma-3n-E2B-it-GGUF:Q8_0",
];

export function validateLocalModelProfiles(profiles: readonly LocalModelProfile[] = localModelProfiles): LocalModelProfileValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    const prefix = `profiles[${index}]`;
    if (!profile.id.trim()) errors.push(`${prefix}.id is required`);
    if (ids.has(profile.id)) errors.push(`${prefix}.id is duplicated`);
    ids.add(profile.id);
    if (!profile.capabilities.length) errors.push(`${prefix}.capabilities is required`);
    if (!profile.model.id.trim()) errors.push(`${prefix}.model.id is required`);
    if (!profile.model.url.trim()) errors.push(`${prefix}.model.url is required`);
    if (!profile.model.license.trim()) errors.push(`${prefix}.model.license is required`);
    if (!profile.model.sha256 || !/^[a-f0-9]{64}$/i.test(profile.model.sha256)) errors.push(`${prefix}.model.sha256 must be a 64-char hex digest`);
    if (!profile.model.sizeBytes || profile.model.sizeBytes <= 0) errors.push(`${prefix}.model.sizeBytes must be positive`);
    for (const [auxIndex, auxiliary] of (profile.auxiliaryModels ?? []).entries()) {
      const auxPrefix = `${prefix}.auxiliaryModels[${auxIndex}]`;
      if (!auxiliary.url.trim()) errors.push(`${auxPrefix}.url is required`);
      if (!auxiliary.sha256 || !/^[a-f0-9]{64}$/i.test(auxiliary.sha256)) errors.push(`${auxPrefix}.sha256 must be a 64-char hex digest`);
      if (!auxiliary.sizeBytes || auxiliary.sizeBytes <= 0) errors.push(`${auxPrefix}.sizeBytes must be positive`);
    }
    if (!profile.runtime.platforms.length) errors.push(`${prefix}.runtime.platforms is required`);
  }
  return { ok: errors.length === 0, errors };
}

export function getDefaultLocalModelProfile(capability: LocalModelCapability): LocalModelProfile | undefined {
  return localModelProfiles.find((profile) => profile.defaultFor === capability);
}

export function getLocalModelProfileForRuntime(
  runtime: Pick<InferenceRuntimeConfig, "modelId" | "mmprojModelId"> | undefined,
  profiles: readonly LocalModelProfile[] = localModelProfiles,
): LocalModelProfile | undefined {
  const modelId = runtime?.modelId?.trim();
  if (!modelId) {
    return undefined;
  }
  return profiles.find((profile) => profile.model.url === modelId || profile.model.id === modelId);
}

export function runtimeConfigSupportsLocalCapability(
  runtime: Pick<InferenceRuntimeConfig, "modelId" | "mmprojModelId"> | undefined,
  capability: LocalModelCapability,
  profiles: readonly LocalModelProfile[] = localModelProfiles,
): boolean {
  const profile = getLocalModelProfileForRuntime(runtime, profiles);
  if (!profile?.capabilities.includes(capability)) {
    return false;
  }
  if (capability !== "vision") {
    return true;
  }
  const mmproj = profile.auxiliaryModels?.find((model) => model.purpose === "mmproj");
  return Boolean(
    mmproj
    && runtime?.mmprojModelId
    && (runtime.mmprojModelId === mmproj.url || runtime.mmprojModelId === mmproj.id),
  );
}

export function createDefaultLocalRuntimeConfig(): InferenceRuntimeConfig {
  const profile = getDefaultLocalModelProfile("chat");
  if (!profile) {
    throw new Error("未配置默认本地对话模型档案。");
  }
  const mmprojModelId = profile.auxiliaryModels?.find((model) => model.purpose === "mmproj")?.url;
  return {
    provider: "managed_llama_server",
    modelId: profile.model.url,
    modelPath: "",
    ...(mmprojModelId ? { mmprojModelId, mmprojPath: "" } : {}),
    command: "llama-server",
    host: "127.0.0.1",
    port: 8000,
  };
}

export function normalizeLocalRuntimeConfig(
  config: {
    provider?: string;
    modelId?: string;
    modelPath?: string;
    command?: string;
    commandArgs?: string[];
    runtimeDownloadUrl?: string;
    runtimeDownloadSha256?: string;
    mmprojModelId?: string;
    mmprojPath?: string;
    host?: string;
    port?: number;
  } | undefined,
): InferenceRuntimeConfig {
  const defaults = createDefaultLocalRuntimeConfig();
  if (!config || config.provider !== "managed_llama_server") {
    return {
      ...defaults,
      ...(config?.provider === "managed_llama_server" && config.modelPath ? { modelPath: config.modelPath } : {}),
    };
  }
  const normalizedModelId = normalizeModelId(config.modelId, defaults.modelId);
  const mmprojModelId = normalizedModelId === defaults.modelId ? defaults.mmprojModelId : config.mmprojModelId;
  const mmprojPath = normalizedModelId === defaults.modelId && isLegacyDefaultLocalModelId(config.modelId) ? "" : config.mmprojPath;
  return {
    ...defaults,
    ...config,
    provider: "managed_llama_server",
    modelId: normalizedModelId,
    modelPath: normalizedModelId === defaults.modelId && isLegacyDefaultLocalModelId(config.modelId) ? "" : config.modelPath ?? "",
    ...(mmprojModelId ? { mmprojModelId } : {}),
    ...(mmprojPath !== undefined ? { mmprojPath } : {}),
  };
}

function normalizeModelId(value: string | undefined, defaultModelId: string): string {
  const modelId = value?.trim() || defaultModelId;
  return isLegacyDefaultLocalModelId(modelId) ? defaultModelId : modelId;
}

export function isLegacyDefaultLocalModelId(value: string | undefined): boolean {
  return Boolean(value && legacyDefaultModelIds.includes(value.trim()));
}
