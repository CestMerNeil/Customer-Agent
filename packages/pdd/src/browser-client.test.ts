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
    });
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
});
