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

import type { PageChrome } from "./deployment-prototype/page-head";
import { FlowDirection } from "./backup-prototype/flow";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { storageFromRecords } from "./storage-records";
import "./backup-prototype/flow.css";
import { EmptySketch } from "./empty-sketch";

export function StoragePage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
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
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (!story.volumes.length)
    return (
      <div className="ax-root" data-variant="flow">
        {head}
        <div className="hv-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a volume for this application. That is not a claim
            that it stores nothing, and it is not a claim that it stores nothing
            durably — it means Hallvi has not checked which of the two is true.
          </p>
          <p>
            It matters: a container with no volume loses everything it wrote the
            moment it is replaced, and a container with one does not. Only a
            check can tell them apart.
          </p>
          <button
            type="button"
            className="hv-primary-button"
            onClick={() =>
              onAsk(
                "Where does this application keep data that has to survive the container being replaced, and does it actually survive?",
              )
            }
          >
            Ask Hallvi what is on disk
          </button>
          <EmptySketch kind="flow" />
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
