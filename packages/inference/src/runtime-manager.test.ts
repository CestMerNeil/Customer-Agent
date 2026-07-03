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

  it("drains stdio and reports a dead process with its stderr", async () => {
    const handlers: Record<string, (arg: unknown) => void> = {};
    const stdout = { on: vi.fn() };
    const stderr = { on: vi.fn((event: string, cb: (arg: unknown) => void) => { handlers[`stderr:${event}`] = cb; }) };
    const child = {
      pid: 789,
      kill: vi.fn(),
      stdout,
      stderr,
      on: vi.fn((event: string, cb: (arg: unknown) => void) => { handlers[event] = cb; }),
    };
    const manager = new RuntimeProcessManager({ spawn: vi.fn().mockReturnValue(child) });

    await manager.start({ command: "llama-server", modelPath: "/m.gguf", port: 8000, args: ["-m", "/m.gguf"] });
    // Both pipes must be drained or llama-server stalls mid-load.
    expect(stdout.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(stderr.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(manager.status()).toEqual({ running: true, pid: 789 });

    handlers["stderr:data"]?.(Buffer.from("error: failed to load model"));
    handlers.exit?.(1);
    expect(manager.status()).toEqual({ running: false });
    expect(manager.lastError()).toContain("failed to load model");
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

  it("reports model download byte progress", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-progress-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    const fixture = new Uint8Array([1, 2, 3, 4, 5]);
    const response = new Response(fixture, {
      headers: {
        "content-length": String(fixture.byteLength),
      },
    });
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(response);
    const progress: Array<{ receivedBytes: number; totalBytes?: number; percent?: number }> = [];

    await manager.ensureModel("https://example.com/models/qwen.gguf", {
      onProgress: (event) => progress.push(event),
    });

    expect(progress.at(-1)).toMatchObject({
      receivedBytes: fixture.byteLength,
      totalBytes: fixture.byteLength,
      percent: 100,
    });
    await rm(dir, { recursive: true, force: true });
  });

  it("verifies downloaded model checksum when provided", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-checksum-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    const fixture = new Uint8Array([1, 2, 3, 4, 5]);
    const response = new Response(fixture);
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(response);

    await expect(
      manager.ensureModel("https://example.com/models/qwen.gguf", {
        expectedSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow("模型文件校验失败");

    await rm(dir, { recursive: true, force: true });
  });

  it("discards a corrupted cached model and downloads a fresh copy", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-corrupt-cache-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    const partialDir = path.join(dir, "downloads");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(partialDir, { recursive: true }));
    const expectedPath = path.join(partialDir, "qwen.gguf.b0db1d6f9050");
    await writeFile(expectedPath, Buffer.from([9, 9, 9]));
    const fixture = new Uint8Array([1, 2, 3, 4, 5]);
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(new Response(fixture));

    const modelPath = await manager.ensureModel("https://example.com/models/qwen.gguf", {
      expectedSha256: "74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0",
    });

    expect(modelPath).toBe(expectedPath);
    expect(await readFile(modelPath)).toEqual(Buffer.from(fixture));
    await rm(dir, { recursive: true, force: true });
  });

  it("resumes a partial model download into the cache", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-resume-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    const partialDir = path.join(dir, "downloads");
    await writeFile(path.join(partialDir, "placeholder"), "", { flag: "a" }).catch(async () => {
      await import("node:fs/promises").then(({ mkdir }) => mkdir(partialDir, { recursive: true }));
    });
    const expectedPath = path.join(partialDir, "qwen.gguf.b0db1d6f9050");
    await writeFile(`${expectedPath}.part`, Buffer.from([1, 2]));
    const response = new Response(new Uint8Array([3, 4]), {
      status: 206,
      headers: { "content-length": "2", "content-range": "bytes 2-3/4" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(response);

    const modelPath = await manager.ensureModel("https://example.com/models/qwen.gguf");

    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/models/qwen.gguf", {
      headers: { Range: "bytes=2-" },
    });
    expect(await readFile(modelPath)).toEqual(Buffer.from([1, 2, 3, 4]));
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects downloads when available disk space is insufficient", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-disk-"));
    const manager = new ModelScopeManager({ cacheDir: dir, getAvailableBytes: async () => 3 });
    const response = new Response(new Uint8Array([1, 2, 3, 4, 5]), {
      headers: { "content-length": "5" },
    });
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(response);

    await expect(manager.ensureModel("https://example.com/models/qwen.gguf")).rejects.toThrow("模型下载空间不足");
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects unknown model id without local path or URL", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-invalid-"));
    const manager = new ModelScopeManager({ cacheDir: dir });

    await expect(manager.ensureModel("qwen/Qwen2.5-7B-Instruct")).rejects.toThrow("当前仅支持本地文件路径或 HTTPS 模型文件地址");
    await rm(dir, { recursive: true, force: true });
  });

  it("deletes cached remote model files without deleting local model paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-modelscope-delete-"));
    const manager = new ModelScopeManager({ cacheDir: dir });
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

    const modelPath = await manager.ensureModel("https://example.com/models/qwen-vl.gguf");
    await expect(readFile(modelPath)).resolves.toEqual(Buffer.from([1, 2, 3]));

    await expect(manager.deleteModel("https://example.com/models/qwen-vl.gguf")).resolves.toBe(true);
    await expect(readFile(modelPath)).rejects.toThrow();

    const localModel = path.join(dir, "custom.gguf");
    await writeFile(localModel, "keep");
    await expect(manager.deleteModel(localModel)).resolves.toBe(false);
    await expect(readFile(localModel)).resolves.toEqual(Buffer.from("keep"));
    await rm(dir, { recursive: true, force: true });
  });
});
