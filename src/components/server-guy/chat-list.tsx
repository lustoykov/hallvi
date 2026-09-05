"use client";

import { Plus } from "@phosphor-icons/react";

import { PHASE_ONE } from "@/server/phase-one-spec";
import type { Chat } from "@/server/types";

export function ChatList({
  chats,
  selectedChatId,
  hasApplication,
  busy,
  onSelect,
  onCreate,
}: {
  chats: Chat[];
  selectedChatId: string | null;
  hasApplication: boolean;
  busy: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="sg-chat-list" aria-label="Phase chats">
      <div className="sg-pane-title">
        <div>
          <strong>Chats</strong>
          <span>
            Phase {PHASE_ONE.number} · {PHASE_ONE.name}
          </span>
        </div>
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
                  {chat.archivedAt && <em>Archived</em>}
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
