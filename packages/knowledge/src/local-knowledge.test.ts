import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalKnowledgeService } from "./local-knowledge.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-knowledge-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("LocalKnowledgeService", () => {
  it("imports text documents and retrieves matching chunks by vector score", async () => {
    const file = path.join(dir, "policy.md");
    await writeFile(file, "退货政策：签收后七天内可以申请退货。运费规则以页面为准。", "utf8");
    const service = new LocalKnowledgeService({
      dataDir: dir,
      embed: async (text) => (text.includes("退货") ? [1, 0] : [0, 1]),
    });

    const imported = await service.importFile({ filePath: file, scope: "global" });
    const results = await service.search({ query: "怎么退货", shopId: "shop-1", topK: 1 });

    expect(imported.chunkCount).toBe(1);
    expect(results).toMatchObject([
      { scope: "global", content: expect.stringContaining("七天内可以申请退货") },
    ]);
  });
});
