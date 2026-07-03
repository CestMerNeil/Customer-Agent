import type {
  GovernedKnowledgeRecord,
  ProductSyncMode,
  ProductSyncProgress
} from "@customer-agent/core";
import type { PddApi, PddProductDetail, PddProductListResult, PddProductSummary } from "./api.js";

export type {
  ProductSyncFailure,
  ProductSyncMode,
  ProductSyncPhase,
  ProductSyncProgress
} from "@customer-agent/core";

export interface ProductSyncSaveInput {
  product: PddProductSummary;
  detail?: PddProductDetail;
  content: string;
  tags: string[];
  sourceMetadata: Record<string, unknown>;
}

export interface ProductKnowledgeExtractionInput {
  product: PddProductSummary;
  detail?: PddProductDetail;
  baseContent: string;
}

export interface ProductKnowledgeExtractionResult {
  content: string;
  tags?: string[];
  sourceMetadata?: Record<string, unknown>;
}

export interface ProductSyncDependencies {
  api: Pick<PddApi, "getProductList" | "getProductDetail">;
  shopId: string;
  antiContent?: string;
  isKnownProduct?: (goodsId: string) => Promise<boolean> | boolean;
  extractProductKnowledge?: (input: ProductKnowledgeExtractionInput) => Promise<ProductKnowledgeExtractionResult>;
  saveProductKnowledge: (input: ProductSyncSaveInput) => Promise<GovernedKnowledgeRecord>;
  onProgress?: (progress: ProductSyncProgress) => void;
  now?: () => Date;
}

export interface ProductSyncOptions {
  mode: ProductSyncMode;
  pageSize?: number;
  maxPages?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  runId?: string;
}

const missingAntiContentMessage = "当前 PDD 会话缺少商品接口所需的 anti-content，请在账号页点击登录刷新会话后再同步商品。";

export class PddProductSyncService {
  constructor(private readonly deps: ProductSyncDependencies) {}

  async sync(options: ProductSyncOptions): Promise<ProductSyncProgress> {
    const maxAttempts = options.maxAttempts ?? 3;
    const progress: ProductSyncProgress = {
      runId: options.runId ?? `product-sync-${Date.now()}`,
      shopId: this.deps.shopId,
      mode: options.mode,
      phase: "fetching",
      total: 0,
      current: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };
    this.emit(progress);

    if (!this.deps.antiContent?.trim()) {
      progress.phase = "failed";
      progress.failed = 1;
      progress.failures.push({ error: missingAntiContentMessage, retryable: true });
      this.emit(progress);
      return progress;
    }

    try {
      const products = await this.fetchAllProducts(progress, options, maxAttempts);
      if (options.signal?.aborted) {
        return this.cancel(progress);
      }

      progress.phase = "saving";
      progress.total = products.length;
      progress.current = 0;
      this.emit(progress);

      for (const product of products) {
        if (options.signal?.aborted) {
          return this.cancel(progress);
        }
        progress.current += 1;
        progress.currentGoodsId = product.goodsId;
        progress.currentGoodsName = product.goodsName;
        this.emit(progress);

        const known = await this.deps.isKnownProduct?.(product.goodsId);
        if (options.mode === "incremental" && known) {
          progress.skipped += 1;
          continue;
        }

        try {
          const detail = await retry(
            () => this.deps.api.getProductDetail(product.goodsId, optionalAntiContent(this.deps.antiContent)),
            retryOptions(maxAttempts, options.retryDelayMs),
          );
          const payload = await this.buildKnowledgeSavePayload(product, detail);
          const record = await this.deps.saveProductKnowledge({
            product,
            detail,
            content: payload.content,
            tags: payload.tags,
            sourceMetadata: payload.sourceMetadata,
          });
          if (record.version > 1) {
            progress.updated += 1;
          } else {
            progress.added += 1;
          }
          if (payload.extractionError) {
            progress.failed += 1;
            progress.failures.push({
              goodsId: product.goodsId,
              error: payload.extractionError,
              retryable: true,
            });
          }
        } catch (error) {
          progress.failed += 1;
          progress.failures.push({
            goodsId: product.goodsId,
            error: errorMessage(error),
            retryable: true,
          });
        }
      }

      progress.phase = progress.failures.length ? "failed" : "completed";
      this.emit(progress);
      return progress;
    } catch (error) {
      progress.phase = "failed";
      progress.failed += 1;
      progress.failures.push({ error: errorMessage(error), retryable: true });
      this.emit(progress);
      return progress;
    }
  }

  private async fetchAllProducts(
    progress: ProductSyncProgress,
    options: ProductSyncOptions,
    maxAttempts: number,
  ): Promise<PddProductSummary[]> {
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    const products: PddProductSummary[] = [];
    let page = 1;
    while (page <= maxPages) {
      if (options.signal?.aborted) {
        break;
      }
      let result: PddProductListResult;
      try {
        result = await retry(
          () => this.deps.api.getProductList({ page, pageSize, ...optionalAntiContent(this.deps.antiContent) }),
          retryOptions(maxAttempts, options.retryDelayMs),
        );
      } catch (error) {
        progress.failed += 1;
        progress.failures.push({ page, error: errorMessage(error), retryable: true });
        break;
      }
      if (!result.products.length) {
        break;
      }
      products.push(...result.products);
      progress.total = result.total || products.length;
      progress.current = products.length;
      this.emit(progress);
      if (result.total > 0 && products.length >= result.total) {
        break;
      }
      page += 1;
    }
    return products;
  }

  private cancel(progress: ProductSyncProgress): ProductSyncProgress {
    progress.phase = "cancelled";
    this.emit(progress);
    return progress;
  }

  private emit(progress: ProductSyncProgress): void {
    this.deps.onProgress?.({ ...progress, failures: [...progress.failures] });
  }

  private async buildKnowledgeSavePayload(
    product: PddProductSummary,
    detail?: PddProductDetail,
  ): Promise<Pick<ProductSyncSaveInput, "content" | "tags" | "sourceMetadata"> & { extractionError?: string }> {
    const baseContent = buildProductKnowledgeContent(product, detail);
    const baseTags = buildProductTags(product, detail);
    const baseSourceMetadata = buildSourceMetadata(product, detail);
    if (!this.deps.extractProductKnowledge) {
      return {
        content: baseContent,
        tags: baseTags,
        sourceMetadata: baseSourceMetadata,
      };
    }

    try {
      const extracted = await this.deps.extractProductKnowledge({
        product,
        baseContent,
        ...(detail ? { detail } : {}),
      });
      return {
        content: extracted.content.trim() || baseContent,
        tags: mergeTags(baseTags, extracted.tags ?? []),
        sourceMetadata: {
          ...baseSourceMetadata,
          ...extracted.sourceMetadata,
        },
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        content: baseContent,
        tags: mergeTags(baseTags, ["extraction_failed"]),
        sourceMetadata: {
          ...baseSourceMetadata,
          extractionError: message,
        },
        extractionError: message,
      };
    }
  }
}

export function buildProductKnowledgeContent(product: PddProductSummary, detail?: PddProductDetail): string {
  const lines = [
    `商品名称：${product.goodsName}`,
    `商品ID：${product.goodsId}`,
  ];
  if (product.price) lines.push(`价格：${product.price} 元`);
  if (product.quantity !== undefined) lines.push(`库存：${product.quantity}`);
  if (product.soldQuantity !== undefined) lines.push(`累计销量：${product.soldQuantity}`);
  if (product.soldQuantity30d !== undefined) lines.push(`近30天销量：${product.soldQuantity30d}`);
  if (product.tag) lines.push(`标签：${product.tag}`);
  if (detail?.categories.length) lines.push(`分类：${detail.categories.join(" > ")}`);
  if (detail?.specifications.length) lines.push(`规格：${detail.specifications.join("；")}`);
  if (detail?.images.length) lines.push(`图片数量：${detail.images.length}`);
  return lines.join("\n");
}

export function buildProductTags(product: PddProductSummary, detail?: PddProductDetail): string[] {
  const tags = [
    ...product.tag?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
    ...detail?.categories ?? [],
  ];
  return Array.from(new Set(tags));
}

export function buildSourceMetadata(product: PddProductSummary, detail?: PddProductDetail): Record<string, unknown> {
  return {
    productList: product.sourceMetadata,
    productDetail: detail?.sourceMetadata,
    syncedAt: new Date().toISOString(),
  };
}

function mergeTags(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().map((tag) => tag.trim()).filter(Boolean)));
}

function optionalAntiContent(antiContent?: string): { antiContent?: string } {
  return antiContent ? { antiContent } : {};
}

function retryOptions(maxAttempts: number, retryDelayMs?: number): { maxAttempts: number; retryDelayMs?: number } {
  return retryDelayMs === undefined ? { maxAttempts } : { maxAttempts, retryDelayMs };
}

async function retry<T>(operation: () => Promise<T>, options: { maxAttempts: number; retryDelayMs?: number }): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < options.maxAttempts && options.retryDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
      }
    }
  }
  throw lastError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
