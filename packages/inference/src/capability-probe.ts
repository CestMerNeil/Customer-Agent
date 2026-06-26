type FetchLike = typeof fetch;

export type LocalModelProbeCheckId = "chat_text" | "tool_call" | "tool_result_roundtrip" | "vision";
export type LocalModelProbeStatus = "pass" | "fail" | "blocked";

export interface LocalModelCapabilityProbeConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  visionImageDataUrl?: string;
}

export interface LocalModelProbeCheck {
  id: LocalModelProbeCheckId;
  status: LocalModelProbeStatus;
  summary: string;
  errorCategory?: string;
}

export interface LocalModelCapabilityProbeResult {
  schemaVersion: 1;
  generatedAt: string;
  runtime: {
    baseUrlHost: string;
    model: string;
    platform: string;
  };
  checks: LocalModelProbeCheck[];
  overall: LocalModelProbeStatus;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: unknown;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments?: string;
  };
}

interface ChatCompletionChoice {
  finish_reason?: string;
  message?: {
    content?: unknown;
    tool_calls?: OpenAiToolCall[];
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

export async function runLocalModelCapabilityProbe(
  config: LocalModelCapabilityProbeConfig,
  fetchImpl: FetchLike = fetch,
): Promise<LocalModelCapabilityProbeResult> {
  const checks: LocalModelProbeCheck[] = [];
  const baseUrlHost = sanitizeBaseUrlHost(config.baseUrl);
  const platform = `${process.platform}-${process.arch}`;

  const chatCheck = await runCheck("chat_text", async () => {
    const data = await postChat(config, fetchImpl, [
      { role: "system", content: "You are a concise customer support assistant." },
      { role: "user", content: "Reply with exactly: OK" },
    ]);
    const text = extractMessageText(data.choices?.[0]);
    if (!text) {
      throw new Error("chat completion returned no assistant text");
    }
    return "Text chat returned assistant content.";
  });
  checks.push(chatCheck);

  let toolCall: OpenAiToolCall | undefined;
  const toolCallCheck = await runCheck("tool_call", async () => {
    const data = await postChat(config, fetchImpl, [
      { role: "system", content: buildAgentSystemPrompt() },
      { role: "user", content: "你们店里有什么适合夏天穿的裙子？" },
    ], { tools: buildAgentTools(), tool_choice: "auto" });
    toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function.name !== "get_shop_products") {
      throw new Error("chat completion did not return the expected native tool_call");
    }
    return "Endpoint returned native chat-completions tool_calls.";
  });
  checks.push(toolCallCheck);

  if (!toolCall) {
    checks.push({
      id: "tool_result_roundtrip",
      status: "blocked",
      summary: "Tool-result roundtrip was not run because tool_call did not pass.",
      errorCategory: "tool-call-unavailable",
    });
  } else {
    const roundtripToolCall = toolCall;
    checks.push(
      await runCheck("tool_result_roundtrip", async () => {
        const data = await postChat(config, fetchImpl, [
          { role: "system", content: buildAgentSystemPrompt() },
          { role: "user", content: "你们店里有什么适合夏天穿的裙子？" },
          {
            role: "assistant",
            content: "",
            tool_calls: [roundtripToolCall],
          },
          {
            role: "tool",
            tool_call_id: roundtripToolCall.id,
            content: "商品知识: product:shop-a:100001\n夏季棉麻连衣裙，透气，米白色，适合日常通勤。",
          },
        ], { tools: buildAgentTools(), tool_choice: "auto" });
        const text = extractMessageText(data.choices?.[0]);
        if (!text) {
          throw new Error("tool result roundtrip returned no final assistant text");
        }
        if (text.includes("{") || text.includes("tool_calls") || text.includes(roundtripToolCall.function.name)) {
          throw new Error("final assistant text appears to expose tool internals");
        }
        return "Endpoint consumed native tool results and returned final assistant text.";
      }),
    );
  }

  if (!config.visionImageDataUrl) {
    checks.push({
      id: "vision",
      status: "blocked",
      summary: "Vision probe was not run because no image was provided.",
      errorCategory: "vision-image-not-provided",
    });
  } else {
    checks.push(
      await runCheck("vision", async () => {
        const data = await postChat(config, fetchImpl, [
          { role: "system", content: "Describe product images for customer support." },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe the product image in five words or fewer." },
              { type: "image_url", image_url: { url: config.visionImageDataUrl } },
            ],
          },
        ]);
        const text = extractMessageText(data.choices?.[0]);
        if (!text) {
          throw new Error("vision chat completion returned no assistant text");
        }
        return "Endpoint accepted image content and returned assistant text.";
      }),
    );
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      baseUrlHost,
      model: config.model,
      platform,
    },
    checks,
    overall: summarizeOverall(checks),
  };
}

async function runCheck(id: LocalModelProbeCheckId, action: () => Promise<string>): Promise<LocalModelProbeCheck> {
  try {
    return {
      id,
      status: "pass",
      summary: await action(),
    };
  } catch (error) {
    return {
      id,
      status: "fail",
      summary: safeErrorSummary(error),
      errorCategory: categorizeError(error),
    };
  }
}

async function postChat(
  config: LocalModelCapabilityProbeConfig,
  fetchImpl: FetchLike,
  messages: ChatMessage[],
  extraBody: Record<string, unknown> = {},
): Promise<ChatCompletionResponse> {
  if (!config.baseUrl.trim()) {
    throw new Error("baseUrl is required");
  }
  if (!config.model.trim()) {
    throw new Error("model is required");
  }
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      max_tokens: 256,
      stream: false,
      ...extraBody,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${truncate(await response.text())}`);
  }
  return (await response.json()) as ChatCompletionResponse;
}

function extractMessageText(choice: ChatCompletionChoice | undefined): string | undefined {
  const content = choice?.message?.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

function buildAgentSystemPrompt(): string {
  return [
    "你是拼多多商家客服 Agent。请用自然、简短、礼貌的中文客服口吻处理买家消息。",
    "商品事实、库存、价格、适配、订单、物流、售后政策必须先调用工具核验；工具没有结果时，不要编造。",
    "不要输出调试说明，不要解释你的推理过程。",
    "店铺ID：shop-a",
    "账号ID：account-a",
    "买家ID：buyer-a",
  ].join("\n");
}

function buildAgentTools(): unknown[] {
  return [{
    type: "function",
    function: {
      name: "get_shop_products",
      description: "获取当前店铺已审核且启用的商品知识列表，用于推荐商品。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  }];
}

function sanitizeBaseUrlHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid-url";
  }
}

function summarizeOverall(checks: LocalModelProbeCheck[]): LocalModelProbeStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "blocked")) {
    return "blocked";
  }
  return "pass";
}

function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return truncate(message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]"));
}

function categorizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/baseUrl|model is required/.test(message)) return "config";
  if (/HTTP 4\d\d/.test(message)) return "request-rejected";
  if (/HTTP 5\d\d/.test(message)) return "endpoint-error";
  if (/fetch|ECONN|ENOTFOUND|timed out|network/i.test(message)) return "network";
  if (/tool_call/i.test(message)) return "tool-call-unsupported";
  if (/vision|image/i.test(message)) return "vision-unsupported";
  return "unknown";
}

function truncate(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
