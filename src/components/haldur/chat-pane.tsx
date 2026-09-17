"use client";

import {
  Archive,
  ArrowClockwise,
  PaperPlaneRight,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { ApplicationOperation } from "@/server/operation-record";
import type { Chat, ChatMessage, OperatorView, PiRun } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";
import { InformationCard } from "./information-card";
import { hasActivity, PiActivity } from "./pi-activity";
import { useOffScreen } from "./use-off-screen";
import {
  runActivity,
  runFailure,
  useClockReady,
  type RunActivity,
} from "./run-activity";
import { OperatorConsole } from "./operator-console";
import {
  SecretRequests,
  SecretRequestsChip,
  secretRequestPoint,
  type SecretRequest,
} from "./secret-request";
import { OperationReceipt, OperationReferences } from "./operation-receipt";
import type { RecordReference } from "./record-references";

/** The message a view or Overview asked to reveal; the nonce repeats it. */
export interface MessageHighlight {
  messageId: string;
  nonce: number;
}

const ATTEMPT_LABELS: Record<ChatMessage["status"], string> = {
  completed: "Saved",
  queued: "Queued",
  running: "Draft",
  succeeded: "Saved",
  failed: "Failed",
  // Both of these mean the reader stopped it. The status line beneath says
  // "Stopped", and a tag reading "Cancelled" beside it made one action look
  // like two different outcomes.
  cancelled: "Stopped",
  "timed-out": "Timed out",
  interrupted: "Stopped",
};

/**
 * Where each saved record is shown in full, keyed by the record's own id.
 *
 * Identity, and only identity. Pi attaches a record to a reply and the same
 * record can be attached to more than one, so one transcript drew the
 * identical Cloudflare failure three times at 653px each and a reader saw
 * three problems where there was one.
 *
 * It deliberately does not group by *subject*. Two different records about
 * the same thing are two observations, and the later one does not cancel the
 * earlier: "the domain resolves" and "the domain does not serve the
 * application" are both true and both still relevant. Folding the earlier one
 * away because a newer record mentions the same subject would erase a claim
 * that still holds, which is the opposite of what this is for.
 */
export function firstAppearances(
  messages: { id: string; blocks?: { type: string; id?: string }[] }[],
) {
  const seen = new Map<string, string>();
  for (const message of messages)
    for (const [index, block] of (message.blocks ?? []).entries())
      if (block.type === "saved-information" && block.id && !seen.has(block.id))
        seen.set(block.id, `${message.id}:${index}`);
  return seen;
}

/**
 * What stopping actually did.
 *
 * Stopping ends the reply; it does not undo the work. By the time somebody
 * reaches for Stop, Pi has usually already run something on their server, and
 * "Reply cancelled." invites them to believe otherwise. This counts what had
 * finished and says so, because the difference matters when the next thing
 * they do is decide whether to run it again.
 */
export function stopOutcome(
  executions: { runId: string; status: string }[] | undefined,
  runId: string,
) {
  const mine = (executions ?? []).filter((item) => item.runId === runId);
  // Reached the server and finished there, whatever the result: a command
  // that failed still ran. Declined and awaiting-approval never started, so
  // they are not "already run" by any reading.
  const ran = mine.filter((item) =>
    ["succeeded", "failed", "interrupted"].includes(item.status),
  ).length;
  // Still in flight when the reply ended. Stopping the reply is not a signal
  // that reaches a command already executing on the far side of an SSH
  // connection, so this cannot be reported as stopped — only as unconfirmed.
  const flying = mine.filter((item) => item.status === "running").length;

  const already =
    ran > 0
      ? `${ran} command${ran === 1 ? "" : "s"} had already run and ${
          ran === 1 ? "was" : "were"
        } not undone.`
      : "";
  const unconfirmed =
    flying > 0
      ? `${flying === 1 ? "One command was" : `${flying} commands were`} still running on the server; stopping the reply does not confirm ${
          flying === 1 ? "it" : "they"
        } stopped.`
      : "";

  if (!already && !unconfirmed) return "Stopped. Nothing had run.";
  return ["Stopped.", already, unconfirmed].filter(Boolean).join(" ");
}

/**
 * What Pi is doing, and for how long, on one line.
 *
 * The elapsed time is set apart rather than folded into the sentence: it is
 * the half that changes every second, and a reader glancing at a running turn
 * is looking for whether the number is still moving.
 */
function Doing({ activity }: { activity: RunActivity }) {
  const clock = useClockReady();
  return (
    <>
      <span data-waiting={activity.waitingOnYou || undefined}>
        {activity.says}
      </span>
      {clock && activity.since && (
        <small className="sg-run-elapsed">{activity.since}</small>
      )}
    </>
  );
}

export function ChatPane({
  view,
  activeChat,
  busy,
  error,
  pendingMessage,
  piReady,
  composer,
  onComposerChange,
  onSend,
  onArchive,
  runs,
  reconnecting,
  onRunAction,
  onNewChat,
  references,
  onReveal,
  operations = [],
  now = 0,
  onOpenDestination,
  onOpenConversation,
  highlight,
  decisionFor,
  reachable,
  workerAlive,
}: {
  view: OperatorView;
  activeChat: Chat | null;
  busy: string | null;
  error: string | null;
  pendingMessage: string | null;
  piReady: boolean;
  composer: string;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onArchive: () => void;
  runs: PiRun[];
  reconnecting: boolean;
  onRunAction: (id: string, action: "cancel" | "retry") => void;
  onNewChat: () => void;
  /** Records each reply produced, shown as a line under it. */
  references?: Map<string, RecordReference[]>;
  /** Opens the application's History, where saved records are listed. */
  onReveal?: () => void;
  /** The application's operations; receipts render in their origin chat. */
  operations?: ApplicationOperation[];
  now?: number;
  onOpenDestination?: (destination: ApplicationSection) => void;
  onOpenConversation?: (chatId: string, messageId: string | null) => void;
  highlight?: MessageHighlight | null;
  /** The real decision controls for an operation while it needs one. */
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  /**
   * Whether the tunnel behind an access record's URL is still open, so a
   * record card in the transcript does not offer a link that stopped working.
   */
  reachable?: Reachability;
  /**
   * Whether a Pi worker is alive to carry this conversation's queue.
   * Undefined where it has not been established; nothing is claimed then.
   */
  workerAlive?: boolean;
}) {
  const chatId = activeChat?.id ?? null;
  // Receipts sit under the reply that started the work. One whose reply is
  // not in this transcript (an older record, or a reply not saved yet) is
  // still shown, at the end, so no operation is ever lost.
  const own = operations.filter(
    (operation) => operation.origin?.chatId === chatId,
  );
  const messageIds = new Set(view.messages.map((message) => message.id));
  const anchored = new Map<string, ApplicationOperation[]>();
  const unanchored: ApplicationOperation[] = [];
  for (const operation of own) {
    // A record made before origins were kept anchors to the first recorded
    // reply after it started, which is the reply that announced it.
    const messageId =
      operation.origin?.messageId ??
      view.messages.find(
        (message) =>
          message.role === "assistant" &&
          message.source === "haldur" &&
          message.createdAt >= operation.startedAt,
      )?.id;
    if (messageId && messageIds.has(messageId))
      anchored.set(messageId, [...(anchored.get(messageId) ?? []), operation]);
    else unanchored.push(operation);
  }
  const mentioned = (messageId: string) =>
    operations.filter((operation) =>
      operation.mentions.some(
        (mention) =>
          mention.chatId === chatId && mention.messageId === messageId,
      ),
    );
  const openDestination = onOpenDestination ?? (() => {});
  const openConversation = onOpenConversation ?? (() => {});
  const messageCount = view.messages.length;
  /**
   * Open a record from its own address.
   *
   * A repeat of a record links to `#record-<id>`, which the browser handles
   * while the page is up — but not after a reload. The transcript lives in a
   * stick-to-bottom container that mounts and scrolls to the live edge after
   * the hash has already been processed, so a reload on a record link landed
   * the reader at the bottom of the conversation instead of at the evidence.
   * This runs once the messages are on the page and puts them where the link
   * said, with the same brief highlight a message reference gets.
   */
  const openedRecord = useRef<string | null>(null);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("record-") || openedRecord.current === id) return;
    const element = document.getElementById(id);
    if (!element) return;
    openedRecord.current = id;
    element.scrollIntoView({ block: "center" });
    element.classList.add("sg-message-highlight");
    const timer = window.setTimeout(
      () => element.classList.remove("sg-message-highlight"),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [view.messages]);

  // Clicking a second repeat link changes only the hash, which re-renders
  // nothing, so the effect above would not run again.
  useEffect(() => {
    const onHash = () => {
      openedRecord.current = null;
      const id = window.location.hash.slice(1);
      if (!id.startsWith("record-")) return;
      const element = document.getElementById(id);
      if (!element) return;
      openedRecord.current = id;
      element.scrollIntoView({ block: "center" });
      element.classList.add("sg-message-highlight");
      window.setTimeout(
        () => element.classList.remove("sg-message-highlight"),
        2600,
      );
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const element = document.getElementById(
      `sg-message-${highlight.messageId}`,
    );
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    element.classList.add("sg-message-highlight");
    const timer = window.setTimeout(
      () => element.classList.remove("sg-message-highlight"),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [highlight, messageCount]);
  const receipts = (list: ApplicationOperation[] | undefined) =>
    list?.map((operation) => (
      <OperationReceipt
        key={operation.id}
        operation={operation}
        now={now}
        onOpen={openDestination}
        onOpenOperation={(id) => {
          const linked = operations.find((item) => item.id === id);
          if (linked?.origin)
            openConversation(linked.origin.chatId, linked.origin.messageId);
          else openDestination("history");
        }}
        decision={decisionFor?.(operation)}
      />
    ));
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("message");
    if (id)
      document
        .getElementById(`sg-message-${id}`)
        ?.scrollIntoView({ block: "center" });
  }, [view.messages.length]);
  const application = view.application;
  const archived = Boolean(activeChat?.archivedAt);
  const readOnly = archived;
  /**
   * Writing and sending are separate.
   *
   * The whole composer used to go dead the moment ChatGPT was not connected,
   * which meant the one thing a reader arrives wanting to do — put their
   * question into words — was the thing they could not do until they had
   * been through setup. They can write it now; only Send waits for the
   * connection, and the draft is kept while they go and make one.
   */
  const canWrite = Boolean(application) && Boolean(activeChat);
  const composerDisabled = !canWrite || readOnly;
  const sendDisabled = composerDisabled || !piReady;
  const clockReady = useClockReady();
  /**
   * The turn this conversation is still finishing, if there is one.
   *
   * The backend refuses a second message while one is queued or running, so
   * this is the same condition it enforces, read from the same records.
   */
  const inFlight = (view.messages ?? []).find(
    (message) =>
      message.role === "assistant" &&
      (message.status === "queued" || message.status === "running"),
  );
  const inFlightActivity = runActivity({
    runId: inFlight?.id,
    status: inFlight?.status ?? "",
    workerAlive,
    startedAt: runs.find((item) => item.assistantMessageId === inFlight?.id)
      ?.startedAt,
    hasDraft: Boolean(inFlight?.body?.trim()),
    executions: view.executions ?? [],
    activity: view.piActivity ?? [],
    now,
  });
  /**
   * Only while the turn it describes is not on screen. With the running
   * message in view this is the same sentence twice, one above the other.
   */
  const inFlightAway = useOffScreen(
    inFlight ? `sg-message-${inFlight.id}` : null,
    Boolean(inFlight),
  );
  const requestPending = view.messages.some(
    (message) => message.status === "queued" || message.status === "running",
  );

  // What Pi has asked the owner for. Read while a turn is running, because
  // that is when a request appears, and once afterwards so the field goes
  // away when the turn that needed it has finished.
  const [secrets, setSecrets] = useState<SecretRequest[]>([]);
  // The message Pi was on when it first asked. Answering a field must not
  // move the request, so this is taken from the earliest ask in the group
  // and re-derived from timestamps after a refresh.
  const secretsOwnMessage = secretRequestPoint(secrets, view.messages ?? []);
  const secretsHere = Boolean(view.application) && chatId === view.chats[0]?.id;

  /**
   * Drafts the sentence that tells Pi the values are in, and puts the reader
   * in the composer with it. It drafts rather than sends, like every other
   * offer on these pages: the message is the reader's, and they may want to
   * add to it before it goes.
   */
  const continueAfterSecrets = useCallback(
    (draft: string) => {
      onComposerChange(draft);
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>("#pi-composer")?.focus(),
      );
    },
    [onComposerChange],
  );

  /**
   * Where each saved record is shown in full.
   *
   * Pi attaches a record to a reply, and the same record can be attached to
   * more than one — so a real transcript drew the same Cloudflare failure
   * three times at 653px each, and a reader saw three problems where there
   * was one. A record earns its full card at its first appearance; later
   * appearances keep their place in the order and say what they are in one
   * line, with everything still one click down.
   */
  const firstShown = useMemo(
    () => firstAppearances(view.messages),
    [view.messages],
  );
  const applicationId = view.application?.id;
  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/applications/${applicationId}/secrets`,
        );
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setSecrets(body.secrets ?? []);
      } catch {
        // A page that cannot reach its own controller has louder problems.
      }
    };
    void read();
    if (!requestPending) return;
    const timer = window.setInterval(read, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applicationId, requestPending]);

  return (
    <section className="sg-chat-pane">
      {activeChat && activeChat.id !== view.chats[0]?.id && (
        <header className="sg-pane-title sg-chat-title">
          <span>
            {archived ? "Archived · read-only" : "Read-only side chat"}
          </span>
          {!readOnly && (
            <button
              className="sg-text-button"
              disabled={busy !== null}
              onClick={onArchive}
              type="button"
            >
              <Archive /> Archive chat
            </button>
          )}
        </header>
      )}
      {/* The bar means work is moving. With no worker reading the queue it
          would be an animation over a message nobody has picked up. */}
      {(busy !== null || (requestPending && workerAlive !== false)) && (
        <div className="sg-busy-bar" aria-hidden="true" />
      )}

      {view.application && chatId && view.chats[0]?.id === chatId && (
        <OperatorConsole
          key={`settings:${view.application.id}:${chatId}`}
          applicationId={view.application.id}
          chatId={chatId}
          main={view.chats[0]?.id === chatId}
          settingsOnly
        />
      )}
      <Conversation className="sg-conversation">
        <ConversationContent className="sg-messages">
          {reconnecting && (
            <p className="sg-stream-notice" role="status">
              <SpinnerGap className="spin" aria-hidden="true" />
              Reconnecting… accepted messages keep running, and this view
              catches up on its own.
            </p>
          )}
          {view.messages.map((message) => {
            const run = runs.find(
              (run) => run.assistantMessageId === message.id,
            );
            const provisional = message.status !== "completed";
            const inProgress =
              message.status === "queued" || message.status === "running";
            const retried =
              run !== undefined &&
              runs.some((attempt) => attempt.retryOfId === run.id);
            const failure = runFailure({
              runId: message.id,
              error: run?.error,
              executions: view.executions ?? [],
            });
            const historyUnavailable =
              run?.status === "failed" &&
              run.error?.startsWith("Conversation history unavailable.");
            // A request Haldur started itself is never shown as the
            // engineer's words.
            const engineer =
              message.role === "user" && message.source === "user";
            return (
              <Fragment key={message.id}>
                <Message
                  className={
                    provisional
                      ? inProgress
                        ? "sg-message-live"
                        : "sg-message-failed"
                      : message.role === "user" && !engineer
                        ? "sg-message-request"
                        : ""
                  }
                  from={engineer ? "user" : "assistant"}
                  id={`sg-message-${message.id}`}
                >
                  <div className="sg-message-heading">
                    <span
                      className={`sg-avatar ${engineer ? "user" : ""}`}
                      aria-hidden="true"
                    >
                      {engineer ? "You" : "SG"}
                    </span>
                    <strong>{engineer ? "You" : "Haldur"}</strong>
                    {message.source === "haldur" && (
                      <span className="sg-source-tag">
                        {message.role === "user"
                          ? "Started automatically"
                          : "Recorded event"}
                      </span>
                    )}
                    {provisional && (
                      <span
                        className={`sg-source-tag ${inProgress ? "live" : "failed"}`}
                      >
                        {ATTEMPT_LABELS[message.status]}
                      </span>
                    )}
                    <LocalTime value={message.createdAt} variant="compact" />
                  </div>
                  <MessageContent>
                    {provisional ? (
                      <div className="sg-run-progress">
                        {message.body && inProgress && !view.piActivity && (
                          <MessageResponse>
                            <Markdown source={message.body} />
                          </MessageResponse>
                        )}
                        <p className="sg-run-status" role="status">
                          {/* A spinner beside "nothing is running" is the
                              contradiction this change exists to remove. */}
                          {inProgress && workerAlive !== false && (
                            <SpinnerGap className="spin" aria-hidden="true" />
                          )}
                          {message.status === "queued" ||
                          message.status === "running" ? (
                            <Doing
                              activity={runActivity({
                                runId: message.id,
                                status: message.status,
                                startedAt: run?.startedAt,
                                hasDraft: Boolean(message.body?.trim()),
                                workerAlive,
                                executions: view.executions ?? [],
                                activity: view.piActivity ?? [],
                                now,
                              })}
                            />
                          ) : run?.error?.startsWith(
                              "Conversation history unavailable.",
                            ) ? (
                            run.error
                          ) : message.status === "cancelled" ||
                            message.status === "interrupted" ? (
                            stopOutcome(view.executions, message.id)
                          ) : (
                            failure.says
                          )}
                        </p>
                        {message.body && !inProgress && (
                          <details className="sg-run-draft">
                            <summary>Show unfinished draft</summary>
                            <MessageResponse>
                              <Markdown source={message.body} />
                            </MessageResponse>
                          </details>
                        )}
                        {run && !readOnly && !retried && (
                          <button
                            className={
                              inProgress
                                ? "sg-run-stop"
                                : "sg-run-action sg-primary-button"
                            }
                            disabled={busy !== null}
                            onClick={() => {
                              if (historyUnavailable) onNewChat();
                              else if (inProgress)
                                onRunAction(run.id, "cancel");
                              else if (failure.action.kind === "ask")
                                continueAfterSecrets(failure.action.draft!);
                              else onRunAction(run.id, "retry");
                            }}
                            type="button"
                          >
                            {!inProgress && (
                              <ArrowClockwise
                                aria-hidden="true"
                                weight="bold"
                              />
                            )}
                            {inProgress
                              ? "Stop"
                              : historyUnavailable
                                ? "Start a new chat"
                                : // A command that exited non-zero will exit
                                  // non-zero again, so retrying it is a way
                                  // of not reading the error. The control
                                  // follows what actually failed.
                                  failure.action.label}
                          </button>
                        )}
                      </div>
                    ) : view.piActivity &&
                      hasActivity(view.piActivity, message.id) ? null : (
                      // With a transcript the body is drawn inside it, in the
                      // place it happened, rather than above the calls.
                      <MessageResponse>
                        <Markdown source={message.body} />
                      </MessageResponse>
                    )}
                  </MessageContent>
                  {message.role === "assistant" && view.piActivity && (
                    <PiActivity
                      records={view.piActivity}
                      executions={view.executions}
                      runId={message.id}
                      live={
                        message.status === "running" ||
                        (message.status === "completed" &&
                          hasActivity(view.piActivity, message.id))
                          ? message.body
                          : null
                      }
                      renderExecution={(executionId) =>
                        view.application && chatId ? (
                          <OperatorConsole
                            applicationId={view.application.id}
                            chatId={chatId}
                            main={view.chats[0]?.id === chatId}
                            executionId={executionId}
                            records={view.executions}
                          />
                        ) : null
                      }
                    />
                  )}
                  {message.blocks?.map((block, index) => {
                    // A call already drawn in the activity order is not drawn
                    // again here; the link is by execution id, not by name.
                    if (
                      block.type === "execution" &&
                      view.piActivity?.some(
                        (record) => record.executionId === block.id,
                      )
                    )
                      return null;
                    if (block.type === "text")
                      return <Markdown key={index} source={block.text} />;
                    if (
                      block.type === "execution" &&
                      view.application &&
                      chatId
                    )
                      return (
                        <OperatorConsole
                          key={block.id}
                          applicationId={view.application.id}
                          chatId={chatId}
                          main={view.chats[0]?.id === chatId}
                          executionId={block.id}
                          records={view.executions}
                        />
                      );
                    if (block.type === "saved-information") {
                      const record = view.information?.find(
                        (r) => r.id === block.id,
                      );
                      return record ? (
                        <InformationCard
                          key={block.id}
                          record={record}
                          onOpen={openDestination}
                          reachable={reachable}
                          superseded={
                            firstShown.get(record.id) !==
                            `${message.id}:${index}`
                          }
                        />
                      ) : null;
                    }
                    return null;
                  })}
                  {references?.get(message.id)?.length ? (
                    <div className="sg-message-refs">
                      <span>Saved from this reply</span>
                      {references.get(message.id)!.map((reference) => (
                        <button
                          className={`sg-message-ref ${reference.tone}`}
                          key={reference.key}
                          onClick={() => onReveal?.()}
                          title="Open in History"
                          type="button"
                        >
                          {reference.label} <em>{reference.status}</em>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <OperationReferences
                    operations={mentioned(message.id)}
                    chats={view.chats}
                    onOpenConversation={openConversation}
                    onOpen={openDestination}
                  />
                  {receipts(anchored.get(message.id))}
                </Message>
                {/* The request Pi raised on this message, drawn at the point
                    it was asked rather than wherever the reader is now. */}
                {secretsHere && secretsOwnMessage === message.id && (
                  <SecretRequests
                    applicationId={view.application!.id}
                    secrets={secrets}
                    onChanged={setSecrets}
                    onContinue={continueAfterSecrets}
                  />
                )}
              </Fragment>
            );
          })}
          {unanchored.length > 0 && (
            <div className="sg-message sg-message-assistant sg-message-receipts">
              {receipts(unanchored)}
            </div>
          )}

          {view.application && chatId && (
            <OperatorConsole
              key={`executions:${view.application.id}:${chatId}`}
              records={view.executions}
              excludeIds={view.messages.flatMap(
                (m) =>
                  m.blocks?.flatMap((b) =>
                    b.type === "execution" ? [b.id] : [],
                  ) ?? [],
              )}
              applicationId={view.application.id}
              chatId={chatId}
              main={view.chats[0]?.id === chatId}
            />
          )}

          {pendingMessage !== null && (
            <>
              <Message from="user">
                <div className="sg-message-heading">
                  <span className="sg-avatar user" aria-hidden="true">
                    You
                  </span>
                  <strong>You</strong>
                  <span className="sg-source-tag">Pending</span>
                </div>
                <MessageContent>
                  <MessageResponse>
                    <Markdown source={pendingMessage} />
                  </MessageResponse>
                </MessageContent>
              </Message>
              <p className="sg-reply-pending" role="status">
                <SpinnerGap className="spin" aria-hidden="true" /> Saving
                message…
              </p>
            </>
          )}

          {error && application && (
            <div className="sg-error" role="alert">
              {error}
            </div>
          )}
          {/* If the asking message is no longer in the transcript, the
              request still has to be reachable, so it goes at the end. */}
          {secretsHere && !secretsOwnMessage && (
            <SecretRequests
              applicationId={view.application!.id}
              secrets={secrets}
              onChanged={setSecrets}
              onContinue={continueAfterSecrets}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* A request for a value belongs where you act on it, not above the
          conversation. It used to be the first thing in the chat pane — a
          full-bleed 563px wall stacked above every message, pushing the
          transcript down and colliding with the permissions strip. It sits
          with the composer now, on the same measure as the messages. */}
      {/* The only thing between the transcript and the composer, and only
          while the request has scrolled out of sight. */}
      {view.application && chatId && view.chats[0]?.id === chatId && (
        <SecretRequestsChip secrets={secrets} />
      )}

      {/* What is still running, said before the reader finds out by being
          refused.
          Sending while a turn is in flight is rejected by the backend with
          "Pi is still working in this conversation", and the owner meets that
          sentence after typing — having read a finished-looking answer and
          scrolled past a request Haldur started for itself. The guard is
          right and stays; what was missing is that the conversation never
          said so where the typing happens. */}
      {inFlight && inFlightAway && (
        <div className="sg-still-working" role="status">
          {workerAlive !== false && (
            <SpinnerGap className="spin" aria-hidden="true" />
          )}
          <span className="sg-still-what">
            {inFlightActivity.says}
            {clockReady && inFlightActivity.since && (
              <small>{inFlightActivity.since}</small>
            )}
          </span>
          <button
            type="button"
            className="sg-still-show"
            onClick={() =>
              document
                .getElementById(`sg-message-${inFlight.id}`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
            }
          >
            Show
          </button>
        </div>
      )}

      <form
        className="sg-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        {archived && (
          <p className="sg-archived-notice">
            This chat is archived and read-only. Choose an active chat or start
            a new one.
          </p>
        )}
        {/* Sending puts a message in a queue. If nothing is reading that
            queue, the message sits there looking exactly like a reply being
            written, and the only clue is a console the owner is not reading.
            It is said here, where they are about to type. */}
        {application && piReady && workerAlive === false && (
          <div className="sg-pi-required">
            <WarningCircle weight="bold" />
            <div>
              <strong>No worker is running</strong>
              <p>
                Messages are saved and stay queued until one starts. Run{" "}
                <code>npm run dev</code>, which starts it, or{" "}
                <code>npm run worker</code> in this checkout.
              </p>
            </div>
          </div>
        )}
        {application && !piReady && (
          <div className="sg-pi-required">
            <WarningCircle weight="bold" />
            <div>
              <strong>Connect ChatGPT to chat</strong>
              <p>
                Your applications and chat history are still available, and
                anything you have typed here is kept.
              </p>
            </div>
            {/* The two ids are what brings the reader back to this exact
                conversation afterwards. They name records, not a URL, and
                the draft stays in this browser rather than travelling. */}
            <Link
              href={
                chatId
                  ? `/setup/pi?application=${application.id}&chat=${chatId}`
                  : "/setup/pi"
              }
            >
              Open Settings
            </Link>
          </div>
        )}
        <div
          className={`sg-composer-box${composerDisabled ? " disabled" : ""}`}
        >
          <textarea
            disabled={composerDisabled}
            id="pi-composer"
            aria-label="Message Haldur"
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!busy && !sendDisabled)
                  event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              archived
                ? "This chat is archived"
                : !piReady
                  ? "Write it now; connect ChatGPT to send it"
                  : application
                    ? "Ask Haldur, correct a decision, or add context…"
                    : "Add an application to start chatting"
            }
            rows={2}
            value={composer}
          />
          <div className="sg-composer-bar">
            <span className="sg-composer-hint">
              <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line
            </span>
            <button
              className="sg-send"
              disabled={!composer.trim() || sendDisabled || busy !== null}
              type="submit"
            >
              {busy === "message" ? (
                <SpinnerGap className="spin" aria-hidden="true" />
              ) : (
                <PaperPlaneRight weight="fill" aria-hidden="true" />
              )}
              Send
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
