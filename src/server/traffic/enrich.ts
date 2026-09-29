// What a request says about the person behind it: where from, on what, and
// who sent them.
//
// Each answer is a label on a count and nothing more. The address is looked
// up on this machine in DB-IP's free country database (DB-IP Lite, CC BY 4.0,
// which is why the Traffic page links to DB-IP) and dropped; the user agent
// is read for a browser, a system and a device; the referrer for the site
// that sent the visit. None of them is kept.

import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { Reader, type Response } from "mmdb-lib";

import { DEVICES, DIRECT, UNKNOWN, type ScriptEvent } from "./contract";

export type Device = (typeof DEVICES)[number];

// ---------------------------------------------------------------------------
// Countries

/** Packaged with Hallvi, so a lookup never leaves the machine. */
const COUNTRY_DATABASE = [
  "node_modules",
  "@ip-location-db",
  "dbip-country-mmdb",
  "dbip-country.mmdb",
];

// The reader's types name MaxMind's layouts; DB-IP's records are just
// `{ country_code }`.
let countries: Reader<Response> | null | undefined;
function countryReader() {
  if (countries === undefined) {
    try {
      countries = new Reader(
        readFileSync(
          join(/* turbopackIgnore: true */ process.cwd(), ...COUNTRY_DATABASE),
        ),
      );
    } catch {
      // Without the file every country reads unknown; nothing else changes.
      countries = null;
    }
  }
  return countries;
}

const COUNTRY = /^[A-Z]{2}$/;
/** Codes that name no country: unknown (XX, ZZ), Tor (T1), Europe (EU). */
const NOT_A_COUNTRY = new Set(["XX", "ZZ", "T1", "EU", "AP"]);

/**
 * The visitor's country: a CDN's own header when the line has one — it saw
 * the visitor directly — or the address looked up locally. Only the code is
 * kept.
 */
export function countryOf(address: string, cdnCountry: string | null) {
  const cdn = cdnCountry?.trim().toUpperCase();
  if (cdn && COUNTRY.test(cdn) && !NOT_A_COUNTRY.has(cdn)) return cdn;
  const bare = address.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (!isIP(bare)) return UNKNOWN;
  try {
    const found = countryReader()?.get(bare) as
      { country_code?: string } | null | undefined;
    const code = found?.country_code?.toUpperCase();
    return code && COUNTRY.test(code) && !NOT_A_COUNTRY.has(code)
      ? code
      : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

// ---------------------------------------------------------------------------
// User agents

export interface Agent {
  /** Starts the way every browser's does. A bot can too; classify says. */
  shaped: boolean;
  browser: string;
  system: string;
  device: Device;
  /**
   * A browser of this kind sends fetch metadata (`Sec-Fetch-*`) on every
   * request to an HTTPS site: Chromium from 80, Firefox from 90, Safari and
   * everything on iOS from 16.4. Apps' own browsers and web views are left
   * out, because some of them do not.
   */
  fetchMetadata: boolean;
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOPT\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bYaBrowser\//, "Yandex Browser"],
  [/\bVivaldi\//, "Vivaldi"],
  [/\bUCBrowser\//, "UC Browser"],
  [/\bDuckDuckGo\/|\bDdg\//, "DuckDuckGo"],
  [/\bFBAN\/|\bFBAV\/|\bFB_IAB\//, "Facebook"],
  [/\bInstagram\b/, "Instagram"],
  [/; wv\)/, "Android WebView"],
  [/\bCriOS\/|\bChrome\/|\bChromium\//, "Chrome"],
  [/\bFxiOS\/|\bFirefox\//, "Firefox"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bMSIE |\bTrident\//, "Internet Explorer"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone|\biPad|\biPod/, "iOS"],
  [/\bWindows Phone\b/, "Windows Phone"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bLinux\b|\bX11\b/, "Linux"],
];

const TABLET = /\biPad\b|\bTablet\b|\bPlayBook\b|\bSilk\/|\bKindle\b/i;
const MOBILE =
  /\biPhone\b|\biPod\b|\bMobile\b|\bWindows Phone\b|\bBlackBerry\b|\bBB10\b|\bOpera Mini\b|\bIEMobile\b/i;
const EMBEDDED =
  /; wv\)|\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bInstagram\b|\bLine\/|\bMicroMessenger\/|\bSnapchat\b|\bLinkedInApp\b|\bGSA\//;

function major(userAgent: string, pattern: RegExp) {
  const match = pattern.exec(userAgent);
  return match ? Number(match[1]) + Number(match[2] ?? 0) / 100 : 0;
}

function readAgent(userAgent: string): Agent {
  const shaped = /^Mozilla\/\d|^Opera\//.test(userAgent);
  const browser =
    BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? UNKNOWN;
  const system =
    SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? UNKNOWN;
  const device: Device = TABLET.test(userAgent)
    ? "tablet"
    : system === "Android" && !/\bMobile\b/.test(userAgent)
      ? "tablet"
      : MOBILE.test(userAgent)
        ? "mobile"
        : "desktop";
  let fetchMetadata = false;
  if (shaped && !EMBEDDED.test(userAgent)) {
    if (system === "iOS")
      // Every browser on iOS is WebKit; the system's version decides.
      fetchMetadata =
        /\bSafari\//.test(userAgent) &&
        major(userAgent, /\bOS (\d+)_(\d+)/) >= 16.04;
    else if (/\bChrom(e|ium)\//.test(userAgent))
      fetchMetadata = major(userAgent, /\bChrom(?:e|ium)\/(\d+)/) >= 80;
    else if (/\bFirefox\//.test(userAgent))
      fetchMetadata = major(userAgent, /\bFirefox\/(\d+)/) >= 90;
    else if (browser === "Safari")
      fetchMetadata = major(userAgent, /\bVersion\/(\d+)\.(\d+)/) >= 16.04;
  }
  return { shaped, browser, system, device, fetchMetadata };
}

// A day holds a few thousand distinct agents at most; a scanner rotating
// random ones must not grow this without end.
const agents = new Map<string, Agent>();
export function agentOf(userAgent: string): Agent {
  let agent = agents.get(userAgent);
  if (!agent) {
    if (agents.size >= 5_000) agents.clear();
    agent = readAgent(userAgent);
    agents.set(userAgent, agent);
  }
  return agent;
}

/**
 * The device, with the script's screen width where the agent cannot say: an
 * iPad asks for desktop pages with a Mac's agent, and a phone asking for the
 * desktop site sends a desktop one.
 */
export function deviceOf(agent: Agent, width?: number): Device {
  if (agent.device !== "desktop" || !width) return agent.device;
  if (width < 600) return "mobile";
  if (agent.system === "macOS" && width <= 1100) return "tablet";
  return "desktop";
}

// ---------------------------------------------------------------------------
// Sources and campaigns

/** Referrer hosts named for the sites people know. First match wins. */
const SOURCES: [RegExp, string][] = [
  [/^mail\.google\.com$|^com\.google\.android\.gm$/, "Gmail"],
  [/^gemini\.google\.com$/, "Gemini"],
  [
    /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$|^com\.google\.android\.googlequicksearchbox$/,
    "Google",
  ],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.(com|co\.[a-z]{2}|[a-z]{2})$/, "Yahoo"],
  [/(^|\.)yandex\.[a-z.]+$|^ya\.ru$/, "Yandex"],
  [/(^|\.)baidu\.com$/, "Baidu"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/^search\.brave\.com$/, "Brave Search"],
  [/(^|\.)kagi\.com$/, "Kagi"],
  [/(^|\.)startpage\.com$/, "Startpage"],
  [/(^|\.)qwant\.com$/, "Qwant"],
  [/^news\.ycombinator\.com$/, "Hacker News"],
  [/(^|\.)(twitter|x)\.com$|^t\.co$/, "X"],
  [/(^|\.)reddit\.com$|^redd\.it$/, "Reddit"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)facebook\.com$|^fb\.(com|me)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/^copilot\.microsoft\.com$/, "Copilot"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/^lobste\.rs$/, "Lobsters"],
  [/(^|\.)indiehackers\.com$/, "Indie Hackers"],
  [/^dev\.to$/, "DEV"],
  [/(^|\.)medium\.com$/, "Medium"],
  [/(^|\.)substack\.com$/, "Substack"],
  [/(^|\.)discord(app)?\.com$/, "Discord"],
  [/(^|\.)slack\.com$/, "Slack"],
  [/^t\.me$|(^|\.)telegram\.org$/, "Telegram"],
  [/(^|\.)whatsapp\.com$/, "WhatsApp"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
];

/**
 * Campaign-tag spellings of the same sites, so a tag and a referrer agree. A
 * `Map`, because a tag is anyone's to write: `__proto__` or `constructor`
 * must read as the text it is, not as something every object inherits.
 */
const TAGGED = new Map<string, string>([
  ["google", "Google"],
  ["bing", "Bing"],
  ["duckduckgo", "DuckDuckGo"],
  ["hn", "Hacker News"],
  ["hackernews", "Hacker News"],
  ["twitter", "X"],
  ["x", "X"],
  ["reddit", "Reddit"],
  ["github", "GitHub"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["fb", "Facebook"],
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["chatgpt", "ChatGPT"],
  ["perplexity", "Perplexity"],
  ["claude", "Claude"],
  ["bluesky", "Bluesky"],
  ["producthunt", "Product Hunt"],
]);

const TAG_LIMIT = 100;

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

const bare = (host: string) => host.replace(/^www\./, "");

function sameSite(host: string, own: string, hosts: readonly string[]) {
  const name = bare(host);
  return (
    (own !== "" && name === bare(own)) ||
    hosts.some((item) => bare(item) === name)
  );
}

function sourceNamed(host: string) {
  return (
    SOURCES.find(([pattern]) => pattern.test(host))?.[1] ??
    bare(host).slice(0, TAG_LIMIT)
  );
}

/** A tag the line carried, as its own text, or undefined. */
export function tagOf(tags: Partial<Record<string, string>>, key: string) {
  const value = Object.hasOwn(tags, key) ? tags[key] : undefined;
  return typeof value === "string" ? value : undefined;
}

function tagged(value: string) {
  const tag = value.trim().slice(0, TAG_LIMIT);
  if (!tag) return null;
  const known = TAGGED.get(tag.toLowerCase());
  if (known) return known;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(tag))
    return sourceNamed(tag.toLowerCase());
  return tag;
}

export interface Arrival {
  /** The `Referer`, or a script view's `r`: a URL or an origin. */
  referrer: string | null;
  /** The host the request was for, "" when the log does not say. */
  host: string;
  /** The application's own hosts. */
  hosts: readonly string[];
  /** Kept query keys: `utm_*` and `ref`. */
  tags: Partial<Record<string, string>>;
}

/**
 * Where a view arrived from, or null when it did not arrive: a referrer on
 * the application's own site is one page leading to another (a link, a
 * route change, a page brought back from memory), whatever tags its address
 * still carries. An arrival's source is its `utm_source` or `ref` tag, then
 * the referring site, named when it is one people know; with neither, a
 * campaign's source is unknown and anything else is Direct.
 */
export function arrivalOf({ referrer, host, hosts, tags }: Arrival) {
  const from = referrer ? hostOf(referrer) : null;
  if (from && sameSite(from, host, hosts)) return null;
  const campaign =
    tagOf(tags, "utm_campaign")?.trim().slice(0, TAG_LIMIT) || null;
  const source =
    tagged(tagOf(tags, "utm_source") ?? "") ??
    tagged(tagOf(tags, "ref") ?? "") ??
    (from ? sourceNamed(from) : campaign ? UNKNOWN : DIRECT);
  return { source, campaign };
}

/**
 * A page's name, the same from the log and from the script: both carry the
 * path as the browser sent it, so it is decoded once, and a trailing slash
 * does not make a second page. Without this, one page splits in two at the
 * switch point.
 */
export function pageName(path: string) {
  // A path never carries a query or a fragment; should one slip through, it
  // is where tokens live, and it goes.
  let name = path.replace(/[?#][\s\S]*$/, "");
  try {
    name = decodeURI(name);
  } catch {
    // Not valid percent-encoding: keep it as it was sent.
  }
  if (name.length > 1) name = name.replace(/\/+$/, "") || "/";
  return name.slice(0, 300);
}

/**
 * A page of an application that routes by a query key (WordPress's `p`): its
 * path and that key's value, the same whether the log's kept fields or the
 * script's event said it. Without a key, or without a value, the path alone.
 */
export function keyedPage(path: string, key?: string, value?: string) {
  const page = pageName(path);
  return key && value ? `${page}?${key}=${value.slice(0, 100)}` : page;
}

/**
 * An event's page. The record, not the event, chooses the key: an event
 * naming any other key is named by its path alone.
 */
export function eventPage(event: ScriptEvent, pageKey?: string) {
  return keyedPage(
    event.p,
    pageKey,
    pageKey && event.q?.k === pageKey ? event.q.v : undefined,
  );
}

/**
 * The page a same-site referrer names, or null. The proxy has already
 * removed its query string, so this is a path and nothing else.
 */
export function referringPage(
  referrer: string | null,
  host: string,
  hosts: readonly string[],
) {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return sameSite(url.hostname.toLowerCase(), host, hosts)
      ? pageName(url.pathname || "/")
      : null;
  } catch {
    return null;
  }
}
