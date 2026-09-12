"use client";

// Overview's hero timeline, from records.
//
// History and now. Tomorrow needs a recurrence Pi cannot yet write, so the
// window ends at the present rather than reserving space for a future nobody
// has established.
//
// A check reaches a lane only if it has both a lane and a time: an
// observation with no `establishedAt` established nothing, and putting it on a
// timeline would date it to the moment someone wrote it down.

import type { SavedInformation } from "@/server/operator-data";
import { checkAsNow, lane, type Lane as LaneId } from "@/server/record-projection";

import type { LogLine } from "./architecture-prototype/model";
import type {
  EventTone,
  Lane,
  TimeEvent,
  Timeline,
} from "./overview-prototype/timeline-model";

const HOUR = 3_600_000;
/** Observations closer together than this read as one moment. */
const TOGETHER = 30 * 60_000;

const tone: Record<string, EventTone> = {
  verified: "pass",
  failed: "fail",
  stale: "info",
  noted: "info",
  recorded: "info",
};

export function timelineFromRecords({
  records,
  now,
}: {
  records: SavedInformation[];
  now: number;
}): Timeline {
  const ids: LaneId[] = ["checks", "backups", "server", "access"];
  const moments: Record<LaneId, { at: number; tone: EventTone; line: LogLine }[]> = {
    checks: [],
    backups: [],
    server: [],
    access: [],
  };

  for (const record of records) {
    if (record.retiredAt || !record.establishedAt) continue;
    const at = Date.parse(record.establishedAt);
    if (!Number.isFinite(at)) continue;
    for (const check of record.presentation?.checks ?? []) {
      const id = lane(check, record);
      if (!id) continue;
      const reading = checkAsNow(check, record, now);
      moments[id].push({
        at,
        tone: tone[reading] ?? "info",
        line: {
          id: `${record.id}:${check.key ?? check.label}`,
          at: record.establishedAt,
          tone:
            reading === "failed" ? "fail" : reading === "verified" ? "pass" : "info",
          text: check.detail ? `${check.label} — ${check.detail}` : check.label,
        },
      });
    }
  }

  const lanes: Lane[] = ids.map((id) => {
    const sorted = [...moments[id]].sort((a, b) => a.at - b.at);
    const events: TimeEvent[] = [];
    for (const moment of sorted) {
      const last = events.at(-1);
      if (last && moment.at - last.at < TOGETHER) {
        last.lines.push(moment.line);
        // A failure in a gathered moment is what the moment says.
        if (moment.tone === "fail") last.tone = "fail";
        else if (last.tone !== "fail" && moment.tone === "pass")
          last.tone = "pass";
        last.title =
          last.lines.length > 1
            ? `${last.lines.length} checks`
            : last.lines[0].text;
        continue;
      }
      events.push({
        id: moment.line.id,
        at: moment.at,
        tone: moment.tone,
        title: moment.line.text,
        lines: [moment.line],
        invented: false,
      });
    }
    return {
      id,
      events,
      lastAt: sorted.at(-1)?.at ?? null,
    };
  });

  // The window holds what there is, with a day and a half as the floor so a
  // single observation does not fill the whole hero.
  const earliest = lanes
    .flatMap((item) => item.events.map((event) => event.at))
    .sort((a, b) => a - b)
    .at(0);
  const span = earliest ? Math.max(now - earliest, 36 * HOUR) : 36 * HOUR;
  return { start: now - span, end: now, now, lanes };
}
