import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClient } from "./openai-compatible.js";

describe("OpenAICompatibleClient", () => {
  it("calls chat completions with configured endpoint and model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "有 L 码。" } }] }),
    });
    const client = new OpenAICompatibleClient(
      {
        baseUrl: "http://localhost:8000/v1",
        chatModel: "qwen",
        embeddingModel: "nomic",
        temperature: 0.2,
        maxTokens: 512,
      },
      fetchMock,
    );

    await expect(client.chat("请回答")).resolves.toBe("有 L 码。");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"model\":\"qwen\""),
      }),
    );
  });

  it("extracts content from array content parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: [{ type: "text", text: "有 " }, { type: "text", text: "L 码。" }] } }] }),
    });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen", embeddingModel: "nomic" },
      fetchMock,
    );
    await expect(client.chat("请回答")).resolves.toBe("有 L 码。");
  });

  it("falls back to reasoning_content when content is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "", reasoning_content: "OK" } }] }),
    });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen", embeddingModel: "nomic" },
      fetchMock,
    );
    await expect(client.chat("请回答")).resolves.toBe("OK");
  });

  it("throws a diagnostic error including finish_reason and raw response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" }, finish_reason: "length" }] }),
    });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen", embeddingModel: "nomic" },
      fetchMock,
    );
    await expect(client.chat("请回答")).rejects.toThrow(/finish_reason=length/);
  });

  it("returns embeddings from OpenAI compatible responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });
    const client = new OpenAICompatibleClient(
      {
        baseUrl: "http://localhost:8000/v1",
        chatModel: "qwen",
        embeddingModel: "nomic",
      },
      fetchMock,
    );

    await expect(client.embed("退货规则")).resolves.toEqual([0.1, 0.2, 0.3]);
  });
});
