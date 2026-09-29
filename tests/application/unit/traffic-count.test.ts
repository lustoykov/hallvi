// Counting traffic: what a logged request is, and what a day of them adds up
// to. What matters: the same lines always give the same day, following the
// log gives what a recount gives, the log and the script are never added
// together, and nothing that identifies a person comes out.

import { describe, expect, it } from "vitest";

import { classify } from "@/server/traffic/classify";
import {
  eventPath,
  STORED_PER_LIST,
  type ScriptEvent,
  type TrafficLine,
} from "@/server/traffic/contract";
import {
  countDay,
  DayCounter,
  type CountOptions,
} from "@/server/traffic/count";
import { dayBounds } from "@/server/traffic/days";

const DAY = "2026-09-29";
const ZONE = "Europe/Sofia";
const { start, end } = dayBounds(DAY, ZONE);
const at = (hour: number, minute = 0, second = 0) =>
  start + hour * 3_600_000 + minute * 60_000 + second * 1000;

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// Safari before 16.4 sends no fetch metadata, so its silence proves nothing.
const OLD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** A browser opening a page, as a reader hands it on. */
function page(overrides: Partial<TrafficLine> = {}): TrafficLine {
  return {
    at: at(10),
    host: "shop.example",
    method: "GET",
    path: "/",
    kept: {},
    status: 200,
    ms: 40,
    address: "203.0.113.9",
    userAgent: CHROME,
    referrer: null,
    fetchDest: "document",
    fetchMode: "navigate",
    purpose: null,
    contentType: "text/html",
    cdnCountry: null,
    ...overrides,
  };
}

/** A request an open page makes. */
const fetched = (overrides: Partial<TrafficLine> = {}) =>
  page({
    path: "/api/cart",
    fetchDest: "empty",
    fetchMode: "cors",
    contentType: "application/json",
    referrer: "https://shop.example/",
    ...overrides,
  });

/** An event from Hallvi's script, sent the way hv.js sends it. */
const sent = (event: ScriptEvent, overrides: Partial<TrafficLine> = {}) =>
  page({
    path: eventPath(event),
    method: "POST",
    status: 204,
    ms: 0,
    fetchDest: "empty",
    fetchMode: "no-cors",
    contentType: null,
    ...overrides,
  });

/** A client that says it is Chrome and sends nothing a Chrome would. */
const imitation = (overrides: Partial<TrafficLine> = {}) =>
  page({
    fetchDest: null,
    fetchMode: null,
    address: "198.51.100.7",
    ...overrides,
  });

const options: CountOptions = {
  day: DAY,
  timeZone: ZONE,
  scriptSince: null,
  hosts: ["shop.example"],
  coverage: {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
    gaps: [],
  },
  now: end + 3_600_000,
};

const hour = (day: ReturnType<typeof countDay>, index: number) =>
  day.hours[index];

it("keeps only the configured page key across the log-to-script switch", () => {
  const day = countDay(
    [
      page({ kept: { p: "123" } }),
      sent(
        { t: "view", s: "abcdefgh12", p: "/", q: { k: "p", v: "123" } },
        { at: at(10, 0, 1) },
      ),
      sent(
        { t: "view", s: "abcdefgh13", p: "/", q: { k: "p", v: "456" } },
        { at: at(10, 0, 2) },
      ),
      sent(
        {
          t: "leave",
          s: "abcdefgh13",
          p: "/",
          q: { k: "p", v: "456" },
          e: 1000,
        },
        { at: at(10, 0, 3) },
      ),
      sent(
        { t: "view", s: "abcdefgh14", p: "/", q: { k: "token", v: "secret" } },
        { at: at(10, 0, 4) },
      ),
    ],
    { ...options, pageKey: "p" },
  );
  expect(day.hours[10].views).toBe(3);
  expect(day.pages.map(({ key }) => key).sort()).toEqual([
    "/",
    "/?p=123",
    "/?p=456",
  ]);
  expect(day.engagement).toEqual([{ path: "/?p=456", ms: 1000, samples: 1 }]);
  expect(JSON.stringify(day)).not.toMatch(/token|secret/);
});

describe("what a logged request is", () => {
  it("tells a page view from a prefetch, a request, a bot, a probe and Hallvi's own", () => {
    expect(classify(page())).toMatchObject({
      kind: "request",
      view: true,
      bot: null,
      browser: true,
      imitation: false,
    });
    // The browser fetched it speculatively; nobody looked at it yet.
    expect(classify(page({ purpose: "prefetch" }))).toMatchObject({
      view: false,
      document: true,
    });
    expect(classify(fetched())).toMatchObject({ view: false, browser: true });
    expect(classify(page({ status: 404 }))).toMatchObject({ view: false });
    // A reload the application answered with "not modified" is a view.
    expect(classify(page({ status: 304, contentType: null }))).toMatchObject({
      view: true,
    });
    expect(
      classify(
        page({ userAgent: GOOGLEBOT, fetchDest: null, fetchMode: null }),
      ),
    ).toMatchObject({ bot: "Google", view: false });
    expect(
      classify(page({ path: "/.env", status: 404, userAgent: "curl/8.7.1" })),
    ).toMatchObject({ bot: "Scanners" });
    expect(
      classify(page({ path: "/wp-login.php", status: 404 })),
    ).toMatchObject({ bot: "Scanners", view: false });
    // WordPress's own login page answers: that is a person signing in.
    expect(
      classify(page({ path: "/wp-login.php", status: 200 })),
    ).toMatchObject({ bot: null, view: true });
    // A tool is not a person, and not a bot either unless it says so.
    expect(
      classify(
        page({ userAgent: "curl/8.7.1", fetchDest: null, fetchMode: null }),
      ),
    ).toMatchObject({ bot: null, browser: false, view: false });
    expect(classify(page({ userAgent: "" }))).toMatchObject({
      bot: "No user agent",
    });
    // Cubot makes phones.
    expect(
      classify(
        page({
          userAgent:
            "Mozilla/5.0 (Linux; Android 11; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        }),
      ),
    ).toMatchObject({ bot: null, view: true });
    expect(classify(page({ userAgent: "Hallvi access check" }))).toEqual({
      kind: "own",
    });
    expect(classify(page({ path: "/_hv/s.js" }))).toEqual({ kind: "own" });
    // The events' endpoint answered something that is no event.
    expect(
      classify(
        page({
          path: "/_hv/e/1/not-an-event",
          method: "POST",
          status: 204,
          fetchDest: "empty",
          fetchMode: "no-cors",
        }),
      ),
    ).toEqual({ kind: "own" });
  });

  it("counts an event only from a browser that could have sent it", () => {
    const view: ScriptEvent = { t: "view", s: "a1b2c3d4e5f6a7b8", p: "/" };
    expect(classify(sent(view))).toMatchObject({ kind: "event" });
    expect(classify(sent(view, { userAgent: GOOGLEBOT }))).toEqual({
      kind: "own",
    });
    expect(classify(sent(view, { userAgent: "curl/8.7.1" }))).toEqual({
      kind: "own",
    });
    // Chrome always sends fetch metadata with a beacon; this did not.
    expect(classify(sent(view, { fetchDest: null, fetchMode: null }))).toEqual({
      kind: "own",
    });
    expect(
      classify(
        sent(view, { userAgent: OLD_SAFARI, fetchDest: null, fetchMode: null }),
      ),
    ).toMatchObject({ kind: "event" });
  });

  it("takes only a beacon the proxy answered for an event, and anything else for a request", () => {
    const ping: ScriptEvent = { t: "ping", s: "a1b2c3d4e5f6a7b8", p: "/" };
    // Where the proxy does not serve the events, the application answers:
    // a request like any other, never an event and never a page.
    for (const overrides of [
      { method: "GET", status: 404 },
      {
        method: "GET",
        status: 200,
        fetchDest: "document",
        fetchMode: "navigate",
      },
      { method: "POST", status: 200 },
      { status: 204, fetchDest: "document", fetchMode: "navigate" },
    ])
      expect(classify(sent(ping, overrides))).toMatchObject({
        kind: "request",
        view: false,
      });
    // Such a request never switches counting to a script nobody serves.
    const day = countDay(
      [
        page({ at: at(9) }),
        sent(ping, { at: at(9, 1), method: "GET", status: 404 }),
        page({ at: at(10), path: "/pricing" }),
      ],
      options,
    );
    expect(day.viewSource).toBe("log");
    expect(day.pages.map((row) => row.key)).toEqual(["/", "/pricing"]);
    expect(day.hours[9].requests).toBe(2);
  });
});

describe("a day", () => {
  it("counts views, visitors, bots and errors, and keeps nobody in it", () => {
    const day = countDay(
      [
        page(),
        page({
          at: at(10, 1),
          path: "/pricing",
          referrer: "https://shop.example/",
        }),
        fetched({ at: at(10, 2) }),
        page({
          at: at(11),
          address: "81.2.69.142",
          userAgent: IPHONE,
          referrer: "https://www.google.com/",
          kept: { utm_campaign: "autumn" },
        }),
        page({
          at: at(11, 5),
          address: "81.2.69.142",
          userAgent: IPHONE,
          path: "/checkout",
          status: 502,
          ms: 3000,
        }),
        page({
          at: at(12),
          userAgent: GOOGLEBOT,
          fetchDest: null,
          fetchMode: null,
        }),
        page({
          at: at(12, 30),
          path: "/.env",
          status: 404,
          userAgent: "curl/8.7.1",
        }),
        page({ at: at(13), userAgent: "Hallvi access check" }),
        // Another site on the same proxy writes to the same log.
        page({ at: at(13, 30), host: "blog.example" }),
      ],
      options,
    );
    // Only the collector's recount from the files makes a day final.
    expect(day.final).toBe(false);
    expect(day.hours).toHaveLength(24);
    expect(day.hours.reduce((sum, one) => sum + one.requests, 0)).toBe(7);
    expect(day.hours.reduce((sum, one) => sum + one.views, 0)).toBe(3);
    expect(day.visitors).toBe(2);
    expect(hour(day, 11)).toMatchObject({
      errors: 1,
      errorVisitors: 1,
      errorPaths: [{ path: "/checkout", errors: 1, visitors: 1 }],
    });
    expect(day.errorVisitors).toBe(1);
    expect(hour(day, 12).bots).toBe(2);
    expect(day.bots.map((row) => row.key).sort()).toEqual([
      "Google",
      "Scanners",
    ]);
    // A page reached from the same site is a view, not an arrival.
    expect(day.sources).toEqual([
      { key: "Direct", count: 1, visitors: 1 },
      { key: "Google", count: 1, visitors: 1 },
    ]);
    expect(day.campaigns).toEqual([{ key: "autumn", count: 1, visitors: 1 }]);
    expect(day.countries).toContainEqual({ key: "GB", count: 1, visitors: 1 });
    expect(day.devices).toContainEqual({
      key: "mobile",
      count: 1,
      visitors: 1,
    });
    // Addresses, agents and referrers were only ever in the lines.
    const stored = JSON.stringify(day);
    for (const secret of ["203.0.113.9", "81.2.69.142", "Mozilla", "https://"])
      expect(stored).not.toContain(secret);
  });

  it("gives the same day for the same lines, and following the log gives what a recount gives", () => {
    const lines = busyDay();
    const once = countDay(lines, options);
    expect(countDay(lines, options)).toEqual(once);
    // The collector's view of today: the same count held open, read every
    // few seconds while lines arrive. Every reading equals a recount of the
    // lines so far, and the last equals the whole day's.
    const counter = new DayCounter(options);
    let taken = 0;
    for (const size of [1, 7, 40, 3, 150, 1, 90, 400]) {
      const next = lines.slice(taken, taken + size);
      for (const one of next) counter.add(one);
      taken += next.length;
      expect(counter.day({ now: options.now })).toEqual(
        countDay(lines.slice(0, taken), options),
      );
    }
    for (const one of lines.slice(taken)) counter.add(one);
    expect(counter.day({ now: options.now })).toEqual(once);
    expect(counter.switchAt).toBe(at(15) + 400);
    expect(once.viewSource).toBe("switch");
  });

  it("switches from the log to the script at the first event, and never adds the two", () => {
    const first: ScriptEvent = { t: "view", s: "aaaaaaaa11111111", p: "/" };
    const lines = [
      page({ at: at(9) }),
      page({ at: at(9, 30), address: "81.2.69.142" }),
      // The first page load with the script: the log sees the load, the
      // script its view a moment later. One view.
      page({ at: at(12) }),
      sent(first, { at: at(12, 0, 1) }),
      // After the switch the log's page loads are requests, not views.
      page({ at: at(13), address: "81.2.69.142", path: "/pricing" }),
      sent(
        {
          t: "view",
          s: "bbbbbbbb22222222",
          p: "/pricing",
          r: "https://shop.example",
        },
        { at: at(13, 0, 1), address: "81.2.69.142" },
      ),
      // A route change the log never sees.
      sent(
        {
          t: "view",
          s: "cccccccc33333333",
          p: "/pricing/team",
          r: "https://shop.example",
        },
        { at: at(13, 2), address: "81.2.69.142" },
      ),
      sent(
        { t: "leave", s: "bbbbbbbb22222222", p: "/pricing", e: 90_000 },
        { at: at(13, 3), address: "81.2.69.142" },
      ),
    ];
    const day = countDay(lines, options);
    expect(day.viewSource).toBe("switch");
    expect(day.hours.reduce((sum, one) => sum + one.views, 0)).toBe(5);
    expect(day.hours.reduce((sum, one) => sum + one.requests, 0)).toBe(4);
    expect(day.pages).toEqual([
      { key: "/", count: 3, visitors: 2 },
      { key: "/pricing", count: 1, visitors: 1 },
      { key: "/pricing/team", count: 1, visitors: 1 },
    ]);
    expect(day.engagement).toEqual([
      { path: "/pricing", ms: 90_000, samples: 1 },
    ]);
    // The collector records the switch point; a recount with it on record
    // gives the same day, and the days after it count the script alone.
    const counter = new DayCounter(options);
    for (const one of lines) counter.add(one);
    expect(counter.switchAt).toBe(at(12, 0, 1));
    const recorded = new Date(at(12, 0, 1)).toISOString();
    expect(countDay(lines, { ...options, scriptSince: recorded })).toEqual(day);
    const next = dayBounds("2026-09-30", ZONE).start;
    const tomorrow = countDay(
      [
        page({ at: next + 60_000 }),
        page({ at: next + 120_000, address: "81.2.69.142" }),
      ],
      {
        ...options,
        day: "2026-09-30",
        scriptSince: recorded,
        coverage: { from: null, to: null, gaps: [] },
      },
    );
    expect(tomorrow.viewSource).toBe("script");
    expect(tomorrow.visitors).toBe(0);
    expect(tomorrow.hours.reduce((sum, one) => sum + one.requests, 0)).toBe(2);
  });

  it("takes the first script view for the page load it came from, however late it arrives", () => {
    const view = (s: string, p = "/") => ({ t: "view" as const, s, p });
    // A deferred script on a slow phone reports its view 11 seconds late.
    const slow = [
      page({ at: at(12) }),
      sent(view("aaaaaaaa11111111"), { at: at(12, 0, 11) }),
    ];
    expect(countDay(slow, options).hours[12].views).toBe(1);
    // Another page in between: the late view is not that load's.
    expect(
      countDay(
        [
          page({ at: at(12) }),
          page({ at: at(12, 0, 5), path: "/pricing" }),
          sent(view("aaaaaaaa11111111"), { at: at(12, 0, 11) }),
        ],
        options,
      ).hours[12].views,
    ).toBe(3);
    // The load just before midnight, its view just after: one view, counted
    // on the day the log counted the load. The day after reads the minutes
    // before its midnight only to know that.
    const next = "2026-09-30";
    const lines = [
      page({ at: end - 100 }),
      sent(view("bbbbbbbb22222222"), { at: end + 100 }),
      page({ at: end + 60_000, path: "/pricing" }),
      sent(view("cccccccc33333333", "/pricing"), { at: end + 61_000 }),
    ];
    const tomorrow = {
      ...options,
      day: next,
      coverage: { from: null, to: null, gaps: [] },
    };
    const views = (day: ReturnType<typeof countDay>) =>
      day.hours.reduce((sum, one) => sum + one.views, 0);
    const today = countDay(lines, options);
    const after = countDay(lines, tomorrow);
    expect(views(today) + views(after)).toBe(2);
    expect(after.pages).toEqual([{ key: "/pricing", count: 1, visitors: 1 }]);
    // Following the log gives the same, and so does a recount with the
    // switch point on record.
    const counter = new DayCounter(tomorrow);
    for (const line of lines) counter.add(line);
    expect(counter.day({ now: options.now })).toEqual(after);
    expect(counter.switchAt).toBe(end + 100);
    expect(
      countDay(lines, {
        ...tomorrow,
        scriptSince: new Date(end + 100).toISOString(),
      }),
    ).toEqual(after);
  });

  it("is one visitor across an application's names, and keeps a campaign's odd words as words", () => {
    const day = countDay(
      [
        page({ kept: { utm_source: "__proto__" } }),
        page({
          at: at(10, 1),
          host: "www.shop.example",
          path: "/pricing",
          kept: { utm_source: "constructor", utm_campaign: "toString" },
        }),
        page({ at: at(10, 2), kept: { utm_source: "hasOwnProperty" } }),
      ],
      { ...options, hosts: ["shop.example", "www.shop.example"] },
    );
    expect(day.visitors).toBe(1);
    expect(day.hours[10].visitors).toBe(1);
    expect(day.sources.map((row) => row.key).sort()).toEqual([
      "__proto__",
      "constructor",
      "hasOwnProperty",
    ]);
    expect(day.campaigns).toEqual([{ key: "toString", count: 1, visitors: 1 }]);
    // It survives being stored and read back as the same strings.
    expect(JSON.parse(JSON.stringify(day.sources))).toEqual(day.sources);
    // A page key named like something every object has is only a key.
    expect(
      countDay([page({ at: at(11) })], { ...options, pageKey: "constructor" })
        .pages,
    ).toEqual([{ key: "/", count: 1, visitors: 1 }]);
  });

  it("says the script is silent only on evidence", () => {
    const since = new Date(at(8)).toISOString();
    const served = (minute: number, address: string) =>
      page({ at: at(10, minute), address });
    const counter = new DayCounter({ ...options, scriptSince: since });
    counter.add(served(0, "203.0.113.1"));
    counter.add(served(4, "203.0.113.2"));
    counter.add(served(12, "203.0.113.2"));
    // Two browsers is an ad blocker as likely as a missing script.
    expect(counter.silentSince).toBeNull();
    counter.add(served(13, "203.0.113.3"));
    expect(counter.silentSince).toBe(at(10));
    // One event and it is not silent after all.
    counter.add(
      sent({ t: "ping", s: "dddddddd44444444", p: "/" }, { at: at(10, 14) }),
    );
    expect(counter.silentSince).toBeNull();
    expect(counter.lastEventAt).toBe(at(10, 14));
  });

  it("takes a client without fetch metadata for a browser only where browsers send none", () => {
    const lines = [
      imitation({ at: at(9) }),
      imitation({ at: at(9, 5), path: "/pricing" }),
      page({ at: at(10) }),
    ];
    // Over plain HTTP no browser sends fetch metadata: these are people.
    const plain = countDay(lines.slice(0, 2), options);
    expect(plain.visitors).toBe(1);
    expect(plain.bots).toEqual([]);
    // Once any request shows browsers reaching this site with it, a client
    // claiming to be Chrome without it is a bot, whenever it came.
    const secure = countDay(lines, options);
    expect(secure.visitors).toBe(1);
    expect(secure.bots).toEqual([
      { key: "Browser imitations", count: 2, visitors: 1 },
    ]);
    expect(secure.hours[9]).toMatchObject({ requests: 2, bots: 2, views: 0 });
    // It does not matter which came first.
    expect(countDay([lines[2], lines[0], lines[1]], options)).toEqual(secure);
  });

  it("cuts the day in its zone: 25 hours on the day the clocks go back", () => {
    const autumn = "2026-10-25";
    const bounds = dayBounds(autumn, ZONE);
    // 03:30 happens twice in Sofia that night, an hour apart.
    const first = Date.parse("2026-10-25T00:30:00Z");
    const second = Date.parse("2026-10-25T01:30:00Z");
    const day = countDay(
      [page({ at: first }), page({ at: second }), page({ at: bounds.end })],
      { ...options, day: autumn, coverage: { from: null, to: null, gaps: [] } },
    );
    expect(day.hours).toHaveLength(25);
    expect(day.hours[3].views).toBe(1);
    expect(day.hours[4].views).toBe(1);
    expect(day.hours.reduce((sum, one) => sum + one.views, 0)).toBe(2);
  });

  it("notices pages the browser changed to without loading them", () => {
    const lines = [
      page(),
      // Requests made from /pricing, which the log never saw loaded.
      fetched({ at: at(10, 1), referrer: "https://shop.example/pricing" }),
      fetched({ at: at(10, 2), referrer: "https://shop.example/pricing/" }),
      fetched({ at: at(10, 3), referrer: "https://elsewhere.example/about" }),
    ];
    expect(countDay(lines, options).browserOnlyPages).toBe(1);
    // Loaded as a document after all: the log saw it.
    expect(
      countDay([...lines, page({ at: at(11), path: "/pricing" })], options)
        .browserOnlyPages,
    ).toBe(0);
  });

  it("keeps its top entries a list and folds the rest into one row of distinct visitors", () => {
    const lines: TrafficLine[] = [];
    for (let index = 0; index < STORED_PER_LIST + 50; index++)
      lines.push(
        page({
          at: at(10) + index,
          path: `/post/${index}`,
          // The same ten readers read everything.
          address: `203.0.113.${index % 10}`,
        }),
      );
    const day = countDay(lines, options);
    expect(day.pages).toHaveLength(STORED_PER_LIST + 1);
    expect(day.pages.at(-1)).toEqual({
      key: "(other)",
      count: 50,
      visitors: 10,
    });
  });
});

/**
 * A realistic day in a fixed order: people, a returning reader, prefetches,
 * requests from open pages, bots, a scanner, an imitation that later reads
 * as one, errors, and the script arriving at 15:00.
 */
function busyDay() {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const lines: TrafficLine[] = [];
  const pages = ["/", "/pricing", "/blog/hello", "/blog/caf%C3%A9", "/docs/"];
  const referrers = [
    null,
    "https://www.google.com/",
    "https://news.ycombinator.com/",
    "https://shop.example/",
  ];
  let views = 0;
  for (let minute = 0; minute < 24 * 60; minute += 2) {
    const when = start + minute * 60_000;
    const who = `203.0.113.${Math.floor(random() * 40)}`;
    const agent = pick([CHROME, IPHONE, OLD_SAFARI]);
    const path = pick(pages);
    const script = when >= at(15);
    lines.push(
      page({
        at: when,
        address: who,
        userAgent: agent,
        path,
        referrer: pick(referrers),
        kept: random() < 0.1 ? { utm_source: "newsletter" } : {},
        ...(agent === OLD_SAFARI ? { fetchDest: null, fetchMode: null } : {}),
      }),
    );
    if (script)
      lines.push(
        sent(
          {
            t: "view",
            s: `view${String(views++).padStart(8, "0")}`,
            p: path,
            w: 390,
          },
          {
            at: when + 400,
            address: who,
            userAgent: agent,
            ...(agent === OLD_SAFARI
              ? { fetchDest: null, fetchMode: null }
              : {}),
          },
        ),
      );
    if (random() < 0.5)
      lines.push(fetched({ at: when + 900, address: who, userAgent: agent }));
    if (random() < 0.1)
      lines.push(page({ at: when + 1000, purpose: "prefetch", address: who }));
    if (random() < 0.05)
      lines.push(
        page({ at: when + 1100, status: 500, path: "/checkout", address: who }),
      );
    if (random() < 0.1)
      lines.push(
        page({
          at: when + 1200,
          userAgent: GOOGLEBOT,
          fetchDest: null,
          fetchMode: null,
        }),
      );
    if (random() < 0.05)
      lines.push(
        page({
          at: when + 1300,
          path: "/wp-login.php",
          status: 404,
          userAgent: "curl/8.7.1",
        }),
      );
    if (random() < 0.05) lines.push(imitation({ at: when + 1400 }));
  }
  return lines;
}
