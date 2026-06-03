export interface PddHttp {
  postJson<TResponse = unknown>(url: string, body: unknown): Promise<TResponse>;
  postEmptyJson<TResponse = unknown>(url: string): Promise<TResponse>;
  postForm<TResponse = unknown>(url: string, body: Record<string, string>): Promise<TResponse>;
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
    const response = await this.http.postForm<PddResponse>("https://mms.pinduoduo.com/chats/getToken", { version: "3" });
    const token = stringValue(response.token) ?? stringValue(response.result?.token);
    if (!token) {
      throw new Error(`无法从 PDD 响应中获取 chat token: ${JSON.stringify(response)}`);
    }
    return token;
  }

  async getUserInfo(): Promise<PddUserInfo> {
    const response = await this.http.postEmptyJson<PddResponse>("https://mms.pinduoduo.com/janus/api/new/userinfo");
    ensureSuccess(response, "获取用户信息失败");
    return {
      userId: requiredString(response.result?.id, "user id"),
      username: requiredString(response.result?.username, "username"),
      mallId: requiredString(response.result?.mall_id, "mall id"),
    };
  }

  async getShopInfo(): Promise<PddShopInfo> {
    const response = await this.http.postJson<PddResponse>("https://mms.pinduoduo.com/earth/api/merchant/queryMerchantInfoByMallId", {});
    ensureSuccess(response, "获取店铺信息失败");
    const shopLogo = stringValue(response.result?.mallLogo);
    return {
      shopId: requiredString(response.result?.mallId, "shop id"),
      shopName: requiredString(response.result?.mallName, "shop name"),
      ...(shopLogo ? { shopLogo } : {}),
    };
  }

  async setOnlineStatus(status: string): Promise<boolean> {
    const response = await this.http.postJson<PddResponse>("https://mms.pinduoduo.com/plateau/chat/set_csstatus", {
      data: { cmd: "set_csstatus", status },
      client: "WEB",
    });
    ensureSuccess(response, "设置客服状态失败");
    return true;
  }

  async sendText(recipientUid: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this.http.postJson<PddResponse>("https://mms.pinduoduo.com/plateau/chat/send_message", {
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

function generateRequestId(): string {
  return String(Math.floor(Date.now() * 1000 + Math.random() * 1000));
}
