export type ChannelType = "pinduoduo";

export type CustomerMessageType =
  | "text"
  | "image"
  | "video"
  | "emotion"
  | "goods_card"
  | "goods_inquiry"
  | "goods_spec"
  | "order_info"
  | "system_status"
  | "mall_system_msg"
  | "system_hint"
  | "system_biz"
  | "mall_cs"
  | "withdraw"
  | "auth"
  | "transfer";

export interface GoodsContext {
  goodsId?: string;
  goodsName?: string;
  goodsPrice?: string;
  goodsSpec?: string;
  raw?: unknown;
}

export interface OrderContext {
  orderId?: string;
  goodsName?: string;
  raw?: unknown;
}

export interface CustomerServiceContext {
  id: string;
  channel: ChannelType;
  type: CustomerMessageType;
  content: string;
  shopId: string;
  accountId: string;
  buyerId: string;
  buyerNickname?: string;
  goods?: GoodsContext;
  order?: OrderContext;
  raw?: unknown;
  receivedAt: string;
}
