import { listMessages } from "./db";
import type { PiRun } from "./types";
export function buildPiRunContext(run: PiRun) {
  const previous = listMessages(run.chatId)
    .filter((m) => m.id !== run.id && m.responseTo && m.startedAt)
    .at(-1);
  return JSON.stringify({
    createdAt: new Date().toISOString(),
    responseId: run.id,
    applicationId: run.applicationId,
    chatId: run.chatId,
    previousAttempt: previous
      ? {
          responseId: previous.id,
          status: previous.status,
          outcome:
            "Read execution history for actual effects. A stopped or failed turn may already have changed the server. Check uncertain outcomes before repeating work.",
        }
      : null,
  });
}
