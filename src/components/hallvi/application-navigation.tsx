"use client";

import {
  Archive,
  CaretDown,
  CaretRight,
  ChatCircle,
  GearSix,
  Plus,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  applicationSections,
  type ApplicationSection,
  type ApplicationSectionDefinition,
} from "./application-sections";
import type { ChatSummary } from "@/server/types";

import { HostName } from "./host-name";
import { ThisHallvi } from "./hallvi-version";

/**
 * What else this application could run, one click away at the bottom of the
 * destinations: the hidden stack destinations as muted rows, each saying why
 * it is hidden. Hiding keeps a simple application clean; revealing shows
 * what Hallvi could take on.
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
        className="hv-nav-reveal hv-nav-group-start"
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
            className={`hv-nav-unused ${section === item.id ? "selected" : ""}`}
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

/**
 * History and command output, behind one heading.
 *
 * They were rows beside Backups and Domains, which made them read as two more
 * parts of the application needing attention. They are neither: they are the
 * record of what has been done to it. Closed by default, and open whenever
 * the page you are on is inside — a link into History has to show you where
 * you have landed, and a group that hid its own active child would be worse
 * than the rows it replaced.
 *
 * The rows inside are the same size and the same target as the ones above.
 * Making a destination smaller is not making it secondary; it is making it
 * harder to hit.
 */
function Activity({
  sections,
  section,
  onSection,
}: {
  sections: readonly ApplicationSectionDefinition[];
  section: ApplicationSection | null;
  onSection: (section: ApplicationSection) => void;
}) {
  const inside = sections.some((item) => item.id === section);
  const [open, setOpen] = useState(inside);
  const [wasInside, setWasInside] = useState(inside);
  // Landing on a child opens the group it lives in. Adjusting during render
  // rather than in an effect, so the group is never briefly shut around the
  // page the reader just asked for.
  if (inside !== wasInside) {
    setWasInside(inside);
    if (inside) setOpen(true);
  }
  if (!sections.length) return null;
  return (
    <>
      <button
        type="button"
        className={`hv-nav-activity hv-nav-group-start ${
          inside && !open ? "selected" : ""
        }`}
        aria-expanded={open}
        aria-current={inside && !open ? "page" : undefined}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <CaretDown aria-hidden="true" />
        ) : (
          <CaretRight aria-hidden="true" />
        )}
        <span>Activity</span>
      </button>
      {open &&
        sections.map((item) => (
          <button
            key={item.id}
            className={`hv-nav-inside ${section === item.id ? "selected" : ""}`}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => onSection(item.id)}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
    </>
  );
}

export function ApplicationNavigation({
  chats,
  selectedChatId,
  settingsHref = "/setup/connections",
  section,
  busy,
  onSection,
  onChat,
  onCreate,
  onArchive,
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
  settingsHref?: string;
  section: ApplicationSection | null;
  busy: boolean;
  onSection: (section: ApplicationSection) => void;
  onChat: (id: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
}) {
  const primary = sections.filter((item) => item.group !== "activity");
  const activity = sections.filter((item) => item.group === "activity");
  return (
    <aside
      className="hv-application-navigation"
      aria-label="Application navigation"
    >
      {head ? (
        <div className="hv-navigation-head">
          <Link href="/applications" className="hv-navigation-home">
            Hallvi <HostName className="hv-navigation-host" />
          </Link>
          {head}
        </div>
      ) : (
        <Link href="/applications" className="hv-navigation-brand">
          <span>sg</span>Hallvi
        </Link>
      )}
      <nav aria-label="Application workspace">
        <div className="hv-destinations">
          {primary.map((item, index) => {
            const groupStart =
              index > 0 && item.group !== primary[index - 1].group;
            const row = (
              <button
                key={item.id}
                className={`${section === item.id ? "selected" : ""} ${groupStart ? "hv-nav-group-start" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => onSection(item.id)}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
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
          <Activity
            sections={activity}
            section={section}
            onSection={onSection}
          />
        </div>
        <div className="hv-conversations-heading">
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
          <div className="hv-chat-nav-row" key={chat.id}>
            <button
              disabled={busy}
              className={
                !section && chat.id === selectedChatId ? "selected" : ""
              }
              aria-current={
                !section && chat.id === selectedChatId ? "page" : undefined
              }
              onClick={() => onChat(chat.id)}
            >
              <ChatCircle aria-hidden="true" />
              <span>
                {chat.title}
                {chat.archivedAt && <small>Archived</small>}
              </span>
            </button>
            {chat.id !== chats[0]?.id && !chat.archivedAt && (
              <button
                type="button"
                className="hv-chat-archive"
                aria-label={`Archive ${chat.title}`}
                title={`Archive ${chat.title}`}
                disabled={busy}
                onClick={() => onArchive(chat.id)}
              >
                <Archive aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </nav>
      <div className="hv-navigation-foot">
        <Link className="hv-navigation-settings" href={settingsHref}>
          <GearSix /> Settings
        </Link>
        <ThisHallvi />
      </div>
    </aside>
  );
}
