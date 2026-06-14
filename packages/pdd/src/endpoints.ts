// Pinduoduo endpoint base URLs.
//
// In production these are the real Pinduoduo origins. For the end-to-end harness
// (Seam C) the app is launched against the Mock Pinduoduo process, so two env
// vars allow redirecting the HTTP and WebSocket origins at a single seam without
// touching call sites. They are read only at module load and default to the real
// origins, so normal runs are unaffected.
//
// - PDD_HTTP_BASE_URL: overrides the https://mms.pinduoduo.com HTTP origin.
// - PDD_WS_BASE_URL:   overrides the wss://m-ws.pinduoduo.com WebSocket origin.

const DEFAULT_HTTP_BASE = "https://mms.pinduoduo.com";
const DEFAULT_WS_BASE = "wss://m-ws.pinduoduo.com";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function pddHttpBaseUrl(): string {
  const override = (globalThis.process?.env?.PDD_HTTP_BASE_URL ?? "").trim();
  return trimTrailingSlash(override || DEFAULT_HTTP_BASE);
}

export function pddWsBaseUrl(): string {
  const override = (globalThis.process?.env?.PDD_WS_BASE_URL ?? "").trim();
  return trimTrailingSlash(override || DEFAULT_WS_BASE);
}
