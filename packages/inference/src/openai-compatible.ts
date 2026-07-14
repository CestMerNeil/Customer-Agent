/** Connection and generation settings for an OpenAI-compatible endpoint. */
export interface InferenceConfig {
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  temperature?: number;
  maxTokens?: number;
  requestTimeoutMs?: number;
}

/** Text, image, and response-format inputs for a multimodal completion. */
export interface MultimodalChatRequest {
  system: string;
  text: string;
  imageUrls?: string[];
  responseFormat?: "json_object";
}

/** Function tool schema accepted by chat-completions servers. */
export interface ResponseToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Tool result supplied when continuing a model tool-call loop. */
export interface ResponseToolOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

/** Agent-style model request represented through chat completions. */
export interface ResponseModelRequest {
  instructions: string;
  input: string | ResponseToolOutput[];
  tools: ResponseToolDefinition[];
  previousResponseId?: string;
}

/** Normalized function call returned by the model. */
export interface ResponseModelToolCall {
  id?: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Normalized text and tool calls returned from an agent-style request. */
export interface ResponseModelResult {
  responseId?: string;
  outputText?: string;
  toolCalls: ResponseModelToolCall[];
}

/** Fetch-compatible transport accepted for dependency injection. */
type FetchLike = typeof fetch;

/** Short deadline for endpoint reachability probes. */
const HEALTH_CHECK_TIMEOUT_MS = 8_000;

/** Lenient finite default for normal local or remote model generation. */
const DEFAULT_INFERENCE_REQUEST_TIMEOUT_MS = 5 * 60_000;

/** Calls an OpenAI-compatible chat-completions endpoint with bounded I/O. */
export class OpenAICompatibleClient {
  private readonly responseConversations = new Map<string, ChatMessage[]>();

  /**
   * Creates a client for one OpenAI-compatible model endpoint.
   *
   * @param config Endpoint, model, generation, and timeout settings.
   * @param fetchImpl Optional fetch-compatible transport.
   */
  constructor(
    private readonly config: InferenceConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /**
   * Runs a bounded real chat completion as a thorough health check.
   *
   * @returns A promise that resolves when the model responds successfully.
   * @throws If configuration, connectivity, HTTP status, or completion output is invalid.
   */
  async healthCheck(): Promise<void> {
    this.assertConfigured();
    await this.completeChat({
      messages: [
        { role: "system", content: "你是电商客服助手，只能基于给定资料礼貌回答。" },
        { role: "user", content: "请回复 OK" },
      ],
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
      requestLabel: "连接",
    });
  }

  /**
   * Probes GET /models without running a completion.
   *
   * @returns A promise that resolves when the endpoint is reachable and authorized.
   * @throws If configuration, connectivity, or HTTP status is invalid.
   */
  async quickCheck(): Promise<void> {
    this.assertConfigured();
    await withRequestDeadline(async (signal) => {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.headers,
        signal,
      });
      await assertOk(response);
    }, undefined, HEALTH_CHECK_TIMEOUT_MS, "连接");
  }

  /** Validates the endpoint and model identifiers needed by health probes. */
  private assertConfigured(): void {
    if (!this.config.baseUrl.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 baseUrl");
    }
    if (!this.config.chatModel.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 chatModel");
    }
  }

  /**
   * Generates one text-only customer-service reply.
   *
   * @param prompt User prompt sent to the model.
   * @param options Optional caller cancellation signal.
   * @returns Generated response text.
   * @throws If the request is cancelled, times out, fails, or returns no text.
   */
  async chat(prompt: string, options?: { signal?: AbortSignal }): Promise<string> {
    return this.completeChat({
      messages: [
        { role: "system", content: "你是电商客服助手，只能基于给定资料礼貌回答。" },
        { role: "user", content: prompt },
      ],
      ...(options?.signal ? { signal: options.signal } : {}),
      timeoutMs: this.requestTimeoutMs,
      requestLabel: "推理请求",
    });
  }

  /**
   * Generates one text-and-image completion.
   *
   * @param request Multimodal input and optional response format.
   * @param options Optional caller cancellation signal.
   * @returns Generated response text.
   * @throws If the request is cancelled, times out, fails, or returns no text.
   */
  async chatMultimodal(
    request: MultimodalChatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
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
      ...(options?.signal ? { signal: options.signal } : {}),
      timeoutMs: this.requestTimeoutMs,
      requestLabel: "推理请求",
    });
  }

  /**
   * Runs or continues one agent-style tool-call turn.
   *
   * @param request Instructions, input, tool definitions, and optional continuation ID.
   * @param options Optional caller cancellation signal.
   * @returns Normalized response text, continuation ID, and tool calls.
   * @throws If the continuation is unknown or the bounded request fails.
   */
  async respond(
    request: ResponseModelRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ResponseModelResult> {
    const messages = this.buildResponseMessages(request);
    const data = await withRequestDeadline(async (signal) => {
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
        signal,
      });
      await assertOk(response);
      return await response.json() as ChatCompletionResponse;
    }, options?.signal, this.requestTimeoutMs, "推理请求");
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

  /** Returns the endpoint URL without a trailing slash. */
  private get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, "");
  }

  /** Returns JSON and optional bearer-auth request headers. */
  private get headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
    };
  }

  /** Returns the configured positive request timeout or the finite default. */
  private get requestTimeoutMs(): number {
    return normalizeTimeout(this.config.requestTimeoutMs, DEFAULT_INFERENCE_REQUEST_TIMEOUT_MS);
  }

  /**
   * Executes one bounded chat completion and extracts its text.
   *
   * @param request Messages, response format, cancellation, deadline, and error label.
   * @returns Generated response text.
   * @throws If the request fails or the response contains no text.
   */
  private async completeChat(request: {
    messages: ChatMessage[];
    responseFormat?: "json_object";
    signal?: AbortSignal;
    timeoutMs: number;
    requestLabel: string;
  }): Promise<string> {
    const data = await withRequestDeadline(async (signal) => {
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
        signal,
      });
      await assertOk(response);
      return await response.json() as ChatCompletionResponse;
    }, request.signal, request.timeoutMs, request.requestLabel);
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

  /**
   * Builds chat messages for a new request or stored continuation.
   *
   * @param request Agent-style input and optional previous response ID.
   * @returns Chat-completions messages for the next turn.
   * @throws If the requested continuation ID is unknown.
   */
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

/**
 * Runs an asynchronous request with a deadline and caller cancellation.
 *
 * @param operation Request body that receives the combined abort signal.
 * @param callerSignal Optional caller-owned cancellation signal.
 * @param timeoutMs Maximum request duration in milliseconds.
 * @param requestLabel Safe label used in mapped errors.
 * @returns The operation result.
 * @throws A fixed safe timeout or cancellation error, or the original request error.
 */
async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  requestLabel: string,
): Promise<T> {
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
    return await Promise.race([operation(controller.signal), aborted]);
  } catch (error) {
    if (timedOut || isNamedError(error, "TimeoutError")) {
      throw new Error(`${requestLabel}超时，请检查服务状态与网络后重试。`);
    }
    if (callerCancelled || controller.signal.aborted || isNamedError(error, "AbortError")) {
      throw new Error(`${requestLabel}已取消。`);
    }
    throw error instanceof Error ? error : new Error(`${requestLabel}失败。`);
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

/**
 * Rejects unsuccessful HTTP responses with their status and response body text.
 *
 * @param response Fetch response to validate.
 * @returns A promise that resolves for successful responses.
 * @throws If the response status is not successful.
 */
async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`Inference request failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

/** Text content part returned by compatible chat servers. */
interface ChatContentPart {
  type?: string;
  text?: string;
}

/** Chat-completions message variants used by this adapter. */
type ChatMessage =
  | { role: "system" | "user"; content: string | Array<ChatContentPart | { type: "image_url"; image_url: { url: string } }> }
  | { role: "assistant"; content: string | null; tool_calls?: ChatCompletionToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Chat-completions function-tool wire shape. */
interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Chat-completions tool-call wire shape. */
interface ChatCompletionToolCall {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

/** One chat-completions choice across known compatible server variants. */
interface ChatCompletionChoice {
  finish_reason?: string;
  text?: string;
  message?: {
    content?: string | ChatContentPart[] | null;
    reasoning_content?: string | null;
    tool_calls?: ChatCompletionToolCall[];
  };
}

/** Minimal chat-completions response consumed by this adapter. */
interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

/**
 * Tolerant extraction across OpenAI-compatible servers: `message.content` may be
 * a plain string, an array of content parts (newer chat schema), or empty with
 * the text under `reasoning_content`; some servers use completion-style `text`.
 *
 * @param choice Optional first model choice.
 * @returns Trimmed model text, or undefined when no text exists.
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

/**
 * Converts one public tool definition to chat-completions wire format.
 *
 * @param tool Public tool definition.
 * @returns Chat-completions tool payload.
 */
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

/**
 * Converts one model choice into a storable assistant message.
 *
 * @param choice Optional model choice.
 * @returns Assistant message containing text and tool calls.
 */
function toAssistantMessage(choice: ChatCompletionChoice | undefined): ChatMessage {
  return {
    role: "assistant",
    content: extractMessageContent(choice) ?? null,
    ...(choice?.message?.tool_calls?.length ? { tool_calls: choice.message.tool_calls } : {}),
  };
}

/**
 * Normalizes function calls from one model choice.
 *
 * @param choice Optional model choice.
 * @returns Valid named tool calls with parsed arguments.
 */
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

/**
 * Parses function arguments without letting malformed model output escape.
 *
 * @param value String or object arguments returned by a model.
 * @returns A plain argument object, or an empty object for invalid input.
 */
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

/**
 * Limits diagnostic text length.
 *
 * @param value Text to bound.
 * @param max Maximum retained character count.
 * @returns Original or ellipsis-truncated text.
 */
function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
