# 真实功能验收表

本文档用于逐项标注剩余 OpenSpec 任务。不要记录密码、Cookie、Token、API Key、原始买家消息、买家联系方式、原始 PDD payload 或 `anti-content`。

## 使用方式

每项只填脱敏结果：

- `Pass`：所有成功框都满足，并有脱敏证据。
- `Fail`：执行了但结果不符合预期。
- `Blocked`：缺真实账号、买家路径、模型、平台、权限或外部发布条件。

## 运行信息

- Commit SHA：
- App 版本 / Tag：
- 平台：
- 包形态：开发 / macOS 包 / Windows 包
- 操作人：
- 时间：
- 账号别名：
- 店铺别名：

## 剩余任务总览

当前剩余 `32` 项。

| 任务 | 类型 | 结果 |
| --- | --- | --- |
| 4.4 文本/图片发送治理 | 实现 + 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 4.8 PDD 核心链路 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 5.6 连接恢复 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 6.8 队列并发 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 7.6 商品知识审核治理 | 实现 + UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 7.8 商品同步与多模态抽取 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 8.7 Agent 真实验收 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.4 本地运行时生命周期 | 实现 + 本地验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.6 本地 Responses endpoint 接入 | 实现 + 本地验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.8 macOS/Windows 包 smoke | CI/包验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.9 本地模型验收记录 | 真实验收记录 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.11 本地 runtime 候选验证 | 本地探针 | [ ] Pass [ ] Fail [ ] Blocked |
| 8A.12 runtime 决策记录 | 文档/证据 | [ ] Pass [ ] Fail [ ] Blocked |
| 9.1 关键词规则配置 | 实现 + UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 9.2 Agent 意图转人工 | 实现 + 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 9.5 转人工失败 takeover | 实现 + 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 9.6 人工处理状态 | 实现 + UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 9.7 转人工总验收 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 10.1 多店铺隔离 | 实现 + 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 10.4 店铺/账号选择器 | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 10.5 单账号失败隔离 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.2 人工工作台 | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.3 Agent 审计视图 | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.4 商品同步审核 UI | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.5 知识治理 UI | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.7 全页面标准状态 | UI 验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 11.8 macOS/Windows 交互验收 | 包验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 13.5 release-blocking 记录 | 证据汇总 | [ ] Pass [ ] Fail [ ] Blocked |
| 14.7 tagged release 演练 | GitHub Release | [x] Pass [ ] Fail [ ] Blocked |
| 15.4 最终参考对照 | 代码/文档审计 | [ ] Pass [ ] Fail [ ] Blocked |
| 15.5 最终打包真实验收 | 真实验收 | [ ] Pass [ ] Fail [ ] Blocked |
| 15.6 readiness 总结 | 文档 | [ ] Pass [ ] Fail [ ] Blocked |

## 4.4 文本/图片发送治理

步骤：

1. 从真实买家会话生成一条文本回复。
2. 发送文本。
3. 如当前账号支持图片发送，用真实图片 URL 执行图片发送。
4. 断网或制造一次可恢复失败，观察 retry 和最终状态。

成功框：

- [ ] 文本发送成功，message/draft 进入 sent。
- [ ] 失败时记录脱敏错误。
- [ ] retry 不重复发送已成功消息。
- [ ] 图片发送成功，或明确记录当前账号/接口不支持。

## 4.8 PDD 核心链路

步骤：

1. 登录 `pdd-account-a`。
2. 启动账号并进入 online/running。
3. 接收真实买家消息。
4. 发送文本回复。
5. 发送真实商品卡。
6. 同步商品列表和商品详情。
7. 获取客服列表并转接一次。
8. 停止账号。

成功框：

- [ ] 登录、启动、接收、发送、商品、转接、停止都有脱敏记录。
- [ ] 商品卡使用真实 goods ID。
- [ ] 没有 Mock PDD 或 fixture 证据。

## 5.6 连接恢复

步骤：

1. 启动账号。
2. 观察心跳和重连状态。
3. 制造可恢复断连。
4. 恢复网络。
5. 如出现 relogin-required，完成重新登录。

成功框：

- [ ] 自动重连次数和原因可见。
- [ ] 可恢复断连恢复成功。
- [ ] 需重登时停止自动恢复并提示人工动作。

## 6.8 队列并发

步骤：

1. 同一买家连续发两条消息。
2. 不同买家发一条消息。
3. 暂停队列，再恢复队列。
4. 观察失败重试或 dead-letter。

成功框：

- [ ] 同买家顺序处理。
- [ ] 不同买家可并发处理。
- [ ] pause/resume 生效。
- [ ] retry/dead-letter 和依赖健康可见。

## 7.6 / 7.8 商品知识治理和抽取

步骤：

1. 运行商品同步。
2. 用本地 vision-capable 模型抽取商品知识。
3. 查看 diff。
4. approve 一条结果。
5. disable 或 rollback 一条结果。

成功框：

- [ ] 商品来源是 PDD 真实商品。
- [ ] 多模态抽取使用本地模型，无远端 fallback。
- [ ] 审核、diff、approve、disable、rollback 可见。
- [ ] Agent 只使用 reviewed/enabled 知识。

## 8.7 Agent 真实验收

步骤：

1. 买家问具体商品问题。
2. 买家问售后/物流/退款政策。
3. 买家要求推荐并发送商品卡。
4. 买家要求人工。
5. 买家问知识库无法回答的问题。

成功框：

- [ ] 商品问题调用 `get_product_knowledge`。
- [ ] 政策问题调用 `search_customer_service_knowledge`。
- [ ] 推荐路径先获得商品列表，再调用 `send_goods_link`。
- [ ] 转人工路径调用 `transfer_conversation` 或进入 takeover。
- [ ] 知识不足时不编造。

## 8A.4 / 8A.6 / 8A.8 / 8A.9 / 8A.11 / 8A.12 本地模型运行时

步骤：

1. 选择本地模型模式。
2. 准备本地运行时和模型。
3. 运行 `pnpm local-model:probe -- --model <model-id> --image <product-image>`。
4. 运行 macOS packaged smoke。
5. 在 Windows 包重复 smoke。
6. 记录 runtime 决策和不支持能力。

成功框：

- [ ] chat_text pass。
- [ ] native tool_call pass。
- [ ] tool_result_roundtrip pass。
- [ ] vision pass，或缺图片时 blocked。
- [ ] Agent/memory/embedding 使用同一个托管 endpoint。
- [ ] macOS/Windows 包内启动可用。
- [ ] runtime 决策记录清楚说明保留或替换 `llama-server`。

## 9.1 / 9.2 / 9.5 / 9.6 / 9.7 人工转接

步骤：

1. 配置关键词规则。
2. 发送命中关键词的买家消息。
3. 发送需要人工判断的买家消息。
4. 执行真实转接。
5. 制造转接失败。
6. 标注人工处理中，随后恢复 AI。

成功框：

- [ ] 关键词规则可增删改导入。
- [ ] 关键词优先于 AI。
- [ ] Agent 意图可触发转人工。
- [ ] 转接失败后 AI 停止自动回复。
- [ ] resume-AI 后恢复处理。

## 10.1 / 10.4 / 10.5 多店铺

步骤：

1. 登录两个账号或两个店铺。
2. 切换当前店铺。
3. 分别接收消息、同步商品、检索知识。
4. 让其中一个账号进入错误状态。

成功框：

- [ ] UI 明确显示当前 account/shop。
- [ ] 消息、商品、知识、审计不会串店。
- [ ] 一个账号失败不影响另一个账号。

## 11.2 / 11.3 / 11.4 / 11.5 / 11.7 / 11.8 UI

步骤：

1. 打开人工工作台。
2. 打开 Agent 审计。
3. 打开商品同步审核。
4. 打开知识治理。
5. 检查 loading/empty/error/retry/success。
6. 在 macOS 和 Windows 包中重复。

成功框：

- [ ] 每个页面不是占位 UI。
- [ ] 敏感信息被脱敏。
- [ ] 错误可恢复。
- [ ] 键盘焦点和按钮状态可用。

## 13.5 / 14.7 / 15.4 / 15.5 / 15.6 发布收口

步骤：

1. 汇总所有 release-blocking acceptance records。
2. 运行 release gate。
3. 打 tag 做 dry run。
4. 运行真实 GitHub Release。
5. 对照参考 README 和核心代码路径。
6. 更新 readiness 总结。

成功框：

- [x] acceptance records 覆盖当前 commit/tag。
- [x] GitHub Release 产物包含 macOS 和 Windows。
- [x] release gate 不接受 stale evidence。
- [x] 最终总结列出 Pass/Blocked/残余范围。
