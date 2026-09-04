"use client";

import { Archive, Check, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
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
  piReady: boolean;
  composer: string;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onArchive: () => void;
}) {
  const application = view.application;

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <span className="sg-eyebrow">Working toward</span>
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

          {application && view.workspace?.status === "ready" && (
            <div className="sg-ready-card">
              <span className="sg-ready-icon"><Check weight="bold" /></span>
              <div>
                <strong>Launch Brief ready</strong>
                <p>All four checks pass. Phase 2 is intentionally not implemented in this pull request.</p>
              </div>
            </div>
          )}
          {application && !piReady && (
            <div className="sg-pi-required">
              <WarningCircle weight="bold" />
              <div>
                <strong>Connect Pi before chatting</strong>
                <p>The application workspace still works, but model turns are disabled.</p>
              </div>
              <Link href="/setup/pi">Open Pi setup</Link>
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
        <textarea
          disabled={!piReady || !application || !activeChat || Boolean(activeChat.archivedAt)}
          id="pi-composer"
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!busy) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={
            !piReady
              ? "Connect Pi to ChatGPT before chatting"
              : application
                ? "Ask Pi, correct a decision, or add context…"
                : "Create the application workspace to start chatting"
          }
          rows={2}
          value={composer}
        />
        <div>
          <span>Recognized Decisions are saved for the application and shown in the shared Operator View.</span>
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
