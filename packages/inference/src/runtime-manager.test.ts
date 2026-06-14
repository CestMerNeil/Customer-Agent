import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ModelScopeManager, RuntimeProcessManager } from "./runtime-manager.js";

describe("RuntimeProcessManager", () => {
  it("starts process with custom arguments", async () => {
    const spawn = vi.fn().mockReturnValue({ pid: 123, kill: vi.fn(), on: vi.fn() });
    const manager = new RuntimeProcessManager({ spawn });

    await expect(
      manager.start({
        command: "llama-server",
        modelPath: "/models/qwen.gguf",
        port: 8000,
        args: ["-m", "/models/qwen.gguf", "--port", "8000", "--host", "127.0.0.1"],
      }),
    ).resolves.toMatchObject({ running: true, pid: 123 });
    expect(spawn).toHaveBeenCalledWith(
      "llama-server",
      ["-m", "/models/qwen.gguf", "--port", "8000", "--host", "127.0.0.1"],
      expect.any(Object),
    );
  });

  it("starts with custom command arguments", async () => {
    const spawn = vi.fn().mockReturnValue({ pid: 456, kill: vi.fn(), on: vi.fn() });
    const manager = new RuntimeProcessManager({ spawn });

    await expect(
      manager.start({
        command: "llama-server",
        modelPath: "/models/qwen.gguf",
        port: 8080,
        host: "0.0.0.0",
        args: ["-m", "/models/qwen.gguf", "--host", "0.0.0.0", "--port", "8080"],
      }),
    ).resolves.toMatchObject({ running: true, pid: 456 });
    expect(spawn).toHaveBeenCalledWith("llama-server", ["-m", "/models/qwen.gguf", "--host", "0.0.0.0", "--port", "8080"], expect.any(Object));
  });
});

describe("ModelScopeManager", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("supports local model path directly", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-model-local-"));
    const localModel = path.join(dir, "qwen.gguf");
    await writeFile(localModel, "");
    await expect(new ModelScopeManager({ cacheDir: dir }).ensureModel(localModel)).resolves.toBe(localModel);
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads model file from HTTPS URL into cache", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    const fixture = new Uint8Array([1, 2, 3, 4, 5]);
    const response = new Response(fixture);
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(response);

    const modelPath = await manager.ensureModel("https://example.com/models/qwen.gguf");

    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/models/qwen.gguf");
    const saved = await readFile(modelPath);
    expect(saved).toEqual(Buffer.from(fixture));
    expect(modelPath.startsWith(path.join(dir, "downloads"))).toBe(true);
    fetchSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects unknown model id without local path or URL", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-invalid-"));
    const manager = new ModelScopeManager({ cacheDir: dir });

    await expect(manager.ensureModel("qwen/Qwen2.5-7B-Instruct")).rejects.toThrow("当前仅支持本地文件路径或 HTTPS 模型文件地址");
    await rm(dir, { recursive: true, force: true });
  });
});
