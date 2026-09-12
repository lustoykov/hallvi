"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Domains and Security.
// The two pages ask different questions, so the owner chose from two sets
// of three: Domains in Callers (callers.tsx), the page seen from the other
// side of the wire, and Security in Rings (rings.tsx), reach drawn as
// territory. They run on the real routes inside the real shell; the four
// directions not chosen stay on claude/domains-security. The bar at the
// bottom switches to the shipped view (0), which also stands in while
// nothing is recorded. Nothing here contacts a host: the firewall read is
// the one the shipped Security view already makes, and the scenarios that
// invent one say so.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ApplicationSection } from "./../application-sections";

import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import type { ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { CallersDirection } from "./callers";
import { buildReachStory, type ReachStory } from "./reach-model";
import { RingsDirection } from "./rings";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export type ReachPage = "domains" | "security";
export interface ReachDirectionProps {
  story: ReachStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  /** The shell's own note about the provider read, when there is one. */
  panel?: ReactNode;
  /** Reads the firewall from the provider again; the shell owns the read. */
  onCheck?: () => void;
  checking?: boolean;
}

const variants: Record<ReachPage, VariantEntry[]> = {
  domains: [
    { key: "A", id: "callers", name: "Callers" },
    { key: "0", id: "current", name: "Current page" },
  ],
  security: [
    { key: "A", id: "rings", name: "Rings" },
    { key: "0", id: "current", name: "Current page" },
  ],
};
const choices: Record<ReachPage, ScenarioId[]> = {
  domains: ["live", "domain", "later"],
  security: ["live", "checked", "later"],
};
const DAY = 86_400_000;

function writeUrl(key: string, scenario: ScenarioId) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  if (scenario === "live") url.searchParams.delete("record");
  else url.searchParams.set("record", scenario);
  window.history.replaceState(window.history.state, "", url);
}

export function ReachPrototype({
  page,
  record,
  stack,
  facts,
  operations,
  now: clock,
  onAsk,
  onOpenDestination,
  panel,
  onCheck,
  checking,
  chrome,
  current,
}: {
  page: ReachPage;
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  panel?: ReactNode;
  onCheck?: () => void;
  checking?: boolean;
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
      if (wantedRecord && choices[page].includes(wantedRecord))
        setScenario(wantedRecord);
      setReduced(document.documentElement.dataset.axMotion === "reduced");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(start);
  }, [page]);

  const now = scenario === "later" ? clock + 3 * DAY : clock;
  const invent =
    scenario === "domain"
      ? "domain"
      : scenario === "checked"
        ? "checked"
        : null;
  const story = useMemo(
    () => buildReachStory({ record, stack, facts, operations, now, invent }),
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
  // With nothing deployed there is no address and no firewall to speak of;
  // the shipped page's honest empty state stands in.
  const shipped = showCurrent || story.state === "none";
  const Direction = page === "domains" ? CallersDirection : RingsDirection;
  const props: ReachDirectionProps = {
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title={page === "domains" ? "Domains" : "Security"}
        name={story.name}
        openUrl={story.state === "running" ? story.address : null}
        restricted={story.audience === "controller"}
      />
    ),
    activity: busy ? chrome.activity : null,
    onAsk,
    onOpenDestination,
    panel,
    onCheck,
    checking,
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
          choices={choices[page]}
        />
      </div>
    </>
  );
}
