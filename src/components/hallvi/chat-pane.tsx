"use client";

import { currentAccessRecord } from "@/server/access-record";

import { HallviMark } from "./hallvi-mark";
import {
  Archive,
  ArrowClockwise,
  Check,
  Copy,
  PaperPlaneRight,
  Paperclip,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  Fragment,
  memo,
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
import type { SavedInformation } from "@/server/operator-data";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";
import type { Chat, ChatMessage, OperatorView } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import type { ConversationContext } from "./conversation-continuity";
import type { Reachability } from "./deployment-prototype/page-head";
import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";
import { InformationCard } from "./information-card";
import {
  attachmentSources,
  MAX_IMAGES,
  MessageImages,
  readImage,
  sentImageSources,
  type ImageAttachment,
} from "./message-images";
import { PiActivity } from "./pi-activity";
import { hostOf, intentOf, placeOf, whereItRan } from "./execution-text";
import { WorkingMascot } from "./working-mascot";
import {
  runActivity,
  runFailure,
  useClockReady,
  type RunActivity,
} from "./run-activity";
import { OperatorConsole } from "./operator-console";
import { useLatestFirst } from "./use-latest-first";
import { useConnectionRequests } from "./onboarding/connection-requests";
import { ModelConnect } from "./onboarding/model-connect";
import { GithubConnect } from "./onboarding/github-connect";
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

/** Where a message was written, when it was not this page. */
const ORIGIN_LABELS: Record<NonNullable<ChatMessage["origin"]>, string> = {
  cli: "CLI",
};

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

  // "Copied" answers one click, so it steps back and the next copy can say
  // it again.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [status]);

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

/** Stop ends Pi's work and queue, not effects on another machine. */
export function stopOutcome() {
  return "Stopped. Any waiting messages were cancelled. Stopping does not undo changes or confirm that remote processes stopped.";
}

/** This reply's native tool evidence; status alone never proves execution. */
function InterruptionEvidence({
  view,
  message,
  chatId,
  workerAlive,
}: {
  view: OperatorView;
  message: ChatMessage | undefined;
  chatId: string | null;
  workerAlive: boolean | undefined;
}) {
  if (!workerAlive || !view.piActivity || !message || message.chatId !== chatId)
    return (
      <p>
        Tool evidence is unavailable; the outcome cannot be established here.
      </p>
    );

  const calls = view.piActivity
    .filter(
      (call) =>
        call.kind === "tool" &&
        call.applicationId === view.application?.id &&
        call.runId === message.id,
    )
    .sort((a, b) => a.sequence - b.sequence)
    .map((call) => {
      const execution = view.executions?.find(
        (item) =>
          item.applicationId === call.applicationId &&
          item.chatId === chatId &&
          item.runId === message.id &&
          item.toolCallId === call.id &&
          item.id === call.executionId,
      );
      const ended =
        execution && ["succeeded", "failed"].includes(execution.status);
      // An exit code is the executor's result, including a transport failure.
      // It proves neither that the intended effect occurred nor remote health.
      const exit =
        ended && typeof execution.exitCode === "number"
          ? execution.exitCode
          : null;
      const returned =
        exit !== null ||
        (!call.executionId &&
          Boolean(call.finishedAt && call.result.trim()) &&
          ["succeeded", "failed"].includes(call.status)) ||
        (ended &&
          execution.status === "succeeded" &&
          Boolean(call.finishedAt && call.result.trim()));
      const place = execution
        ? whereItRan(execution)?.said
        : placeOf(call.tool);
      const label = [
        intentOf(execution?.input ?? call.args) ??
          call.tool.replaceAll("_", " "),
        place,
        execution ? (hostOf(execution.target) ?? execution.target) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        label,
        returned,
        exit,
        error: !call.executionId && call.status === "failed",
        declined: execution?.status === "declined",
        awaiting: execution?.status === "awaiting-approval",
      };
    });
  const result = calls.findLast((call) => call.returned);
  const unknown = calls.filter((call) => !call.returned && !call.declined);
  const lastUnknown = unknown.at(-1);
  return (
    <>
      {result && (
        <p>
          Last returned result: {result.label} —{" "}
          {result.exit === null
            ? result.error
              ? "the tool returned an error"
              : "the tool returned a result"
            : `the tool returned exit code ${result.exit}`}
          .
        </p>
      )}
      {lastUnknown && (
        <p>
          {lastUnknown.awaiting ? "Awaiting approval" : "Outcome unknown"}:{" "}
          {lastUnknown.label}.{" "}
          {unknown.length > 1
            ? `${unknown.length} calls have no confirmed outcome.`
            : ""}
        </p>
      )}
      {!calls.length && (
        <p>No matching tool evidence is available for this work.</p>
      )}
      {calls.length > 0 && !result && !lastUnknown && (
        <p>The recorded approval was declined; that call did not start.</p>
      )}
      {calls.length > 0 && (
        <p>
          <a href={`#hv-message-${message.id}`}>Read evidence</a>
        </p>
      )}
    </>
  );
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

const NONE: never[] = [];

/** Records gathered under the id each belongs to. */
function gather<T>(
  records: T[] | undefined,
  idOf: (record: T) => string | undefined,
) {
  const gathered = new Map<string, T[]>();
  for (const record of records ?? []) {
    const id = idOf(record);
    if (id === undefined) continue;
    const mine = gathered.get(id);
    if (mine) mine.push(record);
    else gathered.set(id, [record]);
  }
  return gathered;
}

/** One function for the life of the pane, calling whichever is current. */
function useSteady<A extends unknown[]>(
  callback: ((...values: A) => void) | undefined,
) {
  const current = useRef(callback);
  useEffect(() => {
    current.current = callback;
  });
  return useCallback((...values: A) => current.current?.(...values), []);
}

/** The same members in the same order: a rebuilt list of them is no news. */
function sameMembers(before: unknown, after: unknown) {
  return (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length &&
    before.every((member, index) => member === after[index])
  );
}

interface TranscriptMessageProps {
  message: ChatMessage;
  /** The owner's words this reply was written under, to send again. */
  asked: string | undefined;
  last: boolean;
  applicationId: string | undefined;
  chatId: string | null;
  /** The main conversation, where approvals are given. */
  main: boolean;
  readOnly: boolean;
  /** An action of the reader's is still in hand. */
  busy: boolean;
  /** A turn is running, which a message still waiting is read after. */
  working: boolean;
  /** The destination this message was asked from. */
  about: string | null;
  /** This reply's calls. Absent where the conversation has no transcript. */
  activity: ActivityRecord[] | undefined;
  /** The commands this reply ran. */
  executions: ExecutionRecord[];
  /** The saved record behind each block, in the blocks' order. */
  records: (SavedInformation | undefined)[] | undefined;
  /** Whether each block's record was already shown in full further up. */
  repeated: boolean[] | undefined;
  currentAccessId: string | undefined;
  reachable: Reachability | undefined;
  /** What the turn is doing, on the reply being written. */
  doing: RunActivity | null;
  workerAlive: boolean | undefined;
  onTell: (message: string) => void;
  onAsk: (draft: string) => void;
  onNewChat: () => void;
  onOpen: (destination: ApplicationSection) => void;
}

/**
 * One message of the transcript.
 *
 * It is handed its own records and nothing of the rest of the conversation,
 * and is drawn again only when one of them changes. A token arriving in the
 * newest reply, a keystroke in the composer and the half-minute clock used
 * to redraw every message there was: with three hundred replies above it,
 * each keystroke held the page for about 75 ms.
 */
const TranscriptMessage = memo(
  function TranscriptMessage({
    message,
    asked,
    last,
    applicationId,
    chatId,
    main,
    readOnly,
    busy,
    working,
    about,
    activity,
    executions,
    records,
    repeated,
    currentAccessId,
    reachable,
    doing,
    workerAlive,
    onTell,
    onAsk,
    onNewChat,
    onOpen,
  }: TranscriptMessageProps) {
    // The owner's message is settled once Pi has read it. Until then it
    // waits, and it can end without ever being read.
    const unread =
      message.role === "user" &&
      !["completed", "delivered"].includes(message.status);
    const provisional =
      message.role === "assistant" && message.status !== "completed";
    const inProgress = message.status === "running";
    const failure = runFailure({
      runId: message.id,
      error: message.error,
      failure: message.failure,
      executions,
    });
    const historyUnavailable =
      message.status === "failed" &&
      message.error?.startsWith("Conversation history unavailable.");
    // A request Hallvi started itself is never shown as the engineer's
    // words.
    const engineer = message.role === "user" && message.source === "user";
    // Sent from elsewhere on the owner's behalf: said where, not who.
    const author = engineer
      ? message.origin
        ? ORIGIN_LABELS[message.origin]
        : "You"
      : "Hallvi";
    return (
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
              {author}
            </span>
          ) : (
            <HallviMark />
          )}
          <strong>{author}</strong>
          {message.source === "hallvi" && (
            <span className="hv-source-tag">
              {message.role === "user"
                ? "Started automatically"
                : "Recorded event"}
            </span>
          )}
          {(provisional || unread) && message.status !== "running" && (
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
          {engineer && about !== null && (
            <span className="hv-message-context">About {about}</span>
          )}
          {provisional ? (
            <div className="hv-run-progress">
              {message.body && inProgress && !activity && (
                <MessageResponse>
                  <Markdown source={message.body} />
                </MessageResponse>
              )}
              {!inProgress && (
                <p className="hv-run-status" role="status">
                  {historyUnavailable
                    ? message.error
                    : message.status === "cancelled"
                      ? stopOutcome()
                      : message.status === "interrupted"
                        ? // Not the reader's Stop, and never "nothing
                          // had run": the reply says what is unknown.
                          (message.error ??
                          "Interrupted. The last command’s outcome is unknown.")
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
                    disabled={busy}
                    onClick={() => {
                      if (historyUnavailable) onNewChat();
                      else if (failure.action.kind === "ask")
                        onAsk(failure.action.draft!);
                      else if (asked !== undefined) onTell(asked);
                    }}
                    type="button"
                  >
                    <ArrowClockwise aria-hidden="true" weight="bold" />
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
          ) : activity?.length ? null : (
            // With a transcript the body is drawn inside it, in the
            // place it happened, rather than above the calls.
            <MessageResponse>
              <Markdown source={message.body} />
            </MessageResponse>
          )}
          {message.images && applicationId && chatId && (
            <MessageImages
              sources={sentImageSources(
                applicationId,
                chatId,
                message.id,
                message.images,
              )}
            />
          )}
          {unread && (
            <div className="hv-run-progress">
              <p className="hv-run-status" role="status">
                {message.status === "waiting"
                  ? message.delivery === "steer" && working
                    ? "Pi reads this after its current step, before it carries on. It does not interrupt a running command or a pending approval."
                    : working
                      ? "Pi reads this when its current work is done."
                      : "Pi holds this and has not read it. Continue has Pi read it; Stop cancels it."
                  : message.error}
              </p>
              {!readOnly && message.status !== "waiting" && last && (
                <button
                  className="hv-run-action hv-primary-button"
                  disabled={busy}
                  onClick={() => onTell(message.body)}
                  type="button"
                >
                  <ArrowClockwise aria-hidden="true" weight="bold" />
                  Send again
                </button>
              )}
            </div>
          )}
        </MessageContent>
        {message.role === "assistant" && activity && (
          <PiActivity
            records={activity}
            executions={executions}
            runId={message.id}
            live={
              message.status === "running" ||
              (message.status === "completed" && activity.length > 0)
                ? message.body
                : null
            }
            renderExecution={(executionId) =>
              applicationId && chatId ? (
                <OperatorConsole
                  applicationId={applicationId}
                  chatId={chatId}
                  main={main}
                  executionId={executionId}
                  records={executions}
                />
              ) : null
            }
          />
        )}
        {message.role === "assistant" &&
          message.source === "pi" &&
          message.status === "completed" &&
          Boolean(message.body.trim()) && <CopyReply body={message.body} />}
        {message.blocks?.map((block, index) => {
          // A call already drawn in the activity order is not drawn
          // again here; the link is by execution id, not by name.
          if (
            block.type === "execution" &&
            activity?.some((record) => record.executionId === block.id)
          )
            return null;
          if (block.type === "text")
            return <Markdown key={index} source={block.text} />;
          if (block.type === "execution" && applicationId && chatId)
            return (
              <OperatorConsole
                key={block.id}
                applicationId={applicationId}
                chatId={chatId}
                main={main}
                executionId={block.id}
                records={executions}
              />
            );
          if (block.type === "saved-information") {
            const record = records?.[index];
            return record ? (
              <InformationCard
                key={block.id}
                record={record}
                onOpen={onOpen}
                reachable={
                  record.presentation?.content?.kind === "application-access" &&
                  record.presentation.content.mode === "private" &&
                  record.id !== currentAccessId
                    ? "unknown"
                    : reachable
                }
                superseded={Boolean(repeated?.[index])}
              />
            ) : null;
          }
          return null;
        })}
        {/* The one live line of a turn, at the end of the reply it belongs
            to. The words carry the motion; Little Server visits now and
            then. Stop lives in the composer. A turn waiting on the reader is
            not working, so nothing on its line moves. */}
        {doing && (
          <div className="hv-still-working">
            {workerAlive !== false && !doing.waitingOnYou && (
              <SpinnerGap className="spin" aria-hidden="true" />
            )}
            <span className="hv-still-what" role="status">
              <Doing activity={doing} />
            </span>
            {workerAlive !== false && !doing.waitingOnYou && <WorkingMascot />}
          </div>
        )}
      </Message>
    );
  },
  (before, after) =>
    (Object.keys(after) as (keyof TranscriptMessageProps)[]).every(
      (key) =>
        before[key] === after[key] || sameMembers(before[key], after[key]),
    ),
);

export function ChatPane({
  view,
  activeChat,
  busy,
  error,
  pendingMessage,
  piReady,
  composer,
  attachments = [],
  onAttachmentsChange,
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
  checkingRepository = false,
  onCheckRepository,
  onModelConnected,
}: {
  /** A model login was saved from the conversation: sending is possible. */
  onModelConnected?: () => void;
  /** The repository check the owner asked for is still running. */
  checkingRepository?: boolean;
  onCheckRepository?: () => void;
  view: OperatorView;
  activeChat: Chat | null;
  busy: string | null;
  error: string | null;
  pendingMessage: { body: string; images: ImageAttachment[] } | null;
  piReady: boolean;
  composer: string;
  /** Images going with the next message. */
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (
    update: (current: ImageAttachment[]) => ImageAttachment[],
  ) => void;
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
  const currentAccessId = currentAccessRecord(
    view.information ?? [],
    view.application?.id,
  )?.id;
  const chatId = activeChat?.id ?? null;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  /** Anything to send: words, pictures, or both. */
  const drafted = Boolean(composer.trim()) || attachments.length > 0;
  async function attach(files: File[]) {
    if (!onAttachmentsChange || !files.length) return;
    setAttachError(null);
    const room = MAX_IMAGES - attachments.length;
    if (files.length > room)
      setAttachError(`A message can carry ${MAX_IMAGES} images.`);
    const read = await Promise.allSettled(files.slice(0, room).map(readImage));
    const added = read.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );
    const failed = read.find((r) => r.status === "rejected");
    if (failed?.status === "rejected")
      setAttachError(
        failed.reason instanceof Error
          ? failed.reason.message
          : "This image could not be attached.",
      );
    onAttachmentsChange((current) =>
      [...current, ...added].slice(0, MAX_IMAGES),
    );
  }
  const openDestination = onOpenDestination ?? (() => {});
  const messageCount = view.messages.length;
  const { earlier, conversation, show } = useLatestFirst(chatId, messageCount);
  const drawn = earlier ? view.messages.slice(earlier) : view.messages;
  /** Show what the reader asked for, lit for a moment. */
  const reveal = useCallback(
    (element: Element) => {
      show(element);
      element.classList.add("hv-message-highlight");
      window.setTimeout(
        () => element.classList.remove("hv-message-highlight"),
        2600,
      );
    },
    [show],
  );
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
    reveal(element);
  }, [view.messages, earlier, reveal]);

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
      reveal(element);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reveal]);

  // A message asked for by a view, or named in the address, is shown as soon
  // as it is drawn, and once. These run again with every message that
  // arrives, and would keep returning a reader who has since moved on.
  const revealed = useRef(0);
  useEffect(() => {
    if (!highlight || revealed.current === highlight.nonce) return;
    const element = document.getElementById(
      `hv-message-${highlight.messageId}`,
    );
    if (!element) return;
    revealed.current = highlight.nonce;
    reveal(element);
  }, [highlight, messageCount, earlier, reveal]);
  const linked = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("message");
    if (!id || linked.current === id) return;
    const element = document.getElementById(`hv-message-${id}`);
    if (!element) return;
    linked.current = id;
    show(element);
  }, [messageCount, earlier, show]);
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
  const messagesHere = view.messages.filter(
    (message) => message.chatId === chatId,
  );
  const inFlight = messagesHere.find(
    (message) => message.role === "assistant" && message.status === "running",
  );
  const waiting = messagesHere.filter(
    (message) => message.status === "waiting",
  );
  /**
   * Pi holds unfinished work that nobody is running: a worker went away while
   * it was busy. Nothing runs again until the owner says which way it goes.
   */
  const interruptedReply = messagesHere.findLast(
    (message) =>
      message.role === "assistant" && message.status === "interrupted",
  );
  const interrupted =
    !inFlight && (waiting.length > 0 || Boolean(interruptedReply));
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
  // What each message is drawn from, found once rather than by every
  // message searching the whole conversation for its own.
  const activityOf = useMemo(
    () => gather(view.piActivity, (record) => record.runId),
    [view.piActivity],
  );
  const executionsOf = useMemo(
    () => gather(view.executions, (record) => record.runId),
    [view.executions],
  );
  const informationOf = useMemo(
    () => new Map(view.information?.map((record) => [record.id, record])),
    [view.information],
  );
  const bodies = useMemo(
    () => new Map(view.messages.map((sent) => [sent.id, sent.body])),
    [view.messages],
  );
  const lastId = view.messages.at(-1)?.id;
  const tell = useSteady(onTell);
  const ask = useSteady(continueAfterSecrets);
  const startNewChat = useSteady(onNewChat);
  const open = useSteady(openDestination);

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
  /**
   * The welcome is already asking for a model, with the button that connects
   * it. While it is on screen the strip above the composer would be the third
   * place saying so, after it and the composer's own placeholder, so it waits
   * until the welcome has gone.
   */
  const welcomeAsksForModel =
    showFirstWelcome &&
    Boolean(connections.journey && view.application) &&
    Boolean(onModelConnected);

  /**
   * A repository Hallvi cannot read is a request in this conversation, not a
   * strip above it. In an untouched conversation the welcome says it first and
   * the card opens when asked for; anywhere else the card is simply there.
   * Once opened it stays for the visit, so it can fold into its receipt.
   */
  const [repositoryOpen, setRepositoryOpen] = useState(false);
  const access = application && secretsHere ? view.repository : undefined;
  const unread = access && access.status !== "passed" ? access : null;
  const repositoryName = application
    ? `${application.repositoryOwner}/${application.repositoryName}`
    : "";
  const repositoryCard =
    access && onCheckRepository && !archived
      ? unread
        ? !showFirstWelcome || repositoryOpen
        : repositoryOpen
      : false;

  /**
   * Connecting a model is a request here too. It opens where the reader asked
   * for it, and stays for the visit so it can fold into its receipt.
   */
  const [modelOpen, setModelOpen] = useState(false);
  const settingsHref =
    application && chatId
      ? `/setup/pi?application=${application.id}&chat=${chatId}`
      : "/setup/pi";
  const openModel = () => {
    setModelOpen(true);
    requestAnimationFrame(() =>
      document
        .querySelector('[aria-label="Connect a model"]')
        ?.scrollIntoView({ block: "nearest" }),
    );
  };

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
              repository={
                unread && onCheckRepository
                  ? {
                      name: repositoryName,
                      status:
                        unread.status === "blocked" ? "blocked" : "not-yet",
                      connected: unread.connected,
                      signIn: unread.signIn,
                      checking: checkingRepository,
                      onOpen: () => setRepositoryOpen(true),
                      onCheck: onCheckRepository,
                    }
                  : undefined
              }
              onConnect={!piReady && onModelConnected ? openModel : undefined}
              requestOpen={modelOpen ? !piReady : repositoryOpen && !!unread}
              onStart={() => onTell?.(READ_REPOSITORY_MESSAGE)}
            />
          )}
        </div>
      )}
      <Conversation
        className="hv-conversation"
        contextRef={conversation}
        initial="instant"
      >
        <ConversationContent className="hv-messages">
          {reconnecting && (
            <p className="hv-stream-notice" role="status">
              <SpinnerGap className="spin" aria-hidden="true" />
              Reconnecting… accepted messages keep running, and this view
              catches up on its own.
            </p>
          )}
          {earlier > 0 && (
            <p className="hv-stream-notice" role="status">
              <SpinnerGap className="spin" aria-hidden="true" />
              Loading earlier messages…
            </p>
          )}
          {drawn.map((message) => {
            const blocks = message.blocks;
            return (
              <Fragment key={message.id}>
                <TranscriptMessage
                  message={message}
                  asked={
                    message.responseTo
                      ? bodies.get(message.responseTo)
                      : undefined
                  }
                  last={message.id === lastId}
                  applicationId={applicationId}
                  chatId={chatId}
                  main={view.chats[0]?.id === chatId}
                  readOnly={readOnly}
                  // Only the last message carries a control that waits.
                  busy={busy !== null && message.id === lastId}
                  working={message.status === "waiting" && Boolean(inFlight)}
                  about={
                    message.id === contextualUserMessageId
                      ? (context?.label ?? "")
                      : null
                  }
                  activity={
                    view.piActivity
                      ? (activityOf.get(message.id) ?? NONE)
                      : undefined
                  }
                  executions={executionsOf.get(message.id) ?? NONE}
                  records={blocks?.map((block) =>
                    block.type === "saved-information"
                      ? informationOf.get(block.id)
                      : undefined,
                  )}
                  repeated={blocks?.map(
                    (block, index) =>
                      block.type === "saved-information" &&
                      firstShown.get(block.id) !== `${message.id}:${index}`,
                  )}
                  currentAccessId={currentAccessId}
                  reachable={reachable}
                  doing={message.id === inFlight?.id ? inFlightActivity : null}
                  workerAlive={workerAlive}
                  onTell={tell}
                  onAsk={ask}
                  onNewChat={startNewChat}
                  onOpen={open}
                />
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
                  {pendingMessage.body && (
                    <MessageResponse>
                      <Markdown source={pendingMessage.body} />
                    </MessageResponse>
                  )}
                  <MessageImages
                    sources={attachmentSources(pendingMessage.images)}
                  />
                </MessageContent>
              </Message>
              <p className="hv-reply-pending" role="status">
                <SpinnerGap className="spin" aria-hidden="true" /> Saving
                message…
              </p>
            </>
          )}

          {connections.rest}
          {repositoryCard && access && onCheckRepository && (
            <GithubConnect
              repository={repositoryName}
              access={access}
              checking={checkingRepository}
              onCheck={onCheckRepository}
              onClose={
                showFirstWelcome ? () => setRepositoryOpen(false) : undefined
              }
            />
          )}
          {modelOpen && application && onModelConnected && !archived && (
            <ModelConnect
              settingsHref={settingsHref}
              onConnected={onModelConnected}
              onClose={() => setModelOpen(false)}
            />
          )}
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
              <InterruptionEvidence
                view={view}
                message={interruptedReply}
                chatId={chatId}
                workerAlive={workerAlive}
              />
              <p>
                {waiting.length === 0
                  ? "No follow-ups are waiting."
                  : `${waiting.length} follow-up${waiting.length === 1 ? " is" : "s are"} waiting.`}{" "}
                Continue resumes this work, then reads waiting messages.
                Interrupted calls are not automatically repeated.
              </p>
              <p>
                Stop cancels waiting messages. It does not undo changes or
                confirm that remote processes stopped.
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
                  className="hv-run-action hv-secondary-button"
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
        {application && !piReady && !modelOpen && !welcomeAsksForModel && (
          <div className="hv-pi-required">
            <WarningCircle weight="bold" />
            <div>
              <strong>Connect a model to chat</strong>
              <p>
                Your applications and chat history are still available, and
                anything you have typed here is kept.
              </p>
            </div>
            {/* Connecting happens here, in the conversation, so what has
                  been typed never has to travel. Settings stays a link for
                  someone who wants the model preferences. */}
            {onModelConnected && !modelOpen ? (
              <button type="button" onClick={openModel}>
                Connect a model
              </button>
            ) : (
              <Link href={settingsHref}>Open Settings</Link>
            )}
          </div>
        )}
        <div
          className={`hv-composer-box${composerDisabled ? " disabled" : ""}${dropping ? " dropping" : ""}`}
          onDragOver={(event) => {
            if (
              composerDisabled ||
              !onAttachmentsChange ||
              !event.dataTransfer.types.includes("Files")
            )
              return;
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDropping(false);
          }}
          onDrop={(event) => {
            if (!dropping) return;
            event.preventDefault();
            setDropping(false);
            void attach(
              [...event.dataTransfer.files].filter((file) =>
                file.type.startsWith("image/"),
              ),
            );
          }}
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
          <MessageImages
            sources={attachmentSources(attachments)}
            onRemove={(key) =>
              onAttachmentsChange?.((current) =>
                current.filter((image) => image.id !== key),
              )
            }
          />
          {attachError && (
            <p className="hv-attach-error" role="alert">
              {attachError}
            </p>
          )}
          <textarea
            ref={composerRef}
            disabled={composerDisabled}
            id="pi-composer"
            aria-label="Message Hallvi"
            onChange={(event) => onComposerChange(event.target.value)}
            onPaste={(event) => {
              const images = [...event.clipboardData.files].filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!images.length || !onAttachmentsChange) return;
              // A copied picture often carries its name as text as well.
              if (!event.clipboardData.getData("text/plain"))
                event.preventDefault();
              void attach(images);
            }}
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
                  ? "Write it now; connect a model to send it"
                  : application
                    ? "Ask Hallvi, correct a decision, or add context…"
                    : "Add an application to start chatting"
            }
            rows={2}
            value={composer}
          />
          <div className="hv-composer-bar">
            <span className="hv-composer-left">
              {onAttachmentsChange && (
                <>
                  <button
                    className="hv-attach"
                    type="button"
                    disabled={
                      composerDisabled || attachments.length >= MAX_IMAGES
                    }
                    aria-label="Attach images"
                    title="Attach images — or paste or drop them here"
                    onClick={() => imageInput.current?.click()}
                  >
                    <Paperclip weight="bold" aria-hidden="true" />
                  </button>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      void attach([...(event.target.files ?? [])]);
                      event.target.value = "";
                    }}
                  />
                </>
              )}
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
            {inFlight && !readOnly && drafted && (
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
            {requestPending && !readOnly && !drafted ? (
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
                disabled={!drafted || sendDisabled || busy !== null}
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
