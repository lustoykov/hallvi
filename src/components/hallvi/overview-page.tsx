"use client";

// Overview, on real records.
//
// The accepted design draws it when Pi has recorded a map. Without one there
// is still an honest page to draw — what wants you, what is true, what
// happened — so this renders that rather than a diagram of nothing or a wall
// of cards.

import { useMemo } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type { ApplicationRecord, ChatSummary } from "@/server/types";

import { architectureFromRecords } from "./architecture-records";
import type { PageChrome } from "./deployment-prototype/page-head";
import type { LiveRecord } from "./architecture-prototype/model";
import type { Recheck } from "./architecture-prototype/use-recheck";
import type { ApplicationSection } from "./application-sections";
import type { Reachability } from "./deployment-prototype/page-head";
import {
  applicationCondition,
  logFromRecords,
  overviewFromRecords,
} from "./overview-records";
import { usageFromRecords } from "./monitoring-records";
import { OverviewLive } from "./overview-live/overview-live";
import { OverviewDirection } from "./overview-prototype/overview";
import { timelineFromRecords } from "./overview-timeline-records";
import { Tag } from "./presentation";
import "./overview-prototype/overview.css";
import "./overview-plain.css";

const idle: Recheck = {
  phase: "idle",
  marks: {},
  active: null,
  run: () => undefined,
  reset: () => undefined,
};

const tone = {
  verified: "verified",
  stale: "stale",
  failed: "failed",
  warning: "stale",
  absent: "absent",
  unknown: "unknown",
  planned: "unknown",
} as const;

export function overviewReturnVisit(
  records: SavedInformation[],
  application: ApplicationRecord,
) {
  const current = records.filter(
    (record) => !record.retiredAt && record.applicationId === application.id,
  );
  const deployments = current.filter(
    (record) => record.presentation?.content?.kind === "deployment",
  );
  const latestDeployment = deployments.toSorted(
    (a, b) =>
      Date.parse(b.establishedAt ?? b.createdAt) -
      Date.parse(a.establishedAt ?? a.createdAt),
  )[0];
  const hasData = current.some((record) => {
    const ref = record.presentation?.states?.ref;
    return ref?.kind === "database" || ref?.kind === "volume";
  });

  if (latestDeployment?.presentation?.status === "verified")
    return {
      deployed: true,
      stage: "Deployed",
      title: "A verified deployment is on record",
      detail:
        "Any condition below is the last recorded check, not continuous monitoring. Unfinished work stays visible here.",
      draft: "Check the application now and record what you find.",
      action: "Check it again",
    };

  if (latestDeployment) {
    const status = latestDeployment.presentation?.status;
    if (status === "failed")
      return {
        deployed: false,
        stage: "Deployment needs attention",
        title: "The latest deployment record reports a failure",
        detail:
          "The earlier result may no longer describe the application. Continue from the latest recorded problem.",
        draft:
          latestDeployment.presentation?.nextStep ??
          "Investigate the latest failed deployment, explain what stopped it, and continue safely if it is recoverable.",
        action: "Resolve the deployment problem",
      };
    if (status === "warning")
      return {
        deployed: false,
        stage: "Deployment has a limit",
        title: "The latest deployment record needs review",
        detail:
          "A deployment is recorded, with a limitation that should be understood before treating it as finished.",
        draft:
          latestDeployment.presentation?.nextStep ??
          "Review the limitation on the latest deployment, explain its impact, and recommend the safest continuation.",
        action: "Review the deployment",
      };
    return {
      deployed: false,
      stage: "Deployment recorded",
      title: "The working result has not been verified",
      detail:
        "Hallvi has a deployment record, but no verified application result. Continue from that recorded work.",
      draft:
        "Continue from the recorded deployment, verify that the application works from its intended access path, and record the result.",
      action: "Verify the deployment",
    };
  }

  const source = application.repositoryUrl;
  return {
    deployed: false,
    stage: application.host ? "Server recorded" : "Setup started",
    title: "No deployment is recorded yet",
    detail: application.host
      ? `The repository and server settings are stored${hasData ? ", and application data has been identified" : ""}. Hallvi has not recorded a deployment result.`
      : "The repository is stored. Continue by choosing or connecting an application server.",
    draft: application.host
      ? `Continue setting up ${source} using the stored server settings. Verify access, inspect what it needs${hasData ? ", preserve the application data already identified," : ""} and deploy it. Ask before any decision that needs me.`
      : `Continue setting up ${source}. Work out what it needs, then help me connect an appropriate application server.`,
    action: application.host ? "Continue setup" : "Choose a server",
  };
}

export function OverviewPage({
  records,
  executions,
  application,
  chats,
  now,
  chrome,
  reduced,
  reachable = "checking",
  onReopen,
  onOpenConversation,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  application: ApplicationRecord;
  chats: ChatSummary[];
  now: number;
  chrome: PageChrome;
  reduced: boolean;
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const model = useMemo(
    () =>
      architectureFromRecords({
        records,
        applicationId: application.id,
        applicationName: application.name,
        now,
      }),
    [records, application.id, application.name, now],
  );
  const built = useMemo(
    () =>
      overviewFromRecords({
        records,
        executions,
        chats,
        applicationId: application.id,
        applicationName: application.name,
        headline: model?.headline ?? application.name,
        now,
        accessClosed: reachable === "closed",
        onOpenConversation,
      }),
    [
      records,
      executions,
      chats,
      application.id,
      application.name,
      model?.headline,
      now,
      reachable,
      onOpenConversation,
    ],
  );
  const timeline = useMemo(
    () => timelineFromRecords({ records, now }),
    [records, now],
  );
  const condition = useMemo(
    () => applicationCondition(records, application.id, now),
    [records, application.id, now],
  );
  const returnVisit = useMemo(
    () => overviewReturnVisit(records, application),
    [records, application],
  );
  const usage = useMemo(
    () => usageFromRecords(records, application.id),
    [records, application.id],
  );

  // Where the application answers, from the record that says so.
  const openUrl =
    records
      .filter((record) => !record.retiredAt)
      .find(
        (record) =>
          record.presentation?.content?.kind === "application-access" &&
          record.presentation.url,
      )?.presentation?.url ?? null;

  // Deployed: the page is what is happening now, around what is recorded.
  // Everything before that is still a journey, and keeps its own pages.
  if (returnVisit.deployed)
    return (
      <OverviewLive
        applicationId={application.id}
        name={application.name}
        title={model?.headline ?? application.name}
        mapped={Boolean(model)}
        built={built}
        usage={usage}
        condition={condition}
        now={now}
        chrome={chrome}
        openUrl={openUrl}
        restricted={model?.restricted ?? false}
        reachable={reachable}
        onReopen={onReopen}
        onAsk={onAsk}
        onOpenDestination={onOpenDestination}
      />
    );

  if (model) {
    const live: LiveRecord = { application };
    return (
      <div className="hv-section-page hv-section-overview">
        <OverviewDirection
          model={{ ...model, condition, log: logFromRecords(records) }}
          record={live}
          built={built}
          timeline={timeline}
          recheck={idle}
          operations={[]}
          chats={chats}
          reduced={reduced}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={onAsk}
          page={{
            chrome,
            openUrl,
            reachable,
            onReopen,
            busy: false,
            last: null,
            earlier: 0,
          }}
        />
        {!returnVisit.deployed && (
          <section className="hv-overview-resume" aria-label="Continue setup">
            <div>
              <span>{returnVisit.stage}</span>
              <b>{returnVisit.title}</b>
              <p>{returnVisit.detail}</p>
            </div>
            <button
              type="button"
              className="hv-primary-button"
              onClick={() => onAsk(returnVisit.draft)}
            >
              {returnVisit.action}
            </button>
          </section>
        )}
      </div>
    );
  }

  // No map on record. Everything else still reads, so it is drawn.
  return (
    <div className="hv-section-page hv-section-overview">
      {chrome.bar}
      {chrome.header}
      <div className="hv-section-content">
        <div className="hv-overview-plain">
          <section
            className="hv-overview-stage"
            aria-labelledby="overview-stage-title"
          >
            <span>{returnVisit.stage}</span>
            <h2 id="overview-stage-title">{returnVisit.title}</h2>
            <p>{returnVisit.detail}</p>
            <button
              type="button"
              className="hv-primary-button"
              onClick={() => onAsk(returnVisit.draft)}
            >
              {returnVisit.action}
            </button>
          </section>

          {condition.certainty !== "unknown" && (
            <p className="hv-overview-condition">
              <Tag tone={tone[condition.certainty]}>
                {condition.certainty === "verified"
                  ? "Verified"
                  : condition.certainty === "stale"
                    ? "Out of date"
                    : condition.certainty === "failed"
                      ? "Failed"
                      : condition.certainty === "warning"
                        ? "Limited"
                        : "Not assessed"}
              </Tag>
              {condition.text}
            </p>
          )}

          {built.needs.length > 0 && (
            <section>
              <h2>What wants you</h2>
              <ul>
                {built.needs.map((need) => (
                  <li key={need.id} data-tone={need.tone}>
                    <b>{need.title}</b>
                    <span>{need.detail}</span>
                    {need.primary.draft && (
                      <button
                        type="button"
                        onClick={() => onAsk(need.primary.draft!)}
                      >
                        {need.primary.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(returnVisit.deployed ||
            built.vitals.some(
              (vital) => vital.status.certainty !== "unknown",
            )) && (
            <section>
              <h2>What has been assessed</h2>
              <ul className="hv-overview-vitals">
                {built.vitals
                  .filter(
                    (vital) =>
                      returnVisit.deployed ||
                      vital.status.certainty !== "unknown",
                  )
                  .map((vital) => (
                    <li key={vital.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDestination(vital.destination)}
                      >
                        <Tag tone={tone[vital.status.certainty]}>
                          {vital.value}
                        </Tag>
                        <b>{vital.label}</b>
                        <span>{vital.status.text}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {returnVisit.deployed && (
            <section>
              <h2>How this fits together</h2>
              <p>
                The deployment is recorded, but its architecture has not been
                mapped yet.
              </p>
              <button
                type="button"
                onClick={() =>
                  onAsk(
                    "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                  )
                }
              >
                Ask Hallvi to map this application
              </button>
            </section>
          )}

          {built.recent.length > 0 && (
            <section>
              <h2>What happened</h2>
              <ul className="hv-overview-recent">
                {built.recent.map((item) => (
                  <li key={item.id}>
                    <b>{item.title}</b>
                    <span>{item.when}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
