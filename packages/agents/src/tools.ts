import type { KnowledgeSourceReference } from "@customer-agent/core";

export type CustomerAgentToolName =
  | "get_shop_products"
  | "send_goods_link"
  | "get_product_knowledge"
  | "list_customer_service_knowledge"
  | "get_customer_service_knowledge"
  | "transfer_conversation";

export interface CustomerAgentToolCall {
  name: CustomerAgentToolName;
  input: Record<string, unknown>;
}

export interface CustomerAgentToolResult {
  ok: boolean;
  content: string;
  citations?: KnowledgeSourceReference[];
  error?: string;
}

export interface CustomerAgentTool {
  name: CustomerAgentToolName;
  description: string;
  execute(input: Record<string, unknown>): Promise<CustomerAgentToolResult>;
}

export interface ToolWorkflowEvent {
  type: "model" | "tool_call" | "tool_result" | "final" | "loop_limit";
  name?: CustomerAgentToolName;
  content?: string;
  input?: Record<string, unknown>;
  result?: CustomerAgentToolResult;
}
