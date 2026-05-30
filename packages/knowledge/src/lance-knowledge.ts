import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeDocumentRecord, KnowledgeScope, KnowledgeSearchResult } from "@customer-agent/core";

interface LanceDbModule {
  connect(path: string): Promise<LanceConnection>;
}

interface LanceConnection {
  tableNames(): Promise<string[]>;
  createTable(name: string, data: Array<Record<string, unknown>>): Promise<LanceTable>;
  openTable(name: string): Promise<LanceTable>;
}

interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  search(vector: number[]): { limit(count: number): { toArray(): Promise<Array<Record<string, unknown>>> } };
  query(): { toArray(): Promise<Array<Record<string, unknown>>> };
}

export interface LanceKnowledgeServiceOptions {
  dataDir: string;
  embed: (text: string) => Promise<number[]>;
  chunkSize?: number;
  chunkOverlap?: number;
  lancedb?: LanceDbModule;
}

export class LanceKnowledgeService {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(private readonly options: LanceKnowledgeServiceOptions) {
    this.chunkSize = Math.max(200, options.chunkSize ?? 900);
    this.chunkOverlap = Math.max(0, Math.min(options.chunkOverlap ?? 120, this.chunkSize - 1));
  }

  async importFile(input: { filePath: string; scope: KnowledgeScope; shopId?: string }): Promise<KnowledgeDocumentRecord> {
    const table = await this.getTable();
    const text = await readTextFile(input.filePath);
    const chunks = splitText(text, this.chunkSize, this.chunkOverlap);
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
    await table.add(await Promise.all(chunks.map(async (content, index) => ({
      id: `${documentId}-${index}`,
      documentId,
      chunkId: `${documentId}-${index}`,
      scope: input.scope,
      shopId: input.shopId ?? "",
      filePath: input.filePath,
      fileName: document.fileName,
      content,
      indexedAt: document.indexedAt,
      vector: await this.options.embed(content),
    }))));
    return document;
  }

  async listDocuments(): Promise<KnowledgeDocumentRecord[]> {
    const rows = await (await this.getTable()).query().toArray();
    const documents = new Map<string, KnowledgeDocumentRecord>();
    for (const row of rows) {
      const documentId = String(row.documentId);
      const existing = documents.get(documentId);
      documents.set(documentId, {
        id: documentId,
        scope: row.scope as KnowledgeScope,
        filePath: String(row.filePath),
        fileName: String(row.fileName),
        indexedAt: String(row.indexedAt),
        chunkCount: (existing?.chunkCount ?? 0) + 1,
        ...(row.shopId ? { shopId: String(row.shopId) } : {}),
      });
    }
    return [...documents.values()];
  }

  async search(input: { query: string; shopId?: string; topK?: number }): Promise<KnowledgeSearchResult[]> {
    const vector = await this.options.embed(input.query);
    const rows = await (await this.getTable()).search(vector).limit(input.topK ?? 4).toArray();
    return rows
      .filter((row) => row.scope === "global" || row.shopId === input.shopId)
      .map((row) => ({
        id: String(row.id),
        documentId: String(row.documentId),
        chunkId: String(row.chunkId),
        scope: row.scope as KnowledgeScope,
        content: String(row.content),
        score: Number(row._distance ?? row.score ?? 0),
        ...(row.shopId ? { shopId: String(row.shopId) } : {}),
      }));
  }

  private async getTable(): Promise<LanceTable> {
    const lancedb = this.options.lancedb ?? await loadLanceDb();
    const db = await lancedb.connect(path.join(this.options.dataDir, "lancedb"));
    const names = await db.tableNames();
    if (!names.includes("knowledge_chunks")) {
      return db.createTable("knowledge_chunks", [{
        id: "bootstrap",
        documentId: "bootstrap",
        chunkId: "bootstrap",
        scope: "global",
        shopId: "",
        filePath: "",
        fileName: "",
        content: "",
        indexedAt: new Date().toISOString(),
        vector: [0, 0],
      }]);
    }
    return db.openTable("knowledge_chunks");
  }
}

async function loadLanceDb(): Promise<LanceDbModule> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  return await dynamicImport("@lancedb/lancedb") as LanceDbModule;
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function readTextFile(filePath: string): Promise<string> {
  const raw = await readFile(filePath, "utf8");
  return filePath.endsWith(".json") ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
}
