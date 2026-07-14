import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CustomerAgentBridge } from "../preload/index.cts";

beforeEach(() => {
  // Mock electron IPC bridge
  window.customerAgent = {
    invoke: vi.fn(async (channel: string) => {
      if (channel === "app.health") return { ok: true, worker: "ready" };
      if (channel === "account.list") return { accounts: [] };
      if (channel === "message.list") return { messages: [] };
      if (channel === "reply.draft.list") return { drafts: [] };
      if (channel === "agent.audit.list") return { records: [] };
      if (channel === "queue.metrics") {
        return {
          metrics: {
            depth: 1,
            pending: 1,
            retryWaiting: 0,
            processing: 0,
            completed: 2,
            failed: 0,
            deadLetter: 0,
            retryCount: 0,
            failureCount: 0,
            averageProcessingLatencyMs: 1234,
          },
        };
      }
      if (channel === "queue.list") return { items: [] };
      if (channel === "dependency.health") return { dependencies: [] };
      if (channel === "acceptance.status") {
        return {
          ok: false,
          commitSha: "test-commit",
          platform: "darwin-arm64",
          records: 0,
          errors: ["pdd-real-merchant-operations is missing passing evidence"],
          matrix: [],
        };
      }
      if (channel === "log.list") return { logs: [] };
      if (channel === "inference.health") return { ok: false, error: "未配置" };
      return { ok: true };
    }),
  } as unknown as CustomerAgentBridge;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App", () => {
  it("renders the task-oriented navigation", () => {
    render(<App />);

    expect(screen.getByText("客服助手")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "实时工作台" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "队列" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AI 处理记录" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "模型" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "发布" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "设置" })).toBeInTheDocument();
  });

  it("lands on the overview by default", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "实时工作台" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "概览" })).toHaveAttribute("aria-current", "page");
  });

  it("switches sections when navigation items are clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("option", { name: "账号" }));

    expect(screen.getByRole("heading", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "账号" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("等待添加拼多多客服账号")).toBeInTheDocument();
  });

  it("opens the queue operations page with live queue metrics", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("option", { name: "队列" }));

    // The design repeats "消息工作流" as both the page title and a panel
    // heading inside the page, so disambiguate by heading level.
    expect(screen.getByRole("heading", { name: "消息工作流", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("积压深度")).toBeInTheDocument();
    expect((await screen.findAllByText("1")).length).toBeGreaterThan(0);
  });

  it("opens the release status page with acceptance gate state", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("option", { name: "发布" }));

    // Per design the release page has no in-content heading; the topbar carries the title.
    expect(screen.getByText("发布", { selector: "header *" })).toBeInTheDocument();
    expect(await screen.findByText("门禁未通过")).toBeInTheDocument();
    expect(await screen.findByText(/commit test-co/)).toBeInTheDocument();
  });

  it("updates the top inference status when model health changes", async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "settings.get") {
        return { settings: { modelProvider: "remote" } };
      }
      if (channel === "inference.health") {
        return { ok: false, error: "未配置" };
      }
      if (channel === "account.list") return { accounts: [] };
      if (channel === "message.list") return { messages: [] };
      if (channel === "reply.draft.list") return { drafts: [] };
      return { ok: true };
    });
    window.customerAgent = {
      invoke,
      on: vi.fn(() => () => undefined),
    } as unknown as CustomerAgentBridge;

    render(<App />);

    expect(await screen.findByText("云端 AI 未连接")).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("customer-agent:inference-health-changed", {
      detail: { ok: true },
    }));

    expect(await screen.findByText("云端 AI 已连接")).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("customer-agent:inference-health-changed", {
      detail: { modelProvider: "local", ok: null },
    }));

    expect(await screen.findByText("正在检查本地 AI…")).toBeInTheDocument();
  });
});
