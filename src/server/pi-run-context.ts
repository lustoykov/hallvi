import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { piRuns } from "./db-schema";
import type { PiRun } from "./types";

/**
 * The bounded execution envelope appended before each new engineer message:
 * Run/application/Chat identity, when it was prepared, and the previous
 * attempt's actual outcome, so a failed or cancelled proposal is never
 * mistaken for a committed Decision. It carries no application state. Current
 * checks, Approval Mode and evidence come from `get_application_status` when
 * an answer depends on them; saved requirements from `search_decisions`.
 */
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
    // The engineer's accepted message: the only message a contract field may
    // quote as user-confirmed in this request.
    userMessageId: run.userMessageId,
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
