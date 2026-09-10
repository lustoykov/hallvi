"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Directions for the Architecture destination, on the real route and inside
// the real shell, switchable with ?variant= and the prototype bar (← → keys).
// The record is read live and read-only from the main dev server; every
// other "Record" choice is invented and labelled. The caller renders this
// only outside production builds, and hands over the page's chrome (the way
// back, the header, the activity line) so a direction can draw its own.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ApplicationRecord, ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { operationsFor, unresolved } from "../operation-model";
import { JourneyDirection } from "./journey-v2";
import { useLiveRecord } from "./live-record";
import { buildModel, type ArchitectureModel, type ScenarioId } from "./model";
import { setMotionPreview } from "./motion";
import { PrototypeBar, scenarios, type VariantEntry } from "./prototype-bar";
import { useRecheck, type Recheck } from "./use-recheck";
import "./prototype.css";

const AnatomyDirection = dynamic(
  () => import("./anatomy").then((module) => module.AnatomyDirection),
  {
    ssr: false,
    loading: () => <p className="ax-loading">Preparing the model…</p>,
  },
);

/** The page around a direction, as the shell ships it. */
export interface PageChrome {
  /** The way back to the conversation. */
  bar: ReactNode;
  /** The destination's title, description and "Open application". */
  header: ReactNode;
  /** Unsettled work, then the last settled operation and earlier work. */
  activity: ReactNode;
}

/** What a direction that draws its own header needs from the record. */
export interface PageContext {
  chrome: PageChrome;
  /** Where the application answers, while it is serving. */
  openUrl: string | null;
  /** Work is unsettled: the shipped activity is shown as it is. */
  busy: boolean;
  /** The last settled operation that touched this destination. */
  last: {
    title: string;
    at: string;
    conversation: string | null;
    open: (() => void) | null;
  } | null;
  /** Settled operations before the last one. */
  earlier: number;
}

export interface DirectionProps {
  model: ArchitectureModel;
  recheck: Recheck;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
  page?: PageContext;
}

const variants: VariantEntry[] = [
  { key: "A", id: "journey", name: "Journeys" },
  { key: "C", id: "anatomy", name: "Exploded server" },
  { key: "0", id: "current", name: "Current canvas" },
];

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

export function ArchitecturePrototype({
  application,
  deployment,
  facts,
  operations,
  chats,
  onOpenConversation,
  onOpenDestination,
  onAsk,
  chrome,
  current,
}: {
  application: ApplicationRecord;
  deployment: DeploymentRecord | null;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
  chrome: PageChrome;
  /** The shipped canvas, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("journey");
  const [scenario, setScenario] = useState<ScenarioId>("live");
  const [reduced, setReduced] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const start = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("variant")?.toLowerCase();
      const found = variants.find(
        (item) => item.id === wanted || item.key.toLowerCase() === wanted,
      );
      if (found) setVariantId(found.id);
      const record = params.get("record");
      if (scenarios.some((item) => item.id === record))
        setScenario(record as ScenarioId);
      setReduced(document.documentElement.dataset.axMotion === "reduced");
      setNow(Date.now());
      setReady(true);
    }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(tick);
    };
  }, []);

  const fallback = useMemo(
    () => ({ application, deployment, facts, operations }),
    [application, deployment, facts, operations],
  );
  const live = useLiveRecord(application.id, fallback);
  const base = useMemo(
    () =>
      ready
        ? buildModel({
            record: live.record,
            now,
            scenario,
            security: live.security,
          })
        : null,
    [ready, live.record, live.security, now, scenario],
  );
  const failing = useMemo(
    () =>
      base?.parts
        .filter((part) => part.evidence.certainty === "failed")
        .map((part) => part.id) ?? [],
    [base],
  );
  const recheck = useRecheck(failing);
  const model = useMemo(
    () =>
      base && Object.keys(recheck.marks).length
        ? buildModel({
            record: live.record,
            now,
            scenario,
            security: live.security,
            marks: recheck.marks,
          })
        : base,
    [base, recheck.marks, live.record, live.security, now, scenario],
  );

  // The same operations the shell's activity line reads, folded for a
  // direction that shows them itself.
  const list = operationsFor("architecture", operations);
  const settled = list.filter(
    (operation) =>
      operation.state !== "working" &&
      operation.state !== "queued" &&
      operation.state !== "proposed" &&
      !unresolved(operation, operations),
  );
  const last = settled[0];
  const address =
    live.record.facts.domains?.address ?? live.record.deployment?.url ?? null;
  const serving =
    live.record.deployment?.status === "live" ||
    Boolean(live.record.facts.releases?.serving);
  const page: PageContext = {
    chrome,
    openUrl: serving ? address : null,
    busy: settled.length < list.length,
    last: last
      ? {
          title: last.title,
          at: last.updatedAt,
          conversation: last.origin
            ? (chats.find((chat) => chat.id === last.origin!.chatId)?.title ??
              "its conversation")
            : null,
          open: last.origin
            ? () => onOpenConversation(last.origin!.chatId, last.origin!.messageId)
            : null,
        }
      : null,
    earlier: Math.max(0, settled.length - 1),
  };

  const variant =
    variants.find((item) => item.id === variantId) ?? variants[0];
  const props: DirectionProps | null = model
    ? { model, recheck, onOpenDestination, onAsk }
    : null;
  const ownHeader = variant.id === "journey" && props;

  return (
    <>
      {!ownHeader && (
        <>
          {chrome.bar}
          {chrome.header}
          {chrome.activity}
        </>
      )}
      <div
        className="ax-root"
        data-variant={variant.id}
        data-scenario={scenario}
      >
        {!props ? (
          <p className="ax-loading">Reading the record…</p>
        ) : variant.id === "current" ? (
          current
        ) : variant.id === "journey" ? (
          <JourneyDirection {...props} page={page} />
        ) : (
          <AnatomyDirection {...props} />
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
            recheck.reset();
            setScenario(id);
            writeUrl(variant.id, id);
          }}
          source={live.source}
          reduced={reduced}
          onReduced={(value) => {
            setReduced(value);
            setMotionPreview(value);
          }}
        />
      </div>
    </>
  );
}
