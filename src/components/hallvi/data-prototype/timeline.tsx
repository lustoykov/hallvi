"use client";

// Database: its check, its copies off the server and its restore tests, each
// as a rail to now (see ../lane-rails). Little Server stands on the card.

import {
  Archive,
  ArrowCounterClockwise,
  ChatCircleText,
  Heartbeat,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { LaneRails } from "../lane-rails";
import { when } from "../stack-prototype/stack-model";
import type { Mark } from "./data-model";
import type { DataProps } from "./data-story";
import "./timeline.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const day = (at: number | string) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
function lasting(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** Each lane as the question an owner would ask, and what it covers. */
const laneWords: Record<string, [question: string, plain: string]> = {
  health: [
    "Does the database answer?",
    "Hallvi connects to it and runs a tiny test query.",
  ],
  copies: [
    "Is there a copy off the server?",
    "A backup file stored somewhere else, so losing the server does not lose the data.",
  ],
  restores: [
    "Would a copy actually restore?",
    "A backup only counts once one has been opened and loaded successfully.",
  ],
};

interface Lane {
  id: string;
  icon: ReactNode;
  name: string;
  status: string;
  c: "verified" | "stale" | "failed" | "absent" | "fact";
  marks: Mark[];
  /** The stretch since this last happened, once it is overdue. */
  gap: { from: string; words: string } | null;
  ghost: string | null;
  action: { label: string; run: () => void };
}

export function TimelineDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: DataProps) {
  const store = story.database;
  const guard = story.protection;
  const copyAt = story.newestCopyAt;
  const checked = store?.probe?.at ?? null;
  const owner = store?.owner ?? "The application";
  const overdue = (at: string) => now - Date.parse(at) >= FRESH_MS;
  const marksOf = (lane: Mark["lane"]) =>
    story.marks.filter((mark) => mark.lane === lane);
  const toBackups = {
    label: "Open Backups",
    run: () => onOpenDestination("backups"),
  };

  const lanes: Lane[] = [
    {
      id: "health",
      icon: <Heartbeat weight="bold" />,
      name: "Database check",
      status: checked
        ? `Passed ${when(checked)}`
        : store?.firstFailure
          ? "Failed"
          : "No check reads it",
      c: checked
        ? overdue(checked)
          ? "stale"
          : "verified"
        : store?.firstFailure
          ? "failed"
          : "absent",
      marks: marksOf("health"),
      gap:
        checked && overdue(checked)
          ? {
              from: checked,
              words: `No check for ${lasting(now - Date.parse(checked))}`,
            }
          : null,
      ghost: marksOf("health").length ? null : "No check reads the database",
      action: {
        label: "Ask Hallvi to check it now",
        run: () => onAsk(`Check that ${owner}'s database is healthy now.`),
      },
    },
    {
      id: "copies",
      icon: <Archive weight="bold" />,
      name: "Copies off the server",
      status: copyAt ? `Newest ${when(copyAt)}` : "None on record",
      c: copyAt ? (overdue(copyAt) ? "stale" : "verified") : "absent",
      marks: marksOf("copies"),
      gap:
        copyAt && overdue(copyAt)
          ? {
              from: copyAt,
              words: `No copy on record for ${lasting(now - Date.parse(copyAt))}`,
            }
          : null,
      ghost: marksOf("copies").length ? null : "No copy on record",
      action: toBackups,
    },
    {
      id: "restores",
      icon: <ArrowCounterClockwise weight="bold" />,
      name: "Restore tests",
      status: guard.restore
        ? `Passed ${when(guard.restore.at)}`
        : "Not run yet",
      c: guard.restore ? "fact" : "absent",
      marks: marksOf("restores"),
      gap: null,
      ghost: guard.restore ? null : "No restore test yet",
      action: toBackups,
    },
  ];

  const say = copyAt
    ? `${owner}'s database was last copied off the server on ${day(copyAt)}.`
    : `${owner}'s database has no copy off the server on record.`;
  const sub = [
    checked && `It last passed its check ${when(checked)}`,
    guard.restore && `a restore test passed ${when(guard.restore.at)}`,
  ]
    .filter(Boolean)
    .join(", and ")
    .concat(checked || guard.restore ? ". Nothing newer is on record." : "");
  const note = `As recorded: nothing here is observed live.${guard.schedule ? ` ${guard.schedule.words.split(",")[0]} are scheduled, so newer copies may exist; none is on record here.` : ""}`;

  return (
    <section className="axdt" aria-label="Database">
      {head}
      {activity}
      <div className="axdt-lede">
        <div>
          <h2 className="axdt-say">{say}</h2>
          {sub && <p className="axdt-sub">{sub}</p>}
        </div>
        <button
          type="button"
          className="ax-button axdt-ask"
          onClick={() =>
            onAsk(`Back up ${owner}'s database now and verify the copy.`)
          }
        >
          <ChatCircleText weight="bold" />
          Ask Hallvi to back it up now
        </button>
      </div>

      <LaneRails
        now={now}
        mascot={<LittleServer mood={moodOf[story.tone]} className="axdt-guy" />}
        lanes={lanes.map((lane) => ({
          id: lane.id,
          icon: lane.icon,
          name: lane.name,
          question: laneWords[lane.id][0],
          plain: laneWords[lane.id][1],
          status: lane.status,
          tone: lane.c,
          ghost: lane.ghost,
          action: lane.action,
          events: lane.marks
            .map((mark) => ({
              id: mark.id,
              at: Date.parse(mark.at),
              tone:
                mark.tone === "fail"
                  ? ("fail" as const)
                  : mark.tone === "set"
                    ? ("info" as const)
                    : ("pass" as const),
              title: mark.title,
              detail: mark.detail,
            }))
            .sort((a, b) => a.at - b.at),
        }))}
      />
      <p className="axdt-note">{note}</p>
    </section>
  );
}
