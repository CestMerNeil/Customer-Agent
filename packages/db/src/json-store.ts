import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AccountRecord,
  AppSettings,
  LogLevel,
  LogRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";

type NewAccount = Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };
type NewMessage = Omit<MessageRecord, "updatedAt">;

interface StoreData {
  accounts: AccountRecord[];
  messages: MessageRecord[];
  drafts: ReplyDraftRecord[];
  logs: LogRecord[];
  settings: AppSettings;
}

const defaultSettings: AppSettings = {
  businessHours: { start: "08:00", end: "23:00" },
  knowledge: { topK: 4 },
  queue: { maxConcurrentConversations: 2, maxAttempts: 3, baseBackoffMs: 5_000, paused: false },
  handoff: { keywords: [], intentRules: [] },
};

export class JsonAppStore {
  private constructor(
    private readonly filePath: string,
    private data: StoreData,
  ) {}

  static async open(dataDir: string): Promise<JsonAppStore> {
    await mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "app-store.json");
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<StoreData>;
      return new JsonAppStore(filePath, {
        accounts: parsed.accounts ?? [],
        messages: parsed.messages ?? [],
        drafts: parsed.drafts ?? [],
        logs: parsed.logs ?? [],
        settings: { ...defaultSettings, ...parsed.settings },
      });
    } catch {
      const store = new JsonAppStore(filePath, {
        accounts: [],
        messages: [],
        drafts: [],
        logs: [],
        settings: defaultSettings,
      });
      await store.persist();
      return store;
    }
  }

  async upsertAccount(input: NewAccount): Promise<AccountRecord> {
    const now = new Date().toISOString();
    const existingIndex = this.data.accounts.findIndex(
      (account) => account.id === input.id || (account.channel === input.channel && account.shopId === input.shopId && account.userId === input.userId),
    );
    const existing = existingIndex >= 0 ? this.data.accounts[existingIndex] : undefined;
    const account: AccountRecord = {
      ...input,
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      this.data.accounts[existingIndex] = account;
    } else {
      this.data.accounts.push(account);
    }
    await this.persist();
    return account;
  }

  async listAccounts(): Promise<AccountRecord[]> {
    return [...this.data.accounts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getAccount(accountId: string): Promise<AccountRecord | undefined> {
    return this.data.accounts.find((account) => account.id === accountId);
  }

  async upsertMessage(input: NewMessage): Promise<MessageRecord> {
    const existingIndex = this.data.messages.findIndex((message) => message.id === input.id);
    const message: MessageRecord = { ...input, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      this.data.messages[existingIndex] = message;
    } else {
      this.data.messages.push(message);
    }
    await this.persist();
    return message;
  }

  async listMessages(options: { shopId?: string; limit?: number } = {}): Promise<MessageRecord[]> {
    const messages = options.shopId
      ? this.data.messages.filter((message) => message.shopId === options.shopId)
      : this.data.messages;
    return [...messages]
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
      .slice(0, options.limit ?? 100);
  }

  async getMessage(messageId: string): Promise<MessageRecord | undefined> {
    return this.data.messages.find((message) => message.id === messageId);
  }

  async saveDraft(draft: ReplyDraftRecord): Promise<ReplyDraftRecord> {
    const index = this.data.drafts.findIndex((item) => item.id === draft.id);
    if (index >= 0) {
      this.data.drafts[index] = draft;
    } else {
      this.data.drafts.push(draft);
    }
    await this.persist();
    return draft;
  }

  async listDrafts(options: { shopId?: string } = {}): Promise<ReplyDraftRecord[]> {
    return this.data.drafts.filter((draft) => !options.shopId || draft.shopId === options.shopId);
  }

  async getDraft(draftId: string): Promise<ReplyDraftRecord | undefined> {
    return this.data.drafts.find((draft) => draft.id === draftId);
  }

  async getSettings(): Promise<AppSettings> {
    return this.data.settings;
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    this.data.settings = {
      ...this.data.settings,
      ...settings,
      businessHours: { ...this.data.settings.businessHours, ...settings.businessHours },
      knowledge: { ...this.data.settings.knowledge, ...settings.knowledge },
      queue: {
        maxConcurrentConversations:
          settings.queue?.maxConcurrentConversations
          ?? this.data.settings.queue?.maxConcurrentConversations
          ?? defaultSettings.queue?.maxConcurrentConversations
          ?? 2,
        maxAttempts:
          settings.queue?.maxAttempts
          ?? this.data.settings.queue?.maxAttempts
          ?? defaultSettings.queue?.maxAttempts
          ?? 3,
        baseBackoffMs:
          settings.queue?.baseBackoffMs
          ?? this.data.settings.queue?.baseBackoffMs
          ?? defaultSettings.queue?.baseBackoffMs
          ?? 5_000,
        paused: settings.queue?.paused ?? this.data.settings.queue?.paused ?? false,
      },
      handoff: {
        keywords: settings.handoff?.keywords ?? this.data.settings.handoff?.keywords ?? [],
        intentRules: settings.handoff?.intentRules ?? this.data.settings.handoff?.intentRules ?? [],
      },
      ...(settings.inferenceRuntime ? { inferenceRuntime: { ...this.data.settings.inferenceRuntime, ...settings.inferenceRuntime } } : {}),
    };
    await this.persist();
    return this.data.settings;
  }

  async appendLog(level: LogLevel, message: string): Promise<LogRecord> {
    const log = { id: crypto.randomUUID(), level, message, createdAt: new Date().toISOString() };
    this.data.logs.unshift(log);
    this.data.logs = this.data.logs.slice(0, 500);
    await this.persist();
    return log;
  }

  async listLogs(options: { level?: LogLevel; limit?: number } = {}): Promise<LogRecord[]> {
    return this.data.logs.filter((log) => !options.level || log.level === options.level).slice(0, options.limit ?? 100);
  }

  private async persist(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
}
