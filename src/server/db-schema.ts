import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ChatMessage, Observation } from "./types";
import type {
  ConversationStatus,
  MessageBlock,
  OperatorSettings,
  SavedInformation,
} from "./operator-data";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repositoryUrl: text("repository_url").notNull(),
  repositoryOwner: text("repository_owner").notNull(),
  repositoryName: text("repository_name").notNull(),
  repositoryId: integer("repository_id"),
  repositoryCheck: text("repository_check", {
    mode: "json",
  }).$type<Observation>(),
  permissionMode: text("permission_mode")
    .$type<OperatorSettings["permissionMode"]>()
    .notNull()
    .default("pi-decides"),
  host: text("host", { mode: "json" }).$type<OperatorSettings["host"]>(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const chats = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").$type<"main" | "side">().notNull().default("side"),
    status: text("status")
      .$type<ConversationStatus>()
      .notNull()
      .default("idle"),
    currentResponseId: text("current_response_id"),
    nativeSessionId: text("native_session_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("one_main_conversation")
      .on(table.applicationId)
      .where(sql`${table.kind} = 'main'`),
  ],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("conversation_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").$type<ChatMessage["role"]>().notNull(),
    body: text("body").notNull(),
    blocks: text("blocks", { mode: "json" })
      .$type<MessageBlock[]>()
      .notNull()
      .default([]),
    source: text("source").$type<ChatMessage["source"]>().notNull(),
    status: text("status")
      .$type<ChatMessage["status"]>()
      .notNull()
      .default("completed"),
    revision: integer("revision").notNull().default(0),
    responseTo: text("response_to"),
    requestKey: text("request_key"),
    retryOfId: text("retry_of_id").unique(),
    error: text("error"),
    piCalls: integer("pi_calls").notNull().default(0),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("messages_conversation").on(table.chatId, table.createdAt),
    uniqueIndex("message_request").on(table.chatId, table.requestKey),
  ],
);
export const savedInformation = sqliteTable(
  "saved_information",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: text("evidence", { mode: "json" })
      .$type<SavedInformation["evidence"]>()
      .notNull(),
    establishedAt: text("established_at"),
    presentation: text("presentation", { mode: "json" }).$type<
      SavedInformation["presentation"]
    >(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    retiredAt: text("retired_at"),
  },
  (table) => [index("information_application").on(table.applicationId)],
);
