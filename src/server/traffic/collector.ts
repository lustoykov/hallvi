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
//   `FINAL_AFTER_MS`), and stored as final. Only that recount makes a day
//   final: what the follow writes is provisional, whatever the clock says;
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
  OTHER,
  STORED_PER_LIST,
  TRAFFIC_LISTS,
  type Collection,
  type Coverage,
  type Gap,
  type Ranked,
  type TrafficDay,
} from "./contract";
import { DayCounter, FINAL_AFTER_MS, LOOKBACK_MS } from "./count";
import { addDays, controllerTimeZone, dayBounds, dayOf, HOUR_MS } from "./days";
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

/**
 * A day's coverage, from what a read of it answered for. The read may reach
 * past the day — a few minutes before it, a file being written — and what it
 * says there is not the day's.
 */
export function readCoverage(
  bounds: { start: number; end: number },
  read: { covered: Span[]; unreadable: Span[] },
  enabledAt: number | null,
): Coverage {
  const covered = joined(clipped(read.covered, bounds.start, bounds.end));
  const unreadable = joined(clipped(read.unreadable, bounds.start, bounds.end));
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
 * Today's coverage before `to`, from the listing the follow reads: the file
 * being written is followed, so it covers onwards; a file the follow could
 * not read (`unreadable`, filled in as it says so) is a gap of its own; and
 * anything the files do not reach — before the oldest, or between two that
 * are not neighbours — is missing.
 */
function followedCoverage(
  start: number,
  files: LogFile[],
  enabledAt: number | null,
  unreadable: ReadonlySet<string>,
) {
  // No file yet: the follow waits for the first one, and covers from now.
  const all = files.length
    ? files.map((file, index) => ({
        name: file.name,
        from: file.from,
        to: index === files.length - 1 ? Number.POSITIVE_INFINITY : file.to,
      }))
    : [{ name: "", from: Date.now(), to: Number.POSITIVE_INFINITY }];
  return (to: number) =>
    readCoverage(
      { start, end: to },
      {
        covered: all.filter((file) => !unreadable.has(file.name)),
        unreadable: all.filter((file) => unreadable.has(file.name)),
      },
      enabledAt,
    );
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

/** What a day's coverage says the log answered for, within the day. */
function spansOf(coverage: Coverage, bounds: { start: number; end: number }) {
  if (!coverage.from || !coverage.to) return [];
  return uncovered(
    Math.max(bounds.start, Date.parse(coverage.from)),
    Math.min(bounds.end, Date.parse(coverage.to)),
    coverage.gaps.map((gap) => ({
      from: Date.parse(gap.from),
      to: Date.parse(gap.to),
    })),
  );
}

const length = (spans: Span[]) =>
  spans.reduce((total, span) => total + span.to - span.from, 0);
const clipped = (spans: Span[], from: number, to: number) =>
  spans
    .map((span) => ({
      from: Math.max(span.from, from),
      to: Math.min(span.to, to),
    }))
    .filter((span) => span.to > span.from);
/** Whether `outer` answers for every moment `inner` does. */
const holds = (outer: Span[], inner: Span[]) =>
  inner.every((span) => !uncovered(span.from, span.to, outer).length);

/**
 * Coverage made of parts, each counted by one side: what that side covered
 * of it, and that side's own reason for the rest. A stored count says
 * nothing about the time after its last moment: Hallvi was not following.
 */
function coverageOf(
  parts: { day: TrafficDay; spans: Span[]; from: number; to: number }[],
): Coverage {
  const covered = joined(
    parts.flatMap((part) => clipped(part.spans, part.from, part.to)),
  );
  const gaps: Gap[] = [];
  for (const { day, spans, from, to } of parts) {
    const reasons = day.coverage.gaps.map((gap) => ({
      from: Date.parse(gap.from),
      to: Date.parse(gap.to),
      why: gap.why,
    }));
    for (const piece of uncovered(from, to, spans)) {
      const cuts = [
        piece.from,
        ...reasons
          .flatMap((gap) => [gap.from, gap.to])
          .filter((at) => at > piece.from && at < piece.to),
        piece.to,
      ].sort((a, b) => a - b);
      for (let index = 1; index < cuts.length; index++) {
        const [start, end] = [cuts[index - 1], cuts[index]];
        if (!(end > start)) continue;
        const why =
          reasons.find((gap) => gap.from <= start && start < gap.to)?.why ??
          "hallvi-off";
        const last = gaps.at(-1);
        if (last && last.why === why && Date.parse(last.to) === start)
          last.to = iso(end);
        else gaps.push({ from: iso(start), to: iso(end), why });
      }
    }
  }
  return {
    from: covered.length ? iso(covered[0].from) : null,
    to: covered.length ? iso(covered.at(-1)!.to) : null,
    gaps: sorted(gaps),
  };
}

/** Per key, the entry that counted more. */
function larger<T>(
  a: T[],
  b: T[],
  key: (entry: T) => string,
  weight: (entry: T) => number,
) {
  const out = new Map<string, T>();
  for (const entry of [...a, ...b]) {
    const have = out.get(key(entry));
    if (!have || weight(entry) > weight(have)) out.set(key(entry), entry);
  }
  return [...out.values()];
}

function largerList(a: Ranked[], b: Ranked[]) {
  const all = larger(
    a,
    b,
    (entry) => entry.key,
    (entry) => entry.count,
  );
  const other = all.find((entry) => entry.key === OTHER);
  return [
    ...all
      .filter((entry) => entry !== other)
      .sort((x, y) => y.count - x.count || x.key.localeCompare(y.key))
      .slice(0, STORED_PER_LIST),
    ...(other ? [other] : []),
  ];
}

/**
 * A finished day from its recount and what was stored for it before, the
 * two compared by the stretches of the day each answers for — never by how
 * much, since two counts of the same length can cover different hours:
 *
 * - the recount answers for everything the stored day did: the recount;
 * - the stored day answers for everything the recount does, and more — the
 *   log has since rotated part of it away: the stored day, now final;
 * - each answers for something the other does not: every hour is taken from
 *   the one that answers for all of it the other does (for more of it when
 *   neither does), with that one's coverage and gaps. Figures that are not
 *   hourly — visitors, lists, time on page, page speed — cannot be split by
 *   hour, so each is the larger of the two counts, per entry. Each count saw
 *   only part of the day, so that is a floor, never a sum: a browser seen by
 *   both would be counted twice by adding. The day says so in `partial`.
 */
export function combined(
  stored: TrafficDay,
  recount: TrafficDay,
  bounds: { start: number; end: number },
): TrafficDay {
  const now = iso(Date.now());
  const a = spansOf(recount.coverage, bounds);
  const b = spansOf(stored.coverage, bounds);
  if (
    holds(a, b) ||
    stored.timeZone !== recount.timeZone ||
    stored.hours.length !== recount.hours.length
  )
    return recount;
  const whole = { from: bounds.start, to: bounds.end };
  if (holds(b, a))
    return {
      ...stored,
      computedAt: now,
      coverage: coverageOf([{ day: stored, spans: b, ...whole }]),
    };
  const parts = recount.hours.map((_, index) => {
    const from = bounds.start + index * HOUR_MS;
    const to = Math.min(from + HOUR_MS, bounds.end);
    const [ours, theirs] = [clipped(a, from, to), clipped(b, from, to)];
    const recounted =
      holds(ours, theirs) ||
      (!holds(theirs, ours) && length(ours) >= length(theirs));
    return recounted
      ? { day: recount, spans: a, from, to }
      : { day: stored, spans: b, from, to };
  });
  return {
    ...recount,
    computedAt: now,
    coverage: coverageOf(parts),
    viewSource:
      stored.viewSource === recount.viewSource ? recount.viewSource : "switch",
    hours: parts.map((part, index) => part.day.hours[index]),
    visitors: Math.max(stored.visitors, recount.visitors),
    errorVisitors: Math.max(stored.errorVisitors, recount.errorVisitors),
    ...Object.fromEntries(
      TRAFFIC_LISTS.map((list) => [
        list,
        largerList(stored[list], recount[list]),
      ]),
    ),
    browserOnlyPages: Math.max(
      stored.browserOnlyPages,
      recount.browserOnlyPages,
    ),
    engagement: larger(
      stored.engagement,
      recount.engagement,
      (entry) => entry.path,
      (entry) => entry.samples,
    ),
    vitals: larger(
      stored.vitals,
      recount.vitals,
      (entry) => `${entry.metric} ${entry.path}`,
      (entry) => entry.buckets.reduce((total, count) => total + count, 0),
    ),
    scriptErrors: larger(
      stored.scriptErrors,
      recount.scriptErrors,
      (entry) => entry.path,
      (entry) => entry.count,
    ),
    // Each of those saw part of the day: say so, wherever they are read.
    partial: ["visitors", ...TRAFFIC_LISTS, "engagement", "vitals", "scriptErrors"],
  };
}

/** Whether a finished day should be counted again from the log. */
function due(applicationId: string, day: string, timeZone: string) {
  const stored = readDays(applicationId, day, day)[0];
  if (!stored || !stored.final) return true;
  if (stored.coverage.gaps.some((gap) => gap.why === "unreadable")) return true;
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
    // The minutes before midnight too: a page load there may be the one
    // this day's first script view reports.
    { from: bounds.start - LOOKBACK_MS, to: bounds.end },
    (line) => counter.add(line),
    signal,
  );
  signal.throwIfAborted();
  const coverage = readCoverage(
    bounds,
    read,
    Date.parse(collection.enabledAt) || null,
  );
  const recount = counter.day({ coverage });
  // What was counted while the log still held it is kept where the log no
  // longer answers for it.
  const stored = readDays(applicationId, day, day)[0];
  writeDay(applicationId, {
    ...(stored ? combined(stored, recount, bounds) : recount),
    final: true,
  });
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

/** The oldest line the log holds now, recorded; null for an empty log. */
async function reach({ applicationId, host, log, signal }: Target) {
  const oldest = (await listLog(host, log, signal))[0]?.from ?? null;
  recordCollector(applicationId, {
    oldestRetainedAt: oldest === null ? null : iso(oldest),
  });
  return oldest;
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

  if (first)
    recordCollector(applicationId, { state: "catching-up", detail: null });
  await finishDays(scope, await reach(scope));
  signal.throwIfAborted();
  // Listed again for the follow, which reads exactly these files and stops
  // if a rotation moved one since: today's coverage is this listing's.
  const files = await listLog(host, log, signal);
  const unreadable = new Set<string>();

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
      unreadable,
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
      // Provisional, even past the day's close: only the recount from the
      // files may make a day final, and a final day is not recounted.
      writeDay(applicationId, {
        ...entry.counter.day({ now, coverage: entry.coverage(to) }),
        final: false,
      });
    }
    // The day being written now; the next one may be open a few minutes
    // early, with nothing of its own yet.
    const newest = (
      days.findLast((entry) => entry.start <= now) ?? days.at(-1)!
    ).counter;
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
      let retry = false;
      // Listed again first: a log that was empty when the follow began has
      // lines now, and rotation has moved its oldest on since.
      reach(scope)
        .then((oldest) => finishDays(scope, oldest))
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
        // A listing or a read that failed is tried again in a minute, not
        // at the next midnight.
        .catch(() => (retry = true))
        .finally(() => {
          finishing = false;
          finishAt = retry ? Date.now() + 60_000 : nextFinish(timeZone);
        });
    }
  }, 500);

  try {
    const { exitCode, said, moved } = await followLog(
      host,
      log,
      files,
      today.start - LOOKBACK_MS,
      {
        line: (line) => {
          heardAt = Date.now();
          dirty = true;
          const entry = days.at(-1)!;
          // The next day opens a few minutes early, to read what the log
          // counted just before its midnight; each counter keeps its own.
          if (line.at >= entry.end - LOOKBACK_MS)
            open(dayOf(entry.end, timeZone), null);
          for (const one of days) one.counter.add(line);
          // A line from the last few seconds: the backlog is behind us.
          if (!live && readyAt !== null && line.at >= readyAt - 5_000)
            caughtUp();
        },
        ready: () => {
          readyAt = Date.now();
          heardAt = readyAt;
        },
        unreadable: (name) => unreadable.add(name),
      },
      signal,
    );
    if (target.signal.aborted || rebuild)
      return { rebuild, moved: false, live, detail: "" };
    // The log rotated between the listing and the follow: list again and
    // count today afresh, rather than follow a count that misses a file.
    if (moved)
      return {
        rebuild: true,
        moved: true,
        live,
        detail: "The log kept rotating while Hallvi began to follow it.",
      };
    // Known alive until it went quiet, at most a keepalive before now.
    if (live) write(Math.max(heardAt, Date.now() - DEAD_AFTER_MS));
    return {
      rebuild: false,
      moved: false,
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
    source: sourceOf(log),
  });
  let failures = 0;
  let moves = 0;
  let first = true;
  while (!signal.aborted) {
    const began = Date.now();
    let detail: string;
    try {
      const ended = await connection(target, first);
      if (signal.aborted) return;
      // Started over at once; a log that rotates under every start in a row
      // waits like any failure.
      moves = ended.moved ? moves + 1 : 0;
      if (ended.rebuild && moves <= 3) continue;
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

/**
 * What wrote the log, as the record says. Traefik cannot rewrite its log,
 * so that it keeps queries is known from the format alone; anything else is
 * what the record claims, or unknown.
 */
function sourceOf(log: AccessLogRecord): Collection["source"] {
  return {
    proxy: log.proxy,
    format: log.format,
    queries: log.queries ?? (log.format === "traefik-json" ? "kept" : null),
  };
}

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
          source: log ? sourceOf(log) : null,
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
