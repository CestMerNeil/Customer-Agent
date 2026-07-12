/** Minimal interface for the Electron web contents APIs secured by this module. */
export interface SecuredWebContents {
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
}

/** Returns whether a renderer URL belongs to this application's file bundle or active Vite server. */
export function isTrustedRendererUrl(url: string, devServerUrl: string | undefined): boolean {
  try {
    const candidate = new URL(url);
    if (candidate.protocol === "file:") {
      return true;
    }
    if (!devServerUrl) {
      return false;
    }
    return candidate.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

/** Blocks renderer navigation away from the trusted app origin and all renderer-created windows. */
export function applyWindowSecurity(webContents: SecuredWebContents, devServerUrl: string | undefined): void {
  webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, devServerUrl)) {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
