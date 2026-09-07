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
import type { Chat, ChatMessage, OperatorView, PiRun } from "@/server/types";

import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";
import type { RecordReference, RecordSection } from "./record-references";

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
  /** Opens that record section beside the chat. */
  onReveal?: (section: RecordSection) => void;
}) {
  const application = view.application;
  const workspace = view.workspace;
  const archived = Boolean(activeChat?.archivedAt);
  const completed = workspace?.status === "completed";
  const paused = Boolean(workspace && !workspace.current && !completed);
  const readOnly = archived || completed || paused;
  const deliverable = workspace?.deliverable ?? "Launch Brief";
  // The phase's state lives in the current-step bar above; this header only
  // names the chat and says when it cannot accept new work.
  const canWrite = piReady && Boolean(application) && Boolean(activeChat);
  const composerDisabled = !canWrite || readOnly;
  const requestPending = view.messages.some(
    (message) => message.status === "queued" || message.status === "running",
  );

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <strong>{activeChat?.title ?? deliverable}</strong>
          <span>
            {archived
              ? "Archived · read-only"
              : completed
                ? `Phase ${workspace?.phaseNumber} is complete · read-only`
                : activeChat?.isPrimary === false
                  ? "Separate transcript · shares the phase's saved state"
                  : "Main phase chat"}
          </span>
        </div>
        {activeChat && !activeChat.isPrimary && !readOnly && (
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
      {(busy !== null || requestPending) && (
        <div className="sg-busy-bar" aria-hidden="true" />
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
                {references?.get(message.id)?.length ? (
                  <div className="sg-message-refs">
                    <span>Saved from this reply</span>
                    {references.get(message.id)!.map((reference) => (
                      <button
                        className={`sg-message-ref ${reference.tone}`}
                        key={reference.key}
                        onClick={() => onReveal?.(reference.section)}
                        title="Open in the Record"
                        type="button"
                      >
                        {reference.label} <em>{reference.status}</em>
                      </button>
                    ))}
                  </div>
                ) : null}
              </Message>
            );
          })}

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
        {paused && (
          <p role="status">
            This phase is paused while an earlier phase is reviewed.
          </p>
        )}
        {!archived && completed && (
          <p className="sg-archived-notice">
            Phase {workspace?.phaseNumber} is complete and its chats are
            read-only. Continue in the current phase.
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
                : completed
                  ? `Phase ${workspace?.phaseNumber} is complete · read-only`
                  : !piReady
                    ? "Connect ChatGPT in Settings to chat"
                    : application
                      ? "Ask Server Guy, correct a decision, or add context…"
                      : "Create the application workspace to start chatting"
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
