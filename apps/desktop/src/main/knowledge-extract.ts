interface ChatLike {
  chat(prompt: string): Promise<string>;
}

export interface ExtractedKnowledgeEntry {
  title: string;
  content: string;
  tags: string[];
}

// Distil a document into self-contained, reviewable knowledge entries via the
// chat model — the "LLM wiki" path that replaces blind chunk+embedding import.
export async function extractKnowledgeEntries(text: string, client: ChatLike): Promise<ExtractedKnowledgeEntry[]> {
  // ponytail: single-pass over the head of the doc, bounded by the model's
  // output budget. Segment long documents and merge if recall matters.
  const excerpt = text.slice(0, 6000);
  const prompt = [
    "你是客服知识库整理助手。把下面的文档整理成若干条相互独立、可直接用于客服回答的知识条目。",
    "每条包含：title（简短主题）、content（自包含的完整说明，不要依赖其它条目）、tags（关键词字符串数组）。",
    "只输出 JSON 数组本身，不要任何解释、前后缀或 Markdown 代码块。",
    '格式示例：[{"title":"七天无理由退货","content":"……","tags":["退货","售后"]}]',
    "文档内容：",
    '"""',
    excerpt,
    '"""',
  ].join("\n");
  const raw = await client.chat(prompt);
  return parseKnowledgeEntries(raw);
}

/** Tolerant parse of a model reply into entries: strips code fences, slices the
 * outermost JSON array, and drops malformed rows. Returns [] on any failure. */
export function parseKnowledgeEntries(raw: string): ExtractedKnowledgeEntry[] {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item): ExtractedKnowledgeEntry => {
        const record = item as Record<string, unknown>;
        return {
          title: String(record?.title ?? "").trim(),
          content: String(record?.content ?? "").trim(),
          tags: Array.isArray(record?.tags) ? record.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        };
      })
      .filter((entry) => entry.title && entry.content);
  } catch {
    return [];
  }
}
