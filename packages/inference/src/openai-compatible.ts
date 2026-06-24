export interface InferenceConfig {
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  embeddingModel: string;
  temperature?: number;
  maxTokens?: number;
}

type FetchLike = typeof fetch;

export class OpenAICompatibleClient {
  constructor(
    private readonly config: InferenceConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async healthCheck(): Promise<void> {
    if (!this.config.baseUrl.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 baseUrl");
    }
    if (!this.config.chatModel.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 chatModel");
    }
    if (!this.config.embeddingModel.trim()) {
      throw new Error("OpenAI compatible endpoint 未配置 embeddingModel");
    }
    await this.chat("请回复 OK");
  }

  async chat(prompt: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: this.config.chatModel,
        messages: [
          { role: "system", content: "你是电商客服助手，只能基于给定资料礼貌回答。" },
          { role: "user", content: prompt },
        ],
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.maxTokens ?? 1000,
        stream: false,
      }),
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

  async embed(text: string): Promise<number[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ model: this.config.embeddingModel, input: text }),
    });
    await assertOk(response);
    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error("Embedding response did not include an embedding");
    }
    return embedding;
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

interface ChatCompletionChoice {
  finish_reason?: string;
  text?: string;
  message?: {
    content?: string | ChatContentPart[] | null;
    reasoning_content?: string | null;
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

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
