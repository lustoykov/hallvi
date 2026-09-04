import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createDashboard } from "../dashboard/server";
import { journey } from "./journeys";

test("suite explanations show isolation and grading without starting a runner", journey("dashboard"), async ({ page }, testInfo) => {
  const root = mkdtempSync(join(tmpdir(), "sg-suite-guides-"));
  let launches = 0;
  const dashboard = createDashboard(root, () => { launches++; throw new Error("No runner allowed"); });
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
    dashboard.server.listen(0, "127.0.0.1"); await once(dashboard.server, "listening");
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Missing dashboard address");
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.locator(".suite-explanation")).toHaveCount(0);
    const unit = page.getByRole("button", { name: "About Application tests", exact: true });
    await unit.focus(); await unit.press("Enter");
    const unitGuide = page.getByRole("region", { name: "Application tests explained" });
    await expect(unitGuide).toContainText("Unit and integration tests");
    await expect(unitGuide).toContainText("a chat saved by one Phase 1 test cannot appear in the next");
    await expect(unitGuide).toContainText("database connections close and these temporary folders are deleted");
    await expect(unit).toHaveAttribute("aria-expanded", "true");
    revision++;
    await expect.poll(() => shownRevision).toBe(revision);
    await expect(unitGuide).toBeVisible(); await expect(unit).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("suite-application-tests.png"), fullPage: true });
    for (const [name, phrase] of [
      ["Browser smoke", "Only the two journeys tagged @smoke run."],
      ["Browser journeys", "dashboard journey starts its own temporary testing dashboard"],
      ["Live agent evals", "model replies are not mocked"],
    ]) {
      await page.getByRole("button", { name: `About ${name}`, exact: true }).click();
      const guide = page.getByRole("region", { name: `${name} explained` });
      await expect(guide).toContainText(phrase);
      await expect(guide.locator("dt")).toHaveText(["Execution", "Real", "Mocked / simulated", "Database & state lifecycle", "Checks & review", "Doesn’t prove"]);
      await expect(page.locator(".suite-explanation")).toHaveCount(1);
    }
    const liveGuide = page.getByRole("region", { name: "Live agent evals explained" });
    await expect(liveGuide).toContainText("the greeting case cannot inherit messages or Decisions from revise-existing");
    await expect(liveGuide).toContainText("the database connection closes; the file remains in /tmp");
    await expect(liveGuide).toContainText("failed code checks stay failed");
    await page.screenshot({ path: testInfo.outputPath("suite-live-evals.png"), fullPage: true });
    await liveGuide.getByText("Code & saved output", { exact: true }).click();
    await expect(liveGuide).toContainText("tests/evals/phase-one.eval.ts");
    await expect(liveGuide).toContainText("retained for debugging");
    await expect(liveGuide).toContainText("npm run eval:pi");
    await page.getByRole("button", { name: "About Live agent evals", exact: true }).press("Space");
    await expect(page.locator(".suite-explanation")).toHaveCount(0);
    await page.getByRole("button", { name: "Choose journeys…" }).click();
    await expect(page.getByRole("dialog", { name: "Choose browser journeys" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(launches).toBe(0); expect(errors).toEqual([]);
    const state = await page.request.get(`http://127.0.0.1:${address.port}/api/state`, { headers: { "x-sg-testing-token": dashboard.token } });
    expect((await state.json()).history).toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    dashboard.stop(); dashboard.server.closeAllConnections();
    rmSync(root, { recursive: true, force: true });
  }
});
