"use client";

// Domains and Security, on real records.
//
// Two questions over one projection. Domains asks what a visitor gets;
// Security asks what is let in at all. Their empty states differ for the same
// reason: a private deployment with no name is a complete answer to the
// first, and never an answer to the second.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { CallersDirection } from "./reach-prototype/callers";
import { PerimeterDirection } from "./reach-prototype/perimeter";
import { reachFromRecords } from "./reach-records";
import "./reach-prototype/callers.css";

export function ReachPageView({
  page,
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  panel,
  onOpenDestination,
  onAsk,
}: {
  page: "domains" | "security";
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
  chrome: PageChrome;
  panel?: React.ReactNode;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => reachFromRecords({ records, applicationId, applicationName, now }),
    [records, applicationId, applicationName, now],
  );

  const head = (
    <PageHead
      bar={chrome.bar}
      title={page === "domains" ? "Domains" : "Security"}
      name={applicationName}
      // Domains is the page a reader lands on to find the address, so it
      // offers it — under the same live answer every other page uses, which
      // for a published name is a request to the name itself.
      openUrl={page === "domains" ? story.address : null}
      restricted={story.audience === "controller"}
      reachable={reachable}
      onReopen={onReopen}
    />
  );
  const props = {
    story,
    now,
    head,
    activity: null,
    onAsk,
    onOpenDestination,
  };

  // Domains has something to say the moment an address exists; Security needs
  // a door, a firewall reading, or an SSH check before it can say anything at
  // all beyond "nobody has looked".
  const anything =
    page === "domains"
      ? Boolean(story.address) ||
        Boolean(story.domain) ||
        story.callers.length > 0
      : story.doors.length > 0 ||
        story.firewall.state !== "asked" ||
        story.ssh.tone !== "planned";

  if (!anything)
    return (
      <div className="ax-root" data-variant={page}>
        {head}
        <div className="sg-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            {page === "domains"
              ? `No name, no certificate and no address are on record for ${applicationName}. Nothing has established how anyone would reach it.`
              : `No record names a port, a firewall rule or an SSH check for ${applicationName}. That is not the same as nothing being able to reach in — it means nobody has found out.`}
          </p>
          <button
            type="button"
            className="sg-primary-button"
            onClick={() =>
              onAsk(
                page === "domains"
                  ? `What address does ${applicationName} answer on, and is there a name or a certificate in front of it?`
                  : `What can reach ${applicationName}'s server from outside, over which ports, and what is refusing everything else?`,
              )
            }
          >
            {page === "domains"
              ? "Ask Pi how it is reached"
              : "Ask Pi what can reach in"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="ax-root" data-variant={page}>
      {page === "domains" ? (
        <CallersDirection {...props} />
      ) : (
        <PerimeterDirection {...props} panel={panel} />
      )}
    </div>
  );
}
