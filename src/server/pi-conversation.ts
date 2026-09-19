// The app's side of a conversation. Pi keeps it, the worker owns Pi's
// sessions, and this asks the worker: for the transcript, to send, to
// continue, to stop. Hallvi's execution evidence is placed into what comes
// back by the id Pi gave each tool call.
import { activityFromTranscript } from "./pi-activity";
import { listExecutions, type ExecutionRecord } from "./operator-execution";
import { assertChatWritable, loadChat } from "./applications";
import { touchChat } from "./db";
import { sendChatMessageRequestSchema } from "./schemas";
import { listInformation } from "./saved-information";
import type { MessageBlock } from "./operator-data";
import type { Transcript } from "./pi-transcript";
import type { ChatMessage, ChatSnapshot } from "./types";
import { askWorker, WorkerUnavailableError } from "./worker-link";

const NO_WORKER: Transcript = {
  status: "idle",
  messages: [],
  calls: {},
  said: [],
};

/** What Hallvi says first in a conversation. Never sent to Pi. */
function greeting(
  chat: { id: string; kind?: "main" | "side"; createdAt: string },
  name: string,
): ChatMessage {
  return {
    id: `greeting:${chat.id}`,
    chatId: chat.id,
    role: "assistant",
    body:
      chat.kind === "main"
        ? `I’ve added ${name}. Next, I can read its repository and explain what it needs to run.`
        : `This is a read-only side chat for ${name}. I can explain the application and its execution history. Send commands and changes to the main conversation.`,
    source: "hallvi",
    status: "completed",
    createdAt: chat.createdAt,
    revision: 0,
  };
}

/**
 * Evidence where Pi's transcript puts it. Pi's calls are read from its own
 * history; Hallvi's execution records join them by the tool-call id Pi gave.
 */
function placeEvidence(
  applicationId: string,
  transcript: Transcript,
  executions: ExecutionRecord[],
) {
  const { calls } = transcript;
  const piActivity = activityFromTranscript({
    applicationId,
    transcript,
    executions,
  });
  const executionOf = new Map(
    piActivity.flatMap((record) =>
      record.executionId ? [[record.id, record.executionId] as const] : [],
    ),
  );
  const blocks = new Map<string, MessageBlock[]>();
  for (const [toolCallId, call] of Object.entries(calls).sort(
    ([, a], [, b]) => a.sequence - b.sequence,
  )) {
    const mine = blocks.get(call.replyId) ?? [];
    const executionId = executionOf.get(toolCallId);
    if (executionId) mine.push({ type: "execution", id: executionId });
    if (call.informationId)
      mine.push({ type: "saved-information", id: call.informationId });
    blocks.set(call.replyId, mine);
  }
  return {
    piActivity,
    executions: executions.map((record) => {
      const call = record.toolCallId ? calls[record.toolCallId] : undefined;
      return call ? { ...record, runId: call.replyId } : record;
    }),
    blocks,
  };
}

export async function chatSnapshot(
  applicationId: string,
  chatId: string,
): Promise<ChatSnapshot> {
  const { application, chat } = loadChat(applicationId, chatId);
  let worker = true;
  const transcript = await askWorker<Transcript>("transcript", {
    scope: { applicationId, chatId },
  }).catch((error) => {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    worker = false;
    return NO_WORKER;
  });
  const placed = placeEvidence(
    applicationId,
    transcript,
    listExecutions(applicationId),
  );
  return {
    worker: { alive: worker },
    status: transcript.status,
    messages: [
      greeting(chat, application.name),
      ...transcript.messages.map((message) => ({
        ...message,
        blocks: placed.blocks.get(message.id),
      })),
    ],
    executions: placed.executions,
    piActivity: placed.piActivity,
    information: listInformation(applicationId, "", true).filter(
      (r) => r.presentation,
    ),
  };
}

/**
 * Hand a message to Pi. Resolves only once Pi has durably taken it; any
 * failure means it was not accepted, and the sender still has it. The request
 * key is the message's id for good, so sending the same one again is safe.
 */
export async function sendChatMessage(
  applicationId: string,
  chatId: string,
  body: string,
  requestKey: string,
  delivery: NonNullable<ChatMessage["delivery"]> = "next",
) {
  const input = sendChatMessageRequestSchema.parse({
    message: body,
    requestKey,
    delivery,
  });
  assertChatWritable(loadChat(applicationId, chatId).chat);
  await askWorker("send", {
    scope: { applicationId, chatId },
    message: { id: input.requestKey, body: input.message, delivery },
  });
  touchChat(chatId);
  return chatSnapshot(applicationId, chatId);
}

/** Pi goes on with what an interruption left. Only its owner says so. */
export async function continueConversation(
  applicationId: string,
  chatId: string,
) {
  assertChatWritable(loadChat(applicationId, chatId).chat);
  await askWorker("continue", { scope: { applicationId, chatId } });
  return chatSnapshot(applicationId, chatId);
}

/** Pi ends its operation and drops what it had queued. */
export async function stopConversation(applicationId: string, chatId: string) {
  loadChat(applicationId, chatId);
  await askWorker("stop", { scope: { applicationId, chatId } });
  return chatSnapshot(applicationId, chatId);
}
