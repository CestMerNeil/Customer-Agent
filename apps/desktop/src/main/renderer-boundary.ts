import { redactSensitiveText } from "@customer-agent/core";
import type {
  AccountRecord,
  AppSettings,
  IpcResponse,
  RendererAccountRecord,
  RendererAppSettings,
} from "@customer-agent/core";

type InternalRuntimeStatus = IpcResponse<"inference.runtime.status"> & {
  modelPath?: string;
  runtimeCommand?: string;
  commandArgs?: string[];
};

/** Removes encrypted session material before an account crosses into the renderer. */
export function toRendererAccount(account: AccountRecord): RendererAccountRecord {
  const { cookies: _cookies, error, ...safeAccount } = account;
  return {
    ...safeAccount,
    ...(error ? { error: redactSensitiveText(error) } : {}),
  };
}

/** Removes API keys before persisted settings cross into the renderer. */
export function toRendererSettings(settings: AppSettings): RendererAppSettings {
  const { inference, inferenceRuntime, ...safeSettings } = settings;
  const safeRuntime = inferenceRuntime ? {
    runtimeKind: inferenceRuntime.runtimeKind,
    modelId: inferenceRuntime.modelId,
    ...(inferenceRuntime.mmprojModelId ? { mmprojModelId: inferenceRuntime.mmprojModelId } : {}),
    ...(inferenceRuntime.host ? { host: inferenceRuntime.host } : {}),
    ...(inferenceRuntime.port === undefined ? {} : { port: inferenceRuntime.port }),
  } : undefined;
  if (!inference) {
    return {
      ...safeSettings,
      ...(safeRuntime ? { inferenceRuntime: safeRuntime } : {}),
    };
  }
  const { apiKey, ...safeInference } = inference;
  return {
    ...safeSettings,
    ...(safeRuntime ? { inferenceRuntime: safeRuntime } : {}),
    inference: {
      ...safeInference,
      hasApiKey: Boolean(apiKey),
    },
  };
}

/** Allows general renderer settings updates while rejecting credential and process fields. */
export function sanitizeRendererSettingsUpdate(request: Partial<AppSettings>): Partial<AppSettings> {
  const { inference: _inference, inferenceRuntime: _inferenceRuntime, ...safeRequest } = request;
  return safeRequest;
}

/** Removes filesystem and executable details from runtime status responses. */
export function toRendererRuntimeStatus(status: InternalRuntimeStatus): IpcResponse<"inference.runtime.status"> {
  const { modelPath: _modelPath, runtimeCommand: _runtimeCommand, commandArgs: _commandArgs, ...safeStatus } = status;
  return safeStatus;
}

/** Reports runtime preparation without revealing the resolved executable command. */
export function toRendererRuntimePrepareResult(result: {
  ok: boolean;
  runtimeCommand?: string;
  error?: string;
}): IpcResponse<"inference.runtime.prepare"> {
  return {
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
  };
}

/** Reports model readiness without returning app-owned cache paths. */
export function toRendererModelDownloadResult(result: {
  ok: boolean;
  modelPath?: string;
  mmprojPath?: string;
  error?: string;
}): IpcResponse<"inference.modelscope.download"> {
  return {
    ok: result.ok,
    ready: result.ok,
    ...(result.error ? { error: result.error } : {}),
  };
}
