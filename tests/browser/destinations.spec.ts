// Every destination, on every acceptance application.
//
// This is the sweep, not a unit test: it walks all sixteen views on each
// running application and reports what it found in one pass, because
// sixteen separate failures are one afternoon and one list is ten minutes.
//
// It runs against servers that are already up — the acceptance UI on 3410 and
// the isolated scenarios on 3411 — so it is skipped when they are not.

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { journey } from "./journeys";

const ACCEPTANCE = process.env.SG_ACCEPTANCE_URL ?? "http://127.0.0.1:3410";
const SCENARIOS = process.env.SG_SCENARIO_URL ?? "http://127.0.0.1:3411";

const DESTINATIONS = [
  "overview",
  "architecture",
  "deployment",
  "history",
  "processes",
  "database",
  "cache",
  "jobs",
  "storage",
  "backups",
  "logs",
  "monitoring",
  "domains",
  "variables",
  "cdn",
  "security",
] as const;

/** Noise the product does not own and cannot fix from here. */
const IGNORED = [
  /Download the React DevTools/,
  /favicon/i,
  /net::ERR_ABORTED/,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/,
];

interface Finding {
  where: string;
  what: string;
}

function watch(page: Page, findings: Finding[], where: () => string) {
  const note = (what: string) => {
    if (IGNORED.some((pattern) => pattern.test(what))) return;
    findings.push({ where: where(), what });
  };
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") note(`console error: ${message.text()}`);
    if (message.type() === "warning" && /React|hydrat/i.test(message.text()))
      note(`react warning: ${message.text()}`);
  });
  page.on("pageerror", (error) => note(`uncaught: ${error.message}`));
  page.on("requestfailed", (request) =>
    note(`request failed: ${request.url()} ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      note(`${response.status()} from ${response.url()}`);
  });
}

/** The applications this server has, read the way a visitor finds them. */
async function applications(page: Page, base: string) {
  try {
    await page.goto(`${base}/applications`, { waitUntil: "domcontentloaded" });
  } catch {
    return [];
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(() => {
    const seen = new Map<string, string>();
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "a[href*='/applications/']",
    )) {
      const id = link
        .getAttribute("href")
        ?.match(/\/applications\/([0-9a-f-]{36})/)?.[1];
      if (id && !seen.has(id))
        seen.set(
          id,
          (link.textContent ?? id).trim().split("\n")[0].slice(0, 40),
        );
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  });
}

/** Whether the whole page scrolls sideways, which it never should. */
async function overflows(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

/** Text clipped by a container that is not allowed to scroll. */
async function clipped(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main *")]
      .filter((element) => {
        if (element.children.length) return false;
        const style = getComputedStyle(element);
        if (style.overflow !== "hidden" && style.overflowX !== "hidden")
          return false;
        if (style.textOverflow === "ellipsis") return false;
        return element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => (element.textContent ?? "").trim())
      // An empty element has nothing to clip; a decorative rule is not a
      // finding and drowns the ones that are.
      .filter((text) => text.length > 0)
      .slice(0, 4)
      .map((text) => text.slice(0, 60)),
  );
}

for (const [label, base] of [
  ["acceptance", ACCEPTANCE],
  ["scenarios", SCENARIOS],
] as const)
  test(
    `every destination on every ${label} application`,
    journey("record-destinations"),
    async ({ page }) => {
      test.setTimeout(600_000);
      const found: Finding[] = [];
      let current: string = label;
      watch(page, found, () => current);

      const apps = await applications(page, base);
      test.skip(!apps.length, `no server on ${base}`);

      for (const app of apps)
        for (const destination of DESTINATIONS) {
          current = `${app.name} · ${destination}`;
          const url = `${base}/applications/${app.id}#${destination}`;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle").catch(() => {});

          // The page drew something, and it is not a crash screen.
          const main = page.locator("main").first();
          await expect(main).toBeVisible();
          const text = (await main.innerText().catch(() => "")) ?? "";
          if (/Application error|Unhandled Runtime Error/i.test(text))
            found.push({ where: current, what: "error boundary" });
          if (text.trim().length < 20)
            found.push({ where: current, what: "drew almost nothing" });

          // The sidebar agrees with where we are.
          const active = await page
            .locator("[aria-current='page'], .sg-nav-item[data-active='true']")
            .allInnerTexts()
            .catch(() => []);
          if (active.length === 0)
            found.push({
              where: current,
              what: "no sidebar item marked current",
            });

          for (const width of [1440, 1180]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.waitForTimeout(120);
            if (await overflows(page))
              found.push({
                where: current,
                what: `scrolls sideways at ${width}`,
              });
            for (const clip of await clipped(page))
              found.push({
                where: current,
                what: `clipped at ${width}: "${clip}"`,
              });
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
        }

      if (found.length) {
        const grouped = found
          .map((item) => `  ${item.where}: ${item.what}`)
          .join("\n");
        throw new Error(`${found.length} findings:\n${grouped}`);
      }
    },
  );
