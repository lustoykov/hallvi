"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Directions for the Deployment destination, on the real route and inside
// the real shell, switchable with ?variant= and the prototype bar (← → keys).
// A Story was the start; B Narrated, C Replay and D Transit are three takes
// on it that disagree about structure: the account in words, the record as
// a recording, and the way here as a line. 0 is the shipped view. The
// product's own panel still handles the actions that need it (connecting
// Hetzner, starting a first deployment), and approval stays in chat.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import type { ScenarioId } from "../architecture-prototype/model";
import { setMotionPreview } from "../architecture-prototype/motion";
import {
  PrototypeBar,
  scenarios,
  type VariantEntry,
} from "../architecture-prototype/prototype-bar";
import { buildStory, type DeploymentStory } from "./deployment-model";
import { NarratedDirection } from "./narrated";
import { PageHead } from "./page-head";
import { ReplayDirection } from "./replay";
import { StoryDirection } from "./story";
import { TransitDirection } from "./transit";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";

export interface DirectionProps {
  story: DeploymentStory;
  now: number;
  head: ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: ReactNode;
  /** The product's panel, for the states that need its actions. */
  panel: ReactNode;
  onAsk: (draft: string) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}

const variants: VariantEntry[] = [
  { key: "A", id: "story", name: "Story" },
  { key: "B", id: "narrated", name: "Narrated" },
  { key: "C", id: "replay", name: "Replay" },
  { key: "D", id: "transit", name: "Transit" },
  { key: "0", id: "current", name: "Current deployment" },
];
const directions: Record<string, (props: DirectionProps) => ReactNode> = {
  story: StoryDirection,
  narrated: NarratedDirection,
  replay: ReplayDirection,
  transit: TransitDirection,
};
const choices: ScenarioId[] = ["live", "later", "planned"];
const DAY = 86_400_000;

/** Before deploy, invented: the plan as it waited for your approval. */
function beforeDeploy(record: DeploymentRecord): DeploymentRecord {
  const cut = record.events.findIndex((event) =>
    event.message.startsWith("Recommendation ready"),
  );
  return {
    ...record,
    status: "awaiting-approval",
    verifiedAt: null,
    serverId: null,
    serverCreateAttempted: false,
    address: null,
    url: null,
    error: null,
    logs: "",
    logsCollectedAt: null,
    lifecycle: undefined,
    events: cut >= 0 ? record.events.slice(0, cut + 1) : [],
  };
}

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

export function DeploymentPrototype({
  record,
  operations,
  facts,
  chats,
  now: clock,
  onOpenConversation,
  onOpenDestination,
  onAsk,
  chrome,
  panel,
  current,
}: {
  record: DeploymentRecord | null;
  operations: ApplicationOperation[];
  facts: ApplicationFacts;
  chats: ChatSummary[];
  now: number;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
  chrome: PageChrome;
  panel: ReactNode;
  /** The shipped view, kept as direction 0 for comparison. */
  current: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [variantId, setVariantId] = useState("story");
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
  const shaped = useMemo(
    () => (scenario === "planned" && record ? beforeDeploy(record) : record),
    [scenario, record],
  );
  const approvedIn =
    chats.find((chat) => chat.id === record?.chatId)?.title ?? null;
  const story = useMemo(
    () =>
      buildStory({
        record: shaped,
        operations: scenario === "planned" ? [] : operations,
        now,
        approvedIn,
      }),
    [shaped, operations, scenario, now, approvedIn],
  );

  // The shell's activity cards only while work here is unsettled; settled
  // work is already the story.
  const touching = operationsFor("deployment", operations);
  const busy =
    scenario !== "planned" &&
    touching.some(
      (operation) =>
        operation.state === "working" ||
        operation.state === "queued" ||
        operation.state === "proposed" ||
        (operation.state === "failed" && unresolved(operation, operations)),
    );
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const Direction = directions[variant.id] ?? StoryDirection;
  const restricted = currentFacts(shaped)?.httpAccess === "controller";
  const openUrl =
    story.state === "live"
      ? (facts.domains?.address ?? shaped?.url ?? null)
      : null;
  const props: DirectionProps = {
    story,
    now,
    head: (
      <PageHead
        bar={chrome.bar}
        title="Deployment"
        name={story.name}
        openUrl={openUrl}
        restricted={restricted}
      />
    ),
    activity: busy ? chrome.activity : null,
    panel,
    onAsk,
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

export { scenarios };
