"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Directions for the Database and Storage destinations, on the real routes
// and inside the real shell, switchable with ?variant= and the prototype bar
// (← → keys). Each direction draws both pages, and none uses the Transit
// line: A Cutaway opens the server up in space, B Timeline follows the data
// through time in Overview's lanes, and C Answers puts it in plain questions
// and answers. 0 is the shipped view, which also stands in while nothing
// is recorded.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import { CITIES, type ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { AnswersDirection } from "./answers";
import { CutawayDirection } from "./cutaway";
import { buildDataStory, type DataStory } from "./data-model";
import { TimelineDirection } from "./timeline";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type DataPage = "database" | "storage";
export interface DataDirectionProps {
  page: DataPage;
  story: DataStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  /** The server it all lives on, for the directions that name it. */
  server: { label: string; city: string | null } | null;
  onAsk: (draft: string) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}

const variants: VariantEntry[] = [
  { key: "A", id: "cutaway", name: "Cutaway" },
  { key: "B", id: "timeline", name: "Timeline" },
  { key: "C", id: "answers", name: "Answers" },
  { key: "0", id: "current", name: "Current page" },
];
const directions: Record<string, (props: DataDirectionProps) => ReactNode> = {
  cutaway: CutawayDirection,
  timeline: TimelineDirection,
  answers: AnswersDirection,
};
const choices: ScenarioId[] = ["live", "later"];
const DAY = 86_400_000;

function writeUrl(variant: string, scenario: ScenarioId) {
  const url = new URL(window.location.href);
  url.searchParams.set(
    "variant",
    variants.find((item) => item.id === variant)?.key ?? variant,
  );
  if (scenario === "live") url.searchParams.delete("record");
  else url.searchParams.set("record", scenario);
  window.history.replaceState(window.history.state, "", url);
}

export function DataPrototype({
  page,
  record,
  stack,
  facts,
  operations,
  now: clock,
  onAsk,
  onOpenConversation,
  onOpenDestination,
  chrome,
  current,
}: {
  page: DataPage;
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onAsk: (draft: string) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  chrome: PageChrome;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("cutaway");
  const [scenario, setScenario] = useState<ScenarioId>("live");
  const [reduced, setReduced] = useState(false);

  // Read the URL once on the client, so the server's first render and the
  // browser's agree.
  useEffect(() => {
    const start = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("variant")?.toLowerCase();
      const found = variants.find(
        (item) => item.id === wanted || item.key.toLowerCase() === wanted,
      );
      if (found) setVariantId(found.id);
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
    () => buildDataStory({ record, stack, facts, operations, now }),
    [record, stack, facts, operations, now],
  );
  const busy = operationsFor(page, operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  // With nothing recorded, the shipped page's honest empty state stands in.
  const shipped =
    variant.id === "current" ||
    story.state === "none" ||
    (page === "database" ? !story.database : !story.volumes.length);
  const Direction = directions[variant.id] ?? CutawayDirection;
  const offer = record?.offer ?? null;
  const props: DataDirectionProps = {
    page,
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title={page === "database" ? "Database" : "Storage"}
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
    onOpenConversation,
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
          <Direction {...props} />
        )}
        <PrototypeBar
          variants={variants}
          variant={variant}
          onVariant={(id) => {
            setVariantId(id);
            writeUrl(id, scenario);
          }}
          scenario={scenario}
          onScenario={(id) => {
            setScenario(id);
            writeUrl(variant.id, id);
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
