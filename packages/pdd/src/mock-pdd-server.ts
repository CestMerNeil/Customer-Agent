// Mock Pinduoduo edge (process mode). Serves the same `mockFixtures` as the
// library-mode mock over a real HTTP + WebSocket server, so the packaged app can
// be pointed at it for the end-to-end (Seam C) run. Library and process modes
// read the SAME fixtures, so they cannot diverge.
//
// Endpoints (HTTP, all POST):
//   /chats/getToken
//   /janus/api/new/userinfo
//   /earth/api/merchant/queryMerchantInfoByMallId
//   /plateau/chat/set_csstatus
//   /plateau/chat/send_message
// Control:
//   POST /__control/push   { ...frame } -> pushes a buyer frame to all WS clients
//
// The WebSocket server implements just enough of RFC 6455 (handshake + server→
// client text frames) to deliver buyer frames. No external dependency is added.

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { mockFixtures, type MockBuyerFrame, type RecordedRequest } from "./mock-pdd.js";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export interface MockPddServerOptions {
  /** Port to listen on; 0 (default) picks a free port. */
  port?: number;
  /** Force the send_message endpoint to return this error. */
  sendError?: string;
}

export interface MockPddServer {
  /** The bound port. */
  readonly port: number;
  /** HTTP base URL, e.g. http://127.0.0.1:1234 (for PDD_HTTP_BASE_URL). */
  readonly httpBaseUrl: string;
  /** WebSocket base URL, e.g. ws://127.0.0.1:1234 (for PDD_WS_BASE_URL). */
  readonly wsBaseUrl: string;
  /** Push a buyer frame to every connected WebSocket client. */
  pushBuyerMessage(frame?: MockBuyerFrame): void;
  /** Request bodies received per endpoint key (e.g. "send_message"). */
  readonly requests: Record<string, RecordedRequest[]>;
  /** Number of currently connected WebSocket clients. */
  readonly clientCount: number;
  close(): Promise<void>;
}

export async function startMockPddServer(options: MockPddServerOptions = {}): Promise<MockPddServer> {
  const sockets = new Set<Duplex>();
  const requests: Record<string, RecordedRequest[]> = {};
  const record = (key: string, url: string, body: string): void => {
    (requests[key] ??= []).push({ url, body });
  };

  const server = createServer((req, res) => {
    handleHttpRequest(req, res, { record, sendError: options.sendError, pushFrame: (frame) => pushFrame(sockets, frame) });
  });

  server.on("upgrade", (req, socket) => {
    completeWsHandshake(req, socket);
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });

  await listen(server, options.port ?? 0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    httpBaseUrl: `http://127.0.0.1:${port}`,
    wsBaseUrl: `ws://127.0.0.1:${port}`,
    pushBuyerMessage(frame = mockFixtures.buyerFrame) {
      pushFrame(sockets, frame);
    },
    requests,
    get clientCount() {
      return sockets.size;
    },
    close: () => closeServer(server, sockets),
  };
}

interface HttpHandlerDeps {
  record: (key: string, url: string, body: string) => void;
  sendError: string | undefined;
  pushFrame: (frame: MockBuyerFrame) => void;
}

function handleHttpRequest(req: IncomingMessage, res: ServerResponse, deps: HttpHandlerDeps): void {
  const url = req.url ?? "";
  readBody(req).then((body) => {
    if (url.includes("/__control/push")) {
      const frame = body ? (JSON.parse(body) as MockBuyerFrame) : mockFixtures.buyerFrame;
      deps.pushFrame(frame);
      return respondJson(res, { pushed: true });
    }
    if (url.includes("chats/getToken")) {
      deps.record("getToken", url, body);
      return respondJson(res, mockFixtures.getToken);
    }
    if (url.includes("janus/api/new/userinfo")) {
      deps.record("userInfo", url, body);
      return respondJson(res, mockFixtures.userInfo);
    }
    if (url.includes("queryMerchantInfoByMallId")) {
      deps.record("shopInfo", url, body);
      return respondJson(res, mockFixtures.shopInfo);
    }
    if (url.includes("set_csstatus")) {
      deps.record("setOnlineStatus", url, body);
      return respondJson(res, mockFixtures.setOnlineStatus);
    }
    if (url.includes("send_message")) {
      deps.record("send_message", url, body);
      if (deps.sendError) {
        return respondJson(res, { success: false, errorMsg: deps.sendError });
      }
      return respondJson(res, mockFixtures.sendMessage);
    }
    return respondJson(res, { success: false, errorMsg: `mock-pdd: unrecognized endpoint ${url}` });
  }).catch(() => {
    respondJson(res, { success: false, errorMsg: "mock-pdd: failed to read request" });
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function respondJson(res: ServerResponse, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

function completeWsHandshake(req: IncomingMessage, socket: Duplex): void {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
  );
}

function pushFrame(sockets: Set<Duplex>, frame: MockBuyerFrame): void {
  const data = encodeTextFrame(JSON.stringify(frame));
  for (const socket of sockets) {
    socket.write(data);
  }
}

// Encode a server→client unmasked text frame (RFC 6455 §5.2). Server frames must
// not be masked. Supports payloads up to 2^16-1 bytes, ample for fixtures.
function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const length = payload.length;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, payload]);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server, sockets: Set<Duplex>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }
  sockets.clear();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
