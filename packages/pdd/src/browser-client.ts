import type { PddHttp } from "./api.js";
import { withPddRequestDeadline } from "./client.js";

/** Minimal Playwright page surface needed for browser-context requests. */
export interface BrowserFetchPage {
  /**
   * Evaluates one serialized request function in the logged-in page.
   *
   * @param fn Browser-side request function.
   * @param request Serializable request data.
   * @returns The browser function result.
   */
  evaluate<T>(
    fn: (request: BrowserFetchRequest) => Promise<BrowserFetchResponse>,
    request: BrowserFetchRequest,
  ): Promise<T>;
}

/** Serialized browser-side request including its cancellation deadline. */
interface BrowserFetchRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

/** Serializable result returned from the browser-side fetch. */
interface BrowserFetchResponse {
  ok: boolean;
  status: number;
  text: string;
  timedOut?: boolean;
}

/** Dependencies and authentication metadata for browser-backed PDD requests. */
export interface PddBrowserHttpClientOptions {
  page: BrowserFetchPage;
  antiContent?: string;
  timeoutMs?: number;
}

/** Sends authenticated PDD requests through an already logged-in browser page. */
export class PddBrowserHttpClient implements PddHttp {
  /**
   * Creates a browser-backed client with a bounded request duration.
   *
   * @param options Browser page, optional anti-content, and timeout.
   */
  constructor(private readonly options: PddBrowserHttpClientOptions) {}

  /**
   * Posts a JSON body and parses the JSON response.
   *
   * @param url PDD endpoint URL.
   * @param body JSON-serializable request body.
   * @param options Optional request headers and caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, HTTP status fails, or JSON is invalid.
   */
  async postJson<TResponse = unknown>(
    url: string,
    body: unknown,
    options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, JSON.stringify(body), {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      ...optionalAntiContent(this.options.antiContent),
      ...options.headers,
    }, options.signal);
  }

  /**
   * Posts an empty JSON request and parses the JSON response.
   *
   * @param url PDD endpoint URL.
   * @param options Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, HTTP status fails, or JSON is invalid.
   */
  async postEmptyJson<TResponse = unknown>(
    url: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, "", {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      ...optionalAntiContent(this.options.antiContent),
    }, options.signal);
  }

  /**
   * Posts a URL-encoded form and parses the JSON response.
   *
   * @param url PDD endpoint URL.
   * @param body Form field values.
   * @param options Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, HTTP status fails, or JSON is invalid.
   */
  async postForm<TResponse = unknown>(
    url: string,
    body: Record<string, string>,
    options: { signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, new URLSearchParams(body).toString(), {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      ...optionalAntiContent(this.options.antiContent),
    }, options.signal);
  }

  /**
   * Executes one bounded browser fetch and rejects non-success HTTP responses.
   *
   * @param url PDD endpoint URL.
   * @param body Serialized request body.
   * @param headers Request headers.
   * @param signal Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, HTTP status fails, or JSON is invalid.
   */
  private async post<TResponse>(
    url: string,
    body: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<TResponse> {
    return withPddRequestDeadline(async (_requestSignal, timeoutMs) => {
      const response = await this.options.page.evaluate<BrowserFetchResponse>(async (request) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
        try {
          const fetchResponse = await fetch(request.url, {
            method: "POST",
            credentials: "include",
            headers: request.headers,
            body: request.body,
            signal: controller.signal,
          });
          return {
            ok: fetchResponse.ok,
            status: fetchResponse.status,
            text: await fetchResponse.text(),
          };
        } catch (error) {
          if (controller.signal.aborted) {
            return { ok: false, status: 0, text: "", timedOut: true };
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }, { url, body, headers, timeoutMs });

      if (response.timedOut) {
        throw new DOMException("Browser request timed out", "TimeoutError");
      }
      if (!response.ok) {
        throw new Error(`PDD browser request failed with HTTP ${response.status}: ${response.text}`);
      }
      return JSON.parse(response.text) as TResponse;
    }, signal, this.options.timeoutMs);
  }
}

/**
 * Adds anti-content only when a non-empty captured value is available.
 *
 * @param antiContent Captured PDD request header.
 * @returns A header map containing no blank credential.
 */
function optionalAntiContent(antiContent?: string): Record<string, string> {
  return antiContent?.trim() ? { "anti-content": antiContent.trim() } : {};
}
