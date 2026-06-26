import type { PddHttp } from "./api.js";

export interface BrowserFetchPage {
  evaluate<T>(
    fn: (request: BrowserFetchRequest) => Promise<BrowserFetchResponse>,
    request: BrowserFetchRequest,
  ): Promise<T>;
}

interface BrowserFetchRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

interface BrowserFetchResponse {
  ok: boolean;
  status: number;
  text: string;
}

export interface PddBrowserHttpClientOptions {
  page: BrowserFetchPage;
  antiContent?: string;
}

export class PddBrowserHttpClient implements PddHttp {
  constructor(private readonly options: PddBrowserHttpClientOptions) {}

  async postJson<TResponse = unknown>(url: string, body: unknown, options: { headers?: Record<string, string> } = {}): Promise<TResponse> {
    return this.post<TResponse>(url, JSON.stringify(body), {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      ...optionalAntiContent(this.options.antiContent),
      ...options.headers,
    });
  }

  async postEmptyJson<TResponse = unknown>(url: string): Promise<TResponse> {
    return this.post<TResponse>(url, "", {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      ...optionalAntiContent(this.options.antiContent),
    });
  }

  async postForm<TResponse = unknown>(url: string, body: Record<string, string>): Promise<TResponse> {
    return this.post<TResponse>(url, new URLSearchParams(body).toString(), {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      ...optionalAntiContent(this.options.antiContent),
    });
  }

  private async post<TResponse>(url: string, body: string, headers: Record<string, string>): Promise<TResponse> {
    const response = await this.options.page.evaluate<BrowserFetchResponse>(async (request) => {
      const fetchResponse = await fetch(request.url, {
        method: "POST",
        credentials: "include",
        headers: request.headers,
        body: request.body,
      });
      return {
        ok: fetchResponse.ok,
        status: fetchResponse.status,
        text: await fetchResponse.text(),
      };
    }, { url, body, headers });

    if (!response.ok) {
      throw new Error(`PDD browser request failed with HTTP ${response.status}: ${response.text}`);
    }
    return JSON.parse(response.text) as TResponse;
  }
}

function optionalAntiContent(antiContent?: string): Record<string, string> {
  return antiContent?.trim() ? { "anti-content": antiContent.trim() } : {};
}
