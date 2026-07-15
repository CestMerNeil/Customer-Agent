import { describe, expect, it } from "vitest";
import { extractKnowledgeEntries, parseKnowledgeEntries, splitKnowledgeDocument } from "./knowledge-extract.js";

describe("parseKnowledgeEntries", () => {
  it("parses a clean JSON array", () => {
    const entries = parseKnowledgeEntries('[{"title":"退货","content":"七天无理由","tags":["售后"]}]');
    expect(entries).toEqual([{ title: "退货", content: "七天无理由", tags: ["售后"] }]);
  });

  it("strips markdown code fences and surrounding prose", () => {
    const raw = '好的，这是结果：\n```json\n[{"title":"运费","content":"满99包邮","tags":["物流","包邮"]}]\n```';
    expect(parseKnowledgeEntries(raw)).toEqual([{ title: "运费", content: "满99包邮", tags: ["物流", "包邮"] }]);
  });

  it("drops rows missing a title or content, and coerces tags", () => {
    const raw = '[{"title":"","content":"x"},{"title":"有效","content":"内容","tags":"notarray"},{"title":"t","content":"c","tags":["a"," b "]}]';
    expect(parseKnowledgeEntries(raw)).toEqual([
      { title: "有效", content: "内容", tags: [] },
      { title: "t", content: "c", tags: ["a", "b"] },
    ]);
  });

  it("returns null on unparseable output, [] on valid JSON without usable entries", () => {
    expect(parseKnowledgeEntries("模型拒绝回答")).toBeNull();
    expect(parseKnowledgeEntries('{"title":"x"}')).toEqual([]);
    expect(parseKnowledgeEntries('{"entries":[]}')).toEqual([]);
  });

  it("accepts common object wrappers and Chinese field names", () => {
    expect(parseKnowledgeEntries('{"entries":[{"标题":"换货","内容":"七天内可换货","标签":["售后"]}]}')).toEqual([
      { title: "换货", content: "七天内可换货", tags: ["售后"] },
    ]);
  });

  it("ignores Qwen thinking blocks before JSON", () => {
    expect(parseKnowledgeEntries('<think>分析过程</think>\n{"entries":[{"title":"发货","content":"48小时内发货","tags":[]}]}')).toHaveLength(1);
  });

  it("feeds the model reply through extraction", async () => {
    const client = { chatMultimodal: async () => '{"entries":[{"title":"t","content":"c","tags":[]}]}' };
    expect((await extractKnowledgeEntries("doc", client)).entries).toEqual([{ title: "t", content: "c", tags: [] }]);
  });

  it("splits the full document and deduplicates entries across sequential calls", async () => {
    const prompts: string[] = [];
    const client = {
      chatMultimodal: async (request: { system: string }) => {
        prompts.push(request.system);
        return '{"entries":[{"title":"退货","content":"七天无理由","tags":["售后"]}]}';
      },
    };
    const result = await extractKnowledgeEntries("第一段内容\n\n第二段内容", client, undefined);
    expect(splitKnowledgeDocument("第一段内容\n\n第二段内容", 8)).toEqual(["第一段内容", "第二段内容"]);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("不得补充、猜测或虚构事实");
    expect(result.entries).toHaveLength(1);
  });

  it("calls the provider once for every bounded segment and reports progress", async () => {
    const progress: number[] = [];
    const client = { chatMultimodal: async () => '{"entries":[{"title":"t","content":"c","tags":[]}]}' };
    const text = `${"甲".repeat(2400)}\n\n${"乙".repeat(10)}`;
    const result = await extractKnowledgeEntries(text, client, (event) => progress.push(event.completed));
    expect(result.total).toBe(2);
    expect(progress).toEqual([1, 2]);
  });

  it("carries the previous segment tail as context from the second segment on", async () => {
    const texts: string[] = [];
    const client = {
      chatMultimodal: async (request: { text: string }) => {
        texts.push(request.text);
        return '{"entries":[]}';
      },
    };
    const text = `${"甲".repeat(2400)}\n\n${"乙".repeat(10)}`;
    await extractKnowledgeEntries(text, client);
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toContain("上一片段结尾");
    expect(texts[1]).toContain("上一片段结尾");
    expect(texts[1]).toContain("甲".repeat(200));
  });

  it("instructs the model on script/template documents", async () => {
    const prompts: string[] = [];
    const client = {
      chatMultimodal: async (request: { system: string }) => {
        prompts.push(request.system);
        return '{"entries":[]}';
      },
    };
    await extractKnowledgeEntries("doc", client);
    expect(prompts[0]).toContain("客服话术或回复模板");
    expect(prompts[0]).toContain("客户可能的问法关键词");
  });

  it("treats a valid empty result as no knowledge, without retrying or failing", async () => {
    let calls = 0;
    const client = { chatMultimodal: async () => (calls++, '{"entries": []}') };
    const result = await extractKnowledgeEntries("doc", client);
    expect(calls).toBe(1);
    expect(result.entries).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("retries once when the provider returns an invalid format", async () => {
    let calls = 0;
    const client = {
      chatMultimodal: async () => ++calls === 1 ? "not json" : '{"items":[{"title":"发货","content":"48小时内发货","tags":[]}]}',
    };
    expect((await extractKnowledgeEntries("doc", client)).entries).toHaveLength(1);
    expect(calls).toBe(2);
  });
});
