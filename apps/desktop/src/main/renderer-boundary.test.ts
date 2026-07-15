import { describe, expect, it } from "vitest";
import type { AccountRecord, AppSettings } from "@customer-agent/core";
import {
  sanitizeRendererSettingsUpdate,
  toRendererAccount,
  toRendererModelDownloadResult,
  toRendererRuntimePrepareResult,
  toRendererRuntimeStatus,
  toRendererSettings,
} from "./renderer-boundary.js";

const baseSettings: AppSettings = {
  modelProvider: "remote",
  businessHours: { start: "08:00", end: "23:00" },
  knowledge: { topK: 5 },
};

describe("renderer boundary", () => {
  it("does not return PDD cookies to the renderer", () => {
    const account: AccountRecord = {
      id: "account-a",
      channel: "pinduoduo",
      username: "merchant-a",
      shopId: "shop-a",
      userId: "user-a",
      status: "error",
      cookies: "session_token=secret-value",
      error: "token=secret-value",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    const rendered = toRendererAccount(account);

    expect(rendered).not.toHaveProperty("cookies");
    expect(rendered.error).not.toContain("secret-value");
  });

  it("returns only API-key presence metadata", () => {
    const rendered = toRendererSettings({
      ...baseSettings,
      inference: {
        baseUrl: "https://example.com/v1",
        chatModel: "model-a",
        apiKey: "sk-secret-value",
      },
    });

    expect(rendered.inference).toEqual({
      baseUrl: "https://example.com/v1",
      chatModel: "model-a",
      hasApiKey: true,
    });
    expect(rendered.inference).not.toHaveProperty("apiKey");
  });

  it("does not return runtime commands or local filesystem paths", () => {
    const rendered = toRendererSettings({
      ...baseSettings,
      inferenceRuntime: {
        runtimeKind: "managed_llama_server",
        modelId: "model-a",
        modelPath: "/private/model.gguf",
        command: "/private/llama-server",
        commandArgs: ["--unsafe"],
        mmprojModelId: "mmproj-a",
        mmprojPath: "/private/mmproj.gguf",
        host: "127.0.0.1",
        port: 8000,
      },
    });

    expect(rendered.inferenceRuntime).toEqual({
      runtimeKind: "managed_llama_server",
      modelId: "model-a",
      mmprojModelId: "mmproj-a",
      host: "127.0.0.1",
      port: 8000,
    });
    expect(rendered.inferenceRuntime).not.toHaveProperty("command");
    expect(rendered.inferenceRuntime).not.toHaveProperty("modelPath");
  });

  it("rejects generic renderer updates to secrets and executable runtime fields", () => {
    const safe = sanitizeRendererSettingsUpdate({
      ...baseSettings,
      inference: { baseUrl: "https://example.com/v1", chatModel: "model-a", apiKey: "secret" },
      inferenceRuntime: {
        runtimeKind: "managed_llama_server",
        modelId: "model-a",
        modelPath: "/tmp/model.gguf",
        command: "/tmp/untrusted-command",
        commandArgs: ["--unsafe"],
      },
    });

    expect(safe).not.toHaveProperty("inference");
    expect(safe).not.toHaveProperty("inferenceRuntime");
    expect(safe.modelProvider).toBe("remote");
  });

  it("strips paths and commands from every runtime operation response", () => {
    const status = toRendererRuntimeStatus({
      running: true,
      modelId: "model-a",
      modelReady: true,
      runtimeReady: true,
      modelPath: "/private/model.gguf",
      runtimeCommand: "/private/llama-server",
      commandArgs: ["--unsafe"],
    });
    const prepared = toRendererRuntimePrepareResult({
      ok: true,
      runtimeCommand: "/private/llama-server",
    });
    const downloaded = toRendererModelDownloadResult({
      ok: true,
      modelPath: "/private/model.gguf",
      mmprojPath: "/private/mmproj.gguf",
    });

    expect(status).not.toHaveProperty("modelPath");
    expect(status).not.toHaveProperty("runtimeCommand");
    expect(status).not.toHaveProperty("commandArgs");
    expect(prepared).toEqual({ ok: true });
    expect(downloaded).toEqual({ ok: true, ready: true });
  });
});
