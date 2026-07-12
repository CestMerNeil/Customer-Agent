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
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen" },
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
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen" },
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
      { baseUrl: "http://localhost:8000/v1", chatModel: "qwen" },
      fetchMock,
    );
    await expect(client.chat("请回答")).rejects.toThrow(/finish_reason=length/);
  });

  it("checks chat health without requiring an embedding model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "OK" } }] }),
    });
    const client = new OpenAICompatibleClient(
      {
        baseUrl: "http://localhost:8000/v1",
        chatModel: "gemma",
      },
      fetchMock,
    );

    await expect(client.healthCheck()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/v1/chat/completions",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("quick-checks via GET /models with auth instead of running a completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "gemma", apiKey: "sk-test" },
      fetchMock,
    );
    await expect(client.quickCheck()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("maps a health-check timeout to a friendly message instead of a raw abort error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://10.255.255.1/v1", chatModel: "gemma" },
      fetchMock,
    );
    await expect(client.healthCheck()).rejects.toThrow(/连接超时/);
    // the probe must pass an abort signal so an unreachable host can't hang past the bound
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it("sends multimodal chat messages with text and image content parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{\"brand\":\"云织\"}" } }] }),
    });
    const client = new OpenAICompatibleClient(
      {
        baseUrl: "http://localhost:8000/v1",
        chatModel: "gemma-vision",
      },
      fetchMock,
    );

    await expect(client.chatMultimodal({
      system: "提取商品知识",
      text: "商品名称：围巾",
      imageUrls: ["https://img.example/a.jpg"],
      responseFormat: "json_object",
    })).resolves.toBe("{\"brand\":\"云织\"}");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gemma-vision",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "提取商品知识" },
        {
          role: "user",
          content: [
            { type: "text", text: "商品名称：围巾" },
            { type: "image_url", image_url: { url: "https://img.example/a.jpg" } },
          ],
        },
      ],
    });
  });

  it("uses native chat-completions tools for Agent calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: {
                name: "get_shop_products",
                arguments: "{\"query\":\"推荐\"}",
              },
            }],
          },
        }],
      }),
    });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "gemma" },
      fetchMock,
    );

    await expect(client.respond({
      instructions: "客服 Agent",
      input: "买家想买东西",
      tools: [{
        type: "function",
        name: "get_shop_products",
        description: "获取商品列表",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      }],
    })).resolves.toMatchObject({
      toolCalls: [{
        id: "call-1",
        callId: "call-1",
        name: "get_shop_products",
        arguments: { query: "推荐" },
      }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gemma",
      tool_choice: "auto",
      tools: [{
        type: "function",
        function: {
          name: "get_shop_products",
          description: "获取商品列表",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      }],
    });
  });

  it("continues chat-completions tool loops with role tool messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "call-1",
                type: "function",
                function: { name: "get_shop_products", arguments: "{}" },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "您好，可以看这款商品。" } }] }),
      });
    const client = new OpenAICompatibleClient(
      { baseUrl: "http://localhost:8000/v1", chatModel: "gemma" },
      fetchMock,
    );

    const first = await client.respond({
      instructions: "客服 Agent",
      input: "推荐商品",
      tools: [{
        type: "function",
        name: "get_shop_products",
        description: "获取商品列表",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      }],
    });
    expect(first.responseId).toBeTruthy();
    await expect(client.respond({
      instructions: "客服 Agent",
      previousResponseId: first.responseId ?? "",
      input: [{ type: "function_call_output", call_id: "call-1", output: "{\"ok\":true}" }],
      tools: [],
    })).resolves.toMatchObject({
      outputText: "您好，可以看这款商品。",
      toolCalls: [],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", tool_calls: expect.any(Array) }),
      { role: "tool", tool_call_id: "call-1", content: "{\"ok\":true}" },
    ]));
  });

});
