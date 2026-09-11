// PROTOTYPE · claude/architecture-directions · throwaway.
// The last day and a half and the next half day, as four lanes: when Server
// Guy checked the application, copied the data, reached the server and read
// the firewall, and what is scheduled next. Built from recorded events only;
// the failing scenario and the simulated re-check add lines marked invented.

import type {
  ArchitectureModel,
  CheckMark,
  LiveRecord,
  LogLine,
} from "../architecture-prototype/model";
import { nextCopy, type Vital } from "./overview-model";

export type LaneId = Vital["id"];
export type EventTone = "pass" | "fail" | "info" | "planned" | "checking";

export interface TimeEvent {
  id: string;
  at: number;
  tone: EventTone;
  title: string;
  /** The recorded lines behind it, for its console. */
  lines: LogLine[];
  invented: boolean;
}

export interface Lane {
  id: LaneId;
  events: TimeEvent[];
  /** The newest thing that happened, even before the window. */
  lastAt: number | null;
}

export interface Timeline {
  start: number;
  end: number;
  now: number;
  lanes: Lane[];
}

const HOUR = 3_600_000;
/** Moments closer than this become one event. */
const TOGETHER = 30 * 60_000;

/** Which lane a part's checks belong to. */
export function laneOf(partId: string): LaneId {
  if (partId === "host") return "server";
  if (partId.startsWith("gate:") || partId === "tls") return "access";
  if (partId === "offsite" || partId.startsWith("vol:")) return "backups";
  return "checks";
}

interface Moment {
  at: number;
  tone: EventTone;
  line: LogLine;
}

function toneOf(moments: Moment[]): EventTone {
  const tones = moments.map((moment) => moment.tone);
  if (tones.includes("fail")) return "fail";
  if (tones.includes("checking")) return "checking";
  if (tones.includes("pass")) return "pass";
  if (tones.includes("planned")) return "planned";
  return "info";
}

function titleOf(lane: LaneId, tone: EventTone, moments: Moment[]) {
  const texts = moments.map((moment) => moment.line.text);
  if (tone === "checking") return "Checking now";
  if (tone === "planned") return "Next copy";
  switch (lane) {
    case "checks": {
      if (tone === "fail") return "A check failed";
      const passed = moments.filter((moment) => moment.tone === "pass").length;
      return passed > 1 ? `${passed} checks passed` : "Check passed";
    }
    case "backups": {
      const restore = texts.some((text) => text.startsWith("Restore test"));
      const copy = texts.some((text) => text.startsWith("Copy"));
      if (tone === "fail") return "A copy failed";
      return restore && copy
        ? "Copy and restore test"
        : restore
          ? "Restore test"
          : "Copy verified";
    }
    case "server":
      return tone === "fail"
        ? "Couldn't reach the server"
        : "Reached the server";
    case "access":
      return texts.some((text) => text.startsWith("HTTP restricted"))
        ? "Port 80 limited to your network"
        : "Firewall read from Hetzner";
  }
}

function gather(lane: LaneId, moments: Moment[]): TimeEvent[] {
  const groups: Moment[][] = [];
  for (const moment of [...moments].sort((a, b) => a.at - b.at)) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (
      group &&
      last &&
      last.tone !== "planned" &&
      moment.tone !== "planned" &&
      moment.at - last.at < TOGETHER
    )
      group.push(moment);
    else groups.push([moment]);
  }
  return groups.map((group) => {
    const tone = toneOf(group);
    const last = group[group.length - 1];
    return {
      id: `${lane}:${last.line.id}`,
      at: last.at,
      tone,
      title: titleOf(lane, tone, group),
      lines: group.map((moment) => moment.line),
      invented: group.some((moment) => moment.line.invented),
    };
  });
}

export function buildTimeline({
  model,
  record,
  live,
  marks,
}: {
  model: ArchitectureModel;
  record: LiveRecord;
  live: LogLine[];
  marks: Record<string, CheckMark>;
}): Timeline {
  const now = model.now;
  const start = now - 36 * HOUR;
  const end = now + 14 * HOUR;
  const moments: Record<LaneId, Moment[]> = {
    checks: [],
    backups: [],
    server: [],
    access: [],
  };
  const add = (
    lane: LaneId,
    at: string | null | undefined,
    tone: EventTone,
    text: string,
    id: string,
    invented = false,
  ) => {
    const time = at ? Date.parse(at) : NaN;
    if (Number.isNaN(time)) return;
    moments[lane].push({
      at: time,
      tone,
      line: {
        id,
        at: at!,
        tone:
          tone === "pass"
            ? "pass"
            : tone === "fail"
              ? "fail"
              : tone === "checking"
                ? "work"
                : "info",
        text,
        invented,
      },
    });
  };

  if (model.status === "live") {
    (record.deployment?.events ?? []).forEach((event, i) => {
      const message = event.message;
      if (/^Passed: |^Verified private /.test(message))
        add("checks", event.at, "pass", message, `event:${i}`);
      else if (/timed out|failed/i.test(message))
        add("checks", event.at, "fail", message, `event:${i}`);
      else if (message.startsWith("HTTP restricted"))
        add("access", event.at, "pass", message, `event:${i}`);
    });
    add(
      "server",
      record.deployment?.verifiedAt,
      "pass",
      "The server answered during the deployment",
      "deploy:host",
    );

    const protection = record.facts.protection;
    const seen = protection?.observation;
    if (seen?.at)
      add(
        "server",
        seen.at,
        seen.reachable ? "pass" : "fail",
        seen.reachable
          ? `Reached the server and read the backup timer${seen.timerActive ? ": active" : ""}`
          : "Couldn't reach the server",
        "observation",
      );
    for (const entry of protection?.history ?? []) {
      const name =
        entry.kind === "backup"
          ? "Copy"
          : entry.kind === "restore-test"
            ? "Restore test"
            : entry.kind === "policy"
              ? "Schedule"
              : "Upload";
      add(
        "backups",
        entry.at,
        entry.outcome === "succeeded"
          ? "pass"
          : entry.outcome === "failed"
            ? "fail"
            : "info",
        `${name}: ${entry.detail}`,
        `protection:${entry.id}`,
      );
    }
    const next = nextCopy(record, now);
    if (next && protection?.policy)
      add(
        "backups",
        next,
        "planned",
        `Scheduled: ${protection.policy.schedule} (${protection.policy.timezone})`,
        "next",
      );

    // The firewall, as Hetzner reported it on this visit.
    const gate = model.byId["gate:http"];
    if (
      gate?.evidence.at &&
      gate.evidence.short.startsWith("Read") &&
      !gate.evidence.invented
    )
      add("access", gate.evidence.at, "pass", gate.evidence.detail, "firewall");

    // Invented by the failing scenario.
    for (const entry of model.log) {
      if (entry.id === "invented:collector")
        add("server", entry.at, "pass", entry.text, entry.id, true);
      if (entry.id === "invented:failure")
        add("checks", entry.at, "fail", entry.text, entry.id, true);
    }

    // The simulated re-check, at now: each part's newest line.
    for (const [partId, mark] of Object.entries(marks)) {
      const lines = live.filter((entry) => entry.id.includes(`:${partId}:`));
      const newest = lines[lines.length - 1];
      if (!newest) continue;
      moments[laneOf(partId)].push({
        at: now,
        tone:
          mark === "checking"
            ? "checking"
            : mark === "passed"
              ? "pass"
              : "fail",
        line: newest,
      });
    }
  }

  const lanes = (["checks", "backups", "server", "access"] as const).map(
    (id) => {
      const past = moments[id].filter(
        (moment) => moment.at <= now && moment.tone !== "planned",
      );
      return {
        id,
        events: gather(
          id,
          moments[id].filter(
            (moment) => moment.at >= start && moment.at <= end,
          ),
        ),
        lastAt: past.length
          ? Math.max(...past.map((moment) => moment.at))
          : null,
      };
    },
  );
  return { start, end, now, lanes };
}
