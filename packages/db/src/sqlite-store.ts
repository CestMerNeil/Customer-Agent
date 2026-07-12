import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type {
  AccountRecord,
  AgentAuditRecord,
  AppSettings,
  ConversationMemoryRecord,
  GovernedKnowledgeKind,
  GovernedKnowledgeRecord,
  GovernedKnowledgeReviewState,
  GovernedKnowledgeSourceType,
  InboundQueueMetrics,
  InboundQueueRecord,
  LogLevel,
  LogRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";

const DEFAULT_HANDOFF_KEYWORDS = [
  "转人工",
  "人工客服",
  "真人",
  "客服",
  "人工",
  "工单",
  "取消订单",
  "改地址",
  "转售后客服",
  "转售后",
  "退款",
  "投诉",
  "纠纷",
  "开发票",
  "开票",
  "备注",
];
import { SecretBox, type SecretBoxOptions } from "./secret-box.js";

type NewAccount = Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };
type NewMessage = Omit<MessageRecord, "updatedAt">;
type TerminalQueueState = Extract<InboundQueueRecord["state"], "completed" | "failed" | "dead_letter">;
type NewGovernedKnowledge = Omit<GovernedKnowledgeRecord, "id" | "citationId" | "version" | "createdAt" | "updatedAt" | "stale" | "conflict"> & {
  id?: string;
  citationId?: string;
  version?: number;
  stale?: boolean;
  conflict?: boolean;
};
type NewConversationMemory = Omit<ConversationMemoryRecord, "id" | "updatedAt"> & { id?: string; updatedAt?: string };
type NewAgentAuditRecord = Omit<AgentAuditRecord, "id" | "createdAt"> & { id?: string; createdAt?: string };

const DEFAULT_QUEUE_MAX_CONCURRENT_CONVERSATIONS = 2;
const DEFAULT_QUEUE_MAX_ATTEMPTS = 3;
const DEFAULT_QUEUE_BASE_BACKOFF_MS = 5_000;
const defaultSettings: AppSettings = {
  modelProvider: "local",
  businessHours: { start: "08:00", end: "23:00" },
  knowledge: { topK: 4 },
  queue: {
    maxConcurrentConversations: DEFAULT_QUEUE_MAX_CONCURRENT_CONVERSATIONS,
    maxAttempts: DEFAULT_QUEUE_MAX_ATTEMPTS,
    baseBackoffMs: DEFAULT_QUEUE_BASE_BACKOFF_MS,
    paused: false,
  },
  handoff: { keywords: DEFAULT_HANDOFF_KEYWORDS, intentRules: [] },
};

export class SqliteAppStore {
  private constructor(
    private readonly dbPath: string,
    private readonly db: Database,
    private readonly secrets: SecretBox,
  ) {}

  /** Opens the persisted store with the supplied secret-key protection policy. */
  static async open(dataDir: string, secretBoxOptions: SecretBoxOptions = {}): Promise<SqliteAppStore> {
    await mkdir(dataDir, { recursive: true });
    const SQL = await initSqlJs();
    const dbPath = path.join(dataDir, "customer-agent.sqlite");
    const db = await openDatabase(SQL, dbPath);
    const store = new SqliteAppStore(dbPath, db, await SecretBox.open(dataDir, secretBoxOptions));
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

  async getConversationMemory(input: { shopId: string; accountId: string; buyerId: string }): Promise<ConversationMemoryRecord | undefined> {
    return this.query<ConversationMemoryRecord>(
      "SELECT payload FROM conversation_memory WHERE shop_id = ? AND account_id = ? AND buyer_id = ? LIMIT 1",
      [input.shopId, input.accountId, input.buyerId],
      (row) => JSON.parse(String(row.payload)) as ConversationMemoryRecord,
    )[0];
  }

  async saveConversationMemory(input: NewConversationMemory): Promise<ConversationMemoryRecord> {
    const now = input.updatedAt ?? new Date().toISOString();
    const existing = await this.getConversationMemory(input);
    const record: ConversationMemoryRecord = {
      ...input,
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO conversation_memory(id, payload, shop_id, account_id, buyer_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(shop_id, account_id, buyer_id) DO UPDATE SET
        payload=excluded.payload, updated_at=excluded.updated_at`,
      [record.id, JSON.stringify(record), record.shopId, record.accountId, record.buyerId, record.updatedAt],
    );
    await this.persist();
    return record;
  }

  async appendAgentAudit(input: NewAgentAuditRecord): Promise<AgentAuditRecord> {
    const record: AgentAuditRecord = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO agent_audit(id, payload, shop_id, account_id, buyer_id, message_id, event_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, JSON.stringify(record), record.shopId, record.accountId, record.buyerId, record.messageId, record.eventType, record.createdAt],
    );
    await this.persist();
    return record;
  }

  async listAgentAudit(options: { shopId?: string; messageId?: string; limit?: number } = {}): Promise<AgentAuditRecord[]> {
    const clauses: string[] = [];
    const params: Array<string | number | null> = [];
    if (options.shopId) {
      clauses.push("shop_id = ?");
      params.push(options.shopId);
    }
    if (options.messageId) {
      clauses.push("message_id = ?");
      params.push(options.messageId);
    }
    params.push(options.limit ?? 100);
    return this.query<AgentAuditRecord>(
      `SELECT payload FROM agent_audit ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`,
      params,
      (row) => JSON.parse(String(row.payload)) as AgentAuditRecord,
    );
  }

  async getMessage(messageId: string): Promise<MessageRecord | undefined> {
    return this.query<MessageRecord>(
      "SELECT payload FROM messages WHERE id = ? LIMIT 1",
      [messageId],
      (row) => JSON.parse(String(row.payload)) as MessageRecord,
    )[0];
  }

  async enqueueInboundMessage(message: MessageRecord): Promise<InboundQueueRecord> {
    const existing = this.query<InboundQueueRecord>(
      "SELECT payload FROM inbound_queue WHERE dedupe_key = ? LIMIT 1",
      [buildInboundDedupeKey(message)],
      (row) => JSON.parse(String(row.payload)) as InboundQueueRecord,
    )[0];
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const item: InboundQueueRecord = {
      id: crypto.randomUUID(),
      messageId: message.id,
      accountId: message.accountId,
      shopId: message.shopId,
      buyerId: message.buyerId,
      conversationKey: buildConversationKey(message),
      dedupeKey: buildInboundDedupeKey(message),
      state: "pending",
      attempts: 0,
      availableAt: message.receivedAt,
      enqueuedAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO inbound_queue(
        id, payload, message_id, account_id, shop_id, buyer_id, conversation_key,
        dedupe_key, state, attempts, available_at, enqueued_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        JSON.stringify(item),
        item.messageId,
        item.accountId,
        item.shopId,
        item.buyerId,
        item.conversationKey,
        item.dedupeKey,
        item.state,
        item.attempts,
        item.availableAt,
        item.enqueuedAt,
        item.updatedAt,
      ],
    );
    await this.persist();
    return item;
  }

  async listInboundQueue(options: { shopId?: string; state?: InboundQueueRecord["state"] } = {}): Promise<InboundQueueRecord[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.shopId) {
      clauses.push("shop_id = ?");
      params.push(options.shopId);
    }
    if (options.state) {
      clauses.push("state = ?");
      params.push(options.state);
    }
    return this.query<InboundQueueRecord>(
      `SELECT payload FROM inbound_queue ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY available_at ASC, enqueued_at ASC`,
      params,
      (row) => JSON.parse(String(row.payload)) as InboundQueueRecord,
    );
  }

  async claimNextInboundMessages(options: { limit: number; now?: string }): Promise<InboundQueueRecord[]> {
    const settings = await this.getSettings();
    if (settings.queue?.paused) {
      return [];
    }
    const now = options.now ?? new Date().toISOString();
    const rows = this.query<InboundQueueRecord>(
      `SELECT payload FROM inbound_queue
       WHERE state IN ('pending', 'retry_waiting') AND available_at <= ?
       ORDER BY available_at ASC, enqueued_at ASC`,
      [now],
      (row) => JSON.parse(String(row.payload)) as InboundQueueRecord,
    );
    const activeConversations = new Set(
      this.query<string>(
        "SELECT DISTINCT conversation_key FROM inbound_queue WHERE state = 'processing'",
        [],
        (row) => String(row.conversation_key),
      ),
    );
    const claimed: InboundQueueRecord[] = [];
    const selectedConversations = new Set<string>();
    for (const item of rows) {
      if (claimed.length >= options.limit) {
        break;
      }
      if (activeConversations.has(item.conversationKey) || selectedConversations.has(item.conversationKey)) {
        continue;
      }
      const next = this.updateInboundQueuePayload({ ...item, state: "processing", attempts: item.attempts + 1, updatedAt: now });
      claimed.push(next);
      selectedConversations.add(next.conversationKey);
    }
    if (claimed.length > 0) {
      await this.persist();
    }
    return claimed;
  }

  async completeInboundQueueItem(id: string, state: TerminalQueueState, lastError?: string, now = new Date().toISOString()): Promise<InboundQueueRecord | undefined> {
    const item = await this.getInboundQueueItem(id);
    if (!item) {
      return undefined;
    }
    const next = this.updateInboundQueuePayload({
      ...item,
      state,
      ...(lastError ? { lastError } : {}),
      updatedAt: now,
    });
    await this.persist();
    return next;
  }

  async failInboundQueueItem(
    id: string,
    options: { error: string; now?: string; maxAttempts?: number; baseBackoffMs?: number },
  ): Promise<InboundQueueRecord | undefined> {
    const item = await this.getInboundQueueItem(id);
    if (!item) {
      return undefined;
    }
    const now = options.now ?? new Date().toISOString();
    const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_QUEUE_MAX_ATTEMPTS);
    const baseBackoffMs = Math.max(0, options.baseBackoffMs ?? DEFAULT_QUEUE_BASE_BACKOFF_MS);
    const state: InboundQueueRecord["state"] = item.attempts >= maxAttempts ? "dead_letter" : "retry_waiting";
    const availableAt = state === "retry_waiting"
      ? new Date(new Date(now).getTime() + baseBackoffMs * 2 ** Math.max(0, item.attempts - 1)).toISOString()
      : now;
    const next = this.updateInboundQueuePayload({
      ...item,
      state,
      availableAt,
      lastError: options.error,
      updatedAt: now,
    });
    await this.persist();
    return next;
  }

  async retryDeadLetterInboundQueueItems(
    options: { ids?: string[]; shopId?: string; limit?: number; now?: string } = {},
  ): Promise<InboundQueueRecord[]> {
    const clauses = ["state = 'dead_letter'"];
    const params: string[] = [];
    if (options.shopId) {
      clauses.push("shop_id = ?");
      params.push(options.shopId);
    }
    if (options.ids?.length) {
      clauses.push(`id IN (${options.ids.map(() => "?").join(", ")})`);
      params.push(...options.ids);
    }
    const limit = options.limit === undefined ? "" : " LIMIT ?";
    const rows = this.query<InboundQueueRecord>(
      `SELECT payload FROM inbound_queue WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC${limit}`,
      options.limit === undefined ? params : [...params, String(Math.max(0, options.limit))],
      (row) => JSON.parse(String(row.payload)) as InboundQueueRecord,
    );
    const now = options.now ?? new Date().toISOString();
    const retried = rows.map((item) => {
      const { lastError: _lastError, ...withoutLastError } = item;
      return this.updateInboundQueuePayload({
        ...withoutLastError,
        state: "pending",
        attempts: 0,
        availableAt: now,
        updatedAt: now,
      });
    });
    if (retried.length > 0) {
      await this.persist();
    }
    return retried;
  }

  async setInboundQueuePaused(paused: boolean): Promise<AppSettings> {
    const settings = await this.getSettings();
    return this.saveSettings({
      queue: {
        maxConcurrentConversations: settings.queue?.maxConcurrentConversations ?? DEFAULT_QUEUE_MAX_CONCURRENT_CONVERSATIONS,
        maxAttempts: settings.queue?.maxAttempts ?? DEFAULT_QUEUE_MAX_ATTEMPTS,
        baseBackoffMs: settings.queue?.baseBackoffMs ?? DEFAULT_QUEUE_BASE_BACKOFF_MS,
        paused,
      },
    });
  }

  async getInboundQueueItem(id: string): Promise<InboundQueueRecord | undefined> {
    return this.query<InboundQueueRecord>(
      "SELECT payload FROM inbound_queue WHERE id = ? LIMIT 1",
      [id],
      (row) => JSON.parse(String(row.payload)) as InboundQueueRecord,
    )[0];
  }

  async getInboundQueueMetrics(now = new Date().toISOString()): Promise<InboundQueueMetrics> {
    const items = await this.listInboundQueue();
    const counts = {
      pending: 0,
      retryWaiting: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
    };
    let retryCount = 0;
    let oldestPendingAt: string | undefined;
    let nextRetryAt: string | undefined;
    const completedLatencies: number[] = [];

    for (const item of items) {
      if (item.state === "pending") {
        counts.pending += 1;
        oldestPendingAt = minIso(oldestPendingAt, item.enqueuedAt);
      } else if (item.state === "retry_waiting") {
        counts.retryWaiting += 1;
        retryCount += item.attempts;
        nextRetryAt = minIso(nextRetryAt, item.availableAt);
      } else if (item.state === "processing") {
        counts.processing += 1;
      } else if (item.state === "completed") {
        counts.completed += 1;
        completedLatencies.push(Math.max(0, new Date(item.updatedAt).getTime() - new Date(item.enqueuedAt).getTime()));
      } else if (item.state === "failed") {
        counts.failed += 1;
      } else if (item.state === "dead_letter") {
        counts.deadLetter += 1;
      }
    }

    const averageProcessingLatencyMs = completedLatencies.length
      ? Math.round(completedLatencies.reduce((sum, value) => sum + value, 0) / completedLatencies.length)
      : 0;
    return {
      depth: counts.pending + counts.retryWaiting + counts.processing,
      pending: counts.pending,
      retryWaiting: counts.retryWaiting,
      processing: counts.processing,
      completed: counts.completed,
      failed: counts.failed,
      deadLetter: counts.deadLetter,
      retryCount,
      failureCount: counts.failed + counts.deadLetter,
      averageProcessingLatencyMs,
      ...(oldestPendingAt ? { oldestPendingAgeMs: Math.max(0, new Date(now).getTime() - new Date(oldestPendingAt).getTime()) } : {}),
      ...(nextRetryAt ? { nextRetryAt } : {}),
    };
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


  async saveGovernedKnowledge(input: NewGovernedKnowledge): Promise<GovernedKnowledgeRecord> {
    const now = new Date().toISOString();
    const citationId = input.citationId || buildGovernedKnowledgeCitationId(input);
    const latest = this.query<GovernedKnowledgeRecord>(
      "SELECT payload FROM governed_knowledge WHERE citation_id = ? ORDER BY version DESC LIMIT 1",
      [citationId],
      (row) => JSON.parse(String(row.payload)) as GovernedKnowledgeRecord,
    )[0];
    const record: GovernedKnowledgeRecord = {
      id: input.id ?? crypto.randomUUID(),
      citationId,
      kind: input.kind,
      shopId: input.shopId,
      title: input.title,
      content: input.content,
      tags: input.tags,
      sourceType: input.sourceType,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {}),
      version: input.version ?? ((latest?.version ?? 0) + 1),
      enabled: input.enabled,
      reviewState: input.reviewState,
      stale: input.stale ?? false,
      conflict: input.conflict ?? false,
      createdAt: latest?.createdAt ?? now,
      updatedAt: now,
      ...(latest ? { supersedesId: latest.id } : {}),
    };
    if (record.enabled) {
      for (const existing of await this.listGovernedKnowledge({ citationId })) {
        this.updateGovernedKnowledgePayload({ ...existing, enabled: false, updatedAt: now });
      }
    }
    this.db.run(
      `INSERT INTO governed_knowledge(
        id, payload, citation_id, kind, shop_id, version, enabled, review_state, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        payload=excluded.payload, enabled=excluded.enabled, review_state=excluded.review_state, updated_at=excluded.updated_at`,
      [
        record.id,
        JSON.stringify(record),
        record.citationId,
        record.kind,
        record.shopId,
        record.version,
        record.enabled ? 1 : 0,
        record.reviewState,
        record.updatedAt,
      ],
    );
    await this.persist();
    return record;
  }

  async listGovernedKnowledge(options: {
    kind?: GovernedKnowledgeKind;
    shopId?: string;
    citationId?: string;
    tag?: string;
    eligibleOnly?: boolean;
  } = {}): Promise<GovernedKnowledgeRecord[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.kind) {
      clauses.push("kind = ?");
      params.push(options.kind);
    }
    if (options.shopId) {
      clauses.push("shop_id = ?");
      params.push(options.shopId);
    }
    if (options.citationId) {
      clauses.push("citation_id = ?");
      params.push(options.citationId);
    }
    if (options.eligibleOnly) {
      clauses.push("enabled = 1");
      clauses.push("review_state = 'reviewed'");
    }
    const rows = this.query<GovernedKnowledgeRecord>(
      `SELECT payload FROM governed_knowledge ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC, version DESC`,
      params,
      (row) => JSON.parse(String(row.payload)) as GovernedKnowledgeRecord,
    );
    const filteredByTag = options.tag ? rows.filter((row) => row.tags.includes(options.tag!)) : rows;
    return options.eligibleOnly ? filteredByTag.filter((row) => !row.stale && !row.conflict) : filteredByTag;
  }

  async rollbackGovernedKnowledge(citationId: string, version: number): Promise<GovernedKnowledgeRecord | undefined> {
    const records = await this.listGovernedKnowledge({ citationId });
    const target = records.find((record) => record.version === version);
    if (!target) {
      return undefined;
    }
    const now = new Date().toISOString();
    for (const record of records) {
      this.updateGovernedKnowledgePayload({ ...record, enabled: record.id === target.id, updatedAt: now });
    }
    await this.persist();
    return { ...target, enabled: true, updatedAt: now };
  }

  async setGovernedKnowledgeState(
    citationId: string,
    patch: { enabled?: boolean; reviewState?: GovernedKnowledgeReviewState },
  ): Promise<GovernedKnowledgeRecord | undefined> {
    const [latest] = await this.listGovernedKnowledge({ citationId });
    if (!latest) {
      return undefined;
    }
    const now = new Date().toISOString();
    const next = this.updateGovernedKnowledgePayload({
      ...latest,
      enabled: patch.enabled ?? latest.enabled,
      reviewState: patch.reviewState ?? latest.reviewState,
      updatedAt: now,
    });
    await this.persist();
    return next;
  }

  async deleteGovernedKnowledge(citationId: string): Promise<boolean> {
    const records = await this.listGovernedKnowledge({ citationId });
    if (records.length === 0) {
      return false;
    }
    this.db.run("DELETE FROM governed_knowledge WHERE citation_id = ?", [citationId]);
    await this.persist();
    return true;
  }

  async importCustomerServiceKnowledgeRows(input: {
    shopId: string;
    rows: Array<{ title: string; content: string; tags?: string[] }>;
    reviewState?: GovernedKnowledgeReviewState;
    enabled?: boolean;
    sourceType?: GovernedKnowledgeSourceType;
    sourceId?: string;
    sourceMetadata?: Record<string, unknown>;
  }): Promise<{ created: number; skippedDuplicates: number; failed: number }> {
    let created = 0;
    let skippedDuplicates = 0;
    let failed = 0;
    const seen = new Set<string>();
    for (const row of input.rows) {
      const title = row.title.trim();
      const content = row.content.trim();
      const duplicateKey = `${input.shopId}:${title}:${content}`;
      if (!title || !content) {
        failed += 1;
        continue;
      }
      if (seen.has(duplicateKey)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(duplicateKey);
      const citationId = `customer_service:${input.shopId}:${stableKnowledgeKey(`${title}-${content}`)}`;
      const existing = await this.listGovernedKnowledge({ citationId });
      if (existing.length > 0) {
        skippedDuplicates += 1;
        continue;
      }
      await this.saveGovernedKnowledge({
        citationId,
        kind: "customer_service",
        shopId: input.shopId,
        title,
        content,
        tags: row.tags ?? [],
        sourceType: input.sourceType ?? "import",
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {}),
        enabled: input.enabled ?? true,
        reviewState: input.reviewState ?? "draft",
      });
      created += 1;
    }
    return { created, skippedDuplicates, failed };
  }

  async getSettings(): Promise<AppSettings> {
    const stored = this.query<AppSettings>(
      "SELECT payload FROM settings WHERE id = 1",
      [],
      (row) => this.settingsFromStorage(JSON.parse(String(row.payload)) as AppSettings),
    )[0];
    return stored ?? defaultSettings;
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next: AppSettings = {
      ...current,
      ...settings,
      businessHours: { ...current.businessHours, ...settings.businessHours },
      knowledge: { ...current.knowledge, ...settings.knowledge },
      queue: {
        maxConcurrentConversations:
          settings.queue?.maxConcurrentConversations
          ?? current.queue?.maxConcurrentConversations
          ?? DEFAULT_QUEUE_MAX_CONCURRENT_CONVERSATIONS,
        maxAttempts:
          settings.queue?.maxAttempts
          ?? current.queue?.maxAttempts
          ?? DEFAULT_QUEUE_MAX_ATTEMPTS,
        baseBackoffMs:
          settings.queue?.baseBackoffMs
          ?? current.queue?.baseBackoffMs
          ?? DEFAULT_QUEUE_BASE_BACKOFF_MS,
        paused: settings.queue?.paused ?? current.queue?.paused ?? false,
      },
      handoff: {
        keywords: settings.handoff?.keywords ?? current.handoff?.keywords ?? [],
        intentRules: settings.handoff?.intentRules ?? current.handoff?.intentRules ?? [],
      },
      ...(settings.inferenceRuntime ? { inferenceRuntime: { ...current.inferenceRuntime, ...settings.inferenceRuntime } } : {}),
    };
    const storedNext = this.settingsToStorage(next);
    this.db.run(
      "INSERT INTO settings(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      [JSON.stringify(storedNext)],
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
      CREATE TABLE IF NOT EXISTS inbound_queue (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, message_id TEXT NOT NULL,
        account_id TEXT NOT NULL, shop_id TEXT NOT NULL, buyer_id TEXT NOT NULL,
        conversation_key TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL, attempts INTEGER NOT NULL, available_at TEXT NOT NULL,
        enqueued_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_queue_claim
        ON inbound_queue(state, available_at, enqueued_at);
      CREATE INDEX IF NOT EXISTS idx_inbound_queue_conversation
        ON inbound_queue(conversation_key, state, available_at);
      CREATE TABLE IF NOT EXISTS conversation_memory (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, shop_id TEXT NOT NULL,
        account_id TEXT NOT NULL, buyer_id TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(shop_id, account_id, buyer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_memory_scope
        ON conversation_memory(shop_id, account_id, buyer_id);
      CREATE TABLE IF NOT EXISTS agent_audit (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, shop_id TEXT NOT NULL,
        account_id TEXT NOT NULL, buyer_id TEXT NOT NULL, message_id TEXT NOT NULL,
        event_type TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_audit_scope
        ON agent_audit(shop_id, message_id, created_at);
      CREATE TABLE IF NOT EXISTS governed_knowledge (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, citation_id TEXT NOT NULL,
        kind TEXT NOT NULL, shop_id TEXT NOT NULL, version INTEGER NOT NULL,
        enabled INTEGER NOT NULL, review_state TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_governed_knowledge_scope
        ON governed_knowledge(kind, shop_id, enabled, review_state);
      CREATE INDEX IF NOT EXISTS idx_governed_knowledge_citation
        ON governed_knowledge(citation_id, version);
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

  private updateInboundQueuePayload(item: InboundQueueRecord): InboundQueueRecord {
    this.db.run(
      `UPDATE inbound_queue SET
        payload = ?, state = ?, attempts = ?, available_at = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(item), item.state, item.attempts, item.availableAt, item.updatedAt, item.id],
    );
    return item;
  }

  private updateGovernedKnowledgePayload(record: GovernedKnowledgeRecord): GovernedKnowledgeRecord {
    this.db.run(
      `UPDATE governed_knowledge SET
        payload = ?, enabled = ?, review_state = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(record), record.enabled ? 1 : 0, record.reviewState, record.updatedAt, record.id],
    );
    return record;
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

  private settingsToStorage(settings: AppSettings): AppSettings {
    if (!settings.inference?.apiKey) {
      return settings;
    }
    const encryptedApiKey = this.secrets.encrypt(settings.inference.apiKey);
    if (!encryptedApiKey) {
      return settings;
    }
    return {
      ...settings,
      inference: {
        ...settings.inference,
        apiKey: encryptedApiKey,
      },
    };
  }

  private settingsFromStorage(settings: AppSettings): AppSettings {
    if (!settings.inference?.apiKey) {
      return settings;
    }
    const apiKey = this.secrets.decrypt(settings.inference.apiKey);
    const { apiKey: _encryptedApiKey, ...inference } = settings.inference;
    return {
      ...settings,
      inference: {
        ...inference,
        ...(apiKey ? { apiKey } : {}),
      },
    };
  }
}

function buildConversationKey(message: MessageRecord): string {
  return [message.channel, message.shopId, message.accountId, message.buyerId].join(":");
}

function buildInboundDedupeKey(message: MessageRecord): string {
  return message.id
    ? `pdd-message:${message.id}`
    : [
        "pdd-fallback",
        message.channel,
        message.shopId,
        message.accountId,
        message.buyerId,
        message.type,
        message.receivedAt,
      ].join(":");
}

function minIso(current: string | undefined, candidate: string): string {
  if (!current) {
    return candidate;
  }
  return candidate < current ? candidate : current;
}

function buildGovernedKnowledgeCitationId(input: NewGovernedKnowledge): string {
  const sourceKey = input.sourceId?.trim() || stableKnowledgeKey(input.title);
  return `${input.kind}:${input.shopId}:${sourceKey}`;
}

function stableKnowledgeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || crypto.randomUUID();
}

async function openDatabase(SQL: SqlJsStatic, dbPath: string): Promise<Database> {
  try {
    return new SQL.Database(await readFile(dbPath));
  } catch {
    return new SQL.Database();
  }
}
