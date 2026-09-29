// The proxy's access log, followed while somebody is looking.
//
// Overview and Traffic draw requests as they arrive. "Live" has to mean live,
// so the controller opens one SSH session per open page, follows the log, and
// closes it when the page goes away. Traffic history is the collector's
// (traffic/collector.ts), which follows the same log once per application in
// the worker; this stream keeps nothing.
//
// The command is the controller's, not Pi's. It is one of two fixed shapes
// built from an `access-log` record whose fields cannot carry shell, it only
// reads, and it is the same kind of thing as the machine check on the
// connections card. That is why it sits outside the permission boundary: the
// boundary decides whether model-authored commands run, and there is no
// model-authored text here to decide about.
import { createHmac, randomBytes } from "node:crypto";

import type { OperatorSettings } from "./operator-data";
import { listInformation } from "./saved-information";
import { classify, hasFetchMetadata, IMITATION } from "./traffic/classify";
import type { Arrival, TrafficLine } from "./traffic/contract";
import {
  agentOf,
  arrivalOf,
  countryOf,
  deviceOf,
  pageName,
} from "./traffic/enrich";
import { parseLine } from "./traffic/parse";
import { onServer, READY, type AccessLogRecord } from "./traffic/sources";

export { HALLVI_USER_AGENT } from "./traffic/parse";

export type AccessLogSource = AccessLogRecord["source"];

/** The newest current `access-log` record, if any record says where it is. */
export function accessLogRecord(applicationId: string): AccessLogRecord | null {
  for (const record of listInformation(applicationId)) {
    const content = record.presentation?.content;
    if (content?.kind === "access-log") return content;
  }
  return null;
}

/** A few minutes of backlog so the page opens on something, then follow. */
export function followCommand(source: AccessLogSource) {
  const readable =
    source.type === "file"
      ? `test -r '${source.path}' || { echo 'The access log is not readable.'; exit 1; }; `
      : "";
  return `${readable}echo ${READY}; ${followOnly(source)}`;
}
function followOnly(source: AccessLogSource) {
  if (source.type === "file") return `exec tail -n 2000 -F '${source.path}'`;
  const logs = `logs --since 5m --follow '${source.name}'`;
  return `if docker ps >/dev/null 2>&1; then exec docker ${logs} 2>&1; else exec sudo -n docker ${logs} 2>&1; fi`;
}

/** How far back "recent visitors" reach, and the backlog a page is sent. */
export const LIVE_WINDOW_MINUTES = 5;
const WINDOW_MS = LIVE_WINDOW_MINUTES * 60_000;
/** A page is open while its script pinged within this; a view is a ping. */
const OPEN_MS = 60_000;

/**
 * What one open page is told about the requests it sees: each one as an
 * arrival, and how many browsers and open pages the last minutes hold.
 * Arrivals are classified by the same rules the counting uses — views come
 * from the log until the script is heard from, then from the script — and
 * carry a country, a source and a device, never an address or an agent.
 * A browser's label is salted for this stream alone.
 */
export class LiveWindow {
  private readonly salt = randomBytes(16);
  private readonly hosts: readonly string[];
  private readonly pageKey: string | undefined;
  private readonly countries = new Map<string, string>();
  /** Hosts browsers reach with fetch metadata: imitations there are bots. */
  private readonly withMetadata = new Set<string>();
  /** Browsers, by label, and when each was last seen. */
  private readonly browsers = new Map<string, number>();
  /** Page views, by the script's id, and when each last pinged. */
  private readonly open = new Map<string, number>();
  private script: boolean;

  constructor(options: {
    hosts?: readonly string[];
    pageKey?: string;
    script: boolean;
  }) {
    this.hosts = options.hosts ?? [];
    this.pageKey = options.pageKey;
    this.script = options.script;
  }

  arrival(line: TrafficLine): Arrival | null {
    const kind = classify(line);
    if (kind.kind === "own") return null;
    const visitor = createHmac("sha256", this.salt)
      .update(`${line.address}\n${line.userAgent}\n${line.host}`)
      .digest("hex")
      .slice(0, 10);
    const country = () => {
      let found = this.countries.get(visitor);
      if (found === undefined) {
        found = countryOf(line.address, line.cdnCountry);
        this.countries.set(visitor, found);
      }
      return found;
    };
    if (kind.kind === "event") {
      const { event } = kind;
      this.script = true;
      this.seen(this.browsers, visitor, line.at);
      if (event.t === "view" || event.t === "ping")
        this.seen(this.open, event.s, line.at);
      if (event.t !== "view") return null;
      return {
        at: line.at,
        kind: "view",
        path: pageName(event.p),
        status: line.status,
        ms: line.ms,
        country: country(),
        source:
          arrivalOf({
            referrer: event.r ?? null,
            host: line.host,
            hosts: this.hosts,
            tags: event.u ?? {},
          })?.source ?? null,
        device: deviceOf(agentOf(line.userAgent), event.w),
        visitor,
      };
    }
    if (hasFetchMetadata(line)) this.withMetadata.add(line.host);
    const bot =
      kind.bot ??
      (kind.imitation && this.withMetadata.has(line.host) ? IMITATION : null);
    const person = !bot && kind.browser;
    if (person) this.seen(this.browsers, visitor, line.at);
    const view = person && kind.view && !this.script;
    return {
      at: line.at,
      kind: bot ? "bot" : view ? "view" : "request",
      path: view ? this.pageOf(line) : line.path.slice(0, 200),
      status: line.status,
      ms: line.ms,
      country: country(),
      source: view
        ? (arrivalOf({
            referrer: line.referrer,
            host: line.host,
            hosts: this.hosts,
            tags: line.kept,
          })?.source ?? null)
        : null,
      device: person ? deviceOf(agentOf(line.userAgent)) : null,
      visitor,
    };
  }

  /** Browsers in the window, and pages open now (null without the script). */
  now(at = Date.now()) {
    for (const [key, seen] of this.browsers)
      if (seen < at - WINDOW_MS) this.browsers.delete(key);
    for (const [id, seen] of this.open)
      if (seen < at - OPEN_MS) this.open.delete(id);
    return {
      type: "now" as const,
      openNow: this.script ? this.open.size : null,
      recentVisitors: this.browsers.size,
      windowMinutes: LIVE_WINDOW_MINUTES,
    };
  }

  /** A page as the counting names it, with the application's page key. */
  private pageOf(line: TrafficLine) {
    const value = this.pageKey
      ? line.kept[this.pageKey]?.slice(0, 100)
      : undefined;
    const page = pageName(line.path);
    return value ? `${page}?${this.pageKey}=${value}` : page;
  }

  private seen(map: Map<string, number>, key: string, at: number) {
    if ((map.get(key) ?? 0) < at) map.set(key, at);
  }
}

/** Follows the log until the signal aborts or the session ends. */
export function followAccessLog(
  host: NonNullable<OperatorSettings["host"]>,
  log: AccessLogRecord,
  onLine: (line: TrafficLine) => void,
  signal: AbortSignal,
  onReady: () => void = () => {},
) {
  const options = { hosts: log.hosts, pageKey: log.pageKey };
  // The command holds no `$`, backtick or double quote: its only variable
  // part is a name or path whose shape excludes them.
  return onServer(
    host,
    `bash -c "${followCommand(log.source)}"`,
    (text) => {
      const line = parseLine(log.format, text, options);
      if (line) onLine(line);
    },
    { follow: true, signal, onReady },
  );
}
