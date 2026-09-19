import {
  BACKGROUND_CONTEXT as ctx,
  type AgentHarness,
  type AgentLane,
  type AgentMessage,
  type LaneQueuedItem,
  type OperationResultRecord,
} from "@earendil-works/pi-agent-core";

/** A durable user message the API accepted, delivered as its owner chose. */
export interface AcceptedMessage {
  id: string;
  body: string;
  delivery: "next" | "steer";
}

export interface OperatorRecords {
  /**
   * Pi has durably taken the message: from here on it is Pi's to queue, order,
   * run, cancel and restore, and Hallvi never hands it over again. `entryId`
   * is the id Pi keeps it under, known at once for a queued message and once
   * Pi has written it for a prompt.
   */
  admitted(messageId: string, entryId: string | null): void;
  /** Pi began reading the message, before any model call is made for it. */
  seen(messageId: string): void;
  /** One finished assistant message, in transcript order. */
  said(text: string): void;
  /** Pi's latest answer ended in an error. Pi still goes on to what waits. */
  errored(error: Error): void;
}

export interface OperatorOutcome {
  status: "idle" | "stopped" | "failed";
  /** Why Pi could not start or finish its last answer. */
  error?: unknown;
}

/** Every message handed to Pi carries the id of Hallvi's record of it. */
const TAG = "hallviMessageId";
const tagOf = (message: unknown) =>
  (message as Record<string, unknown> | undefined)?.[TAG] as string | undefined;

function said(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part?.type === "text" ? String(part.text) : ""))
    .join("");
}

function toPi(message: Pick<AcceptedMessage, "id" | "body">): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text: message.body }],
    timestamp: Date.now(),
    [TAG]: message.id,
  } as AgentMessage;
}

/**
 * What Pi already holds when a conversation is opened, by Hallvi message id.
 * This is the whole of the reconciliation between the two: it covers the
 * instant between Pi taking a message and Hallvi recording that it had.
 */
export async function heldByPi(lane: AgentLane, unacknowledged: string[]) {
  const watch = await lane.watch(ctx);
  watch.unsubscribe();
  const { queues, operation } = watch.snapshot;
  const consumed = new Map<string, string>();
  if (unacknowledged.length)
    for (const entry of await lane.findEntries(undefined, ctx)) {
      const id = entry.type === "message" ? tagOf(entry.message) : undefined;
      if (id && unacknowledged.includes(id)) consumed.set(id, entry.id);
    }
  return {
    /** The operation a worker left open, if any. Its id is a message id. */
    openOperationId: operation?.id,
    queued: queues.flatMap((item) => {
      const id = item.type === "message" ? tagOf(item.message) : undefined;
      return id ? [{ messageId: id, entryId: item.entryId }] : [];
    }),
    /** Read by Pi already, under these entry ids. */
    consumed,
  };
}

/**
 * One live stretch of a conversation on Pi's lane: a prompt, or the operation
 * a dead worker left open, and everything Pi's own queues deliver after it.
 * Pi owns identity, order, cancellation, execution and restoration. This hands
 * messages over, acknowledges that Pi has them, and reports what Pi does.
 */
export function liveOperator(
  harness: AgentHarness,
  lane: AgentLane,
  start: AcceptedMessage | "resume" | "sweep",
  records: OperatorRecords,
) {
  let stopped = false;
  let settled = false;
  /** Looking at what Pi still holds: nothing new is handed over meanwhile. */
  let closing = false;
  let queued: LaneQueuedItem[] = [];
  let handing: Promise<void> = Promise.resolve();

  const listening = [
    harness.events.on("queue_update", (event) => {
      queued = event.queues;
    }),
    harness.events.on("message_start", (event) => {
      const id = event.message.role === "user" && tagOf(event.message);
      if (id) records.seen(id);
    }),
    harness.events.on("message_end", (event) => {
      const { message } = event;
      const id = message.role === "user" && tagOf(message);
      if (id && event.entryId) records.admitted(id, event.entryId);
      if (message.role !== "assistant") return;
      const text = said(message.content);
      if (text.trim()) records.said(text);
      if (message.stopReason === "error")
        records.errored(new Error(message.errorMessage ?? "The model failed."));
    }),
  ];

  /** Put a message to an idle lane. Its id makes a second attempt harmless. */
  async function prompt(message: Pick<AcceptedMessage, "id" | "body">) {
    const admission = await lane.accept(
      { kind: "prompt", operationId: message.id, prompt: toPi(message) },
      ctx,
    );
    if (
      !admission.ok &&
      !(
        admission.error._tag === "LaneBusy" &&
        admission.error.operationId === message.id
      )
    )
      throw new Error(admission.error.message);
    records.admitted(message.id, null);
    return drive(message.id);
  }

  async function drive(operationId: string) {
    const driven = await lane.drive({ operationId, waitForRetry: true }, ctx);
    if (!driven.ok) throw new Error(driven.error.message);
    if (driven.value.kind !== "settled")
      throw new Error("Pi left the operation waiting on a deferred response.");
    return driven.value.outcome;
  }

  const done: Promise<OperatorOutcome> = (async () => {
    let outcome: OperationResultRecord | undefined;
    try {
      if (start === "resume") {
        const resumed = await lane.resume(ctx);
        if (!resumed.ok) throw new Error(resumed.error.message);
        if (resumed.value.status === "suspended")
          throw new Error(
            "Pi left the operation waiting on a deferred response.",
          );
        outcome = resumed.value;
      } else if (start !== "sweep") outcome = await prompt(start);
      else {
        const watch = await lane.watch(ctx);
        watch.unsubscribe();
        queued = watch.snapshot.queues;
      }
      // A message queued as Pi finished is still Pi's, on an idle lane that
      // will not read it. It is taken back by its id and put as the prompt.
      for (;;) {
        closing = true;
        await handing;
        const next = stopped ? undefined : queued[0];
        if (!next || next.type !== "message") break;
        closing = false;
        const taken = await lane.cancelQueued(next.entryId, ctx);
        if (!taken.ok) throw new Error(taken.error.message);
        queued = queued.filter((item) => item.entryId !== next.entryId);
        const id = tagOf(next.message);
        if (taken.value.kind === "cancelled" && id)
          outcome = await prompt({
            id,
            body: said((next.message as { content?: unknown }).content),
          });
      }
      return stopped || outcome?.status === "aborted"
        ? { status: "stopped" as const }
        : outcome?.status === "failed"
          ? { status: "failed" as const, error: outcome.error }
          : { status: "idle" as const };
    } catch (error) {
      return stopped
        ? { status: "stopped" as const }
        : { status: "failed" as const, error };
    } finally {
      settled = true;
      for (const off of listening) off();
    }
  })();

  return {
    done,
    /** False when nothing can be handed over right now: leave it and retry. */
    deliver(message: AcceptedMessage) {
      if (settled || stopped || closing) return false;
      handing = handing.then(async () => {
        if (settled || stopped) return;
        const result = await (message.delivery === "steer"
          ? lane.steer(toPi(message), undefined, ctx)
          : lane.followUp(toPi(message), undefined, ctx));
        if (result.ok) records.admitted(message.id, result.value.entryId);
      });
      return true;
    },
    /** Pi's abort ends the operation and empties its queues itself. */
    async stop() {
      stopped = true;
      await lane.abort(ctx);
      return done;
    },
    /**
     * The worker is going away. Nothing is aborted: Pi keeps the operation and
     * its queue as they are, and restores them for whoever opens it next.
     */
    async leave() {
      stopped = true;
      await harness.close(ctx);
      return done;
    },
  };
}
