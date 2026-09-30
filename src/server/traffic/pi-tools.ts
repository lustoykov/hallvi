// What Pi reads about traffic: the stored totals, the tested log setup, and
// the script.
//
// docs/design/traffic.md owns the design. All three are reads: the totals come
// from traffic.db on the controller, and the setup and the script are text in
// this repository. Nothing here runs on the server or records anything. Pi
// applies the setup through its ordinary server tools, under the permission
// modes, and puts the script's include line in through a pull request.
//
// The totals carry nothing that identifies a visitor (contract.ts), and the
// reading keeps their honest labels: a visitor figure is an estimate that
// exists per day and is never added across days, and a stretch nobody counted
// is a gap, never a zero.

import {
  EVENT_PREFIX,
  KEPT_QUERY_KEYS,
  OTHER,
  PAGE_KEY_ATTRIBUTE,
  PAGE_KEY_NAME,
  eventPath,
  type Collection,
  type Gap,
  type LogQueries,
  type Ranked,
  type RangeTotals,
  type ReleaseImpact,
  type TrafficHistory,
  type TrafficList,
  type TrafficRange,
} from "./contract";
import { currentCollection } from "./collection";
import { controllerTimeZone } from "./days";
import { historyDays, historyOf, impactDays, releaseImpact } from "./merge";
import {
  SCRIPT_DIRECTORY,
  SCRIPT_FILE,
  SCRIPT_INCLUDES,
  SCRIPT_SERVING,
  SCRIPT_TAG,
  trafficScript,
} from "./script";
import { readDays } from "./store";

export const PROXIES = ["caddy", "nginx", "traefik"] as const;
export type Proxy = (typeof PROXIES)[number];

/** Entries of each list Pi reads; the rest folds into one `(other)` row. */
const LISTED = 10;
/** Minutes either side of a release, as the Deployment page reads it. */
const RELEASE_WINDOW = 120;

// ---------------------------------------------------------------------------
// read_traffic

const GAP_WORDS: Record<Gap["why"], string> = {
  "hallvi-off": "Hallvi was not running",
  "log-rotated": "the server's log had already rotated away",
  unreadable: "the log could not be read",
  "not-collecting": "history was not being kept",
};

const STATE_WORDS: Record<Collection["state"], string> = {
  off: "Keep traffic history is off: nothing is being counted now.",
  "no-log":
    "Keep traffic history is on, but there is no access-log record to read.",
  unsupported:
    "Keep traffic history is on, but the log is one Hallvi cannot read.",
  "catching-up":
    "Keep traffic history is on; Hallvi is counting what the log still holds.",
  live: "Keep traffic history is on; Hallvi is following the log.",
  lost: "Keep traffic history is on, but Hallvi has lost the log.",
};

/** What each list counts, beside distinct browsers. */
const LIST_COUNTS: Record<TrafficList, string> = {
  pages: "page views",
  sources: "page views arriving from the source",
  campaigns: "page views arriving from the campaign",
  countries: "page views",
  devices: "page views",
  browsers: "page views",
  systems: "page views",
  errors: "5xx responses on the path",
  goals: "goal events",
  bots: "bot and scanner requests",
};

/** The top of a list, the rest folded into `(other)`, as compact rows. */
function top(list: Ranked[]) {
  const rows = list.filter((row) => row.key !== OTHER);
  const other = list.find((row) => row.key === OTHER) ?? {
    key: OTHER,
    count: 0,
    visitors: 0,
  };
  const folded = rows.slice(LISTED).reduce(
    (sum, row) => ({
      key: OTHER,
      count: sum.count + row.count,
      visitors: sum.visitors + row.visitors,
    }),
    other,
  );
  return [...rows.slice(0, LISTED), ...(folded.count ? [folded] : [])].map(
    (row) => [row.key, row.count, row.visitors] as const,
  );
}

/**
 * A figure that is only a floor says so itself, "at least 10000", so that
 * no reading can quote it as exact.
 */
const floor = (value: number | null, atLeast: boolean) =>
  value !== null && atLeast ? `at least ${value}` : value;

function totalsOf(
  totals: Omit<RangeTotals, "visitorsPer" | "visitorsAtLeast"> &
    Partial<Pick<RangeTotals, "visitorsAtLeast">>,
  visitors: string,
) {
  const partial = Boolean(totals.visitorsAtLeast);
  return {
    requests: totals.requests,
    pageViews: totals.views,
    errors5xx: totals.errors,
    botRequests: totals.bots,
    p95ResponseMs: floor(totals.p95Ms, totals.p95AtLeast),
    [visitors]: floor(totals.visitors, partial),
    [`${visitors}HitByErrors`]: floor(totals.errorVisitors, partial),
  };
}

function collectionOf(collection: Collection) {
  return {
    state: collection.state,
    inWords:
      STATE_WORDS[collection.state] +
      (collection.detail ? ` ${collection.detail}` : ""),
    keepHistorySince: collection.enabledAt,
    stoppedAt: collection.disabledAt,
    log: collection.source
      ? `${collection.source.proxy} (${collection.source.format})`
      : null,
    serverLogKeeps: collection.source
      ? {
          removed:
            "no query strings: they are removed from the address and the referrer before a line is written",
          "path-only":
            "the referrer's query string; the address's is removed before a line is written",
          kept: "full addresses, query strings included",
          unknown: "whatever its setup keeps: the record does not say",
        }[collection.source.queries ?? "unknown"]
      : null,
    lastLineAt: collection.lastLineAt,
    serverLogReachesBackTo: collection.oldestRetainedAt,
    totalsStoredFrom: collection.storedFrom,
    script: collection.scriptSince
      ? {
          countingSince: collection.scriptSince,
          silentSince: collection.scriptSilentSince,
        }
      : "not installed",
    logMisses: collection.logMisses.map((miss) =>
      miss === "browser-pages"
        ? "The application changes pages in the browser, which the log cannot see."
        : "A CDN caches pages, which then never reach the log.",
    ),
  };
}

/**
 * A history and what releases changed, as Pi reads them: compact, and
 * labelled so that no number can be read as more than it is.
 */
export function trafficReading(
  history: TrafficHistory,
  releases: ReleaseImpact[] = [],
) {
  const perDay = history.totals.visitorsPer === "day";
  const visitors = perDay
    ? "estimatedVisitorsPerDay"
    : "estimatedVisitorsToday";
  // A bucket named as the owner's clock reads it: a day that starts at
  // 21:00Z is still that local day, not the one before.
  const clock = new Intl.DateTimeFormat("sv-SE", {
    timeZone: history.timeZone,
    dateStyle: "short",
    ...(history.range === "24h" && { timeStyle: "short" }),
  });
  const local = (at: string) => clock.format(Date.parse(at));
  const nothing = history.series.every((point) => point.covered === 0);
  const notes = [
    perDay
      ? "Visitors are estimated per day (distinct browsers) and shown as the average per day the log covered. Never add days together into a number of people."
      : "Visitors are today's estimate (distinct browsers). Hourly rows are each hour's own estimate and do not add up to the day.",
    "A series row with covered 0 was not counted: it is a gap, not a quiet hour or day.",
  ];
  if (nothing)
    notes.push(
      "Nothing was counted in this range. That means nobody was counting, not that nobody came.",
    );
  if (history.viewSource !== "log")
    notes.push(
      history.viewSource === "script"
        ? "Page views and visitors come from Hallvi's script; requests, errors, response times and bots from the log."
        : "Page views and visitors switch from the log to Hallvi's script inside this range, at the script's switch point; they are never added together.",
    );
  if (history.collection.scriptSilentSince)
    notes.push(
      `The script has sent nothing since ${history.collection.scriptSilentSince} while pages were still served. Say it is silent; do not read that as no visitors.`,
    );
  if (releases.length)
    notes.push(
      `Each release compares the whole stored hours in its compared.before with those in compared.after, ${RELEASE_WINDOW} minutes each; the hour the release fell in is in neither, so quote those times, not the release's own. Their visitor figures are hourly estimates added together, so they can overstate.`,
    );
  if (
    history.totals.visitorsAtLeast ||
    history.series.some((point) => point.visitorsAtLeast || point.p95AtLeast) ||
    history.totals.p95AtLeast ||
    history.partialLists.length ||
    history.vitals.some((row) => row.atLeast)
  )
    notes.push(
      'A figure written "at least N" is only a floor, and so is every count of a list marked atLeast: a response time or page speed past the slowest bucket Hallvi keeps, a day kept only its busiest entries, or part of a day was counted apart from the rest once the log no longer held all of it. Say "at least" whenever you quote one.',
    );
  if (history.partialSamples.length)
    notes.push(
      `${history.partialSamples.map((name) => (name === "engagement" ? "Time on page" : "Page speed")).join(" and ")}: some day's figures come from part of its views only, a sample rather than every view.`,
    );

  const lists: Record<string, unknown> = {};
  const empty: string[] = [];
  for (const name of Object.keys(LIST_COUNTS) as TrafficList[]) {
    const list = history[name];
    if (!list.length) {
      empty.push(name);
      continue;
    }
    lists[name] = {
      columns: [
        name === "pages" || name === "errors" ? "path" : "key",
        LIST_COUNTS[name],
        perDay ? "estimated visitors per day" : "estimated visitors today",
      ],
      rows: top(list),
      ...(history.partialLists.includes(name) && { atLeast: true }),
    };
  }

  return {
    range: history.range,
    timeZone: history.timeZone,
    collection: collectionOf(history.collection),
    totals: totalsOf(history.totals, visitors),
    previousPeriod: history.previous
      ? totalsOf(history.previous, visitors)
      : "not comparable: the log did not cover enough of it",
    series: {
      columns: [
        history.range === "24h" ? "local hour" : "local day",
        "covered (0-1)",
        "requests",
        "page views",
        history.range === "24h"
          ? "estimated visitors that hour"
          : "estimated visitors that day",
        "errors (5xx)",
        "visitors hit by errors",
        "bot requests",
        "p95 ms",
      ],
      rows: history.series.map((point) =>
        point.covered === 0
          ? [local(point.at), 0, "gap: not counted"]
          : [
              local(point.at),
              Math.round(point.covered * 100) / 100,
              point.requests,
              point.views,
              floor(point.visitors, point.visitorsAtLeast),
              point.errors,
              floor(point.errorVisitors, point.visitorsAtLeast),
              point.bots,
              floor(point.p95Ms, point.p95AtLeast),
            ],
      ),
    },
    lists,
    emptyLists: empty,
    ...(history.engagement.length > 0 && {
      timeOnPage: history.engagement
        .slice(0, LISTED)
        .map((row) => [row.path, row.averageMs, row.samples]),
    }),
    ...(history.vitals.length > 0 && {
      pageSpeedP75: history.vitals.map((row) => [
        row.path,
        row.metric,
        floor(row.p75, row.atLeast),
        row.samples,
      ]),
    }),
    ...(history.scriptErrors.length > 0 && {
      javascriptErrors: {
        rows: history.scriptErrors
          .slice(0, LISTED)
          .map((row) => [row.path, row.count]),
        ...(history.partialLists.includes("scriptErrors") && {
          atLeast: true,
        }),
      },
    }),
    coverage: {
      from: history.coverage.from,
      to: history.coverage.to,
      gaps: history.coverage.gaps.map((gap) => ({
        from: gap.from,
        to: gap.to,
        why: GAP_WORDS[gap.why],
      })),
    },
    ...(releases.length > 0 && {
      releases: releases.map((impact) => ({
        releaseAt: impact.releaseAt,
        compared: impact.compared,
        notable: impact.notable,
        covered: Math.round(impact.covered * 100) / 100,
        before: totalsOf(impact.before, "estimatedVisitors"),
        after: totalsOf(impact.after, "estimatedVisitors"),
        pathsWithMoreErrors: impact.paths,
      })),
    }),
    notes,
  };
}

/** The controller's stored totals for a range, read as `trafficReading`. */
export async function readTraffic(
  applicationId: string,
  range: TrafficRange,
  releaseAts: string[] = [],
  now = Date.now(),
) {
  const timeZone = controllerTimeZone();
  const { from, to } = historyDays(range, now, timeZone);
  const history = historyOf(
    readDays(applicationId, from, to),
    range,
    now,
    await currentCollection(applicationId, now),
    timeZone,
  );
  const releases = releaseAts.map((at) => {
    const days = impactDays(Date.parse(at), RELEASE_WINDOW, timeZone);
    return releaseImpact(
      readDays(applicationId, days.from, days.to),
      at,
      RELEASE_WINDOW,
      now,
    );
  });
  return trafficReading(history, releases);
}

// ---------------------------------------------------------------------------
// traffic_setup: the access log, as tested on Caddy 2.11.4, nginx 1.30.5 and
// Traefik 3.7.13 over SSH as root, a sudo user and a user without sudo, and
// in Docker on every Caddy from 2.6.2 (Debian and Ubuntu's own package) to
// 2.11.4, nginx 1.14 to 1.30 and Traefik 2.0 to 3.7. Setting the log up never
// takes a new proxy: each version has a text of its own here.

/** A request of Hallvi's own: in the log, never counted. */
const CHECK = `curl -sS -o /dev/null -w '%{http_code}\\n' -A 'Hallvi access check' -e 'https://shop.example.com/reset?token=check-referrer' 'https://shop.example.com/?utm_source=hallvi-check&token=check-path'`;
const CHECK_WORDS =
  "Then send a request of your own (the user agent Hallvi access check is never counted) and read the newest line: the path has no query string, the referrer none either, utm_source is kept as its own field, and check-path and check-referrer appear nowhere.";

/**
 * Daily, 30 kept. A proxy told to reopen its file gets a fresh one; one that
 * cannot be told (Caddy before 2.11) keeps writing the same file, which is
 * copied and emptied instead.
 */
const LOGROTATE = (path: string, reopen: string | null) =>
  `${path} {
    daily
    rotate 30
    maxage 30
    missingok
    notifempty
    compress
    delaycompress
    nodateext
${
  reopen === null
    ? "    copytruncate"
    : `    create 0640 root adm
    postrotate
        ${reopen}
    endscript`
}
}`;

const RECORD = (
  proxy: string,
  format: string,
  path: string,
  queries: LogQueries,
) =>
  `{kind:'access-log', proxy:'${proxy}', format:'${format}', source:{type:'file', path:'${path}'}, hosts:['shop.example.com','www.shop.example.com'], queries:'${queries}', retainDays:30} — add pageKey:'p' only where the application routes by that query key. queries says what this setup removes before a line is written, and the Traffic page tells the owner exactly that`;

const CADDY_LOG = "/var/log/caddy/hallvi/access.log";

/**
 * Hallvi's named log beside the owner's, from Caddy 2.8: `log_append` and two
 * logs in one site.
 */
const caddySnippet = (writer: string) => `(hallvi_log) {
	log hallvi {
		output file ${CADDY_LOG} {
${writer}
		}
		format filter {
			request>uri regexp \\?.*$ ""
			request>headers>Referer regexp [?#].*$ ""
			resp_headers>Location regexp [?#].*$ ""
			resp_headers>Content-Location delete
			resp_headers>Link delete
			resp_headers>Refresh delete
			resp_headers>Hx-Location delete
			resp_headers>Hx-Redirect delete
			resp_headers>Hx-Push-Url delete
			resp_headers>Hx-Replace-Url delete
			wrap json
		}
	}
	log_append hv_utm_source {query.utm_source}
	log_append hv_utm_medium {query.utm_medium}
	log_append hv_utm_campaign {query.utm_campaign}
	log_append hv_utm_term {query.utm_term}
	log_append hv_utm_content {query.utm_content}
	log_append hv_ref {query.ref}
}

shop.example.com, www.shop.example.com {
	import hallvi_log
	log_append hv_page {query.p}   # only when the application routes by ?p=
	# … the site as it was …
}`;

// Caddy before 2.11 can neither roll daily nor set the file's mode, and
// before 2.9 ignores `mode` without a word. The file is made first with the
// mode Hallvi needs, which Caddy keeps, and logrotate rolls it.
const CADDY_OLDER_FILE = `\`install -d -m 0755 /var/log/caddy/hallvi\`, then \`install -m 0640 -o <user> -g adm /dev/null ${CADDY_LOG}\`, where <user> is the one Caddy runs as (\`ps -o user= -C caddy\`: caddy for a distribution's package, root in the official image). Do this before \`caddy validate\`: validating opens the file, and would otherwise create it as root, where a packaged Caddy cannot write.`;
const CADDY_OLDER_STEPS = [
  "Caddy in a container: bind-mount the host directory /var/log/caddy/hallvi at the same path (a directory, never a single file).",
  "`caddy validate --config /etc/caddy/Caddyfile`, then reload: `systemctl reload caddy` for a distribution's package, `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile` in a container. A reload, never a restart.",
  "Write /etc/logrotate.d/hallvi-caddy owned by root, mode 0644. It copies and empties the file (copytruncate), because this Caddy cannot be told to reopen it. Check it with `logrotate -d /etc/logrotate.conf`.",
];
const CADDY_OLDER_LOSES =
  "Against Caddy 2.11: the file is rolled by logrotate rather than by Caddy, and the few lines written in the instant it is copied each night are lost.";

/** Caddy 2.6 and 2.7 keep one log per site, and have no `log_append`. */
const CADDY_26 = `{
	log hallvi {
		output file ${CADDY_LOG} {
			roll_disabled
		}
		format filter {
			wrap json
			fields {
				request>uri regexp ^([^?]*)|([?&](?:${KEPT_QUERY_KEYS.join("|")})=[^&]*)|(\\?)[^&]*|&[^&]* $1$2$3
				request>headers>Referer regexp [?#].*$ ""
				resp_headers>Location regexp [?#].*$ ""
				resp_headers>Content-Location delete
				resp_headers>Link delete
				resp_headers>Refresh delete
				resp_headers>Hx-Location delete
				resp_headers>Hx-Redirect delete
				resp_headers>Hx-Push-Url delete
				resp_headers>Hx-Replace-Url delete
			}
		}
		include http.log.access
	}
}

(hallvi_log) {
	log {
		output discard
	}
}

shop.example.com, www.shop.example.com {
	import hallvi_log   # only in a site block without a log of its own
	# … the site as it was …
}`;

type Setup = {
  /** The versions this text was run on. */
  tested: string;
  steps: string[];
  config: Record<string, string>;
  record: string;
  /** What this text gives up against the newest one, said to the owner. */
  loses?: string;
};

/**
 * What each proxy is given, by version. `shop.example.com` stands for the
 * application's names, and `p` for a page key where the application routes by
 * one.
 */
export const LOG_SETUP = {
  caddy: {
    tested: "Caddy 2.11",
    steps: [
      "Add the hallvi_log snippet once, at the top of the Caddyfile, and `import hallvi_log` in every site block of this application. The owner's own `log` stays as it is: this is a second, named log beside it.",
      "Add `log_append hv_page {query.p}` inside the site only when the application routes by a query key (WordPress's p); record that key as pageKey.",
      "Caddy in a container: bind-mount the host directory /var/log/caddy/hallvi at the same path (a directory, never a single file — a single-file mount goes stale when the file is replaced).",
      "`caddy validate`, then reload (`caddy reload`, or `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`).",
      CHECK_WORDS,
      "Caddy rotates the files itself (roll_keep_for 30d); no logrotate.",
    ],
    config: {
      Caddyfile: caddySnippet(`			roll_size 100MiB
			roll_interval 24h
			roll_keep 1000
			roll_keep_for 30d
			mode 0640
			dir_mode 0755`),
      check: CHECK,
    },
    record: RECORD("Caddy", "caddy-json", CADDY_LOG, "removed"),
  },
  "caddy-2.8": {
    tested: "Caddy 2.8.4, 2.9.1 and 2.10.2",
    steps: [
      "This Caddy has no roll_interval or dir_mode (they came in 2.11). Use this text as it is; do not add options from a newer one.",
      CADDY_OLDER_FILE,
      "Add the hallvi_log snippet once, at the top of the Caddyfile, and `import hallvi_log` in every site block of this application. The owner's own `log` stays as it is: this is a second, named log beside it.",
      "Add `log_append hv_page {query.p}` inside the site only when the application routes by a query key (WordPress's p); record that key as pageKey.",
      ...CADDY_OLDER_STEPS,
      CHECK_WORDS,
    ],
    config: {
      Caddyfile: caddySnippet("\t\t\troll_disabled"),
      "/etc/logrotate.d/hallvi-caddy": LOGROTATE(CADDY_LOG, null),
      check: CHECK,
    },
    record: RECORD("Caddy", "caddy-json", CADDY_LOG, "removed"),
    loses: CADDY_OLDER_LOSES,
  },
  "caddy-2.6": {
    tested:
      "Caddy 2.6.2 (Debian 12 and 13, Ubuntu 24.04 to 26.04), 2.6.4 (EPEL 9) and 2.7.6",
    steps: [
      "Caddy before 2.8 keeps one log per site, so a second `log` in a site block silently replaces the owner's. Hallvi's log is therefore a named log in the global options that takes every site's access lines (include http.log.access); the record's hosts picks this application's. Use this text as it is; do not add options from a newer one.",
      CADDY_OLDER_FILE,
      "Put the `log hallvi` block inside the global options block, the first block of the Caddyfile (add one there if there is none; there is only ever one). Add the hallvi_log snippet once, and `import hallvi_log` only in a site block of this application that has no `log` of its own: it turns the site's access lines on and discards the site's own copy. A site block with a log of its own already sends its lines; leave it as it is.",
      "That global log is host-wide: every site on this Caddy that logs has its lines, stripped the same way, written to Hallvi's file. Say so when you ask for approval.",
      "This Caddy has no log_append, so the filter keeps the campaign tags in the logged path's query and removes every other key. Where the application routes by a query key (WordPress's p), add it to the list in the request>uri pattern (…|ref|p) and record it as pageKey.",
      ...CADDY_OLDER_STEPS,
      "Then send a request of your own (the user agent Hallvi access check is never counted) and read the newest line: the path's query holds utm_source=hallvi-check and nothing else, the referrer has no query string, and check-path and check-referrer appear nowhere.",
    ],
    config: {
      Caddyfile: CADDY_26,
      "/etc/logrotate.d/hallvi-caddy": LOGROTATE(CADDY_LOG, null),
      check: CHECK,
    },
    record: RECORD("Caddy", "caddy-json", CADDY_LOG, "removed"),
    loses: `${CADDY_OLDER_LOSES} Campaign tags stay in the logged path's query instead of fields of their own (the same keys, nothing else).`,
  },
  nginx: {
    tested: "nginx 1.14 (RHEL 8) to 1.30",
    steps: [
      "`install -d -m 0755 /var/log/nginx/hallvi` — Hallvi's log goes in a directory of its own. A file matching /var/log/nginx/*.log duplicates Debian's own logrotate entry, and logrotate then skips the owner's whole nginx configuration.",
      'Write /etc/nginx/conf.d/hallvi-log.conf (it must be included inside `http {}`, as conf.d is on Debian and the official image). In the $hallvi_page map, list each host that routes by a query key with that key\'s $arg_; otherwise keep only `default "";`.',
      "Add `access_log /var/log/nginx/hallvi/access.log hallvi;` to every `server` block that has an access_log of its own: such a block inherits none from `http`.",
      "An SPA fallback `try_files $uri /index.html;` drops the query on the internal redirect, so $arg_utm_* are empty on every route load: make it `try_files $uri /index.html?$args;` (the same for any fallback URI without ?$args). It changes nothing the application serves.",
      "The access_log in hallvi-log.conf is at the http level, so it is host-wide: every server block without an access_log of its own writes its lines to Hallvi's file. Say so when you ask for approval.",
      "nginx in a container: bind-mount the host directory /var/log/nginx/hallvi at the same path.",
      "`nginx -t`, then reload.",
      "Write /etc/logrotate.d/hallvi-nginx owned by root, mode 0644 (logrotate ignores a configuration root does not own). The postrotate USR1 makes nginx reopen its file; without it nginx keeps writing into the renamed one. Check it with `logrotate -d /etc/logrotate.conf`: no duplicate-entry error, and the owner's nginx logs still listed.",
      CHECK_WORDS,
    ],
    config: {
      "/etc/nginx/conf.d/hallvi-log.conf": `map $request_uri $hallvi_path { "~^(?<hallvi_p>[^?#]*)" $hallvi_p; }
map $http_referer $hallvi_referrer { "~^(?<hallvi_r>[^?#]*)" $hallvi_r; }
map $host $hallvi_page { default ""; shop.example.com $arg_p; }
log_format hallvi escape=json '{"hallvi":1,"time":"$msec","host":"$host","method":"$request_method","path":"$hallvi_path","utm_source":"$arg_utm_source","utm_medium":"$arg_utm_medium","utm_campaign":"$arg_utm_campaign","utm_term":"$arg_utm_term","utm_content":"$arg_utm_content","ref":"$arg_ref","page":"$hallvi_page","status":"$status","duration":"$request_time","address":"$remote_addr","user_agent":"$http_user_agent","referrer":"$hallvi_referrer","fetch_dest":"$http_sec_fetch_dest","fetch_mode":"$http_sec_fetch_mode","sec_purpose":"$http_sec_purpose","purpose":"$http_purpose","content_type":"$sent_http_content_type","cf_ip":"$http_cf_connecting_ip","cf_country":"$http_cf_ipcountry"}';
access_log /var/log/nginx/hallvi/access.log hallvi;`,
      "/etc/logrotate.d/hallvi-nginx": LOGROTATE(
        "/var/log/nginx/hallvi/access.log",
        "docker kill --signal=USR1 <nginx container> >/dev/null 2>&1 || true",
      ),
      "postrotate for nginx on the host (untested)":
        '[ ! -f /run/nginx.pid ] || kill -USR1 "$(cat /run/nginx.pid)"',
      check: CHECK,
    },
    record: RECORD(
      "nginx",
      "hallvi-json",
      "/var/log/nginx/hallvi/access.log",
      "removed",
    ),
  },
  traefik: {
    tested: "Traefik 2.0 to 3.7",
    steps: [
      "Traefik's access log is static configuration: add accessLog to traefik.yml (or the same settings as --accesslog.* flags), and restart Traefik. That restart is host-wide: every application behind this Traefik loses its connections for a moment. Say so when you ask for approval.",
      "Bind-mount the host directory /var/log/traefik into the Traefik container at the same path.",
      "Write /etc/logrotate.d/hallvi-traefik owned by root, mode 0644, with a postrotate USR1 to Traefik so it reopens its file.",
      "hosts is required when this Traefik fronts more than one application: its one log holds every application's lines.",
      "Traefik cannot rewrite a field, so its own file keeps full query strings; Hallvi removes them when it reads. Tell the owner the server's log keeps full addresses.",
      "Keep the header names as written (Cf-Connecting-Ip, not CF-Connecting-IP): Traefik 2.0 matches them letter for letter.",
      "Send a request of your own (the user agent Hallvi access check is never counted) and read the newest line: RequestHost, RequestPath, DownstreamStatus and the kept request_ headers are there.",
    ],
    config: {
      "traefik.yml": `accessLog:
  filePath: /var/log/traefik/access.log
  format: json
  fields:
    defaultMode: keep
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
        Referer: keep
        Sec-Fetch-Dest: keep
        Sec-Fetch-Mode: keep
        Sec-Purpose: keep
        Purpose: keep
        Content-Type: keep
        Cf-Connecting-Ip: keep
        Cf-Ipcountry: keep`,
      "/etc/logrotate.d/hallvi-traefik": LOGROTATE(
        "/var/log/traefik/access.log",
        "docker kill --signal=USR1 <traefik container> >/dev/null 2>&1 || true",
      ),
      check: CHECK,
    },
    record: RECORD(
      "Traefik",
      "traefik-json",
      "/var/log/traefik/access.log",
      "kept",
    ),
  },
} satisfies Record<string, Setup>;
export type SetupVariant = keyof typeof LOG_SETUP;

/** The version `caddy version`, `nginx -v` or `traefik version` printed. */
function versionOf(text: string) {
  const found = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return found
    ? Number(found[1]) * 1e6 + Number(found[2]) * 1e3 + Number(found[3] ?? 0)
    : null;
}
const v = (major: number, minor: number, patch = 0) =>
  major * 1e6 + minor * 1e3 + patch;

const VERSION_COMMAND: Record<Proxy, string> = {
  caddy: "caddy version",
  nginx: "nginx -v",
  traefik: "traefik version",
};

/**
 * The text for the version installed, or why this version cannot be counted.
 * A newer proxy is never a step: `note` says what an older one gives up, and
 * the owner decides whether that is worth an upgrade.
 */
export function setupVariant(
  proxy: Proxy,
  version: string,
): { variant: SetupVariant; note?: string } | { unsupported: string } {
  const at = versionOf(version);
  if (at === null)
    return {
      unsupported: `Read the installed version first (\`${VERSION_COMMAND[proxy]}\`, in the proxy's container if it runs in one) and pass what it prints.`,
    };
  if (proxy === "caddy") {
    if (at >= v(2, 11)) return { variant: "caddy" };
    if (at >= v(2, 8)) return { variant: "caddy-2.8" };
    if (at >= v(2, 6)) return { variant: "caddy-2.6" };
    if (at >= v(2, 5))
      return {
        variant: "caddy-2.6",
        note: "Caddy 2.5 accepts the header filters but does not apply them: the server's file keeps the query string of each referrer and redirect Location, and Hallvi removes the referrer's when it reads. Say so, and save the record with queries:'path-only' rather than 'removed'. It also logs no Content-Type, so Hallvi tells pages from files by their paths.",
      };
    // No distribution in support ships these: the oldest found is 2.6.2.
    return {
      unsupported:
        "Caddy before 2.5 cannot remove a query string before writing it, and logs the client's address where Hallvi does not read it: say this application's traffic cannot be counted with this Caddy. A newer Caddy is the owner's decision.",
    };
  }
  if (proxy === "nginx")
    return at >= v(1, 11, 8)
      ? { variant: "nginx" }
      : {
          unsupported:
            "nginx before 1.11.8 has no escape=json, so a request could break Hallvi's line: say this application's traffic cannot be counted. A newer nginx is the owner's decision.",
        };
  return at >= v(2, 0)
    ? { variant: "traefik" }
    : {
        unsupported:
          "Traefik 1 is configured differently and was never tested: say this application's traffic cannot be counted. Moving to Traefik 2 or 3 is the owner's decision.",
      };
}

const SETUP_RULES = [
  "Hallvi's log goes beside any log the owner already has; never change or remove theirs.",
  "Never upgrade, replace or reinstall the proxy to set this log up, and never restart it where a reload does: every version it takes has its own tested text here. An upgrade may be put to the owner once, as an optional suggestion with what this version gives up; it is never a step of the setup, and the setup does not wait for it.",
  "An application that already has an access-log record keeps it, untouched, until the new log is proved: set the new log up, see a request of your own in it correctly stripped, and only then update that same record in place, by its id, to the new source. Never retire it first and never save a second one. If the setup fails, is declined or is left unfinished, the existing record stays exactly as it was.",
  "When the proxy serves more than one application (other site blocks, server blocks or routers), say so in any approval you ask for: a reload or restart reaches every site on it, and a change outside this application's own site block is host-wide. Prefer changes inside this application's site block, and name each part that is host-wide.",
  "The record's path is the host's path. A file source is preferred: docker logs history ends when the container is recreated.",
  "hosts is every name the application answers on, lower case, without a port.",
  "Hallvi's SSH user must be root, have passwordless sudo, or be able to read the files (Traffic says which file it cannot read otherwise).",
  "Caddy writes a failed request's error entries, with the full query string, to its default logger (stderr, docker logs). Do not quote those lines into records or replies.",
];

export function trafficSetup(proxy: Proxy, version: string) {
  const chosen = setupVariant(proxy, version);
  if ("unsupported" in chosen)
    return { proxy, version, unsupported: chosen.unsupported };
  const setup: Setup = LOG_SETUP[chosen.variant];
  return {
    proxy,
    version,
    variant: chosen.variant,
    tested: setup.tested,
    rules: SETUP_RULES,
    ...(chosen.note && { note: chosen.note }),
    ...(setup.loses && { loses: setup.loses }),
    steps: setup.steps,
    config: setup.config,
    record: setup.record,
    names:
      "shop.example.com stands for the application's own names, p for its page key.",
  };
}

// ---------------------------------------------------------------------------
// traffic_script

export function trafficScriptFor(
  proxy: Proxy,
  applicationId: string,
  pageKey?: string,
) {
  if (pageKey !== undefined && !PAGE_KEY_NAME.test(pageKey))
    throw new Error("Invalid traffic page key.");
  // An application that routes pages by a query key names it on its tag, so
  // the script sends that key's value and the log and script agree on pages.
  const configuredTag = (text: string) =>
    pageKey
      ? text.replaceAll("<script", `<script ${PAGE_KEY_ATTRIBUTE}="${pageKey}"`)
      : text;
  const script = trafficScript();
  const check = eventPath({ t: "ping", s: "hallvicheck1", p: "/" });
  return {
    file: SCRIPT_FILE,
    sha256: script.sha256,
    version: script.version,
    content: script.content,
    install: `mkdir -p ${SCRIPT_DIRECTORY}/_hv, write content to ${SCRIPT_FILE} exactly (mode 0644), and check that \`sha256sum ${SCRIPT_FILE}\` prints sha256. One file serves every application on the server. A proxy in a container mounts ${SCRIPT_DIRECTORY} read-only at the same path.`,
    serving:
      proxy === "traefik"
        ? SCRIPT_SERVING.traefik(applicationId)
        : SCRIPT_SERVING[proxy],
    ...(proxy === "traefik" && {
      names:
        "The router, service and Compose service names belong to this application and stay the same on repeat installation. Keep them as given; replace app.example.com with this application's own hosts, and match its entry points, TLS and network. Removing this application's router and service leaves the other applications' names alone. The script file and Caddyfile are shared: keep them while any application uses them.",
    }),
    tag: configuredTag(SCRIPT_TAG),
    includes: SCRIPT_INCLUDES.map((include) => ({
      ...include,
      line: configuredTag(include.line),
      ...(include.note ? { note: configuredTag(include.note) } : {}),
    })),
    goals:
      "Goals are the owner's to mark in their own code: window.hv?.('signup') after the action, or data-hv-goal=\"signup\" on a link or button (letters, digits, _ and -, up to 40). That is application code, outside the operability pull request: tell the owner how rather than writing it, and keep anything personal out of a goal's name.",
    check: [
      `curl -sS -A 'Hallvi access check' https://<host>/_hv/s.js | sha256sum — the same sha256.`,
      `curl -sS -o /dev/null -w '%{http_code}\\n' -A 'Hallvi access check' 'https://<host>${check}' — 204, and the newest log line has that ${EVENT_PREFIX} path whole. Hallvi's user agent keeps it from being counted.`,
      "After the owner merges the include and it is released: the page's HTML has the tag. The first real visitor's event sets the switch point Traffic shows.",
    ],
  };
}
