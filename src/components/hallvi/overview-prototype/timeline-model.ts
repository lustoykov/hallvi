// The last day and a half and the next half day, as four lanes: when Hallvi
// checked the application, copied the data, reached the server and read the
// firewall, and what is scheduled next. `timelineFromRecords` builds it from
// recorded events only.

import type { LogLine } from "../architecture-prototype/model";
import type { Vital } from "./overview-model";

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

/** Which lane a part's checks belong to. */
export function laneOf(partId: string): LaneId {
  if (partId === "host") return "server";
  if (partId.startsWith("gate:") || partId === "tls") return "access";
  // Only an off-site copy speaks to Backups. A volume belongs to the
  // application: surviving a restart is the application keeping its own data,
  // and nothing was copied anywhere — pointing at one used to light the
  // Backups lane on the strength of a check that never touched a backup.
  if (partId === "offsite") return "backups";
  return "checks";
}
