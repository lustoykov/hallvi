"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Logs and Monitoring.
// Logs in Paper (paper.tsx), the read printed on continuous paper, and
// Monitoring in Tuner (tuner.tsx), a radio dial of the parts anything can
// be heard from, on the real routes and inside the real shell. The owner
// chose them from three directions, which stay on claude/logs-monitoring.
// The bar at the bottom switches to the shipped view (0), which also stands
// in while nothing is recorded. Nothing here reads logs or checks the
// server; asking goes to the conversation.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import type { ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { PaperDirection } from "./paper";
import { buildSignalStory, type SignalStory } from "./signal-model";
import { TunerDirection } from "./tuner";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type SignalPage = "logs" | "monitoring";
export interface SignalDirectionProps {
  story: SignalStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  onAsk: (draft: string) => void;
}

const variants: Record<SignalPage, VariantEntry[]> = {
  logs: [
    { key: "A", id: "paper", name: "Paper" },
    { key: "0", id: "current", name: "Current page" },
  ],
  monitoring: [
    { key: "A", id: "tuner", name: "Tuner" },
    { key: "0", id: "current", name: "Current page" },
  ],
};
const choices: ScenarioId[] = ["live", "later", "failing"];
const DAY = 86_400_000;

function writeUrl(key: string, scenario: ScenarioId) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
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
  const invent = scenario === "failing";
  const story = useMemo(
    () => buildSignalStory({ record, stack, facts, operations, now, invent }),
    [record, stack, facts, operations, now, invent],
  );
  const busy = operationsFor(page, operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const variant = variants[page][showCurrent ? 1 : 0];
  // With nothing recorded, the shipped page's honest empty state stands in;
  // on Logs that is also where a first read is asked for.
  const shipped =
    showCurrent ||
    (page === "logs" ? !story.collections.length : story.state === "none");
  const Direction = page === "logs" ? PaperDirection : TunerDirection;
  const props: SignalDirectionProps = {
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
