"use client";

import { Plus } from "@phosphor-icons/react";

import { PHASES } from "@/server/phase-one-spec";
import type { Chat, GateCheck } from "@/server/types";

const GROUPS = [
  { key: "plan", label: "Plan" },
  { key: "setup", label: "Setup · not live yet" },
  { key: "live", label: "Live" },
] as const;

/**
 * The nine launch phases as a vertical stepper. The current phase carries its
 * check progress and the chats that belong to it; later phases are only
 * named, with their deliverable available on hover.
 */
export function LaunchSidebar({
  checks,
  chats,
  selectedChatId,
  hasApplication,
  busy,
  onSelectChat,
  onCreateChat,
}: {
  checks: GateCheck[];
  chats: Chat[];
  selectedChatId: string | null;
  hasApplication: boolean;
  busy: boolean;
  onSelectChat: (chatId: string) => void;
  onCreateChat: () => void;
}) {
  const passed = checks.filter((check) => check.status === "passed").length;

  return (
    <aside className="sg-sidebar" aria-label="Application launch progress">
      {GROUPS.map((group) => (
        <section className="sg-phase-group" key={group.key}>
          <h2>{group.label}</h2>
          <ol>
            {PHASES.filter((phase) => phase.group === group.key).map((phase) =>
              phase.number === 1 ? (
                <li
                  className="sg-phase active"
                  aria-current="step"
                  key={phase.number}
                >
                  <span className="sg-phase-number">{phase.number}</span>
                  <span className="sg-phase-name">{phase.name}</span>
                  <span className="sg-phase-meta">
                    <span
                      className="sg-phase-dots"
                      role="img"
                      aria-label={`${passed} of ${checks.length} checks complete`}
                    >
                      {checks.map((check) => (
                        <i className={check.status} key={check.key} />
                      ))}
                    </span>
                    {phase.deliverable}
                  </span>
                  <div className="sg-chats">
                    <div className="sg-chats-head">
                      <span>Chats</span>
                      <button
                        aria-label="Start a new phase chat"
                        className="sg-icon-button"
                        disabled={!hasApplication || busy}
                        onClick={onCreateChat}
                        title="New chat in this phase"
                        type="button"
                      >
                        <Plus weight="bold" />
                      </button>
                    </div>
                    {chats.length ? (
                      chats.map((chat) => (
                        <button
                          className={`sg-session ${chat.id === selectedChatId ? "selected" : ""}`}
                          disabled={busy}
                          key={chat.id}
                          onClick={() => onSelectChat(chat.id)}
                          type="button"
                        >
                          <span className="sg-session-mark">Pi</span>
                          <span>
                            <strong>{chat.title}</strong>
                            <span className="sg-session-meta">
                              <small>
                                {chat.isPrimary
                                  ? "Main phase chat"
                                  : "Separate transcript"}
                              </small>
                              {chat.archivedAt && <em>Archived</em>}
                            </span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="sg-session muted">
                        <span className="sg-session-mark">Pi</span>
                        <span>
                          <strong>Launch Brief</strong>
                          <small>Starts with the application</small>
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              ) : (
                <li
                  className="sg-phase"
                  key={phase.number}
                  title={`Deliverable: ${phase.deliverable}`}
                >
                  <span className="sg-phase-number">{phase.number}</span>
                  <span className="sg-phase-name">{phase.name}</span>
                </li>
              ),
            )}
          </ol>
        </section>
      ))}
    </aside>
  );
}
