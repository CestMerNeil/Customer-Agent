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
      if (channel === "log.list") return { logs: [] };
      if (channel === "knowledge.list") return { documents: [] };
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

    expect(screen.getByRole("heading", { name: "拼多多 AI 客服助手" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "审核工作台" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "模型" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "日志" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "设置" })).toBeInTheDocument();
  });

  it("lands on the review workspace by default", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "审核工作台" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "审核工作台" })).toHaveAttribute("aria-current", "page");
  });

  it("switches sections when navigation items are clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("option", { name: "账号" }));

    expect(screen.getByRole("heading", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "账号" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("等待添加拼多多客服账号。")).toBeInTheDocument();
  });
});
