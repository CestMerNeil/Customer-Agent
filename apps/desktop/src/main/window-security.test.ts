import { describe, expect, it, vi } from "vitest";
import {
  applyWindowSecurity,
  isTrustedRendererUrl,
  resolveDevServerUrl,
  type SecuredWebContents,
} from "./window-security.js";

/**
 * Creates a controllable Electron web-contents substitute for security policy tests.
 *
 * @returns Security harness with navigation and popup controls.
 */
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
  it("ignores a dev-server environment variable in packaged applications", () => {
    const packagedUrl = resolveDevServerUrl(true, "http://127.0.0.1:5173");
    expect(packagedUrl).toBeUndefined();
    expect(isTrustedRendererUrl("http://127.0.0.1:5173", packagedUrl, "file:///app/index.html")).toBe(false);
    expect(resolveDevServerUrl(false, "http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  it("allows only the explicit bundled entry or configured Vite origin", () => {
    const rendererEntry = "file:///Applications/Customer-Agent/renderer/index.html";

    expect(isTrustedRendererUrl(`${rendererEntry}#/settings`, undefined, rendererEntry)).toBe(true);
    expect(isTrustedRendererUrl("file:///Applications/Customer-Agent/renderer/other.html", undefined, rendererEntry)).toBe(false);
    expect(isTrustedRendererUrl("file:///etc/passwd", undefined, rendererEntry)).toBe(false);
    expect(isTrustedRendererUrl(rendererEntry, undefined)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5173/settings", "http://localhost:5173")).toBe(true);
    expect(isTrustedRendererUrl("https://example.com", "http://localhost:5173")).toBe(false);
  });

  it("blocks untrusted navigations and all popup windows", () => {
    const harness = createWebContentsHarness();
    const rendererEntry = "file:///Applications/Customer-Agent/renderer/index.html";
    applyWindowSecurity(harness.webContents, "http://localhost:5173", rendererEntry);

    expect(harness.navigate("http://localhost:5173/queue")).toBe(false);
    expect(harness.navigate("https://example.com")).toBe(true);
    expect(harness.navigate("file:///etc/passwd")).toBe(true);
    expect(harness.open("https://example.com")).toEqual({ action: "deny" });
  });
});
