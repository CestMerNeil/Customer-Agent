import type { CustomerMessageType, CustomerServiceContext } from "@customer-agent/core";

interface NormalizeOptions {
  accountId: string;
  shopId: string;
}

export function normalizePddMessage(payload: Record<string, unknown>, options: NormalizeOptions): CustomerServiceContext {
  const from = asRecord(payload.from);
  const buyerNickname = optionalString(from.nickname ?? payload.nickname);
  return {
    id: stringValue(payload.msg_id ?? payload.msgId ?? crypto.randomUUID()),
    channel: "pinduoduo",
    type: mapMessageType(payload.message_type ?? payload.type),
    content: extractContent(payload),
    shopId: options.shopId,
    accountId: options.accountId,
    buyerId: stringValue(from.uid ?? from.user_id ?? payload.buyer_id ?? "unknown-buyer"),
    raw: payload,
    receivedAt: new Date(numberValue(payload.ts ?? payload.timestamp, Date.now())).toISOString(),
    ...(buyerNickname ? { buyerNickname } : {}),
  };
}

function mapMessageType(value: unknown): CustomerMessageType {
  if (value === 0 || value === "text") {
    return "text";
  }
  if (value === "goods" || value === "goods_card") {
    return "goods_card";
  }
  if (value === "order" || value === "order_info") {
    return "order_info";
  }
  return "system_status";
}

function extractContent(payload: Record<string, unknown>): string {
  const content = payload.content ?? payload.text ?? payload.message;
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content ?? payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return String(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
