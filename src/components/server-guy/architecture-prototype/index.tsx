"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Three directions for the Architecture destination, on the real route and
// inside the real shell, switchable with ?variant= and the prototype bar
// (← → keys). The record is read live and read-only from the main dev
// server; every other "Record" choice is invented and labelled. The caller
// renders this only outside production builds.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ApplicationRecord } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
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

export interface DirectionProps {
  model: ArchitectureModel;
  recheck: Recheck;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
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
  onOpenDestination,
  onAsk,
  current,
}: {
  application: ApplicationRecord;
  deployment: DeploymentRecord | null;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
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

  const variant =
    variants.find((item) => item.id === variantId) ?? variants[0];
  const props: DirectionProps | null = model
    ? { model, recheck, onOpenDestination, onAsk }
    : null;

  return (
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
        <JourneyDirection {...props} />
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
  );
}
