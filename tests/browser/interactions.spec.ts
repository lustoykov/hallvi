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
    // The first such link is "/applications/new", which carries no id. Taking
    // it returned null and skipped every journey in this file silently.
    const links = document.querySelectorAll<HTMLAnchorElement>(
      "a[href*='/applications/']",
    );
    for (const link of links) {
      const id = link.getAttribute("href")?.match(/[0-9a-f-]{36}/)?.[0];
      if (id) return id;
    }
    return null;
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
      // History and command output live inside the Activity group, which is
      // closed until something opens it. Open it, or two destinations are
      // unreachable by clicking and the page below says so.
      await sidebar.getByRole("button", { name: /^Activity/ }).click();

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
        "Command output",
        "Monitoring",
        "Access",
        "Environment Variables",
        "CDN",
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
      // The sidebar hides what an application's records do not establish, so
      // on an application nobody has deployed these two rows sit behind Show
      // more and carry their reason under their name — "Processes\nafter
      // deployment". Reveal them and match the name, the way the reachability
      // case does; this journey is about back and forward, not about which
      // rows are offered.
      await sidebar.getByRole("button", { name: /show more/i }).click();
      // Clicked, not navigated: a hash-only goto does not push the same way,
      // and clicking is what a reader does.
      for (const label of ["Processes", "Storage"]) {
        await sidebar
          .getByRole("button", { name: new RegExp(`^${label}`) })
          .first()
          .click();
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

test.describe("the logs filter", () => {
  test(
    "says what it searched when it finds nothing",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await firstApplication(page, ACCEPTANCE);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#logs`);
      await page.waitForLoadState("networkidle").catch(() => {});

      const box = page.getByPlaceholder(/filter captured lines/i);
      // The box is always there; what decides whether this journey has
      // anything to search is whether any run printed something.
      test.skip(
        (await page.locator("main").innerText()).includes(
          "No output has been captured yet",
        ),
        "nothing captured",
      );
      const before = await page.locator(".hv-logs-output").count();
      expect(before).toBeGreaterThan(0);

      await box.fill("zzz-no-such-thing-anywhere");
      await page.waitForTimeout(300);
      // A blank page below the box reads as a page that broke, not as a search
      // that found nothing.
      expect(await page.locator(".hv-logs-output").count()).toBe(0);
      const said = await page.locator("main").innerText();
      expect(said).toMatch(/Nothing captured contains/i);
      expect(said).toMatch(/Clear the filter/i);

      await box.fill("");
      await page.waitForTimeout(300);
      expect(await page.locator(".hv-logs-output").count()).toBe(before);
    },
  );
});
