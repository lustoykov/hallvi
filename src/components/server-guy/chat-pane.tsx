"use client";

import {
  Archive,
  PaperPlaneRight,
  SpinnerGap,
  WarningCircle,
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
import type { Chat, PhaseOneOperatorView, PiRun } from "@/server/types";

import { LocalTime } from "./local-time";
import { Markdown } from "./markdown";

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
}: {
  view: PhaseOneOperatorView;
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
}) {
  const application = view.application;
  const archived = Boolean(activeChat?.archivedAt);
  // The gate's state lives in the pane header (and the top bar), not as a
  // standing message in the transcript.
  const ready = Boolean(application) && view.workspace?.status === "ready";
  const passed = view.checks.filter(
    (check) => check.status === "passed",
  ).length;
  const canWrite = piReady && Boolean(application) && Boolean(activeChat);
  const composerDisabled = !canWrite || archived;
  const requestPending = view.messages.some(
    (message) => message.status === "queued" || message.status === "running",
  );

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <strong>{activeChat?.title ?? "Launch Brief"}</strong>
          <span className={ready ? "ready" : undefined}>
            {archived
              ? "Archived · read-only"
              : ready
                ? "Ready for review"
                : `Working toward the Launch Brief · ${passed} of ${view.checks.length} checks`}
          </span>
        </div>
        {activeChat && !activeChat.isPrimary && !archived && (
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
            <p className="sg-reply-pending" role="status">
              Reconnecting… Accepted messages keep running. This view will catch
              up automatically.
            </p>
          )}
          {view.messages.map((message) => {
            const run = runs.find(
              (run) => run.assistantMessageId === message.id,
            );
            const provisional = message.status !== "completed";
            const inProgress =
              message.status === "queued" || message.status === "running";
            return (
              <Message from={message.role} key={message.id}>
                <div className="sg-message-heading">
                  <span
                    className={`sg-avatar ${message.role === "user" ? "user" : ""}`}
                    aria-hidden="true"
                  >
                    {message.role === "user" ? "You" : "Pi"}
                  </span>
                  <strong>{message.role === "user" ? "You" : "Pi"}</strong>
                  {message.source === "server-guy" && (
                    <span className="sg-source-tag">Recorded event</span>
                  )}
                  {provisional && (
                    <span className="sg-source-tag">
                      {message.status === "running"
                        ? "Draft · not saved as an answer"
                        : message.status === "queued"
                          ? "Queued"
                          : "Unsuccessful attempt"}
                    </span>
                  )}
                  <LocalTime value={message.createdAt} variant="compact" />
                </div>
                <MessageContent>
                  {provisional ? (
                    <div className="sg-run-progress">
                      <p role="status">
                        {message.status === "queued"
                          ? "Message saved. Waiting for the worker…"
                          : message.status === "running"
                            ? "Pi is replying… Decisions are saved only when it finishes."
                            : (run?.error ??
                              "This attempt did not finish. No Decisions were saved.")}
                      </p>
                      {message.body &&
                        (inProgress ? (
                          <MessageResponse>
                            <Markdown source={message.body} />
                          </MessageResponse>
                        ) : (
                          <details>
                            <summary>Show unfinished draft</summary>
                            <MessageResponse>
                              <Markdown source={message.body} />
                            </MessageResponse>
                          </details>
                        ))}
                      {run &&
                        !activeChat?.archivedAt &&
                        !runs.some(
                          (attempt) => attempt.retryOfId === run.id,
                        ) && (
                          <button
                            type="button"
                            className="sg-text-button"
                            disabled={busy !== null}
                            onClick={() =>
                              onRunAction(
                                run.id,
                                inProgress ? "cancel" : "retry",
                              )
                            }
                          >
                            {inProgress ? "Cancel request" : "Retry reply"}
                          </button>
                        )}
                    </div>
                  ) : (
                    <MessageResponse>
                      <Markdown source={message.body} />
                    </MessageResponse>
                  )}
                </MessageContent>
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
            aria-label="Message Pi"
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
                    ? "Ask Pi, correct a decision, or add context…"
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
