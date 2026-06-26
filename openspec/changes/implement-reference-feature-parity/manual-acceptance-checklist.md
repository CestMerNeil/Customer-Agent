# 人工验收标注清单

本文档用于你在真实拼多多、本地模型、桌面安装包和 GitHub Release 验收过程中做标注。这里不能记录任何密码、Cookie、Token、原始买家消息、买家联系方式、原始 PDD payload、`anti-content` 或 LLM API Key。

## 标注规则

- 只使用别名，例如 `pdd-account-a`、`pdd-account-b`、`shop-a`、`shop-b`。
- 消息类证据只记录数量、状态、时间和脱敏摘要。
- 如果某一步无法执行，勾选 `Blocked`，并写明阻塞原因。
- 每个任务只有在“成功判定”里的所有必需框都勾选后，才算通过。
- 可以在“记录”里写观察结果，但不要写原始买家文本或敏感字段。

## 本次运行信息

- Commit SHA：
- App 版本 / Tag：Commit0683082172e56f5d79d5df76df52df0427973132
- 平台：`darwin-arm64`
- 包形态：开发环境
- 操作人：Neil
- 开始时间：2026-06-25 11:46
- 结束时间：
- 本次使用账号：
  - [x] `pdd-account-a` / `shop-a`
  - [ ] `pdd-account-b` / `shop-b`

## 预检

步骤：

1. 启动本次要验收的 App。
2. 打开 `模型`，如果本次验收需要 LLM，先准备本地 AI。
3. 打开 `账号`，确认需要的 PDD 账号已经登录。
4. 打开 `发布`，记录本次 Release Gate 预期是通过还是失败。

成功判定：

- [x] App 可以正常打开，没有崩溃。
- [x] 日志和 UI 中没有出现密钥、Cookie、Token、买家隐私等敏感内容。
- [x] 本次需要的账号别名可用。
- [x] 本次需要的模型/运行时状态可见。

结果：

- [x] Pass
- [ ] Fail
- [ ] Blocked

记录：

-
发布的Release Gate显示未通过
阻塞原因：
Commit0683082172e56f5d79d5df76df52df0427973132
Platformdarwin-arm64
Tag未指定
-

## 任务 A：真实 PDD 核心链路

对应 OpenSpec 任务：`4.8`

对应 release-blocking capability：`pdd-real-merchant-operations`

目标：用真实账号验证 PDD 登录、会话、启动、接收、发送、商品、转接、停止链路。

步骤：

1. 在 `账号` 页面登录 `pdd-account-a`。
2. 确认账号显示为 `shop-a`。
3. 点击 `启动`。
4. 发送或接收一条真实买家/测试买家文本消息。
5. 确认消息出现在 `审核工作台` 或 `队列`。
6. 生成回复，并通过人工审核路径发送。
7. 如果有可用真实商品 ID，发送一张商品卡。
8. 通过商品同步或校准动作获取商品列表/商品详情。
9. 获取可转接客服列表。
10. 如果存在可用客服，执行一次会话转接。
11. 点击 `停止`。
12. 对 `pdd-account-b` / `shop-b` 重复可执行步骤。

成功判定：

- [x] 登录完成，本地只保存加密会话材料。
- [x] 启动账号后获取真实 chat token，并进入 running/online 状态。
- [x] 真实买家/测试消息被接收并归一化。
- [x] 文本发送成功，本地 draft/message 进入 sent 状态。
- [ ] 商品卡发送使用真实 goods ID，不使用列表序号。
- [] 商品列表返回真实商品 ID。
- [ ] 商品详情返回解析后的 source metadata，或记录脱敏阻塞原因。
- [ ] 客服列表获取成功，或记录脱敏阻塞原因。
- [ ] 转接成功，或记录 endpoint/account 的脱敏阻塞原因。
- [ ] 停止账号后进入 stopped/offline 状态。

结果：

- [ ] Pass
- [ ] Fail
- [x] Blocked

记录：
登陆过程中出现BUG，并且并没有内置浏览器，目前仍然使用外置的浏览器打开。
browserType.launchPersistentContext: Opening in existing browser session. This usually means that the profile is already in use by another instance of Chromium. Call log: [2m - <launching> /Users/neil/Code/Customer-Agent_1/apps/desktop/build/playwright-browsers/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --no-sandbox --disable-gpu --no-sandbox --disable-dev-shm-usage --disable-blink-features=AutomationControlled --disable-notifications --user-data-dir=/Users/neil/Library/Application Support/@customer-agent/desktop/pdd-profiles/__111111 --remote-debugging-pipe about:blank[22m [2m - <launched> pid=1069[22m [2m - [pid=1069][out] Opening in existing browser session.[22m [2m - [pid=1069] <gracefully close start>[22m [2m - [pid=1069] <kill>[22m [2m - [pid=1069] <will force kill>[22m [2m - [pid=1069] exception while trying to kill process: Error: kill EPERM[22m [2m - [pid=1069] <process did exit: exitCode=0, signal=null>[22m [2m - [pid=1069] starting temporary directories clean


不能切换账号状态，因此每次都会自动转接到别的客服上。


unknown:websocket_closed


阻塞原因：

-

## 任务 B：连接恢复与重新登录

对应 OpenSpec 任务：`5.6`

对应 release-blocking capability：`pdd-real-merchant-operations`

目标：验证真实 PDD 连接异常、恢复、会话过期和重新登录路径。

步骤：

1. 启动一个已登录 PDD 账号。
2. 在 `账号` 页面观察连接状态、重连次数、心跳和建议动作。
3. 如果安全可控，触发一次可恢复的网络中断。
4. 恢复网络，等待自动重连。
5. 如果能观察到 session-expiry / relogin-required，记录该状态。
6. 通过 App 完成重新登录。

成功判定：

- [ ] 可恢复断连进入 reconnecting/error 状态，并显示脱敏原因。
- [ ] 重连次数增加。
- [ ] 网络恢复后账号能恢复，不影响其他账号。
- [ ] relogin-required 会停止自动恢复，并显示需要人工动作。
- [ ] 重新登录刷新加密会话，并清除旧错误状态。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 C：真实队列与并发

对应 OpenSpec 任务：`6.8`

对应 release-blocking capability：`message-queue-concurrency`

目标：验证真实入站消息进入持久化队列，并能观察顺序、重试和依赖健康。

步骤：

1. 打开 `队列` 页面。
2. 启动至少一个 PDD 账号。
3. 从同一个买家/测试会话发送两条消息。
4. 如果可用，从另一个买家/测试会话发送一条消息。
5. 观察队列状态变化。
6. 点击暂停队列，再点击恢复队列。
7. 如果真实下游故障发生，记录 retry / dead-letter 行为。

成功判定：

- [ ] 真实入站消息创建队列记录。
- [ ] 同一买家的消息保持顺序。
- [ ] 不同买家会话可独立处理。
- [ ] 暂停后不再处理新任务。
- [ ] 恢复后继续处理 eligible 任务。
- [ ] 队列页显示 depth、retry、failure、latency 和 dependency health。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 D：商品同步与本地多模态抽取

对应 OpenSpec 任务：`7.8`

依赖实现任务：`7.5`、`7.6`、`8A.1`、`8A.7`

对应 release-blocking capability：`knowledge-product-governance`

目标：验证真实店铺商品同步，以及本地多模态模型对商品图片的结构化抽取。

前置条件：

- [ ] 已存在审核通过的本地多模态模型档案。
- [ ] 选择的模型档案明确声明支持图片/vision。
- [ ] 系统没有远端多模态 fallback。

步骤：

1. 打开 `模型` 页面。
2. 选择已审核的本地多模态模型档案。
3. 下载并准备该模型。
4. 打开商品同步/抽取审核界面。
5. 对 `shop-a` 执行商品同步。
6. 对商品图片执行本地多模态抽取。
7. 审核结构化字段、卖点、使用说明和 FAQ。
8. 通过一条抽取结果。
9. 禁用或回滚一条结果，确认治理能力。

成功判定：

- [ ] 商品同步获取真实商品和详情。
- [ ] 图片抽取只使用本地 vision-capable 模型。
- [ ] 如果模型不支持图片，系统明确阻断抽取。
- [ ] 抽取结果保存为 governed product knowledge。
- [ ] 商家审核、通过、禁用、回滚可见。
- [ ] Agent 只使用 reviewed/enabled 商品知识。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 E：真实 Agent 验收

对应 OpenSpec 任务：`8.7`

对应 release-blocking capability：`auditable-agent-workflow`

目标：验证真实 Agent 可以处理商品问题、政策问题、商品推荐、转人工和知识不足路径。

步骤：

1. 准备本地 AI 或已选择的 OpenAI-compatible endpoint。
2. 确保 `shop-a` 有 reviewed 的商品知识和客服知识。
3. 发送一条真实商品问题。
4. 发送一条真实政策/客服问题。
5. 让买家请求商品推荐，并发送商品卡。
6. 触发转人工意图。
7. 询问一条知识不足的问题。
8. 打开 `Agent 审计`。

成功判定：

- [ ] 商品问题调用 `get_product_knowledge` 或 `get_shop_products`。
- [ ] 政策问题调用 `search_customer_service_knowledge`。
- [ ] 推荐路径发送真实商品卡，或记录脱敏阻塞原因。
- [ ] 转人工路径调用真实 transfer，或记录脱敏阻塞原因。
- [ ] 知识不足路径不会假装确定。
- [ ] Agent 审计展示工具路径、脱敏结果、引用和最终理由。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 F：本地模型运行时验收

对应 OpenSpec 任务：`8A.9`

对应 release-blocking capability：`local-model-runtime-provisioning`

目标：验证用户不需要手动安装第三方 LLM 工具，App 可以自行管理本地运行时和模型。

步骤：

1. 如有条件，使用干净的模型缓存目录。
2. 打开 `模型` 页面。
3. 选择默认本地模型档案。
4. 点击 `下载模型`。
5. 观察下载进度。
6. 点击 `准备本地 AI`。
7. 点击 `测试连接`。
8. 在 App 内生成一条 AI 草稿。

成功判定：

- [ ] 用户没有手动安装 Ollama、LM Studio、`llama-server` 等外部工具。
- [ ] 下载进度可见。
- [ ] 重启后缓存可复用。
- [ ] checksum 校验通过。
- [ ] runtime health 通过。
- [ ] 草稿生成使用 app-managed local endpoint。
- [ ] 记录包含 runtime 名称/版本（如可用）、模型 manifest、平台、commit SHA 和 health-check 结果。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 G：人工接管验收

对应 OpenSpec 任务：`9.7`

依赖实现任务：`9.1`、`9.2`、`9.5`、`9.6`

目标：验证关键词、意图、营业时间外、转接成功/失败、恢复 AI 的完整人工接管行为。

步骤：

1. 为 `shop-a` 配置转人工关键词。
2. 配置一条意图转人工规则。
3. 发送包含关键词的真实消息。
4. 发送命中意图规则的真实消息。
5. 在配置的营业时间外发送真实消息。
6. 转接给可用客服。
7. 在无可用客服或 endpoint 阻塞时执行转接。
8. 添加一条人工处理备注。
9. 对该会话执行恢复 AI。

成功判定：

- [ ] 关键词转人工优先于 AI 回复。
- [ ] 意图转人工有可解释原因。
- [ ] 营业时间外不会自动发送 AI 回复。
- [ ] 转接成功被记录。
- [ ] 转接失败会停止 AI 自动回复并记录阻塞原因。
- [ ] 人工 owner/state/notes 可见。
- [ ] 恢复 AI 动作有审计记录，并重新允许 eligible AI 处理。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 H：多店铺隔离验收

对应 OpenSpec 任务：`10.5`

对应 release-blocking capability：`multi-shop-operations`

目标：验证一个店铺/账号失败不会污染或停止另一个店铺/账号。

步骤：

1. 登录并启动 `pdd-account-a` / `shop-a`。
2. 登录并启动 `pdd-account-b` / `shop-b`。
3. 两个店铺各处理一条真实消息。
4. 只对其中一个账号触发或观察受控失败。
5. 继续观察另一个账号是否可运行。
6. 检查队列、Agent 审计、知识、商品和发布状态是否按店铺/账号隔离。

成功判定：

- [ ] 每个账号可以独立启动/停止。
- [ ] 一个账号失败不会停止另一个账号。
- [ ] 队列记录按 shop/account 隔离。
- [ ] Agent memory/audit 按 shop/account/buyer 隔离。
- [ ] 商品推荐不能跨店铺。
- [ ] acceptance evidence 不能复用于无关店铺/账号。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 I：桌面 UI 安装包验收

对应 OpenSpec 任务：`11.8`

对应 release-blocking capability：`desktop-operations-workspace`

目标：在 macOS 和 Windows 安装包里验收所有生产 UI 表面。

需要检查的页面：

- [ ] 审核工作台
- [ ] 概览
- [ ] 队列
- [ ] Agent 审计
- [ ] 账号
- [ ] 知识库
- [ ] 模型
- [ ] 日志
- [ ] 发布
- [ ] 设置
- [ ] 人工接管工作台，待实现后检查
- [ ] 商品抽取审核 UI，待实现后检查
- [ ] 治理知识库 UI，待实现后检查

每个页面的成功判定：

- [ ] loading 状态可见。
- [ ] empty 状态可理解。
- [ ] error 状态已脱敏。
- [ ] 可重试/刷新。
- [ ] 成功状态可见。
- [ ] 破坏性动作需要确认。
- [ ] 键盘焦点可用。
- [ ] 桌面窗口尺寸下没有文字或控件重叠。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 J：GitHub Release Dry Run 与正式发布

对应 OpenSpec 任务：`14.7`

对应 release-blocking capability：`real-acceptance-release-gates`

目标：验证 GitHub Actions 可以完成 macOS/Windows 构建，并通过 GitHub Releases 发布。

步骤：

1. 确认目标 commit/tag 的 acceptance records 已提交。
2. 推送分支或 tag。
3. 运行 GitHub Actions release workflow。
4. 确认 release gate 校验 commit/tag/platform evidence。
5. 确认 macOS artifact 构建并上传。
6. 确认 Windows artifact 构建并上传。
7. 确认 checksums 生成。
8. 确认 GitHub Release 包含 artifacts 和 metadata。

成功判定：

- [ ] 缺失或过期 evidence 时 Release Gate 失败。
- [ ] 只有当前 commit/tag evidence 齐全时 Release Gate 通过。
- [ ] macOS artifact 已上传。
- [ ] Windows artifact 已上传。
- [ ] checksums 已附加。
- [ ] GitHub Release 是正式分发渠道。
- [ ] CI 不使用 PDD 凭据或原始 session material。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## 任务 K：最终安装包商家验收

对应 OpenSpec 任务：`15.5`

目标：在 macOS 和 Windows 安装包上重复最终商家验收。

步骤：

1. 安装并打开 macOS artifact。
2. 在 macOS 上执行任务 A 到 J 中适用的部分。
3. 安装并打开 Windows artifact。
4. 在 Windows 上执行任务 A 到 J 中适用的部分。
5. 为每个 release-blocking capability 记录脱敏 acceptance evidence。
6. 对最终 commit/tag 运行 release gate。

成功判定：

- [ ] macOS 安装包完成必要商家验收。
- [ ] Windows 安装包完成必要商家验收。
- [ ] 所有 release-blocking capabilities 都有 required scope 的 passing evidence。
- [ ] `pnpm release:gate -- --commit <sha> --platform <platform> --tag <tag>` 通过。
- [ ] 残留 blocked / out-of-scope 项已记录。

结果：

- [ ] Pass
- [ ] Fail
- [ ] Blocked

记录：

-

阻塞原因：

-

## Acceptance Record 模板

任务通过后，把脱敏记录整理成下面的 JSON 形状，存放到：

`openspec/changes/implement-reference-feature-parity/acceptance/`

字段名必须保持英文，因为 release gate 会读取这些字段。

```json
[
  {
    "capability": "pdd-real-merchant-operations",
    "commitSha": "<commit-sha>",
    "tag": "<tag-if-release>",
    "platform": "darwin-arm64",
    "accountAlias": "pdd-account-a",
    "shopAlias": "shop-a",
    "outcome": "pass",
    "actor": "operator",
    "acceptedAt": "2026-06-25T00:00:00Z",
    "evidenceSummary": "只写脱敏摘要，例如数量、状态和高层结果。",
    "notes": "不要写密钥、原始买家文本或原始 payload。"
  }
]
```

## 验证命令

```bash
pnpm security:leak-scan
pnpm exec openspec validate implement-reference-feature-parity --strict
pnpm release:gate -- --commit <commit-sha> --platform <darwin-arm64|win32-x64> --tag <tag>
```
