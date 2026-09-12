"use client";

// Deployment, on real records and real executions.
//
// The accepted Transit design, fed by what Pi recorded about the release and
// what the controller recorded about the commands that produced it. It has
// four states worth drawing and they are all reachable here: nothing
// deployed, a decision waiting, work running, and a release that either holds
// or failed.

import { useMemo } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { deploymentFromRecords } from "./deployment-records";
import { PageHead } from "./deployment-prototype/page-head";
import { TransitDirection } from "./deployment-prototype/transit";
import "./deployment-prototype/transit.css";

export function DeploymentPage({
  records,
  executions,
  applicationName,
  now,
  chrome,
  panel,
  onOpenConversation,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  applicationName: string;
  now: number;
  chrome: PageChrome;
  panel?: React.ReactNode;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () =>
      deploymentFromRecords({ records, executions, applicationName, now }),
    [records, executions, applicationName, now],
  );
  const access = records
    .filter((record) => !record.retiredAt)
    .find(
      (record) => record.presentation?.content?.kind === "application-access",
    );
  const content = access?.presentation?.content;
  const restricted =
    content?.kind === "application-access" ? content.mode === "private" : false;

  return (
    <div className="ax-root" data-variant="transit">
      <TransitDirection
        story={story}
        now={now}
        head={
          <PageHead
            bar={chrome.bar}
            title="Deployment"
            name={story.name}
            // Offered only while a release is standing; a failed or
            // unfinished one has nothing to open.
            openUrl={
              story.state === "live"
                ? (access?.presentation?.url ?? null)
                : null
            }
            restricted={restricted}
          />
        }
        activity={
          story.state === "working" || story.state === "awaiting"
            ? chrome.activity
            : null
        }
        panel={panel}
        onAsk={onAsk}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
