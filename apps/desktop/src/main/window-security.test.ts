import { describe, expect, it, vi } from "vitest";
import { applyWindowSecurity, isTrustedRendererUrl, type SecuredWebContents } from "./window-security.js";

/** Creates a controllable Electron web-contents substitute for security policy tests. */
function createWebContentsHarness(): {
  webContents: SecuredWebContents;
  navigate(url: string): boolean;
  open(url: string): { action: "deny" };
} {
  let navigationHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  let windowOpenHandler: ((details: { url: string }) => { action: "deny" }) | undefined;
  return {
    webContents: {
      on: (_event, listener) => {
        navigationHandler = listener;
      },
      setWindowOpenHandler: (handler) => {
        windowOpenHandler = handler;
      },
    },
    navigate: (url) => {
      const preventDefault = vi.fn();
      navigationHandler?.({ preventDefault }, url);
      return preventDefault.mock.calls.length > 0;
    },
    open: (url) => windowOpenHandler?.({ url }) ?? { action: "deny" },
  };
}

describe("renderer window security", () => {
  it("allows only bundled files or the configured Vite origin", () => {
    expect(isTrustedRendererUrl("file:///Applications/Customer-Agent/index.html", undefined)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/settings", "http://localhost:5173")).toBe(true);
    expect(isTrustedRendererUrl("https://example.com", "http://localhost:5173")).toBe(false);
  });

  it("blocks untrusted navigations and all popup windows", () => {
    const harness = createWebContentsHarness();
    applyWindowSecurity(harness.webContents, "http://localhost:5173");

    expect(harness.navigate("http://localhost:5173/queue")).toBe(false);
    expect(harness.navigate("https://example.com")).toBe(true);
    expect(harness.open("https://example.com")).toEqual({ action: "deny" });
  });
});
