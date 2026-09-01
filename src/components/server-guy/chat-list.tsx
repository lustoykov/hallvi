"use client";

import { Plus } from "@phosphor-icons/react";

import type { OperatorSession } from "@/server/types";

export function ChatList({
  sessions,
  activeSessionId,
  hasApplication,
  busy,
  onSelect,
  onCreate,
}: {
  sessions: OperatorSession[];
  activeSessionId: string | null;
  hasApplication: boolean;
  busy: boolean;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="sg-chat-list">
      <div className="sg-pane-title sg-chat-list-title">
        <div>
          <span className="sg-eyebrow">Phase 1 chats</span>
          <strong>Start</strong>
        </div>
        <button
          aria-label="Start a new phase chat"
          className="sg-icon-button primary"
          disabled={!hasApplication || busy}
          onClick={onCreate}
          type="button"
        >
          <Plus weight="bold" />
        </button>
      </div>
      <div className="sg-session-list">
        {sessions.length ? (
          sessions.map((session) => (
            <button
              className={`sg-session ${session.id === activeSessionId ? "selected" : ""}`}
              disabled={busy}
              key={session.id}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <span className="sg-session-mark">Pi</span>
              <span>
                <strong>{session.title}</strong>
                <small>{session.isPrimary ? "Main phase chat" : "Separate transcript"}</small>
                <em>{session.status === "active" ? "Active" : "Archived"}</em>
              </span>
            </button>
          ))
        ) : (
          <div className="sg-session selected muted">
            <span className="sg-session-mark">Pi</span>
            <span>
              <strong>Launch Brief</strong>
              <small>Starts with the application</small>
              <em>Not started</em>
            </span>
          </div>
        )}
      </div>
      <div className="sg-chat-list-footer">
        <button disabled={!hasApplication || busy} onClick={onCreate} type="button">
          <Plus /> New phase chat
        </button>
        <p>Chats share this phase’s Record. Their transcripts stay separate.</p>
      </div>
    </aside>
  );
}
