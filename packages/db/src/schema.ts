import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  username: text("username").notNull(),
  shopId: text("shop_id").notNull(),
  shopName: text("shop_name"),
  userId: text("user_id").notNull(),
  status: text("status").notNull(),
  cookies: text("cookies"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  shopId: text("shop_id").notNull(),
  accountId: text("account_id").notNull(),
  state: text("state").notNull(),
  receivedAt: text("received_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const replyDrafts = sqliteTable("reply_drafts", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  messageId: text("message_id").notNull(),
  shopId: text("shop_id").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  scope: text("scope").notNull(),
  shopId: text("shop_id"),
  indexedAt: text("indexed_at").notNull(),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
});

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});
