"use client";

// Deployment in Journeys' transit language (transit.tsx), on the real route
// and inside the real shell, showing only the live record. The product's own
// panel still handles the actions that need it (connecting Hetzner, starting
// a first deployment), and approval stays in the conversation. The
// exploration's variants and invented scenarios stay on claude/deployment-
// history; a production view never reshapes the record.

import { useMemo, type ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { operationsFor, unresolved } from "../operation-model";
import type { PageChrome } from "../architecture-prototype";
import { scenarios } from "../architecture-prototype/prototype-bar";
import { buildStory, type DeploymentStory } from "./deployment-model";
import { PageHead } from "./page-head";
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

export function DeploymentPrototype({
  record,
  operations,
  facts,
  chats,
  now,
  onOpenConversation,
  onOpenDestination,
  onAsk,
  chrome,
  panel,
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
  /** Retained for callers; the live view is the only one shown. */
  current?: ReactNode;
}) {
  const approvedIn =
    chats.find((chat) => chat.id === record?.chatId)?.title ?? null;
  const story = useMemo(
    () => buildStory({ record, operations, now, approvedIn }),
    [record, operations, now, approvedIn],
  );
  // The shell's activity cards only while work here is unsettled; settled
  // work is already on the line.
  const busy = operationsFor("deployment", operations).some(
    (operation) =>
      operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "proposed" ||
      (operation.state === "failed" && unresolved(operation, operations)),
  );
  const restricted = currentFacts(record)?.httpAccess === "controller";
  const openUrl =
    story.state === "live"
      ? (facts.domains?.address ?? record?.url ?? null)
      : null;
  return (
    <div className="ax-root" data-variant="transit" data-scenario="live">
      <TransitDirection
        story={story}
        now={now}
        head={
          <PageHead
            bar={chrome.bar}
            title="Deployment"
            name={story.name}
            openUrl={openUrl}
            restricted={restricted}
          />
        }
        activity={busy ? chrome.activity : null}
        panel={panel}
        onAsk={onAsk}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}

export { scenarios };
