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
  applicationsWithActivity,
  endActivity,
  settleRunningActivity,
  startActivity,
  updateActivity,
} from "./pi-activity";
import { earlierHistoryPath, removeNativeSessions } from "./pi-sessions";
import {
  holds,
  MESSAGE_TAG,
  projectTranscript,
  unfinished,
  type Transcript,
} from "./pi-transcript";
import { settleRunningExecutions } from "./operator-execution";
import { beginRunDiagnostics } from "./tracing";
import { WorkerRefusal } from "./worker-link";

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
  /** Pi's whole branch, read again only when its tip has moved. */
  history: () => Promise<Entry[]>;
  /** One trace per stretch of work. */
  trace(id: string | null): void;
  close: () => Promise<void>;
  /** Set while this worker runs the lane. */
  driving: boolean;
  /** Settles when this worker has let go of the lane. */
  done?: Promise<void>;
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
  // A crash never reaches a worker's own cleanup, so evidence still marked
  // running belongs to work that no longer exists. Pi's sessions are left as
  // they are: nothing is opened, and nothing runs, until somebody asks.
  for (const applicationId of applicationsWithActivity())
    settleRunningActivity(applicationId, null);
  for (const { id } of listApplications()) settleRunningExecutions(id, null);

  /** The worker is going away: Pi keeps what it has, and nothing goes on. */
  let closing = false;
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
    let read: { tipId: string | null; entries: Entry[] } | undefined;
    const history = async () => {
      const { tipId } = snapshot;
      if (read?.tipId !== tipId)
        read = {
          tipId,
          entries: await session.lane.findEntries(
            { order: "oldestFirst" },
            ctx,
          ),
        };
      return read.entries;
    };
    // Evidence of what Pi's tools did, written as it happens and kept under
    // the id Pi gave the call. Where it sits in the conversation is Pi's.
    const recording = watchPiSession(session.harness, {
      onActivity: (event) => diagnostics?.signal(event),
      onTool(event) {
        if (event.type === "start")
          startActivity({ ...scope, runId: scope.chatId, ...event });
        else if (event.type === "update")
          // The runtime sends a result-so-far, never an increment.
          updateActivity(
            scope.applicationId,
            event.id,
            event.partial,
            "snapshot",
          );
        else if (event.type === "end")
          endActivity({ applicationId: scope.applicationId, ...event });
      },
    });
    let diagnostics: ReturnType<typeof beginRunDiagnostics> | undefined;
    const conversation = {
      ...scope,
      lane: session.lane,
      snapshot: () => snapshot,
      fresh,
      history,
      driving: false,
      done: undefined as Promise<void> | undefined,
      trace(id: string | null) {
        diagnostics?.finish("completed");
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
            return `queue:${queues[0].entryId}`;
          // Whatever a call never reported ending did not survive the stretch.
          settleRunningActivity(
            conversation.applicationId,
            conversation.chatId,
          );
          settleRunningExecutions(
            conversation.applicationId,
            conversation.chatId,
          );
          conversation.driving = false;
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

  const project = async (open: Opened) =>
    projectTranscript(
      open.chatId,
      await open.history(),
      open.snapshot(),
      open.driving,
    );

  const actions = {
    async transcript(scope: Scope): Promise<Transcript> {
      const open = opened.get(scope.chatId);
      if (open) return project(open);
      if (!hasHistory(scope)) return NOTHING;
      return inLine(scope.chatId, async () => project(await ensure(scope)));
    },

    /** Resolves once Pi has durably taken the message, and not before. */
    send: (scope: Scope, message: SentMessage) =>
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
          holds(await conversation.history(), snapshot, message.id);
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
      }),

    /** Pi goes on with what an interruption left: its operation, its queue. */
    continue: (scope: Scope) =>
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
          const operationId = `queue:${snapshot.queues[0].entryId}`;
          try {
            await accept(live, operationId, []);
          } catch (error) {
            await shut(live);
            throw error;
          }
          drive(live, operationId, () => run(live, operationId));
        }
        return {};
      }),

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

  return {
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
      await Promise.all([...opened.values()].map((open) => open.close()));
    },
  };
}
