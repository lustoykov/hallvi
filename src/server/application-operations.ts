import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { applicationOperations } from "./db-schema";

/** Web handlers and the separate worker share this guard through SQLite. */
export function hasApplicationOperation(applicationId: string) {
  const rows = db()
    .select()
    .from(applicationOperations)
    .where(eq(applicationOperations.applicationId, applicationId))
    .all();
  let active = false;
  for (const row of rows) {
    try {
      process.kill(row.pid, 0);
      active = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") active = true;
      else
        db()
          .delete(applicationOperations)
          .where(eq(applicationOperations.id, row.id))
          .run();
    }
  }
  return active;
}
export async function duringApplicationOperation<T>(
  applicationId: string,
  work: () => Promise<T>,
): Promise<T> {
  const id = randomUUID();
  db()
    .insert(applicationOperations)
    .values({ id, applicationId, pid: process.pid })
    .run();
  try {
    return await work();
  } finally {
    db()
      .delete(applicationOperations)
      .where(eq(applicationOperations.id, id))
      .run();
  }
}
