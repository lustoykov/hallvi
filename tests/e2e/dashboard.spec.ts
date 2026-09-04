import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboard } from "../dashboard/server";
import { directory, listReports, loadReport, saveReview, writeJson } from "../dashboard/results";
import { journey } from "./journeys";
import { JUDGE_PROMPT_VERSION } from "../evals/judge-policy";

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
  const reviewTab = page.locator("#reviews-link");
  const answer = (key: string) => page.locator(`.answer-open[data-case-key="${key}"]`);
  const runCard = (id: string) => page.locator(`.run-card[data-run="${id}"]`);
  const selectAll = page.getByRole("checkbox", { name: "Select all shown answers", exact: true });
  const verdict = (name: string) => page.locator("#human-form").getByRole("radio", { name, exact: true });
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("row")).toHaveCount(5);
    await expect(page.getByRole("columnheader", { name: "AI usage", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "CI", exact: true })).toBeVisible();
    const browserRow = page.getByRole("row").filter({ hasText: "Browser journeys" });
    await expect(browserRow.locator(".suite-schedule > span")).toHaveText("2 of 9 per PR");
    await expect(browserRow.locator(".suite-schedule small")).toHaveText("All 9 on demand");
    await expect(page.locator("#suites .usage-free")).toHaveCount(3);
    const liveRow = page.getByRole("row").filter({ hasText: "Live agent evals" });
    await expect(liveRow.locator(".usage-paid")).toHaveText("Uses subscription");
    await expect(liveRow.locator(".suite-schedule > span")).toHaveText("On demand only");
    await expect(liveRow.locator(".suite-schedule small")).toHaveText("Local only · never in CI");
    await expect(liveRow.getByRole("link", { name: /View saved runs/ })).toHaveAttribute("href", "/evals");
    await expect(page.getByRole("navigation", { name: "Testing sections" })).toHaveCount(0);
    await expect(page.getByText("Full suite: manual", { exact: true })).toHaveCount(0);
    await expect(page.locator(".suite-help")).not.toHaveAttribute("open", "");
    await page.getByText("About AI usage & automatic runs", { exact: true }).click();
    await expect(page.locator(".suite-help")).toContainText("The tests still run automatically after you start them.");
    await expect(page.locator(".suite-help")).toContainText("GitHub-hosted runs still consume Actions minutes.");
    await page.getByText("About AI usage & automatic runs", { exact: true }).click();
    // Inner result stacks must not turn table cells into grids or break row borders.
    for (const row of await page.locator("#suites tr").all()) {
      const cells = row.locator("td");
      await expect(cells).toHaveCount(5);
      const bounds = await cells.evaluateAll((items) => items.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { display: getComputedStyle(cell).display, top: rect.top, bottom: rect.bottom };
      }));
      expect(bounds.every((cell) => cell.display === "table-cell")).toBe(true);
      expect(Math.max(...bounds.map((cell) => cell.bottom)) - Math.min(...bounds.map((cell) => cell.bottom))).toBeLessThan(1);
    }
    const actionBounds = await page.locator("#suites td:last-child button").evaluateAll((buttons) => buttons.map((button) => {
      const { left, width, height } = button.getBoundingClientRect();
      return { left, width, height };
    }));
    expect(actionBounds).toHaveLength(4);
    for (const dimension of ["left", "width", "height"] as const) {
      expect(Math.max(...actionBounds.map((box) => box[dimension])) - Math.min(...actionBounds.map((box) => box[dimension]))).toBeLessThan(1);
    }
    await page.getByRole("button", { name: "Browser smoke", exact: true }).click();
    await expect(page.locator("#log")).toHaveText("Command not recorded for this older run.\n\nFixture output");
    await page.getByRole("button", { name: "Application tests", exact: true }).click();
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
    await expect(page.getByLabel("Repetitions per case")).toHaveValue("1");
    await expect(page.locator("#eval-count")).toHaveText("8 cases × 1 repetition = 8 planned answers");
    await page.getByRole("button", { name: "Clear cases", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review and run live evals…" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /^Ordinary greeting/ }).check();
    await page.getByRole("checkbox", { name: /^Hypothetical choice/ }).check();
    await page.getByLabel("Repetitions per case").selectOption("2");
    await expect(page.locator("#eval-count")).toHaveText("2 cases × 2 repetitions = 4 planned answers");
    await page.screenshot({ path: testInfo.outputPath("dashboard-eval-selection.png"), fullPage: true });
    await page.getByRole("button", { name: "Review and run live evals…" }).click();
    await expect(page.getByRole("dialog")).toContainText("2 cases × 2 repetitions = 4 planned answers");
    await expect(page.getByRole("dialog")).toContainText("Judging is a separate action");
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

    // Review: the newest run opens with its first answer; repetitions of a case sit together.
    await expect(reviewTab).toContainText("4 need attention");
    await reviewTab.click();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/evals`);
    await expect(page).toHaveTitle("Eval runs · Server Guy Testing");
    await expect(page.locator("#runs-panel")).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/`);
    await expect(page.locator("#runs-panel")).toBeVisible();
    await page.goForward();
    await expect(page.locator("#reviews-panel")).toBeVisible();
    // A direct link in a fresh tab and a reload both resolve server-side to the review page.
    const direct = await page.context().newPage();
    await direct.goto(`http://127.0.0.1:${address.port}/evals`);
    await expect(direct.getByRole("heading", { name: "Eval runs", exact: true })).toBeVisible();
    await direct.reload();
    await expect(direct.locator("#case-title")).toContainText("question");
    await direct.close();
    await expect(page.locator("#run-meta")).toContainText("2 cases × 2 repetitions = 4 planned · 4 answers saved");
    await expect(page.locator("#progress-text")).toHaveText("0 of 4 human-reviewed");
    await page.getByRole("button", { name: "Judge run…", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Judge 4 saved answers");
    await expect(page.locator("#confirm-selection")).toHaveText("question:1, question:2, greeting:1, greeting:2");
    await expect(page.getByRole("dialog")).toContainText("Server Guy is not rerun");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText(/not browser test results/)).toBeVisible();
    await expect(page.locator("#answer-list .answer-group")).toHaveText(["question", "Ordinary greeting"]);
    await expect(page.locator("#answer-list .answer-open")).toHaveText([/^Repetition 1/, /^Repetition 2/, /^Repetition 1/, /^Repetition 2/]);
    await expect(page.locator("#run-repeats")).toContainText("answered 2 times");
    await expect(answer("question:1")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#answer")).toContainText("<script>window.bad=true</script>");
    await expect(page.locator("#selection-bar")).toBeHidden();
    // Rerun one current case once, even when the picker and saved run use two repetitions.
    // Old/removed case IDs remain readable but cannot start a different case accidentally.
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeDisabled();
    await expect(page.locator("#rerun-unavailable")).toBeVisible();
    await answer("greeting:1").click();
    const beforeRerun = requests.length;
    await page.getByRole("button", { name: "Run case again…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Run Ordinary greeting", exact: true })).toBeVisible();
    await expect(page.locator("#confirm-description")).toContainText("1 case × 1 repetition = 1 planned answer");
    await expect(page.locator("#confirm-description")).toContainText("Uses current code and case definitions");
    await expect(page.locator("#confirm-description")).toContainText("existing answers and reviews stay unchanged");
    await expect(page.locator("#confirm-selection")).toHaveText("greeting");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("dashboard-single-case-rerun.png"), fullPage: true });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(requests).toHaveLength(beforeRerun);
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Run case again…", exact: true }).click();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start run", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toEqual({ suite: "live", cases: ["greeting"], repeats: 1, consent: true, model: "gpt-5.6-sol", effort: "high" });
    expect(loadReport(root, run).hash).toBe(hash);
    await answer("question:1").click();
    // Saving needs a reviewer name, an explicit verdict and a reason; drafts survive switching answers.
    await verdict("Needs discussion").check();
    await page.getByLabel("Reason", { exact: true }).fill("Please clarify the intended behavior.");
    await expect(page.locator("#saved")).toHaveText("Unsaved changes");
    await page.getByRole("link", { name: "Run checks", exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/`);
    await reviewTab.click();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(verdict("Needs discussion")).toBeChecked();
    await page.getByRole("button", { name: "Save verdict", exact: true }).click();
    await expect(page.locator("#saved")).toContainText("Enter your name");
    await expect(page.getByLabel("Reviewing as")).toBeFocused();
    await page.getByLabel("Reviewing as").fill("Fixture reviewer");
    await answer("greeting:1").click();
    await expect(answer("greeting:1")).toBeFocused();
    await expect(page.locator("#case-title")).toHaveText("Ordinary greeting · repetition 1 of 2");
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("");
    await page.keyboard.press("k");
    await expect(page.locator("#case-title")).toHaveText("question · repetition 2 of 2");
    await answer("question:1").click();
    await expect(answer("question:1")).toBeFocused();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(verdict("Needs discussion")).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("dashboard-unsaved-review.png"), fullPage: true });
    await page.getByRole("button", { name: "Save verdict", exact: true }).click();
    await expect(page.locator("#saved")).toContainText("Saved by Fixture reviewer");
    await expect(page.getByRole("button", { name: "Next needing attention", exact: true })).toBeVisible();
    await expect(page.locator("#progress-text")).toHaveText("1 of 4 human-reviewed · 1 to discuss");
    await expect(reviewTab).toContainText("4 need attention");
    // LLM advice is displayed beside the saved human verdict without changing it.
    saveReview(root, run, hash, "question:1", { type: "llm", model: "synthetic-judge", effort: "high", promptVersion: "fixture", piVersion: "fixture", verdict: "pass", reason: "The reply discusses the tradeoff without recording an invented choice." });
    await page.reload();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/evals`);
    await expect(page.getByLabel("Reviewing as")).toHaveValue("Fixture reviewer");
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(verdict("Needs discussion")).toBeChecked();
    const advice = page.getByRole("region", { name: "LLM judgment", exact: true });
    await expect(advice).toContainText("without recording an invented choice");
    await expect(page.locator("#judge-verdict")).toHaveText("Pass");
    await expect(page.locator("#human-chip")).toHaveText("Your verdict: Needs discussion");
    await expect(answer("question:1")).toContainText("LLM advice: Pass");
    await page.screenshot({ path: testInfo.outputPath("dashboard-review.png"), fullPage: true });
    await advice.getByRole("button", { name: "Judge again…" }).click();
    await page.getByRole("dialog").getByLabel("Model", { exact: true }).fill("gpt-5.6-luna");
    await expect(page.getByRole("dialog")).toContainText("Judge 1 saved answer");
    await expect(page.locator("#confirm-selection")).toHaveText("question:1");
    await page.getByRole("dialog").press("Escape");
    // Bulk human verdict for everything still to review.
    await page.getByRole("button", { name: /^Needs attention/ }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(4);
    await selectAll.check();
    await page.getByRole("checkbox", { name: "Select question repetition 1", exact: true }).uncheck();
    await expect(page.locator("#selection-count")).toHaveText("3 selected");
    await page.getByRole("button", { name: "Set human verdict (3)…", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Reviewer", { exact: true })).toHaveValue("Fixture reviewer");
    await page.getByRole("dialog").getByLabel("Reviewer", { exact: true }).fill("Bulk reviewer");
    await page.getByRole("dialog").getByRole("radio", { name: "Needs discussion", exact: true }).check();
    await page.getByLabel("Shared reason", { exact: true }).fill("Selection needs closer review.");
    await page.screenshot({ path: testInfo.outputPath("dashboard-bulk-review.png"), fullPage: true });
    await page.getByRole("button", { name: "Save verdict for 3 answers", exact: true }).click();
    await expect(page.locator("#bulk-result")).toHaveText("Human verdict saved for 3 answers.");
    await expect(page.locator("#selection-bar")).toBeHidden();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(4);
    await expect(page.locator("#triage-summary")).toContainText("4 need review");
    await expect(page.locator("#progress-text")).toHaveText("4 of 4 human-reviewed · 4 to discuss");
    // Bulk LLM advice goes through the spending confirmation with exact keys.
    await page.getByRole("button", { name: /^All/ }).click();
    await selectAll.check();
    await expect(page.locator("#selection-count")).toHaveText("4 selected");
    await page.getByRole("button", { name: "Judge selected (4)…", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Judge 4 saved answers");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("dialog").getByLabel("Model", { exact: true }).fill("gpt-5.6-luna");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start run", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", keys: ["question:1", "question:2", "greeting:1", "greeting:2"], consent: true, hash, model: "gpt-5.6-luna" });
    await page.reload();
    await expect(page.locator("#selection-bar")).toBeHidden();
    await selectAll.check();
    await expect(page.locator("#selection-count")).toHaveText("4 selected");
    await expect(page.getByRole("checkbox", { name: "Select Ordinary greeting repetition 1", exact: true })).toBeChecked();
    await page.getByRole("checkbox", { name: "Select Ordinary greeting repetition 2", exact: true }).uncheck();
    await expect(selectAll).toBeChecked({ indeterminate: true });
    await selectAll.check();
    await page.screenshot({ path: testInfo.outputPath("dashboard-run-selection.png"), fullPage: true });
    // Archive moves the whole run, keeps it readable, and a failed request keeps the selection.
    await page.route("**/api/runs/archive", (route) => route.fulfill({ status: 400, json: { error: "Results changed. Reload before archiving." } }), { times: 1 });
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#error")).toContainText("Results changed");
    await expect(page.locator("#selection-count")).toHaveText("4 selected");
    await expect(selectAll).toBeChecked();
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#archived-list").locator(runCard(run))).toBeVisible();
    await expect(page.locator("#no-active-runs")).toBeVisible();
    await expect(page.locator("#run-archived")).toBeVisible();
    await expect(page.locator("#bulk-result")).toContainText("Run archived");
    await expect(page.locator("#selection-bar")).toBeHidden();
    await expect(reviewTab).not.toContainText("need attention");
    await page.reload();
    await expect(page.locator("#archived-runs")).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Restore run", exact: true }).click();
    await expect(page.locator("#run-list").locator(runCard(run))).toBeVisible();
    await expect(page.locator("#archived-runs")).toBeHidden();
    await expect(page.locator("#reason")).toHaveValue("Please clarify the intended behavior.");
    expect(launches).toBe(0); expect(loadReport(root, run).hash).toBe(hash);
    expect(listReports(root)[0].reviews.map((r) => r.type)).toEqual(["human", "llm", "human", "human", "human"]);
    // An older run with a failed answer: selection stays inside one run, failed answers can't be selected.
    const secondRun = "other-synthetic-run";
    const saved = loadReport(root, run).report;
    writeJson(join(directory(join(root, "tests/results/evals", secondRun)), "results.json"), {
      ...saved, startedAt: "2026-09-03T09:00:00Z", caseIds: ["greeting"], plannedCases: 2,
      results: saved.results.filter((c) => c.caseId === "greeting").map((c) => c.repetition === 1 ? c : { ...c, input: null, reply: null, outcome: "not-run" }),
    });
    await selectAll.check();
    await expect(page.locator("#run-list .run-card")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("dashboard-two-runs.png"), fullPage: true });
    await runCard(secondRun).click();
    await expect(page.locator("#selection-bar")).toBeHidden();
    await expect(page.getByRole("checkbox", { name: "Select Ordinary greeting repetition 2", exact: true })).toBeDisabled();
    await selectAll.check();
    await expect(page.getByRole("button", { name: "Judge selected (1)…", exact: true })).toBeEnabled();
    await answer("greeting:2").click();
    await expect(page.locator("#unreviewable")).toBeVisible();
    await expect(page.locator("#human-form")).toBeHidden();
    await expect(page.getByRole("button", { name: "Judge answer…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.locator("#selection-bar")).toBeHidden();
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#archived-list").locator(runCard(secondRun))).toBeVisible();
    await runCard(run).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(4);
    await expect(page.locator("#selection-bar")).toBeHidden();
    await expect(reviewTab).toContainText("4 need attention");
    expect(listReports(root).find((r) => r.run === secondRun)?.archived).toBe(true);
    expect(listReports(root).find((r) => r.run === run)?.archived).toBe(false);
    // A full 16-answer run expands in normal page flow, without a nested sidebar scroller.
    const fullRun = "sixteen-answer-run";
    const caseIds = Array.from({ length: 8 }, (_, index) => `layout-case-${index + 1}`);
    writeJson(join(directory(join(root, "tests/results/evals", fullRun)), "results.json"), {
      ...saved, startedAt: "2026-09-04T10:00:00Z", caseIds, repeats: 2, plannedCases: 16,
      results: caseIds.flatMap((caseId) => [1, 2].map((repetition) => ({ ...saved.results[0], caseId, repetition }))),
    });
    await page.reload();
    await expect(page.locator("#run-meta")).toContainText("8 cases × 2 repetitions = 16 planned · 16 answers saved");
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(16);
    for (const container of [page.locator("#answer-list"), page.locator(".review-sidebar")]) {
      await expect(container).toHaveCSS("max-height", "none");
      await expect(container).toHaveCSS("overflow-y", "visible");
      expect(await container.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    }
    const lastAnswer = page.getByRole("checkbox", { name: "Select layout-case-8 repetition 2", exact: true });
    await lastAnswer.scrollIntoViewIfNeeded();
    await expect(lastAnswer).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await page.locator(".review-sidebar").evaluate((element) => element.scrollTop)).toBe(0);
    await selectAll.check();
    await expect(page.locator("#selection-count")).toHaveText("16 selected");
    await page.screenshot({ path: testInfo.outputPath("dashboard-sixteen-answers.png"), fullPage: true });
    await page.getByRole("link", { name: "Run checks", exact: true }).click();
    await expect(page.locator("#selection-bar")).toBeHidden();
    await reviewTab.click();
    await expect(page.locator("#selection-bar")).toBeVisible();
    await expect(page.locator("#selection-count")).toHaveText("16 selected");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    // Long titles and metadata keep their navigation controls at smaller desktop widths.
    const longCaseId = `a-long-case-name-${"x".repeat(100)}`;
    const fullReport = loadReport(root, fullRun).report;
    writeJson(join(directory(join(root, "tests/results/evals", fullRun)), "results.json"), {
      ...fullReport, caseIds: [longCaseId, ...caseIds.slice(1)],
      results: fullReport.results.map((record) => record.caseId === caseIds[0] ? { ...record, caseId: longCaseId } : record),
    });
    await page.reload();
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(page.locator("#case-title")).toContainText(longCaseId);
    const titleBox = await page.locator("#case-title").boundingBox();
    const navigationBox = await page.getByRole("navigation", { name: "Answer navigation" }).boundingBox();
    expect(titleBox).not.toBeNull(); expect(navigationBox).not.toBeNull();
    expect(navigationBox!.y >= titleBox!.y + titleBox!.height || navigationBox!.x >= titleBox!.x + titleBox!.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator("#answer-list").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("dashboard-desktop-long-title.png"), fullPage: true });

    // Judge-first triage: current passes clear; failures and uncertainty stay visible.
    // All artifacts here are synthetic; no judge/model is actually launched.
    const triageRun = "judge-triage-run";
    const triageIds = ["clear", "fail", "unsure", "legacy", "unjudged", "blocked", "human"];
    writeJson(join(directory(join(root, "tests/results/evals", triageRun)), "results.json"), {
      ...saved, startedAt: "2026-09-04T11:00:00Z", caseIds: triageIds, repeats: 1, plannedCases: triageIds.length,
      results: triageIds.map((caseId) => ({ ...saved.results[0], caseId, repetition: 1, checks: { count: caseId !== "blocked" } })),
    });
    const triageHash = loadReport(root, triageRun).hash;
    for (const [caseId, verdict] of [["clear", "pass"], ["fail", "fail"], ["unsure", "needs-discussion"], ["legacy", "pass"], ["blocked", "pass"], ["human", "fail"]] as const) {
      saveReview(root, triageRun, triageHash, `${caseId}:1`, { type: "llm", model: "synthetic-judge", effort: "high",
        promptVersion: caseId === "legacy" ? "phase-one-meaning-v1" : JUDGE_PROMPT_VERSION, piVersion: "fixture", verdict, reason: `Saved evidence for ${caseId}.` });
    }
    saveReview(root, triageRun, triageHash, "human:1", { type: "human", reviewer: "Fixture reviewer", verdict: "pass", reason: "Human assessment stays separate." });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await expect(page.locator("#triage-summary")).toHaveText("2 not judged · 1 need review · 2 failures · 1 LLM-cleared · 1 human-passed");
    await expect(page.getByRole("button", { name: /^Needs attention/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(5);
    await expect(answer("clear:1")).toHaveCount(0);
    await expect(answer("legacy:1")).toContainText("Not judged");
    await answer("legacy:1").click();
    await expect(page.locator("#triage-reason")).toContainText("Older judge policy");
    await page.getByRole("button", { name: /^Failures/ }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(2);
    await answer("blocked:1").click();
    await expect(page.locator("#triage-chip")).toHaveText("Failed checks");
    await expect(page.locator("#triage-reason")).toContainText("count");
    await expect(page.locator("#llm-chip")).toHaveText("LLM advice: Pass");
    await page.getByRole("button", { name: "Spot-check a cleared answer", exact: true }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(1);
    await expect(answer("clear:1")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#triage-chip")).toHaveText("LLM-cleared");
    await expect(page.locator("#human-chip")).toHaveText("Not reviewed");
    expect(listReports(root).find((report) => report.run === triageRun)?.reviews.filter((review) => review.type === "human")).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("dashboard-judge-triage.png"), fullPage: true });
    // Judge run ignores the current display filter, but always shows the exact selection and asks for consent.
    await page.getByRole("button", { name: "Judge run…", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Judge 7 saved answers");
    await expect(page.locator("#confirm-selection")).toHaveText(triageIds.map((id) => `${id}:1`).join(", "));
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start run", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", run: triageRun, hash: triageHash, keys: triageIds.map((id) => `${id}:1`), consent: true });
    // A human can reject a spot-checked pass; the answer returns to Failures, not hidden clearance.
    await verdict("Fail").check(); await page.getByLabel("Reason", { exact: true }).fill("The judge missed a requirement.");
    await page.getByRole("button", { name: "Save verdict", exact: true }).click();
    await expect(page.locator("#no-answers")).toHaveText("No answers match this filter.");
    await expect(page.getByRole("button", { name: "Spot-check a cleared answer", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: /^Failures/ }).click();
    await expect(answer("clear:1")).toContainText("Human fail");
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(3);
    expect(loadReport(root, triageRun).hash).toBe(triageHash);
    expect(launches).toBe(0);
    expect(errors).toEqual([]);
  } finally { await page.close(); dashboard.stop(); dashboard.server.closeAllConnections(); rmSync(root, { recursive: true, force: true }); }
});
