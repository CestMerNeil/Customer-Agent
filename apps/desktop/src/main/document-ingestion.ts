import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractRawText } from "mammoth";
import { OfficeConverter, parseOffice } from "officeparser";
import type { OfficeContentNode } from "officeparser";

const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json"]);
const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"]);

type OfficeTextConverter = (filePath: string) => Promise<string>;

/** Reads supported local documents as text without sending the original file to a provider. */
export async function readDocumentText(
  filePath: string,
  convertOffice?: OfficeTextConverter,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".docx") {
    try {
      const result = await extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX 文件读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (OFFICE_EXTENSIONS.has(ext)) {
    try {
      // 表格必须走行结构转换：默认文本转换会把同一行的单元格无分隔拼接
      const converter = convertOffice ?? (ext === ".xlsx" ? convertSpreadsheetToText : convertOfficeToText);
      return await converter(filePath);
    } catch (error) {
      throw new Error(`${ext.slice(1).toUpperCase()} 文件读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!PLAIN_TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`不支持 ${ext || "未知"} 格式。请选择 DOCX、XLSX、PPTX、TXT、Markdown 或 JSON 文件。`);
  }
  const raw = await readFile(filePath, "utf8");
  return ext === ".json" ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
}

/** Converts a spreadsheet row-by-row: cells joined with " | ", one row per paragraph,
 * so QA-style tables keep question/answer pairs intact through segmentation. */
async function convertSpreadsheetToText(filePath: string): Promise<string> {
  const ast = await parseOffice(filePath);
  const rows: string[] = [];
  const walk = (node: OfficeContentNode) => {
    if (node.type === "row") {
      const cells = (node.children ?? []).map((cell) => String(cell.text ?? "").trim()).filter(Boolean);
      if (cells.length > 0) rows.push(cells.join(" | "));
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of ast.content ?? []) walk(node);
  return rows.join("\n\n");
}

async function convertOfficeToText(filePath: string): Promise<string> {
  const result = await OfficeConverter.convert(filePath, "text", {
    parseConfig: {
      ocr: false,
      ignoreComments: true,
      ignoreHeadersAndFooters: false,
      ignoreNotes: false,
    },
  });
  return typeof result.value === "string" ? result.value : "";
}
