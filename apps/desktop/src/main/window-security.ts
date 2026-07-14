/** Minimal interface for the Electron web contents APIs secured by this module. */
export interface SecuredWebContents {
  /** Registers a main-frame navigation listener. */
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
  /** Installs the policy for renderer-created windows. */
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
}

/**
 * Returns the configured dev server only for an unpackaged development build.
 *
 * @param isPackaged Whether Electron is running a packaged application.
 * @param configuredUrl Dev server URL supplied by the environment.
 * @returns The development URL, or `undefined` for packaged applications.
 */
export function resolveDevServerUrl(isPackaged: boolean, configuredUrl: string | undefined): string | undefined {
  return isPackaged ? undefined : configuredUrl;
}

/**
 * Returns whether a renderer URL is the explicit packaged entry or active Vite origin.
 *
 * @param url Candidate renderer URL.
 * @param devServerUrl Configured Vite server URL in development.
 * @param rendererFileUrl Explicit packaged renderer entry URL.
 * @returns Whether the candidate belongs to the trusted renderer.
 */
export function isTrustedRendererUrl(url: string, devServerUrl: string | undefined, rendererFileUrl?: string): boolean {
  try {
    const candidate = new URL(url);
    if (candidate.protocol === "file:") {
      if (!rendererFileUrl) {
        return false;
      }
      const trustedFile = new URL(rendererFileUrl);
      if (trustedFile.protocol !== "file:") {
        return false;
      }
      candidate.hash = "";
      candidate.search = "";
      trustedFile.hash = "";
      trustedFile.search = "";
      return candidate.href === trustedFile.href;
    }
    if (!devServerUrl) {
      return false;
    }
    const trustedServer = new URL(devServerUrl);
    return ["http:", "https:"].includes(trustedServer.protocol)
      && candidate.protocol === trustedServer.protocol
      && candidate.origin === trustedServer.origin;
  } catch {
    return false;
  }
}

/**
 * Blocks navigation away from the trusted renderer and denies renderer-created windows.
 *
 * @param webContents Electron web contents to secure.
 * @param devServerUrl Configured Vite server URL in development.
 * @param rendererFileUrl Explicit packaged renderer entry URL.
 */
export function applyWindowSecurity(webContents: SecuredWebContents, devServerUrl: string | undefined, rendererFileUrl?: string): void {
  webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, devServerUrl, rendererFileUrl)) {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
