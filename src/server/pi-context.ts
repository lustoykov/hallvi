import { eq, sql } from "drizzle-orm";
import { db, listMessages, withTransaction } from "./db";
import { chatSummaries, piRuns } from "./db-schema";
import { getPiRun, recordPiCall } from "./pi-runs";
import { summarizePiChat } from "./pi";
import type { ChatMessage, PiRun } from "./types";

export const CONTEXT_LIMITS = {
  recentCharacters: 16_000,
  recentExchanges: 8,
  summaryCharacters: 6_000,
  summaryChunkCharacters: 20_000,
  decisionCharacters: 24_000,
  viewCharacters: 12_000,
} as const;

type Exchange = { endId: string; messages: ChatMessage[]; text: string };
export class PiContextError extends Error {}

function completedExchanges(run: PiRun): Exchange[] {
  const transcript = listMessages(run.chatId);
  const attempts = db()
    .select()
    .from(piRuns)
    .where(eq(piRuns.chatId, run.chatId))
    .orderBy(sql`rowid`)
    .all();
  const acceptedUsers = new Set(
    attempts.map((attempt) => attempt.userMessageId),
  );
  const successfulAnswers = new Map(
    attempts
      .filter((attempt) => attempt.status === "succeeded")
      .map((attempt) => [attempt.assistantMessageId, attempt]),
  );
  const byId = new Map(transcript.map((message) => [message.id, message]));
  return transcript.flatMap((message): Exchange[] => {
    // An exchange is ordered by its answer placeholder (a retry has a new one).
    // Pending/failed user inputs never become a completed conversational pair.
    if (message.status !== "completed" || acceptedUsers.has(message.id))
      return [];
    const attempt = successfulAnswers.get(message.id);
    const pair = attempt
      ? [byId.get(attempt.userMessageId)!, message]
      : [message];
    return [
      {
        endId: message.id,
        messages: pair,
        text: pair
          .map((part) => `${part.role.toUpperCase()}: ${part.body}`)
          .join("\n"),
      },
    ];
  });
}

export async function boundedChatContext(run: PiRun, signal: AbortSignal) {
  const exchanges = completedExchanges(run);
  let saved = db()
    .select()
    .from(chatSummaries)
    .where(eq(chatSummaries.chatId, run.chatId))
    .get();
  let covered = saved
    ? exchanges.findIndex(
        (exchange) => exchange.endId === saved!.coveredMessageId,
      ) + 1
    : 0;
  if (saved && !covered)
    throw new PiContextError(
      "Chat summary coverage is invalid; no messages were sent to Pi. This Chat needs its summary repaired before retrying.",
    );
  let recentStart = exchanges.length;
  let characters = 0;
  while (
    recentStart > covered &&
    exchanges.length - recentStart < CONTEXT_LIMITS.recentExchanges
  ) {
    const candidate = exchanges[recentStart - 1];
    if (characters + candidate.text.length > CONTEXT_LIMITS.recentCharacters)
      break;
    characters += candidate.text.length;
    recentStart -= 1;
  }
  while (covered < recentStart) {
    signal.throwIfAborted();
    let end = covered;
    let chunk = "";
    while (
      end < recentStart &&
      chunk.length + exchanges[end].text.length + 2 <=
        CONTEXT_LIMITS.summaryChunkCharacters
    ) {
      chunk += `${exchanges[end].text}\n\n`;
      end += 1;
    }
    if (end === covered)
      throw new PiContextError(
        "A Chat exchange exceeds the summary input budget. No reply was generated; use a new Chat or adjust the budget.",
      );
    recordPiCall(run.id);
    const body = await summarizePiChat(saved?.body ?? "", chunk, {
      signal,
    }).catch(() => {
      throw new PiContextError(
        "The older Chat summary could not be refreshed. Retry when ready; its previous coverage was preserved.",
      );
    });
    if (!body.trim() || body.length > CONTEXT_LIMITS.summaryCharacters)
      throw new PiContextError(
        "The Chat summary exceeded its size limit or was empty. Retry when ready; its previous coverage was preserved.",
      );
    signal.throwIfAborted();
    saved = withTransaction(() => {
      if (getPiRun(run.id)?.status !== "running")
        throw new Error("This attempt is no longer running.");
      const next = {
        chatId: run.chatId,
        body,
        coveredMessageId: exchanges[end - 1].endId,
        updatedAt: new Date().toISOString(),
      };
      db()
        .insert(chatSummaries)
        .values(next)
        .onConflictDoUpdate({ target: chatSummaries.chatId, set: next })
        .run();
      return next;
    });
    covered = end;
  }
  return {
    summary: saved?.body ?? "",
    messages: exchanges.slice(covered).flatMap((exchange) => exchange.messages),
  };
}
