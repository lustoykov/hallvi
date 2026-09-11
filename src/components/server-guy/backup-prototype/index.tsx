"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Storage and Backups.
// Storage in Flow (flow.tsx), following the data from the server to the
// copies and the restore, and Backups in Calendar (calendar.tsx), the days
// in columns, on the real routes and inside the real shell. The owner chose
// them from three directions, which stay on claude/storage-backups. The bar
// at the bottom switches to the shipped view (0), which also stands in while
// nothing is recorded. Nothing here runs a backup or a restore; asking goes
// to the conversation.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import { CITIES, type ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { CalendarDirection } from "./calendar";
import { FlowDirection } from "./flow";
import { buildProtectStory, type ProtectStory } from "./model";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type ProtectPage = "storage" | "backups";
export interface ProtectDirectionProps {
  story: ProtectStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  /** The server it all lives on. */
  server: { label: string; city: string | null } | null;
  onAsk: (draft: string) => void;
}

const variants: Record<ProtectPage, VariantEntry[]> = {
  storage: [
    { key: "A", id: "flow", name: "Flow" },
    { key: "0", id: "current", name: "Current page" },
  ],
  backups: [
    { key: "A", id: "calendar", name: "Calendar" },
    { key: "0", id: "current", name: "Current page" },
  ],
};
const choices: ScenarioId[] = ["live", "later"];
const DAY = 86_400_000;

function writeUrl(key: string, scenario: ScenarioId) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  if (scenario === "live") url.searchParams.delete("record");
  else url.searchParams.set("record", scenario);
  window.history.replaceState(window.history.state, "", url);
}

export function BackupPrototype({
  page,
  record,
  stack,
  facts,
  operations,
  now: clock,
  onAsk,
  chrome,
  current,
}: {
  page: ProtectPage;
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onAsk: (draft: string) => void;
  chrome: PageChrome;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  // Whether the shipped view is showing; it carries across the two pages.
  const [showCurrent, setShowCurrent] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>("live");
  const [reduced, setReduced] = useState(false);

  // Read the URL once on the client, so the server's first render and the
  // browser's agree.
  useEffect(() => {
    const start = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("variant")?.toLowerCase();
      if (wanted === "0" || wanted === "current") setShowCurrent(true);
      const wantedRecord = params.get("record") as ScenarioId | null;
      if (wantedRecord && choices.includes(wantedRecord))
        setScenario(wantedRecord);
      setReduced(document.documentElement.dataset.axMotion === "reduced");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(start);
  }, []);

  const now = scenario === "later" ? clock + 3 * DAY : clock;
  const story = useMemo(
    () => buildProtectStory({ record, stack, facts, operations, now }),
    [record, stack, facts, operations, now],
  );
  const busy = operationsFor(page, operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const variant = variants[page][showCurrent ? 1 : 0];
  // With nothing recorded, the shipped page's honest empty state stands in.
  const shipped =
    showCurrent ||
    story.state === "none" ||
    (!story.volumes.length && !story.copies.length);
  const Direction = page === "storage" ? FlowDirection : CalendarDirection;
  const offer = record?.offer ?? null;
  const props: ProtectDirectionProps = {
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title={page === "storage" ? "Storage" : "Backups"}
        name={story.name}
        openUrl={
          story.state === "running"
            ? (facts.domains?.address ?? record?.url ?? null)
            : null
        }
        restricted={story.restricted}
      />
    ),
    activity: busy ? chrome.activity : null,
    server: offer
      ? {
          label: `Hetzner ${offer.serverType.toUpperCase()}`,
          city: CITIES[offer.location]?.[0] ?? offer.location,
        }
      : null,
    onAsk,
  };

  return (
    <>
      {shipped && ready && (
        <>
          {chrome.bar}
          {chrome.header}
        </>
      )}
      <div
        className="ax-root"
        data-variant={variant.id}
        data-scenario={scenario}
      >
        {!ready ? (
          <p className="ax-loading">Reading the record…</p>
        ) : shipped ? (
          current
        ) : (
          // Each page starts with its own selection.
          <Direction key={page} {...props} />
        )}
        <PrototypeBar
          variants={variants[page]}
          variant={variant}
          onVariant={(id) => {
            const next = id === "current";
            setShowCurrent(next);
            writeUrl(next ? "0" : "A", scenario);
          }}
          scenario={scenario}
          onScenario={(id) => {
            setScenario(id);
            writeUrl(variant.key, id);
          }}
          source="live"
          reduced={reduced}
          onReduced={(value) => {
            setReduced(value);
            setMotionPreview(value);
          }}
          choices={choices}
        />
      </div>
    </>
  );
}
