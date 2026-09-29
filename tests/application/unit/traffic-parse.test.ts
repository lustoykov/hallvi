// One request line, whichever proxy wrote it. What matters here: the same
// browser requests read the same from Caddy, nginx and Traefik; no query
// string survives, whether the proxy removed it or not; Hallvi's own checks
// and other applications' hosts are left out; nothing in a log can throw.
//
// The fixtures are lines real proxies wrote (Caddy 2.11.4, nginx 1.30.5 with
// Hallvi's log_format, Traefik 3.7.13), each configured the way Pi sets them
// up, for the same nineteen curl requests shaped like a browser's. The token
// and cookie in them are made up.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { eventOf, type LogFormat } from "@/server/traffic/contract";
import { lineTime, parseLine } from "@/server/traffic/parse";

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../fixtures/access-logs/${name}`, import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter(Boolean);

const proxies: [LogFormat, string[]][] = [
  ["caddy-json", fixture("caddy-2.11.4.log")],
  ["hallvi-json", fixture("nginx-1.30.5-hallvi.log")],
  ["traefik-json", fixture("traefik-3.7.13.log")],
];

// What the nineteen requests were, as every proxy must hand them on.
const document = { fetchDest: "document", fetchMode: "navigate" };
const expected = [
  { method: "GET", path: "/", status: 200, ...document, kept: { utm_source: "hn", utm_medium: "social", utm_campaign: "launch" } },
  { method: "GET", path: "/pricing", status: 200, ...document, referrer: "https://news.ycombinator.com/item" },
  { method: "GET", path: "/about", status: 200, ...document, referrer: "/reset" },
  { method: "GET", path: "/assets/app.js", status: 200, fetchDest: "script", fetchMode: "no-cors", contentType: "text/javascript" },
  { method: "GET", path: "/api/items", status: 200, fetchDest: "empty", fetchMode: "cors", contentType: "application/json", kept: { ref: "newsletter" } },
  { method: "HEAD", path: "/", status: 200, fetchDest: null },
  { method: "GET", path: "/wp-login.php", status: 404, fetchDest: null, userAgent: "Mozilla/5.0 zgrab/0.x" },
  { method: "GET", path: "/boom", status: 500, ...document },
  { method: "GET", path: "/pricing", status: 200, ...document, purpose: "prefetch" },
  { method: "GET", path: "/about", status: 200, fetchDest: "empty", purpose: "prefetch" },
  { method: "GET", path: "/index.php", status: 200, ...document, kept: { utm_campaign: "autumn sale", p: "42" } },
  { method: "GET", path: "/", status: 200, ...document, address: "203.0.113.9", cdnCountry: "NL" },
  // Hallvi's own access check is left out.
  { method: "GET", path: "/_hv/e/1/", status: 204, fetchDest: "empty", contentType: null },
  { method: "POST", path: "/checkout/pay", status: 200, ...document },
  { method: "GET", host: "blog.localhost", path: "/", status: 200 },
  // nginx served this route of a single-page application itself; the app
  // behind Caddy and Traefik does not know it.
  { method: "GET", path: "/spa/settings", ...document },
  { method: "GET", path: "/caf%C3%A9", status: 404 },
  { method: "GET", path: `/${"a".repeat(299)}`, status: 404 },
];

describe("an access log line", () => {
  it.each(proxies)("reads the same requests from %s", (format, lines) => {
    const parsed = lines.map((text) => parseLine(format, text, { pageKey: "p" }));
    expect(parsed[12]).toBeNull();
    const requests = parsed.filter((line) => line !== null);
    expect(requests).toHaveLength(expected.length);
    requests.forEach((line, index) => {
      const want = expected[index];
      expect(line.host).toBe(want.host ?? "shop.localhost");
      expect(line.method).toBe(want.method);
      if (want.path.startsWith("/_hv/")) expect(line.path).toMatch(/^\/_hv\/e\/1\//);
      else expect(line.path).toBe(want.path);
      if (want.status) expect(line.status).toBe(want.status);
      expect(line.kept).toEqual(want.kept ?? {});
      if ("fetchDest" in want) expect(line.fetchDest).toBe(want.fetchDest);
      if (want.fetchMode) expect(line.fetchMode).toBe(want.fetchMode);
      expect(line.purpose).toBe(want.purpose ?? null);
      expect(line.address).toBe(want.address ?? "172.19.0.1");
      expect(line.cdnCountry).toBe(want.cdnCountry ?? null);
      if ("contentType" in want) expect(line.contentType).toBe(want.contentType);
      if (want.userAgent) expect(line.userAgent).toBe(want.userAgent);
      if (want.referrer) expect(line.referrer?.endsWith(want.referrer)).toBe(true);
      expect(line.ms).toBeGreaterThanOrEqual(0);
    });
    // The page view's content type, without its charset.
    expect(requests[0].contentType).toBe("text/html");
    // Times are the request's end, in milliseconds, and in order.
    const times = requests.map((line) => line.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // The script's event survives the proxy and the reader whole.
    expect(eventOf(requests[12].path)).toMatchObject({
      t: "view",
      p: "/pricing",
      u: { utm_source: "hn" },
    });
  });

  it("never lets a query string through, from the path or the referrer", () => {
    for (const [format, lines] of proxies) {
      const parsed = lines.map((text) => parseLine(format, text));
      const said = JSON.stringify(parsed);
      expect(said).not.toMatch(/reset-7f3a9c|private|billing|token|\?/);
    }
    // Traefik cannot remove it before writing: its raw lines still have it.
    expect(proxies[2][1].join("\n")).toContain("reset-7f3a9c");
  });

  it("reads each proxy's own clock as the request's end", () => {
    const [caddy, nginx, traefik] = proxies.map(([format, lines]) =>
      parseLine(format, lines[0]),
    );
    // ts 1790692978.2884088 s, duration 0.012781917 s.
    expect(caddy).toMatchObject({ at: 1790692978288, ms: 13 });
    // $msec "1790692982.493", $request_time "0.004".
    expect(nginx).toMatchObject({ at: 1790692982493, ms: 4 });
    // StartUTC 14:43:06.694287176 plus Duration 6051250 ns; `time` has whole
    // seconds only.
    expect(traefik).toMatchObject({ at: 1790692986700, ms: 6 });
  });

  it("leaves another application's host out, and keeps a page key only when asked", () => {
    for (const [format, lines] of proxies) {
      const shop = lines
        .map((text) => parseLine(format, text, { hosts: ["shop.localhost"] }))
        .filter((line) => line !== null);
      expect(shop).toHaveLength(expected.length - 1);
      expect(shop.every((line) => line.host === "shop.localhost")).toBe(true);
      expect(parseLine(format, lines[10])?.kept).toEqual({
        utm_campaign: "autumn sale",
      });
    }
  });

  it("reads Caddy's output in a container, and counts a failed request once", () => {
    // Docker's timestamps and Caddy's own messages around three requests.
    // The last one failed: Caddy wrote it once as a request and twice more
    // through its error loggers, with the query string still in them.
    const lines = fixture("caddy-2.11.4-container.log");
    const parsed = lines.map((text) => parseLine("caddy-json", text));
    expect(parsed.filter((line) => line !== null).map((line) => [line.path, line.status])).toEqual([
      ["/", 200],
      ["/", 200],
      ["/checkout", 502],
    ]);
    expect(JSON.stringify(parsed)).not.toContain("reset-7f3a9c");
    // Hallvi's own check is not a request, but it proves the log was there.
    expect(parseLine("caddy-json", lines[4])).toBeNull();
    expect(lineTime("caddy-json", lines[4])).toBe(1790692980926);
    expect(lineTime("caddy-json", lines[0])).toBe(1790692797556);
  });

  it("keeps an event's path whole and cuts any other path at 300 characters", () => {
    const [format, lines] = proxies[1];
    const long = `/_hv/e/1/${"A".repeat(1500)}`;
    const text = lines[0].replace('"path":"/"', `"path":"${long}"`);
    expect(parseLine(format, text)?.path).toBe(long);
    const page = lines[0].replace('"path":"/"', `"path":"/${"b".repeat(900)}"`);
    expect(parseLine(format, page)?.path).toHaveLength(300);
  });

  it("never throws on what the internet can put in a log", () => {
    const garbage = [
      "",
      "{",
      "null",
      "[1,2]",
      '"a string"',
      "hallvi-following",
      "caddy-1  | not json at all {",
      '{"ts":1e400,"request":{"uri":"/"},"status":200}',
      '{"ts":1,"request":{"uri":5},"status":200}',
      '{"ts":1,"request":{"uri":"/","headers":{"User-Agent":[null]}},"status":200.5}',
      '{"hallvi":1,"time":"","path":"/","status":""}',
      '{"hallvi":1,"time":"1790692982.493","path":["/"],"status":"200"}',
      '{"hallvi":"1","time":"1790692982.493","path":"/","status":"200"}',
      '{"RequestPath":"/","DownstreamStatus":"200","StartUTC":"yesterday"}',
      '{"RequestPath":null,"DownstreamStatus":200,"time":"2026-09-29T14:43:06Z"}',
    ];
    for (const [format, lines] of proxies) {
      for (const text of garbage)
        expect(parseLine(format, text), `${format}: ${text}`).toBeNull();
      // A line cut anywhere — a partial write, a torn read — is nothing.
      for (const text of lines)
        for (let at = 0; at < text.length; at += 37)
          expect(() => parseLine(format, text.slice(0, at))).not.toThrow();
    }
  });
});
