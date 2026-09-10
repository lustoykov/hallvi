"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Overview in the Journeys language, on the real route and inside the real
// shell, switchable with ?variant= and the prototype bar (← → keys). The
// same live record and scenarios as Architecture. The owner chose the
// Timeline for the top of the page on 10 Sep 2026; the other directions
// (Little Server's note, Console) live in git history at commit b82106b.
// Variant 0 keeps the shipped Overview for comparison.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ApplicationRecord, ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { recentOperations, unresolved } from "../operation-model";
import type { PageChrome, PageContext } from "../architecture-prototype";
import { useLiveRecord } from "../architecture-prototype/live-record";
import { buildModel, type ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview, useReducedMotion } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  scenarios,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { useRecheck } from "../architecture-prototype/use-recheck";
import { OverviewDirection } from "./overview";
import "../architecture-prototype/prototype.css";

const variants: VariantEntry[] = [
  { key: "A", id: "timeline", name: "Timeline" },
  { key: "0", id: "current", name: "Current overview" },
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

export function OverviewPrototype({
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
  /** The shipped Overview, kept as variant 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("timeline");
  const [scenario, setScenario] = useState<ScenarioId>("live");
  // The bar's preview button; the page follows it and the OS setting both.
  const [reduced, setReduced] = useState(false);
  const motionReduced = useReducedMotion();
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

  // Overview is about the whole application: the last settled work anywhere.
  const settled = recentOperations(operations).filter(
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
    busy: false,
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
  const ownHeader = variant.id !== "current" && model;

  return (
    <>
      {!ownHeader && (
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
        {!model ? (
          <p className="ax-loading">Reading the record…</p>
        ) : variant.id === "current" ? (
          current
        ) : (
          <OverviewDirection
            model={model}
            record={live.record}
            recheck={recheck}
            page={page}
            operations={operations}
            chats={chats}
            reduced={motionReduced}
            onOpenConversation={onOpenConversation}
            onOpenDestination={onOpenDestination}
            onAsk={onAsk}
          />
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
