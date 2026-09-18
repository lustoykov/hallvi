import Database from "better-sqlite3";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { stateLocation } from "../../scripts/state-location.mjs";

import { applications, chats, messages, savedInformation } from "./db-schema";
import schemaVersion from "./schema-version.json";
import type { ApplicationRecord, ChatMessage, Observation } from "./types";

const schema = { applications, chats, messages, savedInformation };
type HallviDatabase = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __hallviDb: HallviDatabase | undefined;
}

export function databasePath() {
  const path =
    process.env.HALLVI_DB_PATH ??
    stateLocation(/* turbopackIgnore: true */ process.cwd(), { hidden: true })
      .database;
  return path;
}

export function db(): HallviDatabase {
  return (globalThis.__hallviDb ??= createDatabase());
}

function createDatabase(): HallviDatabase {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  try {
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
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
      `${databasePath} has prototype schema version ${version}; expected ${schemaVersion.version}. Stop the app and worker, then run npm run db:push. Other prototype versions require an explicit fresh database.`,
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
  // Foreign keys remove only this application's dependent records.
  db().delete(applications).where(eq(applications.id, id)).run();
}

export function insertApplication(
  input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">,
  id: string = randomUUID(),
) {
  const timestamp = now();
  const application: ApplicationRecord = {
    ...input,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db().insert(applications).values(application).run();
  return application;
}

// Chats and messages

export function insertChat(applicationId: string, title: string) {
  const chat = {
    id: randomUUID(),
    applicationId,
    title,
    kind: listApplicationChats(applicationId).length
      ? ("side" as const)
      : ("main" as const),
    createdAt: now(),
    updatedAt: now(),
    archivedAt: null,
  };
  db().insert(chats).values(chat).run();
  return chat;
}

export function getChat(id: string) {
  return db().select().from(chats).where(eq(chats.id, id)).get() ?? null;
}

export function listApplicationChats(applicationId: string) {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.applicationId, applicationId))
    .orderBy(asc(chats.createdAt), asc(rowId))
    .all();
}

// The chat list shows when each chat was last active: its newest message, or
// its creation when nothing has been sent yet.
export function listApplicationChatSummaries(applicationId: string) {
  return listApplicationChats(applicationId).map((chat) => ({
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
  const message = {
    id: randomUUID(),
    chatId,
    role,
    body,
    blocks: [],
    source,
    createdAt: now(),
    updatedAt: now(),
    status,
    revision: 0,
  };
  db().insert(messages).values(message).run();
  return message;
}

export function getMessage(id: string) {
  return db().select().from(messages).where(eq(messages.id, id)).get() ?? null;
}

export function listMessages(chatId: string) {
  return db()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(rowId))
    .all();
}

// The latest repository access check is application configuration.
export function latestObservation(applicationId: string) {
  return getApplication(applicationId)?.repositoryCheck ?? null;
}
export function insertObservation(
  input: Omit<Observation, "id" | "observedAt">,
) {
  const observation: Observation = {
    ...input,
    id: randomUUID(),
    observedAt: now(),
  };
  const raw = input.raw as { repositoryId?: number } | null;
  db()
    .update(applications)
    .set({
      repositoryCheck: observation,
      ...(input.status === "passed" && raw?.repositoryId
        ? { repositoryId: raw.repositoryId }
        : {}),
      updatedAt: now(),
    })
    .where(eq(applications.id, input.applicationId))
    .run();
  return observation;
}

let committedCallbacks: (() => void)[] | undefined;

// Diagnostic callbacks wait for the outermost commit. Nested rollback discards
// only its callbacks; a later outer rollback discards all queued claims.
export function withTransaction<T>(
  work: () => T,
  onCommit?: (value: T) => void,
): T {
  const parent = committedCallbacks;
  const callbacks: (() => void)[] = [];
  committedCallbacks = callbacks;
  try {
    const result = db().transaction(() => work(), { behavior: "immediate" });
    committedCallbacks = parent;
    if (onCommit) callbacks.push(() => onCommit(result));
    if (parent) parent.push(...callbacks);
    else
      for (const callback of callbacks) {
        try {
          callback();
        } catch {
          /* Diagnostics never alter committed state. */
        }
      }
    return result;
  } finally {
    committedCallbacks = parent;
  }
}
