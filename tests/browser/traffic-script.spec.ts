// Hallvi's traffic script in a real browser. A small server stands in for the
// application's proxy: it serves the script exactly as Hallvi ships it,
// answers events with 204 and keeps their paths, which is everything the
// access log would hold. Every path must be an event Hallvi accepts.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

import {
  EVENT_PREFIX,
  eventOf,
  PING_SECONDS,
  SCRIPT_PATH,
  type ScriptEvent,
  type TrafficLine,
} from "../../src/server/traffic/contract";
import { LiveWindow } from "../../src/server/access-log";
import { countDay } from "../../src/server/traffic/count";
import { trafficScript } from "../../src/server/traffic/script";
import { trafficScriptFor } from "../../src/server/traffic/pi-tools";

// Route counting represents a visitor browser; the classifier correctly
// excludes Playwright's default self-declared HeadlessChrome agent.
test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
});

const html = (body: string, pageKey?: string, hashRouting?: boolean) =>
  `<!doctype html><html><head><meta charset="utf-8">${trafficScriptFor("caddy", "traffic-script-fixture", pageKey, hashRouting).tag}</head><body>${body}</body></html>`;

const pages: Record<string, string> = {
  // Big enough text to be the largest paint, a banner that pushes it down
  // before anyone touches the page, goals, and code that fails.
  "/landing": html(`<main>
    <p style="font-size: 40px">Tools for people who own their software.</p>
    <button data-hv-goal="upgrade"><span>Upgrade</span></button>
    <button onclick="throw new Error('secret message')">Throw</button>
    <button onclick="Promise.reject(new Error('secret reason'))">Reject</button>
    <button onclick="const t = Date.now(); while (Date.now() - t < 120);">Slow</button>
    <a href="/next">Next</a>
  </main>
  <script>
    setTimeout(() => document.querySelector("main").insertAdjacentHTML(
      "afterbegin", '<div style="height: 200px">Banner</div>'), 300);
  </script>`),
  "/next": html(`<p>Next</p><a href="/landing">Back to landing</a>`),
  "/query": html(
    `<nav>
    <button onclick="history.pushState({}, '', '/query?p=456&token=secret')">Next page</button>
    <button onclick="history.replaceState({}, '', '/query?p=456&tab=2')">Same page</button>
  </nav>`,
    "p",
  ),
  "/app": html(`<nav>
    <button onclick="history.pushState({}, '', '/app/settings')">Settings</button>
    <button onclick="history.replaceState({}, '', '/app/settings?tab=2')">Tab</button>
    <button onclick="history.pushState({}, '', '/app/settings#billing')">Billing</button>
    <button onclick="history.pushState({}, '', '/app/promo?utm_source=mail&password=hunter2')">Promo</button>
  </nav>`),
  "/hash": html("<p>Hash-routed application</p>", undefined, true),
};

let servers: Server[] = [];
let site = "";
let other = "";
let paths: string[] = [];
let lines: TrafficLine[] = [];

test.beforeAll(async () => {
  const script = trafficScript().content;
  const handle: Parameters<typeof createServer>[1] = (request, response) => {
    const path = new URL(request.url ?? "/", "http://proxy").pathname;
    const record = (status: number, contentType: string | null) =>
      lines.push({
        at: Date.now(),
        host: "127.0.0.1",
        method: request.method ?? "GET",
        path,
        kept: {},
        status,
        ms: 0,
        address: "203.0.113.9",
        userAgent: String(request.headers["user-agent"] ?? ""),
        referrer: request.headers.referer ?? null,
        fetchDest: String(request.headers["sec-fetch-dest"] ?? ""),
        fetchMode: String(request.headers["sec-fetch-mode"] ?? ""),
        purpose: null,
        contentType,
        cdnCountry: null,
      });
    if (request.method === "POST" && path.startsWith(EVENT_PREFIX)) {
      record(204, null);
      paths.push(request.url ?? "");
      return response.writeHead(204).end();
    }
    if (path === SCRIPT_PATH)
      return response
        .writeHead(200, { "content-type": "text/javascript" })
        .end(script);
    // Another site, without the script, that links to the application.
    if (path === "/from")
      return response
        .writeHead(200, { "content-type": "text/html" })
        .end(
          `<a href="${site}/landing?utm_source=news&utm_campaign=launch&token=secret">Visit</a>`,
        );
    if (!pages[path]) return response.writeHead(404).end();
    record(200, "text/html");
    response.writeHead(200, { "content-type": "text/html" }).end(pages[path]);
  };
  // Two origins: a page on the second one sends visitors to the first.
  servers = [createServer(handle), createServer(handle)];
  const [a, b] = await Promise.all(
    servers.map(
      (server) =>
        new Promise<string>((resolve) =>
          server.listen(0, "127.0.0.1", () =>
            resolve(
              `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            ),
          ),
        ),
    ),
  );
  site = a;
  other = b;
});

test.afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise((done) => server.close(done))),
  );
});

test.beforeEach(() => {
  paths = [];
  lines = [];
});

/** Every event so far. A path Hallvi would not accept fails the test. */
function events() {
  return paths.map((path) => {
    const event = eventOf(path);
    expect(event, `${path} is not an event Hallvi accepts`).not.toBeNull();
    return event as ScriptEvent;
  });
}
const ofType = <T extends ScriptEvent["t"]>(type: T, s?: string) =>
  events().filter(
    (event): event is Extract<ScriptEvent, { t: T }> =>
      event.t === type && (s === undefined || event.s === s),
  );
async function until<T extends ScriptEvent["t"]>(
  type: T,
  count: number,
  s?: string,
) {
  await expect.poll(() => ofType(type, s).length).toBeGreaterThanOrEqual(count);
  return ofType(type, s);
}
const setVisibility = (page: Page, state: "hidden" | "visible") =>
  page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

test("a page reached from another site: its view, goals, errors, page speed and leave", async ({
  page,
}) => {
  await page.goto(`${other}/from`);
  await page.getByRole("link", { name: "Visit" }).click();
  await page.getByText("Banner").waitFor();

  const [view] = await until("view", 1);
  // The referrer's origin and the campaign tags; never the rest of the
  // query string, and never the page the visitor came from.
  expect(view).toEqual({
    t: "view",
    s: expect.stringMatching(/^[0-9a-f]{16}$/),
    p: "/landing",
    r: other,
    u: { utm_source: "news", utm_campaign: "launch" },
    w: await page.evaluate(() => screen.width),
  });

  await page.evaluate(() => {
    const { hv } = window as unknown as { hv: (name?: unknown) => void };
    hv("signup");
    hv("not a goal!");
    hv(42);
    hv();
  });
  await page.getByText("Upgrade").click();
  expect((await until("goal", 2, view.s)).map((goal) => goal.g)).toEqual([
    "signup",
    "upgrade",
  ]);

  await page.getByRole("button", { name: "Throw" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await until("error", 2, view.s);
  await page.getByRole("button", { name: "Slow" }).click();

  // Leaving by a link: the page's leave and page speed, then the next page,
  // reached from this site, which its referrer says.
  await page.getByRole("link", { name: "Next" }).click();
  const [leave] = await until("leave", 1, view.s);
  expect(leave.e).toBeGreaterThan(0);
  const vitals = await until("vital", 3, view.s);
  const speed = Object.fromEntries(vitals.map((vital) => [vital.n, vital.v]));
  expect(speed.LCP).toBeGreaterThan(0);
  expect(speed.CLS).toBeGreaterThan(0);
  expect(speed.INP).toBeGreaterThanOrEqual(120);
  const next = (await until("view", 2)).find((event) => event.p === "/next");
  expect(next).toEqual({
    t: "view",
    s: expect.any(String),
    p: "/next",
    r: site,
    w: view.w,
  });

  expect(ofType("goal")).toHaveLength(2);
  expect(ofType("error")).toHaveLength(2);
  expect(JSON.stringify(paths.map(eventOf))).not.toMatch(/secret|token/);
  // Nothing kept in the browser.
  expect(await page.context().cookies()).toEqual([]);
  expect(
    await page.evaluate(async () => [
      document.cookie,
      localStorage.length,
      sessionStorage.length,
      (await indexedDB.databases()).length,
    ]),
  ).toEqual(["", 0, 0, 0]);
});

test("a single-page application: a new path is a new view, the same path is not", async ({
  page,
}) => {
  await page.goto(`${site}/app`);
  const nav = (name: string) => page.getByRole("button", { name }).click();
  await nav("Settings");
  await nav("Tab");
  await nav("Billing");
  await nav("Promo");
  await page.goBack();
  await until("view", 4);
  await page.goForward();

  const views = await until("view", 5);
  expect(views.map((view) => view.p)).toEqual([
    "/app",
    "/app/settings",
    "/app/promo",
    "/app/settings",
    "/app/promo",
  ]);
  expect(new Set(views.map((view) => view.s)).size).toBe(5);
  // Opened directly, so the first view has no referrer; every route change
  // was reached from the application itself. Campaign tags come from each
  // view's own address.
  expect(views.map((view) => view.r)).toEqual([
    undefined,
    site,
    site,
    site,
    site,
  ]);
  expect(views.map((view) => view.u)).toEqual([
    undefined,
    undefined,
    { utm_source: "mail" },
    undefined,
    { utm_source: "mail" },
  ]);
  // Every view but the current one has left, once.
  const leaves = await until("leave", 4);
  expect(leaves.map((leave) => [leave.s, leave.p])).toEqual(
    views.slice(0, 4).map((view) => [view.s, view.p]),
  );
});

test("query-routed pages use only the configured page key", async ({
  page,
}) => {
  await page.goto(`${site}/query?p=123&token=secret`);
  await until("view", 1);
  await page.getByRole("button", { name: "Next page" }).click();
  const views = await until("view", 2);
  expect(views.map(({ p, q }) => ({ p, q }))).toEqual([
    { p: "/query", q: { k: "p", v: "123" } },
    { p: "/query", q: { k: "p", v: "456" } },
  ]);
  const [leave] = await until("leave", 1);
  expect(leave.q).toEqual({ k: "p", v: "123" });
  await page.getByRole("button", { name: "Same page" }).click();
  await page.goBack();
  const returned = await until("view", 3);
  expect(returned.map(({ q }) => q?.v)).toEqual(["123", "456", "123"]);
  await page.goForward();
  expect((await until("view", 4)).map(({ q }) => q?.v)).toEqual([
    "123",
    "456",
    "123",
    "456",
  ]);
  expect(JSON.stringify(events())).not.toMatch(/token|secret|tab/);
});

for (const prefix of ["#/", "#!/"]) {
  test(`configured ${prefix} routes count initial load, navigation and back/forward once`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${site}/hash${prefix}home`);
    await until("view", 1);
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `${prefix}inbox`);
    await until("view", 2);
    await page.evaluate((hash) => {
      history.replaceState({}, "", hash + "?token=secret#billing");
    }, `${prefix}inbox`);
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `${prefix}settings/new`);
    await until("view", 3);
    await page.goBack();
    await until("view", 4);
    await page.goForward();
    const views = await until("view", 5);
    expect(views.map(({ p, h }) => [p, h])).toEqual(
      ["home", "inbox", "settings/new", "inbox", "settings/new"].map(
        (route) => ["/hash", prefix + route],
      ),
    );
    expect(new Set(views.map(({ s }) => s)).size).toBe(5);
    expect((await until("leave", 4)).map(({ s }) => s)).toEqual(
      views.slice(0, 4).map(({ s }) => s),
    );

    // Feed the actual browser requests through both shipping consumers:
    // the document and its first script event are one view at takeover.
    const day = countDay(lines, {
      day: new Date(lines[0].at).toISOString().slice(0, 10),
      timeZone: "UTC",
      scriptSince: null,
      hashRouting: true,
      coverage: { from: null, to: null, gaps: [] },
    });
    expect(day.hours.reduce((sum, hour) => sum + hour.views, 0)).toBe(5);
    expect(day.pages.map(({ key }) => key).sort()).toEqual(
      ["/hash", `/hash${prefix}inbox`, `/hash${prefix}settings/new`].sort(),
    );
    const live = new LiveWindow({ script: false, hashRouting: true });
    const arrivals = lines
      .map((line) => live.arrival(line))
      .filter((arrival) => arrival?.kind === "view");
    expect(arrivals.map((arrival) => arrival?.path)).toEqual([
      "/hash",
      `/hash${prefix}inbox`,
      `/hash${prefix}settings/new`,
      `/hash${prefix}inbox`,
      `/hash${prefix}settings/new`,
    ]);
    expect(JSON.stringify(events())).not.toMatch(/secret|token|billing/);
    await testInfo.attach("accepted-events.json", {
      body: JSON.stringify(
        { events: events(), pages: day.pages, arrivals },
        null,
        2,
      ),
      contentType: "application/json",
    });

    paths = [];
    await page.goto(`${site}/hash`);
    await until("view", 1);
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `${prefix}inbox`);
    await until("view", 2);
    await page.goBack();
    await until("view", 3);
    await page.goForward();
    await until("view", 4);
    // popstate and hashchange both fire for Back/Forward. The empty root
    // route must count once, while rejected fragments remain ignored.
    await page.evaluate(() =>
      (window as unknown as { hv(name: string): void }).hv("check"),
    );
    await until("goal", 1);
    const roots = ofType("view");
    expect(roots.map(({ p, h }) => [p, h])).toEqual([
      ["/hash", undefined],
      ["/hash", `${prefix}inbox`],
      ["/hash", undefined],
      ["/hash", `${prefix}inbox`],
    ]);
    expect(new Set(roots.map(({ s }) => s)).size).toBe(4);
    await testInfo.attach("empty-root-events.json", {
      body: JSON.stringify(events(), null, 2),
      contentType: "application/json",
    });
  });
}

test("hash privacy: default ignores routes; opt-in excludes anchors and credential fragments", async ({
  page,
}, testInfo) => {
  await page.goto(`${site}/app#/home`);
  await until("view", 1);
  await page.evaluate(() => {
    location.hash = "#/inbox";
  });
  await page.evaluate(() =>
    (window as unknown as { hv(name: string): void }).hv("check"),
  );
  await until("goal", 1);
  expect(ofType("view")).toHaveLength(1);
  expect(events().every((event) => event.h === undefined)).toBe(true);

  paths = [];
  await page.goto(`${site}/hash#access_token=secret`);
  await until("view", 1);
  for (const hash of [
    "#billing",
    "#reset_token=secret",
    "#id_token=secret&state=secret",
    "#/access_token=secret",
    "#!/code=secret",
    "#/reset&token=secret",
    "#/access_token%3Dsecret",
    "#/reset%26token%3Dsecret",
    "#/oauth%253Dsecret",
    "#/bad%ZZsecret",
  ]) {
    await page.evaluate((hash) => {
      location.hash = hash;
    }, hash);
    await page.evaluate(() =>
      (window as unknown as { hv(name: string): void }).hv("check"),
    );
  }
  await until("goal", 10);
  expect(ofType("view")).toHaveLength(1);
  expect(events().every((event) => event.h === undefined)).toBe(true);
  await page.evaluate(() => {
    location.hash = "#/reset?token=secret#secret-anchor";
  });
  await until("view", 2);
  await page.evaluate(() => {
    location.hash = "#!/settings?access_token=secret#billing";
  });
  const views = await until("view", 3);
  expect(views.map(({ h }) => h)).toEqual([
    undefined,
    "#/reset",
    "#!/settings",
  ]);
  expect(JSON.stringify(events())).not.toMatch(
    /secret|token|billing|oauth|code=/,
  );
  await testInfo.attach("accepted-events.json", {
    body: JSON.stringify(events(), null, 2),
    contentType: "application/json",
  });
});

test("pings while the tab is visible, and visible time keeps adding up after a return", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(`${site}/next`);
  const [view] = await until("view", 1);

  await page.clock.runFor(2 * PING_SECONDS * 1000 + 1000);
  await until("ping", 2, view.s);

  // Hidden: the time so far goes out, and nothing pings.
  await setVisibility(page, "hidden");
  const [first] = await until("leave", 1, view.s);
  expect(first.e).toBeGreaterThanOrEqual(2 * PING_SECONDS * 1000);
  expect(first.e).toBeLessThan(3 * PING_SECONDS * 1000);
  await page.clock.runFor(2 * PING_SECONDS * 1000);
  expect(ofType("ping", view.s)).toHaveLength(2);

  // Back for another thirty seconds, then away by a link: the leave carries
  // the whole visible time, and hidden time counts for nothing.
  await setVisibility(page, "visible");
  await page.clock.runFor(PING_SECONDS * 1000);
  await until("ping", 3, view.s);
  await page.getByRole("link", { name: "Back to landing" }).click();
  await until("view", 2);
  const leaves = await until("leave", 2, view.s);
  expect(leaves.at(-1)!.e).toBeGreaterThanOrEqual(3 * PING_SECONDS * 1000);
  expect(leaves.at(-1)!.e).toBeLessThan(4 * PING_SECONDS * 1000);
});

test("ten seconds visible, ten hidden and sixty visible is seventy seconds on the page", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(`${site}/next`);
  const [view] = await until("view", 1);

  await page.clock.runFor(10_000);
  await setVisibility(page, "hidden");
  await page.clock.runFor(10_000);
  await setVisibility(page, "visible");
  await page.clock.runFor(60_000);
  await setVisibility(page, "hidden");

  const leaves = await until("leave", 2, view.s);
  expect(leaves.map((leave) => Math.round(leave.e / 1000))).toEqual([10, 70]);
  // Hiding again while hidden, or closing the hidden tab, adds nothing.
  await setVisibility(page, "hidden");
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(300);
  expect(ofType("leave", view.s)).toHaveLength(2);
});

test("a prerendered page counts only once it is shown", async ({ page }) => {
  // Under Playwright, Chromium holds a prerendered page's scripts until the
  // page is shown, so the page is told it is prerendering the way Chrome
  // tells it, and then shown.
  await page.addInitScript(() => {
    let prerendering = true;
    Object.defineProperty(document, "prerendering", {
      get: () => prerendering,
    });
    Object.assign(window, {
      show() {
        prerendering = false;
        document.dispatchEvent(new Event("prerenderingchange"));
      },
    });
  });
  await page.goto(`${site}/next`);
  await page.waitForTimeout(500);
  expect(paths).toEqual([]);

  await page.evaluate(() => (window as unknown as { show(): void }).show());
  const [view] = await until("view", 1);
  expect(view.p).toBe("/next");
});
