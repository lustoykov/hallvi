"use client";

import { HallviMark } from "./hallvi-mark";
import {
  Archive,
  ArrowClockwise,
  Check,
  Copy,
  PaperPlaneRight,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import type { Chat, ChatMessage, OperatorView } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import type { ConversationContext } from "./conversation-continuity";
import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";
import { InformationCard } from "./information-card";
import { hasActivity, PiActivity } from "./pi-activity";
import { WorkingMascot } from "./working-mascot";
import {
  runActivity,
  runFailure,
  useClockReady,
  type RunActivity,
} from "./run-activity";
import { OperatorConsole } from "./operator-console";
import { useConnectionRequests } from "./onboarding/connection-requests";
import {
  JourneyRail,
  READ_REPOSITORY_MESSAGE,
} from "./onboarding/journey-rail";
import {
  SecretRequests,
  SecretRequestsChip,
  secretRequestPoint,
  type SecretRequest,
} from "./secret-request";

/** The message a view or Overview asked to reveal; the nonce repeats it. */
export interface MessageHighlight {
  messageId: string;
  nonce: number;
}

const ATTEMPT_LABELS: Record<ChatMessage["status"], string> = {
  completed: "Saved",
  delivered: "Saved",
  waiting: "Waiting",
  running: "Draft",
  failed: "Failed",
  // The reader stopped it. The status line beneath says "Stopped", and a tag
  // reading "Cancelled" beside it made one action look like two outcomes.
  cancelled: "Stopped",
  // Nobody stopped it: the worker went away, and how far it got is not known.
  interrupted: "Interrupted",
};

function CopyReply({ body }: { body: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="hv-reply-copy">
      <button type="button" onClick={() => void copy()}>
        {status === "copied" ? (
          <Check weight="bold" aria-hidden="true" />
        ) : (
          <Copy weight="bold" aria-hidden="true" />
        )}
        {status === "copied" ? "Copied" : "Copy reply"}
      </button>
      <span role="status">
        {status === "failed"
          ? "Copy failed — select the reply to copy it."
          : ""}
      </span>
    </div>
  );
}

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
      <span
        className={activity.waitingOnYou ? undefined : "hv-sheen"}
        data-waiting={activity.waitingOnYou || undefined}
      >
        {activity.says}
      </span>
      {clock && activity.since && (
        <small className="hv-run-elapsed">{activity.since}</small>
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
  context = null,
  onComposerChange,
  onDismissContext,
  onReturnToContext,
  onSend,
  onArchive,
  reconnecting,
  onStop,
  onContinue,
  onTell,
  onNewChat,
  now = 0,
  onOpenDestination,
  highlight,
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
  context?: ConversationContext | null;
  onComposerChange: (value: string) => void;
  onDismissContext?: () => void;
  onReturnToContext?: (section: ApplicationSection) => void;
  /** "steer" hands it to Pi at its next step instead of after its work. */
  onSend: (delivery?: "next" | "steer") => void;
  onArchive: () => void;
  reconnecting: boolean;
  /** Stop what Pi is doing here; what was waiting is never started. */
  onStop: () => void;
  onContinue: () => void;
  /**
   * Sends Hallvi a message the owner did not have to type: a connection card
   * settled, or a rung of the access ladder was chosen. Absent, it is drafted
   * into the composer instead.
   */
  onTell?: (message: string) => void;
  onNewChat: () => void;
  now?: number;
  onOpenDestination?: (destination: ApplicationSection) => void;
  highlight?: MessageHighlight | null;
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const openDestination = onOpenDestination ?? (() => {});
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
    element.classList.add("hv-message-highlight");
    const timer = window.setTimeout(
      () => element.classList.remove("hv-message-highlight"),
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
      element.classList.add("hv-message-highlight");
      window.setTimeout(
        () => element.classList.remove("hv-message-highlight"),
        2600,
      );
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const element = document.getElementById(
      `hv-message-${highlight.messageId}`,
    );
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    element.classList.add("hv-message-highlight");
    const timer = window.setTimeout(
      () => element.classList.remove("hv-message-highlight"),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [highlight, messageCount]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("message");
    if (id)
      document
        .getElementById(`hv-message-${id}`)
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
  const sendUnavailable = composerDisabled || !piReady;
  /**
   * The turn this conversation is still finishing, if there is one.
   *
   * The backend refuses a second message while one is queued or running, so
   * this is the same condition it enforces, read from the same records.
   */
  const inFlight = (view.messages ?? []).find(
    (message) => message.role === "assistant" && message.status === "running",
  );
  const waiting = (view.messages ?? []).filter(
    (message) => message.status === "waiting",
  );
  /**
   * Pi holds unfinished work that nobody is running: a worker went away while
   * it was busy. Nothing runs again until the owner says which way it goes.
   */
  const interrupted =
    !inFlight &&
    (waiting.length > 0 ||
      view.messages.some((message) => message.status === "interrupted"));
  const sendDisabled = sendUnavailable || interrupted;
  const inFlightActivity = runActivity({
    runId: inFlight?.id,
    status: inFlight ? "running" : "",
    workerAlive,
    startedAt: inFlight?.startedAt,
    hasDraft: Boolean(inFlight?.body?.trim()),
    executions: view.executions ?? [],
    activity: view.piActivity ?? [],
    now,
  });
  /** Whether the transcript shortcut is useful beside the persistent status. */
  const requestPending = view.messages.some(
    (message) => message.status === "waiting" || message.status === "running",
  );
  const contextualUserMessageId = context?.requestKey
    ? view.messages.find((sent) => sent.requestKey === context.requestKey)?.id
    : null;

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
  const connections = useConnectionRequests({
    applicationId,
    application: view.application?.name ?? "the application",
    messages: view.messages,
    information: view.information ?? [],
    poll: requestPending,
    enabled: secretsHere,
    onTell: onTell ?? continueAfterSecrets,
  });
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

  const firstConversation =
    secretsHere &&
    Boolean(connections.journey) &&
    activeChat?.kind === "main" &&
    !archived &&
    !view.messages.some((message) => message.role === "user") &&
    !connections.journey?.read;
  const showFirstWelcome =
    firstConversation && !requestPending && pendingMessage === null;

  const stopLabel =
    waiting.length > 0 ? `Stop + cancel ${waiting.length} waiting` : "Stop";
  return (
    <section className="hv-chat-pane">
      {activeChat && activeChat.id !== view.chats[0]?.id && (
        <header className="hv-pane-title hv-chat-title">
          <span>
            {archived ? "Archived · read-only" : "Read-only side chat"}
          </span>
          {!readOnly && (
            <button
              className="hv-text-button"
              disabled={busy !== null}
              onClick={onArchive}
              type="button"
            >
              <Archive /> Archive chat
            </button>
          )}
        </header>
      )}
      {/* Before the first request, the welcome has room to explain the next
          useful action. Once work starts, progress moves beside the composer
          and this row leaves the conversation to the transcript. */}
      {showFirstWelcome && (
        <div className="hv-chat-top">
          {connections.journey && view.application && (
            <JourneyRail
              application={view.application.name}
              facts={connections.journey}
              waitingOnYou={secrets.some((secret) => !secret.establishedAt)}
              placement="welcome"
              canStart={piReady && !busy && !requestPending && Boolean(onTell)}
              connectHref={
                !piReady && chatId
                  ? `/setup/pi?application=${view.application.id}&chat=${chatId}&onboarding=1`
                  : undefined
              }
              onStart={() => onTell?.(READ_REPOSITORY_MESSAGE)}
            />
          )}
        </div>
      )}
      <Conversation className="hv-conversation">
        <ConversationContent className="hv-messages">
          {reconnecting && (
            <p className="hv-stream-notice" role="status">
              <SpinnerGap className="spin" aria-hidden="true" />
              Reconnecting… accepted messages keep running, and this view
              catches up on its own.
            </p>
          )}
          {view.messages.map((message) => {
            // The owner's message is settled once Pi has read it. Until
            // then it waits, and it can end without ever being read.
            const unread =
              message.role === "user" &&
              !["completed", "delivered"].includes(message.status);
            const provisional =
              message.role === "assistant" && message.status !== "completed";
            const inProgress = message.status === "running";
            const asked = view.messages.find(
              (sent) => sent.id === message.responseTo,
            );
            const last = view.messages.at(-1)?.id === message.id;
            const failure = runFailure({
              runId: message.id,
              error: message.error,
              executions: view.executions ?? [],
            });
            const historyUnavailable =
              message.status === "failed" &&
              message.error?.startsWith("Conversation history unavailable.");
            // A request Hallvi started itself is never shown as the
            // engineer's words.
            const engineer =
              message.role === "user" && message.source === "user";
            return (
              <Fragment key={message.id}>
                <Message
                  className={
                    unread
                      ? message.status === "waiting"
                        ? ""
                        : "hv-message-failed"
                      : provisional
                        ? inProgress
                          ? "hv-message-live"
                          : "hv-message-failed"
                        : message.role === "user" && !engineer
                          ? "hv-message-request"
                          : ""
                  }
                  from={engineer ? "user" : "assistant"}
                  id={`hv-message-${message.id}`}
                >
                  <div className="hv-message-heading">
                    {engineer ? (
                      <span className="hv-avatar user" aria-hidden="true">
                        You
                      </span>
                    ) : (
                      <HallviMark />
                    )}
                    <strong>{engineer ? "You" : "Hallvi"}</strong>
                    {message.source === "hallvi" && (
                      <span className="hv-source-tag">
                        {message.role === "user"
                          ? "Started automatically"
                          : "Recorded event"}
                      </span>
                    )}
                    {(provisional || unread) &&
                      message.status !== "running" && (
                        <span
                          className={`hv-source-tag ${message.status === "waiting" ? "live" : "failed"}`}
                        >
                          {unread && message.status === "waiting"
                            ? message.delivery === "steer"
                              ? "Steering"
                              : "Waiting"
                            : unread
                              ? "Not run"
                              : ATTEMPT_LABELS[message.status]}
                        </span>
                      )}
                    <LocalTime value={message.createdAt} variant="compact" />
                  </div>
                  <MessageContent>
                    {engineer && message.id === contextualUserMessageId && (
                      <span className="hv-message-context">
                        About {context?.label}
                      </span>
                    )}
                    {provisional ? (
                      <div className="hv-run-progress">
                        {message.body && inProgress && !view.piActivity && (
                          <MessageResponse>
                            <Markdown source={message.body} />
                          </MessageResponse>
                        )}
                        {!inProgress && (
                          <p className="hv-run-status" role="status">
                            {historyUnavailable
                              ? message.error
                              : message.status === "cancelled"
                                ? stopOutcome(view.executions, message.id)
                                : message.status === "interrupted"
                                  ? // Not the reader's Stop, and never "nothing
                                    // had run": the reply says what is unknown.
                                    (message.error ??
                                    stopOutcome(view.executions, message.id))
                                  : failure.says}
                          </p>
                        )}
                        {message.body && !inProgress && (
                          <details className="hv-run-draft">
                            <summary>Show unfinished draft</summary>
                            <MessageResponse>
                              <Markdown source={message.body} />
                            </MessageResponse>
                          </details>
                        )}
                        {!readOnly &&
                          !inProgress &&
                          last &&
                          message.status !== "interrupted" && (
                            <button
                              className="hv-run-action hv-primary-button"
                              disabled={busy !== null}
                              onClick={() => {
                                if (historyUnavailable) onNewChat();
                                else if (failure.action.kind === "ask")
                                  continueAfterSecrets(failure.action.draft!);
                                else if (asked) onTell?.(asked.body);
                              }}
                              type="button"
                            >
                              <ArrowClockwise
                                aria-hidden="true"
                                weight="bold"
                              />
                              {historyUnavailable
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
                    {unread && (
                      <div className="hv-run-progress">
                        <p className="hv-run-status" role="status">
                          {message.status === "waiting"
                            ? message.delivery === "steer" && inFlight
                              ? "Pi reads this after its current step, before it carries on. It does not interrupt a running command or a pending approval."
                              : inFlight
                                ? "Pi reads this when its current work is done."
                                : "Pi holds this and has not read it. Continue has Pi read it; Stop cancels it."
                            : message.error}
                        </p>
                        {!readOnly && message.status !== "waiting" && last && (
                          <button
                            className="hv-run-action hv-primary-button"
                            disabled={busy !== null}
                            onClick={() => onTell?.(message.body)}
                            type="button"
                          >
                            <ArrowClockwise aria-hidden="true" weight="bold" />
                            Send again
                          </button>
                        )}
                      </div>
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
                  {message.role === "assistant" &&
                    message.source === "pi" &&
                    message.status === "completed" &&
                    Boolean(message.body.trim()) && (
                      <CopyReply body={message.body} />
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
                  {/* The one live line of a turn, at the end of the reply it
                      belongs to. The words carry the motion; Little Server
                      visits now and then. Stop lives in the composer. */}
                  {message.id === inFlight?.id && (
                    <div className="hv-still-working">
                      {workerAlive !== false && (
                        <SpinnerGap className="spin" aria-hidden="true" />
                      )}
                      <span className="hv-still-what" role="status">
                        <Doing activity={inFlightActivity} />
                      </span>
                      {workerAlive !== false && <WorkingMascot />}
                    </div>
                  )}
                </Message>
                {/* The request Pi raised on this message, drawn at the point
                    it was asked rather than wherever the reader is now. */}
                {connections.at(message.id)}
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
                <div className="hv-message-heading">
                  <span className="hv-avatar user" aria-hidden="true">
                    You
                  </span>
                  <strong>You</strong>
                  <span className="hv-source-tag">Pending</span>
                </div>
                <MessageContent>
                  <MessageResponse>
                    <Markdown source={pendingMessage} />
                  </MessageResponse>
                </MessageContent>
              </Message>
              <p className="hv-reply-pending" role="status">
                <SpinnerGap className="spin" aria-hidden="true" /> Saving
                message…
              </p>
            </>
          )}

          {connections.rest}
          {error && application && (
            <div className="hv-error" role="alert">
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

      {/* A request for a value belongs where you act on it, beside the
          deployment progress and live work status above the composer. */}
      {view.application && chatId && view.chats[0]?.id === chatId && (
        <SecretRequestsChip secrets={secrets} />
      )}

      {secretsHere &&
        !showFirstWelcome &&
        connections.journey &&
        view.application && (
          <JourneyRail
            application={view.application.name}
            facts={connections.journey}
            waitingOnYou={secrets.some((secret) => !secret.establishedAt)}
            placement="progress"
          />
        )}

      <form
        className="hv-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
          requestAnimationFrame(() =>
            composerRef.current?.focus({ preventScroll: true }),
          );
        }}
      >
        {archived && (
          <p className="hv-archived-notice">
            This chat is archived and read-only. Choose an active chat or start
            a new one.
          </p>
        )}
        {interrupted && !readOnly && workerAlive !== false && (
          <div className="hv-pi-required" role="status">
            <WarningCircle weight="bold" />
            <div>
              <strong>This conversation was interrupted</strong>
              <p>
                Hallvi stopped while Pi had work in hand. Nothing has run since,
                and nothing will until you choose. Continue has Pi carry on from
                where it was, without repeating a command it had started. Stop
                ends that work and drops anything still waiting.
              </p>
              <p>
                <button
                  className="hv-run-action hv-primary-button"
                  disabled={busy !== null}
                  onClick={onContinue}
                  type="button"
                >
                  Continue
                </button>{" "}
                <button
                  className="hv-run-action"
                  disabled={busy !== null}
                  onClick={onStop}
                  type="button"
                >
                  Stop
                </button>
              </p>
            </div>
          </div>
        )}
        {/* Only the worker can hand a message to Pi. Without one nothing is
            accepted, and that is said here, where the owner is about to
            type, rather than after they have sent it. */}
        {application && piReady && workerAlive === false && (
          <div className="hv-pi-required">
            <WarningCircle weight="bold" />
            <div>
              <strong>No worker is running</strong>
              <p>
                Nothing can be sent or shown until it runs again; what you have
                typed is kept. Restart Hallvi with <code>hallvi restart</code>,
                then check it with <code>hallvi status</code>.
                {process.env.NODE_ENV === "development" && (
                  <>
                    {" "}
                    In development, restart <code>npm run dev</code>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
        {application &&
          !piReady &&
          (!firstConversation || Boolean(composer.trim())) && (
            <div className="hv-pi-required">
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
          className={`hv-composer-box${composerDisabled ? " disabled" : ""}`}
        >
          {context && !context.requestKey && (
            <div className="hv-composer-context">
              <span>About {context.label}</span>
              <button
                type="button"
                onClick={onDismissContext}
                aria-label={`Remove ${context.label} context`}
              >
                <X weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}
          {context?.requestKey && (
            <div className="hv-context-return">
              <span>This question came from {context.label}.</span>
              <button
                type="button"
                onClick={() => onReturnToContext?.(context.section)}
              >
                Return to {context.label}
              </button>
            </div>
          )}
          <textarea
            ref={composerRef}
            disabled={composerDisabled}
            id="pi-composer"
            aria-label="Message Hallvi"
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
                    ? "Ask Hallvi, correct a decision, or add context…"
                    : "Add an application to start chatting"
            }
            rows={2}
            value={composer}
          />
          <div className="hv-composer-bar">
            <span className="hv-composer-left">
              {view.application && chatId && view.chats[0]?.id === chatId && (
                <OperatorConsole
                  key={`settings:${view.application.id}:${chatId}`}
                  applicationId={view.application.id}
                  chatId={chatId}
                  main
                  settingsOnly
                />
              )}
              <span className="hv-composer-hint">
                <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line
              </span>
            </span>
            {/* While a turn runs and nothing is typed, Send's place is Stop.
                Typing brings Send next back, so a follow-up can be queued. */}
            {inFlight && !readOnly && composer.trim() && (
              <button
                className="hv-steer"
                disabled={sendDisabled || busy !== null}
                type="button"
                title="Pi reads this after its current step, before it carries on. It does not interrupt a running command or a pending approval."
                onClick={() => onSend("steer")}
              >
                Steer
              </button>
            )}
            {requestPending && !readOnly && !composer.trim() ? (
              <button
                className="hv-stop"
                disabled={busy !== null}
                type="button"
                aria-label={stopLabel}
                title={stopLabel}
                onClick={onStop}
              >
                <i aria-hidden="true" />
              </button>
            ) : (
              <button
                className="hv-send"
                disabled={!composer.trim() || sendDisabled || busy !== null}
                type="submit"
              >
                {busy === "message" ? (
                  <SpinnerGap className="spin" aria-hidden="true" />
                ) : (
                  <PaperPlaneRight weight="fill" aria-hidden="true" />
                )}
                {requestPending ? "Send next" : "Send"}
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
