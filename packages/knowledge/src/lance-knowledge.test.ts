import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanceKnowledgeService } from "./lance-knowledge.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-lance-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("LanceKnowledgeService", () => {
  it("imports and searches documents through the vector table", async () => {
    const file = path.join(dir, "policy.md");
    await writeFile(file, "退货政策：签收后七天内可以申请退货。", "utf8");
    const rows: Array<Record<string, unknown>> = [];
    const table = {
      add: async (data: Array<Record<string, unknown>>) => { rows.push(...data); },
      query: () => ({ toArray: async () => rows }),
      search: () => ({ limit: (count: number) => ({ toArray: async () => rows.slice(0, count) }) }),
    };
    const service = new LanceKnowledgeService({
      dataDir: dir,
      embed: async (text) => (text.includes("退货") ? [1, 0] : [0, 1]),
      lancedb: {
        connect: async () => ({
          tableNames: async () => rows.length ? ["knowledge_chunks"] : [],
          createTable: async (_name, data) => {
            rows.push(...data.filter((row) => row.id !== "bootstrap"));
            return table;
          },
          openTable: async () => table,
        }),
      },
    });

    const document = await service.importFile({ filePath: file, scope: "global" });
    const results = await service.search({ query: "如何退货", topK: 1 });

    expect(document.chunkCount).toBe(1);
    expect(results[0]).toMatchObject({ scope: "global", content: expect.stringContaining("七天内") });
  });
});
