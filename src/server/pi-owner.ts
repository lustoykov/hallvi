// The worker's side of every conversation: it alone opens Pi's stores.
//
// Pi owns what was said, what waits, what runs and what an interruption left
// behind. This answers the app's requests by asking Pi, keeps a conversation
// open while Pi has work in it, and writes down the evidence of what Pi's
// tools did. It keeps no record of its own about a message or a reply.
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { setTimeout as delay } from "node:timers/promises";

import { assertChatWritable, loadChat } from "./applications";
import { openPiSession, watchPiSession } from "./pi";
import { listApplications } from "./db";
import {
  hasConversation,
  openConversation,
  removeNativeSessions,
  type StoredConversation,
} from "./pi-sessions";
import {
  holds,
  imageOf,
  ORIGIN_TAG,
  projectTranscript,
  requestIdFor,
  SENT_AT_TAG,
  unfinished,
  type MessageOrigin,
  type Transcript,
} from "./pi-transcript";
import { settleRunningExecutions } from "./operator-execution";
import { beginRunDiagnostics } from "./tracing";
import type { PiReply } from "./types";
import { serveWorker, WorkerRefusal } from "./worker-link";
import { notifyChange } from "./change-notifications";
import { redactHeldSecrets } from "./application-secrets";

export interface Scope {
  applicationId: string;
  chatId: string;
}

export interface SentMessage {
  /** The sender's own id for it: the same send twice is one message. */
  id: string;
  body: string;
  delivery: "next" | "steer";
  /** Attached for the model to see, after the words. */
  images?: { mimeType: string; data: string }[];
  /** Where it was written, when not in Hallvi's page. Never shown to Pi. */
  origin?: MessageOrigin;
}

/**
 * A conversation this worker is running. It is open exactly as long as Pi has
 * work in it: a conversation nobody is running is closed, and reading one
 * opens it for the length of the read.
 */
interface Working extends Scope {
  session: Awaited<ReturnType<typeof openPiSession>>;
  /** Settles when this worker has let go of the conversation. */
  done: Promise<void>;
  /** Stop was asked for, and Pi's work has not let go yet. */
  stopping: boolean;
  /** What each call in flight has streamed back, by Pi's tool-call id. */
  previews: Map<string, string>;
  /** One trace per stretch of work, ended with how Pi says it ended. */
  trace(id: string | null, outcome?: PiReply["status"]): void;
  close(): Promise<void>;
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

/**
 * The message as Pi is handed it. Pi keeps the content as given, in its queue
 * and in its history, so when it was sent and where it was written ride on
 * its first part; they are taken off again before a model sees anything.
 */
const toPi = (message: SentMessage) =>
  [
    ...(message.body ? [{ type: "text", text: message.body }] : []),
    ...(message.images ?? []).map((image) => ({ type: "image", ...image })),
  ].map((part, index) =>
    index
      ? part
      : {
          ...part,
          [SENT_AT_TAG]: Date.now(),
          ...(message.origin && { [ORIGIN_TAG]: message.origin }),
        },
  ) as never;

/** A passive note in Pi's history: the owner chose to continue. */
const CONTINUED = "hallvi.continued";

const NOTHING: Transcript = {
  status: "idle",
  messages: [],
  calls: {},
  said: [],
  operations: {},
};

/** How Pi says the stretch of work that just ended went. */
function outcomeOf(state: StoredConversation | undefined): PiReply["status"] {
  const last = state?.submissions.findLast(
    (record) => record.type === "input" && record.entry !== undefined,
  );
  return last?.status === "done"
    ? "completed"
    : last?.status === "unanswered" && last.reason === "aborted"
      ? "cancelled"
      : "failed";
}

export function sessionOwner(
  options: { signal?: AbortSignal; stopTimeoutMs?: number } = {},
) {
  /** The worker is going away: Pi keeps what it has, and nothing goes on. */
  let closing = false;
  /**
   * Said to everything this worker started once it has begun to go away: a
   * command is stopped, and a call that is waiting on something is let go of
   * rather than waited for. Only ever after Pi has been told to keep each
   * conversation as it is, so that what a call returns then is discarded and
   * not taken for its result.
   */
  const leaving = new AbortController();
  const signal = leaving.signal;
  let letGo: Promise<void> | undefined;
  /**
   * An update is about to stop this worker, and has asked it to stop taking
   * work first. The deadline is not a policy: it is what keeps a held worker
   * from staying held for ever if whoever asked never comes back.
   */
  let heldUntil = 0;
  const working = new Map<string, Working>();
  /**
   * One thing at a time per conversation. Every opening of a conversation's
   * store happens in its line, which is what keeps two from being open at
   * once; reads of one that is being run skip the line and ask the open one.
   */
  const lines = new Map<string, Promise<unknown>>();
  const inLine = <T>(chatId: string, work: () => Promise<T>): Promise<T> => {
    const next = (lines.get(chatId) ?? Promise.resolve()).then(work, work);
    lines.set(
      chatId,
      next.catch(() => undefined),
    );
    return next;
  };

  /** Nothing is opened once the worker has begun to let go of what it has. */
  function assertOpen() {
    if (closing) throw new Error("The worker is stopping.");
  }

  const changed = (scope: Scope) =>
    notifyChange({
      kind: "chat",
      applicationId: scope.applicationId,
      chatId: scope.chatId,
    });

  /**
   * What Pi holds of a conversation nobody is running. Reading needs nothing
   * of Pi's runtime: not the model, not credentials, not a workspace. Pi
   * wrote everything a reader needs, and this reads it and starts nothing.
   */
  async function stored(scope: Scope) {
    assertOpen();
    const open = await openConversation(scope);
    try {
      return await open.read();
    } finally {
      await open.close();
    }
  }

  /** Open for a stretch of work: current settings, a new workspace. */
  async function begin(scope: Scope) {
    assertOpen();
    const previews = new Map<string, string>();
    const session = await openPiSession(scope, {
      signal,
      // What a call has streamed back so far. Pi writes the call and its
      // result to its own history; only the in-between is nobody's record,
      // and a short-lived read has no business on disk. It lives here while
      // the call does, and a lost worker takes it with it.
      onPartial(id, partial) {
        if (partial === undefined) previews.delete(id);
        else previews.set(id, partialText(partial));
        changed(scope);
      },
    });
    let diagnostics: ReturnType<typeof beginRunDiagnostics> | undefined;
    // Whatever Pi commits may be something a reader shows.
    const unsubscribe = session.harness.subscribeCommits(() => changed(scope));
    const recording = await watchPiSession(session, (event) =>
      diagnostics?.signal(event),
    ).catch(async (error) => {
      unsubscribe();
      await session.close();
      throw error;
    });
    const conversation: Working = {
      ...scope,
      session,
      previews,
      done: Promise.resolve(),
      stopping: false,
      trace(id, outcome = "completed") {
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
        unsubscribe();
        recording.unsubscribe();
        conversation.trace(null);
        await session.close();
      },
    };
    working.set(scope.chatId, conversation);
    return conversation;
  }

  /**
   * Let go of a conversation. Whatever closing it runs into, it is no longer
   * this worker's: the next request opens Pi's store again.
   */
  async function shut(conversation: Working) {
    if (working.get(conversation.chatId) === conversation)
      working.delete(conversation.chatId);
    try {
      await conversation.close();
    } finally {
      changed(conversation);
    }
  }

  /**
   * Stay with the conversation until Pi has nothing left to run in it. Pi
   * reads what waits in its queue by itself, in its own order; this only
   * notices when it has finished, and lets go.
   */
  function drive(conversation: Working, traceId: string) {
    changed(conversation);
    conversation.trace(traceId);
    conversation.done = (async () => {
      while (!closing) {
        await conversation.session.conversation
          .waitForIdle(ctx)
          .catch((error) => {
            if (!closing)
              console.warn(
                `Pi could not go on in ${conversation.chatId}: ${error instanceof Error ? error.message : error}`,
              );
          });
        if (closing) return;
        const ended = await inLine(conversation.chatId, async () => {
          const state = await conversation.session
            .read()
            .catch(() => undefined);
          // A message taken in the moment Pi finished began another run.
          if (state?.live.run) return false;
          try {
            // Whatever a command never reported ending did not survive the
            // stretch. Pi's own calls need no sweep: one with no result in
            // Pi's history, with nobody running it, reads as interrupted.
            await settleRunningExecutions(
              conversation.applicationId,
              conversation.chatId,
            );
            conversation.trace(null, outcomeOf(state));
          } finally {
            await shut(conversation);
          }
          return true;
        });
        if (ended) return;
      }
    })().catch((error) =>
      // Nobody may be waiting for this, and a cleanup that failed is not a
      // reason for the worker, and every other conversation, to stop.
      console.warn(
        `Hallvi could not let go of ${conversation.chatId} cleanly: ${error instanceof Error ? error.message : error}`,
      ),
    );
  }

  const project = async (conversation: Working) => {
    const transcript = projectTranscript(
      conversation.chatId,
      await conversation.session.read(),
      true,
      (text) => redactHeldSecrets(conversation.applicationId, text),
    );
    // What the calls still in flight have streamed back, from this worker.
    for (const [id, preview] of conversation.previews) {
      const call = transcript.calls[id];
      if (call) call.preview = preview;
    }
    return transcript;
  };

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
      const running = working.get(scope.chatId);
      // Read without waiting in line. One that is being closed as it is read
      // is read again below, from what Pi stored.
      const read = running && (await project(running).catch(() => undefined));
      if (read) return read;
      if (!hasConversation(scope)) return NOTHING;
      return inLine(scope.chatId, async () => {
        // It may have begun work while this waited its turn.
        const now = working.get(scope.chatId);
        return now
          ? project(now)
          : projectTranscript(
              scope.chatId,
              await stored(scope),
              false,
              (text) => redactHeldSecrets(scope.applicationId, text),
            );
      }).catch(async (error) => ({
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
            createdAt: (await loadChat(scope.applicationId, scope.chatId)).chat
              .createdAt,
            revision: 0,
          },
        ],
      }));
    },

    /** One image the owner attached to a message, as Pi keeps it. */
    async image(scope: Scope, message: unknown) {
      const { id, index } = message as { id: string; index: number };
      const running = working.get(scope.chatId);
      const state =
        (running && (await running.session.read().catch(() => undefined))) ??
        (hasConversation(scope)
          ? await inLine(scope.chatId, () => {
              const now = working.get(scope.chatId);
              return now ? now.session.read() : stored(scope);
            })
          : undefined);
      const image = state && imageOf(state, id, index);
      if (!image)
        throw new WorkerRefusal(
          "This image is not in the conversation.",
          "missing",
        );
      return image;
    },

    /** Resolves once Pi has durably taken the message, and not before. */
    send: (scope: Scope, message: SentMessage, onlyIfIdle = false) => (
      assertTaking(),
      inLine(scope.chatId, async () => {
        assertChatWritable(
          (await loadChat(scope.applicationId, scope.chatId)).chat,
        );
        const running = working.get(scope.chatId);
        const state = running
          ? await running.session.read()
          : hasConversation(scope)
            ? await stored(scope)
            : undefined;
        // An answer that was lost on its way back is sent again. Pi has it.
        // Pi itself takes a known id for the message it already has, whatever
        // the words, so the comparison is made here.
        const held = state && holds(state, message.id);
        if (held !== undefined && held !== message.body)
          throw new WorkerRefusal(
            "This request key was already used for a different message.",
            "conflict",
          );
        if (held !== undefined) return { accepted: true };
        if (running) {
          // Pi finished, a reply failed with messages still waiting, and
          // this worker has yet to let go: what waits is the owner's to
          // continue or stop, and anything Pi took now would set it going.
          if (
            state &&
            !state.live.run &&
            state.inbox.items.some((item) => item.mode !== "write")
          )
            throw new WorkerRefusal(
              "This conversation was interrupted. Continue or stop it before sending something new.",
              "interrupted",
            );
          if (onlyIfIdle)
            throw new WorkerRefusal(
              "Hallvi is working in the conversation. The deployment can start when that finishes.",
              "busy",
            );
          // A message Pi took while it was stopping would be left in its
          // queue with nothing to read it.
          if (running.stopping)
            throw new WorkerRefusal(
              "Pi has not stopped yet. A command may still be finishing; try again in a moment.",
              "stopping",
            );
          await running.session.conversation.submit(
            {
              type: "input",
              content: toPi(message),
              requestId: requestIdFor(state, message.id),
              whenBusy: message.delivery === "steer" ? "steer" : "followUp",
            },
            ctx,
          );
          return { accepted: true };
        }
        // Decided here, before Pi is asked anything: whatever Pi is asked to
        // take would also set its unfinished work going again.
        if (state && unfinished(state))
          throw new WorkerRefusal(
            "This conversation was interrupted. Continue or stop it before sending something new.",
            "interrupted",
          );
        const live = await begin(scope);
        try {
          await live.session.conversation.submit(
            {
              type: "input",
              content: toPi(message),
              requestId: requestIdFor(state, message.id),
            },
            ctx,
          );
        } catch (error) {
          await shut(live);
          throw error;
        }
        drive(live, message.id);
        return { accepted: true };
      })
    ),

    /** Pi goes on with what an interruption left: its work, its queue. */
    continue: (scope: Scope) => (
      assertTaking(),
      inLine(scope.chatId, async () => {
        if (working.has(scope.chatId) || !hasConversation(scope)) return {};
        const state = await stored(scope);
        if (!unfinished(state)) return {};
        const live = await begin(scope);
        try {
          // Pi resumes what it had begun; a call the interruption cut is not
          // made again. With only messages waiting there is nothing to resume,
          // and Pi reads its queue when something is written to the
          // conversation: a note that carries nothing for the model.
          if (state.tasks > 0 || state.live.run) live.session.harness.resume();
          else
            await live.session.conversation.submit(
              { type: "write", entry: { kind: CONTINUED } },
              ctx,
            );
        } catch (error) {
          await shut(live);
          throw error;
        }
        const first =
          state.live.run?.inputs[0] ??
          state.inbox.items.find((item) => item.mode !== "write")?.id;
        drive(
          live,
          state.submissions.find((record) => record.id === first)?.requestId ??
            `continue:${scope.chatId}`,
        );
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

    /**
     * Pi's abort ends its work and withdraws what waited. It runs no tool and
     * asks no model, so a conversation nobody is running is stopped as it
     * was read: without a login, a workspace or a tool.
     */
    async stop(scope: Scope) {
      const stopped = inLine(scope.chatId, async () => {
        const running = working.get(scope.chatId);
        if (!running) {
          // Decided here, in its turn: a message still opening the
          // conversation has taken it by now, or has not been sent.
          if (!hasConversation(scope)) return { done: undefined };
          assertOpen();
          const open = await openConversation(scope);
          try {
            await open.conversation.abort(ctx, { background: true });
          } finally {
            await open.close();
          }
          changed(scope);
          return { done: undefined };
        }
        running.stopping = true;
        // Wrapped, so the line is not held while Pi's work lets go: letting
        // go of the conversation is itself something done in this line.
        return {
          done: Promise.all([
            running.session.conversation
              .abort(ctx, { background: true })
              .catch(async (error) => {
                // A store Pi can no longer write cannot be stopped through
                // it. Closed, it is read again as Pi left it, and stopped
                // from there. In its line, so that nothing opens the store
                // again before it has closed.
                await inLine(scope.chatId, () => shut(running));
                throw error;
              }),
            running.done,
          ]),
        };
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
      const running = () =>
        [...working.values()].some(
          (conversation) => conversation.applicationId === scope.applicationId,
        );
      // A request in hand may have a store open, or be opening the
      // conversation for work: every line runs out first, and the look at
      // what is running comes after, with nothing between it and the removal.
      for (;;) {
        const pending = [...lines.values()];
        await Promise.allSettled(pending);
        if ([...lines.values()].every((line) => pending.includes(line))) break;
      }
      if (running())
        throw new WorkerRefusal(
          "This application's conversation is still running. Stop it and wait for it to stop before removing its history.",
          "busy",
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
     * would be settling that worker's live approvals. Pi's stores are left
     * as they are: nothing is opened, and nothing runs, until somebody asks.
     */
    async recover() {
      for (const { id } of await listApplications())
        await settleRunningExecutions(id, null);
    },
    handle(action: string, body: unknown) {
      const act = (actions[action as keyof typeof actions] ??
        owner.also[action]) as
        ((...input: unknown[]) => Promise<unknown>) | undefined;
      if (!act) throw new Error(`Unknown request: ${action}`);
      const { scope, message } = body as { scope: Scope; message?: unknown };
      return Promise.resolve(act(scope, message));
    },
    live: () => working.size,
    /** What the branch watch needs of a conversation, and nothing more. */
    conversations: {
      driving: (chatId: string) => working.has(chatId),
      // The check belongs inside the conversation queue: an owner message
      // may have begun opening the conversation before the watch checked.
      send: (scope: Scope, message: SentMessage) =>
        actions.send(scope, message, true),
      transcript: actions.transcript,
    },
    /** Requests that are not about a conversation, for whoever owns them. */
    also: {} as Record<
      string,
      (scope: never, message: unknown) => Promise<unknown>
    >,
    /**
     * The worker is going away. Nothing is aborted: Pi keeps its work and its
     * queue as they are, and nothing runs again until its owner continues.
     */
    close() {
      return (letGo ??= (async () => {
        closing = true;
        // One failed cleanup must not release ownership while another
        // conversation is still closing. Report failures only after every
        // attempt settles.
        const errors: unknown[] = [];
        // A request already in hand may still have a store open, or be
        // about to register the conversation it opened: ownership is kept
        // until every line has run out and nothing is left open.
        do {
          const open = [...working.values()];
          for (const conversation of open) working.delete(conversation.chatId);
          // Each close tells Pi, before anything is awaited, to take no more
          // of that conversation's work. Only then is the work let go of.
          const closed = open.map((conversation) => conversation.close());
          leaving.abort(new Error("The worker is stopping."));
          for (const result of await Promise.allSettled(closed))
            if (result.status === "rejected") errors.push(result.reason);
          await Promise.allSettled([...lines.values()]);
        } while (working.size);
        if (errors.length)
          throw new AggregateError(errors, "Pi session cleanup failed.");
      })());
    },
  };
  // Asked to stop, the worker lets go here and now, whatever else it is in
  // the middle of: Pi is sealed in the same turn the signal arrives, ahead
  // of every command the signal goes on to stop.
  const leave = () => void owner.close().catch(() => undefined);
  if (options.signal?.aborted) leave();
  else options.signal?.addEventListener("abort", leave, { once: true });
  return owner;
}

/** Become the owner of Pi's stores for this database, unless there is one. */
export async function ownSessions(
  options: Parameters<typeof sessionOwner>[0] = {},
) {
  const owner = sessionOwner(options);
  const serving = await serveWorker(owner.handle, owner.recover);
  if (!serving) return null;
  return {
    owner,
    /**
     * Stop answering, let go of every conversation, and only then stop being
     * the owner. Pi's close waits for what it is still writing, and no other
     * process may open those stores until it has finished.
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
