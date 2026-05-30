import type { CustomerServiceContext } from "./context.js";
import type { MessageState } from "./message-state.js";
import type { GeneratedReply, ReplyMode } from "./reply.js";

export type AccountStatus = "offline" | "logging_in" | "online" | "error";
export type KnowledgeScope = "global" | "shop";
export type LogLevel = "info" | "warning" | "error";

export interface AccountRecord {
  id: string;
  channel: "pinduoduo";
  username: string;
  shopId: string;
  shopName?: string;
  userId: string;
  status: AccountStatus;
  cookies?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord extends CustomerServiceContext {
  state: MessageState;
  replyText?: string;
  error?: string;
  updatedAt: string;
}

export interface ReplyDraftRecord {
  id: string;
  messageId: string;
  accountId: string;
  shopId: string;
  mode: ReplyMode;
  reply: GeneratedReply;
  state: "draft_ready" | "sent" | "ignored" | "escalated" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface InferenceConfig {
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  embeddingModel: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AppSettings {
  replyMode: ReplyMode;
  businessHours: {
    start: string;
    end: string;
  };
  knowledge: {
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
  };
  inference?: InferenceConfig;
}

export interface KnowledgeDocumentRecord {
  id: string;
  scope: KnowledgeScope;
  shopId?: string;
  filePath: string;
  fileName: string;
  chunkCount: number;
  indexedAt: string;
}

export interface KnowledgeSearchResult {
  id: string;
  documentId: string;
  chunkId: string;
  scope: KnowledgeScope;
  shopId?: string;
  content: string;
  score: number;
}

export interface LogRecord {
  id: string;
  level: LogLevel;
  message: string;
  createdAt: string;
}
