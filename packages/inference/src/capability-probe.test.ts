import { describe, expect, it, vi } from "vitest";
import { runLocalModelCapabilityProbe } from "./capability-probe.js";

describe("runLocalModelCapabilityProbe", () => {
  it("checks text chat, native tool calls, tool result roundtrip, and vision input", async () => {
    const requests: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (body.tools?.length && !body.messages?.some((message: { role?: string }) => message.role === "tool")) {
        return jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "get_shop_products", arguments: "{}" } }] } }] });
      }
      if (body.messages?.some((message: { role?: string }) => message.role === "tool")) {
        return jsonResponse({ choices: [{ message: { content: "您好，这款夏季棉麻连衣裙比较透气，适合日常通勤。" } }] });
      }
      return jsonResponse({ choices: [{ message: { content: "OK" } }] });
    });

    const result = await runLocalModelCapabilityProbe(
      {
        baseUrl: "http://127.0.0.1:8000/v1",
        model: "gemma-local",
        apiKey: "secret",
        visionImageDataUrl: "data:image/png;base64,AAAA",
      },
      fetchMock,
    );

    expect(result.overall).toBe("pass");
    expect(result.runtime).toMatchObject({
      baseUrlHost: "http://127.0.0.1:8000",
      model: "gemma-local",
    });
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ["chat_text", "pass"],
      ["tool_call", "pass"],
      ["tool_result_roundtrip", "pass"],
      ["vision", "pass"],
    ]);
    expect(JSON.stringify(requests[1])).toContain("\"tools\"");
    expect(JSON.stringify(requests[1])).not.toContain("工具调用示例");
    expect(JSON.stringify(requests[2])).toContain("\"role\":\"tool\"");
    expect(JSON.stringify(requests[3])).toContain("image_url");
  });

  it("blocks tool result roundtrip when the endpoint does not return tool calls", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "No tool." } }] }));

    const result = await runLocalModelCapabilityProbe(
      { baseUrl: "http://127.0.0.1:8000/v1", model: "gemma-local" },
      fetchMock,
    );

    expect(result.overall).toBe("fail");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "tool_call",
        status: "fail",
        errorCategory: "tool-call-unsupported",
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "tool_result_roundtrip",
        status: "blocked",
        errorCategory: "tool-call-unavailable",
      }),
    );
  });

  it("does not run a vision check without an explicit image", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.tools?.length && !body.messages?.some((message: { role?: string }) => message.role === "tool")) {
        return jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "get_shop_products", arguments: "{}" } }] } }] });
      }
      if (body.messages?.some((message: { role?: string }) => message.role === "tool")) {
        return jsonResponse({ choices: [{ message: { content: "您好，这款裙子适合夏天穿。" } }] });
      }
      return jsonResponse({ choices: [{ message: { content: "OK" } }] });
    });

    const result = await runLocalModelCapabilityProbe(
      { baseUrl: "http://127.0.0.1:8000/private-path", model: "gemma-local" },
      fetchMock,
    );

    expect(result.runtime.baseUrlHost).toBe("http://127.0.0.1:8000");
    expect(result.overall).toBe("blocked");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "vision",
        status: "blocked",
        errorCategory: "vision-image-not-provided",
      }),
    );
  });

  it("redacts bearer tokens from error summaries", async () => {
    const fetchMock = vi.fn(async () => new Response("Bearer very-secret-token", { status: 401 }));

    const result = await runLocalModelCapabilityProbe(
      { baseUrl: "http://127.0.0.1:8000/v1", model: "gemma-local", apiKey: "very-secret-token" },
      fetchMock,
    );

    expect(JSON.stringify(result)).not.toContain("very-secret-token");
    expect(result.checks[0]).toMatchObject({
      status: "fail",
      errorCategory: "request-rejected",
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
