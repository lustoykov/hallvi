// The journeys worth keeping, as assertions rather than as screenshots.
//
// Screenshots are for a person to look at; these are the handful of claims
// that must not quietly stop being true. Nothing here compares pixels, and
// nothing depends on a timestamp, because both fail for reasons that are not
// defects.

import { expect, test, type Page } from "@playwright/test";

import { journey } from "./journeys";

const ACCEPTANCE = process.env.SG_ACCEPTANCE_URL ?? "http://127.0.0.1:3410";
const SCENARIOS = process.env.SG_SCENARIO_URL ?? "http://127.0.0.1:3411";

const SCENARIO = {
  failing: "aaaaaaaa-0000-4000-8000-000000000001",
  absent: "aaaaaaaa-0000-4000-8000-000000000003",
  everything: "aaaaaaaa-0000-4000-8000-000000000006",
};

async function open(page: Page, base: string, id: string, view: string) {
  await page.goto(`${base}/applications/${id}#${view}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.locator("main").innerText();
}

async function up(page: Page, base: string) {
  const response = await page.request
    .get(`${base}/applications`)
    .catch(() => null);
  return Boolean(response?.ok());
}

test.describe("what the pages must never stop saying", () => {
  test(
    "nothing recorded reads as nobody looked, not as none",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      for (const view of ["processes", "storage", "database"]) {
        const said = await open(page, SCENARIOS, SCENARIO.absent, view);
        expect(said, view).toMatch(/has been looked at yet|Not assessed/i);
        // The words that would be a claim.
        expect(said, view).not.toMatch(/\bno (processes|volumes|databases)\b/i);
      }
    },
  );

  test(
    "an established absence reads as an absence",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      const backups = await open(page, SCENARIOS, SCENARIO.absent, "backups");
      expect(backups).toMatch(/no copy off the server is on record/i);
      const security = await open(page, SCENARIOS, SCENARIO.absent, "security");
      expect(security).toMatch(/nothing stands between the internet/i);
      expect(security).toMatch(/established as absent/i);
    },
  );

  test(
    "a failure stays a failure, and is not called running",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      const processes = await open(
        page,
        SCENARIOS,
        SCENARIO.failing,
        "processes",
      );
      expect(processes).toMatch(/not answering/i);
      expect(processes).not.toMatch(/process is running/i);
      // Forty days old and still red, rather than aged into doubt.
      const monitoring = await open(
        page,
        SCENARIOS,
        SCENARIO.failing,
        "monitoring",
      );
      expect(monitoring).toMatch(/failing/i);
    },
  );

  test(
    "lost data is not the same as untested data",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      const lost = await open(page, SCENARIOS, SCENARIO.failing, "storage");
      expect(lost).toMatch(/did not survive a replacement/i);
      expect(lost).not.toMatch(/volumes stay when containers are replaced/i);
    },
  );

  test(
    "a stale reading is out of date, not a result nobody has",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      const said = await open(
        page,
        SCENARIOS,
        SCENARIO.everything,
        "monitoring",
      );
      // Liveness expires in fifteen minutes and the fixture is older than that
      // by the time anyone runs this, which is the state worth asserting.
      expect(said).not.toMatch(/No result/);
    },
  );

  test(
    "no page prints a number it did not read",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      for (const view of [
        "cache",
        "storage",
        "database",
        "jobs",
        "monitoring",
      ]) {
        const said = await open(page, SCENARIOS, SCENARIO.everything, view);
        expect(said, view).not.toMatch(
          /\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b/,
        );
      }
    },
  );

  test(
    "no page prints the reference scenario's own word",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, SCENARIOS)), "no scenario server");
      for (const view of ["monitoring", "domains", "security", "overview"]) {
        const said = await open(page, SCENARIOS, SCENARIO.everything, view);
        expect(said, view).not.toContain("invented");
      }
    },
  );

  test(
    "a private way in says when it is closed",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      const id = await page.evaluate(
        () =>
          document
            .querySelector<HTMLAnchorElement>("a[href*='/applications/']")
            ?.getAttribute("href")
            ?.match(/[0-9a-f-]{36}/)?.[0] ?? null,
      );
      test.skip(!id, "no application");
      const state = await (
        await page.request.get(`${ACCEPTANCE}/api/applications/${id}/access`)
      ).json();
      test.skip(state.mode !== "private", "not a private deployment");

      await open(page, ACCEPTANCE, id!, "deployment");
      const header = page.locator(".axj3-open");
      // It settles on one of the two answers; "checking" is only the frame
      // before the answer arrives, and has its own case below.
      await expect(header).toHaveAttribute(
        "data-reach",
        state.open ? "open" : "closed",
      );
      if (state.open) await expect(header.locator("a")).toBeVisible();
      else {
        expect(await header.innerText()).toMatch(/tunnel is closed/i);
        // No anchor at all: a dead link that looks alive costs the reader a
        // click, a wait and a browser error before it says anything.
        await expect(header.locator("a")).toHaveCount(0);
        await expect(
          header.getByRole("button", { name: /reopen/i }),
        ).toBeVisible();
      }
    },
  );

  test(
    "never claims a way in before it knows",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      const id = await page.evaluate(
        () =>
          document
            .querySelector<HTMLAnchorElement>("a[href*='/applications/']")
            ?.getAttribute("href")
            ?.match(/[0-9a-f-]{36}/)?.[0] ?? null,
      );
      test.skip(!id, "no application");

      // Hold the answer back, so the frame before it arrives is the one under
      // test. Starting at "open" made that frame claim a working way in on
      // every single load.
      let released: (() => void) | null = null;
      const held = new Promise<void>((resolve) => {
        released = resolve;
      });
      await page.route(`**/api/applications/${id}/access`, async (route) => {
        await held;
        await route.continue();
      });

      const seen: string[] = [];
      await page.goto(`${ACCEPTANCE}/applications/${id}#deployment`, {
        waitUntil: "domcontentloaded",
      });
      for (let tick = 0; tick < 12; tick++) {
        seen.push(
          ...(await page
            .locator(".axj3-open")
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute("data-reach") ?? "none"),
            )),
        );
        // Nothing may be clickable while the answer is outstanding.
        expect(
          await page.locator(".axj3-open a").count(),
          "an Open link before the answer arrived",
        ).toBe(0);
        await page.waitForTimeout(250);
      }
      expect(new Set(seen.filter((value) => value !== "none"))).toEqual(
        new Set(["checking"]),
      );

      // Let it through, and the header settles on a real answer.
      released!();
      await expect(page.locator(".axj3-open")).not.toHaveAttribute(
        "data-reach",
        "checking",
      );
    },
  );

  test(
    "neither real application logs a console error anywhere",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      const errors: string[] = [];
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !/favicon|ERR_ABORTED/.test(message.text())
        )
          errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(`${ACCEPTANCE}/applications`);
      const ids = await page.evaluate(() => [
        ...new Set(
          [
            ...document.querySelectorAll<HTMLAnchorElement>(
              "a[href*='/applications/']",
            ),
          ]
            .map((a) => a.getAttribute("href")?.match(/[0-9a-f-]{36}/)?.[0])
            .filter(Boolean) as string[],
        ),
      ]);
      for (const id of ids)
        for (const view of ["overview", "processes", "storage", "security"])
          await open(page, ACCEPTANCE, id, view);
      expect(errors).toEqual([]);
    },
  );
});

// A name being configured and an application answering on it are different
// claims, and the gap between them is where a proxied name lives: it
// resolves, it serves the provider's certificate, and the origin behind it
// is unreachable. These run against whichever acceptance application has
// actually had a name checked, and skip when none has.
test.describe("a name that is set up, and an application that does not answer", () => {
  async function named(page: Page) {
    await page.goto(`${ACCEPTANCE}/applications`, {
      waitUntil: "domcontentloaded",
    });
    const ids = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          "a[href*='/applications/']",
        ),
      ]
        .map((a) => a.getAttribute("href")?.match(/[0-9a-f-]{36}/)?.[0])
        .filter(
          (id, at, all): id is string => Boolean(id) && all.indexOf(id) === at,
        ),
    );
    for (const id of ids) {
      const response = await page.request.get(
        `${ACCEPTANCE}/api/applications/${id}`,
      );
      if (!response.ok()) continue;
      const view = await response.json();
      const domain = (view.information ?? []).find(
        (record: { presentation?: { states?: { ref: { kind: string } } } }) =>
          record.presentation?.states?.ref.kind === "domain",
      );
      if (domain) return { id, domain };
    }
    return null;
  }

  test(
    "a configured name is never reported as a working one",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      const found = await named(page);
      test.skip(!found, "no application has had a name checked");
      const serves = (found!.domain.presentation.checks ?? []).find(
        (check: { key: string }) => check.key === "serves",
      );
      test.skip(serves?.status !== "failed", "the name does serve");

      const said = await open(page, ACCEPTANCE, found!.id, "domains");
      expect(said).toMatch(/does not answer/i);
      // The sentence that would be the lie.
      expect(said).not.toMatch(/answering on/i);
      // And the browser window a visitor would actually get.
      expect(said).toMatch(/isn’t working|isn't working/i);
      expect(said).toMatch(/nothing came back from the application/i);
    },
  );

  test(
    "a cache in front is not reported as a working site",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      const found = await named(page);
      test.skip(!found, "no application has had a name checked");
      const response = await page.request.get(
        `${ACCEPTANCE}/api/applications/${found!.id}`,
      );
      const view = await response.json();
      const cdn = (view.information ?? []).find(
        (record: { presentation?: { states?: { ref: { kind: string } } } }) =>
          record.presentation?.states?.ref.kind === "cdn",
      );
      test.skip(!cdn, "no cache has been looked at");
      const reachable = (cdn.presentation.checks ?? []).find(
        (check: { key: string }) => check.key === "origin-reachable",
      );
      test.skip(reachable?.status !== "failed", "the origin does answer");

      const said = await open(page, ACCEPTANCE, found!.id, "cdn");
      expect(said).toMatch(/the origin is not answering/i);
      expect(said).toMatch(/the machine behind it does not/i);
      // The cache is genuinely in front; the page must not deny that either.
      expect(said).not.toMatch(/no cache in front/i);
    },
  );

  test(
    "an unread certificate is not called a missing one",
    journey("record-destinations"),
    async ({ page }) => {
      test.skip(!(await up(page, ACCEPTANCE)), "no acceptance server");
      const found = await named(page);
      test.skip(!found, "no application has had a name checked");
      const response = await page.request.get(
        `${ACCEPTANCE}/api/applications/${found!.id}`,
      );
      const view = await response.json();
      const certificate = (view.information ?? []).find(
        (record: { presentation?: { states?: { ref: { kind: string } } } }) =>
          record.presentation?.states?.ref.kind === "certificate",
      );
      test.skip(Boolean(certificate), "a certificate has been recorded");

      const said = await open(page, ACCEPTANCE, found!.id, "domains");
      expect(said).toMatch(/nothing has read a certificate/i);
      expect(said).not.toMatch(/there is (still )?no certificate/i);
    },
  );
});
