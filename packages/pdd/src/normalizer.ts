import type { CustomerMessageType, CustomerServiceContext } from "@customer-agent/core";

/** Account and shop identity attached to a normalized PDD message. */
interface NormalizeOptions {
  accountId: string;
  shopId: string;
}

/**
 * Converts a PDD websocket payload into the minimal persisted business context.
 *
 * @param payload Untrusted PDD websocket payload.
 * @param options Account and shop identity for the active connection.
 * @returns A normalized message without the original raw payload.
 */
export function normalizePddMessage(payload: Record<string, unknown>, options: NormalizeOptions): CustomerServiceContext {
  const messagePayload = asRecord(payload.message);
  const source = Object.keys(messagePayload).length > 0 ? messagePayload : payload;
  const from = asRecord(source.from ?? payload.from);
  const fromRole = stringValue(from.role);
  const buyerNickname = optionalString(from.nickname ?? source.nickname ?? payload.nickname);
  const messageType = fromRole === "mall_cs"
    ? "mall_cs"
    : mapMessageType(
        payload.response === "push"
          ? source.type
          : payload.response ?? source.message_type ?? source.type ?? source.msg_type ?? source.event ?? payload.message_type ?? payload.type ?? payload.msg_type ?? payload.event,
        source.sub_type,
      );
  const goods = extractGoodsContext(source, payload);
  const order = extractOrderContext(source, payload);

  const message: CustomerServiceContext = {
    id: stringValue(source.msg_id ?? source.msgId ?? payload.msg_id ?? payload.msgId ?? crypto.randomUUID()),
    channel: "pinduoduo",
    type: messageType,
    content: extractContent(messageType, source, payload, goods, order),
    shopId: options.shopId,
    accountId: options.accountId,
    buyerId: stringValue(from.uid ?? from.user_id ?? source.buyer_id ?? payload.buyer_id ?? "unknown-buyer"),
    receivedAt: new Date(timestampValue(source.time ?? source.ts ?? source.timestamp ?? payload.ts ?? payload.timestamp, Date.now())).toISOString(),
    ...(buyerNickname ? { buyerNickname } : {}),
    ...(goods ? { goods } : {}),
    ...(order ? { order } : {}),
  };
  return message;
}

/**
 * Returns whether a normalized message should enter the inbound reply queue.
 *
 * @param message Normalized message type.
 * @returns Whether the message represents buyer content that can receive a reply.
 */
export function isQueueablePddMessage(message: Pick<CustomerServiceContext, "type">): boolean {
  return [
    "text",
    "image",
    "video",
    "emotion",
    "goods_card",
    "goods_inquiry",
    "goods_spec",
    "order_info",
  ].includes(message.type);
}

/**
 * Maps PDD message identifiers onto the stable customer-message taxonomy.
 *
 * @param value PDD message type value.
 * @param subType Optional PDD subtype used by type zero.
 * @returns Normalized customer message type.
 */
function mapMessageType(value: unknown, subType?: unknown): CustomerMessageType {
  if (value === 0 && subType === 1) {
    return "order_info";
  }
  if (value === 0 && subType === 0) {
    return "goods_inquiry";
  }
  if (value === 0 || value === "text" || value === "text_msg" || value === "chat") {
    return "text";
  }
  if (value === 1 || value === "image" || value === "image_msg") {
    return "image";
  }
  if (value === 2 || value === 14 || value === "video" || value === "video_msg") {
    return "video";
  }
  if (value === 3 || value === 5 || value === "emotion") {
    return "emotion";
  }
  if (value === "goods" || value === "goods_card" || value === "goods-card") {
    return "goods_card";
  }
  if (value === "goods_inquiry" || value === "goods-inquiry") {
    return "goods_inquiry";
  }
  if (value === 64 || value === "goods_spec" || value === "goods-spec") {
    return "goods_spec";
  }
  if (value === "order" || value === "order_info" || value === 7 || value === "order_info_msg") {
    return "order_info";
  }
  if (value === 1002 || value === "withdraw" || value === "withdraw_msg") {
    return "withdraw";
  }
  if (value === "auth" || value === "auth_msg") {
    return "auth";
  }
  if (value === 24 || value === "transfer" || value === "transfer_msg") {
    return "transfer";
  }
  if (value === "mall_system_msg" || value === "mall_system_msg_msg") {
    return "mall_system_msg";
  }
  if (value === "system_hint" || value === "system_hint_msg") {
    return "system_hint";
  }
  if (value === "system_biz" || value === "system_biz_msg") {
    return "system_biz";
  }
  if (value === "mall_cs" || value === "cs") {
    return "mall_cs";
  }
  if (value === "system_status" || value === "system" || value === "sys") {
    return "system_status";
  }
  return "system_status";
}

/**
 * Extracts only reply-relevant content instead of serializing the whole payload.
 *
 * @param type Normalized message type.
 * @param payload Message-level PDD fields.
 * @param envelope Outer websocket envelope.
 * @param goods Minimal normalized goods context, when present.
 * @param order Minimal normalized order context, when present.
 * @returns Persistable message content.
 */
function extractContent(
  type: CustomerMessageType,
  payload: Record<string, unknown>,
  envelope: Record<string, unknown> = payload,
  goods?: CustomerServiceContext["goods"],
  order?: CustomerServiceContext["order"],
): string {
  const media = asRecord(payload.media);
  const content = payload.content ?? payload.text ?? payload.message ?? payload.msg ?? payload.body;
  if (typeof content === "string" && content.length > 0) {
    return content;
  }

  const imageUrl = stringValue(payload.image_url ?? payload.imageUrl ?? media.url ?? media.src ?? payload.url ?? payload.thumbnail);
  if (type === "image" && imageUrl) {
    return imageUrl;
  }

  const videoUrl = stringValue(payload.video_url ?? payload.videoUrl ?? media.videoUrl ?? media.url ?? payload.url);
  if (type === "video" && videoUrl) {
    return videoUrl;
  }

  const emotionId = stringValue(payload.emotion_id ?? payload.emotionId ?? payload.emoji);
  if (type === "emotion" && emotionId) {
    return emotionId;
  }

  const systemText = stringValue(payload.notice ?? payload.info ?? payload.desc ?? envelope.response);
  if (systemText) {
    return systemText;
  }
  if (typeof content === "string") {
    return content;
  }
  if (goods) {
    return [goods.goodsName, goods.goodsSpec, goods.goodsId].filter(Boolean).join(" ") || "商品消息";
  }
  if (order) {
    return [order.orderId, order.goodsName].filter(Boolean).join(" ") || "订单消息";
  }
  return `[${type}]`;
}

/**
 * Extracts the allowlisted goods fields needed by reply generation.
 *
 * @param payload Message-level PDD fields.
 * @param envelope Outer websocket envelope.
 * @returns Minimal goods context, or `undefined` when absent.
 */
function extractGoodsContext(payload: Record<string, unknown>, envelope: Record<string, unknown> = payload): CustomerServiceContext["goods"] {
  const info = asRecord(payload.info);
  const data = asRecord(info.data);
  const goods = asRecord(payload.goods_card ?? payload.goods ?? payload.goodsInfo ?? payload.goods_info ?? payload.product ?? info.data ?? info ?? envelope.goods_card);
  if (Object.keys(goods).length === 0) {
    return undefined;
  }

  const spec = stringValue(goods.spec ?? goods.sku_spec ?? goods.goods_spec ?? data.spec);
  const context: CustomerServiceContext["goods"] = {};
  const goodsId = stringValue(goods.goods_id ?? goods.goodsId ?? goods.goodsID ?? goods.id);
  if (goodsId) {
    context.goodsId = goodsId;
  }
  const goodsName = optionalString(goods.goods_name ?? goods.goodsName ?? goods.name ?? goods.title);
  if (goodsName) {
    context.goodsName = goodsName;
  }
  const goodsPrice = optionalString(goods.goods_price ?? goods.goodsPrice ?? goods.price ?? goods.price_text);
  if (goodsPrice) {
    context.goodsPrice = goodsPrice;
  }
  if (spec) {
    context.goodsSpec = spec;
  }
  return context;
}

/**
 * Extracts the allowlisted order fields needed by reply generation.
 *
 * @param payload Message-level PDD fields.
 * @param envelope Outer websocket envelope.
 * @returns Minimal order context, or `undefined` when absent.
 */
function extractOrderContext(payload: Record<string, unknown>, envelope: Record<string, unknown> = payload): CustomerServiceContext["order"] {
  const info = asRecord(payload.info);
  const order = asRecord(payload.order_info ?? payload.order ?? payload.orderInfo ?? info ?? envelope.order_info);
  if (Object.keys(order).length === 0) {
    return undefined;
  }

  const context: CustomerServiceContext["order"] = {};
  const orderId = stringValue(order.order_id ?? order.orderId ?? order.orderSequenceNo ?? order.id);
  if (orderId) {
    context.orderId = orderId;
  }
  const goodsName = optionalString(order.goods_name ?? order.goodsName);
  if (goodsName) {
    context.goodsName = goodsName;
  }
  return context;
}

/**
 * Narrows an unknown value to a plain record-like object.
 *
 * @param value Candidate value.
 * @returns The object value or an empty record.
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * Converts string and numeric identifiers to text.
 *
 * @param value Candidate identifier.
 * @returns Text value or an empty string.
 */
function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * Returns a string only when the input is already textual.
 *
 * @param value Candidate value.
 * @returns Text value or `undefined`.
 */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Returns a numeric value with a fallback.
 *
 * @param value Candidate number.
 * @param fallback Value used for non-numeric input.
 * @returns Numeric input or the fallback.
 */
function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * Normalizes second- or millisecond-based timestamps to milliseconds.
 *
 * @param value Candidate timestamp.
 * @param fallback Millisecond timestamp used for invalid input.
 * @returns Timestamp in milliseconds.
 */
function timestampValue(value: unknown, fallback: number): number {
  const numeric = numberValue(value, fallback);
  return numeric > 0 && numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}
