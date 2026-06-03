import { buildCookieHeader, type CookieJar } from "./cookies.js";

type FetchLike = typeof fetch;

export interface PddHttpClientOptions {
  cookies: CookieJar | string;
  fetchImpl?: FetchLike;
}

export class PddHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: PddHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async postJson<TResponse = unknown>(url: string, body: unknown): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async postEmptyJson<TResponse = unknown>(url: string): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/json" },
      body: "",
    });
  }

  async postForm<TResponse = unknown>(url: string, body: Record<string, string>): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  private async post<TResponse>(url: string, init: { headers: Record<string, string>; body: string }): Promise<TResponse> {
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...defaultHeaders(),
        ...init.headers,
        Cookie: buildCookieHeader(this.options.cookies),
      },
      body: init.body,
    });
    if (!response.ok) {
      throw new Error(`PDD request failed with HTTP ${response.status}: ${await response.text()}`);
    }
    return await response.json() as TResponse;
  }
}

function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "origin": "https://mms.pinduoduo.com",
    "referer": "https://mms.pinduoduo.com/",
    "priority": "u=1, i",
  };
}
