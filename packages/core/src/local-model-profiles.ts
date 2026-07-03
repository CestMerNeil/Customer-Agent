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
    runtimeKind: "managed_llama_server";
    contextSize: number;
    recommendedThreads?: number;
    platforms: Array<"darwin-arm64" | "darwin-x64" | "win32-x64">;
  };
}

export const localModelProfiles: readonly LocalModelProfile[] = [
  {
    id: "local-qwen2_5-vl-3b-instruct-q4_k_m",
    label: "Qwen2.5-VL 3B 多模态",
    description: "默认本地多模态客服模型。原生工具调用可用且对设备友好；7B GGUF 模板不支持原生工具调用且对多数本地机器偏重。",
    defaultFor: "chat",
    capabilities: ["chat", "vision"],
    model: {
      id: "unsloth/Qwen2.5-VL-3B-Instruct-GGUF:Q4_K_M",
      source: "modelscope",
      url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/master/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
      fileName: "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
      format: "gguf",
      license: "Apache-2.0",
      sizeBytes: 1_929_901_408,
      sha256: "c47e8c1f6fb3e8cff6ec58909baff16dbeffb64a5bb3b746b96e05e6334c129f",
    },
    auxiliaryModels: [
      {
        purpose: "mmproj",
        id: "unsloth/Qwen2.5-VL-3B-Instruct-GGUF:mmproj-F16",
        source: "modelscope",
        url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/master/mmproj-F16.gguf",
        fileName: "mmproj-F16.gguf",
        format: "gguf",
        license: "Apache-2.0",
        sizeBytes: 1_338_428_256,
        sha256: "4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c",
      },
    ],
    runtime: {
      runtimeKind: "managed_llama_server",
      contextSize: 8192,
      platforms: ["darwin-arm64", "darwin-x64", "win32-x64"],
    },
  },
];

export interface LocalModelProfileValidationResult {
  ok: boolean;
  errors: string[];
}

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
    runtimeKind: "managed_llama_server",
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
    runtimeKind?: string;
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
  const runtimeKind = config?.runtimeKind;
  if (!config || runtimeKind !== "managed_llama_server") {
    return {
      ...defaults,
      ...(runtimeKind === "managed_llama_server" && config?.modelPath ? { modelPath: config.modelPath } : {}),
    };
  }
  const normalizedModelId = config.modelId?.trim() || defaults.modelId;
  const mmprojModelId = normalizedModelId === defaults.modelId ? defaults.mmprojModelId : config.mmprojModelId;
  return {
    ...defaults,
    ...config,
    runtimeKind: "managed_llama_server",
    modelId: normalizedModelId,
    modelPath: config.modelPath ?? "",
    ...(mmprojModelId ? { mmprojModelId } : {}),
  };
}
