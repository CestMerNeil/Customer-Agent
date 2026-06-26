# 真实 Agent 工具触发验收脚本

本文档用于异步验证真实买家消息是否能触发 Agent 工具链路。你不需要和我实时配合；按本文档一次性从买家侧发送一组带编号的话术，发送完成后告诉我本次运行编号和大概时间窗口，我再检查 WebSocket 接收、队列、Agent audit、工具调用和发送结果。

本文档只写可控测试话术，不记录密码、Cookie、Token、原始 PDD payload、`anti-content`、买家联系方式或真实客户隐私。最终提交的验收记录仍然只能写脱敏摘要。

## 使用方式

1. 选择一个可控买家/测试买家会话，不要使用真实不可控客户会话。
2. 启动桌面应用，确认 `pdd-account-a` / `shop-a` 已登录并处于可接收消息状态。
3. 确认本地 AI 已准备好，并且模型页面的本地推理测试通过。
4. 准备一个运行编号，例如 `AGENT-20260625-01`。
5. 从买家侧按“触发话术”逐条发送。每条消息之间间隔 10 到 20 秒。
6. 发送完成后等待 2 到 5 分钟，让队列和 Agent 完成处理。
7. 如果系统需要人工审核草稿，则在商家端一次性审核/发送对应草稿。
8. 告诉我：运行编号、开始时间、结束时间、是否完成草稿审核。

## 运行信息

- 运行编号：
- 日期：
- 平台：`darwin-arm64` / `win32-x64`
- 应用形态：开发环境 / 安装包
- 账号别名：`pdd-account-a`
- 店铺别名：`shop-a`
- 买家会话：可控测试买家
- 是否启用人工审核：
- 是否完成草稿发送：

## 前置数据

这些条件不满足时，本轮可以执行接收/队列验证，但不能判定 Agent 工具验收通过。

- [ ] `shop-a` 至少有一条 enabled/reviewed 客服知识，覆盖物流、退款、发票或售后政策。
- [ ] `shop-a` 至少有一条 enabled/reviewed 商品知识，且能关联真实 `goods_id`。
- [ ] PDD 商品列表接口能返回真实商品 ID。
- [ ] 如需验证商品卡，目标商品 ID 是真实商品 ID，不是列表序号。
- [ ] 如需验证转人工，店铺存在可转接客服，或能记录“无可用客服/权限不足”的脱敏阻塞原因。

## 触发话术

每条话术都带运行编号和用例编号，方便后续从本地消息、队列和审计记录中定位。括号中的内容可以按店铺实际商品替换，但不要写真实买家隐私。

| 用例 | 目标能力 | 买家侧发送话术 | 预期 Agent 工具 |
| --- | --- | --- | --- |
| A1 | 客服知识检索 | `AGENT-20260625-01 A1 我想问一下这个店铺退货退款怎么处理？` | `search_customer_service_knowledge` |
| A2 | 客服知识检索 | `AGENT-20260625-01 A2 可以开发票吗？物流一般多久发出？` | `search_customer_service_knowledge` |
| B1 | 商品知识检索 | `AGENT-20260625-01 B1 这款商品有什么规格，适合什么人用？` | `get_product_knowledge` |
| B2 | 商品知识检索 | `AGENT-20260625-01 B2 这个商品的成分、材质或者使用方法是什么？` | `get_product_knowledge` |
| C1 | 商品推荐 | `AGENT-20260625-01 C1 我不知道买哪款，你给我推荐一个适合新手的商品。` | `get_shop_products` |
| C2 | 商品卡发送 | `AGENT-20260625-01 C2 如果有合适的商品，请直接发商品卡给我看看。` | `get_shop_products` + `send_goods_link` |
| D1 | 关键词转人工 | `AGENT-20260625-01 D1 转人工，我想找真人客服处理。` | keyword handoff 或 `transfer_conversation` |
| D2 | 意图转人工 | `AGENT-20260625-01 D2 我要投诉，前面的回复解决不了我的问题。` | intent handoff 或 `transfer_conversation` |
| E1 | 知识不足 | `AGENT-20260625-01 E1 请告诉我一个店铺知识库里没有写过的特殊定制规则。` | 不应强行编造；应说明需要人工确认或转人工 |
| F1 | 同买家顺序 | `AGENT-20260625-01 F1 第一条连续消息，请先记住我在比较商品。` | 队列同会话顺序处理 |
| F2 | 同买家顺序 | `AGENT-20260625-01 F2 第二条连续消息，现在帮我推荐更合适的一款。` | 第二条应在第一条处理后进入终态或等待状态 |

如果不方便一次性全部发送，优先发送 `A1`、`B1`、`C1`、`C2`、`D1`、`E1`。这 6 条覆盖真实 Agent 工具验收的核心路径。

## 成功判定

### WebSocket 和消息入库

- [ ] 每条话术都产生一条真实 WebSocket 入站消息。
- [ ] 每条入站消息都写入 `messages`。
- [ ] 消息类型被归一化为 `text`，不是 unsupported。
- [ ] 消息归属到正确的 `shop-a`、`pdd-account-a` 和测试买家会话。

### 队列

- [ ] 每条入站消息都进入 `inbound_queue`。
- [ ] 成功处理的消息进入 `completed`。
- [ ] 失败消息有 retry / dead_letter 记录和脱敏原因。
- [ ] `F1` 和 `F2` 保持同买家顺序。

### Agent 审计

- [ ] 每条进入 Agent 的消息都有 `model` 审计事件。
- [ ] 每条完成回复的消息都有 `final` 审计事件。
- [ ] 需要工具的用例出现工具选择、工具输入、工具结果和最终回复审计。
- [ ] 工具输入不包含跨店铺商品、跨店铺知识或错误账号上下文。
- [ ] 如果审计只有 `model/final`，没有工具事件，则本轮不能判定工具调用验收通过。

### 工具调用

- [ ] `A1` 或 `A2` 调用 `search_customer_service_knowledge`。
- [ ] `B1` 或 `B2` 调用 `get_product_knowledge`。
- [ ] `C1` 调用 `get_shop_products`。
- [ ] `C2` 调用 `get_shop_products` 后使用真实 `goods_id` 调用 `send_goods_link`。
- [ ] `D1` 或 `D2` 进入 handoff，若可用则调用 `transfer_conversation`。
- [ ] `E1` 不编造没有来源的政策或商品结论。

### PDD 结果

- [ ] 普通文本回复能进入 sent 或等待人工审核的可解释状态。
- [ ] 商品卡发送使用真实商品 ID，不能使用 `1`、`2`、`3` 这类列表序号。
- [ ] 转人工成功，或记录“无可用客服/权限不足/接口失败/需重登”等脱敏阻塞原因。
- [ ] 失败不会被包装成成功。

## 结果标注

## 2026-06-25 实际执行记录

时间窗口：`2026-06-25T09:28:57Z` 到 `2026-06-25T09:53:50Z`

本轮使用同一个可控测试买家会话。以下记录只写脱敏状态，不记录原始 PDD payload、买家隐私、Cookie、Token 或 `anti-content`。

### 已确认

- [x] 真实买家消息进入“最近消息流水”，并写入 `messages`。
- [x] 对应入站消息写入 `inbound_queue`。
- [x] 初始失败原因定位为本地 LLM 依赖不可用：`fetch failed` / `dependency_llm_circuit_open...`。
- [x] Gemma 3 4B 多模态 GGUF 主模型和 `mmproj` 文件重新校验通过。
- [x] `llama-server` OpenAI-compatible `/v1/chat/completions` 健康请求通过。
- [x] 新增 `queue.retryDeadLetters` 能将真实死信重排为 `pending`，并由应用主进程正常领取。
- [x] 5 条无外部副作用消息重试后进入 `completed`，并生成 `draft_ready` 草稿。
- [x] 2 条无外部副作用消息在修复 Agent 后产生真实 `tool_call` / `tool_result` / `final` 审计事件。

### 发现并修复的问题

- [x] 队列死信没有正式重试入口。已新增数据库方法、IPC 和队列页面“重试死信”按钮。
- [x] 旧默认本地模型 ID 会残留在 `settings.inference.chatModel`。已统一识别旧 Qwen2.5 / Gemma 3n 默认模型，并在 settings/runtime start 时迁移。
- [x] 当本地模型同时输出 `tool_calls` 和 `final` 时，Agent 曾优先取 `final`，导致工具被跳过。已改为工具调用优先。
- [x] 当本地模型把工具 `input` 写成字符串或数字时，Agent 曾解析为空对象。已按工具名映射到 `query` 或 `goods_id`。
- [x] 当本地模型输出带 ```json 包裹且 `final` 结尾是中文弯引号时，曾把整段 JSON 当成回复。已加保守解析 fallback。

### 当前真实结果

| 能力 | 真实结果 | 备注 |
| --- | --- | --- |
| WebSocket 接收 | Pass | 已进入真实消息流水和本地消息表。 |
| 队列持久化 | Pass | 已进入 `inbound_queue`。 |
| 死信重试 | Pass | 真实死信重试后被主进程领取并完成。 |
| 本地模型推理 | Pass | `llama-server` + Gemma 3 4B 多模态模型健康请求通过。 |
| Agent 工具审计 | Pass | 已观察到 `get_product_knowledge` 和 `get_shop_products` 的 `tool_call` / `tool_result`。 |
| 客服/商品知识命中 | Blocked | 当前店铺没有足够的 enabled/reviewed 知识，工具返回“未找到/无可用知识”。 |
| 商品卡发送 | Not run | 会产生真实 PDD 商品卡发送，需操作者明确确认后执行。 |
| 转人工 | Not run | 会产生真实会话转接，需操作者明确确认后执行。 |
| 草稿发送到买家 | Not run | 当前处于人工审核模式，本轮只确认到 `draft_ready`，没有自动发送文本。 |

### 下一轮建议

1. 先补一条 enabled/reviewed 客服知识和一条绑定真实 `goods_id` 的 enabled/reviewed 商品知识。
2. 再跑 `A1/A2/B1/B2/C1/E1/F1/F2`，确认工具结果能命中知识且回复不编造。
3. 你明确确认后，再单独跑 `C2` 商品卡发送和 `D1/D2` 转人工，避免误触发真实副作用。

### A 客服知识

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

### B 商品知识

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

### C 商品推荐和商品卡

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

### D 转人工

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

### E 知识不足

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

### F 队列顺序

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

## 给 Codex 的核查口令

你发送完成后，只需要告诉我下面这几项：

```text
Agent 工具触发验收已发送
运行编号：AGENT-YYYYMMDD-NN
发送开始时间：
发送结束时间：
已发送用例：A1,A2,B1,B2,C1,C2,D1,D2,E1,F1,F2
是否已人工审核/发送草稿：是/否
异常观察：
```

我后续根据这个时间窗口检查本地 SQLite、队列、Agent audit、PDD 发送状态和日志，不需要你实时配合。

## 判定边界

- 这份脚本使用真实买家侧消息触发真实 WebSocket，因此可以用于真实验收。
- 历史数据库记录可以作为金基准回归，但不能替代当前实时 PDD 验收。
- 如果某条消息需要你后续人工点“发送草稿”，则该条在点击前只能判定到 draft/Agent 阶段，不能判定 PDD 真实发送通过。
- 如果 PDD 风控、账号离线、会话过期、无可用客服或商品接口权限不足导致失败，应记录为 Blocked 或 endpoint/account failure，而不是用 Mock 替代。
