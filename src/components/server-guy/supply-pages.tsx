"use client";

// Cache & queue, Jobs, Environment Variables and CDN, on real records.
//
// Four small pages over one projection. Each draws its accepted design when
// there is something to draw, and its own honest empty state when there is
// not — and the empty states differ, because the four questions differ. "No
// cache is recorded" invites a recommendation; "nothing has looked at whether
// a CDN sits in front" does not, because that would be answering it.

import { useMemo, type ReactNode } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { PageHead } from "./deployment-prototype/page-head";
import type { SecretRequest } from "./secret-request";
import { supplyFromRecords } from "./supply-records";
import { ManifestDirection } from "./supply-prototype/manifest";
import { OriginDirection } from "./supply-prototype/origin";
import { QueueDirection } from "./supply-prototype/queue";
import { RotaDirection } from "./supply-prototype/rota";
import "./supply-prototype/manifest.css";
import "./supply-prototype/origin.css";
import "./supply-prototype/queue.css";
import "./supply-prototype/rota.css";

const titles: Record<SupplyPage, string> = {
  cache: "Cache & queue",
  jobs: "Jobs",
  variables: "Environment Variables",
  cdn: "CDN",
};

export type SupplyPage = "cache" | "jobs" | "variables" | "cdn";

export function SupplyPageView({
  page,
  records,
  applicationId,
  applicationName,
  secrets,
  now,
  reachable = true,
  chrome,
  onOpenDestination,
  onAsk,
}: {
  page: SupplyPage;
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  secrets: SecretRequest[];
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: boolean;
  chrome: PageChrome;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () =>
      supplyFromRecords({
        records,
        applicationId,
        applicationName,
        secrets,
        now,
      }),
    [records, applicationId, applicationName, secrets, now],
  );

  const head = (
    <PageHead
      bar={chrome.bar}
      title={titles[page]}
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
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

  // Whether the page has anything of its own. The CDN page is the exception:
  // "nothing caches in front" is worth drawing, so it always draws — its own
  // copy carries the difference between absent and unlooked-at.
  const has: Record<SupplyPage, boolean> = {
    cache: story.brokers.length > 0 || story.queues.length > 0,
    jobs: story.jobs.length > 0 || story.recurring.length > 0,
    variables: story.values.length > 0 || story.waiting.length > 0,
    cdn: true,
  };
  if (!has[page])
    return (
      <div className="ax-root" data-variant={page}>
        {head}
        <Nothing page={page} name={applicationName} onAsk={onAsk} />
      </div>
    );

  return (
    <div className="ax-root" data-variant={page}>
      {page === "cache" && <QueueDirection {...props} />}
      {page === "jobs" && <RotaDirection {...props} />}
      {page === "variables" && <ManifestDirection {...props} />}
      {page === "cdn" && <OriginDirection {...props} />}
    </div>
  );
}

function Nothing({
  page,
  name,
  onAsk,
}: {
  page: SupplyPage;
  name: string;
  onAsk: (draft: string) => void;
}) {
  const copy: Record<
    SupplyPage,
    { title: string; body: ReactNode; button: string; draft: string }
  > = {
    cache: {
      title: "Nothing here has been looked at yet.",
      body: (
        <>
          No record names a cache or a queue for {name}. That is not a claim it
          has none — it means nobody has checked, and an application quietly
          filling a queue nobody reads looks exactly like one with no queue at
          all.
        </>
      ),
      button: "Ask Pi what it queues",
      draft: `Does ${name} use a cache or a queue? If it does, say what is in it right now; if it does not, say so plainly.`,
    },
    jobs: {
      title: "Nothing here has been looked at yet.",
      body: (
        <>
          No record names anything that runs on a schedule. Work that repeats
          and stops repeating is the kind of failure nobody notices for weeks,
          so the honest reading is that this has not been checked rather than
          that there is nothing to check.
        </>
      ),
      button: "Ask Pi what runs on a schedule",
      draft: `What does ${name} run on a schedule — cron jobs, timers, anything recurring — and did each one last succeed?`,
    },
    variables: {
      title: "No configuration has been recorded.",
      body: (
        <>
          Nothing names an environment variable for {name}. When something does,
          this page shows the name, where the value came from and whether one is
          established — never the value, which is not stored anywhere a page can
          reach.
        </>
      ),
      button: "Ask Pi what it needs to run",
      draft: `What configuration does ${name} need to build and run, and where does each value come from?`,
    },
    cdn: { title: "", body: null, button: "", draft: "" },
  };
  const said = copy[page];
  return (
    <div className="sg-deploy-none">
      <h2>{said.title}</h2>
      <p>{said.body}</p>
      <button
        type="button"
        className="sg-primary-button"
        onClick={() => onAsk(said.draft)}
      >
        {said.button}
      </button>
    </div>
  );
}
