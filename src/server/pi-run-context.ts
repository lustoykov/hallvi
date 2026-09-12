import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { piRuns } from "./db-schema";
import type { PiRun } from "./types";

/** Identify this turn and its predecessor. History records actual effects. */
export function buildPiRunContext(run: PiRun) {
  const previous = db()
    .select()
    .from(piRuns)
    .where(
      and(
        eq(piRuns.chatId, run.chatId),
        ne(piRuns.id, run.id),
        isNotNull(piRuns.startedAt),
      ),
    )
    .orderBy(desc(sql`rowid`))
    .get();
  return JSON.stringify({
    createdAt: new Date().toISOString(),
    runId: run.id,
    applicationId: run.applicationId,
    chatId: run.chatId,
    previousAttempt: previous
      ? {
          runId: previous.id,
          status: previous.status,
          outcome:
            "Read execution history for actual effects. A stopped or failed turn may already have changed the server. Check uncertain outcomes before repeating work.",
        }
      : null,
  });
}
