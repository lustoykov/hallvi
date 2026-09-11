"use client";

// PROTOTYPE · chosen on claude/deployment-history.
// History as a line with a timetable (transit.tsx), on the real route and
// inside the real shell. The owner chose it from four directions on
// claude/deployment-history, where the others still live. The bar at the
// bottom switches to the shipped view (0) for comparison, and the scenario.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";
import type { ActivityEvent, ChatSummary, Decision } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import type { PageChrome } from "../architecture-prototype";
import { productName, type ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { configuredServices } from "../deployment-prototype/deployment-model";
import { PageHead } from "../deployment-prototype/page-head";
import { buildHistory, type Filter, type HistoryRecord } from "./history-model";
import { TransitHistory } from "./transit";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export interface HistoryDirectionProps {
  history: HistoryRecord;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  now: number;
  head: ReactNode;
  /** Saved requirements and application events, beside the operations. */
  decisions: Decision[];
  activity: ActivityEvent[];
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}

const variants: VariantEntry[] = [
  { key: "A", id: "transit", name: "Transit" },
  { key: "0", id: "current", name: "Current history" },
];
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

export function HistoryPrototype({
  record,
  facts,
  operations,
  chats,
  now: clock,
  onOpenConversation,
  onOpenDestination,
  decisionFor,
  decisions,
  activity,
  chrome,
  current,
}: {
  record: DeploymentRecord | null;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  now: number;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  /** Saved requirements and application events, beside the operations. */
  decisions: Decision[];
  activity: ActivityEvent[];
  chrome: PageChrome;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("transit");
  const [scenario, setScenario] = useState<ScenarioId>("live");
  const [reduced, setReduced] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");

  // Read the URL once on the client, so the server's first render and the
  // browser's agree, and days are the viewer's own.
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
  const history = useMemo(
    () => buildHistory(operations, chats, filter),
    [operations, chats, filter],
  );
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const live = record?.status === "live";
  const props: HistoryDirectionProps = {
    history,
    filter,
    onFilter: setFilter,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title="History"
        name={productName(
          configuredServices(record)[0]?.image,
          "the application",
        )}
        openUrl={live ? (facts.domains?.address ?? record?.url ?? null) : null}
        restricted={currentFacts(record)?.httpAccess === "controller"}
      />
    ),
    decisions,
    activity,
    decisionFor,
    onOpenConversation,
    onOpenDestination,
  };

  return (
    <>
      {variant.id === "current" && (
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
        ) : variant.id === "current" ? (
          current
        ) : (
          <TransitHistory {...props} />
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
