import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboard } from "../dashboard/server";
import {
  archiveRun,
  directory,
  loadReport,
  writeJson,
} from "../dashboard/results";
import { phaseOneCases } from "../evals/phase-one-cases";
import { journey } from "./journeys";

test(
  "eval picker defaults to unrun cases, groups categories and preserves explicit selection",
  journey("dashboard"),
  async ({ page }, testInfo) => {
    const root = mkdtempSync(join(tmpdir(), "sg-eval-picker-"));
    let launches = 0;
    const dashboard = createDashboard(root, () => {
      launches++;
      throw new Error("No real runners in picker tests");
    });
    const save = (run: string, ids: string[]) =>
      writeJson(
        join(directory(join(root, "tests/results/evals", run)), "results.json"),
        {
          model: "synthetic",
          effort: "high",
          startedAt: "2026-09-05T00:00:00Z",
          commit: "test",
          dirty: false,
          sourceFingerprints: {},
          results: ids.map((caseId) => ({
            caseId,
            repetition: 1,
            rubric: "Fixture",
            outcome: "checks-passed",
            checks: { count: true },
            error: null,
            input: { userMessage: "Fixture" },
            reply: { message: "Fixture", decisionProposals: [] },
            before: {},
            after: {},
          })),
        },
      );
    save(
      "original",
      phaseOneCases.filter((item) => !item.githubState).map((item) => item.id),
    );
    archiveRun(root, "original", loadReport(root, "original").hash, true);
    dashboard.server.listen(0, "127.0.0.1");
    await once(dashboard.server, "listening");
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: unknown[] = [];
    await page.route("**/api/start", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, json: { status: "synthetic" } });
    });
    const selected = () =>
      page
        .locator("#eval-options input:checked")
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        );
    const githubIds = phaseOneCases
      .filter((item) => item.githubState)
      .map((item) => item.id);
    const category = (name: string) =>
      page.locator(`.eval-category[data-category="${name}"]`);
    try {
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.getByRole("button", { name: "Choose cases…" }).click();
      await expect.poll(selected).toEqual(githubIds);
      await expect(category("Decision handling")).not.toHaveAttribute(
        "open",
        "",
      );
      await expect(category("GitHub access")).toHaveAttribute("open", "");
      await expect(page.locator("#eval-history")).toContainText(
        "3 cases not run yet",
      );
      await expect(page.locator("#eval-count")).toContainText(
        "3 planned answers",
      );
      await page.screenshot({
        path: testInfo.outputPath("unrun-categories.png"),
        fullPage: true,
      });

      await page
        .getByRole("button", { name: "Clear GitHub access", exact: true })
        .click();
      await expect(page.locator("#run-evals")).toBeDisabled();
      await page.getByLabel("Search cases").fill("ordinary greeting");
      await expect(category("GitHub access")).toBeHidden();
      await page.getByRole("checkbox", { name: /^Ordinary greeting/ }).check();
      await page.getByLabel("Search cases").fill("not-a-case");
      await expect(page.locator("#eval-no-matches")).toBeVisible();
      await expect.poll(selected).toEqual(["greeting"]);
      await expect(page.locator("#eval-count")).toContainText(
        "1 planned answer",
      );
      await page.getByLabel("Search cases").fill("");
      await page.getByRole("button", { name: "Close eval selection" }).click();
      await page.getByRole("button", { name: "Choose cases…" }).click();
      await expect.poll(selected).toEqual(["greeting"]);

      // New history arriving during polling must not overwrite a manual choice.
      save("fresh", githubIds.slice(0, 1));
      await expect(page.locator("#eval-history")).toContainText(
        "2 cases not run yet",
      );
      await expect.poll(selected).toEqual(["greeting"]);
      await page
        .getByRole("button", { name: "Select unrun", exact: true })
        .click();
      await expect.poll(selected).toEqual(githubIds.slice(1));
      await page.locator("#run-evals").click();
      await expect(
        page.getByRole("dialog", { name: "Run 2 cases", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect.poll(selected).toEqual(githubIds.slice(1));
      expect(requests).toHaveLength(0);
      await page.locator("#run-evals").click();
      await page
        .getByRole("checkbox", {
          name: "Judge the answers automatically when the run finishes",
        })
        .uncheck();
      await page
        .getByRole("button", { name: "Start run", exact: true })
        .click();
      await expect
        .poll(() => requests.at(-1))
        .toMatchObject({
          suite: "live",
          cases: githubIds.slice(1),
          repeats: 1,
          consent: true,
          judgeAfter: false,
        });

      save("finished", githubIds);
      await page.getByRole("button", { name: "Choose cases…" }).click();
      await expect(page.locator("#eval-history")).toContainText(
        "All cases have been run",
      );
      await expect.poll(selected).toEqual([]);
      await expect(page.locator("#run-evals")).toBeDisabled();
      await page.screenshot({
        path: testInfo.outputPath("all-cases-already-run.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Select all cases", exact: true })
        .click();
      await expect(page.locator("#eval-count")).toContainText(
        `${phaseOneCases.length} planned answers`,
      );
      expect(launches).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      dashboard.stop();
      dashboard.server.closeAllConnections();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
