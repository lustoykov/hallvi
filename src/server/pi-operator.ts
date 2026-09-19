import type { AgentSession } from "@earendil-works/pi-coding-agent";

/** A durable user message the API accepted, delivered as its owner chose. */
export interface AcceptedMessage {
  id: string;
  body: string;
  delivery: "next" | "steer";
}

export interface OperatorRecords {
  /**
   * Pi began reading this message. Called synchronously, before Pi persists it
   * and before any model call is made for it.
   */
  seen(messageId: string): void;
  /**
   * Pi wrote the message into its own history as this entry. The id is Pi's,
   * and is how the message is found there afterwards, or found to be missing.
   */
  persisted(messageId: string, entryId: string): void;
  /** One finished assistant message, in transcript order. */
  said(text: string): void;
  /** Pi's latest answer ended in an error. Pi still goes on to what waits. */
  errored(error: Error): void;
}

/**
 * How Pi's run ended, and nothing about what runs next: that is read from the
 * durable messages, where Stop has already been recorded.
 */
export interface OperatorOutcome {
  status: "idle" | "stopped" | "failed";
  /** Why Pi could not start or finish its last answer. */
  error?: unknown;
}

const PROMPT = { expandPromptTemplates: false, source: "rpc" } as const;

function text(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part?.type === "text" ? String(part.text) : ""))
    .join("");
}

/**
 * One live stretch of a conversation: a prompt and everything Pi's own queues
 * deliver after it. Pi decides when each message runs; this only hands
 * messages over and says which durable message Pi has just read.
 */
export function liveOperator(
  session: AgentSession,
  first: AcceptedMessage,
  records: OperatorRecords,
) {
  // Pi's queued messages carry no identity and Pi matches them by text,
  // steering before follow-ups. This is the same rule in the same order, with
  // ids.
  const waiting: AcceptedMessage[] = [];
  let prompting: string | undefined = first.id;
  let reading: { id: string; message: unknown } | undefined;
  let stopped = false;
  let error: unknown;
  let settled = false;

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_start" && event.message.role === "user") {
      let id = prompting;
      prompting = undefined;
      if (!id) {
        const body = text(event.message.content);
        const match = (delivery: AcceptedMessage["delivery"]) =>
          waiting.findIndex((m) => m.delivery === delivery && m.body === body);
        const index = match("steer") === -1 ? match("next") : match("steer");
        if (index !== -1) id = waiting.splice(index, 1)[0].id;
      }
      if (id) {
        reading = { id, message: event.message };
        records.seen(id);
      }
    }
    if (event.type === "message_end" && event.message === reading?.message) {
      const { id, message } = reading;
      reading = undefined;
      // Pi appends the entry right after its listeners return.
      queueMicrotask(() => {
        const entry = session.sessionManager
          .getEntries()
          .findLast((e) => e.type === "message" && e.message === message);
        if (entry) records.persisted(id, entry.id);
      });
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const said = text(event.message.content);
      if (said.trim()) records.said(said);
      error =
        event.message.stopReason === "error"
          ? new Error(event.message.errorMessage ?? "The model failed.")
          : undefined;
      if (error) records.errored(error as Error);
    }
  });

  // A session only reports itself busy once its preflight has passed. Until
  // then a second message would race the first into agent.prompt().
  let ready!: () => void;
  let handing = new Promise<void>((resolve) => (ready = resolve));

  const done: Promise<OperatorOutcome> = session
    .prompt(first.body, { ...PROMPT, preflightResult: () => ready() })
    .then(() => session.waitForIdle())
    .catch((thrown: unknown) => {
      error = thrown ?? new Error("Pi could not start.");
    })
    .then(() => {
      ready();
      settled = true;
      unsubscribe();
      return stopped
        ? { status: "stopped" as const }
        : error
          ? { status: "failed" as const, error }
          : { status: "idle" as const };
    });

  return {
    done,
    /** False once this stretch has ended: route the message to a new one. */
    deliver(message: AcceptedMessage) {
      if (settled || stopped) return false;
      waiting.push(message);
      handing = handing.then(async () => {
        // Not handed over, its durable record still says waiting.
        if (settled || stopped || !session.isStreaming) return;
        await session.prompt(message.body, {
          ...PROMPT,
          streamingBehavior:
            message.delivery === "steer" ? "steer" : "followUp",
        });
      });
      return true;
    },
    /** Pi's abort continues into its queues, so they are emptied first. */
    async stop() {
      stopped = true;
      session.clearQueue();
      session.abortCompaction();
      await session.abort();
      return done;
    },
  };
}
