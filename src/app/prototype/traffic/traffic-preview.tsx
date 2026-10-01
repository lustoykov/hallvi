"use client";

// DEVELOPMENT PREVIEW · Traffic, and the lines it adds to Overview,
// Deployment and Monitoring, drawn by the real pages inside the real shell
// on invented numbers (`fixtures.ts`). The collector and its routes are built
// separately; until they exist this is the only way to look at every state.
//
// ?scenario= picks a state and ?page= a destination.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { overviewDemoRecords } from "@/components/hallvi/overview-alternatives/demo-records";
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
import {
  TrafficSourceContext,
  useTrafficListed,
} from "@/components/hallvi/traffic/source";
import type { OperatorView } from "@/server/types";

import "@/components/hallvi/application-shell.css";
import "@/components/hallvi/views.css";
import { fixtureSource, recordsOf, scenarios, type Scenario } from "./fixtures";

const PAGES = ["traffic", "overview", "deployment", "monitoring"] as const;

const CHANGED = "hv-traffic-preview";
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
  page,
  now,
  onAsk,
}: {
  scenario: Scenario;
  page: ApplicationSection;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const application = {
    id: `proto-${scenario.id}`,
    name: scenario.name,
    repositoryUrl: `https://github.com/owner/${scenario.name.toLowerCase()}`,
    repositoryOwner: "owner",
    repositoryName: scenario.name.toLowerCase(),
    createdAt: new Date(now - 60 * 864e5).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  const records = useMemo(
    () => overviewDemoRecords(recordsOf(scenario, now)),
    [scenario, now],
  );
  const view: OperatorView = {
    application,
    chats: [
      {
        id: "chat",
        applicationId: application.id,
        title: "Main",
        createdAt: application.createdAt,
        archivedAt: null,
        kind: "main",
        lastActivityAt: application.updatedAt,
      },
    ],
    selectedChatId: "chat",
    messages: [],
    information: records,
    executions: [],
  };
  const kept = useTrafficListed(application.id);
  const listed = standings(records, false, kept);
  const [revealed, setRevealed] = useState(false);
  return (
    <main className="hv-shell hv-adaptive-shell">
      <header className="hv-topbar">
        <div className="hv-topbar-where">
          <strong>
            {page === "traffic"
              ? "Traffic"
              : page.replace(/^./, (first) => first.toUpperCase())}
          </strong>
        </div>
        <nav className="tfp-tools" aria-label="Preview">
          <span>Sample data</span>
          <select
            aria-label="Scenario"
            value={scenario.id}
            onChange={(event) => navigate("scenario", event.target.value)}
          >
            {scenarios(now).map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Page"
            value={(PAGES as readonly string[]).includes(page) ? page : ""}
            onChange={(event) => navigate("page", event.target.value)}
          >
            {!(PAGES as readonly string[]).includes(page) && (
              <option value="">Other</option>
            )}
            {PAGES.map((one) => (
              <option key={one} value={one}>
                {one.replace(/^./, (first) => first.toUpperCase())}
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
            hrefFor={() => "/prototype/traffic"}
            addHref="/prototype/traffic"
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
        <ApplicationSectionView
          key={`${scenario.id}:${page}`}
          section={page}
          view={view}
          now={now}
          reachable="open"
          onRefresh={async () => {}}
          onOpenDestination={(section) => navigate("page", section)}
          onOpenConversation={() => {}}
          onAsk={(_, draft) => onAsk(draft)}
          bar={
            <div className="hv-view-bar">
              <button type="button" className="hv-view-back">
                ← Back to Main
              </button>
            </div>
          }
        />
      </section>
    </main>
  );
}

export function TrafficPreview() {
  const query = useSyncExternalStore(subscribe, search, () => null);
  const [now, setNow] = useState(() => Date.now());
  const [drafted, setDrafted] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!drafted) return;
    const timer = window.setTimeout(() => setDrafted(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [drafted]);
  const params = new URLSearchParams(query ?? "");
  const all = useMemo(() => scenarios(now), [now]);
  const scenario =
    all.find((one) => one.id === params.get("scenario")) ?? all[0];
  const page = sectionFromHash(`#${params.get("page")}`) ?? "traffic";
  // One source per scenario, so a choice made on the page holds while the
  // scenario is open.
  const source = useMemo(
    () => fixtureSource(scenario),
    // Only the scenario's identity: its numbers follow the clock.
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
        page={page}
        now={now}
        onAsk={setDrafted}
      />
      {drafted && (
        <p className="tfp-drafted" role="status">
          <b>Drafted for Hallvi</b>
          {drafted}
        </p>
      )}
      <style>{`
        .tfp-tools { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 12px; }
        .tfp-tools span { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #8b95a5; }
        .tfp-tools select { height: 28px; padding: 0 8px; border: 1px solid #d8dee8; border-radius: 8px; background: #fff; font: inherit; font-size: 12.5px; color: #202838; }
        .tfp-drafted { position: fixed; left: 16px; bottom: 16px; z-index: 30; display: grid; gap: 2px; max-width: 460px; margin: 0; padding: 10px 14px; border: 1px solid #dce5f7; border-radius: 12px; background: #fff; box-shadow: 0 10px 28px -14px rgb(28 52 110 / 35%); font-size: 12.5px; line-height: 1.45; color: #3e4a60; }
        .tfp-drafted b { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #2852a6; }
      `}</style>
    </TrafficSourceContext.Provider>
  );
}
