import type { CustomerServiceContext, GeneratedReply, KnowledgeSourceReference, ReplyMode } from "@customer-agent/core";
import type { CustomerAgentTool, CustomerAgentToolCall, CustomerAgentToolName, CustomerAgentToolResult, ToolWorkflowEvent } from "./tools.js";

export interface ResponseToolDefinition {
  type: "function";
  name: CustomerAgentToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
}

export interface ResponseToolOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface ResponseModelRequest {
  instructions: string;
  input: string | ResponseToolOutput[];
  tools: ResponseToolDefinition[];
  previousResponseId?: string;
}

export interface ResponseModelToolCall {
  id?: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ResponseModelResult {
  responseId?: string;
  outputText?: string;
  toolCalls: ResponseModelToolCall[];
}

export interface ResponsesAgentWorkflowOptions {
  invokeModel: (request: ResponseModelRequest) => Promise<ResponseModelResult>;
  tools: CustomerAgentTool[];
  maxIterations?: number;
  maxToolAttempts?: number;
  onEvent?: (event: ToolWorkflowEvent) => void;
}

export class ResponsesAgentWorkflow {
  private readonly tools: Map<CustomerAgentToolName, CustomerAgentTool>;

  constructor(private readonly options: ResponsesAgentWorkflowOptions) {
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  }

  async generate(input: { context: CustomerServiceContext; mode: ReplyMode; memorySummary?: string }): Promise<GeneratedReply> {
    const citations: KnowledgeSourceReference[] = [];
    const instructions = buildResponsesInstructions(input.context, [...this.tools.values()], input.memorySummary);
    const tools = [...this.tools.values()].map(toResponseToolDefinition);
    const maxIterations = this.options.maxIterations ?? 4;
    let previousResponseId: string | undefined;
    let nextInput: string | ResponseToolOutput[] = buildInitialInput(input.context);
    const customerServiceCatalog = await this.executePrefetchTool("list_customer_service_knowledge", { page: 1 });
    if (customerServiceCatalog) {
      nextInput = appendPrefetchedCustomerServiceCatalog(nextInput, customerServiceCatalog);
    }
    if (shouldPrefetchShopProducts(input.context.content)) {
      const result = await this.executePrefetchTool("get_shop_products", {});
      if (result) {
        if (result.ok && result.citations?.length) {
          citations.push(...result.citations);
        }
        nextInput = appendPrefetchedShopProducts(nextInput, result);
      }
    }

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const modelResult = await this.options.invokeModel({
        instructions,
        input: nextInput,
        tools,
        ...(previousResponseId ? { previousResponseId } : {}),
      });
      previousResponseId = modelResult.responseId ?? previousResponseId;

      if (modelResult.outputText) {
        this.options.onEvent?.({ type: "model", content: modelResult.outputText });
      }
      if (!modelResult.toolCalls.length) {
        const text = modelResult.outputText?.trim() || "您好，当前信息不足，建议转人工继续处理。";
        this.options.onEvent?.({
          type: "final",
          content: text,
          result: { ok: true, content: text, citations: dedupeCitations(citations) },
        });
        return buildReply(text, input.mode, citations);
      }

      const toolOutputs: ResponseToolOutput[] = [];
      for (const call of modelResult.toolCalls) {
        const workflowCall = normalizeResponseToolCall(call);
        this.options.onEvent?.({ type: "tool_call", name: workflowCall.name, input: workflowCall.input });
        const result = await this.executeToolWithRetry(workflowCall);
        this.options.onEvent?.({ type: "tool_result", name: workflowCall.name, result });
        if (result.ok && result.citations?.length) {
          citations.push(...result.citations);
        }
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({
            ok: result.ok,
            content: result.content,
            error: result.error,
            citations: result.citations ?? [],
          }),
        });
      }
      nextInput = toolOutputs;
    }

    this.options.onEvent?.({ type: "loop_limit" });
    const finalResult = await this.options.invokeModel({
      instructions: `${instructions}\n\n工具循环已达到上限。请只基于已经返回的工具结果给出最终客服回复；信息不足时建议转人工。`,
      input: Array.isArray(nextInput) ? nextInput : "请给出最终客服回复。",
      tools,
      ...(previousResponseId ? { previousResponseId } : {}),
    });
    const text = finalResult.outputText?.trim() || "您好，当前信息不足，建议转人工继续处理。";
    this.options.onEvent?.({
      type: "final",
      content: text,
      result: { ok: true, content: text, citations: dedupeCitations(citations) },
    });
    return buildReply(text, input.mode, citations);
  }

  private async executeToolWithRetry(call: CustomerAgentToolCall): Promise<CustomerAgentToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { ok: false, content: "", error: `Unsupported tool: ${call.name}` };
    }
    const maxAttempts = this.options.maxToolAttempts ?? 2;
    let lastResult: CustomerAgentToolResult | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await tool.execute(call.input);
        if (result.ok || attempt === maxAttempts) {
          return attempt > 1 && result.ok
            ? { ...result, content: `${result.content}\n（工具第 ${attempt} 次尝试成功）` }
            : result;
        }
        lastResult = result;
      } catch (error) {
        lastResult = {
          ok: false,
          content: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return lastResult ?? { ok: false, content: "", error: `Tool failed: ${call.name}` };
  }

  private async executePrefetchTool(name: CustomerAgentToolName, input: Record<string, unknown>): Promise<CustomerAgentToolResult | undefined> {
    if (!this.tools.has(name)) {
      return undefined;
    }
    this.options.onEvent?.({ type: "tool_call", name, input });
    const result = await this.executeToolWithRetry({ name, input });
    this.options.onEvent?.({ type: "tool_result", name, result });
    return result;
  }
}

function normalizeResponseToolCall(call: ResponseModelToolCall): CustomerAgentToolCall {
  return {
    name: isCustomerAgentToolName(call.name) ? call.name : call.name as CustomerAgentToolName,
    input: call.arguments,
  };
}

function isCustomerAgentToolName(value: string): value is CustomerAgentToolName {
  return value === "get_shop_products"
    || value === "send_goods_link"
    || value === "get_product_knowledge"
    || value === "list_customer_service_knowledge"
    || value === "get_customer_service_knowledge"
    || value === "transfer_conversation";
}

function buildResponsesInstructions(context: CustomerServiceContext, tools: CustomerAgentTool[], memorySummary?: string): string {
  return [
    "你是拼多多商家客服 Agent。请用自然、简短、礼貌的中文客服口吻处理买家消息。",
    "商品事实、库存、价格、适配、订单、物流、售后政策必须先调用工具核验；工具没有结果时，不要编造。",
    "客服知识第 1 页目录已预置在首条输入中；相关时直接调用 get_customer_service_knowledge 获取全文，仅需后续页时再调用 list_customer_service_knowledge。不得只根据目录标题回答。",
    "寒暄、低信息追问或买家不满时，可以直接给出正常客服回应，并引导买家补充商品、订单或售后问题。",
    "不要输出调试说明，不要解释你的推理过程，不要暴露工具名或内部 JSON。",
    `店铺ID：${context.shopId}`,
    `账号ID：${context.accountId}`,
    `买家ID：${context.buyerId}`,
    `消息类型：${context.type}`,
    `会话记忆：${memorySummary?.trim() || "无"}`,
    "可用工具：",
    ...(tools.length ? tools.map((tool) => `- ${tool.name}: ${tool.description}`) : ["无"]),
  ].join("\n");
}

function buildInitialInput(context: CustomerServiceContext): string {
  return [
    "买家消息：",
    context.content,
    "",
    "请按客服 Agent 流程处理：需要事实核验时调用工具；信息足够时直接给出可发送给买家的最终回复。",
  ].join("\n");
}

function shouldPrefetchShopProducts(content: string): boolean {
  return /推荐|买什么|想买|看看商品|商品卡|发.*商品|哪款|哪个.*好|帮.*选|介绍.*商品|有.*商品/u.test(content);
}

function appendPrefetchedShopProducts(input: string, result: CustomerAgentToolResult): string {
  return [
    input,
    "",
    "当前店铺商品上下文：",
    result.ok ? result.content : `获取失败：${result.error ?? result.content}`,
    "",
    "如果需要推荐或发送商品卡，必须基于上面的真实商品上下文选择真实 goods_id。",
  ].join("\n");
}

function appendPrefetchedCustomerServiceCatalog(input: string, result: CustomerAgentToolResult): string {
  return [
    input,
    "",
    "当前店铺客服知识目录：",
    result.ok ? result.content : `获取失败：${result.error ?? result.content}`,
    "",
    "如果目录中存在相关知识，必须调用 get_customer_service_knowledge 读取正文后再回答；不得只根据标题或模型自身知识回答店铺事实。",
  ].join("\n");
}

function toResponseToolDefinition(tool: CustomerAgentTool): ResponseToolDefinition {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: toolParameters(tool.name),
      additionalProperties: false,
    },
  };
}

function toolParameters(name: CustomerAgentToolName): Record<string, unknown> {
  if (name === "get_product_knowledge" || name === "send_goods_link") {
    return {
      goods_id: {
        type: "string",
        description: "真实拼多多商品 ID。",
      },
    };
  }
  if (name === "list_customer_service_knowledge") {
    return {
      page: {
        type: "integer",
        minimum: 1,
        description: "知识目录页码，从 1 开始；默认第 1 页。",
      },
    };
  }
  if (name === "get_customer_service_knowledge") {
    return {
      citation_ids: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
        description: "从客服知识目录中选择的精确 citation ID 列表。",
      },
    };
  }
  if (name === "transfer_conversation") {
    return {
      reason: {
        type: "string",
        description: "转人工原因，例如投诉、强售后诉求、信息不足或需要人工授权。",
      },
    };
  }
  return {};
}

function buildReply(text: string, mode: ReplyMode, citations: KnowledgeSourceReference[]): GeneratedReply {
  return {
    text,
    action: mode === "automatic" ? "send" : "review",
    answerable: citations.length > 0 || !/无法|不足|失败|转人工/.test(text),
    sources: dedupeCitations(citations),
    createdAt: new Date().toISOString(),
  };
}

function dedupeCitations(citations: KnowledgeSourceReference[]): KnowledgeSourceReference[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.documentId}:${citation.chunkId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
