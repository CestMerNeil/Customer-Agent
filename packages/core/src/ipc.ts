import type { CustomerServiceContext } from "./context.js";
import type {
  AccountRecord,
  AppSettings,
  InferenceConfig,
  KnowledgeDocumentRecord,
  KnowledgeScope,
  KnowledgeSearchResult,
  LogLevel,
  LogRecord,
  MessageRecord,
  ReplyDraftRecord
} from "./domain.js";
import type { GeneratedReply, ReplyMode } from "./reply.js";

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
  "message.list": {
    request: { shopId?: string; limit?: number } | undefined;
    response: { messages: MessageRecord[] };
  };
  "message.send": {
    request: { messageId: string; text: string };
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
  "reply.draft.send": {
    request: { draftId: string };
    response: { ok: boolean; error?: string };
  };
  "reply.draft.ignore": {
    request: { draftId: string };
    response: { ok: boolean; error?: string };
  };
  "reply.draft.escalate": {
    request: { draftId: string };
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
  "inference.config.get": {
    request: undefined;
    response: { config?: InferenceConfig };
  };
  "inference.config.save": {
    request: InferenceConfig;
    response: { ok: boolean; error?: string };
  };
  "inference.health": {
    request: undefined;
    response: { ok: boolean; error?: string };
  };
  "settings.get": {
    request: undefined;
    response: { settings: AppSettings };
  };
  "settings.save": {
    request: Partial<AppSettings>;
    response: { ok: boolean; settings: AppSettings; error?: string };
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
