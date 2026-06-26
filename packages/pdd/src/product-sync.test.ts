import { describe, expect, it, vi } from "vitest";
import type { GovernedKnowledgeRecord } from "@customer-agent/core";
import type { PddProductDetail, PddProductSummary } from "./api.js";
import { buildProductKnowledgeContent, PddProductSyncService } from "./product-sync.js";

describe("PddProductSyncService", () => {
  it("runs full product sync with pagination, detail fetch, and source metadata", async () => {
    const products = [product("100001", "围巾"), product("100002", "帽子")];
    const getProductList = vi
      .fn()
      .mockResolvedValueOnce({ products: [products[0]], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ products: [products[1]], total: 2, page: 2, pageSize: 1 });
    const getProductDetail = vi
      .fn()
      .mockResolvedValueOnce(detail("100001"))
      .mockResolvedValueOnce(detail("100002"));
    const saved: unknown[] = [];
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      saveProductKnowledge: async (input) => {
        saved.push(input);
        return record(input.product.goodsId, 1);
      },
    });

    await expect(service.sync({ mode: "full", pageSize: 1 })).resolves.toMatchObject({
      phase: "completed",
      total: 2,
      added: 2,
      failed: 0,
    });
    expect(getProductList).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 1, antiContent: "anti" });
    expect(getProductList).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 1, antiContent: "anti" });
    expect(getProductDetail).toHaveBeenCalledWith("100001", { antiContent: "anti" });
    expect(saved[0]).toMatchObject({
      product: { goodsId: "100001" },
      content: expect.stringContaining("商品名称：围巾"),
      sourceMetadata: {
        productList: { endpoint: "/latitude/goods/recommendGoods" },
        productDetail: { endpoint: "/glide/v2/mms/query/commit/on_shop/detail" },
      },
    });
  });

  it("fails before calling PDD product APIs when anti-content is missing", async () => {
    const getProductList = vi.fn();
    const getProductDetail = vi.fn();
    const saveProductKnowledge = vi.fn();
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      saveProductKnowledge,
    });

    await expect(service.sync({ mode: "full" })).resolves.toMatchObject({
      phase: "failed",
      failed: 1,
      failures: [{
        error: "当前 PDD 会话缺少商品接口所需的 anti-content，请在账号页点击登录刷新会话后再同步商品。",
        retryable: true,
      }],
    });
    expect(getProductList).not.toHaveBeenCalled();
    expect(getProductDetail).not.toHaveBeenCalled();
    expect(saveProductKnowledge).not.toHaveBeenCalled();
  });

  it("skips known products in incremental sync", async () => {
    const getProductList = vi.fn().mockResolvedValue({ products: [product("100001", "围巾")], total: 1, page: 1, pageSize: 50 });
    const getProductDetail = vi.fn();
    const saveProductKnowledge = vi.fn();
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      isKnownProduct: async () => true,
      saveProductKnowledge,
    });

    await expect(service.sync({ mode: "incremental" })).resolves.toMatchObject({
      phase: "completed",
      skipped: 1,
      added: 0,
    });
    expect(getProductDetail).not.toHaveBeenCalled();
    expect(saveProductKnowledge).not.toHaveBeenCalled();
  });

  it("records retryable detail failures without promoting guessed knowledge", async () => {
    const getProductList = vi.fn().mockResolvedValue({ products: [product("100001", "围巾")], total: 1, page: 1, pageSize: 50 });
    const getProductDetail = vi.fn().mockRejectedValue(new Error("detail unavailable"));
    const saveProductKnowledge = vi.fn();
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      saveProductKnowledge,
    });

    await expect(service.sync({ mode: "full", maxAttempts: 2 })).resolves.toMatchObject({
      phase: "failed",
      failed: 1,
      failures: [{ goodsId: "100001", error: "detail unavailable", retryable: true }],
    });
    expect(getProductDetail).toHaveBeenCalledTimes(2);
    expect(saveProductKnowledge).not.toHaveBeenCalled();
  });

  it("uses multimodal extraction output when saving synchronized product knowledge", async () => {
    const products = [product("100001", "围巾")];
    const getProductList = vi.fn().mockResolvedValue({ products, total: 1, page: 1, pageSize: 50 });
    const getProductDetail = vi.fn().mockResolvedValue(detail("100001"));
    const extractProductKnowledge = vi.fn().mockResolvedValue({
      content: "# 围巾\n\n品牌：云织\n卖点：柔软保暖\nFAQ：是否适合秋冬？适合。",
      tags: ["云织", "秋冬"],
      sourceMetadata: { extractionModel: "gemma-vision", multimodal: true },
    });
    const saved: unknown[] = [];
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      extractProductKnowledge,
      saveProductKnowledge: async (input) => {
        saved.push(input);
        return record(input.product.goodsId, 1);
      },
    });

    await expect(service.sync({ mode: "full" })).resolves.toMatchObject({
      phase: "completed",
      added: 1,
      failed: 0,
    });

    expect(extractProductKnowledge).toHaveBeenCalledWith({
      product: products[0],
      detail: detail("100001"),
      baseContent: expect.stringContaining("商品名称：围巾"),
    });
    expect(saved[0]).toMatchObject({
      content: expect.stringContaining("品牌：云织"),
      tags: expect.arrayContaining(["新品", "服饰", "云织", "秋冬"]),
      sourceMetadata: expect.objectContaining({
        extractionModel: "gemma-vision",
        multimodal: true,
      }),
    });
  });

  it("preserves a draft source record and records a retryable failure when extraction fails", async () => {
    const products = [product("100001", "围巾")];
    const getProductList = vi.fn().mockResolvedValue({ products, total: 1, page: 1, pageSize: 50 });
    const getProductDetail = vi.fn().mockResolvedValue(detail("100001"));
    const saveProductKnowledge = vi.fn(async (input) => record(input.product.goodsId, 1));
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      extractProductKnowledge: async () => {
        throw new Error("vision model unavailable");
      },
      saveProductKnowledge,
    });

    await expect(service.sync({ mode: "full" })).resolves.toMatchObject({
      phase: "failed",
      added: 1,
      failed: 1,
      failures: [{ goodsId: "100001", error: "vision model unavailable", retryable: true }],
    });
    expect(saveProductKnowledge).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("商品名称：围巾"),
      tags: expect.arrayContaining(["extraction_failed"]),
      sourceMetadata: expect.objectContaining({ extractionError: "vision model unavailable" }),
    }));
  });

  it("honors cancellation before product detail processing", async () => {
    const controller = new AbortController();
    const getProductList = vi.fn().mockResolvedValue({ products: [product("100001", "围巾")], total: 1, page: 1, pageSize: 50 });
    const getProductDetail = vi.fn();
    const service = new PddProductSyncService({
      api: { getProductList, getProductDetail },
      shopId: "shop-1",
      antiContent: "anti",
      saveProductKnowledge: async (input) => record(input.product.goodsId, 1),
      onProgress: (progress) => {
        if (progress.phase === "fetching" && progress.current === 1) {
          controller.abort();
        }
      },
    });

    await expect(service.sync({ mode: "full", signal: controller.signal })).resolves.toMatchObject({
      phase: "cancelled",
    });
    expect(getProductDetail).not.toHaveBeenCalled();
  });

  it("builds product knowledge content from list and detail fields", () => {
    expect(buildProductKnowledgeContent(product("100001", "围巾"), detail("100001"))).toContain("规格：颜色: 米白");
  });
});

function product(goodsId: string, goodsName: string): PddProductSummary {
  return {
    goodsId,
    goodsName,
    price: "59.90",
    quantity: 10,
    soldQuantity: 20,
    tag: "新品",
    sourceMetadata: {
      endpoint: "/latitude/goods/recommendGoods",
      page: 1,
      parsedFields: ["goodsId", "goodsName"],
    },
  };
}

function detail(goodsId: string): PddProductDetail {
  return {
    goodsId,
    goodsName: "围巾",
    specifications: ["颜色: 米白"],
    categories: ["服饰"],
    images: ["https://img.example/a.jpg"],
    rawSourceKeys: ["goods_id", "skus"],
    sourceMetadata: {
      endpoint: "/glide/v2/mms/query/commit/on_shop/detail",
      parsedFields: ["goods_id", "skus.spec"],
    },
  };
}

function record(goodsId: string, version: number): GovernedKnowledgeRecord {
  return {
    id: `record-${goodsId}`,
    citationId: `product:shop-1:${goodsId}`,
    kind: "product",
    shopId: "shop-1",
    title: goodsId,
    content: goodsId,
    tags: [],
    sourceType: "pdd_product",
    sourceId: goodsId,
    version,
    enabled: true,
    reviewState: "draft",
    stale: false,
    conflict: false,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}
