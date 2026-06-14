import { LangChainReplyWorkflow } from "@customer-agent/agents";
import type { GeneratedReply, GenerateReplyRequest, ReplyDraftRecord } from "@customer-agent/core";
import type { SqliteAppStore } from "@customer-agent/db";
import type { OpenAICompatibleClient } from "@customer-agent/inference";
import type { LanceKnowledgeService } from "@customer-agent/knowledge";

export interface GenerateReplyDeps {
  store: Pick<SqliteAppStore, "getSettings" | "saveDraft" | "appendLog">;
  createInferenceClient: () => Promise<Pick<OpenAICompatibleClient, "chat">>;
  createKnowledgeService: () => Promise<Pick<LanceKnowledgeService, "search">>;
}

export type GenerateReplyOutcome =
  | { ok: true; reply: GeneratedReply; draftId?: string }
  | { ok: false; error: string };

// Shared receive→generate→persist path used by both the reply.generate IPC
// handler and the inbound onMessageReceived glue. In human_review mode it
// persists a draft (state draft_ready); in automatic mode the caller sends it.
export async function generateAndPersistReply(
  request: GenerateReplyRequest,
  deps: GenerateReplyDeps,
): Promise<GenerateReplyOutcome> {
  try {
    const settings = await deps.store.getSettings();
    const client = await deps.createInferenceClient();
    const knowledge = await deps.createKnowledgeService();
    const workflow = new LangChainReplyWorkflow({
      invokeModel: (prompt) => client.chat(prompt),
      searchKnowledge: (input) => knowledge.search({ ...input, topK: settings.knowledge.topK }),
    });
    const reply = await workflow.generate(request);
    if (request.mode === "human_review") {
      const draft: ReplyDraftRecord = {
        id: crypto.randomUUID(),
        messageId: request.context.id,
        accountId: request.context.accountId,
        shopId: request.context.shopId,
        mode: request.mode,
        reply,
        state: "draft_ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await deps.store.saveDraft(draft);
      return { ok: true, reply, draftId: draft.id };
    }
    return { ok: true, reply };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDiagnostic(deps.store, "inference", "reply_generation_failure", {
      accountId: request.context.accountId,
      shopId: request.context.shopId,
      messageId: request.context.id,
      error: message,
    });
    return { ok: false, error: sanitizeUserFacingError(message) };
  }
}

export async function appendDiagnostic(
  store: Pick<SqliteAppStore, "appendLog">,
  subsystem: "pdd" | "inference" | "knowledge",
  code: string,
  context: Record<string, string>,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const fields = Object.entries(context)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}=${sanitizeLogValue(value)}`)
    .join(" ");
  await store.appendLog("error", `诊断[${subsystem}/${code}] ${timestamp} ${fields}`.trim());
}

function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 300);
}

export function sanitizeUserFacingError(value: string): string {
  return value
    .replace(/diagnosis?\[[^\]]+\]\s*/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}
