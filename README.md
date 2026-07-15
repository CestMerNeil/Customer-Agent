<p align="center">
  <img src="apps/desktop/build/icon.png" width="112" alt="拼多多 AI 客服助手图标">
</p>

<h1 align="center">拼多多 AI 客服助手</h1>

<p align="center">把真实店铺消息、商品知识、AI 回复与人工接管放进一个桌面工作台。</p>

<p align="center">
  <a href="https://github.com/CestMerNeil/Customer-Agent/releases/latest">下载最新版本</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#参与开发">参与开发</a>
</p>

拼多多 AI 客服助手是一款面向拼多多商家和客服团队的桌面应用。它连接真实客服账号，集中处理消息队列，让 AI 基于已审核的商品与客服知识生成回复，并在需要时转交人工处理。

## 核心能力

- **真实店铺接待**：登录并管理多个拼多多客服账号，接收消息并跟踪连接状态。
- **AI 辅助回复**：使用本地模型或兼容的云端 AI，结合多轮上下文生成可追溯回复。
- **商品与知识库**：同步真实商品信息，审核后再提供给 AI 检索和推荐。
- **人工接管**：按关键词、AI 意图或营业时间转人工，并支持恢复 AI 处理。
- **可观测的工作台**：查看消息队列、处理记录、失败重试、账号健康和发布状态。
- **多店铺隔离**：按账号和店铺隔离会话、商品、知识、队列与审计记录。

## 快速开始

1. 从 [GitHub Releases](https://github.com/CestMerNeil/Customer-Agent/releases/latest) 下载适合当前系统的安装包。
2. 在「账号」中添加并登录拼多多客服账号。
3. 在「模型」中启用本地模型，或配置兼容的云端 AI 服务。
4. 在「知识库」中同步商品、补充客服资料并审核可用内容。
5. 启动账号，在「概览」「队列」和「人工」页面开始处理消息。

账号会话、业务数据和模型配置由桌面应用在本机管理。发布版本不会在 CI 中登录拼多多，项目只使用与提交版本绑定、经过脱敏的真实验收记录证明关键业务能力。

> 本项目不是拼多多官方产品。使用真实商家账号前，请确认你的账号权限和平台规则。

---

## 参与开发

项目采用 Electron + TypeScript，并使用 pnpm workspace 管理桌面应用和核心包。

### 本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev
```

### 本地检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @customer-agent/desktop smoke:runtime
```

拼多多、LLM、Agent、知识检索、商品同步、转人工、队列和发布等关键业务能力不能由 Mock 证明完成。请使用脱敏的真实验收记录和当前 OpenSpec change：

```bash
pnpm exec openspec status --change implement-reference-feature-parity
pnpm exec openspec validate implement-reference-feature-parity --strict
pnpm acceptance:generate -- --commit <sha> --out acceptance/skeleton.json
pnpm acceptance:validate -- --file acceptance/skeleton.json --commit <sha>
pnpm pdd:calibration:template -- --commit <sha> --out calibration/<sha>.json
pnpm pdd:calibration:validate -- --file calibration/<sha>.json --commit <sha>
pnpm pdd:calibration:summarize -- --file calibration/<sha>.json --out calibration-summary/<sha>.json
```

## Release acceptance workflow

Real-data validation cannot run at release time (CI has no real merchant
accounts or buyers), so the gate verifies **proof of prior real usage** of the
release-candidate build instead:

1. Freeze code, build the RC from the release commit. All automated checks
   (lint, typecheck, tests, smoke) must be green.
2. An operator runs the RC against real merchant accounts as normal daily
   usage. The app automatically records Agent model/tool events and a separate
   `pdd_send_success` event only after the governed PDD text send succeeds.
3. Derive sanitized evidence from that audit trail:

   ```bash
   pnpm acceptance:from-audit -- --commit <sha> --shop-a <realShopId> --shop-b <realShopId> \
     --version <x.y.z> --tag v<x.y.z> --out openspec/changes/implement-reference-feature-parity/acceptance/release-v<x.y.z>-<platform>-<shortsha>.json
   ```

   The command locates the normal desktop database automatically; use `--db`
   only for a copied or non-standard data directory. It adds factual summaries
   but keeps every generated record `blocked` with `actor: generated`.
4. Review each generated summary against the real run. Only after the full
   capability passes, change it to `outcome: pass`, set `actor: operator`,
   remove its blocker, and complete the platform capabilities (local runtime,
   operations workspace, release gates, and secret safety). Then run
   `pnpm acceptance:validate` and commit; generated-only evidence cannot pass
   the release gate.
5. Tag the release. `scripts/release-gate.mjs` in `build-desktop.yml` verifies
   that the accepted commit is an ancestor of the release commit and that only
   non-functional paths changed in between.

The source-checkout 发布 page reflects committed acceptance evidence available
in that checkout. Packaged applications intentionally exclude post-acceptance
evidence from their application inputs, so CI and `pnpm release:gate` remain the
authoritative release verdict.

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, typecheck, tests, build, and runtime smoke on pull requests and pushes to `main`/`master`.
- `.github/workflows/build-desktop.yml` builds macOS and Windows desktop artifacts on `v*` tags or manual workflow dispatch.

Desktop artifacts are uploaded from `apps/desktop/release/`.
