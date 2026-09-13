"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Pieces the Overview page shares: the countdown to the next copy, what
// needs you, an idea, a recent-work chip, a vital sign's details, and plain
// words for when something happened.

import {
  ArrowRight,
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
import { useEffect, useState, type ReactNode } from "react";

import type { OperationState } from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import { labelOf, stateLabel } from "../operation-model";
import type { Idea, NeedItem, Vital } from "./overview-model";

export const vitalIcon: Record<Vital["id"], ReactNode> = {
  checks: <ChartLineUp weight="duotone" />,
  backups: <CloudArrowUp weight="duotone" />,
  server: <HardDrives weight="duotone" />,
  access: <ShieldCheck weight="duotone" />,
};

/** How long until a moment, counted down while you watch. */
export function useCountdown(to: string | null | undefined, offset: number) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!to) return;
    const tick = () => setClock(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [to]);
  if (!to || !clock) return null;
  const left = Date.parse(to) - (clock + offset);
  if (left <= 0) return "due now";
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return hours > 0 ? `${hours} h ${minutes} m` : `${minutes} m ${seconds} s`;
}

export function Countdown({ to, offset }: { to: string; offset: number }) {
  return <b className="axo-count">{useCountdown(to, offset)}</b>;
}

/**
 * "today at 03:00", "yesterday at 15:03", "tomorrow at 03:00",
 * "on 7 Sep at 10:00".
 */
export function whenWords(at: string | number, now: number) {
  const date = new Date(at);
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(date) - day(new Date(now))) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (days === 0) return `today at ${time}`;
  if (days === -1) return `yesterday at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `on ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${time}`;
}

/** A span of time without "ago": "25 h", "3 days", "40 min". */
export function span(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/** Closes something on a click outside it, or on Escape. */
export function useDismiss(open: boolean, inside: string, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(inside)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", key);
    };
  }, [open, inside, close]);
}

export function NeedCard({
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

export function IdeaCard({
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

export function OpChip({ state }: { state: OperationState }) {
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
    declined: { tone: "absent", icon: <MinusCircle weight="bold" /> },
    // Amber, not grey: something was running, and how far it got is not
    // known. "Cancelled" in grey read as "nothing happened".
    stopped: { tone: "stale", icon: <MinusCircle weight="bold" /> },
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

/** A vital sign's details: plain words, facts, where to go, and a question. */
export function VitalPop({
  vital,
  onClose,
  onOpenDestination,
  onAsk,
  children,
}: {
  vital: Vital;
  onClose: () => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
  /** Evidence to show between the words and the facts. */
  children?: ReactNode;
}) {
  return (
    <div
      className="axj2-pop axo-pop-card"
      role="dialog"
      aria-label={vital.label}
    >
      <header>
        <span className="axj2-icon" aria-hidden="true">
          {vitalIcon[vital.id]}
        </span>
        <div>
          <b>{vital.label}</b>
          <small>{vital.status.text}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X weight="bold" />
        </button>
      </header>
      <p className="axj2-pop-plain">{vital.plain}</p>
      {children}
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
  );
}
