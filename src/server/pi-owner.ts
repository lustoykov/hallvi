// The worker's side of every conversation: it alone opens Pi's sessions.
//
// Pi owns what was said, what waits, what runs and what an interruption left
// behind. This answers the app's requests by asking Pi, drives a lane while it
// has work, and writes down the evidence of what Pi's tools did. It keeps no
// record of its own about a message or a reply.
import {
  BACKGROUND_CONTEXT as ctx,
  reduceLaneSnapshot,
  type AgentMessage,
  type Entry,
  type LaneSnapshot,
} from "@earendil-works/pi-agent-core";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { assertChatWritable, loadChat } from "./applications";
import { openPiSession, watchPiSession } from "./pi";
import { listApplications } from "./db";
import {
  earlierHistoryPath,
  readNativeConversation,
  removeNativeSessions,
} from "./pi-sessions";
import {
  abortedTips,
  holds,
  laneView,
  MESSAGE_TAG,
  projectTranscript,
  queueOperation,
  unfinished,
  type Transcript,
} from "./pi-transcript";
import { settleRunningExecutions } from "./operator-execution";
import { beginRunDiagnostics } from "./tracing";
import type { PiReply } from "./types";
import { serveWorker, WorkerRefusal } from "./worker-link";

export interface Scope {
  applicationId: string;
  chatId: string;
}

export interface SentMessage {
  /** The sender's own id for it: the same send twice is one message. */
  id: string;
  body: string;
  delivery: "next" | "steer";
}

interface Opened extends Scope {
  lane: Awaited<ReturnType<typeof openPiSession>>["lane"];
  /** Pi's lane as it stands, kept current by Pi's own reducer. */
  snapshot: () => LaneSnapshot;
  fresh: () => Promise<LaneSnapshot>;
  /**
   * Pi's whole branch, and where Pi says an operation was aborted: both read
   * again only when the branch's tip has moved.
   */
  history: () => Promise<{ entries: Entry[]; abortedAt: Set<string> }>;
  /** One trace per stretch of work, ended with how Pi says it ended. */
  trace(id: string | null, outcome?: PiReply["status"]): void;
  close: () => Promise<void>;
  /** Set while this worker runs the lane. */
  driving: boolean;
  /** Settles when this worker has let go of the lane. */
  done?: Promise<void>;
  /** What each call in flight has streamed back, by Pi's tool-call id. */
  previews: Map<string, string>;
}

/** A result-so-far as text, for the line under a call that is still running. */
function partialText(partial: unknown): string {
  if (typeof partial === "string") return partial;
  if (partial && typeof partial === "object") {
    const content = (partial as { content?: unknown }).content;
    if (Array.isArray(content))
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : "",
        )
        .join("");
    const output = (partial as { output?: unknown }).output;
    if (typeof output === "string") return output;
  }
  return partial === undefined || partial === null ? "" : String(partial);
}

const toPi = (message: SentMessage): AgentMessage =>
  ({
    role: "user",
    content: [{ type: "text", text: message.body }],
    timestamp: Date.now(),
    [MESSAGE_TAG]: message.id,
  }) as AgentMessage;

const NOTHING: Transcript = {
  status: "idle",
  messages: [],
  calls: {},
  said: [],
};

export function sessionOwner(
  options: { signal?: AbortSignal; stopTimeoutMs?: number } = {},
) {
  /** The worker is going away: Pi keeps what it has, and nothing goes on. */
  let closing = false;
  /**
   * An update is about to stop this worker, and has asked it to stop taking
   * work first. The deadline is not a policy: it is what keeps a held worker
   * from staying held for ever if whoever asked never comes back.
   */
  let heldUntil = 0;
  const opened = new Map<string, Opened>();
  /** One thing at a time per conversation; reads of an open one skip this. */
  const lines = new Map<string, Promise<unknown>>();
  const inLine = <T>(chatId: string, work: () => Promise<T>): Promise<T> => {
    const next = (lines.get(chatId) ?? Promise.resolve()).then(work, work);
    lines.set(
      chatId,
      next.catch(() => undefined),
    );
    return next;
  };

  async function open(scope: Scope) {
    const session = await openPiSession(scope, options);
    const watch = await session.lane.watch(ctx);
    let snapshot = watch.snapshot;
    const fresh = async () => (snapshot = await watch.resnapshot(ctx));
    watch.start((event) => {
      if (reduceLaneSnapshot(snapshot, event)) void fresh();
    });
    let read:
      | { tipId: string | null; entries: Entry[]; abortedAt: Set<string> }
      | undefined;
    const history = async () => {
      const { tipId } = snapshot;
      if (read?.tipId !== tipId) {
        const entries = await session.lane.findEntries(
          { order: "oldestFirst" },
          ctx,
        );
        // Pi keeps how each operation ended, and the entry it ended at.
        const abortedAt = await abortedTips(entries, (id) =>
          session.lane.getResult(id, ctx),
        );
        read = { tipId, entries, abortedAt };
      }
      return read;
    };
    // What a call has streamed back so far. Pi writes the call and its
    // result to its own history; only the in-between is nobody's record, and
    // a short-lived read has no business on disk. It lives here while the
    // call does, and a lost worker takes it with it — which is honest, since
    // a call whose worker is gone is not producing anything either.
    const previews = new Map<string, string>();
    const recording = watchPiSession(session.harness, {
      onActivity: (event) => diagnostics?.signal(event),
      onTool(event) {
        if (event.type === "start") previews.delete(event.id);
        // The runtime sends a result-so-far, never an increment.
        else if (event.type === "update")
          previews.set(event.id, partialText(event.partial));
        else if (event.type === "end") previews.delete(event.id);
      },
    });
    let diagnostics: ReturnType<typeof beginRunDiagnostics> | undefined;
    const conversation = {
      ...scope,
      lane: session.lane,
      previews,
      snapshot: () => snapshot,
      fresh,
      history,
      driving: false,
      done: undefined as Promise<void> | undefined,
      trace(id: string | null, outcome: PiReply["status"] = "completed") {
        diagnostics?.finish(outcome);
        const now = new Date().toISOString();
        diagnostics = id
          ? beginRunDiagnostics({
              id,
              ...scope,
              status: "running",
              createdAt: now,
              startedAt: now,
            })
          : undefined;
      },
      async close() {
        recording.unsubscribe();
        watch.unsubscribe();
        conversation.trace(null);
        await session.close();
      },
    };
    opened.set(scope.chatId, conversation);
    return conversation;
  }

  async function shut(conversation: Opened) {
    opened.delete(conversation.chatId);
    await conversation.close();
  }

  /** The conversation as it stands, opened for reading if it was not open. */
  const ensure = async (scope: Scope) =>
    opened.get(scope.chatId) ?? (await open(scope));

  /** Open for a stretch of work: current settings, a new workspace. */
  async function begin(scope: Scope) {
    const viewing = opened.get(scope.chatId);
    if (viewing) await shut(viewing);
    return open(scope);
  }

  /**
   * Run the lane until Pi has nothing left for it. A message queued as Pi
   * finished stays in Pi's queue under its own id, and an empty prompt has Pi
   * read it from there.
   */
  function drive(
    conversation: Opened,
    operationId: string,
    first: () => Promise<unknown>,
  ) {
    conversation.driving = true;
    conversation.trace(operationId);
    conversation.done = (async () => {
      let step = first;
      while (!closing) {
        const settled = await step().then(
          () => true,
          (error) => {
            console.warn(
              `Pi could not go on in ${conversation.chatId}: ${error instanceof Error ? error.message : error}`,
            );
            return false;
          },
        );
        if (closing) return;
        const next = await inLine(conversation.chatId, async () => {
          const { queues, operation } = await conversation.fresh();
          if (settled && queues.length && !operation)
            return queueOperation(queues[0].entryId);
          // Whatever a command never reported ending did not survive the
          // stretch. Pi's own calls need no sweep: one with no result in Pi's
          // history, with nobody driving, reads as interrupted.
          settleRunningExecutions(
            conversation.applicationId,
            conversation.chatId,
          );
          conversation.driving = false;
          const ended = conversation.snapshot().lastResult?.status;
          conversation.trace(
            null,
            ended === "aborted"
              ? "cancelled"
              : ended === "completed"
                ? "completed"
                : "failed",
          );
          await shut(conversation);
          return null;
        });
        if (!next) return;
        step = async () => {
          await accept(conversation, next, []);
          await run(conversation, next);
        };
      }
    })();
  }

  async function run(conversation: Opened, operationId: string) {
    const driven = await conversation.lane.drive(
      { operationId, waitForRetry: true },
      ctx,
    );
    if (!driven.ok) throw new Error(driven.error.message);
  }

  async function accept(
    conversation: Opened,
    operationId: string,
    prompt: AgentMessage | AgentMessage[],
  ) {
    const admitted = await conversation.lane.accept(
      { kind: "prompt", operationId, prompt },
      ctx,
    );
    if (!admitted.ok) throw new Error(admitted.error.message);
  }

  function hasHistory(scope: Scope) {
    const { chat } = loadChat(scope.applicationId, scope.chatId);
    return (
      Boolean(chat.nativeSessionId) || existsSync(earlierHistoryPath(scope))
    );
  }

  const project = async (open: Opened) => {
    const { entries, abortedAt } = await open.history();
    return withPreviews(
      projectTranscript(
        open.chatId,
        entries,
        abortedAt,
        laneView(open.snapshot()),
        open.driving,
      ),
      open.previews,
    );
  };

  /** What the calls still in flight have streamed back, from this worker. */
  function withPreviews(transcript: Transcript, previews: Map<string, string>) {
    for (const [id, preview] of previews) {
      const call = transcript.calls[id];
      if (call) call.preview = preview;
    }
    return transcript;
  }

  /**
   * Refuses, synchronously, before anything is awaited. That is the point:
   * `hold` sets the deadline in its own turn of the event loop, so a message
   * that arrives afterwards cannot get past this line and then be counted as
   * "nothing was running" by the check that follows.
   */
  function assertTaking() {
    if (Date.now() < heldUntil)
      throw new WorkerRefusal(
        "Hallvi is installing an update, so it is not taking new work. Try again once it has restarted.",
        "updating",
      );
  }

  const actions = {
    async transcript(scope: Scope): Promise<Transcript> {
      const open = opened.get(scope.chatId);
      // Read without waiting in line. One that is being closed as it is read
      // is read again below, from Pi's stored session.
      const read = open && (await project(open).catch(() => undefined));
      if (read) return read;
      if (!hasHistory(scope)) return NOTHING;
      // Nobody is running this conversation, so reading it needs nothing of
      // Pi's runtime: not the model, not credentials, not a workspace. Pi
      // wrote everything a reader needs, and this reads it and nothing else.
      return inLine(scope.chatId, async () => {
        const stored = await readNativeConversation(
          scope.applicationId,
          scope.chatId,
        );
        return projectTranscript(
          scope.chatId,
          stored.entries,
          stored.abortedAt,
          stored.lane,
          false,
        );
      }).catch((error) => ({
        // A history that cannot be opened is said where it would have been.
        ...NOTHING,
        messages: [
          {
            id: `unavailable:${scope.chatId}`,
            chatId: scope.chatId,
            role: "assistant" as const,
            body: "",
            source: "pi" as const,
            status: "failed" as const,
            error: error instanceof Error ? error.message : String(error),
            createdAt: loadChat(scope.applicationId, scope.chatId).chat
              .createdAt,
            revision: 0,
          },
        ],
      }));
    },

    /** Resolves once Pi has durably taken the message, and not before. */
    send: (scope: Scope, message: SentMessage) => (
      assertTaking(),
      inLine(scope.chatId, async () => {
        assertChatWritable(loadChat(scope.applicationId, scope.chatId).chat);
        const conversation = hasHistory(scope)
          ? await ensure(scope)
          : undefined;
        const snapshot = await conversation?.fresh();
        // An answer that was lost on its way back is sent again. Pi has it.
        const held =
          conversation &&
          snapshot &&
          holds((await conversation.history()).entries, snapshot, message.id);
        if (held && held !== message.body)
          throw new WorkerRefusal(
            "This request key was already used for a different message.",
            "conflict",
          );
        if (held) return { accepted: true };
        if (conversation?.driving) {
          const queued = await (message.delivery === "steer"
            ? conversation.lane.steer(toPi(message), undefined, ctx)
            : conversation.lane.followUp(toPi(message), undefined, ctx));
          if (!queued.ok) throw new Error(queued.error.message);
          return { accepted: true };
        }
        if (snapshot && unfinished(snapshot))
          throw new WorkerRefusal(
            "This conversation was interrupted. Continue or stop it before sending something new.",
            "interrupted",
          );
        const live = await begin(scope);
        try {
          await accept(live, message.id, toPi(message));
        } catch (error) {
          await shut(live);
          throw error;
        }
        drive(live, message.id, () => run(live, message.id));
        return { accepted: true };
      })
    ),

    /** Pi goes on with what an interruption left: its operation, its queue. */
    continue: (scope: Scope) => (
      assertTaking(),
      inLine(scope.chatId, async () => {
        const viewing = await ensure(scope);
        const snapshot = await viewing.fresh();
        if (viewing.driving || !unfinished(snapshot)) return {};
        const live = await begin(scope);
        if (snapshot.operation)
          drive(live, snapshot.operation.id, async () => {
            const resumed = await live.lane.resume(ctx);
            if (!resumed.ok) throw new Error(resumed.error.message);
          });
        else {
          const operationId = queueOperation(snapshot.queues[0].entryId);
          try {
            await accept(live, operationId, []);
          } catch (error) {
            await shut(live);
            throw error;
          }
          drive(live, operationId, () => run(live, operationId));
        }
        return {};
      })
    ),

    /**
     * Stop taking work, then say whether any is still going on.
     *
     * The order is what makes this usable by an update: new messages are
     * refused from the moment this is asked, and only then does it wait for
     * whatever was already in hand to settle and count what is still running.
     * A turn cannot start in between, so a `busy` of nothing means nothing.
     */
    async hold(_scope: Scope, message: unknown) {
      const minutes = (message as { minutes?: number })?.minutes ?? 20;
      heldUntil = Date.now() + minutes * 60_000;
      await Promise.allSettled([...lines.values()]);
      return { held: true, busy: owner.live(), until: heldUntil };
    },

    /** Take work again. An update that cannot go on calls this. */
    async release() {
      heldUntil = 0;
      return { held: false };
    },

    /** Pi's abort ends its operation and empties its queues. */
    async stop(scope: Scope) {
      if (!hasHistory(scope)) return {};
      const stopped = inLine(scope.chatId, async () => {
        const conversation = await ensure(scope);
        if ((await conversation.fresh()).operation)
          await conversation.lane.abort(ctx);
        // Without an operation there is nothing to abort, only a queue.
        for (const item of (await conversation.fresh()).queues)
          await conversation.lane.cancelQueued(item.entryId, ctx);
        // Wrapped, so the line is not held while the driver lets go: letting
        // go is itself something the driver does in this line.
        return { done: conversation.done };
      }).then(({ done }) => done);
      const late = Symbol();
      if (
        (await Promise.race([
          stopped,
          delay(options.stopTimeoutMs ?? 10_000, late),
        ])) === late
      )
        throw new WorkerRefusal(
          "Pi has not stopped yet. A command may still be finishing; try again in a moment.",
          "stopping",
        );
      return {};
    },

    /** Remove every history an application has. */
    async forget(scope: { applicationId: string }) {
      const mine = [...opened.values()].filter(
        (open) => open.applicationId === scope.applicationId,
      );
      if (mine.some((open) => open.driving))
        throw new WorkerRefusal(
          "This application's conversation is still running. Stop it and wait for it to stop before removing its history.",
          "busy",
        );
      await Promise.all(
        mine.map((open) => inLine(open.chatId, () => shut(open))),
      );
      removeNativeSessions(scope.applicationId);
      return {};
    },
  };

  const owner = {
    /**
     * A crash never reaches a worker's own cleanup, so evidence still marked
     * running belongs to work that no longer exists. Only the owner may say
     * so: a process that has yet to find out whether another worker is serving
     * would be settling that worker's live approvals. Pi's sessions are left
     * as they are: nothing is opened, and nothing runs, until somebody asks.
     */
    recover() {
      for (const { id } of listApplications())
        settleRunningExecutions(id, null);
    },
    handle(action: string, body: unknown) {
      const act = actions[action as keyof typeof actions] as
        ((...input: unknown[]) => Promise<unknown>) | undefined;
      if (!act) throw new Error(`Unknown request: ${action}`);
      const { scope, message } = body as { scope: Scope; message?: unknown };
      return Promise.resolve(act(scope, message));
    },
    live: () => [...opened.values()].filter((open) => open.driving).length,
    /**
     * The worker is going away. Nothing is aborted: Pi keeps each operation
     * and queue as it is, and nothing runs again until its owner continues.
     */
    async close() {
      closing = true;
      // One failed cleanup must not release ownership while another session
      // is still closing. Report failures only after every attempt settles.
      const results = await Promise.allSettled(
        [...opened.values()].map((open) => open.close()),
      );
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length)
        throw new AggregateError(errors, "Pi session cleanup failed.");
    },
  };
  return owner;
}

/** Become the owner of Pi's sessions for this database, unless there is one. */
export async function ownSessions(
  options: Parameters<typeof sessionOwner>[0] = {},
) {
  const owner = sessionOwner(options);
  const serving = await serveWorker(owner.handle, owner.recover);
  if (!serving) return null;
  return {
    owner,
    /**
     * Stop answering, let go of every session, and only then stop being the
     * owner. Pi's close waits for what it is still writing, and no other
     * process may open those sessions until it has finished.
     */
    async close() {
      serving.server.close();
      serving.server.closeAllConnections();
      try {
        await owner.close();
      } finally {
        serving.release();
      }
    },
  };
}
