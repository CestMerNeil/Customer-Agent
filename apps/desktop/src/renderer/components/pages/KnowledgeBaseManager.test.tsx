import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAgentBridge } from "../../../preload/index.cts";
import { KnowledgeBaseManager } from "./KnowledgeBaseManager";

function mockBridge() {
  const unsubscribe = vi.fn();
  const invoke = vi.fn(async (channel: string, _request?: unknown) => {
    if (channel === "knowledge.governed.list") {
      return {
        records: [
          {
            id: "knowledge-1",
            citationId: "product:shop-a:100001",
            kind: "product",
            shopId: "shop-a",
            title: "围巾",
            content: "品牌：云织\n卖点：柔软保暖",
            tags: ["秋冬"],
            sourceType: "pdd_product",
            sourceId: "100001",
            version: 1,
            enabled: false,
            reviewState: "draft",
            stale: false,
            conflict: false,
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z",
          },
        ],
      };
    }
    if (channel === "account.list") {
      return {
        accounts: [
          {
            id: "account-a",
            channel: "pinduoduo",
            username: "pdd-account-a",
            shopId: "shop-a",
            shopName: "shop-a",
            userId: "user-a",
            status: "online",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z",
          },
        ],
      };
    }
    if (channel === "product.sync.start") {
      return {
        ok: true,
        run: {
          runId: "run-1",
          shopId: "shop-a",
          mode: "incremental",
          phase: "fetching",
          total: 0,
          current: 0,
          added: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          failures: [],
        },
      };
    }
    if (channel === "knowledge.governed.state") {
      return { ok: true };
    }
    return { ok: true };
  });
  const on = vi.fn(() => unsubscribe);
  window.customerAgent = { invoke, on } as unknown as CustomerAgentBridge;
  return { invoke, on, unsubscribe };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KnowledgeBaseManager", () => {
  it("starts real product sync for the selected account and approves generated product knowledge", async () => {
    const { invoke, on } = mockBridge();
    render(<KnowledgeBaseManager />);

    fireEvent.click(await screen.findByRole("button", { name: "增量同步" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("product.sync.start", {
        accountId: "account-a",
        mode: "incremental",
      });
    });
    expect(on).toHaveBeenCalledWith("product.sync.progress", expect.any(Function));

    fireEvent.click(await screen.findByRole("button", { name: "审核通过并启用 围巾" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("knowledge.governed.state", {
        citationId: "product:shop-a:100001",
        reviewState: "reviewed",
        enabled: true,
      });
    });
  });
});
