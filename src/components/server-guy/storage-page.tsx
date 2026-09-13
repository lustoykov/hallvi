"use client";

// Storage, on real records.
//
// The accepted Flow design. Its empty state is the one the old page got
// wrong: it printed a confident "no volumes" from a model nothing populated,
// which is the most expensive kind of wrong — a container without a volume
// loses its data when it is replaced, and a reader who was told there were
// none had been told the opposite of "nobody checked".

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";
import { currentFacts, subjectsOfKind } from "@/server/record-projection";

import type { PageChrome } from "./architecture-prototype/index";
import { FlowDirection } from "./backup-prototype/flow";
import { PageHead } from "./deployment-prototype/page-head";
import { storageFromRecords } from "./storage-records";
import "./backup-prototype/flow.css";

export function StoragePage({
  records,
  applicationId,
  applicationName,
  now,
  chrome,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  chrome: PageChrome;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => storageFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const server = useMemo(() => {
    const live = records.filter((record) => !record.retiredAt);
    const host = subjectsOfKind(live, "host")[0];
    if (!host) return null;
    const facts = currentFacts(live, host);
    return {
      label: host.id,
      city: facts.get("region")?.value.value ?? null,
    };
  }, [records]);

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Storage"
      name={applicationName}
      openUrl={null}
      restricted={false}
    />
  );

  if (!story.volumes.length)
    return (
      <div className="ax-root" data-variant="flow">
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a volume for this application. That is not a claim
            that it stores nothing, and it is not a claim that it stores nothing
            durably — it means Server Guy has not checked which of the two is
            true.
          </p>
          <p>
            It matters: a container with no volume loses everything it wrote the
            moment it is replaced, and a container with one does not. Only a
            check can tell them apart.
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                "Where does this application keep data that has to survive the container being replaced, and does it actually survive?",
              )
            }
          >
            Ask Pi what is on disk
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant="flow">
      <FlowDirection
        story={story}
        now={now}
        head={head}
        activity={null}
        server={server}
        onAsk={onAsk}
      />
    </div>
  );
}
