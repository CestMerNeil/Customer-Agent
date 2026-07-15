import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localModelProfiles } from "@customer-agent/core";
import { ModelSettings } from "./ModelSettings";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

const defaultProfile = localModelProfiles.find((profile) => profile.defaultFor === "chat")!;
const qualityProfile = localModelProfiles.at(-1)!;

/** Installs the deterministic renderer bridge used by local UI-state tests. */
function mockBridge() {
  const invoke = vi.fn<(channel: string, request?: unknown) => Promise<Record<string, unknown>>>(async (channel: string) => {
    if (channel === "inference.config.get") {
      return {
        config: {
          baseUrl: "http://127.0.0.1:8000/v1",
          hasApiKey: false,
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
            modelPath: "/models/qwen3_5-9b.gguf",
            command: "llama-server",
            host: "127.0.0.1",
            port: 8000,
          },
        },
      };
    }
    if (channel === "inference.local.profiles") {
      return { profiles: [...localModelProfiles] };
    }
    if (channel === "inference.runtime.status") {
      return {
        running: true,
        baseUrl: "http://127.0.0.1:8000/v1",
        runtimeKind: "managed_llama_server",
        runtimeName: "应用托管 llama-server",
        modelPath: "/models/qwen3_5-9b.gguf",
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
            hasApiKey: true,
            chatModel: "qwen3.6-flash",
            enableThinking: false,
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
              modelPath: "/models/qwen3_5-9b.gguf",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [...localModelProfiles] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: true,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "/models/qwen3_5-9b.gguf",
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
    expect(screen.getByDisplayValue("qwen3.6-flash")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("已保存；留空将保持不变")).toHaveValue("");
    expect(screen.queryByDisplayValue("sk-test")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试连接/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "启用深度思考" })).not.toBeChecked();
    expect(screen.getByText("服务地址")).toBeInTheDocument();
    expect(screen.queryByText("模型档案")).not.toBeInTheDocument();
    expect(screen.queryByText("应用托管 llama-server")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("inference.local.profiles", undefined);
    expect(invoke).not.toHaveBeenCalledWith("inference.runtime.status", undefined);
    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.config.save", expect.objectContaining({
      chatModel: "qwen3.6-flash",
      enableThinking: false,
    })));
  });

  it("renders only local model controls in local mode", async () => {
    mockBridge();
    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: "本地 AI" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: /选择 Qwen3.5 4B 轻量多模态/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /选择 Qwen3.5 9B 标准多模态/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /选择 Qwen3.6 35B-A3B 高配多模态/ })).toBeInTheDocument();
    expect(screen.getByText("推荐")).toBeInTheDocument();
    // Two-column design states multimodal support once in the 选择模型 header.
    expect(screen.getByText("均支持图片 + 文本")).toBeInTheDocument();
    expect(screen.getByText(/A3B 不等于只占 3B 内存/)).toBeInTheDocument();
    const advanced = screen.getByRole("button", { name: "高级设置" });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(advanced);
    expect(advanced).toHaveAttribute("aria-expanded", "true");
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
            hasApiKey: false,
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
              modelPath: "/models/qwen3_6-35b-a3b.gguf",
              mmprojModelId: qualityProfile.auxiliaryModels![0]!.url,
              mmprojPath: "/models/qwen3_6-35b-a3b-mmproj.gguf",
              command: "llama-server",
              host: "127.0.0.1",
              port: 8000,
            },
          },
        };
      }
      if (channel === "inference.local.profiles") {
        return { profiles: [...localModelProfiles] };
      }
      if (channel === "inference.runtime.status") {
        return {
          running: false,
          baseUrl: "http://127.0.0.1:8000/v1",
          runtimeKind: "managed_llama_server",
          runtimeName: "应用托管 llama-server",
          modelPath: "/models/qwen3_6-35b-a3b.gguf",
          modelId: qualityProfile.model.url,
          modelReady: true,
          runtimeReady: true,
        };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    expect(await screen.findByRole("button", { name: /选择 Qwen3.6 35B-A3B 高配多模态/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to a selected model with one primary action", async () => {
    const invoke = mockBridge();
    render(<ModelSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /选择 Qwen3.6 35B-A3B 高配多模态/ }));
    fireEvent.click(screen.getByRole("button", { name: /下载并启用/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.runtime.stop", undefined));
    expect(invoke).toHaveBeenCalledWith(
      "inference.runtime.start",
      expect.objectContaining({
        modelId: qualityProfile.model.url,
        requestId: expect.any(String),
      }),
    );
    const startRequest = invoke.mock.calls.find(([channel]) => channel === "inference.runtime.start")?.[1];
    expect(startRequest).not.toHaveProperty("command");
    expect(startRequest).not.toHaveProperty("commandArgs");
  });

  it("exposes a local inference test action beside the runtime status", async () => {
    const invoke = mockBridge();
    render(<ModelSettings />);

    // settings resolve before first paint now, so the healthy state shows without a "未测试" flash
    expect(await screen.findByText("回复功能正常")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "检查" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.health", undefined));
    expect(screen.getByText("程序已安装")).toBeInTheDocument();
  });

  it("clears download progress after a model download failure", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            hasApiKey: false,
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
        return { profiles: [...localModelProfiles] };
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
      if (channel === "inference.runtime.start") {
        return { ok: false, running: false, error: "模型文件校验失败，请重新下载或更换模型档案。" };
      }
      return { ok: true };
    });

    render(<ModelSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /下载并启用/ }));

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
      auxiliaryModels: [{ ...defaultProfile.auxiliaryModels![0]!, sizeBytes: 1000 }],
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
      if (channel === "inference.runtime.start") {
        return new Promise(() => undefined);
      }
      if (channel === "inference.config.get") {
        return { config: { baseUrl: "http://127.0.0.1:8000/v1", hasApiKey: false, chatModel: smallProfile.model.id } };
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
    fireEvent.click(await screen.findByRole("button", { name: /下载并启用/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inference.runtime.start", expect.any(Object)));
    const request = (invoke.mock.calls as unknown as Array<[string, unknown]>)
      .find(([channel]) => channel === "inference.runtime.start")?.[1] as { requestId: string };
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
            hasApiKey: false,
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
        return { profiles: [...localModelProfiles] };
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
      auxiliaryModelIds: [defaultProfile.auxiliaryModels![0]!.url],
    }));
  });

  it("passes a progress request id when preparing local AI", async () => {
    const invoke = mockBridge();
    invoke.mockImplementation(async (channel: string): Promise<MockInvokeResult> => {
      if (channel === "inference.config.get") {
        return {
          config: {
            baseUrl: "http://127.0.0.1:8000/v1",
            hasApiKey: false,
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
        return { profiles: [...localModelProfiles] };
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

    fireEvent.click(await screen.findByRole("button", { name: /下载并启用/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "inference.runtime.start",
        expect.objectContaining({
          modelId: defaultProfile.model.url,
          requestId: expect.any(String),
        }),
      );
    });
  });
});
