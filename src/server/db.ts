import { DatabaseClient } from "./database-client";
import { databasePath } from "./database-path";
import type { operations } from "./database-store";
export { databasePath } from "./database-path";

declare global {
  var __hallviDatabaseClient: DatabaseClient | undefined;
}

function client() {
  return (globalThis.__hallviDatabaseClient ??= new DatabaseClient(
    databasePath(),
    () => {
      // A lost acknowledgement may have committed. Never replay a write, or
      // keep Pi running after the thread holding retained ownership has died.
      console.error(
        "The database worker stopped unexpectedly. Restart Hallvi; pending database outcomes are unknown.",
      );
      process.exit(1);
    },
  ));
}

export async function closeDatabase() {
  const current = globalThis.__hallviDatabaseClient;
  if (current) {
    await current.close();
    if (globalThis.__hallviDatabaseClient === current)
      delete globalThis.__hallviDatabaseClient;
  }
}

function operation<K extends keyof typeof operations>(name: K) {
  return (
    ...args: Parameters<(typeof operations)[K]>
  ): Promise<Awaited<ReturnType<(typeof operations)[K]>>> =>
    client().call(name, args);
}

export const listApplications = operation("listApplications");
export const getApplication = operation("getApplication");
export const deleteApplication = operation("deleteApplication");
export const renameApplicationRow = operation("renameApplicationRow");
export const insertApplication = operation("insertApplication");
export const createApplicationRecords = operation("createApplicationRecords");
export const insertChat = operation("insertChat");
export const getChat = operation("getChat");
export const listApplicationChats = operation("listApplicationChats");
export const listApplicationChatSummaries = operation(
  "listApplicationChatSummaries",
);
export const touchChat = operation("touchChat");
export const archiveChat = operation("archiveChat");
export const latestObservation = operation("latestObservation");
export const insertObservation = operation("insertObservation");
export const setNativeSessionId = operation("setNativeSessionId");
export const updateOperatorSettings = operation("updateOperatorSettings");
export const listInformation = operation("listInformation");
export const saveInformationRow = operation("saveInformationRow");
export const retireInformation = operation("retireInformation");

export const backupDatabase = operation("backupDatabase");
