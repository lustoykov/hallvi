import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboard } from "../dashboard/server";
import { directory, listReports, loadReport, saveReview, writeJson } from "../dashboard/results";
import { journey } from "./journeys";

test("dashboard reviews saved answers without model calls or changing source results", journey("dashboard"), async ({ page }, testInfo) => {
  const root = mkdtempSync(join(tmpdir(), "sg-dashboard-e2e-"));
  let launches = 0;
  const dashboard = createDashboard(root, () => { launches++; throw new Error("No runner allowed in this fixture"); });
  for (const entry of [
    { id: "11111111-1111-4111-8111-111111111111", suite: "unit", command: "npm run test" },
    { id: "22222222-2222-4222-8222-222222222222", suite: "smoke" },
  ]) writeJson(join(root, "tests/results/runs", `${entry.id}.json`), {
    ...entry, startedAt: "2026-09-04T09:00:00Z", finishedAt: "2026-09-04T09:00:02Z",
    status: "passed", log: "Fixture output", commit: "test", dirty: false,
  });
  const run = "synthetic-run";
  writeJson(join(directory(join(root, "tests/results/evals", run)), "results.json"), {
    model: "synthetic", effort: "high", startedAt: "2026-09-04T09:00:00Z", commit: "test", dirty: false, sourceFingerprints: {},
    caseIds: ["question", "greeting"], repeats: 2, plannedCases: 4,
    results: [{ caseId: "question", repetition: 1, rubric: "Discuss without pretending a choice was made", outcome: "checks-passed", checks: { count: true },
      error: null, input: { userMessage: "Should I prioritize simplicity?" }, reply: { message: "<script>window.bad=true</script> Let’s discuss the tradeoff.", decisionProposals: [] }, before: {}, after: {} },
    { caseId: "greeting", repetition: 1, rubric: "Greet without a Decision", outcome: "checks-passed", checks: { count: true },
      error: null, input: { userMessage: "Hello" }, reply: { message: "Hello", decisionProposals: [] }, before: {}, after: {} }].flatMap((record) => [record, { ...record, repetition: 2 }]),
  });
  const hash = loadReport(root, run).hash;
  dashboard.server.listen(0, "127.0.0.1"); await once(dashboard.server, "listening");
  const address = dashboard.server.address(); if (!address || typeof address === "string") throw new Error("No address");
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const requests: Array<Record<string, unknown>> = [];
  // Verify requested selections/consent without launching real tests or any model.
  await page.route("**/api/start", async (route) => {
    requests.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: { status: "synthetic" } });
  });
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("row")).toHaveCount(5);
    await expect(page.getByRole("row").filter({ hasText: "Browser journeys" })).toContainText("2 journeys on every PR · all 9 on demand");
    await expect(page.getByText("Full suite: manual", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "smoke · test", exact: true }).click();
    await expect(page.locator("#log")).toHaveText("Command not recorded for this older run.\n\nFixture output");
    await page.getByRole("button", { name: "unit · test", exact: true }).click();
    await expect(page.locator("#log")).toHaveText("$ npm run test\n\nFixture output");
    await page.screenshot({ path: testInfo.outputPath("dashboard-runs.png"), fullPage: true });
    await page.getByRole("button", { name: "Choose journeys…" }).click();
    await expect(page.getByRole("dialog", { name: "Choose browser journeys" })).toBeVisible();
    await expect(page.locator("#journey-options input")).toHaveCount(9);
    await page.getByRole("button", { name: "Clear journeys", exact: true }).click();
    await expect(page.getByRole("button", { name: "Run selected journeys" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /^Settings and privacy help/ }).check();
    await page.getByRole("checkbox", { name: /^Disconnect without losing history/ }).check();
    await expect(page.locator("#journey-count")).toContainText("2 of 9 journeys selected");
    await page.screenshot({ path: testInfo.outputPath("dashboard-journey-selection.png"), fullPage: true });
    await page.getByRole("dialog").press("Escape");
    await expect(page.getByRole("button", { name: "Choose journeys…" })).toBeFocused();
    await page.getByRole("button", { name: "Choose journeys…" }).click();
    await expect(page.locator("#journey-count")).toContainText("2 of 9 journeys selected");
    await page.getByRole("button", { name: "Run selected journeys" }).click();
    await expect.poll(() => requests.at(-1)).toEqual({ suite: "e2e", journeys: ["settings", "disconnect"] });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Choose cases…" }).click();
    await page.getByRole("button", { name: "Clear cases", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review and run live evals…" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /^Ordinary greeting/ }).check();
    await page.getByRole("checkbox", { name: /^Hypothetical choice/ }).check();
    await page.getByLabel("Repetitions per case").selectOption("2");
    await expect(page.locator("#eval-count")).toHaveText("2 cases × 2 repetitions = 4 planned answers");
    await page.screenshot({ path: testInfo.outputPath("dashboard-eval-selection.png"), fullPage: true });
    await page.getByRole("button", { name: "Review and run live evals…" }).click();
    await expect(page.getByRole("dialog")).toContainText("2 cases × 2 repetitions = 4 planned answers");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review and run live evals…" })).toBeFocused();
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Review and run live evals…" }).click();
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start run", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "live", cases: ["greeting", "hypothetical"], repeats: 2, consent: true });
    await page.getByRole("button", { name: /Review live eval answers/ }).click();
    await expect(page.locator("#report-meta")).toContainText("2 cases × 2 repetitions = 4 planned answers · 4 answers saved");
    await expect(page.getByText(/not browser test results/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Select class / })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Select all answers in run / })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Judge selected (0)…", exact: true })).toBeDisabled();
    await expect(page.locator("#answer")).toContainText("<script>window.bad=true</script>");
    await page.getByLabel("Reviewer", { exact: true }).fill("Fixture reviewer");
    await page.getByRole("combobox", { name: "Verdict", exact: true }).selectOption("needs-discussion");
    await page.getByLabel("Reason", { exact: true }).fill("Please clarify the intended behavior.");
    await expect(page.locator("#saved")).toHaveText("Unsaved changes");
    await page.getByRole("button", { name: "greeting · repetition 1 Human: pending", exact: true }).click();
    await expect(page.getByRole("button", { name: "greeting · repetition 1 Human: pending", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "question · repetition 1 Human: pending", exact: true }).click();
    await expect(page.getByRole("button", { name: "question · repetition 1 Human: pending", exact: true })).toBeFocused();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.getByRole("combobox", { name: "Verdict", exact: true })).toHaveValue("needs-discussion");
    await page.screenshot({ path: testInfo.outputPath("dashboard-unsaved-review.png"), fullPage: true });
    await page.getByRole("button", { name: "Save human review" }).click();
    await expect(page.locator("#saved")).toContainText("Saved");
    saveReview(root, run, hash, "question:1", { type: "llm", model: "synthetic-judge", effort: "high", promptVersion: "fixture", piVersion: "fixture", verdict: "pass", reason: "The reply discusses the tradeoff without recording an invented choice." });
    await page.reload();
    await page.getByRole("button", { name: /Review live eval answers/ }).click();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.getByRole("combobox", { name: "Verdict", exact: true })).toHaveValue("needs-discussion");
    const reviewArea = page.getByRole("region", { name: "Review this answer", exact: true });
    await expect(reviewArea.getByRole("heading", { name: "Your verdict" })).toBeVisible();
    await expect(reviewArea.getByRole("region", { name: "LLM advice pass" })).toContainText("without recording an invented choice");
    await expect(page.locator("#judge-verdict")).toHaveText("pass");
    await expect(page.getByRole("combobox", { name: "Verdict", exact: true })).toHaveValue("needs-discussion");
    await page.screenshot({ path: testInfo.outputPath("dashboard-review.png"), fullPage: true });
    await reviewArea.getByRole("button", { name: "Ask LLM for advice…" }).click();
    await page.getByRole("dialog").getByLabel("Model", { exact: true }).fill("gpt-5.6-luna");
    await expect(page.getByRole("dialog")).toContainText("Judge 1 saved answer");
    await expect(page.locator("#confirm-selection")).toHaveText("question:1");
    await page.getByRole("dialog").press("Escape");
    await page.getByRole("button", { name: "Select unreviewed", exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("3 selected");
    await page.getByRole("button", { name: "Human verdict…", exact: true }).click();
    await page.getByLabel("Bulk reviewer", { exact: true }).fill("Bulk reviewer");
    await page.getByRole("combobox", { name: "Bulk verdict", exact: true }).selectOption("needs-discussion");
    await page.getByLabel("Shared reason", { exact: true }).fill("Selection needs closer review.");
    await page.screenshot({ path: testInfo.outputPath("dashboard-bulk-review.png"), fullPage: true });
    await page.getByRole("button", { name: "Save human verdict for 3 answers", exact: true }).click();
    await expect(page.locator("#bulk-result")).toHaveText("Human verdict saved for 3 answers.");
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    await page.getByRole("button", { name: "Select unreviewed", exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    await page.getByRole("button", { name: "Select whole run", exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("4 selected");
    await page.getByRole("button", { name: "Judge selected (4)…", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("4 saved answers");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("dialog").getByLabel("Model", { exact: true }).fill("gpt-5.6-luna");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start run", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", keys: ["question:1", "question:2", "greeting:1", "greeting:2"], consent: true, hash, model: "gpt-5.6-luna" });
    await page.reload();
    await page.getByRole("button", { name: /Review live eval answers/ }).click();
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    const runSelection = page.getByRole("checkbox", { name: `Select all answers in run ${run}`, exact: true });
    await runSelection.check();
    await expect(page.locator("#answer-count")).toHaveText("4 selected");
    await expect(page.getByRole("checkbox", { name: "Select greeting repetition 1", exact: true })).toBeChecked();
    await page.getByRole("checkbox", { name: "Select greeting repetition 2", exact: true }).uncheck();
    await expect(runSelection).toBeChecked({ indeterminate: true });
    await runSelection.check();
    await page.screenshot({ path: testInfo.outputPath("dashboard-run-selection.png"), fullPage: true });
    await page.route("**/api/runs/archive", (route) => route.fulfill({ status: 400, json: { error: "Results changed. Reload before archiving." } }), { times: 1 });
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#error")).toContainText("Results changed");
    await expect(page.locator("#answer-count")).toHaveText("4 selected");
    await expect(runSelection).toBeChecked();
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.getByRole("button", { name: "Active runs (0)", exact: true })).toBeVisible();
    await expect(runSelection).toHaveCount(0);
    await expect(page.locator("#bulk-result")).toContainText("Run archived");
    await expect(page.locator("#empty-inbox")).toContainText("No active eval runs");
    await page.reload();
    await page.getByRole("button", { name: /Review live eval answers/ }).click();
    await expect(runSelection).toHaveCount(0);
    await page.getByRole("button", { name: "Archived runs (1)", exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    await expect(page.locator("#cases .answer-selection")).toHaveCount(4);
    await page.getByRole("button", { name: "Restore run", exact: true }).click();
    await expect(page.locator("#empty-inbox")).toContainText("No archived eval runs");
    await page.getByRole("button", { name: "Active runs (1)", exact: true }).click();
    await expect(page.locator("#reason")).toHaveValue("Please clarify the intended behavior.");
    expect(launches).toBe(0); expect(loadReport(root, run).hash).toBe(hash);
    expect(listReports(root)[0].reviews.map((r) => r.type)).toEqual(["human", "llm", "human", "human", "human"]);
    // An older run can be archived without hiding answers in the newer run.
    const secondRun = "other-synthetic-run";
    const saved = loadReport(root, run).report;
    writeJson(join(directory(join(root, "tests/results/evals", secondRun)), "results.json"), {
      ...saved, startedAt: "2026-09-03T09:00:00Z", caseIds: ["greeting"], plannedCases: 2,
      results: saved.results.filter((c) => c.caseId === "greeting").map((c) => c.repetition === 1 ? c : { ...c, input: null, reply: null, outcome: "not-run" }),
    });
    await runSelection.check();
    await expect(page.getByRole("button", { name: /^Open eval run / })).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("dashboard-two-runs.png"), fullPage: true });
    await page.getByRole("button", { name: `Open eval run ${secondRun}`, exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    await page.getByRole("checkbox", { name: `Select all answers in run ${secondRun}`, exact: true }).check();
    await expect(page.getByRole("button", { name: "Judge selected (1)…", exact: true })).toBeEnabled();
    await expect(page.getByRole("checkbox", { name: "Select greeting repetition 2", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.getByRole("button", { name: "Active runs (1)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archived runs (1)", exact: true })).toBeVisible();
    await expect(page.locator("#cases .answer-selection")).toHaveCount(4);
    await expect(page.locator("#answer-count")).toHaveText("0 selected");
    await expect(page.locator("#pending")).toHaveText("");
    expect(listReports(root).find((r) => r.run === secondRun)?.archived).toBe(true);
    expect(listReports(root).find((r) => r.run === run)?.archived).toBe(false);
    // A full 16-answer run expands in the page, not a hidden sidebar scroll area.
    const fullRun = "sixteen-answer-run";
    const caseIds = Array.from({ length: 8 }, (_, index) => `layout-case-${index + 1}`);
    writeJson(join(directory(join(root, "tests/results/evals", fullRun)), "results.json"), {
      ...saved, startedAt: "2026-09-04T10:00:00Z", caseIds, repeats: 2, plannedCases: 16,
      results: caseIds.flatMap((caseId) => [1, 2].map((repetition) => ({ ...saved.results[0], caseId, repetition }))),
    });
    await page.reload();
    await page.getByRole("button", { name: /Review live eval answers/ }).click();
    await expect(page.locator("#report-meta")).toContainText("8 cases × 2 repetitions = 16 planned answers · 16 answers saved");
    await expect(page.locator("#cases .answer-selection")).toHaveCount(16);
    for (const container of [page.locator("#cases"), page.locator(".review-layout aside")]) {
      await expect(container).toHaveCSS("max-height", "none");
      await expect(container).toHaveCSS("overflow-y", "visible");
      expect(await container.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    }
    const lastAnswer = page.getByRole("checkbox", { name: "Select layout-case-8 repetition 2", exact: true });
    await lastAnswer.scrollIntoViewIfNeeded();
    await expect(lastAnswer).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await page.locator("#cases").evaluate((element) => element.scrollTop)).toBe(0);
    expect(await page.locator(".review-layout aside").evaluate((element) => element.scrollTop)).toBe(0);
    await page.getByRole("button", { name: "Select whole run", exact: true }).click();
    await expect(page.locator("#answer-count")).toHaveText("16 selected");
    await page.screenshot({ path: testInfo.outputPath("dashboard-sixteen-answers.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await page.close(); dashboard.stop(); dashboard.server.closeAllConnections(); rmSync(root, { recursive: true, force: true }); }
});
