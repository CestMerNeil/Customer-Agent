/* global console, process, window, setTimeout */
// Seam C — end-to-end IPC + renderer flow against the Mock Pinduoduo process.
//
// Launches the BUILT Electron app (dist/main) pointed at the Mock Pinduoduo
// process via the PDD_HTTP_BASE_URL / PDD_WS_BASE_URL override seam, plus a tiny
// OpenAI-compatible inference stub so reply generation is deterministic. It then
// drives the real IPC bridge (window.customerAgent.invoke) end to end:
//
//   account.start -> push buyer frame (mock control) -> message becomes received
//   -> reply.draft.send -> message becomes sent
//
// Reply *quality* is a non-goal here (design.md): this asserts the wiring and the
// received -> draft -> sent state transitions through real IPC + main process.
//
// Follows the existing scripts/*.mjs harness conventions (smoke-runtime.mjs).
// Run with the repo node, from apps/desktop: `node scripts/e2e-seam-c.mjs`.

import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { startMockPddServer } from "@customer-agent/pdd";
import { SqliteAppStore } from "@customer-agent/db";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mainEntry = path.join(packageRoot, "dist/main/index.js");

const ACCOUNT_ID = "seam-c-account";
const SHOP_ID = "shop-1";
const STUB_REPLY = "您好，有货的。";

async function main() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "customer-agent-seam-c-"));
  const mock = await startMockPddServer();
  const inference = await startInferenceStub();
  let app;
  let page;

  try {
    await seedStore(userDataDir, inference.baseUrl);

    app = await electron.launch({
      args: [mainEntry, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        PDD_HTTP_BASE_URL: mock.httpBaseUrl,
        PDD_WS_BASE_URL: mock.wsBaseUrl,
      },
    });

    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    const started = await invoke(page, "account.start", { accountId: ACCOUNT_ID });
    assert(started.ok, `account.start failed: ${started.error ?? "unknown"}`);

    await waitFor(() => mock.clientCount > 0, "mock WebSocket client to connect");

    mock.pushBuyerMessage();

    const received = await waitForMessageState(page, "received");
    assert(received, "buyer message did not reach state=received");

    const draftId = await waitForDraft(page, received.id);
    assert(draftId, "no draft was produced for the received message");

    const sendResult = await invoke(page, "reply.draft.send", { draftId });
    assert(sendResult.ok, `reply.draft.send failed: ${sendResult.error ?? "unknown"}`);

    const sent = await waitForMessageState(page, "sent");
    assert(sent && sent.id === received.id, "message did not transition to state=sent");

    assert(mock.requests.send_message?.length, "mock send_message endpoint was never called");
    const body = JSON.parse(mock.requests.send_message[0].body);
    assert(body.data.message.to.uid === "buyer-1", "send_message used the wrong buyer uid");

    console.log("Seam C passed: received -> draft -> sent through real IPC + renderer");
  } catch (error) {
    if (page) {
      await dumpDiagnostics(page).catch((diagnosticError) => {
        console.error(`Seam C diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
      });
    }
    throw error;
  } finally {
    await app?.close().catch(() => {});
    await mock.close().catch(() => {});
    await inference.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function seedStore(userDataDir, inferenceBaseUrl) {
  const store = await SqliteAppStore.open(path.join(userDataDir, "data"));
  await store.upsertAccount({
    id: ACCOUNT_ID,
    channel: "pinduoduo",
    username: "seam-c-seller",
    shopId: SHOP_ID,
    userId: "user-1",
    status: "offline",
    cookies: JSON.stringify({ PDDAccessToken: "mock-token" }),
  });
  await store.saveSettings({
    replyMode: "human_review",
    inference: {
      baseUrl: inferenceBaseUrl,
      chatModel: "mock-chat",
      embeddingModel: "mock-embed",
    },
  });
  await store.close();
}

// Minimal OpenAI-compatible stub: fixed reply + fixed 2-dim embedding (matching
// the knowledge bootstrap vector dimension), so generation is deterministic.
async function startInferenceStub() {
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if ((req.url ?? "").includes("/chat/completions")) {
        res.end(JSON.stringify({ choices: [{ message: { content: STUB_REPLY } }] }));
        return;
      }
      if ((req.url ?? "").includes("/embeddings")) {
        res.end(JSON.stringify({ data: [{ embedding: [0, 0] }] }));
        return;
      }
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function invoke(page, channel, request) {
  return page.evaluate(
    ([ch, req]) => window.customerAgent.invoke(ch, req),
    [channel, request],
  );
}

async function waitForMessageState(page, state) {
  let match;
  await waitFor(async () => {
    const { messages } = await invoke(page, "message.list", {});
    match = messages.find((message) => message.state === state);
    return Boolean(match);
  }, `message state=${state}`);
  return match;
}

async function waitForDraft(page, messageId) {
  let draftId;
  await waitFor(async () => {
    const { drafts } = await invoke(page, "reply.draft.list", {});
    const draft = drafts.find((candidate) => candidate.messageId === messageId);
    draftId = draft?.id;
    return Boolean(draftId);
  }, `draft for message ${messageId}`);
  return draftId;
}

async function dumpDiagnostics(page) {
  const [{ messages }, { drafts }, { logs }] = await Promise.all([
    invoke(page, "message.list", {}),
    invoke(page, "reply.draft.list", {}),
    invoke(page, "log.list", { limit: 20 }),
  ]);
  console.error(`Seam C diagnostics: messages=${JSON.stringify(messages)}`);
  console.error(`Seam C diagnostics: drafts=${JSON.stringify(drafts)}`);
  console.error(`Seam C diagnostics: logs=${JSON.stringify(logs)}`);
}

async function waitFor(predicate, label, timeoutMs = 20_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(`Seam C failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
