import { describe, expect, it, vi } from "vitest";
import { extractRawText } from "mammoth";
import { parseOffice } from "officeparser";
import { readDocumentText } from "./document-ingestion.js";

vi.mock("mammoth", () => ({ extractRawText: vi.fn() }));
vi.mock("officeparser", () => ({ OfficeConverter: { convert: vi.fn() }, parseOffice: vi.fn() }));

describe("readDocumentText", () => {
  it("routes DOCX through the dedicated Word parser", async () => {
    vi.mocked(extractRawText).mockResolvedValue({ value: "Word 文本", messages: [] });
    await expect(readDocumentText("/tmp/source.docx")).resolves.toBe("Word 文本");
    expect(extractRawText).toHaveBeenCalledWith({ path: "/tmp/source.docx" });
  });

  it.each(["xlsx", "pptx"])("routes .%s through the local Office converter", async (extension) => {
    const convert = vi.fn(async () => "已提取文本");
    await expect(readDocumentText(`/tmp/source.${extension}`, convert)).resolves.toBe("已提取文本");
    expect(convert).toHaveBeenCalledWith(`/tmp/source.${extension}`);
  });

  it("converts spreadsheets row by row so QA pairs stay intact", async () => {
    const cell = (text: string) => ({ type: "cell", text, children: [] });
    vi.mocked(parseOffice).mockResolvedValue({
      content: [{
        type: "sheet",
        children: [
          { type: "row", children: [cell("问题"), cell("答案")] },
          { type: "row", children: [cell("会生锈吗"), cell("正常使用不会生锈")] },
          { type: "row", children: [] },
        ],
      }],
    } as never);
    await expect(readDocumentText("/tmp/qa.xlsx")).resolves.toBe(
      "问题 | 答案\n\n会生锈吗 | 正常使用不会生锈",
    );
  });

  it("labels DOCX read failures separately", async () => {
    vi.mocked(extractRawText).mockRejectedValue(new Error("invalid zip"));
    await expect(readDocumentText("/tmp/source.docx")).rejects.toThrow("DOCX 文件读取失败：invalid zip");
  });

  it("rejects legacy binary Office files with a useful message", async () => {
    await expect(readDocumentText("/tmp/source.doc")).rejects.toThrow("不支持 .doc 格式");
  });
});
