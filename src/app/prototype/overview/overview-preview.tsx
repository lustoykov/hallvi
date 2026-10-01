"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// DEVELOPMENT PREVIEW: the real Overview page inside the real shell, on the
// traffic fixtures' invented numbers and the records in `situations.ts`, so
// every direction can be looked at in every state without a server.
//
// ?variant= picks a direction (the bottom bar, or ← →), ?site= a kind of
// traffic and ?state= what is on record.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ApplicationIdentity } from "@/components/hallvi/application-identity";
import { ApplicationNavigation } from "@/components/hallvi/application-navigation";
import { ApplicationSectionView } from "@/components/hallvi/application-section-view";
import {
  hiddenSections,
  sectionFromHash,
  standings,
  visibleSections,
  type ApplicationSection,
} from "@/components/hallvi/application-sections";
import { PulseContext } from "@/components/hallvi/pulse";
import {
  TrafficSourceContext,
  useTrafficListed,
} from "@/components/hallvi/traffic/source";
import type { OperatorView } from "@/server/types";

import "@/components/hallvi/application-shell.css";
import "@/components/hallvi/views.css";
import {
  fixtureSource,
  recordsOf,
  scenarios,
  type Scenario,
} from "../traffic/fixtures";
import { SITUATIONS, type Situation } from "./situations";

const CHANGED = "hv-overview-preview";
function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  window.addEventListener(CHANGED, changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener(CHANGED, changed);
  };
}
const search = () => window.location.search;
function navigate(key: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CHANGED));
}

function Frame({
  scenario,
  situation,
  page,
  now,
  onSay,
}: {
  scenario: Scenario;
  situation: Situation;
  page: ApplicationSection;
  now: number;
  onSay: (said: { title: string; body: string }) => void;
}) {
  const application = useMemo(
    () => ({
      id: `proto-${scenario.id}`,
      name: scenario.name,
      repositoryUrl: `https://github.com/owner/${scenario.name.toLowerCase()}`,
      repositoryOwner: "owner",
      repositoryName: scenario.name.toLowerCase(),
      createdAt: new Date(now - 60 * 864e5).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }),
    [scenario.id, scenario.name, now],
  );
  const records = useMemo(
    () => situation.records(recordsOf(scenario, now), application, now),
    [scenario, situation, application, now],
  );
  const executions = useMemo(
    () => situation.executions(application.id, now),
    [situation, application.id, now],
  );
  const view: OperatorView = {
    application,
    chats: [
      {
        id: "chat",
        applicationId: application.id,
        title: "Main operator",
        createdAt: application.createdAt,
        archivedAt: null,
        kind: "main",
        lastActivityAt: application.updatedAt,
      },
    ],
    selectedChatId: "chat",
    messages: [],
    information: records,
    executions,
  };
  const kept = useTrafficListed(application.id);
  const listed = standings(records, false, kept);
  const [revealed, setRevealed] = useState(false);
  return (
    <main className="hv-shell hv-adaptive-shell">
      <header className="hv-topbar">
        <div className="hv-topbar-where">
          <strong>{page.replace(/^./, (first) => first.toUpperCase())}</strong>
        </div>
        <nav className="ovp-tools" aria-label="Preview">
          <span>Preview</span>
          <select
            aria-label="Kind of traffic"
            value={scenario.id}
            onChange={(event) => navigate("site", event.target.value)}
          >
            {scenarios(now).map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
          <select
            aria-label="What is on record"
            value={situation.id}
            onChange={(event) => navigate("state", event.target.value)}
          >
            {SITUATIONS.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
        </nav>
      </header>
      <ApplicationNavigation
        head={
          <ApplicationIdentity
            variant="navigation"
            application={application}
            applications={[application]}
            menuId="preview-picker"
            hrefFor={() => "/prototype/overview"}
            addHref="/prototype/overview"
          />
        }
        chats={view.chats}
        selectedChatId="chat"
        section={page}
        busy={false}
        onSection={(section) => navigate("page", section)}
        onChat={() => {}}
        onCreate={() => {}}
        onArchive={() => {}}
        sections={visibleSections(page, listed)}
        hidden={hiddenSections(page, listed)}
        revealed={revealed}
        onReveal={setRevealed}
      />
      <section className="hv-workspace hv-dashboard-open">
        <PulseContext.Provider value={situation.pulse}>
          <ApplicationSectionView
            key={`${scenario.id}:${situation.id}:${page}`}
            section={page}
            view={view}
            now={now}
            reachable={situation.reachable}
            onReopen={() =>
              onSay({
                title: "Drafted for Hallvi",
                body: "Open the private connection to this application again.",
              })
            }
            onRefresh={async () => {}}
            onOpenDestination={(section) => navigate("page", section)}
            onOpenConversation={() =>
              onSay({
                title: "Would open",
                body: "The conversation where this happened.",
              })
            }
            onAsk={(_, draft) =>
              onSay({ title: "Drafted for Hallvi", body: draft })
            }
            bar={
              <div className="hv-view-bar">
                <button type="button" className="hv-view-back">
                  ← Back to Main operator
                </button>
              </div>
            }
          />
        </PulseContext.Provider>
      </section>
    </main>
  );
}

export function OverviewPreview() {
  const query = useSyncExternalStore(subscribe, search, () => null);
  const [now, setNow] = useState(() => Date.now());
  const [said, setSaid] = useState<{ title: string; body: string } | null>(
    null,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!said) return;
    const timer = window.setTimeout(() => setSaid(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [said]);
  // The preview opens on the first direction, not on today's page.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("variant")) return;
    url.searchParams.set("variant", "a");
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event("popstate"));
  }, []);
  const params = new URLSearchParams(query ?? "");
  const all = useMemo(() => scenarios(now), [now]);
  const scenario = all.find((one) => one.id === params.get("site")) ?? all[0];
  const situation =
    SITUATIONS.find((one) => one.id === params.get("state")) ?? SITUATIONS[0];
  const page = sectionFromHash(`#${params.get("page")}`) ?? "overview";
  // One source per scenario, so the stream is not restarted by the clock.
  const source = useMemo(
    () => fixtureSource(scenario),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario.id],
  );
  // Rendered in the browser only: every number here depends on its clock.
  if (query === null) return null;
  return (
    <TrafficSourceContext.Provider value={source}>
      <Frame
        key={scenario.id}
        scenario={scenario}
        situation={situation}
        page={page}
        now={now}
        onSay={setSaid}
      />
      {said && (
        <p className="ovp-said" role="status">
          <b>{said.title}</b>
          {said.body}
        </p>
      )}
      <style>{`
        .ovp-tools { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 12px; }
        .ovp-tools span { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #8b95a5; }
        .ovp-tools select { height: 28px; padding: 0 8px; border: 1px solid #d8dee8; border-radius: 8px; background: #fff; font: inherit; font-size: 12.5px; color: #202838; }
        .ovp-said { position: fixed; left: 16px; bottom: 16px; z-index: 40; display: grid; gap: 2px; max-width: 420px; margin: 0; padding: 10px 14px; border: 1px solid #dce5f7; border-radius: 12px; background: #fff; box-shadow: 0 10px 28px -14px rgb(28 52 110 / 35%); font-size: 12.5px; line-height: 1.45; color: #3e4a60; }
        .ovp-said b { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #2852a6; }
      `}</style>
    </TrafficSourceContext.Provider>
  );
}
