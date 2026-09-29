// Access log lines, whichever proxy wrote them.
//
// Caddy, nginx and Traefik each write their own JSON. What leaves here is one
// `TrafficLine`, so counting, storage, the pages and Pi never learn which
// proxy it was. The log is the internet's: anything in it may be malformed or
// hostile, so a line that is not a request this application served is null,
// never an exception.
//
// What each proxy is asked to write is in the readers' report and in Pi's
// instructions; the field names below are the ones real proxies wrote.

import {
  EVENT_PREFIX,
  KEPT_QUERY_KEYS,
  type LogFormat,
  type TrafficLine,
} from "./contract";

/**
 * What Hallvi's own requests call themselves. Hallvi checking an address
 * every half minute is not a visitor, whatever proxy logged it.
 */
export const HALLVI_USER_AGENT = "Hallvi access check";

/**
 * Where a kept query key travels once the proxy has removed the query string
 * before writing the line: Caddy's `log_append hv_utm_source
 * {query.utm_source}`, and `hv_page` for the application's page key. Caddy
 * always writes them, as "" when the request had no such key.
 */
export const caddyKeptField = (key: string) => `hv_${key}`;
export const CADDY_PAGE_FIELD = "hv_page";

export interface ParseOptions {
  /** A query key the application routes by, such as WordPress's `p`. */
  pageKey?: string;
  /**
   * The names this application answers to. A proxy that serves several
   * applications writes one log for all of them; the other hosts' lines are
   * theirs.
   */
  hosts?: readonly string[];
}

type Entry = Record<string, unknown>;

/** One request, or null for anything but a request this application served. */
export function parseLine(
  format: LogFormat,
  text: string,
  options: ParseOptions = {},
): TrafficLine | null {
  const entry = entryIn(text);
  if (!entry) return null;
  const at = timeOf(format, entry);
  if (at === null) return null;
  const line =
    format === "caddy-json"
      ? caddy(entry, at, options)
      : format === "hallvi-json"
        ? hallvi(entry, at, options)
        : traefik(entry, at, options);
  if (!line || line.userAgent.startsWith(HALLVI_USER_AGENT)) return null;
  if (options.hosts?.length && line.host && !options.hosts.includes(line.host))
    return null;
  return line;
}

/**
 * When a line of this format was written, whether or not it is a request
 * worth counting. Coverage is about how far the log reaches, and Hallvi's own
 * checks and another application's requests prove that as well as any.
 */
export function lineTime(format: LogFormat, text: string) {
  const entry = entryIn(text);
  return entry ? timeOf(format, entry) : null;
}

// A container's log puts its own prefix before the line — Compose's
// "caddy-1  | ", docker's timestamp — so the object starts at the first brace.
function entryIn(text: string): Entry | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return objectOf(JSON.parse(text.slice(start)));
  } catch {
    return null;
  }
}

function timeOf(format: LogFormat, entry: Entry): number | null {
  let at: number;
  if (format === "caddy-json") {
    // Seconds, written when the response has gone: the request's end.
    at = typeof entry.ts === "number" ? entry.ts * 1000 : NaN;
  } else if (format === "hallvi-json") {
    // nginx's $msec, also taken when the line is written.
    at = entry.hallvi === 1 ? Number(entry.time) * 1000 : NaN;
  } else {
    // Traefik's `time` has whole seconds only. The start has nanoseconds,
    // and the end is the start plus the duration, which is in nanoseconds.
    const start = typeof entry.StartUTC === "string" ? entry.StartUTC : "";
    at =
      Date.parse(start) +
      (typeof entry.Duration === "number" ? entry.Duration / 1e6 : 0);
    if (!Number.isFinite(at) && typeof entry.time === "string")
      at = Date.parse(entry.time);
  }
  return Number.isFinite(at) && at > 0 ? Math.round(at) : null;
}

function caddy(entry: Entry, at: number, options: ParseOptions) {
  // A failed request is written twice: once by the access logger and once by
  // `http.log.error`, with the same request and status. Only the first is a
  // request; counting both doubled every failure on a real server.
  if (
    typeof entry.logger === "string" &&
    !entry.logger.startsWith("http.log.access")
  )
    return null;
  const request = objectOf(entry.request);
  if (
    !request ||
    typeof request.uri !== "string" ||
    typeof entry.status !== "number"
  )
    return null;
  // Header names are Go's canonical spelling, and every value is a list.
  const headers = objectOf(request.headers) ?? {};
  const header = (name: string) => firstOf(headers[name]);
  const target = request.uri;
  const kept = keptIn(target, options.pageKey);
  for (const key of KEPT_QUERY_KEYS)
    keep(kept, key, entry[caddyKeptField(key)]);
  if (options.pageKey) keep(kept, options.pageKey, entry[CADDY_PAGE_FIELD]);
  return line({
    at,
    host: request.host,
    method: request.method,
    target,
    kept,
    status: entry.status,
    ms: typeof entry.duration === "number" ? entry.duration * 1000 : 0,
    address:
      header("Cf-Connecting-Ip") ??
      stringOf(request.client_ip) ??
      stringOf(request.remote_ip),
    userAgent: header("User-Agent"),
    referrer: header("Referer"),
    fetchDest: header("Sec-Fetch-Dest"),
    fetchMode: header("Sec-Fetch-Mode"),
    purpose: header("Sec-Purpose") ?? header("Purpose"),
    contentType: firstOf(objectOf(entry.resp_headers)?.["Content-Type"]),
    cdnCountry: header("Cf-Ipcountry"),
  });
}

// Hallvi's own line, which nginx writes with `log_format hallvi escape=json`.
// Every value is a string, "" when the request had none; the kept keys are
// nginx's $arg_ values, still percent-encoded.
function hallvi(entry: Entry, at: number, options: ParseOptions) {
  if (typeof entry.path !== "string") return null;
  const field = (name: string) => stringOf(entry[name]);
  const kept = keptIn(entry.path, options.pageKey);
  for (const key of KEPT_QUERY_KEYS) keep(kept, key, decoded(entry[key]));
  if (options.pageKey) keep(kept, options.pageKey, decoded(entry.page));
  return line({
    at,
    host: entry.host,
    method: entry.method,
    target: entry.path,
    kept,
    status:
      typeof entry.status === "string" && /^\d{1,3}$/.test(entry.status)
        ? Number(entry.status)
        : NaN,
    ms: Number(entry.duration) * 1000,
    address: field("cf_ip") ?? field("address"),
    userAgent: field("user_agent"),
    referrer: field("referrer"),
    fetchDest: field("fetch_dest"),
    fetchMode: field("fetch_mode"),
    purpose: field("sec_purpose") ?? field("purpose"),
    contentType: field("content_type"),
    cdnCountry: field("cf_country"),
  });
}

// Traefik's JSON access log. It cannot rewrite a field, so the query string is
// in `RequestPath` and is removed here. Kept headers are `request_` plus the
// header's canonical name, whatever spelling the configuration used.
function traefik(entry: Entry, at: number, options: ParseOptions) {
  if (
    typeof entry.RequestPath !== "string" ||
    typeof entry.DownstreamStatus !== "number"
  )
    return null;
  const header = (name: string) => stringOf(entry[`request_${name}`]);
  return line({
    at,
    host: entry.RequestHost,
    method: entry.RequestMethod,
    target: entry.RequestPath,
    kept: keptIn(entry.RequestPath, options.pageKey),
    status: entry.DownstreamStatus,
    ms: typeof entry.Duration === "number" ? entry.Duration / 1e6 : 0,
    address: header("Cf-Connecting-Ip") ?? stringOf(entry.ClientHost),
    userAgent: header("User-Agent"),
    referrer: header("Referer"),
    fetchDest: header("Sec-Fetch-Dest"),
    fetchMode: header("Sec-Fetch-Mode"),
    purpose: header("Sec-Purpose") ?? header("Purpose"),
    contentType: stringOf(entry["downstream_Content-Type"]),
    cdnCountry: header("Cf-Ipcountry"),
  });
}

/** What a format read, made into the one shape everything after it reads. */
function line(read: {
  at: number;
  host: unknown;
  method: unknown;
  target: string;
  kept: Record<string, string>;
  status: number;
  ms: number;
  address: string | null;
  userAgent: string | null;
  referrer: string | null;
  fetchDest: string | null;
  fetchMode: string | null;
  purpose: string | null;
  contentType: string | null;
  cdnCountry: string | null;
}): TrafficLine | null {
  if (!Number.isInteger(read.status) || read.status < 0 || read.status > 999)
    return null;
  const path = read.target.split(/[?#]/)[0] || "/";
  // An event's payload is its path. Cutting it would leave an event nobody
  // can read, so it keeps what the contract's reader accepts.
  const longest = path.startsWith(EVENT_PREFIX) ? 2000 : 300;
  const country = read.cdnCountry?.toUpperCase() ?? null;
  return {
    at: read.at,
    host: hostOf(read.host),
    method: stringOf(read.method) ?? "",
    path: path.slice(0, longest),
    kept: read.kept,
    status: read.status,
    ms: Number.isFinite(read.ms) && read.ms > 0 ? Math.round(read.ms) : 0,
    address: read.address ?? "",
    userAgent: read.userAgent ?? "",
    // The query is gone from the referrer too: a same-site referrer carries
    // the previous page's, reset tokens included. The path stays, because
    // an in-page request naming a page never loaded as a document is how a
    // single-page application shows itself in the log.
    referrer:
      read.referrer && /^[a-z][a-z0-9+.-]*:\/\//i.test(read.referrer)
        ? read.referrer.split(/[?#]/)[0].slice(0, 500)
        : null,
    fetchDest: read.fetchDest,
    fetchMode: read.fetchMode,
    purpose: read.purpose,
    contentType: read.contentType?.split(";")[0].trim().toLowerCase() || null,
    // Cloudflare says XX when it does not know and T1 for Tor: neither is a
    // country, and the address may still say one.
    cdnCountry:
      country && /^[A-Z]{2}$/.test(country) && country !== "XX"
        ? country
        : null,
  };
}

/** Lower case, without a port or a trailing dot. */
function hostOf(value: unknown) {
  const host = typeof value === "string" ? value.trim().toLowerCase() : "";
  const bracketed = /^\[([^\]]*)\]/.exec(host);
  if (bracketed) return bracketed[1];
  const parts = host.split(":");
  return (parts.length === 2 ? parts[0] : host).replace(/\.$/, "");
}

/** The kept keys a query string still carries, as the proxy wrote it. */
function keptIn(target: string, pageKey?: string) {
  const kept: Record<string, string> = {};
  const start = target.indexOf("?");
  if (start < 0) return kept;
  const query = new URLSearchParams(target.slice(start + 1).split("#")[0]);
  for (const key of KEPT_QUERY_KEYS) keep(kept, key, query.get(key));
  if (pageKey) keep(kept, pageKey, query.get(pageKey));
  return kept;
}

function keep(kept: Record<string, string>, key: string, value: unknown) {
  // As long as the script's own campaign tags may be.
  if (typeof value === "string" && value) kept[key] = value.slice(0, 100);
}

/** An $arg_ value as nginx logs it, percent-encoded, decoded leniently. */
const decoded = (value: unknown) =>
  typeof value === "string" && value
    ? new URLSearchParams(`v=${value.replace(/&/g, "%26")}`).get("v")
    : null;

const objectOf = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Entry)
    : null;
const stringOf = (value: unknown) =>
  typeof value === "string" && value ? value : null;
const firstOf = (value: unknown) =>
  Array.isArray(value) ? stringOf(value[0]) : null;
