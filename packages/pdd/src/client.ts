import { buildCookieHeader, type CookieJar } from "./cookies.js";

/** Fetch-compatible transport accepted for dependency injection. */
type FetchLike = typeof fetch;

/** Default finite deadline for merchant HTTP requests. */
const DEFAULT_PDD_REQUEST_TIMEOUT_MS = 30_000;

/** Construction options for the cookie-authenticated PDD HTTP client. */
export interface PddHttpClientOptions {
  cookies: CookieJar | string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Sends cookie-authenticated PDD requests with bounded network I/O. */
export class PddHttpClient {
  private readonly fetchImpl: FetchLike;

  /**
   * Creates a PDD client using native fetch unless a test transport is supplied.
   *
   * @param options Cookies, transport, and optional request timeout.
   */
  constructor(private readonly options: PddHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Posts JSON and returns its parsed response.
   *
   * @param url PDD endpoint URL.
   * @param body JSON-serializable request body.
   * @param options Optional headers and caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, fails, or returns invalid JSON.
   */
  async postJson<TResponse = unknown>(
    url: string,
    body: unknown,
    options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
    }, options.signal);
  }

  /**
   * Posts an empty JSON body and returns its parsed response.
   *
   * @param url PDD endpoint URL.
   * @param options Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, fails, or returns invalid JSON.
   */
  async postEmptyJson<TResponse = unknown>(
    url: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/json" },
      body: "",
    }, options.signal);
  }

  /**
   * Posts URL-encoded form data and returns its parsed response.
   *
   * @param url PDD endpoint URL.
   * @param body Form field values.
   * @param options Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, fails, or returns invalid JSON.
   */
  async postForm<TResponse = unknown>(
    url: string,
    body: Record<string, string>,
    options: { signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    return this.post<TResponse>(url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    }, options.signal);
  }

  /**
   * Executes one bounded request and maps abort reasons to fixed safe errors.
   *
   * @param url PDD endpoint URL.
   * @param init Serialized headers and body.
   * @param signal Optional caller cancellation signal.
   * @returns The parsed JSON response.
   * @throws If the request is cancelled, times out, fails, or returns invalid JSON.
   */
  private async post<TResponse>(
    url: string,
    init: { headers: Record<string, string>; body: string },
    signal?: AbortSignal,
  ): Promise<TResponse> {
    return withPddRequestDeadline(async (requestSignal) => {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          ...defaultHeaders(),
          ...init.headers,
          Cookie: buildCookieHeader(this.options.cookies),
        },
        body: init.body,
        signal: requestSignal,
      });
      if (!response.ok) {
        throw new Error(`PDD request failed with HTTP ${response.status}: ${await response.text()}`);
      }
      return await response.json() as TResponse;
    }, signal, this.options.timeoutMs);
  }
}

/**
 * Returns browser-like headers expected by PDD's merchant endpoints.
 *
 * @returns Static browser request headers.
 */
function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "origin": "https://mms.pinduoduo.com",
    "referer": "https://mms.pinduoduo.com/",
    "priority": "u=1, i",
  };
}

/**
 * Runs PDD I/O with a finite deadline and optional caller cancellation.
 *
 * @param operation Request body receiving the combined signal and normalized timeout.
 * @param callerSignal Optional caller-owned cancellation signal.
 * @param requestedTimeoutMs Optional request duration in milliseconds.
 * @returns The operation result.
 * @throws A fixed safe timeout or cancellation error, or the original request error.
 * @internal Shared with the browser-backed transport to keep error handling identical.
 */
export async function withPddRequestDeadline<T>(
  operation: (signal: AbortSignal, timeoutMs: number) => Promise<T>,
  callerSignal?: AbortSignal,
  requestedTimeoutMs?: number,
): Promise<T> {
  const timeoutMs = normalizeTimeout(requestedTimeoutMs, DEFAULT_PDD_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  let callerCancelled = false;
  const abortFromCaller = (): void => {
    if (controller.signal.aborted) return;
    timedOut = isNamedError(callerSignal?.reason, "TimeoutError");
    callerCancelled = !timedOut;
    controller.abort();
  };
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let rejectOnAbort = (): void => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(new DOMException("Request aborted", "AbortError"));
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
  });
  try {
    if (controller.signal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }
    return await Promise.race([operation(controller.signal, timeoutMs), aborted]);
  } catch (error) {
    if (timedOut || isNamedError(error, "TimeoutError")) {
      throw new Error("PDD 请求超时，请检查网络后重试。");
    }
    if (callerCancelled || controller.signal.aborted || isNamedError(error, "AbortError")) {
      throw new Error("PDD 请求已取消。");
    }
    throw error instanceof Error ? error : new Error("PDD 请求失败。");
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
    controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}

/**
 * Returns a positive integer timeout or the supplied default.
 *
 * @param value Candidate timeout.
 * @param fallback Default timeout.
 * @returns A positive integer duration in milliseconds.
 */
function normalizeTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.max(1, Math.floor(value)), 2_147_483_647)
    : fallback;
}

/**
 * Checks an unknown exception without exposing its message.
 *
 * @param error Unknown thrown value.
 * @param name Error name to match.
 * @returns Whether the value is an Error with the requested name.
 */
function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
