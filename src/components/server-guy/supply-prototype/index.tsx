"use client";

// PROTOTYPE · opus-ui-improvements · the four remaining destinations.
// Configuration, delivery, queued work and schedules, each drawn once and
// in its own way, because three of the four are about something this
// application does not have — which is the honest answer for most
// applications, and worth more than an empty state:
//
//   Variables  Manifest  everything it was given, by who decided it
//   CDN        Origin    the one machine, and the empty shelf above it
//   Cache      Queue     the line of waiting work, and why it is empty
//   Jobs       Rota      what recurs here, yours and Server Guy's
//
// They run on the real routes inside the real shell; the bar at the bottom
// switches to the shipped view (0), which also stands in while nothing is
// recorded. Nothing here contacts a host, and asking goes to the
// conversation.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import {
  applicationSections,
  type ApplicationSection,
} from "../application-sections";
import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import type { ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { ManifestDirection } from "./manifest";
import { OriginDirection } from "./origin";
import { QueueDirection } from "./queue";
import { RotaDirection } from "./rota";
import { buildSupplyStory, type SupplyStory } from "./supply-model";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type SupplyPage = "variables" | "cdn" | "cache" | "jobs";
export interface SupplyDirectionProps {
  story: SupplyStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}

const names: Record<SupplyPage, string> = {
  variables: "Manifest",
  cdn: "Origin",
  cache: "Queue",
  jobs: "Rota",
};
const directions = {
  variables: ManifestDirection,
  cdn: OriginDirection,
  cache: QueueDirection,
  jobs: RotaDirection,
};
const choices: ScenarioId[] = ["live", "equipped", "later"];
const DAY = 86_400_000;

function writeUrl(key: string, scenario: ScenarioId) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  if (scenario === "live") url.searchParams.delete("record");
  else url.searchParams.set("record", scenario);
  window.history.replaceState(window.history.state, "", url);
}

export function SupplyPrototype({
  page,
  record,
  stack,
  facts,
  operations,
  now: clock,
  onAsk,
  onOpenDestination,
  chrome,
  current,
}: {
  page: SupplyPage;
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  chrome: PageChrome;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  // Whether the shipped view is showing; it carries across the four pages.
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
  }, [page]);

  const now = scenario === "later" ? clock + 3 * DAY : clock;
  const invent = scenario === "equipped" ? "equipped" : null;
  const story = useMemo(
    () => buildSupplyStory({ record, stack, facts, operations, now, invent }),
    [record, stack, facts, operations, now, invent],
  );
  const busy = operationsFor(page, operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const variants: VariantEntry[] = [
    { key: "A", id: page, name: names[page] },
    { key: "0", id: "current", name: "Current page" },
  ];
  const variant = variants[showCurrent ? 1 : 0];
  // Nothing deployed means nothing was given to it either; the shipped
  // page's honest empty state stands in.
  const shipped = showCurrent || story.state === "none";
  const Direction = directions[page];
  const label =
    applicationSections.find((section) => section.id === page)?.label ?? page;
  const props: SupplyDirectionProps = {
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title={label}
        name={story.name}
        openUrl={story.state === "running" ? story.address : null}
        restricted={story.restricted}
      />
    ),
    activity: busy ? chrome.activity : null,
    onAsk,
    onOpenDestination,
  };

  return (
    <>
      {shipped && ready && (
        <>
          {chrome.bar}
          {chrome.header}
        </>
      )}
      <div className="ax-root" data-variant={page} data-scenario={scenario}>
        {!ready ? (
          <p className="ax-loading">Reading the record…</p>
        ) : shipped ? (
          current
        ) : (
          // Each page starts with its own selection.
          <Direction key={page} {...props} />
        )}
        <PrototypeBar
          variants={variants}
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
