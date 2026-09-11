"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Overview in the Journeys language. The top of the page, how it is doing,
// is the Timeline the owner chose on 10 Sep 2026; under it sit the map in
// miniature, recent work, and one quiet line of ideas.

import {
  ArrowRight,
  ArrowSquareOut,
  CaretDown,
  Lightbulb,
  ShieldCheck,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";

import type { ApplicationOperation } from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import type { PageContext } from "../architecture-prototype";
import { ARCHITECTURE_FOCUS } from "../architecture-prototype/journey-v2";
import type {
  ArchitectureModel,
  LiveRecord,
} from "../architecture-prototype/model";
import type { Recheck } from "../architecture-prototype/use-recheck";
import { MiniMap } from "./mini-map";
import { buildOverview } from "./overview-model";
import { IdeaCard, OpChip } from "./shared";
import { TimelineHero } from "./timeline";
import "./overview.css";

const counts = ["No", "One", "Two", "Three", "Four"];

export function OverviewDirection({
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
    () =>
      buildOverview({ model, record, operations, chats, onOpenConversation }),
    [model, record, operations, chats, onOpenConversation],
  );
  const [pointed, setPointed] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const planned = model.status !== "live";
  // The "3 days later" scenario runs three days ahead of the clock.
  const offset = model.scenario === "later" ? 3 * 86_400_000 : 0;

  // Architecture opens with a part's details open when there is one in mind.
  const openArchitecture = useCallback(
    (partId?: string) => {
      if (partId)
        try {
          window.sessionStorage.setItem(ARCHITECTURE_FOCUS, partId);
        } catch {}
      onOpenDestination("architecture");
    },
    [onOpenDestination],
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

      <TimelineHero
        model={model}
        record={record}
        overview={overview}
        recheck={recheck}
        page={page}
        offset={offset}
        pointed={pointed}
        onPoint={setPointed}
        onShow={openArchitecture}
        onAsk={onAsk}
        onOpenDestination={onOpenDestination}
      />

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

      {overview.ideas.length > 0 && (
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
