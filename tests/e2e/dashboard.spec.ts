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
  const verdict = (name: string) => page.locator("#verdict").getByRole("button", { name, exact: true });
  const filterCount = (filter: string) => page.locator(`.filters [data-filter="${filter}"] span`);
  const startButton = page.getByRole("button", { name: /^Start (run|judging)$/ });
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
    await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Run checks", exact: true })).toHaveAttribute("aria-current", "page");
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
    // A live run is one confirmation: settings shown, judging afterwards on by default.
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
    await expect(page.getByRole("dialog", { name: "Run 2 cases", exact: true })).toBeVisible();
    await expect(page.locator("#confirm-description")).toContainText("2 cases × 2 repetitions = 4 planned answers");
    await expect(page.locator("#confirm-model")).toHaveText("gpt-5.6-sol");
    await expect(page.locator("#confirm-effort")).toHaveText("high");
    await expect(page.getByRole("checkbox", { name: "Judge the answers automatically when the run finishes" })).toBeChecked();
    await expect(page.locator("#settings-fields")).toBeHidden();
    await expect(startButton).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review and run live evals…" })).toBeFocused();
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Review and run live evals…" }).click();
    await startButton.click();
    await expect.poll(() => requests.at(-1)).toEqual({ suite: "live", cases: ["greeting", "hypothetical"], repeats: 2, consent: true, judgeAfter: true, model: "gpt-5.6-sol", effort: "high" });

    // Review: the newest run opens with its first answer needing attention; repetitions of a case sit together.
    await expect(reviewTab).toContainText("4 need attention");
    await reviewTab.click();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/evals`);
    await expect(page).toHaveTitle("Eval runs · Server Guy Testing");
    await expect(page.locator("#runs-panel")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: /Eval runs/ })).toHaveAttribute("aria-current", "page");
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
    await expect(page.locator("#progress-text")).toHaveText("4 need attention · 0 of 4 human-reviewed");
    // Judging a run defaults to its unjudged answers, with one step to start.
    await page.getByRole("button", { name: "Judge 4 unjudged answers…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Judge 4 unjudged answers", exact: true })).toBeVisible();
    await expect(page.locator("#confirm-selection")).toHaveText("question:1, question:2, greeting:1, greeting:2");
    await expect(page.locator("#confirm-description")).toContainText("Server Guy is not rerun");
    await expect(page.locator("#judge-after-row")).toBeHidden();
    await expect(page.getByRole("button", { name: "Start judging", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Judge 4 unjudged answers…", exact: true })).toBeFocused();
    await expect(page.getByText(/not browser test results/)).toBeVisible();
    await expect(page.locator("#answer-list .answer-group")).toHaveText(["question", "Ordinary greeting"]);
    await expect(page.locator("#answer-list .answer-open")).toHaveText([/^Repetition 1/, /^Repetition 2/, /^Repetition 1/, /^Repetition 2/]);
    await expect(page.locator("#run-repeats")).toContainText("answered 2 times");
    await expect(answer("question:1")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#answer")).toContainText("<script>window.bad=true</script>");
    // Rerun one current case once, even when the picker and saved run use two repetitions.
    // Old/removed case IDs remain readable but cannot start a different case accidentally.
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeHidden();
    await expect(page.locator("#rerun-unavailable")).toBeVisible();
    await answer("greeting:1").click();
    const beforeRerun = requests.length;
    await page.getByRole("button", { name: "Run case again…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Run Ordinary greeting", exact: true })).toBeVisible();
    await expect(page.locator("#confirm-description")).toContainText("1 case × 1 repetition = 1 planned answer");
    await expect(page.locator("#confirm-description")).toContainText("existing answers and reviews stay unchanged");
    await expect(page.locator("#confirm-selection")).toHaveText("greeting");
    await page.screenshot({ path: testInfo.outputPath("dashboard-single-case-rerun.png"), fullPage: true });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(requests).toHaveLength(beforeRerun);
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Run case again…", exact: true }).click();
    await page.getByRole("checkbox", { name: "Judge the answers automatically when the run finishes" }).uncheck();
    await startButton.click();
    await expect.poll(() => requests.at(-1)).toEqual({ suite: "live", cases: ["greeting"], repeats: 1, consent: true, judgeAfter: false, model: "gpt-5.6-sol", effort: "high" });
    expect(loadReport(root, run).hash).toBe(hash);
    // One click is a verdict; a note is optional and survives switching pages until it is saved.
    await answer("question:1").click();
    await expect(page.locator("#note-field")).toBeHidden();
    await page.getByRole("button", { name: "Add a note", exact: true }).click();
    await page.getByLabel("Note", { exact: true }).fill("Please clarify the intended behavior.");
    await page.getByRole("link", { name: "Run checks", exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/`);
    await reviewTab.click();
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.locator("#saved")).toHaveText("Not reviewed yet");
    await verdict("Discuss").click();
    await expect(page.locator("#case-title")).toHaveText("question · repetition 2 of 2");
    await expect(answer("question:1")).toContainText("Needs review");
    await expect(page.locator("#progress-text")).toHaveText("4 need attention · 1 of 4 human-reviewed");
    await expect(reviewTab).toContainText("4 need attention");
    // Keyboard verdicts advance the queue; a pass leaves Attention.
    await page.keyboard.press("p");
    await expect(page.locator("#case-title")).toHaveText("Ordinary greeting · repetition 1 of 2");
    await expect(answer("question:2")).toHaveCount(0);
    await expect(page.locator("#progress-text")).toHaveText("3 need attention · 2 of 4 human-reviewed");
    await page.keyboard.press("k");
    await expect(page.locator("#case-title")).toHaveText("question · repetition 1 of 2");
    await expect(verdict("Discuss")).toHaveAttribute("aria-pressed", "true");
    await expect(verdict("Pass")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.locator("#saved")).toContainText("Saved");
    await page.screenshot({ path: testInfo.outputPath("dashboard-verdict.png"), fullPage: true });
    // LLM advice is displayed beside the saved human verdict without changing it.
    saveReview(root, run, hash, "question:1", { type: "llm", model: "synthetic-judge", effort: "high", promptVersion: "fixture", piVersion: "fixture", verdict: "pass", reason: "The reply discusses the tradeoff without recording an invented choice." });
    await page.reload();
    await expect(page).toHaveURL(`http://127.0.0.1:${address.port}/evals`);
    await expect(verdict("Discuss")).toHaveAttribute("aria-pressed", "true");
    const advice = page.getByRole("region", { name: "LLM judgment", exact: true });
    await expect(advice).toContainText("without recording an invented choice");
    await expect(page.locator("#judge-verdict")).toHaveText("Pass");
    await expect(page.locator("#triage-chip")).toHaveText("Needs review");
    await expect(page.locator("#verdict .verdict-button.pass .llm-tag")).toBeVisible();
    await expect(answer("question:1")).toContainText("LLM advice: Pass");
    await page.screenshot({ path: testInfo.outputPath("dashboard-review.png"), fullPage: true });
    // One answer can be judged on its own from its judgment section.
    await advice.getByRole("button", { name: "Judge again…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Judge this answer", exact: true })).toBeVisible();
    await expect(page.locator("#confirm-selection")).toHaveText("question:1");
    await page.getByRole("button", { name: "Start judging", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", keys: ["question:1"], consent: true, hash });
    // Working through the queue is a keypress per answer.
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(3);
    for (const remaining of [2, 1, 0]) {
      await page.keyboard.press("p");
      await expect(page.locator("#answer-list .answer-open")).toHaveCount(remaining);
    }
    await expect(page.locator("#no-answers")).toContainText("Nothing needs attention");
    await expect(page.locator("#progress-text")).toHaveText("Nothing needs attention · 4 of 4 human-reviewed");
    await expect(reviewTab).not.toContainText("need attention");
    // Grading an answer yourself never counts as judging it: all four still lack a current-policy judgment.
    await page.getByRole("button", { name: "Judge 4 unjudged answers…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Judge 4 unjudged answers", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Model", { exact: true }).fill("gpt-5.6-luna");
    await expect(page.locator("#confirm-model")).toHaveText("gpt-5.6-luna");
    await page.getByRole("button", { name: "Start judging", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", keys: ["question:1", "question:2", "greeting:1", "greeting:2"], consent: true, hash, model: "gpt-5.6-luna" });
    await page.reload();
    await page.getByRole("button", { name: /^All/ }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath("dashboard-all-reviewed.png"), fullPage: true });
    // Archive moves the whole run, keeps it readable, and a failed request keeps the selection.
    await page.route("**/api/runs/archive", (route) => route.fulfill({ status: 400, json: { error: "Results changed. Reload before archiving." } }), { times: 1 });
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#error")).toContainText("Results changed");
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#archived-list").locator(runCard(run))).toBeVisible();
    await expect(page.locator("#no-active-runs")).toBeVisible();
    await expect(page.locator("#run-archived")).toBeVisible();
    await expect(page.locator("#bulk-result")).toContainText("Run archived");
    await page.reload();
    await expect(page.locator("#archived-runs")).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Restore run", exact: true }).click();
    await expect(page.locator("#run-list").locator(runCard(run))).toBeVisible();
    await expect(page.locator("#archived-runs")).toBeHidden();
    await expect(page.locator("#empty-answers")).toBeVisible();
    expect(launches).toBe(0); expect(loadReport(root, run).hash).toBe(hash);
    const savedReviews = listReports(root)[0].reviews;
    expect(savedReviews.filter((r) => r.type === "human")).toHaveLength(5);
    expect(savedReviews.filter((r) => r.type === "llm")).toHaveLength(1);
    expect(savedReviews.find((r) => r.type === "human" && r.key === "question:1")).toMatchObject({ verdict: "needs-discussion", reason: "Please clarify the intended behavior." });
    expect(savedReviews.filter((r) => r.type === "human").every((r) => r.reviewer.length > 0)).toBe(true);
    // An older run with a failed answer: selection stays inside one run, failed answers can't be selected.
    const secondRun = "other-synthetic-run";
    const saved = loadReport(root, run).report;
    writeJson(join(directory(join(root, "tests/results/evals", secondRun)), "results.json"), {
      ...saved, startedAt: "2026-09-03T09:00:00Z", caseIds: ["greeting"], plannedCases: 2,
      results: saved.results.filter((c) => c.caseId === "greeting").map((c) => c.repetition === 1 ? c : { ...c, input: null, reply: null, outcome: "not-run" }),
    });
    await expect(page.locator("#run-list .run-card")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("dashboard-two-runs.png"), fullPage: true });
    await runCard(secondRun).click();
    await expect(page.getByRole("button", { name: "Judge 1 unjudged answer…", exact: true })).toBeEnabled();
    await answer("greeting:2").click();
    await expect(page.locator("#unreviewable")).toBeVisible();
    await expect(page.locator("#verdict")).toBeHidden();
    await expect(page.getByRole("button", { name: "Judge this answer…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run case again…", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Archive run", exact: true }).click();
    await expect(page.locator("#archived-list").locator(runCard(secondRun))).toBeVisible();
    await runCard(run).click();
    await expect(filterCount("all")).toHaveText("4");
    await expect(reviewTab).not.toContainText("need attention");
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
    const lastAnswer = answer("layout-case-8:2");
    await lastAnswer.scrollIntoViewIfNeeded();
    await expect(lastAnswer).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await page.locator(".review-sidebar").evaluate((element) => element.scrollTop)).toBe(0);
    await lastAnswer.click();
    await page.screenshot({ path: testInfo.outputPath("dashboard-sixteen-answers.png"), fullPage: true });
    await page.getByRole("link", { name: "Run checks", exact: true }).click();
    await reviewTab.click();
    await expect(answer("layout-case-8:2")).toHaveAttribute("aria-current", "true");
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
    for (const [caseId, verdictValue] of [["clear", "pass"], ["fail", "fail"], ["unsure", "needs-discussion"], ["legacy", "pass"], ["blocked", "pass"], ["human", "fail"]] as const) {
      saveReview(root, triageRun, triageHash, `${caseId}:1`, { type: "llm", model: "synthetic-judge", effort: "high",
        promptVersion: caseId === "legacy" ? "phase-one-meaning-v1" : JUDGE_PROMPT_VERSION, piVersion: "fixture", verdict: verdictValue, reason: `Saved evidence for ${caseId}.` });
    }
    saveReview(root, triageRun, triageHash, "human:1", { type: "human", reviewer: "Fixture reviewer", verdict: "pass", reason: "Human assessment stays separate." });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    for (const [filter, count] of [["attention", "5"], ["failures", "2"], ["cleared", "1"], ["reviewed", "1"], ["all", "7"]]) {
      await expect(filterCount(filter)).toHaveText(count);
    }
    await expect(page.locator("#progress-text")).toHaveText("5 need attention · 1 LLM-cleared · 1 of 7 human-reviewed · judge agreed 0 of 1");
    await page.getByRole("button", { name: /^Reviewed/ }).click();
    await answer("human:1").click();
    await expect(page.locator("#triage-reason")).toHaveText("The judge said fail; your verdict wins.");
    await page.getByRole("button", { name: /^Attention/ }).click();
    await expect(page.getByRole("button", { name: /^Attention/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(5);
    await expect(answer("clear:1")).toHaveCount(0);
    await expect(answer("legacy:1")).toContainText("Not judged");
    await answer("legacy:1").click();
    await expect(page.locator("#triage-reason")).toContainText("Older judge policy");
    await page.getByRole("button", { name: /^Failed/ }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(2);
    await answer("blocked:1").click();
    await expect(page.locator("#triage-chip")).toHaveText("Failed checks");
    await expect(page.locator("#triage-reason")).toContainText("count");
    await expect(page.locator("#judge-verdict")).toHaveText("Pass");
    await page.getByRole("button", { name: /^Cleared/ }).click();
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(1);
    await answer("clear:1").click();
    await expect(page.locator("#triage-chip")).toHaveText("LLM-cleared");
    await expect(page.locator("#saved")).toHaveText("Not reviewed yet");
    expect(listReports(root).find((report) => report.run === triageRun)?.reviews.filter((review) => review.type === "human")).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("dashboard-judge-triage.png"), fullPage: true });
    // Judging the run targets only what the current policy has not judged, regardless of the display filter.
    await page.getByRole("button", { name: "Judge 2 unjudged answers…", exact: true }).click();
    await expect(page.locator("#confirm-selection")).toHaveText("legacy:1, unjudged:1");
    await page.getByRole("button", { name: "Start judging", exact: true }).click();
    await expect.poll(() => requests.at(-1)).toMatchObject({ suite: "judge", run: triageRun, hash: triageHash, keys: ["legacy:1", "unjudged:1"], consent: true });
    // A human can reject a spot-checked pass; the answer returns to Failed, not hidden clearance.
    await verdict("Fail").click();
    await expect(page.locator("#no-answers")).toHaveText("No answers match this filter.");
    await expect(filterCount("cleared")).toHaveText("0");
    await page.getByRole("button", { name: /^Failed/ }).click();
    await expect(answer("clear:1")).toContainText("Human fail");
    await expect(page.locator("#answer-list .answer-open")).toHaveCount(3);
    expect(loadReport(root, triageRun).hash).toBe(triageHash);
    expect(launches).toBe(0);
    expect(errors).toEqual([]);
  } finally { await page.close(); dashboard.stop(); dashboard.server.closeAllConnections(); rmSync(root, { recursive: true, force: true }); }
});
