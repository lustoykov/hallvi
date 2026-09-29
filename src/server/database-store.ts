import Database from "better-sqlite3";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  keepRuntimeOpen,
  readMark,
  retainedRefusal,
} from "../../scripts/retained-state.mjs";

import { applications, chats, savedInformation } from "./db-schema";
import schemaVersion from "./schema-version.json";
import type { ApplicationRecord, Observation } from "./types";

const schema = { applications, chats, savedInformation };
type HallviDatabase = ReturnType<typeof drizzle<typeof schema>>;

let database: HallviDatabase;
let runtimeHold: { release: () => void } | undefined;

function db() {
  return database;
}

// Called only in the database thread, before accepting requests. Ownership is
// checked before opening the application file or creating a WAL beside it.
export function openDatabase(path: string) {
  const refusal = retainedRefusal(path);
  if (refusal) throw new Error(refusal);
  try {
    if (readMark(dirname(path))) runtimeHold = keepRuntimeOpen(dirname(path));
    mkdirSync(dirname(path), { recursive: true });
    const client = new Database(path);
    try {
      client.pragma("journal_mode = WAL");
      client.pragma("foreign_keys = ON");
      client.pragma("busy_timeout = 5000");
      assertCurrentSchema(client, path);
      database = drizzle({ client, schema });
    } catch (error) {
      client.close();
      throw error;
    }
  } catch (error) {
    runtimeHold?.release();
    runtimeHold = undefined;
    throw error;
  }
}

export function closeDatabase() {
  database?.$client.close();
  runtimeHold?.release();
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
      `${databasePath} has schema version ${version}; expected ${schemaVersion.version}. Stop the app and worker. A supported schema is migrated in place, with a verified copy kept first, by npm run db:upgrade; an empty database is created by npm run db:push.`,
    );
  }
}

function now() {
  return new Date().toISOString();
}

const rowId = sql<number>`rowid`;

// Applications

function listApplications() {
  return db()
    .select()
    .from(applications)
    .orderBy(desc(applications.createdAt), desc(rowId))
    .all();
}

function getApplication(id: string) {
  return (
    db().select().from(applications).where(eq(applications.id, id)).get() ??
    null
  );
}

function deleteApplication(id: string) {
  // Foreign keys remove only this application's dependent records.
  db().delete(applications).where(eq(applications.id, id)).run();
}

function renameApplicationRow(id: string, name: string) {
  db()
    .update(applications)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(applications.id, id))
    .run();
}

function insertApplication(
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

// Chats

function insertChat(applicationId: string, title?: string) {
  return db().transaction(
    () => {
      const existing = listApplicationChats(applicationId);
      const chat = {
        id: randomUUID(),
        applicationId,
        title: title ?? `Conversation ${existing.length + 1}`,
        kind: existing.length ? ("side" as const) : ("main" as const),
        createdAt: now(),
        updatedAt: now(),
        archivedAt: null,
      };
      db().insert(chats).values(chat).run();
      return chat;
    },
    { behavior: "immediate" },
  );
}

function getChat(id: string) {
  return db().select().from(chats).where(eq(chats.id, id)).get() ?? null;
}

function listApplicationChats(applicationId: string) {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.applicationId, applicationId))
    .orderBy(asc(chats.createdAt), asc(rowId))
    .all();
}

// The chat list shows when each chat was last written in by its owner, or its
// creation when nothing has been sent yet.
function listApplicationChatSummaries(applicationId: string) {
  return listApplicationChats(applicationId).map((chat) => ({
    ...chat,
    lastActivityAt: chat.updatedAt,
  }));
}

function touchChat(id: string) {
  db().update(chats).set({ updatedAt: now() }).where(eq(chats.id, id)).run();
}

function archiveChat(id: string) {
  db()
    .update(chats)
    .set({ archivedAt: now() })
    .where(and(eq(chats.id, id), isNull(chats.archivedAt)))
    .run();
}

// The latest repository access check is application configuration.
function latestObservation(applicationId: string) {
  return getApplication(applicationId)?.repositoryCheck ?? null;
}
function insertObservation(input: Omit<Observation, "id" | "observedAt">) {
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

// This operation crosses the thread boundary once. No callback or transaction
// handle leaves this thread, and its synchronous body cannot interleave.
function createApplicationRecords(
  input: Parameters<typeof insertApplication>[0],
  id?: string,
) {
  return db().transaction(
    () => {
      const existing = id ? getApplication(id) : null;
      if (existing) return { application: existing, created: false };
      const application = insertApplication(input, id);
      insertChat(application.id, "Main operator");
      return { application, created: true };
    },
    { behavior: "immediate" },
  );
}

function setNativeSessionId(chatId: string, nativeSessionId: string) {
  return db()
    .update(chats)
    .set({ nativeSessionId })
    .where(and(eq(chats.id, chatId), isNull(chats.nativeSessionId)))
    .run().changes;
}

function updateOperatorSettings(
  applicationId: string,
  settings: Pick<ApplicationRecord, "permissionMode" | "host">,
) {
  db()
    .update(applications)
    .set({ ...settings, updatedAt: now() })
    .where(eq(applications.id, applicationId))
    .run();
}

function listInformation(
  applicationId: string,
  query = "",
  includeRetired = false,
) {
  const records = db()
    .select()
    .from(savedInformation)
    .where(
      and(
        eq(savedInformation.applicationId, applicationId),
        includeRetired ? undefined : isNull(savedInformation.retiredAt),
      ),
    )
    .orderBy(desc(savedInformation.updatedAt))
    .all();
  const search = query.toLowerCase();
  return records.filter((r) =>
    `${r.title}\n${r.body}`.toLowerCase().includes(search),
  );
}
function saveInformationRow(
  applicationId: string,
  value: Omit<
    typeof savedInformation.$inferInsert,
    "id" | "applicationId" | "createdAt" | "updatedAt" | "retiredAt"
  >,
  id?: string,
) {
  return db().transaction(
    () => {
      // An ID names a record that already exists here. Record IDs are unique
      // across every application, so inventing one for a new record would
      // eventually land on another application's record; saying what to do
      // instead is what Pi needs, and it can act on it in the same turn.
      if (
        id &&
        !db()
          .select()
          .from(savedInformation)
          .where(
            and(
              eq(savedInformation.id, id),
              eq(savedInformation.applicationId, applicationId),
            ),
          )
          .get()
      )
        throw new Error(
          "No saved information has that ID in this application. Omit id to create a record; supply id only to update one a previous save returned.",
        );
      const now = new Date().toISOString();
      if (id)
        return db()
          .update(savedInformation)
          .set({ ...value, updatedAt: now })
          .where(
            and(
              eq(savedInformation.id, id),
              eq(savedInformation.applicationId, applicationId),
            ),
          )
          .returning()
          .get()!;
      return db()
        .insert(savedInformation)
        .values({
          ...value,
          id: randomUUID(),
          applicationId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    },
    { behavior: "immediate" },
  );
}
function retireInformation(applicationId: string, id: string) {
  const now = new Date().toISOString();
  const record = db()
    .update(savedInformation)
    .set({ retiredAt: now, updatedAt: now })
    .where(
      and(
        eq(savedInformation.id, id),
        eq(savedInformation.applicationId, applicationId),
      ),
    )
    .returning()
    .get();
  if (!record) throw new Error("Saved information not found.");
  return record;
}

// Backup and journal conversion also execute away from Pi's event loop.
async function backupDatabase(target: string) {
  await db().$client.backup(target);
  const copy = new Database(target);
  try {
    copy.pragma("journal_mode = DELETE");
  } finally {
    copy.close();
  }
}

export const operations = {
  backupDatabase,
  listApplications,
  getApplication,
  deleteApplication,
  renameApplicationRow,
  insertApplication,
  createApplicationRecords,
  insertChat,
  getChat,
  listApplicationChats,
  listApplicationChatSummaries,
  touchChat,
  archiveChat,
  latestObservation,
  insertObservation,
  setNativeSessionId,
  updateOperatorSettings,
  listInformation,
  saveInformationRow,
  retireInformation,
};
