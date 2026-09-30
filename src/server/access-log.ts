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
// model-authored text here to decide about. Where Hallvi's user cannot read
// the log, it runs itself again through `sudo -n` exactly as history does
// (traffic/sources.ts).
import { createHmac, randomBytes } from "node:crypto";

import type { OperatorSettings } from "./operator-data";
import { listInformation } from "./saved-information";
import { classify, hasFetchMetadata, IMITATION } from "./traffic/classify";
import { LOOKBACK_MS } from "./traffic/count";
import {
  EVENT_PREFIX,
  type Arrival,
  type TrafficLine,
} from "./traffic/contract";
import {
  agentOf,
  arrivalOf,
  countryOf,
  deviceOf,
  eventPage,
  keyedPage,
  tagOf,
} from "./traffic/enrich";
import { parseLine } from "./traffic/parse";
import {
  liveLogCommand,
  onServer,
  type AccessLogRecord,
} from "./traffic/sources";

export { HALLVI_USER_AGENT } from "./traffic/parse";

export type AccessLogSource = AccessLogRecord["source"];

/** The newest current `access-log` record, if any record says where it is. */
export async function accessLogRecord(
  applicationId: string,
): Promise<AccessLogRecord | null> {
  for (const record of await listInformation(applicationId)) {
    const content = record.presentation?.content;
    if (content?.kind === "access-log") return content;
  }
  return null;
}

/** A few minutes of backlog so the page opens on something, then follow. */
export const followCommand = liveLogCommand;

/** How far back "recent visitors" reach, and the backlog a page is sent. */
export const LIVE_WINDOW_MINUTES = 5;
const WINDOW_MS = LIVE_WINDOW_MINUTES * 60_000;
/**
 * A page is open while its script pinged within this and has not left since:
 * a view is a ping, its `leave` closes it (a route change, the tab hidden),
 * and a later ping — the tab shown again — opens it again.
 */
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
  private readonly hashRouting: boolean;
  /** Hosts browsers reach with fetch metadata: imitations there are bots. */
  private readonly withMetadata = new Set<string>();
  /** Browsers, by label, and when each was last seen. */
  private readonly browsers = new Map<string, number>();
  /**
   * Page views, by the script's id: when each last pinged and last left.
   * Events arrive in any order, so a view is open when its ping is later.
   */
  private readonly open = new Map<string, { seen: number; left: number }>();
  /**
   * Page loads the log showed, by browser and page, when each was: the
   * script's first view of the same load is not shown again.
   */
  private readonly loaded = new Map<string, number>();
  private script: boolean;

  constructor(options: {
    hosts?: readonly string[];
    pageKey?: string;
    hashRouting?: boolean;
    script: boolean;
  }) {
    this.hosts = options.hosts ?? [];
    this.pageKey = options.pageKey;
    this.hashRouting = options.hashRouting === true;
    this.script = options.script;
  }

  arrival(line: TrafficLine): Arrival | null {
    const kind = classify(line);
    if (kind.kind === "own") return null;
    // A browser is its address and agent, whichever of the application's
    // names it asked for.
    const visitor = createHmac("sha256", this.salt)
      .update(`${line.address}\n${line.userAgent}`)
      .digest("hex")
      .slice(0, 10);
    if (kind.kind === "event") {
      const { event } = kind;
      this.script = true;
      this.seen(this.browsers, visitor, line.at);
      if (event.t === "view" || event.t === "ping" || event.t === "leave") {
        const page = this.open.get(event.s) ?? { seen: 0, left: 0 };
        if (event.t === "leave") page.left = Math.max(page.left, line.at);
        else page.seen = Math.max(page.seen, line.at);
        this.open.set(event.s, page);
      }
      if (event.t !== "view") return null;
      const page = eventPage(event, this.pageKey, this.hashRouting);
      // Fragments never reach the proxy: pair against the physical page.
      const loadedPage = eventPage(event, this.pageKey);
      const load = this.loaded.get(`${visitor} ${loadedPage}`);
      this.loaded.delete(`${visitor} ${loadedPage}`);
      if (
        load !== undefined &&
        load <= line.at &&
        line.at - load <= LOOKBACK_MS
      )
        return null;
      return {
        at: line.at,
        kind: "view",
        // The script's word for a view, never a request the page counts.
        script: true,
        path: page,
        status: line.status,
        ms: line.ms,
        country: countryOf(line.address, line.cdnCountry),
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
    if (person && kind.view) {
      const load = `${visitor} ${this.pageOf(line)}`;
      if (view && !kind.imitation) this.loaded.set(load, line.at);
      else this.loaded.delete(load);
    }
    return {
      at: line.at,
      kind: bot ? "bot" : view ? "view" : "request",
      script: false,
      // Sent to the events' path but no event — the wrong method, a failure,
      // a forgery — it still carries a payload that may hold a whole address
      // (a reset link's token): it is shown as where it was sent, no more.
      path: view
        ? this.pageOf(line)
        : line.path.startsWith(EVENT_PREFIX)
          ? EVENT_PREFIX
          : line.path.slice(0, 200),
      status: line.status,
      ms: line.ms,
      country: countryOf(line.address, line.cdnCountry),
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
    for (const [key, load] of this.loaded)
      if (load < at - LOOKBACK_MS) this.loaded.delete(key);
    for (const [key, seen] of this.browsers)
      if (seen < at - WINDOW_MS) this.browsers.delete(key);
    let open = 0;
    for (const [id, page] of this.open)
      if (Math.max(page.seen, page.left) < at - OPEN_MS) this.open.delete(id);
      else if (page.seen >= at - OPEN_MS && page.seen > page.left) open += 1;
    return {
      type: "now" as const,
      openNow: this.script ? open : null,
      recentVisitors: this.browsers.size,
      windowMinutes: LIVE_WINDOW_MINUTES,
    };
  }

  /** A page as the counting names it, with the application's page key. */
  private pageOf(line: TrafficLine) {
    const key = this.pageKey;
    return keyedPage(line.path, key, key ? tagOf(line.kept, key) : undefined);
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
  return onServer(
    host,
    followCommand(log.source),
    (text) => {
      const line = parseLine(log.format, text, options);
      if (line) onLine(line);
    },
    { follow: true, signal, onReady },
  );
}
