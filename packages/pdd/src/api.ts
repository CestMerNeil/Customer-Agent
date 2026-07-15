import { pddHttpBaseUrl } from "./endpoints.js";

export interface PddHttp {
  postJson<TResponse = unknown>(url: string, body: unknown, options?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<TResponse>;
  postEmptyJson<TResponse = unknown>(url: string, options?: { signal?: AbortSignal }): Promise<TResponse>;
  postForm<TResponse = unknown>(url: string, body: Record<string, string>, options?: { signal?: AbortSignal }): Promise<TResponse>;
}

export interface PddUserInfo {
  userId: string;
  username: string;
  mallId: string;
}

export interface PddShopInfo {
  shopId: string;
  shopName: string;
  shopLogo?: string;
}

export interface PddProductSummary {
  goodsId: string;
  goodsName: string;
  thumbUrl?: string;
  price?: string;
  priceMin?: number;
  priceMax?: number;
  soldQuantity?: number;
  soldQuantity30d?: number;
  quantity?: number;
  goodsType?: string;
  tag?: string;
  goodsUrl?: string;
  sourceMetadata: {
    endpoint: string;
    page: number;
    parsedFields: string[];
  };
}

export interface PddProductListResult {
  products: PddProductSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PddProductDetail {
  goodsId: string;
  goodsName?: string;
  specifications: string[];
  categories: string[];
  images: string[];
  rawSourceKeys: string[];
  sourceMetadata: {
    endpoint: string;
    parsedFields: string[];
  };
}

export interface PddCustomerServiceAccount {
  uid: string;
  username?: string;
  status?: string;
}

export type PddCustomerServiceAvailability = "online" | "busy" | "offline";

const pddCustomerServiceStatusCode: Record<PddCustomerServiceAvailability, "1" | "0" | "3"> = {
  online: "1",
  busy: "0",
  offline: "3",
};

interface PddResponse {
  success?: boolean;
  result?: Record<string, unknown>;
  token?: string;
  errorMsg?: string;
  error_msg?: string;
  errorCode?: string | number;
  error_code?: string | number;
  message?: string;
  msg?: string;
}

export class PddApi {
  private readonly http: PddHttp;
  private readonly requestId: (() => string) | undefined;

  constructor(options: { http: PddHttp; requestId?: () => string }) {
    this.http = options.http;
    this.requestId = options.requestId;
  }

  async getChatToken(): Promise<string> {
    const response = await this.http.postForm<PddResponse>(`${pddHttpBaseUrl()}/chats/getToken`, { version: "3" });
    const token = stringValue(response.token) ?? stringValue(response.result?.token);
    if (!token) {
      throw new Error(`无法从 PDD 响应中获取 chat token: ${JSON.stringify(response)}`);
    }
    return token;
  }

  async getUserInfo(): Promise<PddUserInfo> {
    const response = await this.http.postEmptyJson<PddResponse>(`${pddHttpBaseUrl()}/janus/api/new/userinfo`);
    ensureSuccess(response, "获取用户信息失败");
    return {
      userId: requiredString(response.result?.id, "user id"),
      username: requiredString(response.result?.username, "username"),
      mallId: requiredString(response.result?.mall_id, "mall id"),
    };
  }

  async getShopInfo(): Promise<PddShopInfo> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/earth/api/merchant/queryMerchantInfoByMallId`, {});
    ensureSuccess(response, "获取店铺信息失败");
    const shopLogo = stringValue(response.result?.mallLogo);
    return {
      shopId: requiredString(response.result?.mallId, "shop id"),
      shopName: requiredString(response.result?.mallName, "shop name"),
      ...(shopLogo ? { shopLogo } : {}),
    };
  }

  async setOnlineStatus(status: PddCustomerServiceAvailability): Promise<boolean> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/plateau/chat/set_csstatus`, {
      data: { cmd: "set_csstatus", status: pddCustomerServiceStatusCode[status] },
      client: "WEB",
    });
    ensureSuccess(response, "设置客服状态失败");
    return true;
  }

  async sendText(recipientUid: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/plateau/chat/send_message`, {
      data: {
        cmd: "send_message",
        request_id: this.requestId?.() ?? generateRequestId(),
        message: {
          to: { role: "user", uid: recipientUid },
          from: { role: "mall_cs" },
          content,
          msg_id: null,
          type: 0,
          is_aut: 0,
          manual_reply: 1,
        },
      },
      client: "WEB",
    });
    if (response.success !== true) {
      return { ok: false, error: response.errorMsg ?? JSON.stringify(response) };
    }
    const error = stringValue(response.result?.error);
    if (error) {
      return { ok: false, error };
    }
    return { ok: true };
  }

  async sendImage(recipientUid: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/plateau/chat/send_message`, {
      data: {
        cmd: "send_message",
        request_id: this.requestId?.() ?? generateRequestId(),
        message: {
          to: { role: "user", uid: recipientUid },
          from: { role: "mall_cs" },
          content: imageUrl,
          msg_id: null,
          chat_type: "cs",
          type: 1,
          is_aut: 0,
          manual_reply: 1,
        },
      },
      client: "WEB",
    });
    return sendResult(response);
  }

  async sendGoodsCard(
    recipientUid: string,
    goodsId: string | number,
    options: { bizType?: number; antiContent?: string } = {},
  ): Promise<{ ok: boolean; error?: string }> {
    const normalizedGoodsId = normalizeGoodsId(goodsId);
    if (!normalizedGoodsId) {
      return { ok: false, error: "goods_id 无效，不能使用商品列表序号作为商品 ID" };
    }
    try {
      const response = await this.http.postJson<PddResponse>(
        `${pddHttpBaseUrl()}/plateau/message/send/mallGoodsCard`,
        { uid: recipientUid, goods_id: Number(normalizedGoodsId), biz_type: options.bizType ?? 2 },
        { headers: productHeaders(options.antiContent) },
      );
      return sendResult(response);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getAssignedCustomerServices(): Promise<PddCustomerServiceAccount[]> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/latitude/assign/getAssignCsList`, {
      wechatCheck: true,
    });
    ensureSuccess(response, "获取客服列表失败");
    const list = asRecord(response.result).csList;
    if (Array.isArray(list)) {
      return list.map(parseCustomerServiceAccount).filter(Boolean) as PddCustomerServiceAccount[];
    }
    return Object.entries(asRecord(list)).map(([uid, value]) => ({
      uid,
      ...parseCustomerServiceProfile(value),
    }));
  }

  async moveConversation(recipientUid: string, customerServiceUid: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.http.postJson<PddResponse>(`${pddHttpBaseUrl()}/plateau/chat/move_conversation`, {
      data: {
        cmd: "move_conversation",
        request_id: this.requestId?.() ?? generateRequestId(),
        conversation: {
          csid: customerServiceUid,
          uid: recipientUid,
          need_wx: false,
          remark: "无原因直接转移",
        },
      },
      client: "WEB",
    });
    return sendResult(response);
  }

  async getProductList(options: { page?: number; pageSize?: number; antiContent?: string; signal?: AbortSignal } = {}): Promise<PddProductListResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const response = await this.http.postJson<PddResponse>(
      `${pddHttpBaseUrl()}/latitude/goods/recommendGoods`,
      { uid: "", pageNum: page, pageSize },
      { headers: productHeaders(options.antiContent), ...(options.signal ? { signal: options.signal } : {}) },
    );
    ensureSuccess(response, "获取商品列表失败");
    const result = asRecord(response.result);
    const products = arrayValue(result.onSaleGoods).map((item) => parseProductSummary(item, page));
    return {
      products,
      total: numberValue(result.total) ?? products.length,
      page,
      pageSize,
    };
  }

  async getProductDetail(goodsId: string | number, options: { antiContent?: string; signal?: AbortSignal } = {}): Promise<PddProductDetail> {
    const normalizedGoodsId = normalizeGoodsId(goodsId);
    if (!normalizedGoodsId) {
      throw new Error("商品ID不能为空");
    }
    const response = await this.http.postJson<PddResponse>(
      `${pddHttpBaseUrl()}/glide/v2/mms/query/commit/on_shop/detail`,
      { goods_id: normalizedGoodsId },
      { headers: productHeaders(options.antiContent), ...(options.signal ? { signal: options.signal } : {}) },
    );
    ensureSuccess(response, "获取商品详情失败");
    return parseProductDetail(response.result, normalizedGoodsId);
  }
}

function sendResult(response: PddResponse): { ok: boolean; error?: string } {
  if (response.success !== true) {
    return { ok: false, error: responseError(response, "发送失败") };
  }
  const result = asRecord(response.result);
  const error = stringValue(result.error) ?? stringValue(result.error_msg);
  if (error) {
    return { ok: false, error };
  }
  return { ok: true };
}

function ensureSuccess(response: PddResponse, fallback: string): void {
  if (response.success !== true) {
    throw new Error(responseError(response, fallback));
  }
}

function responseError(response: PddResponse, fallback: string): string {
  const message = stringValue(response.errorMsg)
    ?? stringValue(response.error_msg)
    ?? stringValue(response.message)
    ?? stringValue(response.msg)
    ?? fallback;
  const code = stringValue(response.errorCode) ?? stringValue(response.error_code);
  return code ? `${message}（${code}）` : message;
}

function productHeaders(antiContent?: string): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...(antiContent ? { "anti-content": antiContent } : {}),
    "content-type": "application/json;charset=UTF-8",
    origin: "https://mms.pinduoduo.com",
    priority: "u=1, i",
    referer: "https://mms.pinduoduo.com/chat-merchant/index.html",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
}

function parseProductSummary(value: unknown, page: number): PddProductSummary {
  const goods = asRecord(value);
  const minPrice = numberValue(goods.minOnSaleGroupPrice);
  const maxPrice = numberValue(goods.maxOnSaleGroupPrice);
  const thumbUrl = optionalString(goods.thumbUrl);
  const price = formatPriceRange(minPrice, maxPrice);
  const goodsType = optionalString(goods.goodsType);
  const goodsUrl = optionalString(goods.goodsUrl);
  const marketingTags = arrayValue(asRecord(goods.goodsTag).marketingTags)
    .map((tag) => stringValue(tag))
    .filter((tag): tag is string => Boolean(tag));
  const parsedFields = [
    "goodsId",
    "goodsName",
    "thumbUrl",
    "minOnSaleGroupPrice",
    "maxOnSaleGroupPrice",
    "soldQuantity",
    "soldQuantity30d",
    "quantity",
    "goodsType",
    "goodsTag.marketingTags",
    "goodsUrl",
  ].filter((field) => hasPath(goods, field));
  const product: PddProductSummary = {
    goodsId: requiredString(goods.goodsId, "goods id"),
    goodsName: stringValue(goods.goodsName) ?? "",
    sourceMetadata: {
      endpoint: "/latitude/goods/recommendGoods",
      page,
      parsedFields,
    },
  };
  if (thumbUrl) product.thumbUrl = thumbUrl;
  if (price) product.price = price;
  if (minPrice !== undefined) product.priceMin = minPrice;
  if (maxPrice !== undefined) product.priceMax = maxPrice;
  const soldQuantity = numberValue(goods.soldQuantity);
  if (soldQuantity !== undefined) product.soldQuantity = soldQuantity;
  const soldQuantity30d = numberValue(goods.soldQuantity30d);
  if (soldQuantity30d !== undefined) product.soldQuantity30d = soldQuantity30d;
  const quantity = numberValue(goods.quantity);
  if (quantity !== undefined) product.quantity = quantity;
  if (goodsType) product.goodsType = goodsType;
  if (marketingTags.length) product.tag = marketingTags.join(", ");
  if (goodsUrl) product.goodsUrl = goodsUrl;
  return product;
}

function parseProductDetail(value: unknown, fallbackGoodsId: string): PddProductDetail {
  const result = asRecord(value);
  const skus = arrayValue(result.skus).map(asRecord);
  const specifications = skus.flatMap((sku) => arrayValue(sku.spec).map(formatSpec).filter(Boolean) as string[]).slice(0, 20);
  const categories = arrayValue(result.cats).map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
  const images = [
    ...arrayValue(result.carousel_gallery).map((item) => stringValue(item)),
    ...arrayValue(result.detail_gallery).map((item) => stringValue(item)),
    stringValue(result.thumb_url),
  ].filter((item): item is string => Boolean(item));
  const detail: PddProductDetail = {
    goodsId: stringValue(result.goods_id) ?? stringValue(result.goodsId) ?? fallbackGoodsId,
    specifications,
    categories,
    images: Array.from(new Set(images)),
    rawSourceKeys: Object.keys(result).sort(),
    sourceMetadata: {
      endpoint: "/glide/v2/mms/query/commit/on_shop/detail",
      parsedFields: ["goods_id", "goods_name", "skus.spec", "cats", "carousel_gallery", "detail_gallery", "thumb_url"].filter((field) => hasPath(result, field)),
    },
  };
  const goodsName = optionalString(result.goods_name ?? result.goodsName);
  if (goodsName) detail.goodsName = goodsName;
  return detail;
}

function formatSpec(value: unknown): string | undefined {
  const spec = asRecord(value);
  const parent = optionalString(spec.parent_name ?? spec.parentName);
  const name = optionalString(spec.spec_name ?? spec.specName);
  if (parent && name) {
    return `${parent}: ${name}`;
  }
  return name;
}

function formatPriceRange(minPrice?: number, maxPrice?: number): string | undefined {
  if (minPrice !== undefined && maxPrice !== undefined && minPrice !== maxPrice) {
    return `${(minPrice / 100).toFixed(2)}-${(maxPrice / 100).toFixed(2)}`;
  }
  if (minPrice !== undefined) {
    return (minPrice / 100).toFixed(2);
  }
  return undefined;
}

function parseCustomerServiceAccount(value: unknown): PddCustomerServiceAccount | undefined {
  const record = asRecord(value);
  const uid = stringValue(record.uid ?? record.csUid ?? record.cs_uid ?? record.id);
  if (!uid) {
    return undefined;
  }
  return {
    uid,
    ...parseCustomerServiceProfile(record),
  };
}

function parseCustomerServiceProfile(value: unknown): Omit<PddCustomerServiceAccount, "uid"> {
  const record = asRecord(value);
  const profile: Omit<PddCustomerServiceAccount, "uid"> = {};
  const username = optionalString(record.username ?? record.name);
  const status = optionalString(record.status);
  if (username) profile.username = username;
  if (status) profile.status = status;
  return profile;
}

function normalizeGoodsId(value: string | number): string | undefined {
  const string = stringValue(value)?.trim();
  if (!string || !/^\d+$/.test(string)) {
    return undefined;
  }
  if (Number(string) > 0 && Number(string) <= 100) {
    return undefined;
  }
  return string;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasPath(record: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let current: unknown = record;
  for (const part of parts) {
    const currentRecord = asRecord(current);
    if (!(part in currentRecord)) {
      return false;
    }
    current = currentRecord[part];
  }
  return current !== undefined && current !== null;
}

function requiredString(value: unknown, label: string): string {
  const string = stringValue(value);
  if (!string) {
    throw new Error(`PDD response missing ${label}`);
  }
  return string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function optionalString(value: unknown): string | undefined {
  const string = stringValue(value);
  return string && string.length > 0 ? string : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function generateRequestId(): string {
  return String(Math.floor(Date.now() * 1000 + Math.random() * 1000));
}
