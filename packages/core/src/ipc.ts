import type { CustomerServiceContext } from "./context.js";
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

export interface IpcContract {
  "account.login": {
    request: AccountLoginRequest;
    response: AccountLoginResult;
  };
  "reply.generate": {
    request: GenerateReplyRequest;
    response: GenerateReplyResult;
  };
  "app.health": {
    request: undefined;
    response: { ok: boolean; worker: "starting" | "ready" | "stopped" | "error" };
  };
}

export type IpcChannel = keyof IpcContract;
export type IpcRequest<TChannel extends IpcChannel> = IpcContract[TChannel]["request"];
export type IpcResponse<TChannel extends IpcChannel> = IpcContract[TChannel]["response"];
