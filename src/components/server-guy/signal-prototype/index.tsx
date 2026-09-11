"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Directions for the Logs and Monitoring destinations, on the real routes
// and inside the real shell, switchable with ?variant= and the prototype bar
// (← → keys). Each direction draws both pages from the same record: A Scope
// places everything that looked at the application by how long ago it
// looked, B Tuner tunes into one part at a time and reads what it said or
// what was heard from it, and C Paper prints the output and the inspection
// reports on paper. 0 is the shipped view, which also stands in while
// nothing is recorded. Nothing here reads logs or checks the server; asking
// goes to the conversation.

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
import { PaperDirection } from "./paper";
import { ScopeDirection } from "./scope";
import { buildSignalStory, type SignalStory } from "./signal-model";
import { TunerDirection } from "./tuner";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type SignalPage = "logs" | "monitoring";
export interface SignalDirectionProps {
  page: SignalPage;
  story: SignalStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  /** The bar's invented scenario is showing. */
  invented: boolean;
  /** The server it all runs on. */
  server: { label: string; city: string | null } | null;
  onAsk: (draft: string) => void;
}

const variants: VariantEntry[] = [
  { key: "A", id: "scope", name: "Scope" },
  { key: "B", id: "tuner", name: "Tuner" },
  { key: "C", id: "paper", name: "Paper" },
  { key: "0", id: "current", name: "Current page" },
];
const directions: Record<string, (props: SignalDirectionProps) => ReactNode> = {
  scope: ScopeDirection,
  tuner: TunerDirection,
  paper: PaperDirection,
};
const choices: ScenarioId[] = ["live", "later", "failing"];
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

export function SignalPrototype({
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
  page: SignalPage;
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
  const [variantId, setVariantId] = useState("scope");
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
  const invented = scenario === "failing";
  const story = useMemo(
    () =>
      buildSignalStory({
        record,
        stack,
        facts,
        operations,
        now,
        invent: invented,
      }),
    [record, stack, facts, operations, now, invented],
  );
  const busy = operationsFor(page, operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  // With nothing recorded, the shipped page's honest empty state stands in;
  // on Logs that is also where a first read is asked for.
  const shipped =
    variant.id === "current" ||
    (page === "logs" ? !story.collections.length : story.state === "none");
  const Direction = directions[variant.id] ?? ScopeDirection;
  const offer = record?.offer ?? null;
  const props: SignalDirectionProps = {
    page,
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title={page === "logs" ? "Logs" : "Monitoring"}
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
    invented,
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
