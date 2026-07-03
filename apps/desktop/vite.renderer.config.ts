import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";
import type { InlineConfig } from "vitest";

const config = {
  plugins: [react()],
  root: ".",
  // Renderer is loaded via `file://` in packaged/dev-built Electron windows;
  // absolute `/assets/...` paths resolve against the filesystem root there,
  // not dist/renderer, and load nothing. Relative paths keep it working.
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: [],
  },
} satisfies UserConfig & { test: InlineConfig };

export default config;
