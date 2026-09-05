import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import type {
  ActivityEvent,
  ApplicationRecord,
  Chat,
  ChatMessage,
  Decision,
  Observation,
  PhaseWorkspaceRecord,
} from "./types";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repositoryUrl: text("repository_url").notNull().unique(),
  repositoryOwner: text("repository_owner").notNull(),
  repositoryName: text("repository_name").notNull(),
  environment: text("environment")
    .$type<ApplicationRecord["environment"]>()
    .notNull(),
  approvalMode: text("approval_mode")
    .$type<ApplicationRecord["approvalMode"]>()
    .notNull(),
  approvalScope: text("approval_scope").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const phaseWorkspaces = sqliteTable(
  "phase_workspaces",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    phaseKey: text("phase_key")
      .$type<PhaseWorkspaceRecord["phaseKey"]>()
      .notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.applicationId, table.phaseKey)],
);

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").$type<ChatMessage["role"]>().notNull(),
    body: text("body").notNull(),
    source: text("source").$type<ChatMessage["source"]>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_messages_chat").on(table.chatId, table.createdAt)],
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind").$type<Decision["kind"]>().notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    supersededById: text("superseded_by_id").references(
      (): AnySQLiteColumn => decisions.id,
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_decisions_application").on(table.applicationId, table.createdAt),
  ],
);

export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").$type<Observation["status"]>().notNull(),
    summary: text("summary").notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceUrl: text("source_url"),
    raw: text("raw_json", { mode: "json" }).notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [
    index("idx_observations_application_kind").on(
      table.applicationId,
      table.kind,
      sql`${table.observedAt} desc`,
    ),
  ],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_activity_workspace").on(
      table.workspaceId,
      sql`${table.createdAt} desc`,
    ),
  ],
);

type AssertExtends<Expected, Actual extends Expected> = Actual;

// This type fails compilation if any selected row drifts from its domain
// record.
export type DatabaseRowTypes = {
  application: AssertExtends<
    ApplicationRecord,
    typeof applications.$inferSelect
  >;
  workspace: AssertExtends<
    PhaseWorkspaceRecord,
    typeof phaseWorkspaces.$inferSelect
  >;
  chat: AssertExtends<Chat, typeof chats.$inferSelect>;
  message: AssertExtends<ChatMessage, typeof messages.$inferSelect>;
  decision: AssertExtends<Decision, typeof decisions.$inferSelect>;
  observation: AssertExtends<Observation, typeof observations.$inferSelect>;
  activity: AssertExtends<ActivityEvent, typeof activityEvents.$inferSelect>;
};
