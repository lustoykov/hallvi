"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Overview in the Journeys language. The top of the page, how it is doing,
// is the Timeline the owner chose on 10 Sep 2026; under it sit the map in
// miniature, recent work, and one quiet line of ideas.

import { ArrowRight, CaretDown, Lightbulb } from "@phosphor-icons/react";
import { useCallback, useState } from "react";

import type { ApplicationSection } from "../application-sections";
import type { PageContext } from "../page/page-head";
import { ARCHITECTURE_FOCUS } from "../architecture/journey-v2";
import type { ArchitectureModel, LiveRecord } from "../architecture/model";
import { PageHead } from "../page/page-head";
import { MiniMap } from "./mini-map";
import type { Overview } from "./overview-model";
import { IdeaCard, OpChip } from "./shared";
import { TimelineHero } from "./timeline";
import type { Timeline } from "./timeline-model";
import "./overview.css";

const counts = ["No", "One", "Two", "Three", "Four"];

export function OverviewDirection({
  model,
  record,
  page,
  reduced,
  onOpenDestination,
  onAsk,
  built,
  timeline,
}: {
  model: ArchitectureModel;
  record: LiveRecord;
  /** Built from records by the caller. */
  built: Overview;
  timeline: Timeline;
  page: PageContext;
  reduced: boolean;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const overview = built;
  const [pointed, setPointed] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const planned = model.status !== "live";

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
    <section className="ax-root axo" aria-label="Overview">
      <PageHead
        bar={page.chrome.bar}
        title={record.application.name}
        name={record.application.name}
        openUrl={planned ? null : page.openUrl}
        restricted={model.restricted}
        reachable={page.reachable}
        onReopen={page.onReopen}
        reading
      />

      <TimelineHero
        model={model}
        record={record}
        overview={overview}
        page={page}
        pointed={pointed}
        onPoint={setPointed}
        onShow={openArchitecture}
        onAsk={onAsk}
        onOpenDestination={onOpenDestination}
        timeline={timeline}
      />

      <div className="axo-lower">
        <MiniMap
          model={model}
          reduced={reduced}
          highlight={pointed}
          onOpen={openArchitecture}
        />
        <div className="axo-recent">
          <h2>Recent</h2>
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
