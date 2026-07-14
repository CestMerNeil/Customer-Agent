import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductSyncProgress } from "@customer-agent/core";
import type { CustomerAgentBridge } from "../../../preload/index.cts";
import { KnowledgeBaseManager } from "./KnowledgeBaseManager";

/** Installs a deterministic renderer bridge for product-sync UI tests. */
function mockBridge() {
  const unsubscribe = vi.fn();
  const invoke = vi.fn(async (channel: string, request?: unknown) => {
    if (channel === "knowledge.governed.list") {
      if ((request as { kind?: string } | undefined)?.kind === "customer_service") {
        return {
          records: [{
            id: "customer-knowledge-1",
            citationId: "customer_service:shop-a:return",
            kind: "customer_service",
            shopId: "shop-a",
            title: "退货政策",
            content: "签收后七天内可申请退货。",
            tags: ["退货", "售后"],
            sourceType: "llm_extraction",
            sourceId: "policy.docx",
            version: 1,
            enabled: false,
            reviewState: "draft",
            stale: false,
            conflict: false,
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z",
          }],
        };
      }
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
    if (channel === "knowledge.governed.delete") {
      return { ok: true };
    }
    if (channel === "knowledge.document.pick") {
      return { ok: true, documentId: "document-handle-1", basename: "policy.docx" };
    }
    if (channel === "knowledge.document.import") {
      return {
        ok: true,
        fileName: "policy.docx",
        fileType: "docx",
        entries: [{ title: "退货政策", content: "签收后七天内可申请退货。", tags: ["退货", "售后"] }],
        segmentsTotal: 2,
        segmentsCompleted: 2,
        failures: [],
      };
    }
    if (channel === "knowledge.customer_service.import") {
      return { ok: true, created: 1, skippedDuplicates: 0, failed: 0 };
    }
    return { ok: true };
  });
  const on = vi.fn((_channel: string, _listener: (progress: ProductSyncProgress) => void) => unsubscribe);
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

    // Product sync lives on the 商品知识 tab.
    fireEvent.click(await screen.findByRole("tab", { name: /商品知识/ }));
    fireEvent.click(await screen.findByRole("button", { name: "增量同步" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("product.sync.start", {
        accountId: "account-a",
        mode: "incremental",
      });
    });
    expect(on).toHaveBeenCalledWith("product.sync.progress", expect.any(Function));

    // Approving happens through the row detail overlay.
    fireEvent.click(await screen.findByText("围巾"));
    fireEvent.click(await screen.findByRole("button", { name: "审核并启用" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("knowledge.governed.state", {
        citationId: "product:shop-a:100001",
        reviewState: "reviewed",
        enabled: true,
      });
    });

    const progressHandler = on.mock.calls.find(([channel]) => channel === "product.sync.progress")?.[1];
    act(() => progressHandler?.({
      runId: "run-1",
      shopId: "shop-a",
      mode: "incremental",
      phase: "failed",
      total: 0,
      current: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      failures: [{ error: "远端 Model Provider 不支持图片输入", retryable: true }],
    }));
    expect(await screen.findByText("远端 Model Provider 不支持图片输入")).toBeInTheDocument();
  });

  it("previews parsed Office knowledge before saving it as a disabled draft", async () => {
    const { invoke } = mockBridge();
    render(<KnowledgeBaseManager />);

    fireEvent.click(await screen.findByRole("button", { name: "上传文档" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择文件" }));
    const previewDialog = await screen.findByRole("dialog", { name: "AI 文档解析结果" });
    expect(within(previewDialog).getByText("签收后七天内可申请退货。")).toBeInTheDocument();
    expect(within(previewDialog).getByText("退货 · 售后")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("knowledge.document.import", {
      shopId: "shop-a",
      documentId: "document-handle-1",
      requestId: expect.any(String),
    });

    fireEvent.click(screen.getByRole("button", { name: "保存所选知识" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("knowledge.customer_service.import", expect.objectContaining({
      shopId: "shop-a",
      reviewState: "draft",
      enabled: false,
      sourceType: "llm_extraction",
      sourceId: "policy.docx",
      rows: [{ title: "退货政策", content: "签收后七天内可申请退货。", tags: ["退货", "售后"] }],
    })));
  });

  it("opens readable knowledge details and deletes after confirmation", async () => {
    const { invoke } = mockBridge();
    render(<KnowledgeBaseManager />);

    fireEvent.click(await screen.findByText("退货政策"));
    expect(await screen.findByRole("dialog", { name: "退货政策" })).toBeInTheDocument();
    expect(screen.getByText("签收后七天内可申请退货。")).toBeInTheDocument();
    expect(screen.getByText("退货 · 售后 · v1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("dialog", { name: "删除知识" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("knowledge.governed.delete", {
      citationId: "customer_service:shop-a:return",
    }));
  });
});
