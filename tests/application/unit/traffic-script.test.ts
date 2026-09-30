// The traffic script against the contract. tests/browser/traffic-script.spec.ts
// proves what it does in Chromium; this runs the script as it is served
// against a stand-in for the few browser objects it touches, to show that
// what it sends at the limits — the longest address, campaign tags too long
// for one request, an app for a referrer — is still an event Hallvi accepts.
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

import {
  eventOf,
  KEPT_QUERY_KEYS,
  PING_SECONDS,
  type ScriptEvent,
} from "@/server/traffic/contract";
import { trafficScript } from "@/server/traffic/script";

function browse(address: string, referrer: string, pageKey?: string) {
  const sent: string[] = [];
  const handlers: Record<string, () => void> = {};
  const on = (type: string, handler: () => void) => {
    handlers[type] = handler;
  };
  const location = new URL(address);
  const go = (_state: unknown, _title: string, to: string) => {
    location.href = new URL(to, location).href;
  };
  let every = 0;
  const window: Record<string, unknown> = {
    location,
    document: {
      visibilityState: "visible",
      referrer,
      addEventListener: on,
      currentScript: {
        getAttribute: (name: string) =>
          name === "data-hv-page-key" ? (pageKey ?? null) : null,
      },
    },
    history: { pushState: go, replaceState: go },
    navigator: { sendBeacon: (url: string) => sent.push(url) > 0 },
    screen: { width: 390 },
    addEventListener: on,
    setInterval: (_: unknown, ms: number) => (every = ms),
    crypto,
    performance,
    TextEncoder,
    URL,
    URLSearchParams,
    btoa,
  };
  window.window = window;
  runInNewContext(trafficScript().content, window);
  return {
    history: window.history as {
      pushState: typeof go;
      replaceState: typeof go;
    },
    fire: (type: string) => handlers[type](),
    every: () => every,
    events: () =>
      sent.map((url) => {
        const event = eventOf(new URL(url).pathname);
        expect(event, url).not.toBeNull();
        return event as ScriptEvent;
      }),
  };
}

it("sends only events Hallvi accepts, whatever the address holds", () => {
  // Three bytes each in UTF-8: six such tags cannot fit in one request.
  const tag = "€".repeat(120);
  const page = browse(
    `https://shop.example/${"a".repeat(400)}?utm_source=news&utm_campaign=${tag}&token=secret`,
    "android-app://com.google.android.gm/",
  );
  page.history.pushState(
    {},
    "",
    `/checkout?${KEPT_QUERY_KEYS.map((key) => `${key}=${tag}`).join("&")}`,
  );
  for (let error = 0; error < 12; error++) page.fire("error");
  page.fire("pagehide");

  const events = page.events();
  expect(events[0]).toEqual({
    t: "view",
    s: expect.stringMatching(/^[0-9a-f]{16}$/),
    p: `/${"a".repeat(299)}`,
    r: "android-app://com.google.android.gm",
    u: { utm_source: "news", utm_campaign: "€".repeat(100) },
    w: 390,
  });
  // Too long with its campaign tags, so the view goes without them.
  expect(events[2]).toEqual({
    t: "view",
    s: expect.stringMatching(/^[0-9a-f]{16}$/),
    p: "/checkout",
    r: "https://shop.example",
    w: 390,
  });
  expect(events.map((event) => event.t)).toEqual([
    "view",
    "leave",
    "view",
    ...Array(10).fill("error"),
    "leave",
  ]);
  expect(page.every()).toBe(PING_SECONDS * 1000);
});

it("sends an application's page key and nothing else of the query", () => {
  const page = browse(
    "https://blog.example/?p=12&token=secret&utm_source=news",
    "",
    "p",
  );
  // Another key changing is the same page; the page key changing is a new
  // one, though the path stays.
  page.history.replaceState({}, "", "/?p=12&sort=new");
  page.history.pushState({}, "", "/?p=13");
  // A value Hallvi would refuse is left out, never sent to be refused.
  page.history.pushState({}, "", "/?p=a%26b");
  const events = page.events();
  expect(events.map((event) => [event.t, event.p, event.q])).toEqual([
    ["view", "/", { k: "p", v: "12" }],
    ["leave", "/", { k: "p", v: "12" }],
    ["view", "/", { k: "p", v: "13" }],
    ["leave", "/", { k: "p", v: "13" }],
    ["view", "/", undefined],
  ]);
  expect(JSON.stringify(events)).not.toMatch(/secret|token|sort/);
  // A key the tag does not name is never read.
  const plain = browse("https://blog.example/?p=12", "", "p;x");
  expect(plain.events()[0].q).toBeUndefined();
});

it("accepts a page key and its value alone", () => {
  const path = (v: unknown, k: unknown = "p") =>
    `/_hv/e/1/${Buffer.from(JSON.stringify({ t: "view", s: "abcdefgh12", p: "/", q: { k, v } })).toString("base64url")}`;
  expect(eventOf(path("12"))).toMatchObject({ q: { k: "p", v: "12" } });
  expect(eventOf(path("héllo wörld"))).toMatchObject({
    q: { k: "p", v: "héllo wörld" },
  });
  for (const key of ["", "p&x", "1p", "p=1", "x".repeat(41), 1])
    expect(eventOf(path("12", key)), String(key)).toBeNull();
  for (const bad of [
    "",
    "1&token=x",
    "1?x",
    "a=b",
    "1#x",
    "a\nb",
    "x".repeat(101),
    12,
  ])
    expect(eventOf(path(bad)), String(bad)).toBeNull();
});
