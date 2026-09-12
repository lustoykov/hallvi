"use client";

import {
  Archive,
  ArrowClockwise,
  PaperPlaneRight,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

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
import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";
import { InformationCard } from "./information-card";
import { OperatorConsole } from "./operator-console";
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
  cancelled: "Cancelled",
  "timed-out": "Timed out",
  interrupted: "Interrupted",
};

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
          message.source === "server-guy" &&
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
  const canWrite = piReady && Boolean(application) && Boolean(activeChat);
  const composerDisabled = !canWrite || readOnly;
  const requestPending = view.messages.some(
    (message) => message.status === "queued" || message.status === "running",
  );

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
      {(busy !== null || requestPending) && (
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
            const historyUnavailable =
              run?.status === "failed" &&
              run.error?.startsWith("Conversation history unavailable.");
            // A request Server Guy started itself is never shown as the
            // engineer's words.
            const engineer =
              message.role === "user" && message.source === "user";
            return (
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
                key={message.id}
              >
                <div className="sg-message-heading">
                  <span
                    className={`sg-avatar ${engineer ? "user" : ""}`}
                    aria-hidden="true"
                  >
                    {engineer ? "You" : "SG"}
                  </span>
                  <strong>{engineer ? "You" : "Server Guy"}</strong>
                  {message.source === "server-guy" && (
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
                      {message.body && inProgress && (
                        <MessageResponse>
                          <Markdown source={message.body} />
                        </MessageResponse>
                      )}
                      <p className="sg-run-status" role="status">
                        {inProgress && (
                          <SpinnerGap className="spin" aria-hidden="true" />
                        )}
                        {message.status === "queued"
                          ? "Waiting to reply…"
                          : message.status === "running"
                            ? "Replying…"
                            : run?.error?.startsWith(
                                  "Conversation history unavailable.",
                                )
                              ? run.error
                              : message.status === "cancelled"
                                ? "Reply cancelled."
                                : "Something went wrong. Please retry."}
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
                          className={`sg-run-action ${inProgress ? "sg-secondary-button" : "sg-primary-button"}`}
                          disabled={busy !== null}
                          onClick={() => {
                            if (historyUnavailable) onNewChat();
                            else
                              onRunAction(
                                run.id,
                                inProgress ? "cancel" : "retry",
                              );
                          }}
                          type="button"
                        >
                          {inProgress ? (
                            <X aria-hidden="true" weight="bold" />
                          ) : (
                            <ArrowClockwise aria-hidden="true" weight="bold" />
                          )}
                          {inProgress
                            ? "Cancel request"
                            : historyUnavailable
                              ? "Start a new chat"
                              : "Retry reply"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <MessageResponse>
                      <Markdown source={message.body} />
                    </MessageResponse>
                  )}
                </MessageContent>
                {message.blocks?.map((block, index) => {
                  if (block.type === "text")
                    return <Markdown key={index} source={block.text} />;
                  if (block.type === "execution" && view.application && chatId)
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
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

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
        {application && !piReady && (
          <div className="sg-pi-required">
            <WarningCircle weight="bold" />
            <div>
              <strong>Connect ChatGPT to chat</strong>
              <p>Your applications and chat history are still available.</p>
            </div>
            <Link href="/setup/pi">Open Settings</Link>
          </div>
        )}
        <div
          className={`sg-composer-box${composerDisabled ? " disabled" : ""}`}
        >
          <textarea
            disabled={composerDisabled}
            id="pi-composer"
            aria-label="Message Server Guy"
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!busy) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              archived
                ? "This chat is archived"
                : !piReady
                  ? "Connect ChatGPT in Settings to chat"
                  : application
                    ? "Ask Server Guy, correct a decision, or add context…"
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
              disabled={!composer.trim() || composerDisabled || busy !== null}
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
