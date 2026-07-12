interface StructuredChatLike {
  chatMultimodal(request: {
    system: string;
    text: string;
    responseFormat: "json_object";
  }): Promise<string>;
}

export interface ExtractedKnowledgeEntry {
  title: string;
  content: string;
  tags: string[];
}

export interface KnowledgeExtractionProgress {
  completed: number;
  total: number;
  entries: number;
  failed: number;
}

export interface KnowledgeExtractionResult {
  completed: number;
  total: number;
  failed: number;
  entries: ExtractedKnowledgeEntry[];
  failures: Array<{ segment: number; error: string }>;
}

const SEGMENT_SIZE = 2400;
// ponytail: fixed tail carry-over so mid-topic segments keep their heading; smarter heading tracking if this proves insufficient
const CONTEXT_TAIL_SIZE = 200;

/** Distils every document segment into self-contained, reviewable entries. */
export async function extractKnowledgeEntries(
  text: string,
  client: StructuredChatLike,
  onProgress?: (progress: KnowledgeExtractionProgress) => void,
): Promise<KnowledgeExtractionResult> {
  const segments = splitKnowledgeDocument(text);
  const entries: ExtractedKnowledgeEntry[] = [];
  const failures: Array<{ segment: number; error: string }> = [];
  for (const [index, segment] of segments.entries()) {
    try {
      const previousTail = index > 0 ? segments[index - 1]?.slice(-CONTEXT_TAIL_SIZE) : undefined;
      const request = buildExtractionRequest(segment, index + 1, segments.length, previousTail);
      const first = await client.chatMultimodal(request);
      let parsed = parseKnowledgeEntries(first);
      if (parsed === null) {
        const retry = await client.chatMultimodal({
          system: `${request.system}\n上一次输出无法解析。此次必须只返回 {"entries": [...]}；没有知识时返回 {"entries":[]}。`,
          text: request.text,
          responseFormat: "json_object",
        });
        parsed = parseKnowledgeEntries(retry);
        if (parsed === null) {
          failures.push({ segment: index + 1, error: `Model Provider 连续两次没有返回可解析的知识 JSON。返回摘要：${summarizeModelOutput(retry)}` });
        }
      }
      if (parsed && parsed.length > 0) {
        entries.push(...parsed);
      }
    } catch (error) {
      failures.push({ segment: index + 1, error: error instanceof Error ? error.message : String(error) });
    }
    onProgress?.({ completed: index + 1, total: segments.length, entries: entries.length, failed: failures.length });
  }
  return {
    completed: segments.length,
    total: segments.length,
    entries: dedupeKnowledgeEntries(entries),
    failures,
    failed: failures.length,
  };
}

/** Splits on paragraphs first, falling back to hard slices for oversized blocks. */
export function splitKnowledgeDocument(text: string, maxChars = SEGMENT_SIZE): string[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean);
  const segments: string[] = [];
  let current = "";
  const flush = () => {
    if (current) segments.push(current);
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        segments.push(paragraph.slice(offset, offset + maxChars));
      }
      continue;
    }
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return segments;
}

function buildExtractionRequest(segment: string, segmentNumber: number, totalSegments: number, previousTail?: string) {
  const contextBlock = previousTail
    ? `上一片段结尾（仅用于理解本段主题和归属，不要从中提取条目）：\n"""\n${previousTail}\n"""\n`
    : "";
  return {
    system: [
    "/no_think",
    "你是客服知识库整理助手。把下面的文档整理成若干条相互独立、可直接用于客服回答的知识条目。",
    "只能使用文档明确提供的信息，不得补充、猜测或虚构事实。保留适用范围、条件、例外和时效信息。",
    '忽略目录、版权信息和没有客服价值的内容；如果本段没有有效知识，输出 {"entries":[]}。',
    "每条包含：title（简短主题）、content（自包含的完整说明，不要依赖其它条目）、tags（关键词字符串数组）。",
    "如果片段内容是客服话术或回复模板：title 写成「客户场景+应对方式」（如：买家索要好评返现-委婉拒绝）；content 保留可直接发送的话术原文，同一场景的多个版本合并到同一条；tags 中加入客户可能的问法关键词（如：好评返现、有红包不）。",
    "只输出一个 JSON 对象，不要任何解释、前后缀或 Markdown 代码块。",
    '格式示例：{"entries":[{"title":"七天无理由退货","content":"……","tags":["退货","售后"]}]}',
    ].join("\n"),
    text: `当前片段：${segmentNumber}/${totalSegments}\n${contextBlock}文档片段内容：\n"""\n${segment}\n"""`,
    responseFormat: "json_object" as const,
  };
}

function dedupeKnowledgeEntries(entries: ExtractedKnowledgeEntry[]): ExtractedKnowledgeEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.title.trim().toLowerCase()}\n${entry.content.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Tolerant parse of a model reply into entries: strips code fences, slices the
 * outermost JSON array, and drops malformed rows. Returns [] for valid JSON
 * with no usable entries (e.g. {"entries":[]}), null when nothing parses. */
export function parseKnowledgeEntries(raw: string): ExtractedKnowledgeEntry[] | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const candidates = [
    cleaned,
    sliceOuter(cleaned, "{", "}"),
    sliceOuter(cleaned, "[", "]"),
  ].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  let parsedAny = false;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      parsedAny = true;
    const value = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? ["entries", "items", "data", "knowledge"].map((key) => (parsed as Record<string, unknown>)[key]).find(Array.isArray)
          ?? [parsed]
        : [];
      const entries = value
      .map((item): ExtractedKnowledgeEntry => {
        const record = item as Record<string, unknown>;
        const tags = record.tags ?? record.标签;
        return {
          title: String(record?.title ?? record?.标题 ?? "").trim(),
          content: String(record?.content ?? record?.内容 ?? "").trim(),
          tags: Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        };
      })
        .filter((entry) => entry.title && entry.content);
      if (entries.length > 0) return entries;
    } catch {
      continue;
    }
  }
  return parsedAny ? [] : null;
}

function sliceOuter(value: string, open: string, close: string): string | undefined {
  const start = value.indexOf(open);
  const end = value.lastIndexOf(close);
  return start >= 0 && end > start ? value.slice(start, end + 1) : undefined;
}

function summarizeModelOutput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180) || "空响应";
}
