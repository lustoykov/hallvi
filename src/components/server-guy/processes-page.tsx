"use client";

// Processes, on real records.
//
// The accepted Line design, fed by the `process` subjects Pi stated. Its
// empty state is the one that matters: nothing recorded is not "no
// processes", it is nobody looked, and the page says so and offers the one
// question that would change it.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { PageHead } from "./deployment-prototype/page-head";
import { processesFromRecords } from "./processes-records";
import { LineDirection } from "./stack-prototype/line";
import "./deployment-prototype/transit.css";
import "./stack-prototype/line.css";

export function ProcessesPage({
  records,
  applicationId,
  applicationName,
  now,
  chrome,
  onOpenConversation,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  chrome: PageChrome;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => processesFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const access = records
    .filter((record) => !record.retiredAt)
    .find(
      (record) => record.presentation?.content?.kind === "application-access",
    );

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Processes"
      name={applicationName}
      openUrl={
        story.state === "running" ? (access?.presentation?.url ?? null) : null
      }
      restricted={story.restricted}
    />
  );

  if (story.state === "none")
    return (
      <div className="ax-root" data-variant="line">
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a process for this application. That is not a claim
            that it runs nothing — only that Server Guy has not checked, or has
            not written down what it found.
          </p>
          <p>
            Once it has, each process appears here with what it runs, how a
            visit reaches it, every check that touched it and when.
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                "What processes is this application running, and is each one healthy right now?",
              )
            }
          >
            Ask Pi what is running
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant="line">
      <LineDirection
        story={story}
        head={head}
        activity={null}
        onAsk={onAsk}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
