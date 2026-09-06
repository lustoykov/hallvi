"use client";

import { Plus } from "@phosphor-icons/react";

import type { ChatSummary, PhaseWorkspaceView } from "@/server/types";

import { LocalTime } from "./local-time";

export function ChatList({
  chats,
  workspace,
  selectedChatId,
  hasApplication,
  busy,
  onSelect,
  onCreate,
}: {
  chats: ChatSummary[];
  /** The viewed phase; its chats are listed. */
  workspace: PhaseWorkspaceView | null;
  selectedChatId: string | null;
  hasApplication: boolean;
  busy: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
}) {
  const completed = workspace?.status === "completed";
  const canCreate = Boolean(workspace?.current) && !completed;
  return (
    <aside className="sg-chat-list" aria-label="Phase chats">
      <div className="sg-pane-title">
        <div>
          <strong>Chats</strong>
          <span>
            {workspace
              ? `Phase ${workspace.phaseNumber} · ${workspace.name}${completed ? " · completed" : ""}`
              : "Phase 1 · Start"}
          </span>
        </div>
        {canCreate && (
          <button
            aria-label="Start a new phase chat"
            className="sg-icon-button"
            disabled={!hasApplication || busy}
            onClick={onCreate}
            title="New chat in this phase"
            type="button"
          >
            <Plus weight="bold" />
          </button>
        )}
      </div>
      <div className="sg-session-list">
        {chats.length ? (
          chats.map((chat) => (
            <button
              className={`sg-session ${chat.id === selectedChatId ? "selected" : ""}`}
              disabled={busy}
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              type="button"
            >
              <span className="sg-session-mark">SG</span>
              <span>
                <strong>{chat.title}</strong>
                <span className="sg-session-meta">
                  <small>
                    {chat.isPrimary ? "Main phase chat" : "Separate transcript"}
                  </small>
                  {chat.archivedAt ? (
                    <em>Archived</em>
                  ) : completed ? (
                    <em>Read-only</em>
                  ) : null}
                  <LocalTime value={chat.lastActivityAt} variant="compact" />
                </span>
              </span>
            </button>
          ))
        ) : (
          <div className="sg-session muted">
            <span className="sg-session-mark">SG</span>
            <span>
              <strong>Launch Brief</strong>
              <span className="sg-session-meta">
                <small>Starts with the application</small>
              </span>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
