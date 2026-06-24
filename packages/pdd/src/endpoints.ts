// Pinduoduo endpoint base URLs.
//
// These are intentionally fixed to real Pinduoduo origins. Business-critical
// completion is no longer allowed to redirect the service to a mock PDD edge.

const DEFAULT_HTTP_BASE = "https://mms.pinduoduo.com";
const DEFAULT_WS_BASE = "wss://m-ws.pinduoduo.com";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function pddHttpBaseUrl(): string {
  return trimTrailingSlash(DEFAULT_HTTP_BASE);
}

export function pddWsBaseUrl(): string {
  return trimTrailingSlash(DEFAULT_WS_BASE);
}
