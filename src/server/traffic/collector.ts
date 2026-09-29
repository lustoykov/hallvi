// The collector: traffic history kept, for every application whose owner
// chose to keep it, by the worker.
//
// One fixed, read-only follow of the access log per application, however
// many pages are open. Nothing is ever added to a stored number (see
// docs/design/traffic.md, "Recount, never add"):
//
// - on start and on every reconnect, today is counted again from every line
//   the log still holds for it, then kept current from the follow and
//   written as provisional every few seconds;
// - a finished day is counted again from the files once it is over (after
//   `FINAL_AFTER_MS`), and stored as final;
// - on start, a day still within the log's reach that is missing, not final,
//   partly unreadable or counted before a switch point it now falls after is
//   counted again — and no other, so a restart does not re-read a month.
//
// Coverage is measured, never assumed: a day says from when to when the log
// answered for it, and names every stretch it could not, with why.
//
// Everything here reads the owner's choice again every tick and stops at
// once when it changes; the store refuses a write that arrives after that.

import { setTimeout as delay } from "node:timers/promises";

import { accessLogRecord } from "../access-log";
import { listApplications } from "../db";
import { operatorSettings } from "../operator-execution";
import {
  LOG_FORMATS,
  type Collection,
  type Coverage,
  type Gap,
  type TrafficDay,
} from "./contract";
import { DayCounter, FINAL_AFTER_MS } from "./count";
import {
  addDays,
  controllerTimeZone,
  coveredMs,
  dayBounds,
  dayOf,
} from "./days";
import {
  followLog,
  listLog,
  readLog,
  type AccessLogRecord,
  type LogFile,
  type Span,
} from "./sources";
import { collectionOf, readDays, recordCollector, writeDay } from "./store";

type Host = NonNullable<ReturnType<typeof operatorSettings>["host"]>;

/** How often the owner's choice and the records are read again. */
export const TICK_MS = 2_000;
/** Today is written this often while lines arrive, and at least each minute. */
const WRITE_MS = 5_000;
const IDLE_WRITE_MS = 60_000;
/** The backlog is read once the follow has been quiet this long. */
const QUIET_MS = 1_500;
/** A start recounts at most this many finished days. */
const REACH_DAYS = 31;
/**
 * How long a dead connection can still look open: ssh's keepalive, three
 * missed answers five seconds apart.
 */
const DEAD_AFTER_MS = 15_000;
/** Waits before a reconnect; a follow that stayed up a minute starts over. */
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
const STEADY_MS = 60_000;

const iso = (at: number) => new Date(at).toISOString();

interface Target {
  applicationId: string;
  host: Host;
  log: AccessLogRecord;
  timeZone: string;
  signal: AbortSignal;
}

// ---------------------------------------------------------------------------
// Coverage

function joined(spans: Span[]) {
  const out: Span[] = [];
  for (const span of [...spans]
    .filter((one) => one.to > one.from)
    .sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else out.push({ ...span });
  }
  return out;
}

/** What `[from, to)` holds that none of `spans` does. */
function uncovered(from: number, to: number, spans: Span[]) {
  const out: Span[] = [];
  let cursor = from;
  for (const span of joined(spans)) {
    if (span.to <= cursor) continue;
    if (span.from >= to) break;
    if (span.from > cursor) out.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < to) out.push({ from: cursor, to });
  return out;
}

/**
 * A stretch the log no longer holds. Before the owner chose to keep history,
 * it was not being kept; after, the log rotated it away before it was read.
 */
function missing(spans: Span[], enabledAt: number | null): Gap[] {
  const gaps: Gap[] = [];
  const add = (from: number, to: number, why: Gap["why"]) => {
    if (to > from) gaps.push({ from: iso(from), to: iso(to), why });
  };
  for (const span of spans) {
    const cut =
      enabledAt === null
        ? span.to
        : Math.min(Math.max(enabledAt, span.from), span.to);
    add(span.from, cut, "not-collecting");
    add(cut, span.to, "log-rotated");
  }
  return gaps;
}

function sorted(gaps: Gap[]) {
  return gaps.sort((a, b) => a.from.localeCompare(b.from));
}

/** A finished day's coverage, from what a read of it answered for. */
export function readCoverage(
  bounds: { start: number; end: number },
  read: { covered: Span[]; unreadable: Span[] },
  enabledAt: number | null,
): Coverage {
  const covered = joined(read.covered);
  const unreadable = joined(read.unreadable);
  return {
    from: covered.length ? iso(covered[0].from) : null,
    to: covered.length ? iso(covered.at(-1)!.to) : null,
    gaps: sorted([
      ...unreadable.map((span) => ({
        from: iso(span.from),
        to: iso(span.to),
        why: "unreadable" as const,
      })),
      ...missing(
        uncovered(bounds.start, bounds.end, [...covered, ...unreadable]),
        enabledAt,
      ),
    ]),
  };
}

/**
 * Today's coverage before `to`, from a listing: the file being written is
 * followed, so it covers onwards, and anything the files do not reach —
 * before the oldest, or between two that are not neighbours — is missing.
 */
function followedCoverage(
  start: number,
  files: LogFile[],
  enabledAt: number | null,
) {
  // No file yet: the follow waits for the first one, and covers from now.
  const spans = files.length
    ? files.map((file, index) =>
        index === files.length - 1
          ? { from: file.from, to: Number.POSITIVE_INFINITY }
          : { from: file.from, to: file.to },
      )
    : [{ from: Date.now(), to: Number.POSITIVE_INFINITY }];
  const reach = joined(spans).find((span) => span.to > start);
  const from = reach ? Math.max(start, reach.from) : null;
  return (to: number): Coverage => ({
    from: from !== null && to > from ? iso(from) : null,
    to: from !== null && to > from ? iso(to) : null,
    gaps: sorted(missing(uncovered(start, to, spans), enabledAt)),
  });
}

// ---------------------------------------------------------------------------
// The script's switch point and its silence

/**
 * What a count shows about the script, recorded: an earlier switch point
 * than the one on record, and — from the live count only — since when
 * browsers have been served pages with no event, cleared once one arrives.
 * Answers whether the switch point moved earlier.
 */
function noteScript(applicationId: string, counter: DayCounter, live: boolean) {
  const recorded = collectionOf(applicationId);
  const seen: Partial<Collection> = {};
  const since = recorded.scriptSince ? Date.parse(recorded.scriptSince) : null;
  const moved =
    counter.switchAt !== null && (since === null || counter.switchAt < since);
  if (moved) seen.scriptSince = iso(counter.switchAt!);
  if (live) {
    const silent = recorded.scriptSilentSince
      ? Date.parse(recorded.scriptSilentSince)
      : null;
    if (
      silent !== null &&
      counter.lastEventAt !== null &&
      counter.lastEventAt > silent
    )
      seen.scriptSilentSince = null;
    else if (silent === null && counter.silentSince !== null)
      seen.scriptSilentSince = iso(counter.silentSince);
  }
  if (Object.keys(seen).length) recordCollector(applicationId, seen);
  return moved;
}

// ---------------------------------------------------------------------------
// Finished days

const covers = (day: TrafficDay) => {
  const { start, end } = dayBounds(day.day, day.timeZone);
  return coveredMs(day.coverage, start, end);
};

/** Whether a finished day should be counted again from the log. */
function due(applicationId: string, day: string, timeZone: string) {
  const stored = readDays(applicationId, day, day)[0];
  if (!stored || !stored.final) return true;
  if (stored.coverage.gaps.some((gap) => gap.why === "unreadable"))
    return true;
  const since = collectionOf(applicationId).scriptSince;
  return (
    stored.viewSource === "log" &&
    since !== null &&
    Date.parse(since) < dayBounds(day, timeZone).end
  );
}

/** Counts a finished day from the files and stores it as final. */
async function finishDay(target: Target, day: string) {
  const { applicationId, host, log, timeZone, signal } = target;
  const bounds = dayBounds(day, timeZone);
  const collection = collectionOf(applicationId);
  if (!collection.enabledAt) return false;
  const counter = new DayCounter({
    day,
    timeZone,
    scriptSince: collection.scriptSince,
    hosts: log.hosts,
    pageKey: log.pageKey,
    coverage: { from: null, to: null, gaps: [] },
  });
  const read = await readLog(
    host,
    log,
    { from: bounds.start, to: bounds.end },
    (line) => counter.add(line),
    signal,
  );
  signal.throwIfAborted();
  const coverage = readCoverage(
    bounds,
    read,
    Date.parse(collection.enabledAt) || null,
  );
  let counted = counter.day({ coverage });
  // What was counted while the log still held it is kept, when the log now
  // answers for less of the day: the stretch after its last moment is where
  // Hallvi was not following, and nothing holds it any more.
  const stored = readDays(applicationId, day, day)[0];
  if (stored && !stored.final && covers(stored) > covers(counted)) {
    const to = stored.coverage.to
      ? Date.parse(stored.coverage.to)
      : bounds.start;
    counted = {
      ...stored,
      final: true,
      computedAt: iso(Date.now()),
      coverage: {
        ...stored.coverage,
        gaps: sorted([
          ...stored.coverage.gaps.filter((gap) => Date.parse(gap.to) <= to),
          ...(to < bounds.end
            ? [{ from: iso(to), to: iso(bounds.end), why: "hallvi-off" as const }]
            : []),
        ]),
      },
    };
  }
  writeDay(applicationId, counted);
  return noteScript(applicationId, counter, false);
}

/**
 * Every finished day within the log's reach that is due, oldest first, so a
 * switch point found on one day is counted with on the next. Answers whether
 * the switch point moved earlier.
 */
async function finishDays(target: Target, oldest: number | null) {
  const { applicationId, timeZone } = target;
  if (oldest === null) return false;
  const now = Date.now();
  const today = dayOf(now, timeZone);
  let day = dayOf(oldest, timeZone);
  const limit = addDays(today, -REACH_DAYS);
  if (day < limit) day = limit;
  let moved = false;
  for (; day < today; day = addDays(day, 1)) {
    target.signal.throwIfAborted();
    if (now < dayBounds(day, timeZone).end + FINAL_AFTER_MS) break;
    if (due(applicationId, day, timeZone))
      moved = (await finishDay(target, day)) || moved;
  }
  return moved;
}

/** When the next day can be finished: ten minutes after its midnight. */
function nextFinish(timeZone: string, now = Date.now()) {
  return (
    dayBounds(dayOf(now - FINAL_AFTER_MS, timeZone), timeZone).end +
    FINAL_AFTER_MS
  );
}

// ---------------------------------------------------------------------------
// One connection

interface Open {
  counter: DayCounter;
  start: number;
  end: number;
  coverage: (to: number) => Coverage;
}

/**
 * One connection's work: finish the days that are due, then count today
 * again from the log and follow it until the connection ends. Answers why it
 * ended, and whether it had been following.
 */
async function connection(target: Target, first: boolean) {
  const { applicationId, host, log, timeZone } = target;
  const inner = new AbortController();
  const signal = AbortSignal.any([target.signal, inner.signal]);
  const scope = { ...target, signal };

  const files = await listLog(host, log, signal);
  const oldest = files[0]?.from ?? null;
  recordCollector(applicationId, {
    oldestRetainedAt: oldest === null ? null : iso(oldest),
    ...(first ? { state: "catching-up" as const, detail: null } : {}),
  });
  await finishDays(scope, oldest);
  signal.throwIfAborted();

  const collection = collectionOf(applicationId);
  const enabledAt = collection.enabledAt
    ? Date.parse(collection.enabledAt)
    : null;
  const days: Open[] = [];
  const open = (day: string, coverage: Open["coverage"] | null) => {
    const bounds = dayBounds(day, timeZone);
    const counter = new DayCounter({
      day,
      timeZone,
      scriptSince: collectionOf(applicationId).scriptSince,
      hosts: log.hosts,
      pageKey: log.pageKey,
      coverage: { from: null, to: null, gaps: [] },
    });
    const entry: Open = {
      counter,
      ...bounds,
      // A day the follow crossed into is covered from its first moment.
      coverage:
        coverage ??
        ((to) => ({ from: iso(bounds.start), to: iso(to), gaps: [] })),
    };
    days.push(entry);
    return entry;
  };
  const today = open(
    dayOf(Date.now(), timeZone),
    followedCoverage(
      dayBounds(dayOf(Date.now(), timeZone), timeZone).start,
      files,
      enabledAt,
    ),
  );

  let readyAt: number | null = null;
  let heardAt = 0;
  let live = false;
  let dirty = false;
  let writtenAt = 0;
  let lastLine: number | null = null;
  let finishing = false;
  let finishAt = nextFinish(timeZone);
  let rebuild = false;

  const write = (aliveTo: number) => {
    const now = Date.now();
    for (const entry of days) {
      const to = Math.min(entry.end, aliveTo);
      if (!(to > entry.start)) continue;
      writeDay(
        applicationId,
        entry.counter.day({ now, coverage: entry.coverage(to) }),
      );
    }
    const newest = days.at(-1)!.counter;
    const seen = Math.max(
      ...days.map((entry) => entry.counter.lastLineAt ?? 0),
    );
    if (seen > (lastLine ?? 0)) {
      lastLine = seen;
      recordCollector(applicationId, { lastLineAt: iso(seen) });
    }
    noteScript(applicationId, newest, true);
    writtenAt = now;
    dirty = false;
  };

  const caughtUp = () => {
    if (live) return;
    live = true;
    write(Date.now());
    recordCollector(applicationId, { state: "live", detail: null });
  };

  const timer = setInterval(() => {
    const now = Date.now();
    if (!live) {
      if (readyAt !== null && now - heardAt >= QUIET_MS) caughtUp();
      return;
    }
    // Past midnight the follow carries on into the next day.
    const newest = days.at(-1)!;
    if (now >= newest.end) open(dayOf(now, timeZone), null);
    if (
      (dirty && now - writtenAt >= WRITE_MS) ||
      now - writtenAt >= IDLE_WRITE_MS
    )
      write(now);
    // Ten minutes after midnight the day before is counted from the files.
    if (!finishing && now >= finishAt) {
      finishing = true;
      for (let index = days.length - 1; index >= 0; index--)
        if (now >= days[index].end + FINAL_AFTER_MS) days.splice(index, 1);
      finishDays(scope, oldest)
        .then((moved) => {
          const counting = days.at(-1)!.counter.switchAt;
          const since = collectionOf(applicationId).scriptSince;
          // An earlier switch point changes how today counts: count it again.
          if (
            moved &&
            since &&
            (counting === null || counting > Date.parse(since))
          ) {
            rebuild = true;
            inner.abort();
          }
        })
        .catch(() => {})
        .finally(() => {
          finishing = false;
          finishAt = nextFinish(timeZone);
        });
    }
  }, 500);

  try {
    const { exitCode, said } = await followLog(
      host,
      log,
      today.start,
      (line) => {
        heardAt = Date.now();
        dirty = true;
        let entry = days.at(-1)!;
        if (line.at >= entry.end) entry = open(dayOf(line.at, timeZone), null);
        for (const one of days)
          if (line.at >= one.start && line.at < one.end) one.counter.add(line);
        // A line from the last few seconds: the backlog is behind us.
        if (!live && readyAt !== null && line.at >= readyAt - 5_000)
          caughtUp();
      },
      signal,
      () => {
        readyAt = Date.now();
        heardAt = readyAt;
      },
    );
    if (target.signal.aborted || rebuild) return { rebuild, live, detail: "" };
    // Known alive until it went quiet, at most a keepalive before now.
    if (live) write(Math.max(heardAt, Date.now() - DEAD_AFTER_MS));
    return {
      rebuild: false,
      live,
      detail:
        said ||
        (readyAt === null && exitCode === 255
          ? "The server did not accept the connection."
          : "The connection to the log ended."),
    };
  } finally {
    clearInterval(timer);
  }
}

/** Collection for one application, reconnecting until it is stopped. */
async function collect(target: Target) {
  const { applicationId, log, signal } = target;
  recordCollector(applicationId, {
    source: { proxy: log.proxy, format: log.format },
  });
  let failures = 0;
  let first = true;
  while (!signal.aborted) {
    const began = Date.now();
    let detail: string;
    try {
      const ended = await connection(target, first);
      if (signal.aborted) return;
      if (ended.rebuild) continue;
      detail = ended.detail;
      if (ended.live && Date.now() - began >= STEADY_MS) failures = 0;
    } catch (error) {
      if (signal.aborted) return;
      detail =
        error instanceof Error && error.message
          ? error.message.slice(0, 300)
          : "The log could not be read.";
    }
    first = false;
    recordCollector(applicationId, { state: "lost", detail });
    await delay(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)], null, {
      signal,
    }).catch(() => undefined);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// Every application

/** Why history cannot be read, in the words the Traffic page shows. */
function blocked(
  host: Host | null,
  log: AccessLogRecord | null,
): Pick<Collection, "state" | "detail"> | null {
  if (!host) return { state: "no-log", detail: "No server is connected." };
  if (!log) return { state: "no-log", detail: null };
  if (!(LOG_FORMATS as readonly string[]).includes(log.format))
    return {
      state: "unsupported",
      detail: `${log.proxy} writes its access log in a format Hallvi does not read.`,
    };
  return null;
}

export function trafficCollector(signal: AbortSignal) {
  const running = new Map<
    string,
    { key: string; abort: AbortController; done: Promise<void> }
  >();

  const stop = (applicationId: string) => {
    running.get(applicationId)?.abort.abort();
    running.delete(applicationId);
  };

  function care(applicationId: string) {
    const collection = collectionOf(applicationId);
    if (!collection.enabledAt) return stop(applicationId);
    const host = operatorSettings(applicationId).host ?? null;
    const log = host ? accessLogRecord(applicationId) : null;
    const reason = blocked(host, log);
    if (reason || !host || !log) {
      stop(applicationId);
      if (
        reason &&
        (collection.state !== reason.state ||
          collection.detail !== reason.detail)
      )
        recordCollector(applicationId, {
          ...reason,
          source: log ? { proxy: log.proxy, format: log.format } : null,
        });
      return;
    }
    // A record retired, replaced or edited, or a server changed, is a
    // different log: the old follow ends and a new one starts.
    const key = JSON.stringify({ host, log });
    const current = running.get(applicationId);
    if (current?.key === key) return;
    stop(applicationId);
    const abort = new AbortController();
    const target: Target = {
      applicationId,
      host,
      log,
      timeZone: controllerTimeZone(),
      signal: AbortSignal.any([signal, abort.signal]),
    };
    const done = collect(target).catch((error) =>
      console.warn(
        `Hallvi stopped keeping traffic history for ${applicationId}: ${error instanceof Error ? error.message : "unknown reason"}`,
      ),
    );
    running.set(applicationId, { key, abort, done });
  }

  return {
    /**
     * Reads every application's choice and records, starting and stopping
     * follows to match. Quick and synchronous: the follows run on their own.
     */
    tick() {
      if (signal.aborted) return;
      let applications: string[];
      try {
        applications = listApplications().map(({ id }) => id);
      } catch {
        return;
      }
      for (const applicationId of applications)
        try {
          care(applicationId);
        } catch (error) {
          stop(applicationId);
          console.warn(
            `Hallvi could not look after traffic history for ${applicationId}: ${error instanceof Error ? error.message : "unknown reason"}`,
          );
        }
      // A removed application's follow ends with it.
      for (const applicationId of [...running.keys()])
        if (!applications.includes(applicationId)) stop(applicationId);
    },

    /** Every follow ended, for a clean shutdown. */
    async stop() {
      const done = [...running.values()].map((one) => one.done);
      for (const applicationId of [...running.keys()]) stop(applicationId);
      await Promise.all(done);
    },

    /** Applications being followed now. */
    following() {
      return [...running.keys()];
    },
  };
}
