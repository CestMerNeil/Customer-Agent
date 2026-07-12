export interface InferenceConfig {
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  temperature?: number;
  maxTokens?: number;
}

export interface MultimodalChatRequest {
  system: string;
  text: string;
  imageUrls?: string[];
  responseFormat?: "json_object";
}

export interface ResponseToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ResponseToolOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface ResponseModelRequest {
  instructions: string;
  input: string | ResponseToolOutput[];
  tools: ResponseToolDefinition[];
  previousResponseId?: string;
}

export interface ResponseModelToolCall {
  id?: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ResponseModelResult {
  responseId?: string;
  outputText?: string;
  toolCalls: ResponseModelToolCall[];
}

type FetchLike = typeof fetch;

// 探活只需确认端点能应答，不通的地址不应拖到操作系统 TCP 超时（约 75 秒）。
const HEALTH_CHECK_TIMEOUT_MS = 8_000;

export class OpenAICompatibleClient {
  private readonly responseConversations = new Map<string, ChatMessage[]>();

  constructor(
    private readonly config: InferenceConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async healthCheck(): Promise<void> {
    this.assertConfigured();
    try {
      await this.chat("请回复 OK", { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
    } catch (error) {
      throw mapTimeout(error);
    }
  }

  /** Cheap reachability/auth probe (GET /models) for polling; unlike healthCheck it
   * does not run a real completion, so it returns in milliseconds and costs nothing. */
  async quickCheck(): Promise<void> {
    this.assertConfigured();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.headers,
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      await assertOk(response);
    } catch (error) {
      throw mapTimeout(error);
    }
  }

  private assertConfigured(): void {
    if (!this.config.baseUrl.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 baseUrl");
    }
    if (!this.config.chatModel.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 chatModel");
    }
  }

  async chat(prompt: string, options?: { signal?: AbortSignal }): Promise<string> {
    return this.completeChat({
      messages: [
        { role: "system", content: "你是电商客服助手，只能基于给定资料礼貌回答。" },
        { role: "user", content: prompt },
      ],
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  }

  async chatMultimodal(request: MultimodalChatRequest): Promise<string> {
    const userContent: Array<ChatContentPart | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: request.text },
      ...request.imageUrls?.filter((url) => url.trim()).map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })) ?? [],
    ];
    return this.completeChat({
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: userContent },
      ],
      ...(request.responseFormat ? { responseFormat: request.responseFormat } : {}),
    });
  }

  async respond(request: ResponseModelRequest): Promise<ResponseModelResult> {
    const messages = this.buildResponseMessages(request);
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: this.config.chatModel,
        messages,
        tools: request.tools.map(toChatCompletionTool),
        tool_choice: request.tools.length ? "auto" : "none",
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.maxTokens ?? 1000,
        stream: false,
      }),
    });
    await assertOk(response);
    const data = (await response.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    const responseId = crypto.randomUUID();
    const assistantMessage = toAssistantMessage(choice);
    this.responseConversations.set(responseId, [...messages, assistantMessage]);
    const outputText = extractMessageContent(choice);
    return {
      responseId,
      ...(outputText ? { outputText } : {}),
      toolCalls: extractChatToolCalls(choice),
    };
  }

  private get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, "");
  }

  private get headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
    };
  }

  private async completeChat(request: {
    messages: ChatMessage[];
    responseFormat?: "json_object";
    signal?: AbortSignal;
  }): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: this.config.chatModel,
        messages: request.messages,
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.maxTokens ?? 1000,
        stream: false,
        ...(request.responseFormat ? { response_format: { type: request.responseFormat } } : {}),
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    await assertOk(response);
    const data = (await response.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    const content = extractMessageContent(choice);
    if (!content) {
      const finish = choice?.finish_reason ? `（finish_reason=${choice.finish_reason}）` : "";
      throw new Error(
        `Chat completion 未返回文本内容${finish}。请确认该模型是对话模型且服务正常。原始响应: ${truncate(JSON.stringify(data))}`,
      );
    }
    return content;
  }

  private buildResponseMessages(request: ResponseModelRequest): ChatMessage[] {
    if (request.previousResponseId) {
      const previous = this.responseConversations.get(request.previousResponseId);
      if (!previous) {
        throw new Error(`未知的 Responses continuation: ${request.previousResponseId}`);
      }
      const toolMessages = Array.isArray(request.input)
        ? request.input.map((output): ChatMessage => ({
          role: "tool",
          tool_call_id: output.call_id,
          content: output.output,
        }))
        : [{ role: "user", content: request.input } as ChatMessage];
      return [...previous, ...toolMessages];
    }
    return [
      { role: "system", content: request.instructions },
      { role: "user", content: typeof request.input === "string" ? request.input : JSON.stringify(request.input) },
    ];
  }
}

function mapTimeout(error: unknown): unknown {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new Error(`连接超时（${HEALTH_CHECK_TIMEOUT_MS / 1000} 秒内无响应），请检查服务地址与网络。`);
  }
  return error;
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`Inference request failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

interface ChatContentPart {
  type?: string;
  text?: string;
}

type ChatMessage =
  | { role: "system" | "user"; content: string | Array<ChatContentPart | { type: "image_url"; image_url: { url: string } }> }
  | { role: "assistant"; content: string | null; tool_calls?: ChatCompletionToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionToolCall {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

interface ChatCompletionChoice {
  finish_reason?: string;
  text?: string;
  message?: {
    content?: string | ChatContentPart[] | null;
    reasoning_content?: string | null;
    tool_calls?: ChatCompletionToolCall[];
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

/**
 * Tolerant extraction across OpenAI-compatible servers: `message.content` may be
 * a plain string, an array of content parts (newer chat schema), or empty with
 * the text under `reasoning_content`; some servers use completion-style `text`.
 */
function extractMessageContent(choice: ChatCompletionChoice | undefined): string | undefined {
  if (!choice) return undefined;
  const raw = choice.message?.content;
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  if (!text.trim() && typeof choice.message?.reasoning_content === "string") {
    text = choice.message.reasoning_content;
  }
  if (!text.trim() && typeof choice.text === "string") {
    text = choice.text;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toChatCompletionTool(tool: ResponseToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toAssistantMessage(choice: ChatCompletionChoice | undefined): ChatMessage {
  return {
    role: "assistant",
    content: extractMessageContent(choice) ?? null,
    ...(choice?.message?.tool_calls?.length ? { tool_calls: choice.message.tool_calls } : {}),
  };
}

function extractChatToolCalls(choice: ChatCompletionChoice | undefined): ResponseModelToolCall[] {
  return (choice?.message?.tool_calls ?? [])
    .map((call) => {
      const name = call.function?.name;
      if (!name) {
        return undefined;
      }
      return {
        ...(call.id ? { id: call.id } : {}),
        callId: call.id ?? crypto.randomUUID(),
        name,
        arguments: parseArguments(call.function?.arguments),
      };
    })
    .filter((call): call is ResponseModelToolCall => Boolean(call));
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
