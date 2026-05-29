# Electron TypeScript Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the TypeScript monorepo foundation for the Electron rewrite without touching the existing Python runtime.

**Architecture:** Add a new pnpm workspace with `apps/desktop` for Electron + Vite + React and `packages/core` for shared domain contracts. The first worker-facing boundaries are typed but stubbed so later PDD, LangChain, LanceDB, Drizzle, and vLLM plans can build on stable interfaces.

**Tech Stack:** pnpm workspaces, TypeScript, Vite, React, Electron, Vitest, ESLint, Prettier.

---

## Scope Check

The approved design covers several independent subsystems: desktop shell, PDD automation, LangChain agent workflows, vLLM management, ModelScope model resolution, SQLite/Drizzle, LanceDB knowledge retrieval, and M3 UI. This plan intentionally implements only the foundation:

- workspace/package structure
- desktop shell scaffold
- typed IPC boundary
- shared core contracts
- baseline checks

Separate follow-up plans should implement:

- PDD Playwright + WebSocket adapter
- LangChain.js reply workflow
- LanceDB knowledge base
- SQLite + Drizzle data layer
- vLLM + ModelScope inference manager
- M3 UI screens

## File Structure

Create:

- `package.json` - root scripts and dev dependencies.
- `pnpm-workspace.yaml` - workspace package globs.
- `tsconfig.base.json` - shared TypeScript settings.
- `eslint.config.mjs` - root ESLint flat config.
- `.prettierrc.json` - formatter defaults.
- `apps/desktop/package.json` - desktop app package.
- `apps/desktop/index.html` - Vite HTML entry.
- `apps/desktop/vite.renderer.config.ts` - renderer Vite config.
- `apps/desktop/tsconfig.json` - desktop TypeScript project references.
- `apps/desktop/src/main/index.ts` - Electron main process.
- `apps/desktop/src/preload/index.ts` - typed preload bridge.
- `apps/desktop/src/renderer/main.tsx` - React entry.
- `apps/desktop/src/renderer/App.tsx` - initial M3-style application shell.
- `apps/desktop/src/renderer/App.test.tsx` - renderer smoke test.
- `apps/desktop/src/worker/index.ts` - worker process entry stub.
- `packages/core/package.json` - shared contracts package.
- `packages/core/tsconfig.json` - core TypeScript config.
- `packages/core/vitest.config.ts` - core test config.
- `packages/core/src/context.ts` - customer-service context types.
- `packages/core/src/reply.ts` - reply and reply-mode types.
- `packages/core/src/message-state.ts` - message state machine helpers.
- `packages/core/src/ipc.ts` - typed IPC contracts.
- `packages/core/src/index.ts` - public exports.
- `packages/core/src/message-state.test.ts` - state transition tests.

Modify:

- `.gitignore` - add Node/Electron build artifacts if missing.

Do not move or delete existing Python files in this phase.

---

### Task 1: Root TypeScript Workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create root package manifest**

Create `package.json`:

```json
{
  "name": "customer-agent-workspace",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "pnpm --filter @customer-agent/desktop dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.18.0",
    "@types/node": "^22.10.7",
    "eslint": "^9.18.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create workspace definition**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@customer-agent/core": ["packages/core/src/index.ts"]
    }
  }
}
```

- [ ] **Step 4: Create ESLint config**

Create `eslint.config.mjs`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".venv/**",
      "logs/**",
      "user_data/**",
      ".superpowers/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ]
    }
  }
];
```

- [ ] **Step 5: Create Prettier config**

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 6: Add Node/Electron ignores**

Append these lines to `.gitignore` if they are not already present:

```gitignore
node_modules/
dist/
out/
.vite/
coverage/
*.tsbuildinfo
```

- [ ] **Step 7: Install workspace dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and install exits with code 0.

- [ ] **Step 8: Commit root workspace**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc.json .gitignore pnpm-lock.yaml
git commit -m "build: add typescript workspace foundation"
```

---

### Task 2: Core Domain Contracts

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/context.ts`
- Create: `packages/core/src/reply.ts`
- Create: `packages/core/src/message-state.ts`
- Create: `packages/core/src/ipc.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/message-state.test.ts`

- [ ] **Step 1: Create core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@customer-agent/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create core TypeScript config**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create core Vitest config**

Create `packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Write failing state transition tests**

Create `packages/core/src/message-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canTransitionMessageState } from "./message-state";

describe("canTransitionMessageState", () => {
  it("allows automatic reply progression", () => {
    expect(canTransitionMessageState("received", "generating")).toBe(true);
    expect(canTransitionMessageState("generating", "sent")).toBe(true);
  });

  it("allows human review progression", () => {
    expect(canTransitionMessageState("generating", "draft_ready")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "sent")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "ignored")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "escalated")).toBe(true);
  });

  it("rejects impossible transitions", () => {
    expect(canTransitionMessageState("received", "sent")).toBe(false);
    expect(canTransitionMessageState("sent", "generating")).toBe(false);
    expect(canTransitionMessageState("ignored", "sent")).toBe(false);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run:

```bash
pnpm --filter @customer-agent/core test
```

Expected: FAIL because `packages/core/src/message-state.ts` does not exist.

- [ ] **Step 6: Create context contracts**

Create `packages/core/src/context.ts`:

```ts
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
```

- [ ] **Step 7: Create reply contracts**

Create `packages/core/src/reply.ts`:

```ts
export type ReplyMode = "automatic" | "human_review";

export type ReplyAction = "send" | "review" | "escalate" | "fallback";

export interface KnowledgeSourceReference {
  scope: "global" | "shop";
  documentId: string;
  chunkId: string;
  score: number;
}

export interface GeneratedReply {
  text: string;
  action: ReplyAction;
  sources: KnowledgeSourceReference[];
  answerable: boolean;
  createdAt: string;
}
```

- [ ] **Step 8: Create message state helper**

Create `packages/core/src/message-state.ts`:

```ts
export type MessageState =
  | "received"
  | "generating"
  | "draft_ready"
  | "sent"
  | "failed"
  | "ignored"
  | "escalated";

const allowedTransitions: Record<MessageState, readonly MessageState[]> = {
  received: ["generating", "ignored", "escalated"],
  generating: ["draft_ready", "sent", "failed"],
  draft_ready: ["sent", "ignored", "escalated", "failed"],
  sent: [],
  failed: ["generating", "ignored", "escalated"],
  ignored: [],
  escalated: []
};

export function canTransitionMessageState(from: MessageState, to: MessageState): boolean {
  return allowedTransitions[from].includes(to);
}
```

- [ ] **Step 9: Create IPC contracts**

Create `packages/core/src/ipc.ts`:

```ts
import type { CustomerServiceContext } from "./context";
import type { GeneratedReply, ReplyMode } from "./reply";

export interface AccountLoginRequest {
  username: string;
  password?: string;
  channel: "pinduoduo";
}

export interface AccountLoginResult {
  ok: boolean;
  accountId?: string;
  shopId?: string;
  error?: string;
}

export interface GenerateReplyRequest {
  context: CustomerServiceContext;
  mode: ReplyMode;
}

export interface GenerateReplyResult {
  ok: boolean;
  reply?: GeneratedReply;
  error?: string;
}

export interface IpcContract {
  "account.login": {
    request: AccountLoginRequest;
    response: AccountLoginResult;
  };
  "reply.generate": {
    request: GenerateReplyRequest;
    response: GenerateReplyResult;
  };
  "app.health": {
    request: undefined;
    response: { ok: boolean; worker: "starting" | "ready" | "stopped" | "error" };
  };
}

export type IpcChannel = keyof IpcContract;
export type IpcRequest<TChannel extends IpcChannel> = IpcContract[TChannel]["request"];
export type IpcResponse<TChannel extends IpcChannel> = IpcContract[TChannel]["response"];
```

- [ ] **Step 10: Create public exports**

Create `packages/core/src/index.ts`:

```ts
export type {
  ChannelType,
  CustomerMessageType,
  CustomerServiceContext,
  GoodsContext,
  OrderContext
} from "./context";
export type {
  GeneratedReply,
  KnowledgeSourceReference,
  ReplyAction,
  ReplyMode
} from "./reply";
export { canTransitionMessageState } from "./message-state";
export type { MessageState } from "./message-state";
export type {
  AccountLoginRequest,
  AccountLoginResult,
  GenerateReplyRequest,
  GenerateReplyResult,
  IpcChannel,
  IpcContract,
  IpcRequest,
  IpcResponse
} from "./ipc";
```

- [ ] **Step 11: Run core tests**

Run:

```bash
pnpm --filter @customer-agent/core test
pnpm --filter @customer-agent/core typecheck
pnpm --filter @customer-agent/core build
```

Expected: all commands exit with code 0.

- [ ] **Step 12: Commit core contracts**

Run:

```bash
git add packages/core
git commit -m "feat: add core customer service contracts"
```

---

### Task 3: Electron Desktop Shell

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.renderer.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/main.tsx`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/App.test.tsx`
- Create: `apps/desktop/src/worker/index.ts`

- [ ] **Step 1: Create desktop package manifest**

Create `apps/desktop/package.json`:

```json
{
  "name": "@customer-agent/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite --config vite.renderer.config.ts",
    "build": "tsc -p tsconfig.json && vite build --config vite.renderer.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "@customer-agent/core": "workspace:*",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^34.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.0.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create desktop TypeScript config**

Create `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.renderer.config.ts"]
}
```

- [ ] **Step 3: Create Vite renderer config**

Create `apps/desktop/vite.renderer.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false
  },
  test: {
    environment: "jsdom",
    setupFiles: []
  }
});
```

- [ ] **Step 4: Create HTML entry**

Create `apps/desktop/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Customer Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write failing renderer smoke test**

Create `apps/desktop/src/renderer/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the first-version shell sections", () => {
    render(<App />);

    expect(screen.getByText("拼多多 AI 客服助手")).toBeInTheDocument();
    expect(screen.getByText("自动回复")).toBeInTheDocument();
    expect(screen.getByText("账号管理")).toBeInTheDocument();
    expect(screen.getByText("知识库")).toBeInTheDocument();
    expect(screen.getByText("模型设置")).toBeInTheDocument();
    expect(screen.getByText("日志")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run:

```bash
pnpm --filter @customer-agent/desktop test
```

Expected: FAIL because `apps/desktop/src/renderer/App.tsx` does not exist.

- [ ] **Step 7: Create renderer app**

Create `apps/desktop/src/renderer/App.tsx`:

```tsx
const navItems = ["自动回复", "账号管理", "知识库", "模型设置", "日志", "设置"];

export function App() {
  return (
    <main style={{ minHeight: "100vh", background: "#f7f9fc", color: "#172033" }}>
      <aside
        style={{
          position: "fixed",
          inset: "0 auto 0 0",
          width: 240,
          borderRight: "1px solid #d8dee9",
          background: "#ffffff",
          padding: 24
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 24px" }}>拼多多 AI 客服助手</h1>
        <nav style={{ display: "grid", gap: 8 }}>
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              style={{
                border: 0,
                borderRadius: 8,
                background: item === "自动回复" ? "#d7e3ff" : "transparent",
                color: "#172033",
                cursor: "pointer",
                fontSize: 15,
                padding: "10px 12px",
                textAlign: "left"
              }}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section style={{ marginLeft: 240, padding: 32 }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, color: "#5f6b7a" }}>Electron + TypeScript rewrite</p>
          <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>自动回复</h2>
        </header>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
          }}
        >
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>运行账号</h3>
            <p>等待连接拼多多账号。</p>
          </section>
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>待审核草稿</h3>
            <p>人工审核模式的 AI 草稿会显示在这里。</p>
          </section>
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>模型状态</h3>
            <p>等待配置本地 vLLM 或外部 endpoint。</p>
          </section>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Create renderer entry**

Create `apps/desktop/src/renderer/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create Electron main process**

Create `apps/desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    title: "拼多多 AI 客服助手",
    webPreferences: {
      preload: path.join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(path.join(dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
```

- [ ] **Step 10: Create preload bridge**

Create `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcRequest, IpcResponse } from "@customer-agent/core";

const api = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequest<TChannel>,
  ): Promise<IpcResponse<TChannel>> {
    return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<TChannel>>;
  }
};

contextBridge.exposeInMainWorld("customerAgent", api);

export type CustomerAgentBridge = typeof api;
```

- [ ] **Step 11: Create worker entry stub**

Create `apps/desktop/src/worker/index.ts`:

```ts
type WorkerStatus = "starting" | "ready" | "stopped" | "error";

let status: WorkerStatus = "starting";

export function getWorkerStatus(): WorkerStatus {
  return status;
}

export function markWorkerReady(): WorkerStatus {
  status = "ready";
  return status;
}

markWorkerReady();
```

- [ ] **Step 12: Run desktop checks**

Run:

```bash
pnpm --filter @customer-agent/desktop test
pnpm --filter @customer-agent/desktop typecheck
pnpm --filter @customer-agent/desktop build
```

Expected: all commands exit with code 0.

- [ ] **Step 13: Commit desktop shell**

Run:

```bash
git add apps/desktop
git commit -m "feat: add electron desktop shell"
```

---

### Task 4: Baseline Workspace Verification

**Files:**
- Modify only if checks reveal a concrete issue in files created by Tasks 1-3.

- [ ] **Step 1: Run all workspace checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Expected: all commands exit with code 0.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing Python/local-knowledge changes may remain unstaged. Files from the TypeScript foundation should already be committed.

- [ ] **Step 3: Document next plan boundaries**

Create `docs/superpowers/plans/2026-05-29-next-phase-index.md`:

```markdown
# Next Phase Plan Index

The Electron TypeScript foundation is complete. Implement these follow-up plans separately:

1. PDD Playwright login and session adapter.
2. PDD WebSocket and send-message adapter.
3. SQLite + Drizzle local data layer.
4. LanceDB knowledge import and retrieval.
5. LangChain.js reply workflow.
6. vLLM and ModelScope inference manager.
7. Material Design 3 renderer screens.
8. Electron packaging and update flow.
```

- [ ] **Step 4: Commit phase index**

Run:

```bash
git add docs/superpowers/plans/2026-05-29-next-phase-index.md
git commit -m "docs: add electron rewrite phase index"
```
