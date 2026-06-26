import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelSettings } from "./ModelSettings";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

const defaultProfile = {
  id: "local-gemma-3-4b-it-q4_k_m-vision",
  label: "Gemma 3 4B 多模态",
  defaultFor: "chat" as const,
  capabilities: ["chat", "vision"] as const,
  runtime: {
    provider: "managed_llama_server" as const,
  },
  model: {
    id: "bartowski/google_gemma-3-4b-it-GGUF:Q4_K_M",
    url: "https://modelscope.cn/models/bartowski/google_gemma-3-4b-it-GGUF/resolve/master/google_gemma-3-4b-it-Q4_K_M.gguf",
    sha256: "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94",
    sizeBytes: 2_489_758_112,
  },
  auxiliaryModels: [{
    purpose: "mmproj" as const,
    id: "bartowski/google_gemma-3-4b-it-GGUF:mmproj-f16",
    source: "modelscope" as const,
    url: "https://modelscope.cn/models/bartowski/google_gemma-3-4b-it-GGUF/resolve/master/mmproj-google_gemma-3-4b-it-f16.gguf",
    fileName: "mmproj-google_gemma-3-4b-it-f16.gguf",
    format: "gguf" as const,
    license: "Gemma",
    sha256: "8c0fb064b019a6972856aaae2c7e4792858af3ca4561be2dbf649123ba6c40cb",
    sizeBytes: 851_251_104,
  }],
};

function mockBridge() {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === "inference.config.get") {
      return {
        config: {
          baseUrl: "http://127.0.0.1:8000/v1",
          apiKey: "",
          chatModel: defaultProfile.model.id,
          embeddingModel: "",
        },
      };
    }
    if (channel === "settings.get") {
      return {
        settings: {
          modelProvider: "local",
          inferenceRuntime: {
            provider: "managed_llama_server",
            modelId: defaultProfile.model.url,
            modelPath: "/models/gemma-3n-e2b-it.gguf",
            command: "llama-server",
            host: "127.0.0.1",
            port: 8000,
          },
        },
      };
    }
    if (channel === "inference.local.profiles") {
      return { profiles: [defaultProfile] };
    }
    if (channel === "inference.runtime.status") {
      return {
        running: true,
        baseUrl: "http://127.0.0.1:8000/v1",
        runtimeKind: "managed_llama_server",
        runtimeName: "应用托管 llama-server",
        modelPath: "/models/gemma-3n-e2b-it.gguf",
        modelId: defaultProfile.model.url,
        modelReady: true,
        runtimeReady: true,
      };
    }
    if (channel === "inference.health") {
      return { ok: true };
    }
    return { ok: true };
  });
  window.customerAgent = {
    invoke,
    on: vi.fn(() => () => undefined),
  } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModelSettings", () => {
  it("separates remote endpoint debugging from local llama runtime status", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<any> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test",
            chatModel: "gpt-4.1-mini",
            embeddingModel: "",
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            modelProvider: "remote",
            inferenceRuntime: {
              provider: "managed_llama_server",
              modelId: defaultProfile.model.url,
              modelPath: "/models/gemma-3n-e2b-it.gguf",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: true,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "/models/gemma-3n-e2b-it.gguf",
          modelId: defaultProfile.model.url,
          modelReady: true,
          runtimeReady: true,
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: /使用 Responses API/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Responses API 调试")).toHaveLength(2);
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试 Responses API/ })).toBeInTheDocument();
    expect(screen.getAllByText("API URL")).toHaveLength(2);
    expect(screen.queryByText("本地 AI")).not.toBeInTheDocument();
    expect(screen.queryByText("模型档案")).not.toBeInTheDocument();
    expect(screen.queryByText("应用托管 llama-server")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试本地推理/ })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("inference.local.profiles", undefined);
    expect(invoke).not.toHaveBeenCalledWith("inference.runtime.status", undefined);
  });

  it("renders only local model controls in local mode", async () => {
    mockBridge();
    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: /使用本地模型/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("本地 AI")).toBeInTheDocument();
    expect(screen.getByText("模型档案")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试本地推理/ })).toBeInTheDocument();
    expect(screen.queryByText("Responses API 调试")).not.toBeInTheDocument();
    expect(screen.queryByText("API URL")).not.toBeInTheDocument();
    expect(screen.queryByText("API Key")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试 Responses API/ })).not.toBeInTheDocument();
  });

  it("exposes a local inference test action beside the runtime status", async () => {
    const invoke = mockBridge();
    render(<ModelSettings />);

    expect(await screen.findByText("推理未测试")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /测试本地推理/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.health", undefined));
    expect(await screen.findByText("推理可用")).toBeInTheDocument();
    expect(screen.getByText("llama-server 就绪")).toBeInTheDocument();
  });

  it("clears download progress after a model download failure", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<any> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
            embeddingModel: "",
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              provider: "managed_llama_server",
              modelId: defaultProfile.model.url,
              modelPath: "",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "",
          modelId: defaultProfile.model.url,
          modelReady: false,
          runtimeReady: true,
        };
      }
      if (channel === "inference.modelscope.download") {
        return { ok: false, modelPath: "", error: "模型文件校验失败，请重新下载或更换模型档案。" };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /下载模型/ }));

    expect(await screen.findByText("模型文件校验失败，请重新下载或更换模型档案。")).toBeInTheDocument();
    expect(screen.queryByText(/下载中/)).not.toBeInTheDocument();
  });

  it("does not mark llama-server ready when the runtime command is only configured", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<any> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
            embeddingModel: "",
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              provider: "managed_llama_server",
              modelId: defaultProfile.model.url,
              modelPath: "",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "",
          modelId: defaultProfile.model.url,
          modelReady: false,
          runtimeReady: false,
          runtimeCommand: "llama-server",
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    expect(await screen.findByText("运行时未检测")).toBeInTheDocument();
    expect(screen.queryByText("llama-server 就绪")).not.toBeInTheDocument();
  });

  it("passes a progress request id when preparing local AI", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<any> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
            embeddingModel: "",
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              provider: "managed_llama_server",
              modelId: defaultProfile.model.url,
              modelPath: "",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "",
          modelId: defaultProfile.model.url,
          modelReady: false,
          runtimeReady: true,
        };
      }
      return { ok: true, running: true, baseUrl: "http://127.0.0.1:8000/v1" };
    });
    render(<ModelSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /准备本地 AI/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "inference.runtime.start",
        expect.objectContaining({
          provider: "managed_llama_server",
          requestId: expect.any(String),
        }),
      );
    });
  });
});
