import type { CustomerServiceContext } from "./context.js";
import type { MessageState } from "./message-state.js";
import type { GeneratedReply, KnowledgeSourceReference, ReplyMode } from "./reply.js";

export type AccountStatus = "offline" | "logging_in" | "online" | "busy" | "error";
export type KnowledgeScope = "global" | "shop";
export type GovernedKnowledgeKind = "product" | "customer_service";
export type GovernedKnowledgeReviewState = "draft" | "reviewed" | "rejected";
export type GovernedKnowledgeSourceType = "pdd_product" | "manual" | "import" | "llm_extraction";
export type LogLevel = "info" | "warning" | "error";

export const DEFAULT_HANDOFF_KEYWORDS = [
  "转人工",
  "人工客服",
  "真人",
  "客服",
  "人工",
  "工单",
  "取消订单",
  "改地址",
  "转售后客服",
  "转售后",
  "退款",
  "投诉",
  "纠纷",
  "开发票",
  "开票",
  "备注",
];

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
  operatorNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type InboundQueueState = "pending" | "processing" | "retry_waiting" | "completed" | "failed" | "dead_letter";

export interface InboundQueueRecord {
  id: string;
  messageId: string;
  accountId: string;
  shopId: string;
  buyerId: string;
  conversationKey: string;
  dedupeKey: string;
  state: InboundQueueState;
  attempts: number;
  availableAt: string;
  enqueuedAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface InboundQueueMetrics {
  depth: number;
  pending: number;
  retryWaiting: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  retryCount: number;
  failureCount: number;
  averageProcessingLatencyMs: number;
  oldestPendingAgeMs?: number;
  nextRetryAt?: string;
}

export interface ConversationMemoryRecord {
  id: string;
  shopId: string;
  accountId: string;
  buyerId: string;
  summary: string;
  messageCount: number;
  updatedAt: string;
}

export type AgentAuditEventType = "model" | "tool_call" | "tool_result" | "final" | "loop_limit";

export interface AgentAuditRecord {
  id: string;
  shopId: string;
  accountId: string;
  buyerId: string;
  messageId: string;
  eventType: AgentAuditEventType;
  toolName?: string;
  ok?: boolean;
  summary: string;
  citations: KnowledgeSourceReference[];
  createdAt: string;
}

export type ProductSyncMode = "incremental" | "full";
export type ProductSyncPhase = "fetching" | "saving" | "completed" | "cancelled" | "failed";

export interface ProductSyncFailure {
  goodsId?: string;
  page?: number;
  error: string;
  retryable: boolean;
}

export interface ProductSyncProgress {
  runId: string;
  shopId: string;
  mode: ProductSyncMode;
  phase: ProductSyncPhase;
  total: number;
  current: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  currentGoodsId?: string;
  currentGoodsName?: string;
  failures: ProductSyncFailure[];
}

export interface InferenceConfig {
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  temperature?: number;
  maxTokens?: number;
}

// A ModelProvider is the supplier of models behind the unified OpenAI/Responses-compatible
// interface (chat/vision/embedding). It is one of two kinds:
//   - "remote": an OpenAI-compatible cloud endpoint (e.g. DashScope/Qwen), configured via InferenceConfig.
//   - "local":  an app-managed local llama-server, additionally provisioned via InferenceRuntimeConfig.
export type ModelProvider = "local" | "remote";

export interface InferenceRuntimeConfig {
  // Process-management kind for the *local* ModelProvider — not the ModelProvider itself.
  // A remote provider has no managed runtime, so this only ever describes the local case.
  runtimeKind: "managed_llama_server";
  modelId: string;
  modelPath: string;
  command?: string;
  commandArgs?: string[];
  runtimeDownloadUrl?: string;
  runtimeDownloadSha256?: string;
  mmprojModelId?: string;
  mmprojPath?: string;
  host?: string;
  port?: number;
}

export interface AppSettings {
  modelProvider?: ModelProvider;
  businessHours: {
    start: string;
    end: string;
  };
  knowledge: {
    topK: number;
  };
  queue?: {
    maxConcurrentConversations: number;
    maxAttempts?: number;
    baseBackoffMs?: number;
    paused?: boolean;
  };
  handoff?: {
    keywords: string[];
    intentRules?: Array<{
      id: string;
      label: string;
      patterns: string[];
      shopId?: string;
    }>;
  };
  inference?: InferenceConfig;
  inferenceRuntime?: InferenceRuntimeConfig;
}

export interface GovernedKnowledgeRecord {
  id: string;
  citationId: string;
  kind: GovernedKnowledgeKind;
  shopId: string;
  title: string;
  content: string;
  tags: string[];
  sourceType: GovernedKnowledgeSourceType;
  sourceId?: string;
  sourceMetadata?: Record<string, unknown>;
  version: number;
  enabled: boolean;
  reviewState: GovernedKnowledgeReviewState;
  stale: boolean;
  conflict: boolean;
  createdAt: string;
  updatedAt: string;
  supersedesId?: string;
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
