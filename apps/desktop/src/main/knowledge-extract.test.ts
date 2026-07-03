import { describe, expect, it } from "vitest";
import { extractKnowledgeEntries, parseKnowledgeEntries } from "./knowledge-extract.js";

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

  it("returns [] on non-JSON or non-array output", () => {
    expect(parseKnowledgeEntries("模型拒绝回答")).toEqual([]);
    expect(parseKnowledgeEntries('{"title":"x"}')).toEqual([]);
  });

  it("feeds the model reply through extraction", async () => {
    const client = { chat: async () => '[{"title":"t","content":"c","tags":[]}]' };
    expect(await extractKnowledgeEntries("doc", client)).toEqual([{ title: "t", content: "c", tags: [] }]);
  });
});
