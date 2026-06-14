import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type {
  AccountRecord,
  AppSettings,
  KnowledgeDocumentRecord,
  LogLevel,
  LogRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";
import { SecretBox } from "./secret-box.js";

type NewAccount = Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };
type NewMessage = Omit<MessageRecord, "updatedAt">;

const defaultSettings: AppSettings = {
  replyMode: "human_review",
  businessHours: { start: "08:00", end: "23:00" },
  knowledge: { chunkSize: 900, chunkOverlap: 120, topK: 4 },
};

export class SqliteAppStore {
  private constructor(
    private readonly dbPath: string,
    private readonly db: Database,
    private readonly secrets: SecretBox,
  ) {}

  static async open(dataDir: string): Promise<SqliteAppStore> {
    await mkdir(dataDir, { recursive: true });
    const SQL = await initSqlJs();
    const dbPath = path.join(dataDir, "customer-agent.sqlite");
    const db = await openDatabase(SQL, dbPath);
    const store = new SqliteAppStore(dbPath, db, await SecretBox.open(dataDir));
    store.migrate();
    await store.persist();
    return store;
  }

  async close(): Promise<void> {
    await this.persist();
    this.db.close();
  }

  async upsertAccount(input: NewAccount): Promise<AccountRecord> {
    const now = new Date().toISOString();
    const existing = input.id ? await this.getAccount(input.id) : await this.findAccount(input.channel, input.shopId, input.userId);
    const account: AccountRecord = {
      ...input,
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const encryptedCookies = this.secrets.encrypt(account.cookies);
    this.db.run(
      `INSERT INTO accounts(id, channel, username, shop_id, shop_name, user_id, status, cookies, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        channel=excluded.channel, username=excluded.username, shop_id=excluded.shop_id,
        shop_name=excluded.shop_name, user_id=excluded.user_id, status=excluded.status,
        cookies=excluded.cookies, error=excluded.error, updated_at=excluded.updated_at`,
      [
        account.id,
        account.channel,
        account.username,
        account.shopId,
        account.shopName ?? null,
        account.userId,
        account.status,
        encryptedCookies ?? null,
        account.error ?? null,
        account.createdAt,
        account.updatedAt,
      ],
    );
    await this.persist();
    return account;
  }

  async listAccounts(): Promise<AccountRecord[]> {
    return this.query<AccountRecord>(
      "SELECT * FROM accounts ORDER BY updated_at DESC",
      [],
      (row) => this.accountFromRow(row),
    );
  }

  async getAccount(accountId: string): Promise<AccountRecord | undefined> {
    return this.query<AccountRecord>(
      "SELECT * FROM accounts WHERE id = ? LIMIT 1",
      [accountId],
      (row) => this.accountFromRow(row),
    )[0];
  }

  async upsertMessage(input: NewMessage): Promise<MessageRecord> {
    const message = { ...input, updatedAt: new Date().toISOString() };
    this.db.run(
      `INSERT INTO messages(id, payload, shop_id, account_id, state, received_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, state=excluded.state, updated_at=excluded.updated_at`,
      [message.id, JSON.stringify(message), message.shopId, message.accountId, message.state, message.receivedAt, message.updatedAt],
    );
    await this.persist();
    return message;
  }

  async listMessages(options: { shopId?: string; limit?: number } = {}): Promise<MessageRecord[]> {
    const where = options.shopId ? "WHERE shop_id = ?" : "";
    const params = options.shopId ? [options.shopId] : [];
    return this.query<MessageRecord>(
      `SELECT payload FROM messages ${where} ORDER BY received_at DESC LIMIT ${options.limit ?? 100}`,
      params,
      (row) => JSON.parse(String(row.payload)) as MessageRecord,
    );
  }

  async getMessage(messageId: string): Promise<MessageRecord | undefined> {
    return this.query<MessageRecord>(
      "SELECT payload FROM messages WHERE id = ? LIMIT 1",
      [messageId],
      (row) => JSON.parse(String(row.payload)) as MessageRecord,
    )[0];
  }

  async saveDraft(draft: ReplyDraftRecord): Promise<ReplyDraftRecord> {
    this.db.run(
      `INSERT INTO reply_drafts(id, payload, message_id, shop_id, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, state=excluded.state, updated_at=excluded.updated_at`,
      [draft.id, JSON.stringify(draft), draft.messageId, draft.shopId, draft.state, draft.createdAt, draft.updatedAt],
    );
    await this.persist();
    return draft;
  }

  async listDrafts(options: { shopId?: string } = {}): Promise<ReplyDraftRecord[]> {
    const where = options.shopId ? "WHERE shop_id = ?" : "";
    const params = options.shopId ? [options.shopId] : [];
    return this.query<ReplyDraftRecord>(
      `SELECT payload FROM reply_drafts ${where} ORDER BY created_at DESC`,
      params,
      (row) => JSON.parse(String(row.payload)) as ReplyDraftRecord,
    );
  }

  async getDraft(draftId: string): Promise<ReplyDraftRecord | undefined> {
    return this.query<ReplyDraftRecord>(
      "SELECT payload FROM reply_drafts WHERE id = ? LIMIT 1",
      [draftId],
      (row) => JSON.parse(String(row.payload)) as ReplyDraftRecord,
    )[0];
  }

  async saveKnowledgeDocument(document: KnowledgeDocumentRecord): Promise<KnowledgeDocumentRecord> {
    this.db.run(
      `INSERT INTO knowledge_documents(id, payload, scope, shop_id, indexed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, indexed_at=excluded.indexed_at`,
      [document.id, JSON.stringify(document), document.scope, document.shopId ?? null, document.indexedAt],
    );
    await this.persist();
    return document;
  }

  async listKnowledgeDocuments(options: { scope?: string; shopId?: string } = {}): Promise<KnowledgeDocumentRecord[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.scope) {
      clauses.push("scope = ?");
      params.push(options.scope);
    }
    if (options.shopId) {
      clauses.push("shop_id = ?");
      params.push(options.shopId);
    }
    return this.query<KnowledgeDocumentRecord>(
      `SELECT payload FROM knowledge_documents ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY indexed_at DESC`,
      params,
      (row) => JSON.parse(String(row.payload)) as KnowledgeDocumentRecord,
    );
  }

  async getSettings(): Promise<AppSettings> {
    const stored = this.query<AppSettings>(
      "SELECT payload FROM settings WHERE id = 1",
      [],
      (row) => JSON.parse(String(row.payload)) as AppSettings,
    )[0];
    return stored ?? defaultSettings;
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = {
      ...current,
      ...settings,
      businessHours: { ...current.businessHours, ...settings.businessHours },
      knowledge: { ...current.knowledge, ...settings.knowledge },
      ...(settings.inferenceRuntime ? { inferenceRuntime: { ...current.inferenceRuntime, ...settings.inferenceRuntime } } : {}),
    };
    this.db.run(
      "INSERT INTO settings(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      [JSON.stringify(next)],
    );
    await this.persist();
    return next;
  }

  async appendLog(level: LogLevel, message: string): Promise<LogRecord> {
    const log = { id: crypto.randomUUID(), level, message, createdAt: new Date().toISOString() };
    this.db.run("INSERT INTO logs(id, level, message, created_at) VALUES (?, ?, ?, ?)", [log.id, log.level, log.message, log.createdAt]);
    await this.persist();
    return log;
  }

  async listLogs(options: { level?: LogLevel; limit?: number } = {}): Promise<LogRecord[]> {
    const where = options.level ? "WHERE level = ?" : "";
    const params = options.level ? [options.level] : [];
    return this.query<LogRecord>(
      `SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ${options.limit ?? 100}`,
      params,
      (row) => ({ id: String(row.id), level: row.level as LogLevel, message: String(row.message), createdAt: String(row.created_at) }),
    );
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, channel TEXT NOT NULL, username TEXT NOT NULL,
        shop_id TEXT NOT NULL, shop_name TEXT, user_id TEXT NOT NULL,
        status TEXT NOT NULL, cookies TEXT, error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, shop_id TEXT NOT NULL,
        account_id TEXT NOT NULL, state TEXT NOT NULL, received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reply_drafts (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, message_id TEXT NOT NULL,
        shop_id TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, scope TEXT NOT NULL,
        shop_id TEXT, indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY, level TEXT NOT NULL, message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private async persist(): Promise<void> {
    await writeFile(this.dbPath, Buffer.from(this.db.export()));
  }

  private findAccount(channel: string, shopId: string, userId: string): Promise<AccountRecord | undefined> {
    return Promise.resolve(this.query<AccountRecord>(
      "SELECT * FROM accounts WHERE channel = ? AND shop_id = ? AND user_id = ? LIMIT 1",
      [channel, shopId, userId],
      (row) => this.accountFromRow(row),
    )[0]);
  }

  private accountFromRow(row: Record<string, unknown>): AccountRecord {
    const cookies = this.secrets.decrypt(row.cookies ? String(row.cookies) : undefined);
    return {
      id: String(row.id),
      channel: "pinduoduo",
      username: String(row.username),
      shopId: String(row.shop_id),
      ...(row.shop_name ? { shopName: String(row.shop_name) } : {}),
      userId: String(row.user_id),
      status: row.status as AccountRecord["status"],
      ...(cookies ? { cookies } : {}),
      ...(row.error ? { error: String(row.error) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private query<T>(sql: string, params: Array<string | number | null>, map: (row: Record<string, unknown>) => T): T[] {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(map(statement.getAsObject()));
      }
      return rows;
    } finally {
      statement.free();
    }
  }
}

async function openDatabase(SQL: SqlJsStatic, dbPath: string): Promise<Database> {
  try {
    return new SQL.Database(await readFile(dbPath));
  } catch {
    return new SQL.Database();
  }
}
