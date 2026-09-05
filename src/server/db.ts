import Database from "better-sqlite3";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  activityEvents,
  applications,
  chats,
  decisions,
  messages,
  observations,
  phaseWorkspaces,
  piRuns,
  chatSummaries,
} from "./db-schema";
import schemaVersion from "./schema-version.json";
import type {
  ActivityEvent,
  ApplicationRecord,
  Chat,
  ChatMessage,
  Decision,
  Observation,
  PhaseWorkspaceRecord,
  ExecutionHistory,
} from "./types";

const schema = {
  activityEvents,
  applications,
  chats,
  decisions,
  messages,
  observations,
  phaseWorkspaces,
  piRuns,
  chatSummaries,
};
type ServerGuyDatabase = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __serverGuyDb: ServerGuyDatabase | undefined;
}

export function databasePath() {
  return (
    process.env.SERVER_GUY_DB_PATH ??
    join(process.cwd(), ".server-guy", "server-guy.db")
  );
}

export function db(): ServerGuyDatabase {
  return (globalThis.__serverGuyDb ??= createDatabase());
}

function createDatabase(): ServerGuyDatabase {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  try {
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
    // SQLite's built-in lower() folds ASCII only. Decision text can be Unicode.
    client.function("unicode_lower", { deterministic: true }, (value) =>
      typeof value === "string" ? value.toLowerCase() : null,
    );
    assertCurrentSchema(client, path);
    return drizzle({ client, schema });
  } catch (error) {
    client.close();
    throw error;
  }
}

function assertCurrentSchema(
  client: InstanceType<typeof Database>,
  databasePath: string,
) {
  const version = client.pragma("user_version", { simple: true }) as number;
  const initialized = Boolean(
    client
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'applications'",
      )
      .get(),
  );
  if (!initialized) {
    throw new Error(`${databasePath} is not initialized. Run npm run db:push.`);
  }
  if (version !== schemaVersion.version) {
    throw new Error(
      `${databasePath} has prototype schema version ${version}; expected ${schemaVersion.version}. Run npm run db:push, or delete the disposable database and push a fresh one.`,
    );
  }
}

function now() {
  return new Date().toISOString();
}

const rowId = sql<number>`rowid`;

// Applications

export function listApplications() {
  return db()
    .select()
    .from(applications)
    .orderBy(desc(applications.createdAt), desc(rowId))
    .all();
}

export function getApplication(id: string) {
  return (
    db().select().from(applications).where(eq(applications.id, id)).get() ??
    null
  );
}

export function deleteApplication(id: string) {
  // Foreign keys remove only this application's workspace and dependent
  // records.
  db().delete(applications).where(eq(applications.id, id)).run();
}

export function getApplicationByRepository(repositoryUrl: string) {
  return (
    db()
      .select()
      .from(applications)
      .where(eq(applications.repositoryUrl, repositoryUrl))
      .get() ?? null
  );
}

export function insertApplication(
  input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">,
) {
  const timestamp = now();
  const application: ApplicationRecord = {
    ...input,
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db().insert(applications).values(application).run();
  return application;
}

// Phase workspaces

export function insertWorkspace(applicationId: string) {
  const workspace: PhaseWorkspaceRecord = {
    id: randomUUID(),
    applicationId,
    phaseKey: "start",
    createdAt: now(),
  };
  db().insert(phaseWorkspaces).values(workspace).run();
  return workspace;
}

export function getWorkspace(applicationId: string) {
  return (
    db()
      .select()
      .from(phaseWorkspaces)
      .where(
        and(
          eq(phaseWorkspaces.applicationId, applicationId),
          eq(phaseWorkspaces.phaseKey, "start"),
        ),
      )
      .get() ?? null
  );
}

// Chats and messages

export function insertChat(
  workspaceId: string,
  title: string,
  isPrimary = false,
) {
  const chat: Chat = {
    id: randomUUID(),
    workspaceId,
    title,
    isPrimary,
    createdAt: now(),
    archivedAt: null,
  };
  db().insert(chats).values(chat).run();
  return chat;
}

export function getChat(id: string) {
  return db().select().from(chats).where(eq(chats.id, id)).get() ?? null;
}

export function listChats(workspaceId: string) {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.workspaceId, workspaceId))
    .orderBy(asc(chats.createdAt), asc(rowId))
    .all();
}

// The chat list shows when each chat was last active: its newest message, or
// its creation when nothing has been sent yet.
export function listChatSummaries(workspaceId: string) {
  return listChats(workspaceId).map((chat) => ({
    ...chat,
    lastActivityAt:
      db()
        .select({ at: sql<string | null>`max(${messages.createdAt})` })
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .get()?.at ?? chat.createdAt,
  }));
}

export function archiveChat(id: string) {
  db()
    .update(chats)
    .set({ archivedAt: now() })
    .where(and(eq(chats.id, id), isNull(chats.archivedAt)))
    .run();
}

export function insertMessage(
  chatId: string,
  role: ChatMessage["role"],
  body: string,
  source: ChatMessage["source"],
  status: ChatMessage["status"] = "completed",
) {
  const message: ChatMessage = {
    id: randomUUID(),
    chatId,
    role,
    body,
    source,
    createdAt: now(),
    status,
    revision: 0,
  };
  db().insert(messages).values(message).run();
  return message;
}

export function listMessages(chatId: string) {
  return db()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(rowId))
    .all();
}

// Decisions

export function insertDecision(input: {
  applicationId: string;
  sourceMessageId: string;
  kind: Decision["kind"];
  label: string;
  value: string;
}) {
  const decision: Decision = {
    ...input,
    id: randomUUID(),
    supersededById: null,
    createdAt: now(),
  };
  db().insert(decisions).values(decision).run();
  return decision;
}

export function getDecision(id: string) {
  return (
    db().select().from(decisions).where(eq(decisions.id, id)).get() ?? null
  );
}

export function getActiveDecision(applicationId: string, id: string) {
  return (
    db()
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.id, id),
          eq(decisions.applicationId, applicationId),
          isNull(decisions.supersededById),
        ),
      )
      .get() ?? null
  );
}

export function listActiveDecisions(applicationId: string) {
  return db()
    .select()
    .from(decisions)
    .where(
      and(
        eq(decisions.applicationId, applicationId),
        isNull(decisions.supersededById),
      ),
    )
    .orderBy(asc(decisions.createdAt), asc(rowId))
    .all();
}

export function supersedeDecision(
  applicationId: string,
  previousId: string,
  replacementId: string,
) {
  const result = db()
    .update(decisions)
    .set({ supersededById: replacementId })
    .where(
      and(
        eq(decisions.id, previousId),
        eq(decisions.applicationId, applicationId),
        isNull(decisions.supersededById),
        sql`${decisions.id} <> ${replacementId}`,
        sql`exists (select 1 from decisions as replacement where replacement.id = ${replacementId} and replacement.application_id = ${applicationId} and replacement.superseded_by_id is null)`,
      ),
    )
    .returning()
    .get();
  if (!result) {
    throw new Error(
      "The Decision being corrected is missing, already replaced, or belongs to another application.",
    );
  }
  return result;
}

// Observations

export function insertObservation(
  input: Omit<Observation, "id" | "observedAt">,
) {
  const observation: Observation = {
    ...input,
    id: randomUUID(),
    observedAt: now(),
  };
  db().insert(observations).values(observation).run();
  return observation;
}

export function getObservation(id: string) {
  return (
    db().select().from(observations).where(eq(observations.id, id)).get() ??
    null
  );
}

export function latestObservation(applicationId: string, kind: string) {
  return (
    db()
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.applicationId, applicationId),
          eq(observations.kind, kind),
        ),
      )
      .orderBy(desc(observations.observedAt), desc(rowId))
      .limit(1)
      .get() ?? null
  );
}

export function listObservations(applicationId: string) {
  return db()
    .select()
    .from(observations)
    .where(eq(observations.applicationId, applicationId))
    .orderBy(desc(observations.observedAt), desc(rowId))
    .all();
}

// Activity

export function insertActivity(
  workspaceId: string,
  kind: string,
  summary: string,
  detail: string,
) {
  const activity: ActivityEvent = {
    id: randomUUID(),
    workspaceId,
    kind,
    summary,
    detail,
    createdAt: now(),
  };
  db().insert(activityEvents).values(activity).run();
}

export function listActivity(workspaceId: string) {
  return db()
    .select({ event: activityEvents, run: piRuns })
    .from(activityEvents)
    .leftJoin(piRuns, eq(activityEvents.id, piRuns.id))
    .where(eq(activityEvents.workspaceId, workspaceId))
    .orderBy(desc(activityEvents.createdAt), desc(sql`${activityEvents}.rowid`))
    .all()
    .map(({ event, run }): ActivityEvent => {
      if (event.kind !== "chat-execution") return event;
      return {
        ...event,
        detail: "",
        execution: JSON.parse(event.detail) as ExecutionHistory,
        run,
      };
    });
}

export function withTransaction<T>(work: () => T): T {
  return db().transaction(() => work(), { behavior: "immediate" });
}
