import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { piRuns } from "./db-schema";
import type { PiRun } from "./types";

export class PiRunContextError extends Error {}

export function buildPiRunContext(run: PiRun, viewSummary: string) {
  if (!viewSummary.trim() || viewSummary.length > 12_000)
    throw new PiRunContextError(
      "Current application checks could not fit in the Run context. No model request was started.",
    );
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
    observedAt: new Date().toISOString(),
    runId: run.id,
    applicationId: run.applicationId,
    chatId: run.chatId,
    currentApplication: viewSummary,
    previousAttempt: previous
      ? {
          runId: previous.id,
          status: previous.status,
          savedOutcome:
            previous.status === "succeeded"
              ? "The final answer and its accepted proposals were committed. Look up Decisions when current values matter."
              : "Its proposals were pending, not saved; none were committed. Historical text is not evidence of a saved effect.",
        }
      : null,
  });
}
