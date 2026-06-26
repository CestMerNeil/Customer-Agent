import type { CustomerServiceContext } from "./context.js";
import type { AcceptanceCapabilityMatrixRow } from "./acceptance.js";
import type { DependencySnapshot } from "./dependency-governance.js";
import type {
  AccountRecord,
  AgentAuditRecord,
  AppSettings,
  GovernedKnowledgeKind,
  GovernedKnowledgeRecord,
  InboundQueueMetrics,
  InboundQueueRecord,
  InferenceConfig,
  InferenceRuntimeConfig,
  KnowledgeDocumentRecord,
  KnowledgeScope,
  KnowledgeSearchResult,
  LogLevel,
  LogRecord,
  MessageRecord,
  ProductSyncMode,
  ProductSyncProgress,
  ReplyDraftRecord
} from "./domain.js";
import type { GeneratedReply, ReplyMode } from "./reply.js";
import type { LocalModelProfile } from "./local-model-profiles.js";

export interface AccountLoginRequest {
  username: string;
  password?: string;
  channel: "pinduoduo";
}

export interface AccountLoginResult {
  ok: boolean;
  accountId?: string;
  shopId?: string;
  error?: string;
}

export interface GenerateReplyRequest {
  context: CustomerServiceContext;
  mode: ReplyMode;
}

export interface GenerateReplyResult {
  ok: boolean;
  reply?: GeneratedReply;
  error?: string;
}

export interface PddRuntimeState {
  accountId: string;
  state: "running" | "stopped" | "error";
  startedAt?: string;
  reconnectCount: number;
  failureCategory?: "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";
  lastHeartbeatAt?: string;
  lastError?: string;
  websocketConnected?: boolean;
  requiresRelogin?: boolean;
}

export interface KnowledgeImportRequest {
  filePath: string;
  scope: KnowledgeScope;
  shopId?: string;
}

export interface KnowledgeSearchRequest {
  query: string;
  shopId?: string;
  topK?: number;
}

export interface ModelDownloadProgressEvent {
  requestId: string;
  modelId: string;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export interface IpcContract {
  "account.login": {
    request: AccountLoginRequest;
    response: AccountLoginResult;
  };
  "account.list": {
    request: undefined;
    response: { accounts: AccountRecord[] };
  };
  "account.start": {
    request: { accountId: string };
    response: { ok: boolean; error?: string };
  };
  "account.stop": {
    request: { accountId: string };
    response: { ok: boolean; error?: string };
  };
  "account.logout": {
    request: { accountId: string };
    response: { ok: boolean; error?: string };
  };
  "account.runtime.state": {
    request: { accountId: string };
    response: PddRuntimeState;
  };
  "account.runtime.list": {
    request: undefined;
    response: { states: PddRuntimeState[] };
  };
  "message.list": {
    request: { shopId?: string; limit?: number } | undefined;
    response: { messages: MessageRecord[] };
  };
  "message.send": {
    request: { messageId: string; text: string };
    response: { ok: boolean; error?: string };
  };
  "message.sendImage": {
    request: { messageId: string; imageUrl: string };
    response: { ok: boolean; error?: string };
  };
  "reply.generate": {
    request: GenerateReplyRequest;
    response: GenerateReplyResult;
  };
  "reply.draft.list": {
    request: { shopId?: string } | undefined;
    response: { drafts: ReplyDraftRecord[] };
  };
  "reply.draft.ignore": {
    request: { draftId: string };
    response: { ok: boolean; error?: string };
  };
  "reply.draft.note": {
    request: { draftId: string; note: string };
    response: { ok: boolean; error?: string };
  };
  "knowledge.import": {
    request: KnowledgeImportRequest;
    response: { ok: boolean; document?: KnowledgeDocumentRecord; error?: string };
  };
  "knowledge.list": {
    request: { scope?: KnowledgeScope; shopId?: string } | undefined;
    response: { documents: KnowledgeDocumentRecord[] };
  };
  "knowledge.search": {
    request: KnowledgeSearchRequest;
    response: { results: KnowledgeSearchResult[] };
  };
  "knowledge.governed.list": {
    request: { kind?: GovernedKnowledgeKind; shopId?: string; citationId?: string; eligibleOnly?: boolean } | undefined;
    response: { records: GovernedKnowledgeRecord[] };
  };
  "knowledge.governed.save": {
    request: Omit<GovernedKnowledgeRecord, "id" | "citationId" | "version" | "createdAt" | "updatedAt" | "stale" | "conflict"> & {
      id?: string;
      citationId?: string;
      version?: number;
      stale?: boolean;
      conflict?: boolean;
    };
    response: { ok: boolean; record?: GovernedKnowledgeRecord; error?: string };
  };
  "knowledge.governed.rollback": {
    request: { citationId: string; version: number };
    response: { ok: boolean; record?: GovernedKnowledgeRecord; error?: string };
  };
  "knowledge.governed.state": {
    request: { citationId: string; enabled?: boolean; reviewState?: GovernedKnowledgeRecord["reviewState"] };
    response: { ok: boolean; record?: GovernedKnowledgeRecord; error?: string };
  };
  "knowledge.governed.delete": {
    request: { citationId: string };
    response: { ok: boolean; error?: string };
  };
  "knowledge.customer_service.import": {
    request: {
      shopId: string;
      rows: Array<{ title: string; content: string; tags?: string[] }>;
      reviewState?: GovernedKnowledgeRecord["reviewState"];
    };
    response: { ok: boolean; created: number; skippedDuplicates: number; failed: number; error?: string };
  };
  "product.sync.start": {
    request: { accountId: string; mode: ProductSyncMode; pageSize?: number; maxPages?: number };
    response: { ok: boolean; run?: ProductSyncProgress; error?: string };
  };
  "product.sync.status": {
    request: { runId: string };
    response: { ok: boolean; run?: ProductSyncProgress; error?: string };
  };
  "product.sync.cancel": {
    request: { runId: string };
    response: { ok: boolean; run?: ProductSyncProgress; error?: string };
  };
  "agent.audit.list": {
    request: { shopId?: string; messageId?: string; limit?: number } | undefined;
    response: { records: AgentAuditRecord[] };
  };
  "inference.config.get": {
    request: undefined;
    response: { config?: InferenceConfig };
  };
  "inference.config.save": {
    request: InferenceConfig;
    response: { ok: boolean; error?: string };
  };
  "inference.config.clearApiKey": {
    request: undefined;
    response: { ok: boolean; error?: string };
  };
  "inference.health": {
    request: undefined;
    response: { ok: boolean; error?: string };
  };
  "inference.runtime.status": {
    request: undefined;
    response: {
      running: boolean;
      pid?: number;
      baseUrl?: string;
      runtimeKind?: "managed_llama_server";
      runtimeName?: string;
      host?: string;
      port?: number;
      modelPath?: string;
      modelId?: string;
      modelReady?: boolean;
      runtimeReady?: boolean;
      runtimeCommand?: string;
      runtimeError?: string;
    };
  };
  "inference.local.profiles": {
    request: undefined;
    response: { profiles: LocalModelProfile[] };
  };
  "inference.runtime.prepare": {
    request: undefined;
    response: { ok: boolean; runtimeCommand?: string; error?: string; source?: string };
  };
  "inference.runtime.start": {
    request: Partial<InferenceRuntimeConfig> & { requestId?: string };
    response: {
      ok: boolean;
      error?: string;
      running: boolean;
      pid?: number;
      baseUrl?: string;
      runtimeKind?: "managed_llama_server";
    };
  };
  "inference.runtime.stop": {
    request: undefined;
    response: { ok: boolean; running: boolean; error?: string };
  };
  "inference.modelscope.download": {
    request: { modelId: string; expectedSha256?: string; requestId?: string };
    response: { ok: boolean; modelPath: string; error?: string };
  };
  "settings.get": {
    request: undefined;
    response: { settings: AppSettings };
  };
  "settings.save": {
    request: Partial<AppSettings>;
    response: { ok: boolean; settings: AppSettings; error?: string };
  };
  "queue.list": {
    request: { shopId?: string; state?: InboundQueueRecord["state"] } | undefined;
    response: { items: InboundQueueRecord[] };
  };
  "queue.pause": {
    request: undefined;
    response: { ok: boolean; settings: AppSettings };
  };
  "queue.resume": {
    request: undefined;
    response: { ok: boolean; settings: AppSettings };
  };
  "queue.retryDeadLetters": {
    request: { ids?: string[]; shopId?: string; limit?: number } | undefined;
    response: { ok: boolean; retried: number; items: InboundQueueRecord[]; error?: string };
  };
  "queue.metrics": {
    request: undefined;
    response: { metrics: InboundQueueMetrics };
  };
  "dependency.health": {
    request: undefined;
    response: { dependencies: DependencySnapshot[] };
  };
  "acceptance.status": {
    request: { commitSha?: string; platform?: string; tag?: string } | undefined;
    response: {
      ok: boolean;
      commitSha: string;
      platform: string;
      tag?: string;
      records: number;
      errors: string[];
      matrix: AcceptanceCapabilityMatrixRow[];
    };
  };
  "log.list": {
    request: { level?: LogLevel; limit?: number } | undefined;
    response: { logs: LogRecord[] };
  };
  "app.health": {
    request: undefined;
    response: { ok: boolean; worker: "starting" | "ready" | "stopped" | "error" };
  };
}

export type IpcChannel = keyof IpcContract;
export type IpcRequest<TChannel extends IpcChannel> = IpcContract[TChannel]["request"];
export type IpcResponse<TChannel extends IpcChannel> = IpcContract[TChannel]["response"];
