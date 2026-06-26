# Responses Runtime Contract

本合同定义本地与远端模型运行时必须共同满足的最小能力。Agent 只依赖这个合同，不再依赖模型输出纯文本 JSON。

## 请求

运行时必须接收：

- `instructions`：系统指令。
- `input`：用户文本，或上一轮工具结果数组。
- `tools`：函数工具定义，包含 `type=function`、`name`、`description`、`parameters`。
- `previousResponseId`：工具结果续写时使用，首次请求为空。

## 返回

运行时必须返回：

- `responseId`：可用于后续工具结果续写。
- `outputText`：最终可发给买家的自然语言回复。
- `toolCalls`：原生工具调用数组，包含 `callId`、`name`、`arguments`。

## 工具续写

当模型返回 `toolCalls` 时，Agent 执行真实工具，然后把每个结果作为：

```json
{
  "type": "function_call_output",
  "call_id": "call-id-from-model",
  "output": "{\"ok\":true,\"content\":\"...\"}"
}
```

传回同一个运行时，并携带上一轮 `responseId`。运行时必须基于工具结果继续生成下一轮 `toolCalls` 或最终 `outputText`。

## 本地 llama-server 适配边界

`llama-server` 如果只提供 OpenAI-compatible `/chat/completions`，适配层只能做协议翻译：

- 首轮：`instructions + input + tools` 转为 `system/user/tools/tool_choice=auto`。
- 续写：`function_call_output` 转为 `role=tool` 消息。
- 返回：原生 `message.tool_calls` 转为 `toolCalls`。

禁止在 Agent 层要求模型用普通文本输出 JSON 工具调用。

## 多模态

需要商品图片理解时，运行时必须声明并通过图片输入探针。默认不支持图片的模型不能静默降级，也不能使用远端多模态 fallback。

## 探针

本地运行时候选必须通过 `pnpm local-model:probe` 的这些检查，缺图片时 `vision` 可为 blocked：

- `chat_text`
- `tool_call`
- `tool_result_roundtrip`
- `vision`
