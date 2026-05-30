import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ModelScopeManager, VllmManager } from "./runtime-manager.js";

describe("VllmManager", () => {
  it("starts vLLM with an OpenAI-compatible server command", async () => {
    const spawn = vi.fn().mockReturnValue({ pid: 123, kill: vi.fn(), on: vi.fn() });
    const manager = new VllmManager({ spawn });

    await expect(manager.start({ command: "vllm", modelPath: "/models/qwen", port: 8000 })).resolves.toMatchObject({ running: true, pid: 123 });
    expect(spawn).toHaveBeenCalledWith("vllm", ["serve", "/models/qwen", "--port", "8000", "--host", "127.0.0.1"], expect.any(Object));
  });
});

describe("ModelScopeManager", () => {
  it("builds a model download command for cache path", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-"));
    const spawn = vi.fn().mockReturnValue({ on: (event: string, callback: (code: number) => void) => event === "close" && callback(0) });
    const manager = new ModelScopeManager({ cacheDir: dir, spawn });

    await expect(manager.ensureModel("qwen/Qwen2.5-7B-Instruct")).resolves.toBe(path.join(dir, "qwen__Qwen2.5-7B-Instruct"));
    expect(spawn).toHaveBeenCalledWith("modelscope", ["download", "--model", "qwen/Qwen2.5-7B-Instruct", "--local_dir", path.join(dir, "qwen__Qwen2.5-7B-Instruct")], expect.any(Object));
    await rm(dir, { recursive: true, force: true });
  });
});
