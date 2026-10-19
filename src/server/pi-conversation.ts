// The app's side of a conversation. Pi keeps it, the worker owns Pi's
// sessions, and this asks the worker: for the transcript, to send, to
// continue, to stop. Hallvi's execution evidence is placed into what comes
// back by the id Pi gave each tool call.
import {
  activityFromTranscript,
  callDetail,
  placeExecutions,
  type TranscriptSummary,
} from "./pi-activity";
import { activitySummary, executionSummary } from "./chat-evidence";
import type { CallDetail, CallReference } from "@/lib/call-detail";
import {
  listExecutions,
  readExecution,
  type ExecutionRecord,
} from "./operator-execution";
import { z } from "zod";
import { assertChatWritable, loadChat, NotFoundError } from "./applications";
import { touchChat } from "./db";
import { sendChatMessageRequestSchema } from "./schemas";
import { listInformation } from "./saved-information";
import type { MessageBlock } from "./operator-data";
import type { Transcript, TranscriptCall } from "./pi-transcript";
import type { ChatMessage, ChatSnapshot } from "./types";
import {
  askWorker,
  WorkerRefusal,
  WorkerUnavailableError,
} from "./worker-link";

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
        ? `I’ve added ${name}. Once I’ve read its repository, I’ll explain what it needs to run.`
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
  transcript: Transcript | TranscriptSummary,
  executions: ExecutionRecord[],
) {
  const piActivity =
    "piActivity" in transcript
      ? placeExecutions(transcript.piActivity, executions)
      : activityFromTranscript({ applicationId, transcript, executions });
  const calls = new Map(
    piActivity
      .filter((record) => record.kind === "tool")
      .map((record) => [record.id, record]),
  );
  const blocks = new Map<string, MessageBlock[]>();
  for (const call of calls.values()) {
    const mine = blocks.get(call.runId) ?? [];
    if (call.executionId)
      mine.push({ type: "execution", id: call.executionId });
    if (call.informationId)
      mine.push({ type: "saved-information", id: call.informationId });
    blocks.set(call.runId, mine);
  }
  return {
    piActivity,
    executions: executions.map((record) => {
      const call = record.toolCallId ? calls.get(record.toolCallId) : undefined;
      return call ? { ...record, runId: call.runId } : record;
    }),
    blocks,
  };
}

/**
 * The conversation with its evidence placed, for a reader that must not take
 * an absent worker for an empty conversation: without one this throws.
 */
export async function readConversation(applicationId: string, chatId: string) {
  await loadChat(applicationId, chatId);
  const transcript = await askWorker<Transcript>("transcript", {
    scope: { applicationId, chatId },
  });
  return {
    transcript,
    ...placeEvidence(
      applicationId,
      transcript,
      await listExecutions(applicationId),
    ),
  };
}

/** One call's redacted detail, read only when a reader opens its disclosure. */
export async function readCallDetail(
  applicationId: string,
  chatId: string,
  callId: string,
  reference: CallReference = {},
): Promise<CallDetail> {
  await loadChat(applicationId, chatId);
  if (z.uuid().safeParse(callId).success) {
    const execution = await readExecution(applicationId, callId);
    if (execution) {
      if (execution.chatId !== chatId)
        throw new NotFoundError("This call is not in the conversation.");
      return { execution };
    }
  }
  if (reference.entryId !== undefined) {
    const { call } = await askWorker<{
      call?: Pick<TranscriptCall, "args" | "result" | "preview">;
    }>("call", {
      scope: { applicationId, chatId },
      message: {
        id: callId,
        entryId: reference.entryId,
        resultEntryId: reference.resultEntryId,
      },
    });
    if (!call) throw new NotFoundError("This call is not in the conversation.");
    const execution = reference.executionId
      ? await readExecution(applicationId, reference.executionId)
      : undefined;
    if (
      execution &&
      (execution.chatId !== chatId || execution.toolCallId !== callId)
    )
      throw new NotFoundError(
        "This execution is not this conversation's call.",
      );
    return { activity: callDetail(callId, call), execution };
  }
  // Already-open older pages have no immutable entry references.
  const { piActivity, executions } = await readConversation(
    applicationId,
    chatId,
  );
  const activity = piActivity.find(
    (record) => record.kind === "tool" && record.id === callId,
  );
  const execution = executions.find(
    (record) =>
      record.chatId === chatId &&
      (record.id === activity?.executionId ||
        record.id === callId ||
        record.toolCallId === callId),
  );
  if (!activity && !execution)
    throw new NotFoundError("This call is not in the conversation.");
  return { activity, execution };
}

export async function chatSnapshot(
  applicationId: string,
  chatId: string,
  compact = true,
): Promise<ChatSnapshot> {
  const { application, chat } = await loadChat(applicationId, chatId);
  let worker = true;
  const transcript = await askWorker<Transcript | TranscriptSummary>(
    "transcript",
    {
      scope: { applicationId, chatId },
      message: compact ? { compact: true } : undefined,
    },
  ).catch((error) => {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    worker = false;
    return NO_WORKER;
  });
  const placed = placeEvidence(
    applicationId,
    transcript,
    await listExecutions(applicationId),
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
    executions: compact
      ? placed.executions.map(executionSummary)
      : placed.executions,
    // A worker kept alive across a dev refresh may ignore the compact flag.
    piActivity:
      compact && !("piActivity" in transcript)
        ? placed.piActivity.map(activitySummary)
        : placed.piActivity,
    information: (await listInformation(applicationId, "", true)).filter(
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
  images?: { mimeType: string; data: string }[],
  origin?: ChatMessage["origin"],
) {
  const input = sendChatMessageRequestSchema.parse({
    message: body,
    requestKey,
    delivery,
    images,
    origin,
  });
  assertChatWritable((await loadChat(applicationId, chatId)).chat);
  await askWorker("send", {
    scope: { applicationId, chatId },
    message: {
      id: input.requestKey,
      body: input.message,
      delivery,
      images: input.images,
      origin: input.origin,
    },
  });
  await touchChat(chatId);
  return chatSnapshot(applicationId, chatId);
}

/**
 * An image the owner attached, read back from Pi's history. The transcript
 * only counts them, so a conversation with pictures stays light to watch.
 */
export async function chatImage(
  applicationId: string,
  chatId: string,
  messageId: string,
  index: number,
) {
  await loadChat(applicationId, chatId);
  const image = await askWorker<{ mimeType: string; data: string }>("image", {
    scope: { applicationId, chatId },
    message: { id: messageId, index },
  }).catch((error) => {
    throw error instanceof WorkerRefusal && error.code === "missing"
      ? new NotFoundError(error.message)
      : error;
  });
  return { mimeType: image.mimeType, bytes: Buffer.from(image.data, "base64") };
}

/** Pi goes on with what an interruption left. Only its owner says so. */
export async function continueConversation(
  applicationId: string,
  chatId: string,
) {
  assertChatWritable((await loadChat(applicationId, chatId)).chat);
  await askWorker("continue", { scope: { applicationId, chatId } });
  return chatSnapshot(applicationId, chatId);
}

/** Pi ends its operation and drops what it had queued. */
export async function stopConversation(applicationId: string, chatId: string) {
  await loadChat(applicationId, chatId);
  await askWorker("stop", { scope: { applicationId, chatId } });
  return chatSnapshot(applicationId, chatId);
}
