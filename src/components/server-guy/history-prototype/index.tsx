"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Directions for the History destination, on the real route and inside the
// real shell, switchable with ?variant= and the prototype bar (← → keys).
// A Story and B Ledger read the same record, in two densities; 0 is the
// shipped view. The filter is shared, so switching directions keeps it.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import type { PageChrome } from "../architecture-prototype";
import { productName, type ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { PageHead } from "../deployment-prototype/page-head";
import { FeedDirection } from "./feed";
import { buildHistory, type Filter, type HistoryRecord } from "./history-model";
import { TableDirection } from "./table";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export interface HistoryDirectionProps {
  history: HistoryRecord;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  now: number;
  head: ReactNode;
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}

const variants: VariantEntry[] = [
  { key: "A", id: "story", name: "Story" },
  { key: "B", id: "ledger", name: "Ledger" },
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
  chrome: PageChrome;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("story");
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
        name={productName(record?.plan?.image, "the application")}
        openUrl={live ? (facts.domains?.address ?? record?.url ?? null) : null}
        restricted={currentFacts(record)?.httpAccess === "controller"}
      />
    ),
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
        ) : variant.id === "ledger" ? (
          <TableDirection {...props} />
        ) : (
          <FeedDirection {...props} />
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
