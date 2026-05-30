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
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Chat completion response did not include message content");
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
