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
      }),
    );
  });
});
