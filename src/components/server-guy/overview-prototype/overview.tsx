"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Overview in the Journeys language. Server Guy's report leads and says what
// needs you — only ever what is real. Under it, the few vital signs people
// check, each opening its details, the map in miniature, and recent work.
// Ideas that would make it sturdier are optional; the three variants differ
// only in how they are offered.

import {
  ArrowRight,
  ArrowSquareOut,
  CaretDown,
  ChartLineUp,
  ChatCircleText,
  Check,
  CloudArrowUp,
  HardDrives,
  Hourglass,
  Lightbulb,
  MinusCircle,
  ShieldCheck,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationOperation, OperationState } from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { labelOf, stateLabel } from "../operation-model";
import type { PageContext } from "../architecture-prototype";
import type {
  ArchitectureModel,
  LiveRecord,
} from "../architecture-prototype/model";
import { ARCHITECTURE_FOCUS } from "../architecture-prototype/journey-v2";
import { ServerGuyReport } from "../architecture-prototype/report";
import type { Recheck } from "../architecture-prototype/use-recheck";
import { MiniMap } from "./mini-map";
import {
  buildOverview,
  type Idea,
  type NeedItem,
  type Vital,
} from "./overview-model";
import "./overview.css";

export type OverviewVariant = "quiet" | "suggests" | "lanes";

const counts = ["No", "One", "Two", "Three", "Four"];

const vitalIcon: Record<Vital["id"], ReactNode> = {
  checks: <ChartLineUp weight="duotone" />,
  backups: <CloudArrowUp weight="duotone" />,
  server: <HardDrives weight="duotone" />,
  access: <ShieldCheck weight="bold" />,
};

/** How long until the next copy, counted down while you watch. */
function Countdown({ to, offset }: { to: string; offset: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = Date.parse(to) - (Date.now() + offset);
  if (left <= 0) return <b>due now</b>;
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <b>{hours > 0 ? `${hours} h ${minutes} m` : `${minutes} m ${seconds} s`}</b>
  );
}

function NeedCard({
  need,
  onAsk,
  onOpenDestination,
  onHover,
  onShow,
}: {
  need: NeedItem;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  /** Lights the part it is about on the map. */
  onHover: (partId: string | null) => void;
  /** Opens Architecture with that part's details open. */
  onShow: (partId: string) => void;
}) {
  return (
    <div
      className="axo-need"
      data-tone={need.tone}
      onPointerEnter={() => need.partId && onHover(need.partId)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => need.partId && onHover(need.partId)}
      onBlur={() => onHover(null)}
    >
      <span className="axo-need-icon" aria-hidden="true">
        {need.tone === "failed" ? (
          <Warning weight="bold" />
        ) : (
          <Hourglass weight="bold" />
        )}
      </span>
      <div>
        <b>{need.title}</b>
        <p>
          {need.detail}
          {need.invented && <span className="ax-invented">invented</span>}
        </p>
      </div>
      <div className="axo-need-actions">
        {need.partId ? (
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onShow(need.partId!)}
          >
            Show on the map
            <ArrowRight weight="bold" />
          </button>
        ) : (
          need.secondary && (
            <button
              type="button"
              className="ax-textlink"
              onClick={() => onOpenDestination(need.secondary!.destination)}
            >
              {need.secondary.label}
              <ArrowRight weight="bold" />
            </button>
          )
        )}
        <button
          type="button"
          className="ax-button"
          onClick={() =>
            need.primary.open
              ? need.primary.open()
              : need.primary.draft && onAsk(need.primary.draft)
          }
        >
          {need.primary.label}
        </button>
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  onAsk,
  onOpenDestination,
}: {
  idea: Idea;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  return (
    <div className="axo-idea">
      <b>
        <Lightbulb weight="duotone" />
        {idea.title}
      </b>
      <p>{idea.detail}</p>
      <div className="axo-idea-actions">
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onAsk(idea.draft)}
        >
          <ChatCircleText weight="bold" />
          Ask Server Guy
        </button>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onOpenDestination(idea.destination)}
        >
          Open {labelOf(idea.destination)}
          <ArrowRight weight="bold" />
        </button>
      </div>
    </div>
  );
}

function OpChip({ state }: { state: OperationState }) {
  const look: Record<OperationState, { tone: string; icon: ReactNode }> = {
    verified: { tone: "verified", icon: <Check weight="bold" /> },
    inspected: { tone: "verified", icon: <Check weight="bold" /> },
    failed: { tone: "failed", icon: <Warning weight="bold" /> },
    proposed: { tone: "stale", icon: <Hourglass weight="bold" /> },
    queued: { tone: "checking", icon: <Hourglass weight="bold" /> },
    working: {
      tone: "checking",
      icon: <SpinnerGap weight="bold" className="ax-spin" />,
    },
    cancelled: { tone: "absent", icon: <MinusCircle weight="bold" /> },
  };
  const item = look[state];
  return (
    <span className="ax-tag" data-c={item.tone}>
      <span className="ax-tag-icon" aria-hidden="true">
        {item.icon}
      </span>
      {stateLabel[state]}
    </span>
  );
}

function VitalCard({
  vital,
  index,
  open,
  offset,
  end,
  onToggle,
  onOpenDestination,
  onAsk,
}: {
  vital: Vital;
  index: number;
  open: boolean;
  offset: number;
  end: boolean;
  onToggle: () => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  return (
    <div className="axo-vital-wrap">
      <button
        type="button"
        className={`axo-vital${open ? " is-open" : ""}`}
        style={{ ["--i" as string]: index }}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="axo-vital-label">
          {vitalIcon[vital.id]}
          {vital.label}
        </span>
        <span className="axo-vital-value">{vital.value}</span>
        <span className="axo-vital-status" data-c={vital.status.certainty}>
          <i aria-hidden="true" />
          {vital.status.text}
        </span>
        <span className="axo-vital-lines">
          {vital.countdownTo && (
            <span>
              Next copy in <Countdown to={vital.countdownTo} offset={offset} />
            </span>
          )}
          {vital.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </button>
      {open && (
        <div className={`axo-pop${end ? " is-end" : ""}`}>
          <div className="axj2-pop" role="dialog" aria-label={vital.label}>
            <header>
              <span className="axj2-icon" aria-hidden="true">
                {vitalIcon[vital.id]}
              </span>
              <div>
                <b>{vital.label}</b>
                <small>{vital.status.text}</small>
              </div>
              <button type="button" onClick={onToggle} aria-label="Close">
                <X weight="bold" />
              </button>
            </header>
            <p className="axj2-pop-plain">{vital.plain}</p>
            {vital.facts.length > 0 && (
              <dl>
                {vital.facts.map((fact) => (
                  <div key={`${fact.label}:${fact.value}`}>
                    <dt>{fact.label}</dt>
                    <dd className={fact.mono ? "ax-mono" : undefined}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <footer>
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpenDestination(vital.destination)}
              >
                Open {labelOf(vital.destination)}
                <ArrowRight weight="bold" />
              </button>
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onAsk(vital.ask)}
              >
                <ChatCircleText weight="bold" />
                Ask in the conversation
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export function OverviewDirection({
  variant,
  model,
  record,
  recheck,
  page,
  operations,
  chats,
  reduced,
  onOpenConversation,
  onOpenDestination,
  onAsk,
}: {
  variant: OverviewVariant;
  model: ArchitectureModel;
  record: LiveRecord;
  recheck: Recheck;
  page: PageContext;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  reduced: boolean;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const overview = useMemo(
    () => buildOverview({ model, record, operations, chats, onOpenConversation }),
    [model, record, operations, chats, onOpenConversation],
  );
  const [openVital, setOpenVital] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  // "Not now" quiets suggestions for the rest of the visit.
  const [snoozed, setSnoozed] = useState(false);
  const [snoozeNote, setSnoozeNote] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const planned = model.status !== "live";
  const offset = model.now - Date.now();

  useEffect(() => {
    if (!openVital) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".axo-vital-wrap"))
        setOpenVital(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenVital(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [openVital]);

  const suggestion = overview.ideas[0];
  const showSuggestion =
    variant === "suggests" &&
    !planned &&
    !snoozed &&
    overview.needs.length === 0 &&
    Boolean(suggestion);
  // Architecture opens with a part's details open when there is one in mind.
  const openArchitecture = (partId?: string) => {
    if (partId)
      try {
        window.sessionStorage.setItem(ARCHITECTURE_FOCUS, partId);
      } catch {}
    onOpenDestination("architecture");
  };
  const needsBlock = overview.needs.length > 0 && (
    <div className="axo-needs">
      {overview.needs.map((need) => (
        <NeedCard
          key={need.id}
          need={need}
          onAsk={onAsk}
          onOpenDestination={onOpenDestination}
          onHover={setPointed}
          onShow={openArchitecture}
        />
      ))}
    </div>
  );

  return (
    <section className="axo" aria-label="Overview">
      <header className="axj3-head">
        {page.chrome.bar && <div className="axj3-bar">{page.chrome.bar}</div>}
        <div className="axj3-title">
          <h1>Overview</h1>
          {page.openUrl && !planned && (
            <div className="axj3-open">
              {model.restricted && (
                <small>
                  <ShieldCheck weight="bold" /> Only from your network
                </small>
              )}
              <a href={page.openUrl} target="_blank" rel="noreferrer">
                Open {model.headline}
                <ArrowSquareOut weight="bold" />
              </a>
            </div>
          )}
        </div>
      </header>

      <ServerGuyReport
        model={model}
        recheck={recheck}
        page={page}
        onOpenDestination={onOpenDestination}
        headline={overview.headline}
        showVerdict={overview.needs.length === 0}
      >
        {variant !== "lanes" && needsBlock}
        {showSuggestion && suggestion && (
          <div
            className={`axo-suggest${leaving ? " is-leaving" : ""}`}
            key={suggestion.id}
          >
            <div>
              <small>When you have a minute</small>
              <b>{suggestion.title}</b>
              <p>{suggestion.detail}</p>
            </div>
            <div className="axo-suggest-actions">
              <button
                type="button"
                className="axo-later"
                onClick={() => {
                  setLeaving(true);
                  window.setTimeout(() => {
                    setSnoozed(true);
                    setLeaving(false);
                    setSnoozeNote(true);
                    window.setTimeout(() => setSnoozeNote(false), 4000);
                  }, 320);
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className="ax-button"
                onClick={() => onAsk(suggestion.draft)}
              >
                <ChatCircleText weight="bold" />
                Ask Server Guy
              </button>
            </div>
          </div>
        )}
        {variant === "suggests" && snoozeNote && (
          <p className="axo-snoozed">I&apos;ll bring it up another time.</p>
        )}
      </ServerGuyReport>

      {variant === "lanes" && (
        <div className="axo-lanes">
          <div className="axo-lane">
            <h2>
              Needs you
              {overview.needs.length > 0 && <small>{overview.needs.length}</small>}
            </h2>
            {overview.needs.length ? (
              needsBlock
            ) : (
              <p className="axo-lane-empty">
                <Check weight="bold" /> Nothing needs you.
              </p>
            )}
          </div>
          <div className="axo-lane is-calm">
            <h2>
              Could be better <small>optional</small>
            </h2>
            {overview.ideas.length ? (
              overview.ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onAsk={onAsk}
                  onOpenDestination={onOpenDestination}
                />
              ))
            ) : (
              <p className="axo-lane-empty">
                <Check weight="bold" /> Nothing to suggest.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="axo-vitals">
        {overview.vitals.map((vital, index) => (
          <VitalCard
            key={vital.id}
            vital={vital}
            index={index}
            open={openVital === vital.id}
            offset={offset}
            end={index >= 2}
            onToggle={() =>
              setOpenVital((current) => (current === vital.id ? null : vital.id))
            }
            onOpenDestination={onOpenDestination}
            onAsk={onAsk}
          />
        ))}
      </div>

      <div className="axo-lower">
        <MiniMap
          model={model}
          reduced={reduced}
          highlight={pointed}
          onOpen={openArchitecture}
        />
        <div className="axo-recent">
          <h2>Recent work</h2>
          {overview.recent.length === 0 && (
            <p className="axo-recent-empty">
              {planned ? "Nothing has run yet." : "No work recorded yet."}
            </p>
          )}
          {overview.recent.map((item) => (
            <button
              key={item.id}
              type="button"
              className="axo-recent-row"
              disabled={!item.open}
              onClick={item.open ?? undefined}
            >
              <OpChip state={item.state} />
              <b>{item.title}</b>
              <small>
                {item.from ? `from ${item.from}` : "automatic"} · {item.when}
              </small>
            </button>
          ))}
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("history")}
          >
            Open History
            <ArrowRight weight="bold" />
          </button>
        </div>
      </div>

      {variant === "quiet" && overview.ideas.length > 0 && (
        <div className="axo-quiet-wrap">
          <button
            type="button"
            className="axo-quiet"
            aria-expanded={ideasOpen}
            onClick={() => setIdeasOpen((value) => !value)}
          >
            <Lightbulb weight="duotone" />
            {ideasOpen
              ? "Hide ideas"
              : `${counts[overview.ideas.length] ?? overview.ideas.length} ${overview.ideas.length === 1 ? "idea" : "ideas"} to make it sturdier`}
            <CaretDown weight="bold" className="axo-caret" />
          </button>
          {ideasOpen && (
            <div className="axo-ideas">
              {overview.ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onAsk={onAsk}
                  onOpenDestination={onOpenDestination}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
