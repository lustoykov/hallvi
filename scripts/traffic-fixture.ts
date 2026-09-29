// Realistic traffic for Hallvi's traffic pages, and an independent count to
// hold what Hallvi stores against.
//
//   node --import tsx scripts/traffic-fixture.ts backfill --format caddy-json
//     --shape busy --days 30 --out work/traffic --seed 7
//     [--releases 2026-09-20T10:00:00Z,…] [--host example.test]
//     [--end <iso>] [--name access.log]
//   node --import tsx scripts/traffic-fixture.ts live --url https://example.test
//     --shape spa --rate 20 [--minutes 10] [--seed 7]
//   node --import tsx scripts/traffic-fixture.ts verify --format caddy-json
//     [--time-zone Europe/Sofia] <files…>
//   node --import tsx scripts/traffic-fixture.ts ranges [<dbip-country.mmdb>]
//
// The design forbids writing numbers into databases: realistic traffic has
// to reach Hallvi the way real traffic does. So `backfill` writes history as
// a proxy's own rotated log files, named the way that proxy's rotation names
// them, and `live` sends real requests through a proxy. Neither touches
// Hallvi.
//
// `verify` is the ground truth the collection experiment compares stored
// totals with. It reads raw files itself and counts them by the design's
// definitions, importing none of Hallvi's readers or counting, so a mistake
// there cannot hide by being made twice.
//
// Every line carries an `X-Hallvi-Fixture` request header naming what the
// generator made it as: browser, bot, client, or hallvi for Hallvi's own
// access check. The proxy logs it like any other header and no reader looks
// at it, so a fixture line counts exactly as a real one would and can still
// be told apart — and `verify` knows the bots from what it generated rather
// than by guessing.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import {
  brotliDecompressSync,
  gunzipSync,
  gzipSync,
  inflateSync,
  zstdDecompressSync,
} from "node:zlib";
import { Reader, type Response } from "mmdb-lib";

import {
  EVENT_PREFIX,
  eventPath,
  HALLVI_PATH_PREFIX,
  KEPT_QUERY_KEYS,
  LOG_FORMATS,
  PING_SECONDS,
  SCRIPT_PATH,
  type LogFormat,
  type ScriptEvent,
} from "../src/server/traffic/contract";
import {
  API_CLIENTS,
  AUDIENCES,
  BOTS,
  BROWSERS,
  COUNTRIES,
  HN_POST,
  NETWORKS,
  PROBES,
  SCANNER_NETWORKS,
  SECTIONS,
  SHAPE_DATA,
  SHAPES,
  SOURCES,
  WEBHOOKS,
  WIDTHS,
  type Asset,
  type Bot,
  type Browser,
  type Device,
  type Endpoint,
  type Shape,
  type ShapeData,
} from "./traffic-fixture-data";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** What Hallvi's own checks call themselves (src/server/access-log.ts). */
const HALLVI_CHECK = "Hallvi access check";
const MARKER = "x-hallvi-fixture";
const ALT_SVC = 'h3=":443"; ma=2592000';

const HELP = `Realistic traffic through the real pipeline, and an independent count.

  backfill --format caddy-json|traefik-json|hallvi-json --shape ${SHAPES.join("|")}
           --out <dir> [--days 30] [--seed 1] [--end <iso>]
           [--releases <iso,…>] [--host example.test] [--name access.log]
      Writes --days of history ending at --end (default now) as rotated log
      files, named and cut as the rotation Pi sets up names and cuts them:
      Caddy's <name>-<time>-time.log.gz every 24 hours, logrotate's daily
      <name>.1 and <name>.N.gz for nginx (hallvi-json) and Traefik. The
      newest file ends at --end, so set --end to the first line of the live
      log the files will sit beside.
      Writes traffic-fixture.json, the list of files written, beside them,
      and never overwrites a file. The same arguments write the same bytes.

  live --url <base> --shape <shape> --rate <visits a minute>
       [--minutes <n>] [--seed <n>]
      Sends real requests with browsers' headers, bots and, for spa, script
      events, until --minutes pass or Ctrl-C. Every request comes from this
      machine's one address, so the visitor estimate counts user agents.

  verify --format <format> [--time-zone <IANA zone>] <files…>
      Counts the files per day (default: this machine's time zone) and
      prints JSON: requests, views, 5xx errors, bots, events by type and
      distinct address and user agent. It imports none of Hallvi's counting.

  ranges [<dbip-country.mmdb>]
      Checks that every address block lies in one country, the one meant,
      in the DB-IP Lite database Hallvi ships (or the one named).

Every line carries an X-Hallvi-Fixture header: browser, bot, client or hallvi.
`;

// ---------------------------------------------------------------------------
// Randomness that comes out the same for the same seed.

const LETTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
];

class Random {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(key: string) {
    // cyrb128 turns the key into sfc32's four words of state.
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;
    for (let index = 0; index < key.length; index++) {
      const code = key.charCodeAt(index);
      h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    this.a = h1;
    this.b = h2 ^ h1;
    this.c = h3 ^ h1;
    this.d = h4 ^ h1;
  }

  /** Uniform in [0, 1). */
  next() {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, weight] of entries) total += weight;
    let left = this.next() * total;
    for (const [item, weight] of entries) {
      left -= weight;
      if (left < 0) return item;
    }
    return entries[entries.length - 1][0];
  }
  gauss() {
    const u = 1 - this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  /** Log-normal: mostly near the median, with a long slow tail. */
  around(median: number, spread: number) {
    return median * Math.exp(spread * this.gauss());
  }
  poisson(mean: number) {
    if (mean <= 0) return 0;
    if (mean > 40)
      return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.gauss()));
    const limit = Math.exp(-mean);
    let count = -1;
    for (let product = 1; product > limit; count++) product *= this.next();
    return count;
  }
  id(length: number) {
    let text = "";
    for (let index = 0; index < length; index++) text += this.pick(LETTERS);
    return text;
  }
  shuffle<T>(items: readonly T[]) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = this.int(0, index);
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }
  hex(length: number) {
    let text = "";
    for (let index = 0; index < length; index++)
      text += this.int(0, 15).toString(16);
    return text;
  }
  bits(count: number) {
    let value = 0n;
    for (let left = count; left > 0; left -= 16)
      value =
        (value << BigInt(Math.min(16, left))) |
        BigInt(this.int(0, 2 ** Math.min(16, left) - 1));
    return value;
  }
}

// ---------------------------------------------------------------------------
// Addresses, written the way Go writes them, which is how every proxy logs.

function parseV4(text: string) {
  return text.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}
function formatV4(value: number) {
  return [24, 16, 8, 0]
    .map((shift) => Math.floor(value / 2 ** shift) % 256)
    .join(".");
}
function parseV6(text: string) {
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array<string>(8 - left.length - right.length).fill("0"),
          ...right,
        ];
  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(parseInt(group, 16)),
    0n,
  );
}
/** RFC 5952: the longest run of zero groups shortened, lower case. */
function formatV6(value: bigint) {
  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 0xffffn),
  );
  let best = -1;
  let length = 1;
  for (let at = 0; at < 8;) {
    let end = at;
    while (end < 8 && groups[end] === 0) end++;
    if (end - at > length) [best, length] = [at, end - at];
    at = Math.max(end, at + 1);
  }
  const hex = groups.map((group) => group.toString(16));
  if (best < 0) return hex.join(":");
  return `${hex.slice(0, best).join(":")}::${hex.slice(best + length).join(":")}`;
}

/** An address in a block. `pool` keeps to a few hosts, as carrier NAT does. */
function addressIn(random: Random, block: string, pool = 0) {
  const [base, bits] = block.split("/");
  const prefix = Number(bits);
  if (base.includes(":"))
    return formatV6(parseV6(base) | random.bits(128 - prefix));
  const hosts = 2 ** (32 - prefix) - 2;
  const offset = pool
    ? 1 + ((random.int(0, pool - 1) * 7919) % hosts)
    : random.int(1, hosts);
  return formatV4(parseV4(base) + offset);
}

function networkAddress(random: Random, name: string) {
  const network = NETWORKS[name];
  const v6 = network.v6.length > 0 && random.chance(0.15);
  return addressIn(random, random.pick(v6 ? network.v6 : network.v4));
}

// ---------------------------------------------------------------------------
// People: a browser on a device, somewhere, on a network.

interface Person {
  key: string;
  country: string;
  browser: Browser;
  version: string;
  ua: string;
  device: Device;
  /** The home address; phones behind carrier NAT share theirs. */
  v4: string;
  /** A v6 /64 whose host part changes daily, as privacy extensions do. */
  v6: bigint | null;
  width: number;
}

function newPerson(key: string, audience: string, phones: number): Person {
  const random = new Random(key);
  const country = random.weighted(Object.entries(AUDIENCES[audience]));
  const device: Device = random.chance(phones)
    ? "mobile"
    : random.chance(0.04)
      ? "tablet"
      : "desktop";
  const browser = random.weighted(
    BROWSERS.filter((item) => item.device === device).map(
      (item) => [item, item.weight] as const,
    ),
  );
  const version = random.weighted(browser.versions);
  const place = COUNTRIES[country];
  let v6: bigint | null = null;
  if (place.v6.length && random.chance(device === "mobile" ? 0.5 : 0.3)) {
    const [base, bits] = random.pick(place.v6).split("/");
    v6 = parseV6(base) | (random.bits(64 - Number(bits)) << 64n);
  }
  return {
    key,
    country,
    browser,
    version,
    ua: browser.ua.replaceAll("{v}", version),
    device,
    v4: addressIn(random, random.pick(place.v4), device === "mobile" ? 240 : 0),
    v6,
    width: random.pick(WIDTHS[device]),
  };
}

/** Where a person browses from on a given day. */
function addressOn(person: Person, day: number) {
  const random = new Random(`${person.key}/at/${day}`);
  if (person.v6 !== null) return formatV6(person.v6 | random.bits(64));
  // A phone moves between networks; a laptop mostly stays at home.
  if (person.device === "mobile" && random.chance(0.3))
    return addressIn(random, random.pick(COUNTRIES[person.country].v4), 240);
  return person.v4;
}

// ---------------------------------------------------------------------------
// What a browser sends.

type Dest = "document" | "style" | "script" | "font" | "image" | "empty";
type Site = "none" | "same-origin" | "cross-site";

const ACCEPT: Record<Browser["engine"], Record<Dest, string>> = {
  chromium: {
    document:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    style: "text/css,*/*;q=0.1",
    script: "*/*",
    font: "*/*",
    image: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    empty: "*/*",
  },
  webkit: {
    document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    style: "text/css,*/*;q=0.1",
    script: "*/*",
    font: "*/*",
    image:
      "image/webp,image/avif,image/jxl,image/heic,image/heic-sequence,video/*;q=0.8,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
    empty: "*/*",
  },
  gecko: {
    document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    style: "text/css,*/*;q=0.1",
    script: "*/*",
    font: "application/font-woff2;q=1.0,application/font-woff;q=0.9,*/*;q=0.8",
    image:
      "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
    empty: "*/*",
  },
};
const PRIORITY: Record<Dest, string> = {
  document: "u=0, i",
  style: "u=0",
  script: "u=1",
  font: "u=0",
  image: "u=1, i",
  empty: "u=1, i",
};

/** Sec-CH-UA as Chromium builds it: a grease brand, permuted by version. */
function brands(brand: string, major: number) {
  const chars = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const order = orders[major % 6];
  const list: string[] = [];
  list[order[0]] =
    `"Not${chars[major % 11]}A${chars[(major + 1) % 11]}Brand";v="${["8", "99", "24"][major % 3]}"`;
  list[order[1]] = `"Chromium";v="${major}"`;
  list[order[2]] = `"${brand}";v="${major}"`;
  return list.join(", ");
}

interface Ask {
  dest: Dest;
  mode: "navigate" | "no-cors" | "cors";
  site: Site;
  referrer: string | null;
  user?: boolean;
  purpose?: string;
  accept?: string;
  more?: [string, string][];
}

function browserHeaders(
  person: Pick<Person, "browser" | "version" | "ua" | "device" | "country">,
  ask: Ask,
  marker: Kind,
): [string, string][] {
  const { browser } = person;
  const headers: [string, string][] = [];
  if (browser.hints)
    headers.push(
      ["sec-ch-ua", brands(browser.hints.brand, Number(person.version))],
      ["sec-ch-ua-mobile", person.device === "mobile" ? "?1" : "?0"],
      ["sec-ch-ua-platform", `"${browser.hints.platform}"`],
    );
  if (ask.dest === "document") headers.push(["upgrade-insecure-requests", "1"]);
  headers.push(
    ["user-agent", person.ua],
    ["accept", ask.accept ?? ACCEPT[browser.engine][ask.dest]],
  );
  if (ask.purpose) headers.push(["sec-purpose", ask.purpose]);
  if (!browser.noFetchMetadata) {
    headers.push(["sec-fetch-site", ask.site], ["sec-fetch-mode", ask.mode]);
    if (ask.user) headers.push(["sec-fetch-user", "?1"]);
    headers.push(["sec-fetch-dest", ask.dest]);
  }
  if (ask.referrer) headers.push(["referer", ask.referrer]);
  headers.push(
    [
      "accept-encoding",
      browser.engine === "webkit"
        ? "gzip, deflate, br"
        : "gzip, deflate, br, zstd",
    ],
    ["accept-language", COUNTRIES[person.country].language],
    ...(ask.more ?? []),
    ["priority", PRIORITY[ask.dest]],
    [MARKER, marker],
  );
  return headers;
}

// ---------------------------------------------------------------------------
// One request as the proxy saw it.

type Kind = "browser" | "bot" | "client" | "hallvi";
type Proto = "HTTP/1.1" | "HTTP/2.0" | "HTTP/3.0";

interface Connection {
  address: string;
  port: number;
  proto: Proto;
  resumed: boolean;
}

interface Hit extends Connection {
  /** When the request ended, in epoch milliseconds. */
  at: number;
  ms: number;
  kind: Kind;
  method: string;
  path: string;
  /** The query string as the client sent it, without "?". */
  query: string;
  headers: [string, string][];
  status: number;
  size: number;
  /** The answer's Content-Type, or null for none. */
  type: string | null;
  /** More answer headers: Location, Etag, Cache-Control. */
  answer: [string, string][];
  /** Answered by the proxy itself: Hallvi's script and its events. */
  proxy: boolean;
  bytesRead: number;
}

interface Request {
  method?: string;
  path: string;
  query?: string;
  headers: [string, string][];
  bytesRead?: number;
}

interface Answer {
  status: number;
  size: number;
  type: string | null;
  ms: number;
  answer?: [string, string][];
  proxy?: boolean;
  /** What the application says when a release broke this path. */
  broken?: "html" | "json";
}

interface Release {
  at: number;
  /** How long the restart answered 502. */
  blip: number;
  /** Until when the release's bug answered 500, if it had one. */
  bugUntil: number;
}

interface Plan {
  seed: string;
  shape: Shape;
  data: ShapeData;
  host: string;
  origin: string;
  start: number;
  end: number;
  days: number;
  releases: Release[];
  /** Where the owner sits, for Hallvi's own access checks. */
  owner: string;
  /** Each page's path as a pattern, and its section. */
  patterns: [RegExp, string][];
}

function makePlan(options: {
  seed: string;
  shape: Shape;
  host: string;
  start: number;
  end: number;
  releases: number[];
}): Plan {
  const releases = [...options.releases]
    .sort((a, b) => a - b)
    .map((at, index, all) => {
      const random = new Random(`${options.seed}/release/${at}`);
      const next = all[index + 1] ?? Infinity;
      return {
        at,
        blip: random.int(12, 40) * SECOND,
        bugUntil: random.chance(0.6)
          ? Math.min(at + random.int(30, 110) * MINUTE, next)
          : at,
      };
    });
  const data = SHAPE_DATA[options.shape];
  return {
    ...options,
    data,
    origin: `https://${options.host}`,
    days: Math.round((options.end - options.start) / DAY),
    releases,
    owner: addressIn(new Random(`${options.seed}/owner`), "79.100.0.0/16"),
    patterns: data.pages.map((page) => [
      new RegExp(`^${page.path.replace("{id}", "\\d+")}$`),
      page.section,
    ]),
  };
}

/** A restart's 502s, a bug's 500s and cold caches after each release. */
function afterRelease(plan: Plan, start: number, path: string) {
  for (let index = plan.releases.length - 1; index >= 0; index--) {
    const release = plan.releases[index];
    if (start < release.at || start >= release.at + 2 * HOUR) continue;
    if (start < release.at + release.blip)
      return { down: true, bug: false, slow: 1 };
    return {
      down: false,
      bug:
        start < release.bugUntil &&
        plan.data.bug.some((prefix) => path.startsWith(prefix)),
      slow: 1 + 0.9 * Math.exp(-(start - release.at) / (4 * MINUTE)),
    };
  }
  return { down: false, bug: false, slow: 1 };
}

/** The build a file belongs to: a release changes every hashed name. */
function buildOf(plan: Plan, at: number) {
  let build = 0;
  for (const release of plan.releases) if (release.at <= at) build++;
  return build;
}

const hashes = new Map<string, string>();
function hashed(plan: Plan, path: string, at: number) {
  const key = `${plan.seed}/${path}/${buildOf(plan, at)}`;
  let hash = hashes.get(key);
  if (!hash) {
    hash = createHash("sha256").update(key).digest("base64url").slice(0, 8);
    hashes.set(key, hash);
  }
  return path.replace("{hash}", hash);
}

class Day {
  /** Decides which requests a release's bug breaks. */
  private readonly fate: Random;

  constructor(
    readonly plan: Plan,
    readonly index: number,
    readonly start: number,
    readonly out: Hit[],
  ) {
    this.fate = new Random(`${plan.seed}/fate/${start}`);
  }

  emit(
    kind: Kind,
    connection: Connection,
    start: number,
    request: Request,
    answer: Answer,
  ) {
    let { status, size, type, ms } = answer;
    let extra = answer.answer ?? [];
    if (!answer.proxy) {
      // Hallvi's script and events are the proxy's own answers, so they
      // keep flowing while the application restarts.
      const release = afterRelease(this.plan, start, request.path);
      if (release.down) {
        [status, size, type, extra] = [502, 0, null, []];
        ms = 0.4 + this.fate.next() * 2;
      } else {
        ms *= release.slow;
        if (release.bug && this.fate.chance(0.45)) {
          const html = answer.broken !== "json";
          status = 500;
          size = html ? 1_734 : 64;
          type = html ? "text/html; charset=utf-8" : "application/json";
          extra = [];
        }
      }
    }
    const hit: Hit = {
      ...connection,
      at: start + ms,
      ms,
      kind,
      method: request.method ?? "GET",
      path: request.path,
      query: request.query ?? "",
      headers: request.headers,
      status,
      size,
      type,
      answer: extra,
      proxy: answer.proxy ?? false,
      bytesRead: request.bytesRead ?? 0,
    };
    this.out.push(hit);
    return hit;
  }

  /** A moment in the day, at a local hour drawn from the shape's rhythm. */
  localTime(random: Random, country: string, hours = this.plan.data.hours) {
    const hour = random.weighted(
      hours.map((weight, at) => [at, weight] as const),
    );
    const offset = COUNTRIES[country]?.offset ?? 0;
    return (
      this.start + (hour - offset + random.next()) * HOUR + random.next() * 999
    );
  }
}

// ---------------------------------------------------------------------------
// Browsers visiting.

interface Visit {
  person: Person;
  connection: Connection;
  /** Signed in to the application. */
  member: boolean;
  /** Came before: long-cached files are already in the browser. */
  warm: boolean;
  /** Files this browser already has. */
  cached: Set<string>;
  /** Transfer speed in bytes a millisecond. */
  speed: number;
}

interface Landing {
  path: string;
  query: string;
  referrer: string | null;
  source: string;
}

function startVisit(
  plan: Plan,
  person: Person,
  day: number,
  random: Random,
  options: { member: boolean; warm: boolean },
): Visit {
  // After one visit a browser remembers Caddy's Alt-Svc and uses HTTP/3.
  const proto: Proto =
    options.warm && random.chance(0.7) ? "HTTP/3.0" : "HTTP/2.0";
  return {
    person,
    connection: {
      address: addressOn(person, day),
      port: random.int(32768, 65535),
      proto,
      resumed: options.warm && random.chance(0.6),
    },
    ...options,
    cached: new Set(),
    speed:
      person.device === "desktop"
        ? random.around(4_000, 0.6)
        : random.around(900, 0.8),
  };
}

function pickPage(plan: Plan, random: Random, section: string) {
  const pages = plan.data.pages.filter((page) => page.section === section);
  if (!pages.length) return "/";
  const page = random.weighted(pages.map((item) => [item, item.weight]));
  return page.path.replace("{id}", String(random.int(1, 60)));
}

/** Where a visitor goes next: another page, along the site's own links. */
function nextPage(plan: Plan, random: Random, section: string, from: string) {
  const moves = Object.entries(plan.data.moves[section] ?? { home: 1 });
  for (let tries = 0; tries < 4; tries++) {
    const next = pickPage(plan, random, random.weighted(moves));
    if (next !== from) return next;
  }
  return "/";
}

function sectionOf(plan: Plan, path: string) {
  for (const [pattern, section] of plan.patterns)
    if (pattern.test(path)) return section;
  return null;
}

function landingFor(
  plan: Plan,
  random: Random,
  source: string,
  lands: Record<string, number> | string,
  day: number,
): Landing {
  const known = SOURCES[source];
  let path =
    typeof lands === "string"
      ? lands
      : pickPage(plan, random, random.weighted(Object.entries(lands)));
  // Old links outlive the pages they pointed at.
  if (source !== "direct" && random.chance(0.015))
    path = random.pick([
      "/blog/2024/why-we-rewrote-everything",
      "/docs/v1/getting-started",
      "/p/launch",
      "/careers/senior-engineer",
    ]);
  const query = (known.queries ? random.weighted(known.queries) : "")
    .replace("{issue}", issueOf(plan, day))
    .replace("{token}", `fixture-${random.hex(32)}`);
  return {
    path,
    query,
    referrer: random.weighted(known.referrers),
    source,
  };
}

function issueOf(plan: Plan, day: number) {
  const date = new Date(day);
  if (plan.shape === "busy") {
    const first = Date.UTC(date.getUTCFullYear(), 0, 1);
    return `weekly-${Math.ceil((day - first) / DAY / 7 + 1)}`;
  }
  return `product-update-${date
    .toLocaleString("en", { month: "long", timeZone: "UTC" })
    .toLowerCase()}`;
}

const pageUrl = (plan: Plan, path: string, query: string) =>
  `${plan.origin}${path}${query ? `?${query}` : ""}`;

/** HTML sizes, as sent compressed, and the application's time per page. */
const DOCUMENT: Record<string, [bytes: number, ms: number]> = {
  home: [24_800, 38],
  pricing: [19_200, 30],
  blog: [21_600, 31],
  docs: [17_900, 27],
  about: [12_400, 24],
  auth: [8_300, 36],
  reset: [7_900, 42],
  app: [9_100, 88],
  posts: [11_200, 9],
  projects: [8_900, 8],
  cv: [184_300, 6],
};

/**
 * One document navigation, following the application's redirects the way
 * a browser does. Returns where the browser ended up and when.
 */
function navigate(
  day: Day,
  visit: Visit,
  start: number,
  landing: { path: string; query: string; referrer: string | null },
  site: Site,
  random: Random,
  purpose?: string,
): { at: number; path: string; query: string; shown: boolean } {
  const { plan } = day;
  let { path, query } = landing;
  let at = start;
  for (let hop = 0; hop < 3; hop++) {
    const section = sectionOf(plan, path);
    const more: [string, string][] = [];
    if (visit.member) more.push(["cookie", `session=${random.hex(40)}`]);
    const revalidate =
      !purpose && visit.warm && section !== null && random.chance(0.15);
    if (revalidate) more.push(["if-none-match", `W/"${random.hex(12)}"`]);
    const headers = browserHeaders(
      visit.person,
      {
        dest: "document",
        mode: "navigate",
        site,
        referrer: landing.referrer,
        user: !purpose,
        purpose,
        more,
      },
      "browser",
    );
    const request = { path, query, headers };
    // The application sends a signed-out visitor to its login page.
    const signIn =
      plan.shape === "busy" && section === "app" && !visit.member && !purpose;
    if (signIn) {
      const next = `/login?next=${encodeURIComponent(path)}`;
      const hit = day.emit("browser", visit.connection, at, request, {
        status: 302,
        size: 0,
        type: "text/html; charset=utf-8",
        ms: random.around(9, 0.4),
        answer: [["Location", next]],
      });
      at = hit.at + random.around(40, 0.5);
      [path, query] = ["/login", `next=${encodeURIComponent(path)}`];
      continue;
    }
    // A single-page application answers every route with the same small
    // index.html, even one it does not know.
    const spa = plan.shape === "spa";
    const [bytes, server] = spa ? [1_120, 2] : DOCUMENT[section ?? "home"];
    const status = section === null && !spa ? 404 : revalidate ? 304 : 200;
    const size = status === 304 ? 0 : status === 404 ? 6_120 : bytes;
    const hit = day.emit("browser", visit.connection, at, request, {
      status,
      size,
      type:
        status === 304
          ? null
          : section === "cv"
            ? "application/pdf"
            : "text/html; charset=utf-8",
      ms: random.around(server, 0.5) + size / visit.speed,
      answer:
        status === 304
          ? []
          : [
              [
                "Cache-Control",
                section === "app" ? "private, no-store" : "no-cache",
              ],
              ["Etag", `W/"${random.hex(12)}"`],
            ],
    });
    return { at: hit.at, path, query, shown: status !== 404 };
  }
  return { at, path, query, shown: false };
}

/** The page's files, those the browser does not have yet. */
function loadFiles(
  day: Day,
  visit: Visit,
  after: number,
  assets: Asset[],
  page: string,
  random: Random,
) {
  const { plan } = day;
  let last = after;
  let stylesheet = page;
  for (const asset of assets) {
    const path = hashed(plan, asset.path, after);
    if (visit.cached.has(path)) continue;
    visit.cached.add(path);
    let status = 200;
    if (visit.warm) {
      // A returning browser keeps hashed files until a release renames them,
      // and asks again about the rest now and then.
      if (
        asset.hashed &&
        buildOf(plan, after) === buildOf(plan, after - 3 * DAY)
      )
        continue;
      if (!asset.hashed) {
        if (random.chance(0.5)) continue;
        status = 304;
      }
    }
    const referrer = asset.dest === "font" ? stylesheet : page;
    if (asset.dest === "style") stylesheet = pageUrl(plan, path, "");
    const hit = day.emit(
      "browser",
      visit.connection,
      after + random.around(45, 0.7),
      {
        path,
        headers: browserHeaders(
          visit.person,
          {
            dest: asset.dest,
            mode: asset.dest === "font" ? "cors" : "no-cors",
            site: "same-origin",
            referrer,
            more:
              status === 304 ? [["if-none-match", `"${random.hex(16)}"`]] : [],
          },
          "browser",
        ),
      },
      {
        status,
        size: status === 304 ? 0 : asset.size,
        type: status === 304 ? null : asset.type,
        ms:
          random.around(1.6, 0.5) +
          (status === 304 ? 0 : asset.size / visit.speed),
        answer:
          status === 304
            ? []
            : [
                [
                  "Cache-Control",
                  asset.hashed
                    ? "public, max-age=31536000, immutable"
                    : "public, max-age=86400",
                ],
                ["Etag", `"${random.hex(16)}"`],
              ],
      },
    );
    last = Math.max(last, hit.at);
  }
  // iOS asks for home-screen icons the site does not have.
  if (
    visit.person.ua.includes("iPhone") &&
    !visit.cached.has("/apple-touch-icon.png") &&
    random.chance(0.05)
  ) {
    visit.cached.add("/apple-touch-icon.png");
    for (const path of [
      "/apple-touch-icon-precomposed.png",
      "/apple-touch-icon.png",
    ])
      day.emit(
        "browser",
        visit.connection,
        last + random.around(300, 0.5),
        {
          path,
          headers: browserHeaders(
            visit.person,
            {
              dest: "image",
              mode: "no-cors",
              site: "same-origin",
              referrer: null,
            },
            "browser",
          ),
        },
        {
          status: 404,
          size: 6_120,
          type: "text/html; charset=utf-8",
          ms: random.around(4, 0.4),
        },
      );
  }
  return last;
}

/** Calls the page makes to the application's API. */
function callApi(
  day: Day,
  visit: Visit,
  after: number,
  page: string,
  random: Random,
  endpoints: Endpoint[],
  count: number,
) {
  const id = /\/(\d+)/.exec(new URL(page).pathname)?.[1];
  let last = after;
  for (let call = 0; call < count; call++) {
    const endpoint = random.weighted(
      endpoints.map((item) => [item, item.weight]),
    );
    last = sendApi(
      day,
      visit,
      last + random.around(30, 0.8),
      page,
      random,
      endpoint,
      id,
    );
  }
  return last;
}

function sendApi(
  day: Day,
  visit: Visit,
  start: number,
  page: string,
  random: Random,
  endpoint: Endpoint,
  id?: string,
) {
  const body = endpoint.method === "POST" || endpoint.method === "PATCH";
  const more: [string, string][] = [];
  if (body)
    more.push(
      ["content-type", "application/json"],
      ["origin", day.plan.origin],
    );
  if (visit.member) more.push(["cookie", `session=${random.hex(40)}`]);
  const status = random.weighted<number>([
    ...(endpoint.fails ?? []),
    [
      endpoint.ok ?? 200,
      1 - (endpoint.fails ?? []).reduce((sum, [, share]) => sum + share, 0),
    ],
  ]);
  const hit = day.emit(
    "browser",
    visit.connection,
    start,
    {
      method: endpoint.method,
      path: endpoint.path.replace("{id}", id ?? String(random.int(1, 60))),
      headers: browserHeaders(
        visit.person,
        {
          dest: "empty",
          mode: "cors",
          site: "same-origin",
          referrer: page,
          accept: "application/json",
          more,
        },
        "browser",
      ),
      bytesRead: body ? random.int(90, 900) : 0,
    },
    {
      status,
      size:
        status === 204
          ? 0
          : status >= 400
            ? random.int(60, 180)
            : endpoint.size,
      type: status === 204 ? null : endpoint.type || null,
      ms: random.around(endpoint.ms, 0.6),
      broken: "json",
    },
  );
  return hit.at;
}

/** A visit to a site of separate pages: every page is a document. */
function browsePages(day: Day, visit: Visit, start: number, landing: Landing) {
  const { plan } = day;
  const random = new Random(`${visit.person.key}/visit/${start}`);
  let at = start;
  let { path, query, referrer } = landing;
  let site: Site = referrer ? "cross-site" : "none";
  let prefetched = false;
  const chromium = visit.person.browser.engine === "chromium";
  for (let views = 0; views < 16; views++) {
    let shown = true;
    if (!prefetched)
      ({ at, path, query, shown } = navigate(
        day,
        visit,
        at,
        { path, query, referrer },
        site,
        random,
      ));
    prefetched = false;
    const section = sectionOf(plan, path) ?? "home";
    const url = pageUrl(plan, path, query);
    if (shown) {
      const assets = plan.data.assets;
      at = loadFiles(
        day,
        visit,
        at,
        [...(assets["*"] ?? []), ...(assets[section] ?? [])],
        url,
        random,
      );
      if (section === "app" && plan.data.api.length && visit.member)
        at = callApi(
          day,
          visit,
          at,
          url,
          random,
          plan.data.api,
          random.int(1, 3),
        );
    }
    const { dwell, stay } = SECTIONS[section] ?? SECTIONS.home;
    const stayed = Math.min(random.around(dwell * SECOND, 0.9), 30 * MINUTE);
    const bounce = landing.source === "hn" ? 0.45 : 1;
    const goes = shown && random.chance(stay * bounce);
    const next = nextPage(plan, random, section, path);
    // Chromium fetches a public link the pointer rests on (speculation
    // rules); when it is then followed, the browser shows what it has.
    const open = ["home", "pricing", "blog", "docs", "about"];
    const nextSection = sectionOf(plan, next) ?? "";
    if (
      plan.shape === "busy" &&
      chromium &&
      open.includes(section) &&
      open.includes(nextSection)
    ) {
      const hover = random.chance(goes ? 0.25 : 0.08);
      if (hover) {
        navigate(
          day,
          visit,
          at + stayed * random.next(),
          { path: next, query: "", referrer: url },
          "same-origin",
          random,
          "prefetch",
        );
        prefetched = goes;
      }
    }
    if (!goes) return;
    at += stayed;
    // Into the application from the login or signup page: the form is
    // posted, and the answer sends the browser on with a session.
    if (
      section === "auth" &&
      !visit.member &&
      sectionOf(plan, next) === "app"
    ) {
      const form = day.emit(
        "browser",
        visit.connection,
        at,
        {
          method: "POST",
          path,
          headers: browserHeaders(
            visit.person,
            {
              dest: "document",
              mode: "navigate",
              site: "same-origin",
              referrer: url,
              user: true,
              more: [
                ["content-type", "application/x-www-form-urlencoded"],
                ["origin", plan.origin],
              ],
            },
            "browser",
          ),
          bytesRead: random.int(48, 120),
        },
        {
          status: 303,
          size: 0,
          type: "text/html; charset=utf-8",
          // Checking a password is meant to be slow.
          ms: random.around(140, 0.3),
          answer: [
            ["Location", next],
            ["Set-Cookie", "REDACTED"],
          ],
        },
      );
      visit.member = true;
      at = form.at + random.around(30, 0.5);
    }
    referrer = url;
    site = "same-origin";
    path = next;
    query = "";
  }
}

const SIGN_IN: Endpoint = {
  method: "POST",
  path: "/api/session",
  weight: 0,
  type: "application/json",
  size: 184,
  ms: 140,
  ok: 201,
  fails: [[401, 0.06]],
};

// Screens a single-page application loads the first time they are shown.
const CHUNKS: [RegExp, string][] = [
  [/\/board$/, "board"],
  [/\/settings/, "settings"],
];

/** A visit to a single-page application: one document, then routes. */
function browseApp(day: Day, visit: Visit, start: number, landing: Landing) {
  const { plan } = day;
  const random = new Random(`${visit.person.key}/visit/${start}`);
  const person = visit.person;
  const site: Site = landing.referrer ? "cross-site" : "none";
  const loaded = navigate(day, visit, start, landing, site, random);
  if (!loaded.shown) return;
  const { query } = loaded;
  let { at, path } = loaded;
  let url = pageUrl(plan, path, query);
  const opening = CHUNKS.find(([pattern]) => pattern.test(path))?.[1];
  at = loadFiles(
    day,
    visit,
    at,
    [
      ...(plan.data.assets["*"] ?? []),
      ...(plan.data.assets[opening ?? ""] ?? []),
    ],
    url,
    random,
  );

  // Hallvi's script, then its events: the proxy answers both itself.
  const script = day.emit(
    "browser",
    visit.connection,
    at + random.around(20, 0.5),
    {
      path: SCRIPT_PATH,
      headers: browserHeaders(
        person,
        { dest: "script", mode: "no-cors", site: "same-origin", referrer: url },
        "browser",
      ),
    },
    visit.warm && random.chance(0.5)
      ? { status: 304, size: 0, type: null, ms: 0.2, proxy: true }
      : {
          status: 200,
          size: 2_431,
          type: "text/javascript; charset=utf-8",
          ms: 0.3 + 2_431 / visit.speed,
          proxy: true,
          answer: [["Cache-Control", "public, max-age=3600"]],
        },
  );
  at = script.at;
  const send = (moment: number, event: ScriptEvent) =>
    day.emit(
      "browser",
      visit.connection,
      moment,
      {
        method: "POST",
        path: eventPath(event),
        headers: browserHeaders(
          person,
          {
            dest: "empty",
            mode: "no-cors",
            site: "same-origin",
            referrer: url,
            more: [
              ["origin", plan.origin],
              ["content-length", "0"],
            ],
          },
          "browser",
        ),
      },
      {
        status: 204,
        size: 0,
        type: null,
        ms: 0.05 + random.next() * 0.3,
        proxy: true,
      },
    );

  let view = random.id(16);
  const tags = keptOf(query);
  const first: ScriptEvent = { t: "view", s: view, p: path, w: person.width };
  if (landing.referrer) first.r = originOf(landing.referrer);
  if (Object.keys(tags).length) first.u = tags;
  send(at + random.around(250, 0.5), first);
  const lcp = person.device === "desktop" ? 1_300 : 2_300;
  send(at + random.around(2_500, 0.4), {
    t: "vital",
    s: view,
    p: path,
    n: "LCP",
    v: Math.round(random.around(lcp, 0.45)),
  });

  for (let views = 0; views < 30; views++) {
    const section = sectionOf(plan, path) ?? "home";
    if (section === "app" && visit.member)
      at = callApi(
        day,
        visit,
        at,
        url,
        random,
        plan.data.api.filter((item) => item.method === "GET"),
        random.int(1, 3),
      );
    const { dwell, stay } = SECTIONS[section] ?? SECTIONS.home;
    const stayed = Math.min(random.around(dwell * SECOND, 0.9), 30 * MINUTE);
    // A tab in the background sends no pings and counts no visible time.
    const visible = random.chance(0.8) ? stayed : stayed * random.next();
    for (let ping = 1; ping * PING_SECONDS * SECOND < visible; ping++)
      send(at + ping * PING_SECONDS * SECOND, { t: "ping", s: view, p: path });
    if (section === "app" && visit.member) {
      // The unread count is polled every minute the tab is visible.
      const unread = plan.data.api.find((item) => item.path.endsWith("unread"));
      for (let poll = 1; unread && poll * MINUTE < visible; poll++)
        sendApi(day, visit, at + poll * MINUTE, url, random, unread);
      if (random.chance(0.2)) {
        const change = random.pick(
          plan.data.api.filter((item) => item.method !== "GET"),
        );
        sendApi(day, visit, at + visible * random.next(), url, random, change);
        if (change.method === "POST")
          send(at + visible * random.next(), {
            t: "goal",
            s: view,
            p: path,
            g: "task-created",
          });
      }
    }
    const goal = GOALS.find(([pattern]) => pattern.test(path));
    if (goal && random.chance(goal[2]))
      send(at + visible * random.next(), {
        t: "goal",
        s: view,
        p: path,
        g: goal[1],
      });
    const broken =
      afterRelease(plan, at, "/api/projects/").bug &&
      path.includes("/projects/");
    if (random.chance(broken ? 0.3 : 0.01))
      send(at + visible * random.next(), { t: "error", s: view, p: path });
    const leaving = at + stayed;
    const leave: ScriptEvent = {
      t: "leave",
      s: view,
      p: path,
      e: Math.round(Math.min(visible, 30 * MINUTE)),
    };
    const goes = random.chance(stay);
    if (!goes) {
      // Closing the tab reports the page's responsiveness and stability.
      send(leaving, leave);
      send(leaving + 1, {
        t: "vital",
        s: view,
        p: path,
        n: "INP",
        v: Math.round(
          random.around(person.device === "desktop" ? 90 : 180, 0.6),
        ),
      });
      send(leaving + 2, {
        t: "vital",
        s: view,
        p: path,
        n: "CLS",
        v: Math.round(random.around(35, 1)),
      });
      return;
    }
    // A route change: no document, a new view, maybe a new screen's code.
    send(leaving, leave);
    at = leaving + random.around(15, 0.5);
    path = nextPage(plan, random, section, path);
    url = pageUrl(plan, path, "");
    if (section === "auth" && !visit.member) {
      // The application signs in with a call of its own, not a form.
      at = sendApi(day, visit, at, url, random, SIGN_IN);
      visit.member = true;
    }
    const chunk = CHUNKS.find(([pattern]) => pattern.test(path))?.[1];
    if (chunk)
      at = loadFiles(
        day,
        visit,
        at,
        plan.data.assets[chunk] ?? [],
        url,
        random,
      );
    view = random.id(16);
    send(at + random.around(40, 0.5), {
      t: "view",
      s: view,
      p: path,
      r: plan.origin,
      w: person.width,
    });
  }
}

const GOALS: [RegExp, string, number][] = [
  [/^\/signup$/, "signup", 0.35],
  [/^\/app\/team$/, "invite-sent", 0.2],
  [/^\/app\/settings\/billing$/, "upgrade", 0.15],
];

function originOf(referrer: string) {
  const origin = new URL(referrer).origin;
  // An Android app's referrer has no web origin; the script sends it whole.
  return origin === "null" ? referrer.replace(/\/$/, "") : origin;
}

function arrive(
  day: Day,
  person: Person,
  start: number,
  landing: Landing,
  options: { member: boolean; warm: boolean },
) {
  const random = new Random(`${person.key}/start/${start}`);
  const visit = startVisit(day.plan, person, day.start, random, options);
  if (day.plan.shape === "spa") browseApp(day, visit, start, landing);
  else browsePages(day, visit, start, landing);
}

/** A moment after `from`, falling away with the given half-life. */
function decaying(random: Random, from: number, halfLife: number) {
  return from + (-Math.log(1 - random.next()) * halfLife) / Math.LN2;
}

function browsers(day: Day) {
  const { plan } = day;
  const data = plan.data;
  const random = new Random(`${plan.seed}/visitors/${day.start}`);
  const rhythm = data.weekday[new Date(day.start).getUTCDay()];
  const expected =
    data.visitors * data.growth ** day.index * rhythm * random.around(1, 0.08);
  const phones = (source: string) => SOURCES[source]?.mobile ?? 0.4;
  const newcomer = (
    index: number,
    source: string,
    lands: Record<string, number> | string,
    start: number | null,
  ) => {
    const audience = SOURCES[source]?.audience || data.audience;
    const person = newPerson(
      `${plan.seed}/new/${day.start}/${index}`,
      audience,
      phones(source),
    );
    const own = new Random(person.key);
    const landing = landingFor(plan, own, source, lands, day.start);
    const at = start ?? day.localTime(own, person.country);
    arrive(day, person, at, landing, { member: false, warm: false });
    // Some come back later the same day.
    if (own.chance(0.05))
      arrive(day, person, at + own.int(1, 8) * HOUR, landing, {
        member: false,
        warm: true,
      });
  };

  const count = random.poisson(expected);
  for (let index = 0; index < count; index++) {
    const entry = random.weighted(
      data.sources.map((item) => [item, item.weight]),
    );
    newcomer(index, entry.source, entry.lands, null);
  }

  // The people who come back: readers, customers, the application's users.
  for (let index = 0; index < data.regulars.count; index++) {
    const key = `${plan.seed}/regular/${index}`;
    const own = new Random(key);
    const chance = Math.min(0.95, own.around(data.regulars.chance, 0.9));
    const member = plan.shape === "spa" || own.chance(0.35);
    const today = new Random(`${key}/${day.start}`);
    if (!today.chance(chance * rhythm)) continue;
    const phoneShare = plan.shape === "spa" ? 0.12 : 0.4;
    const person = newPerson(key, data.audience, phoneShare);
    const sessions = today.chance(0.15) ? 2 : 1;
    for (let session = 0; session < sessions; session++) {
      // Customers open the application; readers come back for the
      // content, the way search brings them.
      const lands: Record<string, number> = member
        ? { app: 7, auth: 2 }
        : (data.sources.find((item) => item.source === "google")?.lands ?? {
            home: 1,
          });
      const landing = landingFor(
        plan,
        today,
        today.chance(0.8) ? "direct" : "google",
        lands,
        day.start,
      );
      arrive(day, person, day.localTime(today, person.country), landing, {
        member,
        warm: today.chance(0.85),
      });
    }
  }

  // The days that stand out.
  const weekday = new Date(day.start).getUTCDay();
  const spike = Math.floor(plan.days * 0.45);
  let index = count;
  if (plan.shape === "busy" && day.index === spike) {
    // A post reaches the front page of Hacker News in the afternoon; the
    // tail runs on past midnight.
    const peak = day.start + 15 * HOUR + 20 * MINUTE;
    const visitors = random.poisson(4_200);
    for (let at = 0; at < visitors; at++) {
      const source = random.weighted<string>([
        ["hn", 85],
        ["x", 7],
        ["reddit", 5],
        ["linkedin", 3],
      ]);
      newcomer(
        index++,
        source,
        random.chance(0.85) ? HN_POST : { home: 1 },
        decaying(random, peak, 2.5 * HOUR),
      );
    }
  }
  if (plan.shape === "spa" && day.index === Math.floor(plan.days * 0.65)) {
    // A Product Hunt launch, which starts at midnight in San Francisco.
    const visitors = random.poisson(220);
    for (let at = 0; at < visitors; at++)
      newcomer(
        index++,
        random.weighted<string>([
          ["producthunt", 70],
          ["x", 20],
          ["linkedin", 10],
        ]),
        { home: 1 },
        decaying(random, day.start + 7 * HOUR, 6 * HOUR),
      );
  }
  const newsletter =
    (plan.shape === "busy" && weekday === 2) ||
    (plan.shape === "spa" &&
      weekday === 3 &&
      new Date(day.start).getUTCDate() <= 7);
  if (newsletter) {
    const visitors = random.poisson(plan.shape === "busy" ? 130 : 70);
    const sent = day.start + 9 * HOUR;
    for (let at = 0; at < visitors; at++)
      newcomer(
        index++,
        "newsletter",
        plan.shape === "busy" ? { blog: 4, pricing: 1 } : { app: 2, home: 1 },
        decaying(random, sent, 2 * HOUR),
      );
  }
}

// ---------------------------------------------------------------------------
// Bots, scanners and machines.

function robotRequest(
  ua: string,
  more: [string, string][] = [],
  accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
): [string, string][] {
  return [
    ["user-agent", ua],
    ["accept", accept],
    ["accept-encoding", "gzip, deflate, br"],
    ...more,
    [MARKER, "bot"],
  ];
}

function botConnection(random: Random, network: string): Connection {
  let address: string;
  if (network === "*")
    address = random.chance(0.5)
      ? networkAddress(random, random.pick(["hetzner", "digitalocean", "aws"]))
      : addressIn(
          random,
          random.pick(
            COUNTRIES[random.pick(["US", "DE", "GB", "IN", "BG"])].v4,
          ),
        );
  else if (network === "scanners")
    address = networkAddress(random, random.pick(SCANNER_NETWORKS));
  else address = networkAddress(random, network);
  return {
    address,
    port: random.int(1024, 65535),
    proto: random.chance(0.3) ? "HTTP/2.0" : "HTTP/1.1",
    resumed: false,
  };
}

/** Pages a crawler finds: the public ones, the site files, and old links. */
function crawlTarget(plan: Plan, random: Random) {
  const roll = random.next();
  if (roll < 0.06)
    return {
      path: "/robots.txt",
      type: "text/plain; charset=utf-8",
      size: 312,
      status: 200,
    };
  if (roll < 0.1)
    return {
      path: "/sitemap.xml",
      type: "application/xml",
      size: 4_870,
      status: 200,
    };
  if (roll < 0.13)
    return {
      path: `/blog/${random.pick(["2023", "2024"])}/${random.id(6).toLowerCase()}`,
      type: "text/html; charset=utf-8",
      size: 6_120,
      status: 404,
    };
  const pages = plan.data.pages.filter(
    (page) => !["app", "auth", "reset"].includes(page.section),
  );
  const pool = pages.length ? pages : plan.data.pages;
  const page = random.weighted(pool.map((item) => [item, 1]));
  return {
    path: page.path.replace("{id}", String(random.int(1, 60))),
    type:
      page.section === "cv" ? "application/pdf" : "text/html; charset=utf-8",
    size: DOCUMENT[page.section]?.[0] ?? 12_000,
    status: 200,
  };
}

function botsFor(day: Day) {
  const { plan } = day;
  const spike =
    plan.shape === "busy" && day.index === Math.floor(plan.days * 0.45);
  for (const bot of BOTS) {
    const daily = bot.daily[plan.shape];
    if (!daily) continue;
    const random = new Random(`${plan.seed}/bot/${bot.name}/${day.start}`);
    if (bot.work === "monitor") {
      monitor(day, bot, random);
      continue;
    }
    const busier = spike && bot.work === "preview" ? 15 : spike ? 1.4 : 1;
    const count = random.poisson(daily * busier);
    for (let index = 0; index < count; index++) {
      const start = day.start + random.next() * DAY;
      const ua = random.pick(bot.ua);
      const connection = botConnection(random, bot.network);
      switch (bot.work) {
        case "crawl":
          crawl(day, bot, ua, connection, start, random);
          break;
        case "preview": {
          const path =
            spike && random.chance(0.8)
              ? HN_POST
              : crawlTarget(plan, random).path;
          day.emit(
            "bot",
            connection,
            start,
            { path, headers: robotRequest(ua, [], "*/*") },
            {
              status: sectionOf(plan, path) ? 200 : 404,
              size: 21_600,
              type: "text/html; charset=utf-8",
              ms: random.around(35, 0.5),
            },
          );
          break;
        }
        case "feed": {
          const feed = plan.shape === "tiny" ? "/feed.xml" : "/blog/feed.xml";
          const fresh = random.chance(0.7);
          day.emit(
            "bot",
            connection,
            start,
            {
              path: feed,
              headers: robotRequest(
                ua,
                fresh ? [["if-none-match", `"${random.hex(16)}"`]] : [],
                "application/atom+xml, application/rss+xml, */*",
              ),
            },
            {
              status: fresh ? 304 : 200,
              size: fresh ? 0 : 38_200,
              type: fresh ? null : "application/atom+xml",
              ms: random.around(12, 0.5),
            },
          );
          break;
        }
        case "render":
          render(day, ua, connection, start, random);
          break;
        case "tool": {
          const path =
            plan.shape === "api"
              ? random.pick(["/v1/items", "/health", "/v1/me"])
              : random.pick(["/", "/", "/pricing", "/robots.txt"]);
          const status =
            path === "/v1/me" || path === "/v1/items"
              ? 401
              : sectionOf(plan, path) ||
                  path === "/health" ||
                  path === "/robots.txt"
                ? 200
                : 404;
          day.emit(
            "bot",
            connection,
            start,
            {
              path,
              headers: [
                ["user-agent", ua],
                ["accept", "*/*"],
                [MARKER, "bot"],
              ],
            },
            {
              status,
              size: status === 401 ? 58 : 18_400,
              type:
                status === 401
                  ? "application/json"
                  : "text/html; charset=utf-8",
              ms: random.around(25, 0.6),
            },
          );
          break;
        }
        case "survey":
          for (const path of random.chance(0.4) ? ["/", "/favicon.ico"] : ["/"])
            day.emit(
              "bot",
              connection,
              start + (path === "/" ? 0 : random.int(200, 900)),
              {
                path,
                headers: [
                  ["user-agent", ua],
                  ["accept", "*/*"],
                  ["accept-encoding", "gzip"],
                  [MARKER, "bot"],
                ],
              },
              {
                status:
                  sectionOf(plan, path) || path === "/favicon.ico" ? 200 : 404,
                size: path === "/" ? 24_800 : 15_086,
                type:
                  path === "/" ? "text/html; charset=utf-8" : "image/x-icon",
                ms: random.around(20, 0.5),
              },
            );
          break;
        case "probe":
          probe(day, ua, connection, start, random);
          break;
      }
    }
  }
}

function crawl(
  day: Day,
  bot: Bot,
  ua: string,
  connection: Connection,
  start: number,
  random: Random,
) {
  const { plan } = day;
  const target = crawlTarget(plan, random);
  // Google asks whether a page changed since it last looked.
  const conditional =
    bot.name === "Googlebot" && target.status === 200 && random.chance(0.08);
  const hit = day.emit(
    "bot",
    {
      ...connection,
      proto:
        bot.name === "Googlebot" && random.chance(0.6)
          ? "HTTP/2.0"
          : connection.proto,
    },
    start,
    {
      path: target.path,
      headers: robotRequest(ua, [
        ...(bot.headers ?? []),
        ...(conditional
          ? ([
              ["if-modified-since", new Date(start - 7 * DAY).toUTCString()],
            ] as [string, string][])
          : []),
      ]),
    },
    {
      status: conditional ? 304 : target.status,
      size: conditional ? 0 : target.size,
      type: conditional ? null : target.type,
      ms: random.around(32, 0.6),
    },
  );
  // Google renders the pages it crawls, and a rendered page runs the
  // script like any browser would.
  if (
    plan.shape === "spa" &&
    bot.name === "Googlebot" &&
    target.status === 200 &&
    target.type.startsWith("text/html") &&
    random.chance(0.1)
  ) {
    const view = random.id(16);
    const url = pageUrl(plan, target.path, "");
    const headers: [string, string][] = [
      ["user-agent", ua],
      ["accept", "*/*"],
      ["sec-fetch-site", "same-origin"],
      ["sec-fetch-mode", "no-cors"],
      ["sec-fetch-dest", "empty"],
      ["referer", url],
      ["origin", plan.origin],
      [MARKER, "bot"],
    ];
    let at = hit.at + random.int(2, 40) * SECOND;
    day.emit(
      "bot",
      connection,
      at,
      { path: SCRIPT_PATH, headers: robotRequest(ua, [], "*/*") },
      {
        status: 200,
        size: 2_431,
        type: "text/javascript; charset=utf-8",
        ms: 0.4,
        proxy: true,
      },
    );
    at += random.int(200, 900);
    for (const event of [
      { t: "view", s: view, p: target.path, w: 412 },
      { t: "leave", s: view, p: target.path, e: random.int(2_000, 9_000) },
    ] satisfies ScriptEvent[])
      day.emit(
        "bot",
        connection,
        (at += random.int(300, 5_000)),
        { method: "POST", path: eventPath(event), headers },
        { status: 204, size: 0, type: null, ms: 0.1, proxy: true },
      );
  }
}

function render(
  day: Day,
  ua: string,
  connection: Connection,
  start: number,
  random: Random,
) {
  // A headless browser: fetch metadata and all, only its name gives it away.
  const person = {
    browser: {
      ...BROWSERS[0],
      hints: { brand: "HeadlessChrome", platform: "Linux" },
    },
    version: "152",
    ua,
    device: "desktop" as const,
    country: "DE",
  };
  const { plan } = day;
  const target = crawlTarget(plan, random);
  const headers = browserHeaders(
    person,
    {
      dest: "document",
      mode: "navigate",
      site: "none",
      referrer: null,
      user: true,
    },
    "bot",
  );
  const hit = day.emit(
    "bot",
    { ...connection, proto: "HTTP/2.0" },
    start,
    { path: target.path, headers },
    {
      status: target.status,
      size: target.size,
      type: target.type,
      ms: random.around(40, 0.5),
    },
  );
  let at = hit.at;
  for (const asset of plan.data.assets["*"] ?? [])
    at = day.emit(
      "bot",
      { ...connection, proto: "HTTP/2.0" },
      at + random.around(10, 0.5),
      {
        path: hashed(plan, asset.path, start),
        headers: browserHeaders(
          person,
          {
            dest: asset.dest,
            mode: asset.dest === "font" ? "cors" : "no-cors",
            site: "same-origin",
            referrer: pageUrl(plan, target.path, ""),
          },
          "bot",
        ),
      },
      {
        status: 200,
        size: asset.size,
        type: asset.type,
        ms: random.around(3, 0.5),
      },
    ).at;
}

function probe(
  day: Day,
  ua: string,
  connection: Connection,
  start: number,
  random: Random,
) {
  const { plan } = day;
  // Most scanners try one thing; some work through a whole list.
  const size = random.weighted<number>([
    [1, 45],
    [random.int(4, 15), 40],
    [random.int(30, 80), 15],
  ]);
  const paths = random.shuffle(PROBES).slice(0, size);
  if (plan.shape === "spa" && random.chance(0.08))
    // Replays of the script's events, cut short: they count as nothing.
    paths.push(`${EVENT_PREFIX}eyJ0IjoidmlldyIsInMiOiJ4In0`);
  let at = start;
  for (const probe of paths) {
    const [path, query = ""] = probe.split("?");
    const post = /xmlrpc|cgi-bin|\/_hv\/e\//.test(path) && random.chance(0.7);
    const event = path.startsWith(EVENT_PREFIX);
    // A probe for one of the site's pages gets the page, and a single-page
    // application answers everything with its index.html.
    const page = !post && (plan.shape === "spa" || sectionOf(plan, path));
    const [bytes] = DOCUMENT[sectionOf(plan, path) ?? "home"];
    const hit = day.emit(
      "bot",
      connection,
      at,
      {
        method: post || event ? "POST" : "GET",
        path,
        query,
        headers: [
          ["user-agent", ua],
          ["accept", "*/*"],
          ["accept-encoding", "gzip"],
          ...(ua.startsWith("python") || ua.startsWith("Go-")
            ? ([["connection", "close"]] as [string, string][])
            : []),
          [MARKER, "bot"],
        ],
        bytesRead: post ? random.int(200, 900) : 0,
      },
      event
        ? { status: 204, size: 0, type: null, ms: 0.1, proxy: true }
        : {
            status: page ? 200 : 404,
            size: page ? (plan.shape === "spa" ? 1_120 : bytes) : 6_120,
            type: "text/html; charset=utf-8",
            ms: random.around(page ? 25 : 6, 0.5),
          },
    );
    at = hit.at + random.around(250, 0.8);
  }
}

/** An uptime monitor: one quick look every five minutes, all day. */
function monitor(day: Day, bot: Bot, random: Random) {
  const { plan } = day;
  const phase = new Random(`${plan.seed}/monitor`).next() * 5 * MINUTE;
  const connection = botConnection(random, bot.network);
  const path = plan.shape === "api" ? "/health" : "/";
  for (let at = day.start + phase; at < day.start + DAY; at += 5 * MINUTE)
    day.emit(
      "bot",
      { ...connection, port: random.int(1024, 65535) },
      at + random.next() * 2 * SECOND,
      {
        method: "HEAD",
        path,
        headers: [
          ["user-agent", bot.ua[0]],
          ["accept", "*/*"],
          ["cache-control", "no-cache"],
          [MARKER, "bot"],
        ],
      },
      {
        status: 200,
        size: 0,
        type:
          plan.shape === "api"
            ? "application/json"
            : "text/html; charset=utf-8",
        ms: random.around(plan.shape === "api" ? 3 : 30, 0.4),
      },
    );
}

/** How often a day the owner has this application open in Hallvi. */
const LOOKS: Record<Shape, number> = {
  busy: 1.6,
  spa: 1.2,
  tiny: 0.3,
  api: 0.8,
};

/** The owner has a Hallvi page open now and then; it checks the site. */
function hallviChecks(day: Day) {
  const { plan } = day;
  const random = new Random(`${plan.seed}/hallvi/${day.start}`);
  const sessions = random.poisson(LOOKS[plan.shape]);
  for (let session = 0; session < sessions; session++) {
    const begin = day.localTime(random, "BG");
    const minutes = random.int(5, 50);
    for (let at = begin; at < begin + minutes * MINUTE; at += 30 * SECOND)
      day.emit(
        "hallvi",
        {
          address: plan.owner,
          port: random.int(49152, 65535),
          proto: "HTTP/1.1",
          resumed: false,
        },
        at,
        {
          path: plan.shape === "api" ? "/health" : "/",
          headers: [
            ["accept", "*/*"],
            ["accept-language", "*"],
            ["sec-fetch-mode", "cors"],
            ["user-agent", HALLVI_CHECK],
            ["accept-encoding", "gzip, deflate"],
            [MARKER, "hallvi"],
          ],
        },
        {
          status: 200,
          size: 24_800,
          type: "text/html; charset=utf-8",
          ms: random.around(30, 0.4),
        },
      );
  }
}

/** The API's own clients: phones, servers and webhooks. */
function clients(day: Day) {
  const { plan } = day;
  const rhythm = plan.data.weekday[new Date(day.start).getUTCDay()];
  for (const client of API_CLIENTS)
    for (let index = 0; index < client.count; index++) {
      const key = `${plan.seed}/client/${client.ua}/${index}`;
      const today = new Random(`${key}/${day.start}`);
      if (!today.chance(client.active * rhythm)) continue;
      const phone = client.from === "people";
      const person = newPerson(key, plan.data.audience, 1);
      const connection: Connection = {
        address: phone
          ? addressOn(person, day.start)
          : networkAddress(new Random(key), client.from),
        port: today.int(1024, 65535),
        proto: "HTTP/2.0",
        resumed: today.chance(0.5),
      };
      const count = today.poisson(client.daily);
      for (let call = 0; call < count; call++) {
        const start = phone
          ? day.localTime(today, person.country)
          : day.start + today.next() * DAY;
        const endpoint = today.weighted(
          plan.data.api.map((item) => [item, item.weight]),
        );
        const body = endpoint.method === "POST" || endpoint.method === "PATCH";
        const status = today.weighted<number>([
          ...(endpoint.fails ?? []),
          [
            endpoint.ok ?? 200,
            1 -
              (endpoint.fails ?? []).reduce((sum, [, share]) => sum + share, 0),
          ],
        ]);
        day.emit(
          "client",
          connection,
          start,
          {
            method: endpoint.method,
            path: endpoint.path.replace(
              "{id}",
              String(today.int(1_000, 99_999)),
            ),
            query:
              endpoint.path === "/v1/search"
                ? `q=${today.pick(["invoice", "march", "urgent", "design"])}&limit=20`
                : "",
            headers: [
              ["user-agent", client.ua],
              ["accept", "application/json"],
              ["accept-encoding", "gzip"],
              ["authorization", `Bearer ${today.hex(40)}`],
              ...(body
                ? ([["content-type", "application/json"]] as [string, string][])
                : []),
              [MARKER, "client"],
            ],
            bytesRead: body ? today.int(120, 2_400) : 0,
          },
          {
            status,
            size:
              status === 204
                ? 0
                : status >= 400
                  ? today.int(60, 220)
                  : endpoint.size,
            type: status === 204 ? null : endpoint.type || null,
            ms: today.around(endpoint.ms, 0.7),
            broken: "json",
          },
        );
      }
    }
  for (const hook of WEBHOOKS) {
    const random = new Random(`${plan.seed}/hook/${hook.path}/${day.start}`);
    const count = random.poisson(hook.daily);
    for (let index = 0; index < count; index++)
      day.emit(
        "client",
        {
          address: networkAddress(random, "aws"),
          port: random.int(1024, 65535),
          proto: "HTTP/1.1",
          resumed: false,
        },
        day.start + random.next() * DAY,
        {
          method: "POST",
          path: hook.path,
          headers: [
            ["user-agent", hook.ua],
            ["accept", "*/*; q=0.5, application/xml"],
            ["content-type", "application/json; charset=utf-8"],
            [MARKER, "client"],
          ],
          bytesRead: random.int(900, 6_000),
        },
        {
          status: 200,
          size: 16,
          type: "application/json",
          ms: random.around(40, 0.5),
          broken: "json",
        },
      );
  }
}

/** Everything the proxy would have logged over the window, oldest first. */
function simulate(plan: Plan) {
  const hits: Hit[] = [];
  const first = Math.floor(plan.start / DAY) * DAY;
  for (let start = first; start < plan.end; start += DAY) {
    const day = new Day(plan, Math.round((start - first) / DAY), start, hits);
    browsers(day);
    botsFor(day);
    hallviChecks(day);
    if (plan.shape === "api") clients(day);
  }
  return hits
    .filter((hit) => hit.at >= plan.start && hit.at < plan.end)
    .sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// How each proxy writes a line.

/** Go's canonical header name, which is how Caddy and Traefik show it. */
function canonical(name: string) {
  return name.replace(
    /(^|-)([a-z])/g,
    (_, dash: string, letter: string) => dash + letter.toUpperCase(),
  );
}

function keptOf(query: string) {
  const kept: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query))
    if ((KEPT_QUERY_KEYS as readonly string[]).includes(key) && !(key in kept))
      kept[key] = value;
  return kept;
}

const TLS_CIPHERS: Record<string, number> = {
  TLS_AES_128_GCM_SHA256: 4865,
  TLS_CHACHA20_POLY1305_SHA256: 4867,
};

function cipherOf(hit: Hit) {
  // Phones without AES hardware prefer ChaCha20.
  return hit.headers.some(
    ([name, value]) => name === "user-agent" && value.includes("Android"),
  ) && hit.port % 3 === 0
    ? "TLS_CHACHA20_POLY1305_SHA256"
    : "TLS_AES_128_GCM_SHA256";
}

/** Caddy 2.11, with the filters and fields Pi configures. */
function caddyLine(plan: Plan, hit: Hit) {
  const headers: Record<string, string[]> = {};
  for (const [name, value] of hit.headers) {
    const key = canonical(name);
    // Caddy hides credentials; Pi's filter cuts the Referer at ? or #.
    const shown = ["Cookie", "Authorization", "Proxy-Authorization"].includes(
      key,
    )
      ? "REDACTED"
      : key === "Referer"
        ? value.replace(/[?#].*$/, "")
        : value;
    (headers[key] ??= []).push(shown);
  }
  const answer: Record<string, string[]> = {};
  if (hit.proxy) {
    answer.Server = ["Caddy"];
    answer["Alt-Svc"] = [ALT_SVC];
    answer["Content-Type"] = hit.type ? [hit.type] : [];
    if (hit.size) answer["Content-Length"] = [String(hit.size)];
  } else if (hit.status === 502) {
    answer.Server = ["Caddy"];
  } else {
    answer["Alt-Svc"] = [ALT_SVC];
    answer.Via = ["1.1 Caddy"];
    answer.Date = [new Date(hit.at).toUTCString()];
    for (const [name, value] of plan.data.upstream) answer[name] = [value];
    if (hit.type) answer["Content-Type"] = [hit.type];
    if (hit.size && hit.status !== 304)
      answer["Content-Length"] = [String(hit.size)];
  }
  for (const [name, value] of hit.answer) answer[name] = [value];
  const kept = keptOf(hit.query);
  const alpn =
    hit.proto === "HTTP/3.0"
      ? "h3"
      : hit.proto === "HTTP/2.0"
        ? "h2"
        : "http/1.1";
  return JSON.stringify({
    level: hit.status >= 500 ? "error" : "info",
    ts: hit.at / 1000,
    logger: "http.log.access.log0",
    msg: "handled request",
    request: {
      remote_ip: hit.address,
      remote_port: String(hit.port),
      client_ip: hit.address,
      proto: hit.proto,
      method: hit.method,
      host: plan.host,
      uri: hit.path,
      headers,
      tls: {
        resumed: hit.resumed,
        version: 772,
        cipher_suite: TLS_CIPHERS[cipherOf(hit)],
        proto: alpn,
        server_name: plan.host,
        ech: false,
      },
    },
    bytes_read: hit.bytesRead,
    user_id: "",
    duration: hit.ms / 1000,
    size: hit.size,
    status: hit.status,
    resp_headers: answer,
    // `log_append` fields come out last-declared first, decoded. No shape
    // routes by a query key, so there is no `hv_page`.
    hv_ref: kept.ref ?? "",
    hv_utm_content: kept.utm_content ?? "",
    hv_utm_term: kept.utm_term ?? "",
    hv_utm_campaign: kept.utm_campaign ?? "",
    hv_utm_medium: kept.utm_medium ?? "",
    hv_utm_source: kept.utm_source ?? "",
  });
}

/**
 * Headers Traefik keeps with the access log Pi configures, and the fixture's
 * marker, which a real Traefik logs only when told to keep it too.
 */
const TRAEFIK_KEPT = [
  "User-Agent",
  "Referer",
  "Sec-Fetch-Dest",
  "Sec-Fetch-Mode",
  "Sec-Purpose",
  "Purpose",
  "Content-Type",
  "Cf-Connecting-Ip",
  "Cf-Ipcountry",
  "X-Hallvi-Fixture",
];

function isoNanos(ms: number) {
  const whole = Math.floor(ms);
  const nanos = Math.round((ms - whole) * 1e6);
  return new Date(whole)
    .toISOString()
    .replace(
      /\.(\d{3})Z$/,
      (_, milli: string) => `.${milli}${String(nanos).padStart(6, "0")}Z`,
    );
}

/** Traefik 3.7: sorted keys, Go's HTML escaping, whole seconds in `time`. */
function traefikLine(plan: Plan, hit: Hit, count: number) {
  const duration = Math.round(hit.ms * 1e6);
  const overhead = Math.min(
    duration,
    Math.round(80_000 + (hit.port % 997) * 900),
  );
  const start = hit.at - hit.ms;
  const client = hit.address.includes(":") ? `[${hit.address}]` : hit.address;
  const entry: Record<string, string | number> = {
    ClientAddr: `${client}:${hit.port}`,
    ClientHost: hit.address,
    ClientPort: String(hit.port),
    ClientUsername: "-",
    DownstreamContentSize: hit.status === 502 ? 11 : hit.size,
    DownstreamStatus: hit.status,
    Duration: duration,
    OriginContentSize: hit.status === 502 ? 11 : hit.size,
    OriginDuration: duration - overhead,
    OriginStatus: hit.status,
    Overhead: overhead,
    RequestAddr: plan.host,
    RequestContentSize: hit.bytesRead,
    RequestCount: count,
    RequestHost: plan.host,
    RequestMethod: hit.method,
    // Traefik lets Go turn the query's semicolons into ampersands first.
    RequestPath: hit.query
      ? `${hit.path}?${hit.query.replaceAll(";", "&")}`
      : hit.path,
    RequestPort: "-",
    // Traefik speaks HTTP/3 only when asked to.
    RequestProtocol: hit.proto === "HTTP/3.0" ? "HTTP/2.0" : hit.proto,
    RequestScheme: "https",
    RetryAttempts: 0,
    RouterName: "app@docker",
    ServiceAddr: "172.18.0.4:3000",
    ServiceName: "app@docker",
    ServiceURL: "http://172.18.0.4:3000",
    StartLocal: isoNanos(start),
    StartUTC: isoNanos(start),
    TLSCipher: cipherOf(hit),
    TLSVersion: "1.3",
    "downstream_Content-Type": hit.status === 502 ? "" : (hit.type ?? ""),
    entryPointName: "websecure",
    level: "info",
    msg: "",
    "origin_Content-Type": hit.status === 502 ? "" : (hit.type ?? ""),
    time: new Date(Math.floor(hit.at / 1000) * 1000)
      .toISOString()
      .replace(".000Z", "Z"),
  };
  for (const [name, value] of hit.headers) {
    const key = canonical(name);
    if (TRAEFIK_KEPT.includes(key)) entry[`request_${key}`] = value;
  }
  const sorted = Object.fromEntries(
    Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return JSON.stringify(sorted).replace(
    /[&<>]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** The nginx line Pi configures (`log_format hallvi escape=json`). */
function hallviLine(plan: Plan, hit: Hit) {
  const header = (name: string) =>
    hit.headers.find(([key]) => key === name)?.[1] ?? "";
  // nginx's $arg_ is the raw, still-encoded value of the first match.
  const raw = (key: string) =>
    hit.query
      .split("&")
      .find((pair) => pair.split("=")[0] === key)
      ?.slice(key.length + 1) ?? "";
  return JSON.stringify({
    hallvi: 1,
    time: (hit.at / 1000).toFixed(3),
    host: plan.host,
    method: hit.method,
    path: hit.path,
    utm_source: raw("utm_source"),
    utm_medium: raw("utm_medium"),
    utm_campaign: raw("utm_campaign"),
    utm_term: raw("utm_term"),
    utm_content: raw("utm_content"),
    ref: raw("ref"),
    page: "",
    status: String(hit.status),
    duration: (hit.ms / 1000).toFixed(3),
    address: hit.address,
    user_agent: header("user-agent"),
    referrer: header("referer").replace(/[?#].*$/, ""),
    fetch_dest: header("sec-fetch-dest"),
    fetch_mode: header("sec-fetch-mode"),
    sec_purpose: header("sec-purpose"),
    purpose: header("purpose"),
    content_type: hit.type ?? "",
    cf_ip: "",
    cf_country: "",
    // Not part of Hallvi's line; the reader ignores what it does not know.
    fixture: header(MARKER),
  });
}

// ---------------------------------------------------------------------------
// Files, named and split as each proxy's rotation does.

interface Written {
  name: string;
  from: string;
  to: string;
  lines: number;
  bytes: number;
  sha256: string;
}

/** Caddy's own time format in rotated names, in UTC. */
function caddyStamp(ms: number) {
  return new Date(ms).toISOString().replace(/:/g, "-").replace("Z", "");
}

function splitName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** Caddy's `roll_size` as Pi sets it. */
const ROLL_BYTES = 100 * 1024 * 1024;

/**
 * Caddy 2.11 as Pi sets it up rolls every 24 hours, renaming the file
 * <stem>-<time>-time<ext>.gz, and sooner, -size, if a day passes 100 MiB.
 * The days are counted back from the window's end, so the newest file ends
 * exactly where the live log takes over.
 */
function caddyFiles(plan: Plan, hits: Hit[], name: string) {
  const [stem, ext] = splitName(name);
  const files: { name: string; hits: Hit[]; text: string[]; rolled: number }[] =
    [];
  const cuts: number[] = [];
  for (let cut = plan.end; cut > plan.start; cut -= DAY) cuts.unshift(cut);
  let index = 0;
  for (const cut of cuts) {
    let [text, group, bytes] = [[] as string[], [] as Hit[], 0];
    for (; index < hits.length && hits[index].at < cut; index++) {
      const line = `${caddyLine(plan, hits[index])}\n`;
      const length = Buffer.byteLength(line);
      if (bytes + length > ROLL_BYTES && text.length) {
        // Rolled as the line that no longer fits comes in.
        const rolled = hits[index].at;
        files.push({
          name: `${stem}-${caddyStamp(rolled)}-size${ext}.gz`,
          hits: group,
          text,
          rolled,
        });
        [text, group, bytes] = [[], [], 0];
      }
      text.push(line);
      group.push(hits[index]);
      bytes += length;
    }
    if (group.length)
      files.push({
        name: `${stem}-${caddyStamp(cut)}-time${ext}.gz`,
        hits: group,
        text,
        rolled: cut,
      });
  }
  return files.map((file) => ({
    name: file.name,
    hits: file.hits,
    body: gzipSync(file.text.join("")),
    // Compressed right after the rename.
    mtime: file.rolled + 40,
  }));
}

/**
 * logrotate as Debian runs it for nginx, and as Traefik is rotated: daily
 * a little after midnight, <name>.1 left plain (delaycompress), older ones
 * <name>.N.gz, each keeping the time of its last write.
 */
function dailyFiles(plan: Plan, hits: Hit[], name: string, format: LogFormat) {
  const cuts: number[] = [];
  const random = new Random(`${plan.seed}/logrotate`);
  const delay = random.int(0, 55) * MINUTE;
  for (
    let day = Math.floor(plan.start / DAY) * DAY + DAY;
    day < plan.end;
    day += DAY
  ) {
    const cut = day + delay + random.int(0, 59) * SECOND;
    if (cut > plan.start && cut < plan.end) cuts.push(cut);
  }
  cuts.push(plan.end);
  const files: { hits: Hit[]; text: string }[] = [];
  let index = 0;
  let count = new Random(`${plan.seed}/traefik`).int(1, 5_000);
  for (const cut of cuts) {
    const group: Hit[] = [];
    const text: string[] = [];
    for (; index < hits.length && hits[index].at < cut; index++) {
      const hit = hits[index];
      group.push(hit);
      text.push(
        `${format === "traefik-json" ? traefikLine(plan, hit, count++) : hallviLine(plan, hit)}\n`,
      );
    }
    if (group.length) files.push({ hits: group, text: text.join("") });
  }
  return files.reverse().map((file, age) => ({
    name: age === 0 ? `${name}.1` : `${name}.${age + 1}.gz`,
    hits: file.hits,
    body: age === 0 ? Buffer.from(file.text) : gzipSync(file.text),
    mtime: file.hits[file.hits.length - 1].at,
  }));
}

function backfill(flags: Record<string, string>) {
  const format = flags.format as LogFormat;
  if (!LOG_FORMATS.includes(format))
    fail(`Give --format ${LOG_FORMATS.join("|")}.`);
  const shape = flags.shape as Shape;
  if (!SHAPES.includes(shape)) fail(`Give --shape ${SHAPES.join("|")}.`);
  if (!flags.out) fail("Give --out <dir>.");
  const days = Number(flags.days ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 400)
    fail("Give --days from 1 to 400.");
  const end = flags.end
    ? Date.parse(flags.end)
    : Math.floor(Date.now() / SECOND) * SECOND;
  if (!Number.isFinite(end)) fail("--end is not a time.");
  const releases = (flags.releases ?? "")
    .split(",")
    .filter(Boolean)
    .map((text) => {
      const at = Date.parse(text);
      if (!Number.isFinite(at)) fail(`--releases: ${text} is not a time.`);
      return at;
    });
  const host = (flags.host ?? "example.test").toLowerCase();
  const name = flags.name ?? "access.log";
  const seed = flags.seed ?? "1";
  const plan = makePlan({
    seed,
    shape,
    host,
    start: end - days * DAY,
    end,
    releases,
  });
  const hits = simulate(plan);
  const files =
    format === "caddy-json"
      ? caddyFiles(plan, hits, name)
      : dailyFiles(plan, hits, name, format);

  mkdirSync(flags.out, { recursive: true });
  const manifest = join(flags.out, "traffic-fixture.json");
  for (const file of [
    ...files.map((item) => item.name),
    "traffic-fixture.json",
  ])
    if (existsSync(join(flags.out, file)))
      fail(
        `${join(flags.out, file)} exists; this never overwrites a log. Use an empty --out.`,
      );
  const written: Written[] = files.map((file) => {
    const path = join(flags.out, file.name);
    writeFileSync(path, file.body);
    const mtime = file.mtime / 1000;
    utimesSync(path, mtime, mtime);
    return {
      name: file.name,
      from: new Date(file.hits[0].at).toISOString(),
      to: new Date(file.hits[file.hits.length - 1].at).toISOString(),
      lines: file.hits.length,
      bytes: file.body.length,
      sha256: createHash("sha256").update(file.body).digest("hex"),
    };
  });
  const kinds: Record<string, number> = {};
  for (const hit of hits) kinds[hit.kind] = (kinds[hit.kind] ?? 0) + 1;
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        tool: "scripts/traffic-fixture.ts backfill",
        format,
        shape,
        seed,
        host,
        from: new Date(plan.start).toISOString(),
        to: new Date(plan.end).toISOString(),
        releases: releases.map((at) => new Date(at).toISOString()),
        marker:
          "Every line carries the X-Hallvi-Fixture request header (browser, bot, client or hallvi).",
        remove:
          "Delete exactly these files. logrotate renames them on each rotation (.1 becomes .2.gz), so after one, find them by the marker instead.",
        lines: hits.length,
        kinds,
        files: written,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `${hits.length} lines, ${new Date(plan.start).toISOString()} to ${new Date(plan.end).toISOString()}, in ${written.length} files under ${flags.out}:`,
  );
  for (const file of written)
    console.log(
      `  ${file.name}  ${file.lines} lines  ${file.from} → ${file.to}`,
    );
  console.log(
    `  ${Object.entries(kinds)
      .map(([kind, count]) => `${count} ${kind}`)
      .join(", ")}`,
  );
  console.log(`Manifest: ${manifest}`);
}

// ---------------------------------------------------------------------------
// Live: real requests through a proxy, so the live view moves.

interface Reply {
  status: number;
  type: string | null;
  location: string | null;
  html: string | null;
}

// A request is never cut off on the way out: one the proxy logged but the
// sender tallied as failed would make the two counts disagree.
function liveSend(
  base: URL,
  agent: http.Agent,
  method: string,
  target: string,
  headers: [string, string][],
): Promise<Reply> {
  const client = base.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const failed = () =>
      resolve({ status: 0, type: null, location: null, html: null });
    let request: http.ClientRequest;
    try {
      request = client.request(
        {
          protocol: base.protocol,
          hostname: base.hostname,
          port: base.port || undefined,
          method,
          path: target,
          agent,
          headers: Object.fromEntries(headers),
          timeout: 15_000,
        },
        (response) => {
          const type =
            response.headers["content-type"]?.split(";")[0].trim() ?? null;
          const chunks: Buffer[] = [];
          let length = 0;
          response.on("data", (chunk: Buffer) => {
            if (type === "text/html" && length < 2_000_000) {
              chunks.push(chunk);
              length += chunk.length;
            }
          });
          response.on("end", () => {
            let html: string | null = null;
            if (type === "text/html") {
              const body = Buffer.concat(chunks);
              const encoding = response.headers["content-encoding"];
              try {
                html = (
                  encoding === "gzip"
                    ? gunzipSync(body)
                    : encoding === "br"
                      ? brotliDecompressSync(body)
                      : encoding === "deflate"
                        ? inflateSync(body)
                        : encoding === "zstd"
                          ? zstdDecompressSync(body)
                          : body
                ).toString("utf8");
              } catch {
                html = null;
              }
            }
            resolve({
              status: response.statusCode ?? 0,
              type,
              location: response.headers.location ?? null,
              html,
            });
          });
          response.on("error", failed);
        },
      );
    } catch {
      // Node refuses some probe paths outright; a scanner's request that
      // never left counts as failed, like one the server dropped.
      failed();
      return;
    }
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", failed);
    request.end();
  });
}

/** Same-site files and links a page names, the way a browser finds them. */
function linksIn(html: string, page: URL) {
  const files: { target: string; dest: Dest }[] = [];
  const pages: string[] = [];
  for (const [, tag, attributes] of html.matchAll(
    /<(script|link|img|a)\b([^>]*)>/gi,
  )) {
    const value = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(
      attributes,
    )?.[1];
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value, page);
    } catch {
      continue;
    }
    if (url.origin !== page.origin) continue;
    const target = url.pathname + url.search;
    const rel =
      /\brel\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase() ??
      "";
    const name = tag.toLowerCase();
    if (name === "a") pages.push(target);
    else if (name === "script" || rel.includes("modulepreload"))
      files.push({ target, dest: "script" });
    else if (name === "img" || rel.includes("icon"))
      files.push({ target, dest: "image" });
    else if (rel.includes("stylesheet")) files.push({ target, dest: "style" });
    else if (rel.includes("preload") && /\bas\s*=\s*["']font/i.test(attributes))
      files.push({ target, dest: "font" });
  }
  const seen = new Set<string>();
  return {
    files: files
      .filter((file) => !seen.has(file.target) && seen.add(file.target))
      .slice(0, 10),
    pages: [...new Set(pages)].slice(0, 40),
  };
}

async function live(flags: Record<string, string>) {
  if (!flags.url) fail("Give --url <base>, for example https://example.test.");
  const base = new URL(flags.url);
  const shape = flags.shape as Shape;
  if (!SHAPES.includes(shape)) fail(`Give --shape ${SHAPES.join("|")}.`);
  const rate = Number(flags.rate);
  if (!(rate > 0 && rate <= 600))
    fail("Give --rate, visits a minute, up to 600.");
  const minutes = flags.minutes ? Number(flags.minutes) : Infinity;
  const plan = makePlan({
    seed: flags.seed ?? `${Date.now()}`,
    shape,
    host: base.hostname,
    start: Date.now(),
    end: Date.now() + DAY,
    releases: [],
  });
  const random = new Random(`${plan.seed}/live`);
  const data = plan.data;
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  const stopAt = Date.now() + minutes * MINUTE;
  const counts: Record<string, number> = {};
  const count = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  // Pages that answered with a page; those that did not are not offered again.
  const good = new Set<string>(["/"]);
  const bad = new Set<string>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      stop.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });

  const send = async (
    agent: http.Agent,
    kind: Kind,
    method: string,
    target: string,
    headers: [string, string][],
  ) => {
    const reply = await liveSend(base, agent, method, target, headers);
    // Tallied the way `verify` counts the proxy's log, so the two can be
    // held against each other. A request that got no answer is not logged.
    if (!reply.status) count("failed");
    else if (target.startsWith(HALLVI_PATH_PREFIX)) count("own");
    else {
      count(kind);
      if (reply.status >= 500) count("errors");
    }
    return reply;
  };

  const visitor = async (index: number) => {
    const own = new Random(`${plan.seed}/live/${index}`);
    const entry = own.weighted(data.sources.map((item) => [item, item.weight]));
    const person = newPerson(
      `${plan.seed}/live/${index}`,
      SOURCES[entry.source]?.audience || data.audience,
      SOURCES[entry.source]?.mobile ?? 0.4,
    );
    const landing = landingFor(
      plan,
      own,
      entry.source,
      entry.lands,
      Date.now(),
    );
    if (bad.has(landing.path) || own.chance(0.3))
      landing.path = own.pick([...good]);
    const agent = new (base.protocol === "https:" ? https : http).Agent({
      keepAlive: true,
      maxSockets: 6,
    });
    let target = landing.query
      ? `${landing.path}?${landing.query}`
      : landing.path;
    let referrer = landing.referrer;
    let site: Site = referrer ? "cross-site" : "none";
    let view = own.id(16);
    const event = (page: string, value: ScriptEvent) =>
      send(
        agent,
        "browser",
        "POST",
        eventPath(value),
        browserHeaders(
          person,
          {
            dest: "empty",
            mode: "no-cors",
            site: "same-origin",
            referrer: page,
            more: [
              ["origin", base.origin],
              ["content-length", "0"],
            ],
          },
          "browser",
        ),
      ).then((reply) => reply.status && count(`event ${value.t}`));
    try {
      for (let views = 0; views < 12 && !stop.signal.aborted; views++) {
        let reply = await send(
          agent,
          "browser",
          "GET",
          target,
          browserHeaders(
            person,
            { dest: "document", mode: "navigate", site, referrer, user: true },
            "browser",
          ),
        );
        for (
          let hop = 0;
          hop < 3 &&
          reply.status >= 300 &&
          reply.status < 400 &&
          reply.location;
          hop++
        ) {
          const next = new URL(reply.location, new URL(target, base));
          if (next.origin !== base.origin) break;
          target = next.pathname + next.search;
          reply = await send(
            agent,
            "browser",
            "GET",
            target,
            browserHeaders(
              person,
              {
                dest: "document",
                mode: "navigate",
                site,
                referrer,
                user: true,
              },
              "browser",
            ),
          );
        }
        const path = target.split("?")[0];
        if (reply.status >= 200 && reply.status < 300) good.add(path);
        else if (reply.status >= 400) {
          bad.add(path);
          good.delete(path);
        }
        // A browser without fetch metadata is only known by its HTML.
        const answered =
          (reply.status >= 200 && reply.status < 300) || reply.status === 304;
        if (
          answered &&
          (!person.browser.noFetchMetadata || reply.type === "text/html")
        )
          count("views");
        const page = new URL(target, base).href;
        const found = reply.html
          ? linksIn(reply.html, new URL(page))
          : { files: [], pages: [] };
        await Promise.all(
          found.files.map((file) =>
            send(
              agent,
              "browser",
              "GET",
              file.target,
              browserHeaders(
                person,
                {
                  dest: file.dest,
                  mode: file.dest === "font" ? "cors" : "no-cors",
                  site: "same-origin",
                  referrer: page,
                },
                "browser",
              ),
            ),
          ),
        );
        for (const link of found.pages.slice(0, 20))
          if (!bad.has(link.split("?")[0])) good.add(link.split("?")[0]);
        let route = path;
        let routeUrl = page;
        if (shape === "spa") {
          await send(
            agent,
            "browser",
            "GET",
            SCRIPT_PATH,
            browserHeaders(
              person,
              {
                dest: "script",
                mode: "no-cors",
                site: "same-origin",
                referrer: page,
              },
              "browser",
            ),
          );
          const first: ScriptEvent = {
            t: "view",
            s: view,
            p: route,
            w: person.width,
          };
          if (referrer) first.r = originOf(referrer);
          const tags = keptOf(landing.query);
          if (views === 0 && Object.keys(tags).length) first.u = tags;
          await event(page, first);
        }
        // Stay a while; the script pings while the tab is open.
        const stayed = Math.min(
          own.around(
            (SECTIONS[sectionOf(plan, path) ?? "home"]?.dwell ?? 30) * SECOND,
            0.8,
          ),
          3 * MINUTE,
        );
        for (
          let spent = 0;
          spent < stayed && !stop.signal.aborted;
          spent += PING_SECONDS * SECOND
        ) {
          await sleep(Math.min(PING_SECONDS * SECOND, stayed - spent));
          if (shape === "spa" && spent + PING_SECONDS * SECOND < stayed)
            await event(routeUrl, { t: "ping", s: view, p: route });
        }
        if (shape === "spa") {
          await event(routeUrl, {
            t: "leave",
            s: view,
            p: route,
            e: Math.round(stayed),
          });
          if (!own.chance(0.7)) break;
          // A route change inside the application: no document at all.
          route = pickPage(plan, own, "app");
          routeUrl = new URL(route, base).href;
          view = own.id(16);
          await event(routeUrl, {
            t: "view",
            s: view,
            p: route,
            r: base.origin,
            w: person.width,
          });
          const reads = data.api.filter((item) => item.method === "GET");
          for (const endpoint of own.shuffle(reads).slice(0, own.int(1, 2)))
            await send(
              agent,
              "browser",
              "GET",
              endpoint.path.replace("{id}", String(own.int(1, 60))),
              browserHeaders(
                person,
                {
                  dest: "empty",
                  mode: "cors",
                  site: "same-origin",
                  referrer: routeUrl,
                  accept: "application/json",
                },
                "browser",
              ),
            );
          continue;
        }
        if (!own.chance(0.55)) break;
        const links = found.pages.filter(
          (link) => !bad.has(link.split("?")[0]),
        );
        target =
          links.length && own.chance(0.7)
            ? own.pick(links)
            : own.pick([...good]);
        referrer = page;
        site = "same-origin";
      }
    } finally {
      agent.destroy();
    }
  };

  const robot = async (index: number) => {
    const own = new Random(`${plan.seed}/live/bot/${index}`);
    const bots = BOTS.filter(
      (bot) => bot.daily[shape] && bot.work !== "monitor",
    );
    const bot = own.weighted(
      bots.map((item) => [item, item.daily[shape] ?? 0]),
    );
    const ua = own.pick(bot.ua);
    const agent = new (base.protocol === "https:" ? https : http).Agent({
      keepAlive: false,
    });
    const paths =
      bot.work === "probe"
        ? own.shuffle(PROBES).slice(0, own.int(1, 6))
        : [
            bot.work === "crawl"
              ? crawlTarget(plan, own).path
              : own.pick([...good]),
          ];
    for (const path of paths) {
      if (stop.signal.aborted) break;
      await send(
        agent,
        "bot",
        "GET",
        path,
        bot.work === "render"
          ? browserHeaders(
              {
                browser: BROWSERS[0],
                version: "152",
                ua,
                device: "desktop",
                country: "DE",
              },
              {
                dest: "document",
                mode: "navigate",
                site: "none",
                referrer: null,
                user: true,
              },
              "bot",
            )
          : robotRequest(ua, bot.headers),
      );
      await sleep(own.around(300, 0.6));
    }
    agent.destroy();
  };

  const client = async (index: number) => {
    const own = new Random(`${plan.seed}/live/client/${index}`);
    const type = own.weighted(
      API_CLIENTS.map((item) => [item, item.count * item.daily]),
    );
    const agent = new (base.protocol === "https:" ? https : http).Agent({
      keepAlive: true,
    });
    for (let call = own.int(1, 5); call > 0 && !stop.signal.aborted; call--) {
      const endpoint = own.weighted(
        data.api.map((item) => [item, item.weight]),
      );
      await send(
        agent,
        "client",
        endpoint.method,
        endpoint.path.replace("{id}", String(own.int(1_000, 99_999))),
        [
          ["user-agent", type.ua],
          ["accept", "application/json"],
          ["authorization", `Bearer ${own.hex(40)}`],
          [MARKER, "client"],
        ],
      );
      await sleep(own.around(800, 0.8));
    }
    agent.destroy();
  };

  console.log(
    `Sending ${shape} traffic to ${base.origin} at about ${rate} visits a minute${Number.isFinite(minutes) ? ` for ${minutes} minutes` : ""}; Ctrl-C stops.`,
  );
  console.log("Every request comes from this machine's one address.");
  const running = new Set<Promise<void>>();
  const report = setInterval(
    () =>
      console.log(
        `  ${Object.entries(counts)
          .map(([key, value]) => `${value} ${key}`)
          .join(", ")}; ${running.size} visits open`,
      ),
    30 * SECOND,
  );
  let index = 0;
  const bots = shape === "tiny" ? 0.6 : shape === "busy" ? 0.25 : 0.15;
  while (!stop.signal.aborted && Date.now() < stopAt) {
    const roll = random.next();
    const work =
      roll < bots
        ? robot(index)
        : shape === "api" && roll < 0.9
          ? client(index)
          : visitor(index);
    running.add(work);
    void work.finally(() => running.delete(work));
    index++;
    await sleep(-Math.log(1 - random.next()) * (MINUTE / rate));
  }
  stop.abort();
  await Promise.allSettled([...running]);
  clearInterval(report);
  // The same names `verify` prints, to hold one against the other.
  console.log(`Done: ${JSON.stringify(counts, Object.keys(counts).sort())}`);
}

// ---------------------------------------------------------------------------
// Verify: an independent count of raw log files.
//
// This reads the three formats itself and applies the design's definitions
// (docs/design/traffic.md, "Counting") in its own words. Whether a line is a
// bot comes from the fixture's marker: this tool made the line, so it knows.

interface Seen {
  at: number;
  method: string;
  path: string;
  status: number;
  address: string;
  ua: string;
  dest: string | null;
  purpose: string | null;
  type: string | null;
  kind: string | null;
}

function readLine(format: LogFormat, text: string): Seen | null | "other" {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(text.slice(text.indexOf("{")));
  } catch {
    return null;
  }
  const string = (value: unknown) =>
    typeof value === "string" && value ? value : null;
  if (format === "caddy-json") {
    // Only the access logger's lines are requests.
    if (
      typeof entry.logger !== "string" ||
      !entry.logger.startsWith("http.log.access")
    )
      return "other";
    const request = entry.request as Record<string, unknown> | undefined;
    const headers = (request?.headers ?? {}) as Record<
      string,
      string[] | undefined
    >;
    const answer = (entry.resp_headers ?? {}) as Record<
      string,
      string[] | undefined
    >;
    if (
      !request ||
      typeof request.uri !== "string" ||
      typeof entry.status !== "number"
    )
      return null;
    return {
      at: Number(entry.ts) * 1000,
      method: String(request.method),
      path: request.uri.split("?")[0],
      status: entry.status,
      address: String(request.client_ip ?? request.remote_ip),
      ua: headers["User-Agent"]?.[0] ?? "",
      dest: string(headers["Sec-Fetch-Dest"]?.[0]),
      purpose:
        string(headers["Sec-Purpose"]?.[0]) ?? string(headers.Purpose?.[0]),
      type: string(answer["Content-Type"]?.[0]),
      kind: string(headers["X-Hallvi-Fixture"]?.[0]),
    };
  }
  if (format === "traefik-json") {
    if (
      typeof entry.RequestPath !== "string" ||
      typeof entry.StartUTC !== "string"
    )
      return "other";
    // `time` has whole seconds only; the start and the duration are exact.
    return {
      at: Date.parse(entry.StartUTC) + Number(entry.Duration) / 1e6,
      method: String(entry.RequestMethod),
      path: entry.RequestPath.split("?")[0],
      status: Number(entry.DownstreamStatus),
      address: String(entry.ClientHost),
      ua: string(entry["request_User-Agent"]) ?? "",
      dest: string(entry["request_Sec-Fetch-Dest"]),
      purpose:
        string(entry["request_Sec-Purpose"]) ?? string(entry.request_Purpose),
      type: string(entry["downstream_Content-Type"]),
      kind: string(entry["request_X-Hallvi-Fixture"]),
    };
  }
  if (entry.hallvi !== 1) return "other";
  return {
    at: Number(entry.time) * 1000,
    method: String(entry.method),
    path: String(entry.path).split("?")[0],
    status: Number(entry.status),
    address: String(entry.address),
    ua: String(entry.user_agent ?? ""),
    dest: string(entry.fetch_dest),
    purpose: string(entry.sec_purpose) ?? string(entry.purpose),
    type: string(entry.content_type),
    kind: string(entry.fixture),
  };
}

/** The event a script request carried, decoded here without the contract. */
function eventType(path: string) {
  try {
    const value = JSON.parse(
      Buffer.from(path.slice(EVENT_PREFIX.length), "base64url").toString(
        "utf8",
      ),
    );
    const types = ["view", "ping", "leave", "goal", "vital", "error"];
    if (
      !types.includes(value?.t) ||
      typeof value.s !== "string" ||
      !/^[A-Za-z0-9]{8,32}$/.test(value.s) ||
      typeof value.p !== "string" ||
      !value.p.startsWith("/")
    )
      return null;
    return value.t as string;
  } catch {
    return null;
  }
}

function isView(line: Seen) {
  if (line.method !== "GET") return false;
  if (!((line.status >= 200 && line.status < 300) || line.status === 304))
    return false;
  // A prefetch or prerender is not somebody looking at the page.
  if (line.purpose && /prefetch|prerender/i.test(line.purpose)) return false;
  if (line.dest) return line.dest === "document";
  // Without fetch metadata: an HTML answer to something that says it is a
  // browser.
  return (
    line.type?.split(";")[0].trim() === "text/html" &&
    line.ua.startsWith("Mozilla/5.0")
  );
}

function verify(flags: Record<string, string>, files: string[]) {
  const format = flags.format as LogFormat;
  if (!LOG_FORMATS.includes(format))
    fail(`Give --format ${LOG_FORMATS.join("|")}.`);
  if (!files.length) fail("Name the log files to count.");
  const timeZone =
    flags["time-zone"] ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayOf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayCache = new Map<number, string>();
  const days = new Map<string, ReturnType<typeof emptyDay>>();
  const skipped = { notRequests: 0, unreadable: 0 };
  const perFile: { file: string; lines: number }[] = [];
  for (const file of files) {
    const text = readLog(file);
    let lines = 0;
    for (const row of text.split("\n")) {
      if (!row.trim()) continue;
      const line = readLine(format, row);
      if (line === "other") {
        skipped.notRequests++;
        continue;
      }
      if (!line || !Number.isFinite(line.at)) {
        skipped.unreadable++;
        continue;
      }
      lines++;
      // Time zones move in quarter hours, so a quarter hour has one day.
      const quarter = Math.floor(line.at / (15 * MINUTE));
      let key = dayCache.get(quarter);
      if (!key)
        dayCache.set(
          quarter,
          (key = dayOf.format(new Date(quarter * 15 * MINUTE))),
        );
      let day = days.get(key);
      if (!day) days.set(key, (day = emptyDay(key)));
      countLine(day, line);
    }
    perFile.push({ file, lines });
  }
  const sorted = [...days.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map(finishDay);
  const totals = {
    lines: 0,
    own: 0,
    requests: 0,
    views: 0,
    errors: 0,
    bots: 0,
    clients: 0,
    unmarked: 0,
    events: {} as Record<string, number>,
  };
  for (const day of sorted) {
    for (const key of [
      "lines",
      "own",
      "requests",
      "views",
      "errors",
      "bots",
      "clients",
      "unmarked",
    ] as const)
      totals[key] += day[key];
    for (const [type, value] of Object.entries(day.events))
      totals.events[type] = (totals.events[type] ?? 0) + value;
  }
  console.log(
    JSON.stringify(
      {
        format,
        timeZone,
        rules: {
          own: `Hallvi's own lines: paths under ${HALLVI_PATH_PREFIX} and the "${HALLVI_CHECK}" agent. They are never requests.`,
          requests: "Every other line, bots and clients included.",
          views:
            "Requests that are GET, 2xx or 304, not a prefetch or prerender (Sec-Purpose or Purpose), with Sec-Fetch-Dest document — or, without fetch metadata, an HTML answer to a Mozilla/5.0 agent — and not marked bot or client.",
          errors: "Requests answered 5xx.",
          errorVisitors:
            "Distinct address and user agent among requests answered 5xx, not marked bot or client.",
          bots: "Requests the fixture marked bot. clients: marked client (an API's own callers). unmarked: lines with no marker, counted as browsers.",
          visitors:
            "Distinct address and user agent in the day, among requests, views, and valid events, not marked bot or client.",
          events: `Valid ${EVENT_PREFIX} payloads by type, whatever the answer; fromBots: valid ones marked bot; invalid: the rest.`,
        },
        files: perFile,
        skipped,
        days: sorted,
        totals,
      },
      null,
      2,
    ),
  );
}

function emptyDay(day: string) {
  return {
    day,
    lines: 0,
    own: 0,
    requests: 0,
    views: 0,
    errors: 0,
    bots: 0,
    clients: 0,
    unmarked: 0,
    events: {
      view: 0,
      ping: 0,
      leave: 0,
      goal: 0,
      vital: 0,
      error: 0,
      fromBots: 0,
      invalid: 0,
    } as Record<string, number>,
    sets: {
      requests: new Set<string>(),
      views: new Set<string>(),
      events: new Set<string>(),
      errors: new Set<string>(),
    },
  };
}

function countLine(day: ReturnType<typeof emptyDay>, line: Seen) {
  day.lines++;
  const person = line.kind !== "bot" && line.kind !== "client";
  const browser = `${line.address} ${line.ua}`;
  if (line.path.startsWith(EVENT_PREFIX)) {
    const type = eventType(line.path);
    if (!type) day.events.invalid++;
    else if (!person) day.events.fromBots++;
    else {
      day.events[type]++;
      day.sets.events.add(browser);
    }
  }
  if (
    line.path.startsWith(HALLVI_PATH_PREFIX) ||
    line.ua.startsWith(HALLVI_CHECK)
  ) {
    day.own++;
    return;
  }
  day.requests++;
  if (line.kind === "bot") day.bots++;
  else if (line.kind === "client") day.clients++;
  else if (!line.kind) day.unmarked++;
  if (line.status >= 500) {
    day.errors++;
    if (person) day.sets.errors.add(browser);
  }
  if (!person) return;
  day.sets.requests.add(browser);
  if (isView(line)) {
    day.views++;
    day.sets.views.add(browser);
  }
}

function finishDay({ sets, ...day }: ReturnType<typeof emptyDay>) {
  return {
    ...day,
    errorVisitors: sets.errors.size,
    visitors: {
      requests: sets.requests.size,
      views: sets.views.size,
      events: sets.events.size,
    },
  };
}

/** A log file's text, whether gzipped or not. */
function readLog(file: string) {
  let raw: Buffer;
  try {
    raw = readFileSync(file);
  } catch {
    fail(`Cannot read ${file}.`);
  }
  const zipped = raw[0] === 0x1f && raw[1] === 0x8b;
  return (zipped ? gunzipSync(raw) : raw).toString("utf8");
}

// ---------------------------------------------------------------------------
// Ranges: every block against the country database Hallvi looks up in.

/** The DB-IP Lite database Hallvi ships (src/server/traffic/enrich.ts). */
const COUNTRY_DATABASE =
  "node_modules/@ip-location-db/dbip-country-mmdb/dbip-country.mmdb";

function ranges(files: string[]) {
  const file = files[0] ?? COUNTRY_DATABASE;
  let reader: Reader<Response>;
  try {
    reader = new Reader(readFileSync(file));
  } catch {
    fail(`Cannot read ${file}: run npm ci, or name a DB-IP country .mmdb.`);
  }
  const places = [
    ...Object.entries(COUNTRIES).map(([country, place]) => ({
      country,
      ...place,
    })),
    ...Object.values(NETWORKS),
  ];
  let blocks = 0;
  let wrong = 0;
  for (const { country, v4, v6 } of places)
    for (const block of [...v4, ...v6]) {
      blocks++;
      const found = countriesIn(reader, block);
      if (found.size === 1 && found.has(country)) continue;
      wrong++;
      console.log(`${block}: meant ${country}, DB-IP says ${[...found]}`);
    }
  console.log(
    `${blocks - wrong} of ${blocks} blocks lie wholly in the country meant.`,
  );
  if (wrong) process.exitCode = 1;
}

/** Every country the database gives inside a block, network by network. */
function countriesIn(reader: Reader<Response>, block: string) {
  const [base, prefix] = block.split("/");
  const v6 = base.includes(":");
  const bits = v6 ? 128 : 32;
  const first = v6 ? parseV6(base) : BigInt(parseV4(base));
  const last = first + (1n << BigInt(bits - Number(prefix))) - 1n;
  const found = new Set<string>();
  for (let at = first; at <= last;) {
    const [record, length] = reader.getWithPrefixLength(
      v6 ? formatV6(at) : formatV4(Number(at)),
    );
    found.add(
      (record as { country_code?: string } | null)?.country_code ?? "(none)",
    );
    // A v4 address sits 96 bits deep in the database's v6 tree.
    const own = !v6 && length > 32 ? length - 96 : length;
    const size = 1n << BigInt(bits - own);
    at = (at / size + 1n) * size;
  }
  return found;
}

// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (
    !command ||
    command === "--help" ||
    command === "-h" ||
    rest.includes("--help")
  ) {
    console.log(HELP);
    return;
  }
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    flags[key] = inline ?? rest[++index] ?? "";
  }
  if (command === "backfill") backfill(flags);
  else if (command === "live") void live(flags);
  else if (command === "verify") verify(flags, positional);
  else if (command === "ranges") ranges(positional);
  else fail(`Unknown command ${command}.\n\n${HELP}`);
}

main();
