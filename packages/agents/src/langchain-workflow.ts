import type { CustomerServiceContext, GeneratedReply, KnowledgeSearchResult, ReplyMode } from "@customer-agent/core";
import { PromptTemplate } from "@langchain/core/prompts";

export interface LangChainReplyWorkflowOptions {
  invokeModel: (prompt: string) => Promise<string>;
  searchKnowledge: (input: { query: string; shopId: string; topK?: number }) => Promise<KnowledgeSearchResult[]>;
}

export class LangChainReplyWorkflow {
  constructor(private readonly options: LangChainReplyWorkflowOptions) {}

  async generate(input: { context: CustomerServiceContext; mode: ReplyMode; topK?: number }): Promise<GeneratedReply> {
    const matches = await this.options.searchKnowledge({
      query: input.context.content,
      shopId: input.context.shopId,
      ...(input.topK ? { topK: input.topK } : {}),
    });
    const prompt = await buildPrompt(input.context.content, matches);
    const text = await this.options.invokeModel(prompt);
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

export async function buildPrompt(question: string, matches: KnowledgeSearchResult[]): Promise<string> {
  const context = matches.length
    ? matches.map((match, index) => `[资料${index + 1}] ${match.content}`).join("\n\n")
    : "无可用资料。";
  const template = PromptTemplate.fromTemplate([
    "你是电商客服助手。只基于资料回答；资料不足则建议转人工。",
    "客户问题：{question}",
    "资料：\n{context}",
  ].join("\n\n"));
  return template.format({ question, context });
}
