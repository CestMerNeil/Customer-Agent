import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelSettings } from "./ModelSettings";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

const defaultProfile = {
  id: "local-qwen2_5-vl-3b-instruct-q4_k_m",
  label: "Qwen2.5-VL 3B 多模态",
  description: "默认本地多模态客服模型。",
  defaultFor: "chat" as const,
  capabilities: ["chat", "vision"] as const,
  runtime: {
    runtimeKind: "managed_llama_server" as const,
    contextSize: 32768,
    platforms: ["darwin-arm64", "darwin-x64", "win32-x64"] as const,
  },
  model: {
    id: "unsloth/Qwen2.5-VL-3B-Instruct-GGUF:Q4_K_M",
    source: "modelscope" as const,
    url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/master/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
    fileName: "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
    format: "gguf" as const,
    license: "Apache-2.0",
    sha256: "c47e8c1f6fb3e8cff6ec58909baff16dbeffb64a5bb3b746b96e05e6334c129f",
    sizeBytes: 1_929_901_408,
  },
  auxiliaryModels: [{
    purpose: "mmproj" as const,
    id: "unsloth/Qwen2.5-VL-3B-Instruct-GGUF:mmproj-F16",
    source: "modelscope" as const,
    url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/master/mmproj-F16.gguf",
    fileName: "mmproj-F16.gguf",
    format: "gguf" as const,
    license: "Apache-2.0",
    sha256: "4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c",
    sizeBytes: 1_338_428_256,
  }],
};

const qualityProfile = {
  ...defaultProfile,
  id: "local-qwen2_5-vl-7b-instruct-q4_k_m",
  label: "Qwen2.5-VL 7B 多模态",
  defaultFor: undefined,
  model: {
    ...defaultProfile.model,
    id: "unsloth/Qwen2.5-VL-7B-Instruct-GGUF:Q4_K_M",
    url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-7B-Instruct-GGUF/resolve/master/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
    fileName: "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
    sha256: "d16776dcd9a28d42758c2958ed3a752aabf20a305252cd64ff2be72b4a78c503",
    sizeBytes: 4_683_072_384,
  },
  auxiliaryModels: [{
    ...defaultProfile.auxiliaryModels[0],
    id: "unsloth/Qwen2.5-VL-7B-Instruct-GGUF:mmproj-F16",
    url: "https://modelscope.cn/models/unsloth/Qwen2.5-VL-7B-Instruct-GGUF/resolve/master/mmproj-F16.gguf",
    sha256: "987dd0733033fb5dd9b124d1ca926ae865572e432384eee7618b2eec3e735e17",
    sizeBytes: 1_354_163_040,
  }],
};

function mockBridge() {
  const invoke = vi.fn<(channel: string, request?: unknown) => Promise<Record<string, unknown>>>(async (channel: string) => {
    if (channel === "inference.config.get") {
      return {
        config: {
          baseUrl: "http://127.0.0.1:8000/v1",
          apiKey: "",
          chatModel: defaultProfile.model.id,
        },
      };
    }
    if (channel === "settings.get") {
      return {
        settings: {
          modelProvider: "local",
          inferenceRuntime: {
            runtimeKind: "managed_llama_server",
            modelId: defaultProfile.model.url,
            modelPath: "/models/qwen2_5-vl-3b.gguf",
            command: "llama-server",
            host: "127.0.0.1",
            port: 8000,
          },
        },
      };
    }
    if (channel === "inference.local.profiles") {
      return { profiles: [defaultProfile, qualityProfile] };
    }
    if (channel === "inference.runtime.status") {
      return {
        running: true,
        baseUrl: "http://127.0.0.1:8000/v1",
        runtimeKind: "managed_llama_server",
        runtimeName: "应用托管 llama-server",
        modelPath: "/models/qwen2_5-vl-3b.gguf",
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

type MockInvokeResult = Awaited<ReturnType<ReturnType<typeof mockBridge>>>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModelSettings", () => {
  it("separates remote endpoint debugging from local llama runtime status", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test",
            chatModel: "gpt-4.1-mini",
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            modelProvider: "remote",
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
              modelId: defaultProfile.model.url,
              modelPath: "/models/qwen2_5-vl-3b.gguf",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile, qualityProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: true,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "/models/qwen2_5-vl-3b.gguf",
          modelId: defaultProfile.model.url,
          modelReady: true,
          runtimeReady: true,
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: "云端 AI" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("已连接").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试连接/ })).toBeInTheDocument();
    expect(screen.getByText("服务地址")).toBeInTheDocument();
    expect(screen.queryByText("模型档案")).not.toBeInTheDocument();
    expect(screen.queryByText("应用托管 llama-server")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("inference.local.profiles", undefined);
    expect(invoke).not.toHaveBeenCalledWith("inference.runtime.status", undefined);
  });

  it("renders only local model controls in local mode", async () => {
    mockBridge();
    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: "本地 AI" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText("高级设置"));
    expect(screen.getByText("模型档案")).toBeInTheDocument();
    expect(await screen.findByText(/Qwen2.5-VL 3B 多模态/)).toBeInTheDocument();
    expect(screen.queryByText(/Qwen2.5-3B-Instruct/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查" })).toBeInTheDocument();
    expect(screen.queryByText("服务地址")).not.toBeInTheDocument();
    expect(screen.queryByText("服务商密钥")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试连接/ })).not.toBeInTheDocument();
  });

  it("keeps the persisted local model profile selection", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: qualityProfile.model.id,
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            modelProvider: "local",
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
              modelId: qualityProfile.model.url,
              modelPath: "/models/qwen2_5-vl-7b.gguf",
              mmprojModelId: qualityProfile.auxiliaryModels[0]!.url,
              mmprojPath: "/models/qwen2_5-vl-7b-mmproj.gguf",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [defaultProfile, qualityProfile] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "/models/qwen2_5-vl-7b.gguf",
          modelId: qualityProfile.model.url,
          modelReady: true,
          runtimeReady: true,
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    expect(await screen.findByText(/Qwen2.5-VL 7B 多模态/)).toBeInTheDocument();
    expect(screen.getByText(qualityProfile.model.url)).toBeInTheDocument();
  });

  it("exposes a local inference test action beside the runtime status", async () => {
    const invoke = mockBridge();
    render(<ModelSettings />);

    expect(await screen.findByText("回复未测试")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "检查" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.health", undefined));
    expect(await screen.findByText("回复功能正常")).toBeInTheDocument();
    expect(screen.getByText("程序已安装")).toBeInTheDocument();
  });

  it("clears download progress after a model download failure", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
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
        return { profiles: [defaultProfile, qualityProfile] };
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

    fireEvent.click(await screen.findByText("高级设置"));
    fireEvent.click(await screen.findByRole("button", { name: /下载模型/ }));

    expect(await screen.findByText("模型文件校验失败，请重新下载或更换模型档案。")).toBeInTheDocument();
    expect(screen.queryByText(/下载中/)).not.toBeInTheDocument();
  });

  it("aggregates main model and mmproj download progress", async () => {
    const invoke = mockBridge();
    let progressHandler: ((event: {
      requestId: string;
      modelId: string;
      receivedBytes: number;
      totalBytes?: number;
      percent?: number;
    }) => void) | undefined;
    const smallProfile = {
      ...defaultProfile,
      model: { ...defaultProfile.model, sizeBytes: 1000 },
      auxiliaryModels: [{ ...defaultProfile.auxiliaryModels[0]!, sizeBytes: 1000 }],
    };
    window.customerAgent.on = vi.fn((channel, listener) => {
      if (channel === "inference.modelscope.download.progress") {
        progressHandler = listener;
      }
      return () => undefined;
    }) as CustomerAgentBridge["on"];
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.local.profiles") {
        return { profiles: [smallProfile] };
      }
      if (channel === "inference.modelscope.download") {
        return new Promise(() => undefined);
      }
      if (channel === "inference.config.get") {
        return { config: { baseUrl: "http://127.0.0.1:8000/v1", apiKey: "", chatModel: smallProfile.model.id } };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            modelProvider: "local",
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
              modelId: smallProfile.model.url,
              modelPath: "",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "",
          modelId: smallProfile.model.url,
          modelReady: false,
          runtimeReady: true,
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);
    fireEvent.click(await screen.findByText("高级设置"));
    fireEvent.click(await screen.findByRole("button", { name: /下载模型/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.modelscope.download", expect.any(Object)));
    const request = (invoke.mock.calls as unknown as Array<[string, unknown]>)
      .find(([channel]) => channel === "inference.modelscope.download")?.[1] as { requestId: string };
    act(() => {
      progressHandler?.({
        requestId: request.requestId,
        modelId: smallProfile.model.url,
        receivedBytes: 1000,
        totalBytes: 1000,
        percent: 100,
      });
      progressHandler?.({
        requestId: request.requestId,
        modelId: smallProfile.auxiliaryModels[0]!.url,
        receivedBytes: 500,
        totalBytes: 1000,
        percent: 50,
      });
    });

    expect(screen.getByText("1.5 KB / 2.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("does not mark llama-server ready when the runtime command is only configured", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
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
        return { profiles: [defaultProfile, qualityProfile] };
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

    expect(await screen.findByText("程序未安装")).toBeInTheDocument();
    expect(screen.queryByText("程序已安装")).not.toBeInTheDocument();
  });

  it("installs the local runtime only when the operator asks for it", async () => {
    const invoke = mockBridge();
    render(<ModelSettings />);

    fireEvent.click(await screen.findByText("高级设置"));
    expect(await screen.findByRole("button", { name: "修复" })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("inference.runtime.prepare", undefined);

    fireEvent.click(screen.getByRole("button", { name: "修复" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.runtime.prepare", undefined));
  });

  it("deletes cached model and mmproj weights for the selected profile", async () => {
    const invoke = mockBridge();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ModelSettings />);

    fireEvent.click(await screen.findByText("高级设置"));
    fireEvent.click(await screen.findByRole("button", { name: "清理" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.model.delete", {
      modelId: defaultProfile.model.url,
      auxiliaryModelIds: [defaultProfile.auxiliaryModels[0]!.url],
    }));
  });

  it("passes a progress request id when preparing local AI", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            apiKey: "",
            chatModel: defaultProfile.model.id,
          },
        };
      }
      if (channel === "settings.get") {
        return {
          settings: {
            inferenceRuntime: {
              runtimeKind: "managed_llama_server",
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
        return { profiles: [defaultProfile, qualityProfile] };
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

    fireEvent.click(await screen.findByRole("button", { name: "重启" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "inference.runtime.start",
        expect.objectContaining({
          runtimeKind: "managed_llama_server",
          requestId: expect.any(String),
        }),
      );
    });
  });
});
