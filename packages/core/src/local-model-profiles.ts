import type { InferenceRuntimeConfig } from "./domain.js";

export type LocalModelCapability = "chat" | "embedding" | "vision";
export type LocalModelSource = "modelscope";
export type LocalModelFormat = "gguf";

/** Describes one reviewed local model profile exposed to desktop users. */
export interface LocalModelProfile {
  id: string;
  label: string;
  description: string;
  defaultFor?: LocalModelCapability;
  capabilities: LocalModelCapability[];
  parameters: {
    totalBillions: number;
    activeBillions: number;
  };
  model: {
    id: string;
    baseModelId: string;
    source: LocalModelSource;
    revision: string;
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
    revision: string;
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

/** Approved ModelScope-only multimodal profiles exposed by the desktop app. */
export const localModelProfiles: readonly LocalModelProfile[] = [
  {
    id: "local-qwen3_5-4b-q4_k_m",
    label: "Qwen3.5 4B 轻量多模态",
    description: "轻量档，约 3.4 GB 下载；适合内存较小的设备。",
    capabilities: ["chat", "vision"],
    parameters: { totalBillions: 4, activeBillions: 4 },
    model: {
      id: "unsloth/Qwen3.5-4B-GGUF:Q4_K_M",
      baseModelId: "Qwen/Qwen3.5-4B",
      source: "modelscope",
      revision: "167b4afc359863325cb4164418c715421b4e9118",
      url: "https://modelscope.cn/models/unsloth/Qwen3.5-4B-GGUF/resolve/167b4afc359863325cb4164418c715421b4e9118/Qwen3.5-4B-Q4_K_M.gguf",
      fileName: "Qwen3.5-4B-Q4_K_M.gguf",
      format: "gguf",
      license: "Apache-2.0",
      sizeBytes: 2_740_937_888,
      sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
    },
    auxiliaryModels: [
      {
        purpose: "mmproj",
        id: "unsloth/Qwen3.5-4B-GGUF:mmproj-F16",
        source: "modelscope",
        revision: "167b4afc359863325cb4164418c715421b4e9118",
        url: "https://modelscope.cn/models/unsloth/Qwen3.5-4B-GGUF/resolve/167b4afc359863325cb4164418c715421b4e9118/mmproj-F16.gguf",
        fileName: "mmproj-F16.gguf",
        format: "gguf",
        license: "Apache-2.0",
        sizeBytes: 672_423_616,
        sha256: "cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864",
      },
    ],
    runtime: {
      runtimeKind: "managed_llama_server",
      contextSize: 32_768,
      platforms: ["darwin-arm64", "darwin-x64", "win32-x64"],
    },
  },
  {
    id: "local-qwen3_5-9b-q4_k_m",
    label: "Qwen3.5 9B 标准多模态",
    description: "默认档，约 6.1 GB 下载；兼顾客服质量与本地资源占用。",
    defaultFor: "chat",
    capabilities: ["chat", "vision"],
    parameters: { totalBillions: 9, activeBillions: 9 },
    model: {
      id: "unsloth/Qwen3.5-9B-GGUF:Q4_K_M",
      baseModelId: "Qwen/Qwen3.5-9B",
      source: "modelscope",
      revision: "ae90f0d1c1be2b9250b0ef68265615f6fe3c777b",
      url: "https://modelscope.cn/models/unsloth/Qwen3.5-9B-GGUF/resolve/ae90f0d1c1be2b9250b0ef68265615f6fe3c777b/Qwen3.5-9B-Q4_K_M.gguf",
      fileName: "Qwen3.5-9B-Q4_K_M.gguf",
      format: "gguf",
      license: "Apache-2.0",
      sizeBytes: 5_680_522_464,
      sha256: "03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8",
    },
    auxiliaryModels: [
      {
        purpose: "mmproj",
        id: "unsloth/Qwen3.5-9B-GGUF:mmproj-F16",
        source: "modelscope",
        revision: "ae90f0d1c1be2b9250b0ef68265615f6fe3c777b",
        url: "https://modelscope.cn/models/unsloth/Qwen3.5-9B-GGUF/resolve/ae90f0d1c1be2b9250b0ef68265615f6fe3c777b/mmproj-F16.gguf",
        fileName: "mmproj-F16.gguf",
        format: "gguf",
        license: "Apache-2.0",
        sizeBytes: 918_166_080,
        sha256: "f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f",
      },
    ],
    runtime: {
      runtimeKind: "managed_llama_server",
      contextSize: 32_768,
      platforms: ["darwin-arm64", "darwin-x64", "win32-x64"],
    },
  },
  {
    id: "local-qwen3_6-35b-a3b-ud-q4_k_m",
    label: "Qwen3.6 35B-A3B 高配多模态",
    description: "高配上限，35B 总参数、每 token 约 3B 激活；约 21.4 GB 下载，不等于 3B 内存占用。",
    capabilities: ["chat", "vision"],
    parameters: { totalBillions: 35, activeBillions: 3 },
    model: {
      id: "unsloth/Qwen3.6-35B-A3B-GGUF:UD-Q4_K_M",
      baseModelId: "Qwen/Qwen3.6-35B-A3B",
      source: "modelscope",
      revision: "a2a9fd3585d658243e64acd133f247980392f82b",
      url: "https://modelscope.cn/models/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/a2a9fd3585d658243e64acd133f247980392f82b/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
      fileName: "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
      format: "gguf",
      license: "Apache-2.0",
      sizeBytes: 22_134_528_992,
      sha256: "ac0e2c1189e055faa36eff361580e79c5bd6f8e76bffb4ce547f167d53e31a61",
    },
    auxiliaryModels: [
      {
        purpose: "mmproj",
        id: "unsloth/Qwen3.6-35B-A3B-GGUF:mmproj-F16",
        source: "modelscope",
        revision: "a2a9fd3585d658243e64acd133f247980392f82b",
        url: "https://modelscope.cn/models/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/a2a9fd3585d658243e64acd133f247980392f82b/mmproj-F16.gguf",
        fileName: "mmproj-F16.gguf",
        format: "gguf",
        license: "Apache-2.0",
        sizeBytes: 899_283_680,
        sha256: "8971ee4f331ff0a4c609374f32984b3d4e6dc086c0aa35f1d637fad1829e887f",
      },
    ],
    runtime: {
      runtimeKind: "managed_llama_server",
      contextSize: 32_768,
      platforms: ["darwin-arm64", "darwin-x64", "win32-x64"],
    },
  },
];

/** Result of validating the reviewed local model manifest. */
export interface LocalModelProfileValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validates local model metadata and the ModelScope-only multimodal policy.
 *
 * @param profiles Profiles to validate.
 * @returns Validation status and all discovered errors.
 */
export function validateLocalModelProfiles(profiles: readonly LocalModelProfile[] = localModelProfiles): LocalModelProfileValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    const prefix = `profiles[${index}]`;
    if (!profile.id.trim()) errors.push(`${prefix}.id is required`);
    if (ids.has(profile.id)) errors.push(`${prefix}.id is duplicated`);
    ids.add(profile.id);
    if (!profile.capabilities.includes("chat") || !profile.capabilities.includes("vision")) errors.push(`${prefix}.capabilities must include chat and vision`);
    if (profile.parameters.totalBillions <= 0 || profile.parameters.totalBillions > 35) errors.push(`${prefix}.parameters.totalBillions must be between 0 and 35`);
    if (profile.parameters.activeBillions <= 0 || profile.parameters.activeBillions > profile.parameters.totalBillions) errors.push(`${prefix}.parameters.activeBillions is invalid`);
    if (!profile.model.id.trim()) errors.push(`${prefix}.model.id is required`);
    if (!profile.model.baseModelId.trim()) errors.push(`${prefix}.model.baseModelId is required`);
    if (!profile.model.revision.trim()) errors.push(`${prefix}.model.revision is required`);
    if (!isModelScopeUrl(profile.model.url)) errors.push(`${prefix}.model.url must use ModelScope HTTPS`);
    if (!profile.model.license.trim()) errors.push(`${prefix}.model.license is required`);
    if (!profile.model.sha256 || !/^[a-f0-9]{64}$/i.test(profile.model.sha256)) errors.push(`${prefix}.model.sha256 must be a 64-char hex digest`);
    if (!profile.model.sizeBytes || profile.model.sizeBytes <= 0) errors.push(`${prefix}.model.sizeBytes must be positive`);
    const mmprojModels = profile.auxiliaryModels?.filter((model) => model.purpose === "mmproj") ?? [];
    if (mmprojModels.length !== 1) errors.push(`${prefix}.auxiliaryModels must include one mmproj`);
    for (const [auxIndex, auxiliary] of (profile.auxiliaryModels ?? []).entries()) {
      const auxPrefix = `${prefix}.auxiliaryModels[${auxIndex}]`;
      if (!auxiliary.revision.trim()) errors.push(`${auxPrefix}.revision is required`);
      if (!isModelScopeUrl(auxiliary.url)) errors.push(`${auxPrefix}.url must use ModelScope HTTPS`);
      if (!auxiliary.sha256 || !/^[a-f0-9]{64}$/i.test(auxiliary.sha256)) errors.push(`${auxPrefix}.sha256 must be a 64-char hex digest`);
      if (!auxiliary.sizeBytes || auxiliary.sizeBytes <= 0) errors.push(`${auxPrefix}.sizeBytes must be positive`);
    }
    if (!profile.runtime.platforms.length) errors.push(`${prefix}.runtime.platforms is required`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Returns whether a model artifact URL belongs to ModelScope over HTTPS.
 *
 * @param value URL to inspect.
 * @returns Whether the URL uses the approved ModelScope host.
 */
function isModelScopeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "modelscope.cn";
  } catch {
    return false;
  }
}

/**
 * Finds the default profile for a local capability.
 *
 * @param capability Capability whose default is requested.
 * @returns The default profile, when configured.
 */
export function getDefaultLocalModelProfile(capability: LocalModelCapability): LocalModelProfile | undefined {
  return localModelProfiles.find((profile) => profile.defaultFor === capability);
}

/**
 * Resolves an approved profile from persisted runtime identifiers.
 *
 * @param runtime Runtime model identifiers.
 * @param profiles Approved profiles to search.
 * @returns The matching profile, when approved.
 */
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

/**
 * Checks whether an approved runtime profile declares a capability.
 *
 * @param runtime Runtime model identifiers.
 * @param capability Capability to check.
 * @param profiles Approved profiles to search.
 * @returns Whether the runtime is approved for the capability.
 */
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

/**
 * Creates the default app-managed llama-server configuration.
 *
 * @returns Default local runtime configuration.
 * @throws When no default chat profile is configured.
 */
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

/**
 * Normalizes persisted settings to an approved ModelScope profile.
 *
 * Unknown or retired model identifiers migrate to the current default without
 * reusing their local paths.
 *
 * @param config Persisted runtime settings.
 * @returns Safe app-managed runtime settings.
 */
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
  const profile = config?.runtimeKind === "managed_llama_server"
    ? getLocalModelProfileForRuntime({
        modelId: config.modelId ?? "",
        ...(config.mmprojModelId ? { mmprojModelId: config.mmprojModelId } : {}),
      })
    : undefined;
  if (!profile) {
    return defaults;
  }
  const mmproj = profile.auxiliaryModels?.find((model) => model.purpose === "mmproj");
  const keepMmprojPath = Boolean(
    mmproj
    && config?.mmprojModelId
    && (config.mmprojModelId === mmproj.url || config.mmprojModelId === mmproj.id),
  );
  return {
    ...defaults,
    ...config,
    runtimeKind: "managed_llama_server",
    modelId: profile.model.url,
    modelPath: config?.modelPath ?? "",
    ...(mmproj ? {
      mmprojModelId: mmproj.url,
      mmprojPath: keepMmprojPath ? config?.mmprojPath ?? "" : "",
    } : {}),
  };
}
