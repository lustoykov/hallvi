"use client";

import { Archive, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
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

import { formatTimestamp } from "./format";

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
  // The gate's state lives in the pane header (and the top bar), not as a
  // standing message in the transcript.
  const ready = Boolean(application) && view.workspace?.status === "ready";

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <span className={`sg-eyebrow${ready ? " ready" : ""}`}>
            {ready ? "Ready for review" : "Working toward"}
          </span>
          <strong>Launch Brief</strong>
        </div>
        {activeChat && !activeChat.isPrimary && !activeChat.archivedAt && (
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
                  <time dateTime={message.createdAt}>
                    {formatTimestamp(message.createdAt)}
                  </time>
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
                          <MessageResponse>{message.body}</MessageResponse>
                        ) : (
                          <details>
                            <summary>Show unfinished draft</summary>
                            <MessageResponse>{message.body}</MessageResponse>
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
                    <MessageResponse>{message.body}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            );
          })}

          {pendingMessage !== null && (
            <>
              <Message from="user">
                <div className="sg-message-heading">
                  <span className="sg-avatar user">You</span>
                  <strong>You</strong>
                  <span className="sg-source-tag">Pending</span>
                </div>
                <MessageContent>
                  <MessageResponse>{pendingMessage}</MessageResponse>
                </MessageContent>
              </Message>
              <p className="sg-reply-pending" role="status">
                <SpinnerGap className="spin" aria-hidden="true" /> Saving
                message…
              </p>
            </>
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
        {activeChat?.archivedAt && (
          <p className="sg-archived-notice">
            This chat is archived and read-only. Choose an active chat or start
            a new one.
          </p>
        )}
        <textarea
          disabled={
            !piReady ||
            !application ||
            !activeChat ||
            Boolean(activeChat.archivedAt)
          }
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
            activeChat?.archivedAt
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
        <div>
          <span>
            Saved decisions appear in the Record tab and are shared across this
            application’s chats.
          </span>
          <button
            disabled={
              !composer.trim() ||
              !piReady ||
              busy !== null ||
              !application ||
              !activeChat ||
              Boolean(activeChat.archivedAt)
            }
            type="submit"
          >
            {busy === "message" ? <SpinnerGap className="spin" /> : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
