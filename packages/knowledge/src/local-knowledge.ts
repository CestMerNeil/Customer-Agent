import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeDocumentRecord, KnowledgeScope, KnowledgeSearchResult } from "@customer-agent/core";

interface StoredChunk {
  id: string;
  documentId: string;
  chunkId: string;
  scope: KnowledgeScope;
  shopId?: string;
  filePath: string;
  fileName: string;
  content: string;
  embedding: number[];
}

interface StoredIndex {
  documents: KnowledgeDocumentRecord[];
  chunks: StoredChunk[];
}

export interface LocalKnowledgeServiceOptions {
  dataDir: string;
  embed: (text: string) => Promise<number[]>;
  chunkSize?: number;
  chunkOverlap?: number;
}

export class LocalKnowledgeService {
  private readonly indexPath: string;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(private readonly options: LocalKnowledgeServiceOptions) {
    this.indexPath = path.join(options.dataDir, "knowledge-index.json");
    this.chunkSize = Math.max(200, options.chunkSize ?? 900);
    this.chunkOverlap = Math.max(0, Math.min(options.chunkOverlap ?? 120, this.chunkSize - 1));
  }

  async importFile(input: { filePath: string; scope: KnowledgeScope; shopId?: string }): Promise<KnowledgeDocumentRecord> {
    const text = await readTextFile(input.filePath);
    const chunks = splitText(text, this.chunkSize, this.chunkOverlap);
    const index = await this.load();
    const documentId = crypto.randomUUID();
    const document: KnowledgeDocumentRecord = {
      id: documentId,
      scope: input.scope,
      filePath: input.filePath,
      fileName: path.basename(input.filePath),
      chunkCount: chunks.length,
      indexedAt: new Date().toISOString(),
      ...(input.shopId ? { shopId: input.shopId } : {}),
    };
    const storedChunks: StoredChunk[] = [];
    for (const [chunkIndex, content] of chunks.entries()) {
      const chunkId = `${documentId}-${chunkIndex}`;
      storedChunks.push({
        id: chunkId,
        documentId,
        chunkId,
        scope: input.scope,
        filePath: input.filePath,
        fileName: document.fileName,
        content,
        embedding: await this.options.embed(content),
        ...(input.shopId ? { shopId: input.shopId } : {}),
      });
    }
    index.documents = index.documents.filter((item) => item.filePath !== input.filePath || item.shopId !== input.shopId);
    index.chunks = index.chunks.filter((item) => item.filePath !== input.filePath || item.shopId !== input.shopId);
    index.documents.push(document);
    index.chunks.push(...storedChunks);
    await this.save(index);
    return document;
  }

  async listDocuments(options: { scope?: KnowledgeScope; shopId?: string } = {}): Promise<KnowledgeDocumentRecord[]> {
    const index = await this.load();
    return index.documents.filter(
      (document) => (!options.scope || document.scope === options.scope) && (!options.shopId || document.shopId === options.shopId),
    );
  }

  async search(input: { query: string; shopId?: string; topK?: number }): Promise<KnowledgeSearchResult[]> {
    const queryEmbedding = await this.options.embed(input.query);
    const index = await this.load();
    return index.chunks
      .filter((chunk) => chunk.scope === "global" || chunk.shopId === input.shopId)
      .map((chunk) => {
        const result: KnowledgeSearchResult = {
          id: chunk.id,
          documentId: chunk.documentId,
          chunkId: chunk.chunkId,
          scope: chunk.scope,
          content: chunk.content,
          score: cosineSimilarity(queryEmbedding, chunk.embedding),
          ...(chunk.shopId ? { shopId: chunk.shopId } : {}),
        };
        return result;
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, input.topK ?? 4);
  }

  private async load(): Promise<StoredIndex> {
    await mkdir(this.options.dataDir, { recursive: true });
    try {
      return JSON.parse(await readFile(this.indexPath, "utf8")) as StoredIndex;
    } catch {
      return { documents: [], chunks: [] };
    }
  }

  private async save(index: StoredIndex): Promise<void> {
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function readTextFile(filePath: string): Promise<string> {
  const raw = await readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return JSON.stringify(JSON.parse(raw), null, 2);
  }
  return raw;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / (leftNorm * rightNorm);
}
