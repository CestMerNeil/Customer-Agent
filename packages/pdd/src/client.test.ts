import { describe, expect, it, vi } from "vitest";
import { PddHttpClient } from "./client.js";

describe("PddHttpClient", () => {
  it("posts JSON with cookie headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { ok: true } }),
    });
    const client = new PddHttpClient({ cookies: { PDDAccessToken: "token" }, fetchImpl: fetchMock });

    await expect(client.postJson("https://example.test/api", { hello: "world" })).resolves.toEqual({
      success: true,
      result: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Cookie: "PDDAccessToken=token" }),
        body: JSON.stringify({ hello: "world" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("posts form data as urlencoded body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "chat-token" }),
    });
    const client = new PddHttpClient({ cookies: {}, fetchImpl: fetchMock });

    await client.postForm("https://example.test/token", { version: "3" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/token",
      expect.objectContaining({
        method: "POST",
        body: "version=3",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("times out a stalled request with a safe finite error", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
      const client = new PddHttpClient({ cookies: {}, fetchImpl: fetchMock, timeoutMs: 100 });

      const assertion = expect(client.postEmptyJson("https://example.test/api"))
        .rejects.toThrow("PDD 请求超时");
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors caller abort without exposing the abort reason", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    const client = new PddHttpClient({ cookies: {}, fetchImpl: fetchMock });
    const controller = new AbortController();

    const request = client.postForm(
      "https://example.test/api",
      { version: "3" },
      { signal: controller.signal },
    );
    controller.abort(new Error("cookie=must-not-leak"));

    await expect(request).rejects.toThrow("PDD 请求已取消");
    await expect(request).rejects.not.toThrow("must-not-leak");
  });
});
