// The live access log. What matters here: the command the controller runs is
// its own and cannot be steered by a record, and what reaches the browser
// carries no address, no agent and no query string.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { followCommand, LiveWindow } from "@/server/access-log";
import { informationInputSchema } from "@/server/operator-data";
import { reviewRecord } from "@/server/record-contract";
import { eventPath } from "@/server/traffic/contract";
import { parseLine } from "@/server/traffic/parse";
import { listLogCommand } from "@/server/traffic/sources";

// A line Caddy 2 actually wrote, shortened only in its headers.
const line =
  '{"level":"error","ts":1789817074.446724,"logger":"http.log.access.log0","msg":"handled request","request":{"remote_ip":"172.17.0.1","remote_port":"65028","client_ip":"203.0.113.9","proto":"HTTP/1.1","method":"POST","host":"shop.example","uri":"/checkout/pay?token=secret#x","headers":{}},"duration":0.0421,"size":4,"status":500}';
const chrome =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * The same line as a browser's GET, at another moment and path — or, as a
 * `beacon`, the script's event: a POST the proxy answered with 204.
 */
const request = (
  path: string,
  at: number,
  { agent = chrome, address = "203.0.113.9", beacon = false } = {},
) =>
  parseLine(
    "caddy-json",
    line
      .replace('"ts":1789817074.446724', `"ts":${at / 1000}`)
      .replace('"method":"POST"', beacon ? '"method":"POST"' : '"method":"GET"')
      .replace('"status":500', beacon ? '"status":204' : '"status":200')
      .replace('"client_ip":"203.0.113.9"', `"client_ip":"${address}"`)
      .replace("/checkout/pay?token=secret#x", path)
      .replace(
        '"headers":{}',
        `"headers":{"User-Agent":["${agent}"],"Sec-Fetch-Dest":["${beacon ? "empty" : "document"}"],"Sec-Fetch-Mode":["${beacon ? "no-cors" : "navigate"}"]}`,
      ),
    { hosts: ["shop.example"] },
  )!;

const record = (source: unknown) => ({
  title: "Caddy access log",
  body: "Caddy writes one JSON line per request.",
  establishedAt: "2026-09-19T10:00:00.000Z",
  presentation: {
    views: ["overview"],
    role: "status",
    status: "info",
    checks: [],
    facts: [],
    content: {
      kind: "access-log",
      proxy: "Caddy",
      format: "caddy-json",
      source,
    },
  },
});

describe("the access log", () => {
  it("pairs the first script view with the log load without hiding later navigation", () => {
    const now = Date.now();
    const window = new LiveWindow({ hosts: ["shop.example"], script: false });
    expect(window.arrival(request("/docs", now))).toMatchObject({
      kind: "view",
    });
    const event = (p: string, s: string, offset: number) =>
      window.arrival(
        request(eventPath({ t: "view", s, p }), now + offset, { beacon: true }),
      );
    expect(event("/docs", "abcdefgh12", 100)).toBeNull();
    expect(window.now(now + 100)).toMatchObject({
      openNow: 1,
      recentVisitors: 1,
    });
    expect(event("/settings", "abcdefgh13", 200)).toMatchObject({
      kind: "view",
      path: "/settings",
    });
    expect(event("/docs", "abcdefgh14", 300)).toMatchObject({
      kind: "view",
      path: "/docs",
    });
  });

  it("tells arrivals apart and leaves the person out of them", () => {
    const now = Date.now();
    const window = new LiveWindow({ hosts: ["shop.example"], script: false });
    const failed = window.arrival(
      parseLine(
        "caddy-json",
        line.replace(
          '"headers":{}',
          `"headers":{"User-Agent":["${chrome}"],"Sec-Fetch-Dest":["empty"]}`,
        ),
      )!,
    );
    expect(failed).toMatchObject({
      kind: "request",
      path: "/checkout/pay",
      status: 500,
      ms: 42,
    });
    const view = window.arrival(request("/pricing/", now));
    expect(view).toMatchObject({
      kind: "view",
      path: "/pricing",
      source: "Direct",
      device: "desktop",
    });
    const bot = window.arrival(
      request("/", now, { agent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }),
    );
    expect(bot).toMatchObject({ kind: "bot", device: null, source: null });
    // Two requests from one browser are one visitor, and nothing the page
    // receives says who it was.
    expect(window.arrival(request("/", now))?.visitor).toBe(view?.visitor);
    expect(JSON.stringify([failed, view, bot])).not.toMatch(
      /203\.0\.113\.9|secret|Chrome|Googlebot/,
    );
    // Without the script there is nothing to say about open pages.
    expect(window.now(now)).toMatchObject({
      openNow: null,
      recentVisitors: 1,
    });
  });

  it("takes views from the script once it is heard, and counts open pages", () => {
    const now = Date.now();
    const window = new LiveWindow({ hosts: ["shop.example"], script: true });
    // The page load is a request: the script's own view is the view, and
    // says it is the script's, so the page never counts it as a request too.
    expect(window.arrival(request("/", now - 90_000))).toMatchObject({
      kind: "request",
      script: false,
    });
    const view = request(
      eventPath({ t: "view", s: "abcdefgh12", p: "/docs", w: 400 }),
      now - 90_000,
      { beacon: true },
    );
    expect(window.arrival(view)).toMatchObject({
      kind: "view",
      script: true,
      path: "/docs",
      device: "mobile",
    });
    const ping = (s: string, at: number, address: string) =>
      window.arrival(
        request(eventPath({ t: "ping", s, p: "/docs" }), at, {
          beacon: true,
          address,
        }),
      );
    expect(ping("abcdefgh12", now - 20_000, "203.0.113.9")).toBeNull();
    expect(ping("zyxwvuts98", now - 70_000, "198.51.100.4")).toBeNull();
    // A page that pinged within the minute is open; the other went quiet.
    expect(window.now(now)).toMatchObject({
      openNow: 1,
      recentVisitors: 2,
      windowMinutes: 5,
    });
    expect(window.now(now + 5 * 60_000)).toMatchObject({
      openNow: 0,
      recentVisitors: 0,
    });
  });

  it("accepts a record that says where the log is", () => {
    for (const source of [
      { type: "container", name: "shop-caddy-1" },
      { type: "file", path: "/var/log/caddy/access.log" },
    ]) {
      const parsed = informationInputSchema.parse(record(source));
      expect(reviewRecord(parsed)).toEqual([]);
    }
  });

  it("refuses a location that could carry a command", () => {
    for (const source of [
      { type: "container", name: "caddy; rm -rf /" },
      { type: "container", name: "$(reboot)" },
      { type: "file", path: "/var/log/x'; reboot #" },
      { type: "file", path: "/var/log/../../etc/shadow" },
      { type: "file", path: "relative.log" },
    ])
      expect(informationInputSchema.safeParse(record(source)).success).toBe(
        false,
      );
  });

  it("does not announce live for an unreadable file", () => {
    const result = spawnSync(
      "/bin/sh",
      [
        "-c",
        followCommand({
          type: "file",
          path: "/hallvi-review-nonexistent/access.log",
        }),
      ],
      { encoding: "utf8", timeout: 2000 },
    );
    expect(result.status).toBe(4);
    expect(result.stdout).toContain(
      "/hallvi-review-nonexistent/ is not readable by",
    );
    expect(result.stdout).not.toContain("hallvi-following");
  });

  it("only ever reads, through sudo where history does", () => {
    const file = { type: "file" as const, path: "/var/log/caddy/access.log" };
    const live = followCommand(file);
    expect(live).toContain('exec tail -n 2000 -F -- "$name"');
    // The same read-only fallback as history: the fixed text again, as root.
    const sudo = /^unreadable\(\) .*$/m;
    expect(live.match(sudo)?.[0]).toContain(
      'exec sudo -n bash -c "$BASH_EXECUTION_STRING"',
    );
    expect(live.match(sudo)?.[0]).toBe(listLogCommand(file).match(sudo)?.[0]);
    expect(followCommand({ type: "container", name: "shop-caddy-1" })).toMatch(
      /sudo -n docker[\s\S]*logs --since 5m --follow "\$1"/,
    );
  });
});
