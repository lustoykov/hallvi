// What one logged request was: a page someone opened, an ordinary request, a
// bot, one of Hallvi's own, or an event from Hallvi's script.
//
// The rules are fixed and err on the side of not calling a person a bot:
// something is a bot when it says so, when it probes for files no browser
// asks for, or when it claims to be a browser that always sends fetch
// metadata and sends none. That last rule needs to know whether browsers
// reach this site with fetch metadata at all — over plain HTTP none do — so
// the count decides it for the whole pass; here a request is only marked as
// an imitation candidate.

import { HALLVI_USER_AGENT } from "../access-log";
import {
  eventOf,
  HALLVI_PATH_PREFIX,
  type ScriptEvent,
  type TrafficLine,
} from "./contract";
import { agentOf } from "./enrich";

export type Classified =
  /** Hallvi's own: its access check, the script, a malformed event. */
  { kind: "own" } | { kind: "event"; event: ScriptEvent } | Request;

export interface Request {
  kind: "request";
  /** The bot's name when it is one: counted as a bot, never as a visitor. */
  bot: string | null;
  /** A person's browser, as far as the request can tell. */
  browser: boolean;
  /**
   * Claims a browser that always sends fetch metadata, sent none, and was
   * not a redirect. A bot if the pass shows browsers reach this site with
   * fetch metadata; a browser otherwise.
   */
  imitation: boolean;
  /** A document the browser loaded, a prefetch included. */
  document: boolean;
  /** A real navigation: GET, 2xx or 304, a document, not a prefetch. */
  view: boolean;
}

/** The name imitation candidates are counted under once they are bots. */
export const IMITATION = "Browser imitations";

/** Agents that say what they are. First match names the bot. */
const BOTS: [RegExp, string][] = [
  [
    /Googlebot|Google-InspectionTool|GoogleOther|Google-Extended|AdsBot-Google|Mediapartners-Google|APIs-Google|FeedFetcher-Google|Google-Read-Aloud|Storebot-Google|Google-Site-Verification|Google-PageRenderer|Google-Safety/i,
    "Google",
  ],
  [/bingbot|BingPreview|msnbot|adidxbot|MicrosoftPreview/i, "Bing"],
  [/Applebot/i, "Apple"],
  [/GPTBot|ChatGPT-User|OAI-SearchBot/i, "OpenAI"],
  [
    /ClaudeBot|Claude-User|Claude-SearchBot|Claude-Web|anthropic-ai/i,
    "Anthropic",
  ],
  [/PerplexityBot|Perplexity-User/i, "Perplexity"],
  [
    /meta-externalagent|meta-externalfetcher|facebookexternalhit|Facebot|FacebookBot/i,
    "Meta",
  ],
  [/DuckDuckBot|DuckAssistBot|DuckDuckGo-Favicons-Bot/i, "DuckDuckGo"],
  [/Yandex\w*(Bot|Metrika|Images|Fetcher)|YaDirectFetcher/i, "Yandex"],
  [/Baiduspider/i, "Baidu"],
  [/Bytespider|TikTokSpider/i, "ByteDance"],
  [/Amazonbot|AmazonProductDiscovery/i, "Amazon"],
  [/CCBot/i, "Common Crawl"],
  [/AhrefsBot|AhrefsSiteAudit/i, "Ahrefs"],
  [/SemrushBot|SiteAuditBot|SplitSignalBot/i, "Semrush"],
  [/MJ12bot/i, "Majestic"],
  [/DotBot|rogerbot/i, "Moz"],
  [/PetalBot|AspiegelBot/i, "Petal"],
  [/Twitterbot/i, "X"],
  [/LinkedInBot/i, "LinkedIn"],
  [/Slackbot|Slack-ImgProxy/i, "Slack"],
  [/Discordbot/i, "Discord"],
  [/TelegramBot/i, "Telegram"],
  [/WhatsApp/i, "WhatsApp"],
  [/Pinterestbot/i, "Pinterest"],
  [/redditbot/i, "Reddit"],
  [/SkypeUriPreview|Iframely|Embedly|bitlybot|vkShare/i, "Link previews"],
  [
    /UptimeRobot|Pingdom|StatusCake|BetterStack|Better Uptime|Uptime-Kuma|Site24x7|Freshping|HetrixTools|Checkly|updown\.io|NodePing|Datadog\/Synthetics|NewRelicPinger/i,
    "Uptime monitors",
  ],
  [
    /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium/i,
    "Headless browsers",
  ],
  [
    /zgrab|masscan|Nmap|Nikto|sqlmap|Nuclei|WPScan|CensysInspect|Expanse|Xpanse|InternetMeasurement|l9explore|l9tcpid|BinaryEdge|LeakIX|NetcraftSurveyAgent/i,
    "Scanners",
  ],
];

/**
 * Any other self-declared robot, named by the word that declares it. Cubot
 * makes phones, and its model names reach the agent.
 */
const DECLARED =
  /[A-Za-z0-9_.-]*((?<!cu)bot|crawler|spider|scraper)\b[A-Za-z0-9_.-]*/i;
/** Browsers never put an address in their agent; robots put theirs there. */
const SIGNED = /\+?https?:\/\/|\bwww\.[a-z0-9-]+\./i;

// Read once per distinct agent in a pass, like `agentOf`.
const named = new Map<string, string | null>();
function botOf(userAgent: string) {
  let bot = named.get(userAgent);
  if (bot === undefined) {
    if (named.size >= 5_000) named.clear();
    bot = readBot(userAgent);
    named.set(userAgent, bot);
  }
  return bot;
}

function readBot(userAgent: string) {
  const agent = userAgent.trim();
  if (!agent || agent === "-") return "No user agent";
  for (const [pattern, name] of BOTS) if (pattern.test(agent)) return name;
  const declared = DECLARED.exec(agent)?.[0];
  if (declared) return declared.slice(0, 40);
  if (SIGNED.test(agent)) {
    const product =
      /compatible;\s*([^;/)\s]+)/i.exec(agent)?.[1] ??
      /^([^/\s]+)/.exec(agent)?.[1];
    return (product ?? "Other bots").slice(0, 40);
  }
  return null;
}

/** A dotfile or dot-directory; `/.well-known` is the one browsers ask for. */
const DOTFILE = /\/\.(?!well-known(\/|$))/;
/** The usual targets of vulnerability scanners. */
const TARGETS =
  /^\/(wp-(login|admin|content|includes|json|config)|xmlrpc\.php|phpmyadmin|pma|myadmin|mysql|adminer|cgi-bin|boaform|HNAP1|actuator|vendor\/phpunit|solr|owa|autodiscover|remote\/login|geoserver|console|manager\/html|jenkins|telescope|_ignition|server-status)(\/|\.|$)/i;
/** Scripts and backups a scanner hopes were left behind. */
const LEFT_BEHIND =
  /\.(php\d?|asp|aspx|jsp|cgi|bak|old|sql|swp|zip|tar|gz|rar|7z)$/i;

/**
 * A probe: a dotfile whatever the answer, or a scanner's usual target the
 * application does not have (it answered 4xx). A WordPress site's own
 * `/wp-login.php` answers, and is not a probe there.
 */
function probeOf(path: string, status: number) {
  if (DOTFILE.test(path)) return "Scanners";
  const missing = status >= 400 && status < 500;
  return missing && (TARGETS.test(path) || LEFT_BEHIND.test(path))
    ? "Scanners"
    : null;
}

const HTML = /^(text\/html|application\/xhtml\+xml)$/i;

/**
 * Without fetch metadata: an HTML answer, or a page-shaped path when the
 * log does not say what was answered.
 */
function htmlish(line: TrafficLine) {
  if (line.contentType !== null) return HTML.test(line.contentType.trim());
  const last = line.path.split("/").pop() ?? "";
  return !last.includes(".") || /\.html?$/i.test(last);
}

export function hasFetchMetadata(line: TrafficLine) {
  return Boolean(line.fetchDest || line.fetchMode);
}

export function classify(line: TrafficLine): Classified {
  if (line.userAgent.startsWith(HALLVI_USER_AGENT)) return { kind: "own" };
  const agent = agentOf(line.userAgent);
  if (line.path.startsWith(HALLVI_PATH_PREFIX)) {
    const event = eventOf(line.path);
    // A crawler that runs the script is still a crawler, and something that
    // is not a browser did not run it.
    return event && agent.shaped && !botOf(line.userAgent)
      ? { kind: "event", event }
      : { kind: "own" };
  }
  const bot = botOf(line.userAgent) ?? probeOf(line.path, line.status);
  const browser = !bot && agent.shaped;
  const redirect =
    line.status >= 300 && line.status < 400 && line.status !== 304;
  const document =
    line.method === "GET" &&
    !redirect &&
    (line.fetchDest
      ? line.fetchDest === "document"
      : line.fetchMode
        ? line.fetchMode === "navigate"
        : htmlish(line));
  const answered =
    (line.status >= 200 && line.status < 300) || line.status === 304;
  return {
    kind: "request",
    bot,
    browser,
    imitation:
      browser && !redirect && !hasFetchMetadata(line) && agent.fetchMetadata,
    document,
    view: browser && document && answered && !line.purpose,
  };
}
