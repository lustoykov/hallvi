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
} from "../../src/server/traffic/contract";
import { SCRIPT_TAG, trafficScript } from "../../src/server/traffic/script";

const html = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8">${SCRIPT_TAG}</head><body>${body}</body></html>`;

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
  "/app": html(`<nav>
    <button onclick="history.pushState({}, '', '/app/settings')">Settings</button>
    <button onclick="history.replaceState({}, '', '/app/settings?tab=2')">Tab</button>
    <button onclick="history.pushState({}, '', '/app/settings#billing')">Billing</button>
    <button onclick="history.pushState({}, '', '/app/promo?utm_source=mail&password=hunter2')">Promo</button>
  </nav>`),
};

let servers: Server[] = [];
let site = "";
let other = "";
let paths: string[] = [];

test.beforeAll(async () => {
  const script = trafficScript().content;
  const handle: Parameters<typeof createServer>[1] = (request, response) => {
    const path = new URL(request.url ?? "/", "http://proxy").pathname;
    if (request.method === "POST" && path.startsWith(EVENT_PREFIX)) {
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

  const views = await until("view", 4);
  expect(views.map((view) => view.p)).toEqual([
    "/app",
    "/app/settings",
    "/app/promo",
    "/app/settings",
  ]);
  expect(new Set(views.map((view) => view.s)).size).toBe(4);
  // Opened directly, so the first view has no referrer; every route change
  // was reached from the application itself. Campaign tags come from each
  // view's own address.
  expect(views.map((view) => view.r)).toEqual([undefined, site, site, site]);
  expect(views.map((view) => view.u)).toEqual([
    undefined,
    undefined,
    { utm_source: "mail" },
    undefined,
  ]);
  // Every view but the current one has left, once.
  const leaves = await until("leave", 3);
  expect(leaves.map((leave) => [leave.s, leave.p])).toEqual(
    views.slice(0, 3).map((view) => [view.s, view.p]),
  );
});

test("pings while the tab is visible, and a view leaves only once", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(`${site}/next`);
  const [view] = await until("view", 1);

  await page.clock.runFor(2 * PING_SECONDS * 1000 + 1000);
  await until("ping", 2, view.s);

  await setVisibility(page, "hidden");
  const [leave] = await until("leave", 1, view.s);
  expect(leave.e).toBeGreaterThanOrEqual(2 * PING_SECONDS * 1000);
  expect(leave.e).toBeLessThan(3 * PING_SECONDS * 1000);
  await page.clock.runFor(2 * PING_SECONDS * 1000);
  expect(ofType("ping", view.s)).toHaveLength(2);

  // Back again: still open, so it pings; but it has already left.
  await setVisibility(page, "visible");
  await page.clock.runFor(PING_SECONDS * 1000);
  await until("ping", 3, view.s);
  await page.getByRole("link", { name: "Back to landing" }).click();
  await until("view", 2);
  await page.waitForTimeout(500);
  expect(ofType("leave", view.s)).toHaveLength(1);
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
