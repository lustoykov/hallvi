import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createDashboard } from "../dashboard/server";
import { directory, writeJson } from "../dashboard/results";
import { journey } from "./journeys";

test(
  "live eval settings are read-only while a saved-answer judge can choose its model",
  journey("dashboard"),
  async ({ page }, testInfo) => {
    const root = mkdtempSync(join(tmpdir(), "sg-confirmation-e2e-"));
    let launches = 0;
    const dashboard = createDashboard(root, () => {
      launches++;
      throw new Error("No model calls allowed");
    });
    const requests: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/start", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, json: { status: "synthetic" } });
    });
    writeJson(
      join(
        directory(join(root, "tests/results/evals", "saved")),
        "results.json",
      ),
      {
        model: "synthetic",
        effort: "high",
        startedAt: "2026-09-04",
        commit: "test",
        dirty: false,
        sourceFingerprints: {},
        results: [
          {
            caseId: "greeting",
            repetition: 1,
            rubric: "Greet without inventing a choice",
            outcome: "checks-passed",
            checks: { count: true },
            error: null,
            input: { userMessage: "Hello" },
            reply: { message: "Hello", decisionProposals: [] },
            before: {},
            after: {},
          },
        ],
      },
    );
    try {
      dashboard.server.listen(0, "127.0.0.1");
      await once(dashboard.server, "listening");
      const address = dashboard.server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing dashboard address");
      await page.goto(`http://127.0.0.1:${address.port}/evals`);
      await page.locator("#rerun-case").click();
      await expect(page.locator("#confirm")).toBeVisible();
      await expect(page.locator("#change-settings")).toBeHidden();
      await expect(page.locator("#live-settings")).toBeVisible();
      await expect(page.locator("#live-settings")).toHaveAttribute(
        "href",
        "http://127.0.0.1:3000/setup/pi",
      );
      await expect(page.locator("#run-model")).toHaveJSProperty(
        "readOnly",
        true,
      );
      await expect(page.locator("#run-effort")).toBeDisabled();
      const model = await page.locator("#run-model").inputValue();
      const effort = await page.locator("#run-effort").inputValue();
      await page.screenshot({
        path: testInfo.outputPath("live-confirmation.png"),
      });
      if (await page.locator("#consent").isVisible())
        await page.locator("#consent").check();
      await page.locator("#confirm-run").click();
      await expect
        .poll(() => requests[0])
        .toMatchObject({
          suite: "live",
          model,
          effort,
          cases: ["greeting"],
          repeats: 1,
          consent: true,
        });
      await page.locator("#judge-run").click();
      await expect(page.locator("#live-settings")).toBeHidden();
      if (await page.locator("#change-settings").isVisible())
        await page.locator("#change-settings").click();
      await expect(page.locator("#run-model")).toBeEditable();
      await expect(page.locator("#run-effort")).toBeEnabled();
      await page.locator("#run-model").fill("gpt-5.6-luna");
      await page.locator("#run-effort").selectOption("low");
      if (await page.locator("#consent").isVisible())
        await page.locator("#consent").check();
      await page.locator("#confirm-run").click();
      await expect
        .poll(() => requests[1])
        .toMatchObject({
          suite: "judge",
          model: "gpt-5.6-luna",
          effort: "low",
          consent: true,
        });
      expect(launches).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      dashboard.stop();
      dashboard.server.closeAllConnections();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
