"use client";

import {
  CaretDown,
  CaretRight,
  ChatCircle,
  GearSix,
  Plus,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  applicationSections,
  type ApplicationSection,
  type ApplicationSectionDefinition,
} from "./application-sections";
import type { ChatSummary } from "@/server/types";

/**
 * A quiet mark beside a destination: work in progress there, something
 * waiting for the user, a failure, or a confirmed change not looked at yet.
 */
export interface NavigationIndicator {
  tone: "working" | "needs-you" | "failed" | "updated";
  label: string;
  /**
   * The destination this operation is mainly about. One change often
   * touches five destinations; only the primary one animates, so a busy
   * application does not flash five marks at once.
   */
  primary?: boolean;
}

/**
 * The mark itself is decorative; its reason is the row's accessible
 * description, so the row keeps its plain name and a screen reader hears
 * the reason after it.
 */
function Mark({
  id,
  indicator,
}: {
  id: string;
  indicator: NavigationIndicator;
}) {
  return (
    <>
      <i
        className={`sg-nav-indicator ${indicator.tone}${indicator.primary ? " primary" : ""}`}
        title={indicator.label}
        aria-hidden="true"
      />
      <span id={id} className="sg-visually-hidden" aria-hidden="true">
        {indicator.label}
      </span>
    </>
  );
}

/**
 * What else this application could run, one click away at the bottom of the
 * destinations: the hidden stack destinations as muted rows, each saying why
 * it is hidden. Hiding keeps a simple application clean; revealing shows
 * what Server Guy could take on.
 */
function Reveal({
  hidden,
  revealed,
  section,
  onReveal,
  onSection,
}: {
  hidden: readonly (ApplicationSectionDefinition & { note: string })[];
  revealed: boolean;
  section: ApplicationSection | null;
  onReveal?: (revealed: boolean) => void;
  onSection: (section: ApplicationSection) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="sg-nav-reveal sg-nav-group-start"
        aria-expanded={revealed}
        onClick={() => onReveal?.(!revealed)}
      >
        {revealed ? (
          <CaretDown aria-hidden="true" />
        ) : (
          <CaretRight aria-hidden="true" />
        )}
        <span>{revealed ? "Show less" : "Show more"}</span>
      </button>
      {revealed &&
        hidden.map((item) => (
          <button
            key={item.id}
            className={`sg-nav-unused ${section === item.id ? "selected" : ""}`}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => onSection(item.id)}
          >
            <item.icon aria-hidden="true" />
            <span>
              {item.label}
              <small>{item.note}</small>
            </span>
          </button>
        ))}
    </>
  );
}

export function ApplicationNavigation({
  chats,
  selectedChatId,
  section,
  busy,
  onSection,
  onChat,
  onCreate,
  indicators,
  chatMarks,
  sections = applicationSections,
  hidden = [],
  revealed = false,
  onReveal,
  head,
}: {
  /** The application identity, when it sits here rather than in the top bar. */
  head?: ReactNode;
  /** The destinations to list; defaults to every one. */
  sections?: readonly ApplicationSectionDefinition[];
  /**
   * Stack destinations this application does not show, each with the reason.
   * A quiet row at the end of the stack group reveals them.
   */
  hidden?: readonly (ApplicationSectionDefinition & { note: string })[];
  revealed?: boolean;
  onReveal?: (revealed: boolean) => void;
  chats: ChatSummary[];
  selectedChatId: string | null;
  section: ApplicationSection | null;
  busy: boolean;
  onSection: (section: ApplicationSection) => void;
  onChat: (id: string) => void;
  onCreate: () => void;
  indicators?: Partial<Record<ApplicationSection, NavigationIndicator>>;
  chatMarks?: Record<string, NavigationIndicator>;
}) {
  return (
    <aside
      className="sg-application-navigation"
      aria-label="Application navigation"
    >
      {head ? (
        <div className="sg-navigation-head">
          <Link href="/applications" className="sg-navigation-home">
            Server Guy
          </Link>
          {head}
        </div>
      ) : (
        <Link href="/applications" className="sg-navigation-brand">
          <span>sg</span>Server Guy
        </Link>
      )}
      <nav aria-label="Application workspace">
        <div className="sg-destinations">
          {sections.map((item, index) => {
            const indicator = indicators?.[item.id];
            const markId = `sg-mark-${item.id}`;
            const groupStart =
              index > 0 && item.group !== sections[index - 1].group;
            const row = (
              <button
                key={item.id}
                className={`${section === item.id ? "selected" : ""} ${groupStart ? "sg-nav-group-start" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                aria-describedby={indicator ? markId : undefined}
                onClick={() => onSection(item.id)}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
                {indicator && <Mark id={markId} indicator={indicator} />}
              </button>
            );
            return row;
          })}
          {hidden.length > 0 && (
            <Reveal
              hidden={hidden}
              revealed={revealed}
              section={section}
              onReveal={onReveal}
              onSection={onSection}
            />
          )}
        </div>
        <div className="sg-conversations-heading">
          <span>Conversations</span>
          <button
            disabled={busy}
            onClick={onCreate}
            aria-label="New conversation"
          >
            <Plus />
          </button>
        </div>
        {chats.map((chat) => (
          <button
            key={chat.id}
            disabled={busy}
            className={!section && chat.id === selectedChatId ? "selected" : ""}
            aria-current={
              !section && chat.id === selectedChatId ? "page" : undefined
            }
            aria-describedby={
              chatMarks?.[chat.id] ? `sg-mark-chat-${chat.id}` : undefined
            }
            onClick={() => onChat(chat.id)}
          >
            <ChatCircle />
            <span>
              {chat.title}
              {chat.archivedAt && <small>Archived</small>}
            </span>
            {chatMarks?.[chat.id] && (
              <Mark
                id={`sg-mark-chat-${chat.id}`}
                indicator={chatMarks[chat.id]}
              />
            )}
          </button>
        ))}
      </nav>
      <Link className="sg-navigation-settings" href="/setup/pi">
        <GearSix /> Settings
      </Link>
    </aside>
  );
}
