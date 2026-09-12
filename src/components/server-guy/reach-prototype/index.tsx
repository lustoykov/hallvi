"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Six directions, three for each page, because the two pages are different
// questions: Domains asks what name this answers on and what is missing in
// front of it; Security asks who can reach it at all.
//
//   Domains   A Address   the address life-size, taken apart
//             B Callers   what each kind of visitor meets
//             C Handover  the one step only you can do, and what follows
//   Security  A Doors     the server's face, one door per port
//             B Rings     who is inside which ring, and what each can reach
//             C Statement the exposure said out loud, with its evidence
//
// They run on the real routes inside the real shell; the bar at the bottom
// switches direction, record scenario and reduced motion, and 0 is the
// shipped page. Nothing here contacts a host: the firewall read-back is the
// one the shipped Security view makes, and the scenarios that invent one
// say so. Asking goes to the conversation.

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
import { AddressDirection } from "./address";
import { CallersDirection } from "./callers";
import { DoorsDirection } from "./doors";
import { HandoverDirection } from "./handover";
import { StatementDirection } from "./statement";
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
    { key: "A", id: "address", name: "Address" },
    { key: "B", id: "callers", name: "Callers" },
    { key: "C", id: "handover", name: "Handover" },
    { key: "0", id: "current", name: "Current page" },
  ],
  security: [
    { key: "A", id: "doors", name: "Doors" },
    { key: "B", id: "rings", name: "Rings" },
    { key: "C", id: "statement", name: "Statement" },
    { key: "0", id: "current", name: "Current page" },
  ],
};
const choices: Record<ReachPage, ScenarioId[]> = {
  domains: ["live", "domain", "later"],
  security: ["live", "checked", "later"],
};
const directions = {
  address: AddressDirection,
  callers: CallersDirection,
  handover: HandoverDirection,
  doors: DoorsDirection,
  rings: RingsDirection,
  statement: StatementDirection,
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
  const [chosen, setChosen] = useState(0);
  const [scenario, setScenario] = useState<ScenarioId>("live");
  const [reduced, setReduced] = useState(false);

  // Read the URL once on the client, so the server's first render and the
  // browser's agree.
  useEffect(() => {
    const start = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("variant")?.toLowerCase();
      const index = variants[page].findIndex(
        (item) => item.key.toLowerCase() === wanted || item.id === wanted,
      );
      if (index >= 0) setChosen(index);
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
  const list = variants[page];
  const variant = list[Math.min(chosen, list.length - 1)];
  // With nothing deployed there is no address and no firewall to speak of;
  // the shipped page's honest empty state stands in.
  const shipped = variant.id === "current" || story.state === "none";
  const Direction =
    directions[variant.id as keyof typeof directions] ?? AddressDirection;
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
          // Each direction starts with its own selection.
          <Direction key={variant.id} {...props} />
        )}
        <PrototypeBar
          variants={list}
          variant={variant}
          onVariant={(id) => {
            const next = Math.max(
              0,
              list.findIndex((item) => item.id === id),
            );
            setChosen(next);
            writeUrl(list[next].key, scenario);
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
