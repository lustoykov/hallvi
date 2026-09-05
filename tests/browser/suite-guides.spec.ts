import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { phaseOneCases } from "../evals/phase-one-cases";
import { createDashboard } from "../dashboard/server";
import { journey } from "./journeys";

test(
  "the How it works page compares every suite without starting a runner",
  journey("dashboard"),
  async ({ page }, testInfo) => {
    const root = mkdtempSync(join(tmpdir(), "sg-suite-guides-"));
    let launches = 0;
    const dashboard = createDashboard(root, () => {
      launches++;
      throw new Error("No runner allowed");
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let revision = 0;
    let shownRevision = -1;
    await page.route("**/api/state", async (route) => {
      const response = await route.fetch();
      const state = await response.json();
      shownRevision = revision;
      await route.fulfill({ json: { ...state, testRevision: revision } });
    });
    try {
      dashboard.server.listen(0, "127.0.0.1");
      await once(dashboard.server, "listening");
      const address = dashboard.server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing dashboard address");
      await page.goto(`http://127.0.0.1:${address.port}/about`);
      await expect(page).toHaveTitle("How it works · Server Guy Testing");
      await expect(
        page.getByRole("heading", { name: "How it works", exact: true }),
      ).toBeVisible();
      const table = page.locator("#compare");
      await expect(table.locator("thead th")).toHaveText([
        "",
        "Application tests",
        "Browser smoke",
        "Browser journeys",
        "Live agent evals",
      ]);
      await expect(table.locator("tbody th")).toHaveText([
        "Purpose",
        "Execution",
        "Real",
        "Mocked / simulated",
        "Database & state lifecycle",
        "Checks & review",
        "Doesn’t prove",
        "Code & saved output",
      ]);
      for (const phrase of [
        "Unit and integration tests",
        "a chat saved by one Phase 1 test cannot appear in the next",
        "database connections close and these temporary folders are deleted",
        "Only the two journeys tagged @smoke run.",
        "dashboard journey starts its own temporary testing dashboard",
        "model replies and compaction summaries are not mocked",
        "the greeting case cannot inherit messages or Decisions from revise-existing",
        "the /tmp/server-guy-pi-eval-* directory is deleted",
        "failed code checks stay failed",
        "tests/evals/phase-one.eval.ts",
        "deleted once the run's reports are written",
        "npm run eval:pi",
      ])
        await expect(table).toContainText(phrase);
      // A state refresh re-renders the table in place without losing it.
      revision++;
      await expect.poll(() => shownRevision).toBe(revision);
      await expect(table.locator("tbody tr")).toHaveCount(8);
      await page.screenshot({
        path: testInfo.outputPath("how-it-works.png"),
        fullPage: true,
      });
      // The suite table on Run checks stays a plain table of actions.
      await page
        .getByRole("navigation", { name: "Pages" })
        .getByRole("link", { name: "Run checks", exact: true })
        .click();
      await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/`);
      await expect(page.locator("#suites tr")).toHaveCount(4);
      await expect(page.locator("#suites button")).toHaveText([
        "Run",
        "Run",
        "Choose journeys…",
        `Run new evals only (${phaseOneCases.length})…`,
        "Choose cases…",
      ]);
      await expect(
        page.locator("#suites details, #suites [aria-expanded]"),
      ).toHaveCount(0);
      expect(launches).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      dashboard.stop();
      dashboard.server.closeAllConnections();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
