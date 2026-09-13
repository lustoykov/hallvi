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
import type { PageChrome } from "./architecture-prototype/index";
import type { LiveRecord } from "./architecture-prototype/model";
import type { Recheck } from "./architecture-prototype/use-recheck";
import type { ApplicationSection } from "./application-sections";
import {
  applicationCondition,
  logFromRecords,
  overviewFromRecords,
} from "./overview-records";
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
  absent: "absent",
  unknown: "unknown",
  planned: "unknown",
} as const;

export function OverviewPage({
  records,
  executions,
  application,
  chats,
  now,
  chrome,
  reduced,
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

  // Where the application answers, from the record that says so.
  const openUrl =
    records
      .filter((record) => !record.retiredAt)
      .find(
        (record) =>
          record.presentation?.content?.kind === "application-access" &&
          record.presentation.url,
      )?.presentation?.url ?? null;

  if (model) {
    const live: LiveRecord = {
      application,
      deployment: null,
      facts: {},
      operations: [],
    };
    return (
      <div className="sg-section-page sg-section-overview">
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
          page={{ chrome, openUrl, busy: false, last: null, earlier: 0 }}
        />
      </div>
    );
  }

  // No map on record. Everything else still reads, so it is drawn.
  return (
    <div className="sg-section-page sg-section-overview">
      {chrome.bar}
      {chrome.header}
      <div className="sg-section-content">
        <div className="sg-overview-plain">
          <p className="sg-overview-condition">
            <Tag tone={tone[condition.certainty]}>
              {condition.certainty === "verified"
                ? "Verified"
                : condition.certainty === "stale"
                  ? "Out of date"
                  : condition.certainty === "failed"
                    ? "Failed"
                    : "Not assessed"}
            </Tag>
            {condition.text}
          </p>

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

          <section>
            <h2>What is true now</h2>
            <ul className="sg-overview-vitals">
              {built.vitals.map((vital) => (
                <li key={vital.id}>
                  <button
                    type="button"
                    onClick={() => onOpenDestination(vital.destination)}
                  >
                    <Tag tone={tone[vital.status.certainty]}>{vital.value}</Tag>
                    <b>{vital.label}</b>
                    <span>{vital.status.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>How this fits together</h2>
            <p>
              Nothing on record says what this application is made of, so the
              map above it is missing rather than empty.
            </p>
            <button
              type="button"
              className="sg-primary-button"
              onClick={() =>
                onAsk(
                  "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
                )
              }
            >
              Ask Pi to map this application
            </button>
          </section>

          {built.recent.length > 0 && (
            <section>
              <h2>What happened</h2>
              <ul className="sg-overview-recent">
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
