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
      return { ok: true };
    }),
  } as unknown as CustomerAgentBridge;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App", () => {
  it("renders the first-version shell sections", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "拼多多 AI 客服助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动回复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "账号管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模型设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日志" })).toBeInTheDocument();
  });

  it("switches sections when navigation items are clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "账号管理" }));

    expect(screen.getByRole("heading", { name: "账号管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "账号管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByText("等待添加拼多多客服账号。")).toBeInTheDocument();
  });
});
