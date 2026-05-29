import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";
import type { InlineConfig } from "vitest";

const config = {
  plugins: [react()],
  root: ".",
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
