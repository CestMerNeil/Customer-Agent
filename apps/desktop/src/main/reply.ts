import {
  ResponsesAgentWorkflow,
  type CustomerAgentTool,
  type CustomerAgentToolResult,
  type ResponseModelRequest,
  type ResponseModelResult,
  type ToolWorkflowEvent
} from "@customer-agent/agents";
import type {
  AppSettings,
  GeneratedReply,
  GenerateReplyRequest,
  ConversationMemoryRecord,
  GovernedKnowledgeRecord,
  KnowledgeSourceReference,
  KnowledgeSearchResult,
  MessageRecord
} from "@customer-agent/core";
import { redactSensitiveText } from "@customer-agent/core";
import type { SqliteAppStore } from "@customer-agent/db";
import type { LanceKnowledgeService } from "@customer-agent/knowledge";

// Mirrors the reference project's default handoff keyword set. Matching is a
// lowercase substring test, so the broad/short entries (好评, 取消, 烂) will also
// fire on incidental mentions — keep them only if aggressive handoff is desired.
const DEFAULT_HANDOFF_KEYWORDS = [
  "转人工",
  "人工客服",
  "真人",
  "客服",
  "人工",
  "工单",
  "好评",
  "取消订单",
  "改地址",
  "转售后客服",
  "转售后",
  "返现",
  "过敏",
  "退款",
  "没有效果",
  "骗人",
  "投诉",
  "纠纷",
  "开发票",
  "开票",
  "烂",
  "取消",
  "备注",
];

interface ChatInferenceClient {
  chat(prompt: string): Promise<string>;
  respond(request: ResponseModelRequest): Promise<ResponseModelResult>;
}

export interface GenerateReplyDeps {
  store: Pick<SqliteAppStore, "getSettings" | "saveDraft" | "appendLog" | "listGovernedKnowledge" | "getConversationMemory" | "saveConversationMemory" | "appendAgentAudit">;
  createInferenceClient: () => Promise<ChatInferenceClient>;
  createKnowledgeService: () => Promise<Pick<LanceKnowledgeService, "search">>;
  sendGoodsLink?: (context: MessageRecord | GenerateReplyRequest["context"], goodsId: string) => Promise<CustomerAgentToolResult>;
  transferConversation?: (context: MessageRecord | GenerateReplyRequest["context"]) => Promise<CustomerAgentToolResult>;
}

export interface InboundHandlerChainDeps extends GenerateReplyDeps {
  store: GenerateReplyDeps["store"] & Pick<SqliteAppStore, "upsertMessage">;
  sendReply?: (message: MessageRecord, text: string) => Promise<void>;
}

export type GenerateReplyOutcome =
  | { ok: true; reply: GeneratedReply }
  | { ok: false; error: string };

export type InboundHandlerChainOutcome =
  | { ok: true; handler: "immediate_system" | "keyword_handoff" | "intent_handoff" | "ai_agent"; action: "ignored" | "escalated" | "send"; reply?: GeneratedReply }
  | { ok: false; handler: "fallback"; error: string };

export async function runInboundHandlerChain(
  request: { context: MessageRecord },
  deps: InboundHandlerChainDeps,
): Promise<InboundHandlerChainOutcome> {
  const settings = await deps.store.getSettings();
  if (!isAiEligibleMessageType(request.context.type)) {
    await deps.store.upsertMessage({ ...request.context, state: "ignored" });
    await deps.store.appendLog("info", `队列消息由系统处理器忽略：messageId=${request.context.id}, type=${request.context.type}`);
    return { ok: true, handler: "immediate_system", action: "ignored" };
  }

  const inHours = isWithinBusinessHours(request.context.receivedAt, settings.businessHours);

  const keyword = matchHandoffKeyword(request.context.content, effectiveHandoffKeywords(settings), request.context.shopId);
  if (keyword) {
    await handleHandoff(request.context, deps, `触发关键词：${keyword}`, inHours, settings.businessHours);
    return { ok: true, handler: "keyword_handoff", action: "escalated" };
  }

  const intentRule = matchIntentRule(request.context.content, settings.handoff?.intentRules ?? [], request.context.shopId);
  if (intentRule) {
    await handleHandoff(request.context, deps, `触发意图：${intentRule.label}`, inHours, settings.businessHours);
    return { ok: true, handler: "intent_handoff", action: "escalated" };
  }

  // 24h coverage: even outside business hours the AI replies directly; there is
  // no human-review queue. Business hours only gate whether a handoff transfers.
  const result = await generateAndPersistReply({ context: request.context, mode: "automatic" }, deps);
  if (!result.ok) {
    return { ok: false, handler: "fallback", error: result.error };
  }
  await deps.sendReply?.(request.context, result.reply.text);
  return { ok: true, handler: "ai_agent", action: "send", reply: result.reply };
}

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
    const memory = await deps.store.getConversationMemory(memoryKey(request.context));
    const tools = createCustomerAgentTools(request.context, deps, settings.knowledge.topK);
    const onEvent = (event: ToolWorkflowEvent) => {
      void persistAgentAuditEvent(request.context, event, deps.store);
    };
    const workflow = new ResponsesAgentWorkflow({
      invokeModel: (modelRequest) => client.respond(modelRequest),
      tools,
      onEvent,
    });
    const reply = await workflow.generate({ ...request, ...(memory?.summary ? { memorySummary: memory.summary } : {}) });
    await updateConversationMemory(request.context, reply, memory, client, deps.store);
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

async function saveEscalationDraft(
  context: MessageRecord,
  store: Pick<SqliteAppStore, "saveDraft">,
  reason: string,
): Promise<void> {
  const reply = buildFailureReply(`已转人工处理。原因：${reason}`);
  await store.saveDraft({
    id: crypto.randomUUID(),
    messageId: context.id,
    accountId: context.accountId,
    shopId: context.shopId,
    mode: "automatic",
    reply,
    state: "escalated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

const HUMAN_UNAVAILABLE_NOTICE = "您好，当前暂时没有空闲的人工客服，我先为您处理，也会尽快为您安排人工跟进。";

function humanOfflineNotice(businessHours: { start: string; end: string }): string {
  return `您好，人工客服当前不在线（服务时间 ${businessHours.start}–${businessHours.end}），我可以先为您处理，您也可以在服务时间内再联系人工。`;
}

// Keyword/intent handoff. During business hours, transfer the conversation to a
// human customer-service account for real. Outside hours (no humans online) or
// when the transfer cannot complete, reply to the buyer that a human is
// unavailable and keep AI handling. A lightweight escalated record is written
// for the handoff audit view — there is no manual review queue.
async function handleHandoff(
  context: MessageRecord,
  deps: InboundHandlerChainDeps,
  reason: string,
  inHours: boolean,
  businessHours: { start: string; end: string },
): Promise<void> {
  await deps.store.upsertMessage({ ...context, state: "escalated" });
  if (!inHours) {
    await deps.sendReply?.(context, humanOfflineNotice(businessHours));
    await saveEscalationDraft(context, deps.store, `${reason}（营业时间外，已回复人工不在线）`);
    await deps.store.appendLog("info", `营业时间外转人工请求：messageId=${context.id}，${sanitizeLogValue(reason)}`);
    return;
  }
  const transfer = await deps.transferConversation?.(context);
  if (transfer?.ok) {
    await saveEscalationDraft(context, deps.store, `${reason}（已转接：${transfer.content}）`);
    await deps.store.appendLog("info", `转人工已真实转接：messageId=${context.id}，${sanitizeLogValue(reason)}`);
    return;
  }
  await deps.sendReply?.(context, HUMAN_UNAVAILABLE_NOTICE);
  await saveEscalationDraft(context, deps.store, `${reason}（${transfer?.error ? "转接失败" : "未配置真实转接"}，已回复人工暂不可用）`);
  await deps.store.appendLog(
    "info",
    `转人工暂不可用：messageId=${context.id}，${sanitizeLogValue(reason)}${transfer?.error ? `，原因=${sanitizeLogValue(transfer.error)}` : ""}`,
  );
}

async function persistAgentAuditEvent(
  context: GenerateReplyRequest["context"],
  event: ToolWorkflowEvent,
  store: Pick<SqliteAppStore, "appendAgentAudit" | "appendLog">,
): Promise<void> {
  try {
    await store.appendAgentAudit({
      shopId: context.shopId,
      accountId: context.accountId,
      buyerId: context.buyerId,
      messageId: context.id,
      eventType: event.type,
      ...(event.name ? { toolName: event.name } : {}),
      ...(event.result?.ok === undefined ? {} : { ok: event.result.ok }),
      summary: summarizeAuditEvent(event),
      citations: event.result?.citations ?? [],
    });
  } catch (error) {
    await appendDiagnostic(store, "inference", "agent_audit_persist_failure", {
      accountId: context.accountId,
      shopId: context.shopId,
      messageId: context.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function summarizeAuditEvent(event: ToolWorkflowEvent): string {
  if (event.type === "tool_call") {
    return truncateAuditText(`tool_call input=${JSON.stringify(event.input ?? {})}`);
  }
  if (event.type === "tool_result") {
    return truncateAuditText(`tool_result ok=${event.result?.ok} content=${event.result?.content ?? ""} error=${event.result?.error ?? ""}`);
  }
  return truncateAuditText(event.content ?? event.type);
}

function truncateAuditText(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 500);
}

async function updateConversationMemory(
  context: GenerateReplyRequest["context"],
  reply: GeneratedReply,
  existing: ConversationMemoryRecord | undefined,
  client: ChatInferenceClient,
  store: Pick<SqliteAppStore, "saveConversationMemory" | "appendLog">,
): Promise<void> {
  try {
    const nextText = [
      existing?.summary,
      `买家：${context.content}`,
      `客服：${reply.text}`,
    ].filter(Boolean).join("\n");
    const shouldCompress = nextText.length > 1200;
    const summary = shouldCompress
      ? await client.chat([
        "请把以下电商客服会话压缩成后续回复可用的简洁记忆。",
        "保留：买家需求、商品/订单上下文、已承诺事项、人工转接状态、未解决问题。",
        "不要加入原文没有的信息。",
        "",
        nextText,
      ].join("\n"))
      : nextText;
    await store.saveConversationMemory({
      ...memoryKey(context),
      summary,
      messageCount: (existing?.messageCount ?? 0) + 2,
    });
  } catch (error) {
    await appendDiagnostic(store, "inference", "conversation_memory_update_failure", {
      accountId: context.accountId,
      shopId: context.shopId,
      messageId: context.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function memoryKey(context: GenerateReplyRequest["context"]): { shopId: string; accountId: string; buyerId: string } {
  return {
    shopId: context.shopId,
    accountId: context.accountId,
    buyerId: context.buyerId,
  };
}

function createCustomerAgentTools(
  context: GenerateReplyRequest["context"],
  deps: GenerateReplyDeps,
  topK: number,
): CustomerAgentTool[] {
  return [
    {
      name: "get_shop_products",
      description: "获取当前店铺已审核且启用的商品知识列表，用于推荐商品。输入可为空。",
      execute: async () => {
        const records = await deps.store.listGovernedKnowledge({ kind: "product", shopId: context.shopId, eligibleOnly: true });
        const matched = searchEligibleGovernedKnowledge(records, context.content, topK);
        const results = matched.length ? matched : searchEligibleGovernedKnowledge(records, "", topK);
        return {
          ok: true,
          content: results.length
            ? results.map((result) => `商品知识: ${result.documentId}\n${result.content}`).join("\n\n")
            : "当前店铺没有可用的已审核商品知识。",
          citations: results.map(toCitation),
        };
      },
    },
    {
      name: "get_product_knowledge",
      description: "按真实 goods_id 获取当前店铺已审核商品知识。输入：goods_id。",
      execute: async (input) => {
        const goodsId = stringInput(input.goods_id ?? input.goodsId ?? context.goods?.goodsId);
        if (!goodsId) {
          return { ok: false, content: "", error: "缺少 goods_id" };
        }
        const records = await deps.store.listGovernedKnowledge({
          kind: "product",
          shopId: context.shopId,
          citationId: `product:${context.shopId}:${goodsId}`,
          eligibleOnly: true,
        });
        const results = searchEligibleGovernedKnowledge(records, goodsId, topK);
        return {
          ok: results.length > 0,
          content: results.length ? results.map((result) => result.content).join("\n\n") : "未找到已审核商品知识。",
          citations: results.map(toCitation),
          ...(results.length ? {} : { error: "product_knowledge_not_found" }),
        };
      },
    },
    {
      name: "search_customer_service_knowledge",
      description: "搜索当前店铺已审核客服知识。输入：query。",
      execute: async (input) => {
        const query = stringInput(input.query) ?? context.content;
        const records = await deps.store.listGovernedKnowledge({ kind: "customer_service", shopId: context.shopId, eligibleOnly: true });
        const results = searchEligibleGovernedKnowledge(records, query, topK);
        return {
          ok: results.length > 0,
          content: results.length ? results.map((result) => result.content).join("\n\n") : "未找到可用客服知识。",
          citations: results.map(toCitation),
          ...(results.length ? {} : { error: "customer_service_knowledge_not_found" }),
        };
      },
    },
    {
      name: "send_goods_link",
      description: "向当前买家发送真实拼多多商品卡片。输入：goods_id。只能使用商品ID，不能使用列表序号。",
      execute: async (input) => {
        const goodsId = stringInput(input.goods_id ?? input.goodsId);
        if (!goodsId) {
          return { ok: false, content: "", error: "缺少 goods_id" };
        }
        const records = await deps.store.listGovernedKnowledge({
          kind: "product",
          shopId: context.shopId,
          citationId: `product:${context.shopId}:${goodsId}`,
          eligibleOnly: true,
        });
        if (records.length === 0) {
          return {
            ok: false,
            content: "",
            error: "cross_shop_goods_blocked: goods_id is not eligible for current shop",
          };
        }
        return deps.sendGoodsLink
          ? deps.sendGoodsLink(context, goodsId)
          : { ok: false, content: "", error: "send_goods_link_not_configured" };
      },
    },
    {
      name: "transfer_conversation",
      description: "将当前真实买家会话转接给可用人工客服。输入 reason，说明为什么需要转人工。",
      execute: async () => deps.transferConversation
        ? deps.transferConversation(context)
        : { ok: false, content: "", error: "transfer_conversation_not_configured" },
    },
  ];
}

function searchEligibleGovernedKnowledge(
  records: GovernedKnowledgeRecord[],
  query: string,
  topK: number,
): KnowledgeSearchResult[] {
  const terms = tokenize(query);
  return records
    .filter((record) => record.reviewState === "reviewed" && record.enabled && !record.stale && !record.conflict)
    .map((record) => ({ record, score: scoreKnowledge(record, terms) }))
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt))
    .slice(0, topK)
    .map(({ record, score }) => ({
      id: record.id,
      documentId: record.citationId,
      chunkId: `v${record.version}`,
      scope: "shop",
      shopId: record.shopId,
      content: record.content,
      score,
    }));
}

function scoreKnowledge(record: GovernedKnowledgeRecord, terms: string[]): number {
  const haystack = `${record.title}\n${record.content}\n${record.tags.join(" ")}`.toLowerCase();
  const labels = [record.title, ...record.tags].map((value) => value.toLowerCase()).filter(Boolean);
  return terms.reduce((score, term) => {
    if (haystack.includes(term)) {
      return score + 1;
    }
    return score + (labels.some((label) => label.length > 0 && term.includes(label)) ? 1 : 0);
  }, 0);
}

function tokenize(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().split(/[\s,，。！？!?；;、]+/).map((term) => term.trim()).filter(Boolean)));
}

function toCitation(result: KnowledgeSearchResult): KnowledgeSourceReference {
  return {
    scope: result.scope,
    documentId: result.documentId,
    chunkId: result.chunkId,
    score: result.score,
  };
}

function stringInput(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() || undefined : undefined;
}

function isAiEligibleMessageType(type: MessageRecord["type"]): boolean {
  return ["text", "image", "video", "emotion", "goods_card", "goods_inquiry", "goods_spec", "order_info"].includes(type);
}

function matchHandoffKeyword(content: string, keywords: string[], shopId: string): string | undefined {
  const normalizedContent = content.trim().toLowerCase();
  return keywords.map((keyword) => parseScopedRule(keyword.trim()))
    .find((rule) => rule.value.length > 0 && (!rule.shopId || rule.shopId === shopId) && normalizedContent.includes(rule.value.toLowerCase()))
    ?.value;
}

function effectiveHandoffKeywords(settings: AppSettings): string[] {
  return settings.handoff?.keywords?.length ? settings.handoff.keywords : DEFAULT_HANDOFF_KEYWORDS;
}

function matchIntentRule(
  content: string,
  rules: Array<{ id: string; label: string; patterns: string[]; shopId?: string }>,
  shopId: string,
): { id: string; label: string } | undefined {
  const normalizedContent = content.trim();
  for (const rule of rules) {
    if (rule.shopId && rule.shopId !== shopId) continue;
    const matched = rule.patterns.map((pattern) => pattern.trim()).some((pattern) => pattern.length > 0 && normalizedContent.includes(pattern));
    if (matched) {
      return { id: rule.id, label: rule.label };
    }
  }
  return undefined;
}

function parseScopedRule(line: string): { shopId?: string; value: string } {
  const match = /^shop:([^:]+):(.+)$/u.exec(line);
  if (!match?.[1] || !match[2]) return { value: line };
  return { shopId: match[1], value: match[2] };
}

function isWithinBusinessHours(receivedAt: string, hours: { start: string; end: string }): boolean {
  const current = minutesOfDay(receivedAt);
  const start = parseClockMinutes(hours.start);
  const end = parseClockMinutes(hours.end);
  if (current === undefined || start === undefined || end === undefined || start === end) {
    return true;
  }
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

function minutesOfDay(value: string): number | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.getHours() * 60 + date.getMinutes();
}

function parseClockMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
}

function buildFailureReply(text: string): GeneratedReply {
  return {
    text,
    action: "review",
    answerable: false,
    sources: [],
    createdAt: new Date().toISOString(),
  };
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
  return redactSensitiveText(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 300);
}

export function sanitizeUserFacingError(value: string): string {
  return redactSensitiveText(value)
    .replace(/diagnosis?\[[^\]]+\]\s*/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}
