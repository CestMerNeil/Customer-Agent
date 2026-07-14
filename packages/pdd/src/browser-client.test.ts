import { describe, expect, it, vi } from "vitest";
import { PddBrowserHttpClient } from "./browser-client.js";
import type { BrowserFetchPage } from "./browser-client.js";

describe("PddBrowserHttpClient", () => {
  it("posts JSON through a browser page with credentials and anti-content", async () => {
    const evaluate = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: JSON.stringify({ success: true, result: { ok: true } }),
    })) as unknown as BrowserFetchPage["evaluate"];
    const client = new PddBrowserHttpClient({
      page: { evaluate },
      antiContent: "anti",
    });

    await expect(client.postJson("https://mms.pinduoduo.com/latitude/goods/recommendGoods", {
      uid: "",
      pageNum: 1,
      pageSize: 10,
    })).resolves.toEqual({ success: true, result: { ok: true } });

    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), {
      url: "https://mms.pinduoduo.com/latitude/goods/recommendGoods",
      body: JSON.stringify({ uid: "", pageNum: 1, pageSize: 10 }),
      headers: expect.objectContaining({
        accept: "application/json, text/plain, */*",
        "anti-content": "anti",
        "content-type": "application/json;charset=UTF-8",
      }),
      timeoutMs: 30_000,
    });
  });

  it("passes a configured timeout to the browser fetch", async () => {
    const evaluate = vi.fn(async () => ({ ok: true, status: 200, text: "{}" })) as unknown as BrowserFetchPage["evaluate"];
    const client = new PddBrowserHttpClient({ page: { evaluate }, timeoutMs: 250 });

    await client.postEmptyJson("https://mms.pinduoduo.com/api");

    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeoutMs: 250 }));
  });

  it("surfaces browser-side HTTP failures with response text", async () => {
    const client = new PddBrowserHttpClient({
      page: {
        evaluate: vi.fn(async () => ({
          ok: false,
          status: 403,
          text: "{\"error_code\":-12}",
        })) as unknown as BrowserFetchPage["evaluate"],
      },
    });

    await expect(client.postJson("https://mms.pinduoduo.com/latitude/goods/recommendGoods", {}))
      .rejects.toThrow("PDD browser request failed with HTTP 403");
  });

  it("bounds a stalled page evaluation with a safe timeout", async () => {
    vi.useFakeTimers();
    try {
      const evaluate = vi.fn(() => new Promise<never>(() => undefined)) as unknown as BrowserFetchPage["evaluate"];
      const client = new PddBrowserHttpClient({ page: { evaluate }, timeoutMs: 100 });

      const assertion = expect(client.postEmptyJson("https://mms.pinduoduo.com/api"))
        .rejects.toThrow("PDD 请求超时");
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors caller abort without exposing the abort reason", async () => {
    const evaluate = vi.fn(() => new Promise<never>(() => undefined)) as unknown as BrowserFetchPage["evaluate"];
    const client = new PddBrowserHttpClient({ page: { evaluate } });
    const controller = new AbortController();

    const request = client.postJson(
      "https://mms.pinduoduo.com/api",
      {},
      { signal: controller.signal },
    );
    controller.abort(new Error("anti-content=must-not-leak"));

    await expect(request).rejects.toThrow("PDD 请求已取消");
    await expect(request).rejects.not.toThrow("must-not-leak");
  });
});
