import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountManager } from "./AccountManager";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

function mockBridge() {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === "account.list") {
      return {
        accounts: [{
          id: "account-a",
          channel: "pinduoduo",
          username: "袁梦111111",
          shopId: "shop-a",
          shopName: "毅颖优品",
          userId: "164796905",
          status: "online",
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        }],
      };
    }
    if (channel === "account.runtime.list") {
      return {
        states: [{
          accountId: "account-a",
          state: "running",
          reconnectCount: 6,
          failureCategory: "network",
          lastError: "1005:",
          websocketConnected: false,
          requiresRelogin: false,
        }],
      };
    }
    if (channel === "log.list") {
      return { logs: [] };
    }
    return { ok: true };
  });
  window.customerAgent = {
    invoke,
  } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountManager", () => {
  it("shows transient websocket disconnects as background reconnecting instead of relogin required", async () => {
    mockBridge();
    render(<AccountManager />);

    expect(await screen.findByText("后台重连中")).toBeInTheDocument();
    expect(await screen.findByText("等待自动恢复")).toBeInTheDocument();
    expect(screen.queryByText("建议重登录账号")).not.toBeInTheDocument();
  });

  it("exposes an account logout action", async () => {
    const invoke = mockBridge();
    render(<AccountManager />);

    fireEvent.click(await screen.findByRole("button", { name: "退出" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("account.logout", { accountId: "account-a" }));
    expect(await screen.findByText("账号已退出登录")).toBeInTheDocument();
  });

  it("lets operators set shop customer-service availability", async () => {
    const invoke = mockBridge();
    render(<AccountManager />);

    fireEvent.click(await screen.findByRole("button", { name: "忙碌" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("account.availability.set", {
      accountId: "account-a",
      status: "busy",
    }));
    expect(await screen.findByText("接待状态已切换为忙碌")).toBeInTheDocument();
  });
});
