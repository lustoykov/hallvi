// Operating the pages, not only looking at them.
//
// A control that renders and does nothing looks identical to one that works,
// in a screenshot and in the DOM. So this clicks everything: the sidebar's
// reveal, every action a page offers, the details that fold, and the whole
// tab order. What it asserts is that something changed — a chat draft
// appeared, a panel opened, the destination moved — because a button that
// changes nothing is the defect.

import { expect, test, type Page } from "@playwright/test";

import { journey } from "./journeys";

const ACCEPTANCE = process.env.SG_ACCEPTANCE_URL ?? "http://127.0.0.1:3410";
const SCENARIOS = process.env.SG_SCENARIO_URL ?? "http://127.0.0.1:3411";

async function firstApplication(page: Page, base: string) {
  await page.goto(`${base}/applications`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>(
      "a[href*='/applications/']",
    );
    return link?.getAttribute("href")?.match(/[0-9a-f-]{36}/)?.[0] ?? null;
  });
}

test.describe("operating the destinations", () => {
  test(
    "the sidebar reveals and hides what records do not establish",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#overview`);
      await page.waitForLoadState("networkidle").catch(() => {});

      const sidebar = page.locator("nav[aria-label='Application workspace']");
      const more = sidebar.getByRole("button", { name: /show more/i });
      await expect(more).toBeVisible();
      const before = await sidebar.locator("button").count();
      await more.click();
      await expect(
        sidebar.getByRole("button", { name: /show less/i }),
      ).toBeVisible();
      const after = await sidebar.locator("button").count();
      expect(after).toBeGreaterThan(before);

      // A revealed destination says why it is not there, rather than
      // pretending to be a place to go.
      const revealed = await sidebar.innerText();
      expect(revealed).toMatch(
        /nothing has looked|nothing can record this|after deployment|check firewall/i,
      );

      await sidebar.getByRole("button", { name: /show less/i }).click();
      await expect(more).toBeVisible();
    },
  );

  test(
    "every destination is reachable by clicking, not only by URL",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#overview`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const sidebar = page.locator("nav[aria-label='Application workspace']");
      await sidebar.getByRole("button", { name: /show more/i }).click();

      // The sidebar is buttons, not links: it changes the hash itself. It also
      // holds the conversation list, which is not a destination.
      const DESTINATIONS = [
        "Overview",
        "Architecture",
        "Deployment",
        "History",
        "Processes",
        "Database",
        "Cache & queue",
        "Jobs",
        "Storage",
        "Backups",
        "Logs",
        "Monitoring",
        "Domains",
        "Environment Variables",
        "CDN",
        "Security",
      ];
      const labels = (await sidebar.locator("button").allInnerTexts())
        .map((text) => text.trim().split("\n")[0])
        .filter((text) => DESTINATIONS.includes(text));
      expect(new Set(labels).size).toBe(DESTINATIONS.length);

      for (const label of DESTINATIONS) {
        await sidebar
          .locator("button")
          .filter({ hasText: new RegExp(`^${label.replace("&", "&")}`) })
          .first()
          .click();
        await page.waitForTimeout(120);
        // The address followed the click, so a reload lands in the same place.
        expect(page.url(), label).toMatch(/#[a-z]+$/);
        const current = await sidebar
          .locator("[aria-current='page']")
          .innerText();
        // A hidden row carries its reason under its name, so compare the name.
        expect(current.trim().split("\n")[0], label).toBe(
          label.trim().split("\n")[0],
        );
      }
    },
  );

  test(
    "back and forward move between destinations",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#overview`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const sidebar = page.locator("nav[aria-label='Application workspace']");
      // Clicked, not navigated: a hash-only goto does not push the same way,
      // and clicking is what a reader does.
      for (const label of ["Processes", "Storage"]) {
        await sidebar.getByRole("button", { name: label, exact: true }).click();
        await page.waitForTimeout(200);
      }

      await page.goBack();
      await page.waitForTimeout(200);
      expect(page.url()).toContain("#processes");
      await page.goForward();
      await page.waitForTimeout(200);
      expect(page.url()).toContain("#storage");
      // The sidebar followed, rather than staying on whatever was clicked last.
      const current = await sidebar
        .locator("[aria-current='page']")
        .innerText()
        .catch(() => "");
      expect(current.toLowerCase()).toContain("storage");
    },
  );

  test(
    "an ask action drafts the question rather than sending it",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#cdn`);
      await page.waitForLoadState("networkidle").catch(() => {});

      const ask = page
        .locator("main")
        .getByRole("button", { name: /^ask /i })
        .first();
      await expect(ask).toBeVisible();
      await ask.click();
      await page.waitForTimeout(400);

      const composer = page.locator("textarea").first();
      await expect(composer).toBeVisible();
      const drafted = await composer.inputValue();
      expect(drafted.length).toBeGreaterThan(20);
      // Drafted, not sent: nothing was asked of Pi by looking at a page.
      const messages = await page.locator("[data-role='user']").count();
      expect(messages).toBe(0);
    },
  );

  test(
    "every interactive control can be reached and seen from the keyboard",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#processes`);
      await page.waitForLoadState("networkidle").catch(() => {});

      const unlabelled: string[] = [];
      const invisible: string[] = [];
      for (let step = 0; step < 40; step++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return null;
          const style = getComputedStyle(element);
          const focus = getComputedStyle(element, ":focus-visible");
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            name:
              element.getAttribute("aria-label") ??
              element.getAttribute("title") ??
              (element.textContent ?? "").trim().slice(0, 40),
            onScreen: rect.width > 0 && rect.height > 0,
            ring:
              focus.outlineStyle !== "none" ||
              focus.boxShadow !== style.boxShadow ||
              focus.borderColor !== style.borderColor ||
              focus.backgroundColor !== style.backgroundColor,
          };
        });
        if (!focused) continue;
        if (!focused.name) unlabelled.push(focused.tag);
        if (focused.onScreen && !focused.ring)
          invisible.push(`${focused.tag} "${focused.name}"`);
      }
      expect(unlabelled, "controls with no accessible name").toEqual([]);
      expect(invisible, "controls with no visible focus").toEqual([]);
    },
  );
});
