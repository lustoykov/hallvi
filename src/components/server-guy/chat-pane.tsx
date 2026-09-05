"use client";

import { Archive, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type {
  Chat,
  PhaseOneOperatorView,
} from "@/server/types";

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
}) {
  const application = view.application;
  // The gate's state lives in the pane header (and the top bar), not as a standing message in the transcript.
  const ready = Boolean(application) && view.workspace?.status === "ready";

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <span className={`sg-eyebrow${ready ? " ready" : ""}`}>{ready ? "Ready for review" : "Working toward"}</span>
          <strong>Launch Brief</strong>
        </div>
        {activeChat && !activeChat.isPrimary && !activeChat.archivedAt && (
          <button className="sg-text-button" disabled={busy !== null} onClick={onArchive} type="button">
            <Archive /> Archive chat
          </button>
        )}
      </header>

      <Conversation className="sg-conversation">
        <ConversationContent className="sg-messages">
          {view.messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <div className="sg-message-heading">
                <span className={`sg-avatar ${message.role === "user" ? "user" : ""}`}>
                  {message.role === "user" ? "You" : "Pi"}
                </span>
                <strong>{message.role === "user" ? "You" : "Pi"}</strong>
                {message.source === "server-guy" && <span className="sg-source-tag">Recorded event</span>}
                <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
              </div>
              <MessageContent>
                <MessageResponse>{message.body}</MessageResponse>
              </MessageContent>
            </Message>
          ))}

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
                <SpinnerGap className="spin" aria-hidden="true" /> Waiting for Pi…
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
          {error && application && <div className="sg-error" role="alert">{error}</div>}
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
        {activeChat?.archivedAt && <p className="sg-archived-notice">This chat is archived and read-only. Choose an active chat or start a new one.</p>}
        <textarea
          disabled={!piReady || !application || !activeChat || Boolean(activeChat.archivedAt)}
          id="pi-composer"
          aria-label="Message Pi"
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
          <span>Saved decisions appear in the Record tab and are shared across this application’s chats.</span>
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
