import type {
  CustomerServiceContext,
  GeneratedReply,
  KnowledgeSearchResult,
  ReplyMode
} from "@customer-agent/core";

export interface ReplyWorkflowDependencies {
  chat: (prompt: string) => Promise<string>;
  searchKnowledge: (input: { query: string; shopId: string; topK?: number }) => Promise<KnowledgeSearchResult[]>;
}

export class ReplyWorkflow {
  constructor(private readonly dependencies: ReplyWorkflowDependencies) {}

  async generate(input: { context: CustomerServiceContext; mode: ReplyMode; topK?: number }): Promise<GeneratedReply> {
    const searchInput = {
      query: input.context.content,
      shopId: input.context.shopId,
      ...(input.topK ? { topK: input.topK } : {}),
    };
    const matches = await this.dependencies.searchKnowledge(searchInput);
    const prompt = buildPrompt(input.context.content, matches);
    const text = await this.dependencies.chat(prompt);
    return {
      text,
      action: input.mode === "automatic" ? "send" : "review",
      answerable: matches.length > 0,
      sources: matches.map((match) => ({
        scope: match.scope,
        documentId: match.documentId,
        chunkId: match.chunkId,
        score: match.score,
      })),
      createdAt: new Date().toISOString(),
    };
  }
}

function buildPrompt(question: string, matches: KnowledgeSearchResult[]): string {
  const knowledge = matches.length > 0
    ? matches.map((match, index) => `[资料${index + 1}] 来源: ${match.documentId}/${match.chunkId}\n${match.content}`).join("\n\n")
    : "未检索到可用知识库资料。";
  return [
    "请基于以下本地知识库资料回答客户问题。",
    "要求：只使用资料中明确出现的信息；资料不足时说明暂时无法确认并建议转人工；使用简洁礼貌的客服口吻。",
    "",
    `客户问题：${question}`,
    "",
    `本地知识库资料：\n${knowledge}`,
  ].join("\n");
}
