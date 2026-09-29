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
  OTHER,
  eventPath,
  type Collection,
  type Gap,
  type Ranked,
  type ReleaseImpact,
  type TrafficHistory,
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
const LIST_COUNTS: Record<ListName, string> = {
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
type ListName =
  | "pages"
  | "sources"
  | "campaigns"
  | "countries"
  | "devices"
  | "browsers"
  | "systems"
  | "errors"
  | "goals"
  | "bots";

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

function totalsOf(
  totals: Omit<TrafficHistory["totals"], "visitorsPer">,
  visitors: string,
) {
  return {
    requests: totals.requests,
    pageViews: totals.views,
    errors5xx: totals.errors,
    botRequests: totals.bots,
    p95ResponseMs: totals.p95Ms,
    [visitors]: totals.visitors,
    [`${visitors}HitByErrors`]: totals.errorVisitors,
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
      `Release windows compare ${RELEASE_WINDOW} minutes before with ${RELEASE_WINDOW} after; their visitor figures are hourly estimates added together, so they can overstate.`,
    );

  const lists: Record<string, unknown> = {};
  const empty: string[] = [];
  for (const name of Object.keys(LIST_COUNTS) as ListName[]) {
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
        history.range === "24h" ? "hour" : "day",
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
          ? [point.at, 0, "gap: not counted"]
          : [
              point.at,
              Math.round(point.covered * 100) / 100,
              point.requests,
              point.views,
              point.visitors,
              point.errors,
              point.errorVisitors,
              point.bots,
              point.p95Ms,
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
        row.p75,
        row.samples,
      ]),
    }),
    ...(history.scriptErrors.length > 0 && {
      javascriptErrors: history.scriptErrors
        .slice(0, LISTED)
        .map((row) => [row.path, row.count]),
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
export function readTraffic(
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
    currentCollection(applicationId, now),
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
// Traefik 3.7.13 over SSH as root, a sudo user and a user without sudo.

/** A request of Hallvi's own: in the log, never counted. */
const CHECK = `curl -sS -o /dev/null -w '%{http_code}\\n' -A 'Hallvi access check' -e 'https://shop.example.com/reset?token=check-referrer' 'https://shop.example.com/?utm_source=hallvi-check&token=check-path'`;
const CHECK_WORDS =
  "Then send a request of your own (the user agent Hallvi access check is never counted) and read the newest line: the path has no query string, the referrer none either, utm_source is kept as its own field, and check-path and check-referrer appear nowhere.";

const LOGROTATE = (path: string, reopen: string) =>
  `${path} {
    daily
    rotate 30
    maxage 30
    missingok
    notifempty
    compress
    delaycompress
    nodateext
    create 0640 root adm
    postrotate
        ${reopen}
    endscript
}`;

const RECORD = (proxy: string, format: string, path: string) =>
  `{kind:'access-log', proxy:'${proxy}', format:'${format}', source:{type:'file', path:'${path}'}, hosts:['shop.example.com','www.shop.example.com'], retainDays:30} — add pageKey:'p' only where the application routes by that query key`;

/**
 * What each proxy is given. `shop.example.com` stands for the application's
 * names, and `p` for a page key where the application routes by one.
 */
export const LOG_SETUP: Record<
  Proxy,
  { steps: string[]; config: Record<string, string>; record: string }
> = {
  caddy: {
    steps: [
      "Add the hallvi_log snippet once, at the top of the Caddyfile, and `import hallvi_log` in every site block of this application. The owner's own `log` stays as it is: this is a second, named log beside it.",
      "Add `log_append hv_page {query.p}` inside the site only when the application routes by a query key (WordPress's p); record that key as pageKey.",
      "Caddy in a container: bind-mount the host directory /var/log/caddy/hallvi at the same path (a directory, never a single file — a single-file mount goes stale when the file is replaced).",
      "`caddy validate`, then reload (`caddy reload`, or `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`).",
      CHECK_WORDS,
      "Caddy rotates the files itself (roll_keep_for 30d); no logrotate.",
    ],
    config: {
      Caddyfile: `(hallvi_log) {
	log hallvi {
		output file /var/log/caddy/hallvi/access.log {
			roll_size 100MiB
			roll_interval 24h
			roll_keep 1000
			roll_keep_for 30d
			mode 0640
			dir_mode 0755
		}
		format filter {
			request>uri regexp \\?.*$ ""
			request>headers>Referer regexp [?#].*$ ""
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
}`,
      check: CHECK,
    },
    record: RECORD("Caddy", "caddy-json", "/var/log/caddy/hallvi/access.log"),
  },
  nginx: {
    steps: [
      "`install -d -m 0755 /var/log/nginx/hallvi` — Hallvi's log goes in a directory of its own. A file matching /var/log/nginx/*.log duplicates Debian's own logrotate entry, and logrotate then skips the owner's whole nginx configuration.",
      'Write /etc/nginx/conf.d/hallvi-log.conf (it must be included inside `http {}`, as conf.d is on Debian and the official image). In the $hallvi_page map, list each host that routes by a query key with that key\'s $arg_; otherwise keep only `default "";`.',
      "Add `access_log /var/log/nginx/hallvi/access.log hallvi;` to every `server` block that has an access_log of its own: such a block inherits none from `http`.",
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
    record: RECORD("nginx", "hallvi-json", "/var/log/nginx/hallvi/access.log"),
  },
  traefik: {
    steps: [
      "Traefik's access log is static configuration: add accessLog to traefik.yml (or the same settings as --accesslog.* flags), and restart Traefik.",
      "Bind-mount the host directory /var/log/traefik into the Traefik container at the same path.",
      "Write /etc/logrotate.d/hallvi-traefik owned by root, mode 0644, with a postrotate USR1 to Traefik so it reopens its file.",
      "hosts is required when this Traefik fronts more than one application: its one log holds every application's lines.",
      "Traefik cannot rewrite a field, so its own file keeps full query strings; Hallvi removes them when it reads. Tell the owner the server's log keeps full addresses.",
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
        CF-Connecting-IP: keep
        CF-IPCountry: keep`,
      "/etc/logrotate.d/hallvi-traefik": LOGROTATE(
        "/var/log/traefik/access.log",
        "docker kill --signal=USR1 <traefik container> >/dev/null 2>&1 || true",
      ),
      check: CHECK,
    },
    record: RECORD("Traefik", "traefik-json", "/var/log/traefik/access.log"),
  },
};

const SETUP_RULES = [
  "Hallvi's log goes beside any log the owner already has; never change or remove theirs.",
  "The record's path is the host's path. A file source is preferred: docker logs history ends when the container is recreated.",
  "hosts is every name the application answers on, lower case, without a port.",
  "Hallvi's SSH user must be root, have passwordless sudo, or be able to read the files (Traffic says which file it cannot read otherwise).",
  "Caddy writes a failed request's error entries, with the full query string, to its default logger (stderr, docker logs). Do not quote those lines into records or replies.",
  "Save the access-log record only once a request of your own shows up in the new log, correctly stripped; update the existing access-log record instead of saving a second.",
];

export function trafficSetup(proxy: Proxy) {
  const setup = LOG_SETUP[proxy];
  return {
    proxy,
    rules: SETUP_RULES,
    steps: setup.steps,
    config: setup.config,
    record: setup.record,
    names:
      "shop.example.com stands for the application's own names, p for its page key.",
  };
}

// ---------------------------------------------------------------------------
// traffic_script

export function trafficScriptFor(proxy: Proxy) {
  const script = trafficScript();
  const check = eventPath({ t: "ping", s: "hallvicheck1", p: "/" });
  return {
    file: SCRIPT_FILE,
    sha256: script.sha256,
    version: script.version,
    content: script.content,
    install: `mkdir -p ${SCRIPT_DIRECTORY}/_hv, write content to ${SCRIPT_FILE} exactly (mode 0644), and check that \`sha256sum ${SCRIPT_FILE}\` prints sha256. One file serves every application on the server. A proxy in a container mounts ${SCRIPT_DIRECTORY} read-only at the same path.`,
    serving: SCRIPT_SERVING[proxy],
    tag: SCRIPT_TAG,
    includes: SCRIPT_INCLUDES,
    check: [
      `curl -sS -A 'Hallvi access check' https://<host>/_hv/s.js | sha256sum — the same sha256.`,
      `curl -sS -o /dev/null -w '%{http_code}\\n' -A 'Hallvi access check' 'https://<host>${check}' — 204, and the newest log line has that ${EVENT_PREFIX} path whole. Hallvi's user agent keeps it from being counted.`,
      "After the owner merges the include and it is released: the page's HTML has the tag. The first real visitor's event sets the switch point Traffic shows.",
    ],
  };
}
