// Local days and hours, and how much of them the log covered.
//
// A day is cut in the controller's time zone and carries that zone, so a
// stored day means the same stretch of time after the controller moves.
// Hours are real hours counted from the day's first moment: a day that
// changes the clocks has 23 or 25 of them, and none is stretched or squeezed
// to make the clock face come out even.

import type { Coverage } from "./contract";

export const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Where the controller is. Days are cut here, and stored with it. */
export function controllerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formats = new Map<string, Intl.DateTimeFormat>();
function wallClock(at: number, timeZone: string) {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(timeZone, format);
  }
  const part: Record<string, number> = {};
  for (const { type, value } of format.formatToParts(at))
    if (type !== "literal") part[type] = Number(value);
  return part;
}

/** The zone's offset from UTC at that moment, in milliseconds. */
function offsetAt(at: number, timeZone: string) {
  const { year, month, day, hour, minute, second } = wallClock(at, timeZone);
  const wall = Date.UTC(year, month - 1, day, hour % 24, minute, second);
  return wall - Math.floor(at / 1000) * 1000;
}

/** The local date of a moment, `YYYY-MM-DD`. */
export function dayOf(at: number, timeZone: string) {
  const { year, month, day } = wallClock(at, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The date `count` days after (or before) `day`. */
export function addDays(day: string, count: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count))
    .toISOString()
    .slice(0, 10);
}

/**
 * The first moment of a local day. Midnight can be skipped (the clocks jump
 * past it, and the day begins at the jump) or happen twice (they fall back
 * to it, and the day began at the first); the offsets a day either side of
 * it say which, without searching.
 */
function dayStart(day: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const midnight = Date.UTC(year, month - 1, date);
  const before = midnight - offsetAt(midnight - DAY_MS, timeZone);
  const after = midnight - offsetAt(midnight + DAY_MS, timeZone);
  const real = [before, after]
    .filter((at) => at + offsetAt(at, timeZone) === midnight)
    .sort((a, b) => a - b);
  return real[0] ?? before;
}

/** A local day as real time: `[start, end)` in epoch milliseconds. */
export function dayBounds(day: string, timeZone: string) {
  return {
    start: dayStart(day, timeZone),
    end: dayStart(addDays(day, 1), timeZone),
  };
}

/** How many hours a day has: 24, or 23 and 25 when the clocks change. */
export function hoursIn(bounds: { start: number; end: number }) {
  return Math.ceil((bounds.end - bounds.start) / HOUR_MS);
}

/** The start of the local hour a moment falls in. */
export function hourStart(at: number, timeZone: string) {
  const into = (at + offsetAt(at, timeZone)) % HOUR_MS;
  return at - (into < 0 ? into + HOUR_MS : into);
}

/**
 * How much of `[from, to)` the log covered: the part between its first and
 * last covered moment, less the gaps it names.
 */
export function coveredMs(coverage: Coverage, from: number, to: number) {
  if (!coverage.from || !coverage.to) return 0;
  const start = Math.max(from, Date.parse(coverage.from));
  const end = Math.min(to, Date.parse(coverage.to));
  if (!(end > start)) return 0;
  let missing = 0;
  let cursor = start;
  for (const [gapFrom, gapTo] of coverage.gaps
    .map((gap) => [Date.parse(gap.from), Date.parse(gap.to)])
    .sort((a, b) => a[0] - b[0])) {
    const s = Math.max(gapFrom, cursor);
    const e = Math.min(gapTo, end);
    if (e > s) {
      missing += e - s;
      cursor = e;
    }
  }
  return end - start - missing;
}
