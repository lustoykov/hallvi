import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboard } from "../dashboard/server";
import { directory, listReports, loadReport, writeJson } from "../dashboard/results";

test("dashboard reviews saved answers without model calls or changing source results", async ({ page }, testInfo) => {
  const root = mkdtempSync(join(tmpdir(), "sg-dashboard-e2e-"));
  let launches = 0;
  const dashboard = createDashboard(root, () => { launches++; throw new Error("No runner allowed in this fixture"); });
  const run = "synthetic-run";
  writeJson(join(directory(join(root, "tests/results/evals", run)), "results.json"), {
    model: "synthetic", effort: "high", startedAt: "2026-09-04T09:00:00Z", commit: "test", dirty: false, sourceFingerprints: {},
    results: [{ caseId: "question", repetition: 1, rubric: "Discuss without pretending a choice was made", outcome: "checks-passed", checks: { count: true },
      error: null, input: { userMessage: "Should I prioritize simplicity?" }, reply: { message: "<script>window.bad=true</script> Let’s discuss the tradeoff.", decisionProposals: [] }, before: {}, after: {} },
    { caseId: "greeting", repetition: 1, rubric: "Greet without a Decision", outcome: "checks-passed", checks: { count: true },
      error: null, input: { userMessage: "Hello" }, reply: { message: "Hello", decisionProposals: [] }, before: {}, after: {} }],
  });
  const hash = loadReport(root, run).hash;
  dashboard.server.listen(0, "127.0.0.1"); await once(dashboard.server, "listening");
  const address = dashboard.server.address(); if (!address || typeof address === "string") throw new Error("No address");
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("row")).toHaveCount(5);
    await page.screenshot({ path: testInfo.outputPath("dashboard-runs.png"), fullPage: true });
    await page.getByRole("button", { name: "Configure run…" }).click();
    await expect(page.getByRole("dialog")).toContainText("8 real Server Guy agent turns");
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Start run", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Configure run…" })).toBeFocused();
    await page.getByRole("button", { name: /Review answers/ }).click();
    await expect(page.locator("#answer")).toContainText("<script>window.bad=true</script>");
    await page.getByLabel("Reviewer", { exact: true }).fill("Fixture reviewer");
    await page.getByRole("combobox", { name: "Verdict", exact: true }).selectOption("needs-discussion");
    await page.getByLabel("Reason", { exact: true }).fill("Please clarify the intended behavior.");
    await expect(page.locator("#saved")).toHaveText("Unsaved changes");
    await page.getByRole("button", { name: "greeting / 1 Human: pending", exact: true }).click();
    await expect(page.getByRole("button", { name: "greeting / 1 Human: pending", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "question / 1 Human: pending", exact: true }).click();
    await expect(page.getByRole("button", { name: "question / 1 Human: pending", exact: true })).toBeFocused();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.getByRole("combobox", { name: "Verdict", exact: true })).toHaveValue("needs-discussion");
    await page.screenshot({ path: testInfo.outputPath("dashboard-unsaved-review.png"), fullPage: true });
    await page.getByRole("button", { name: "Save human review" }).click();
    await expect(page.locator("#saved")).toContainText("Saved");
    await page.reload();
    await page.getByRole("button", { name: /Review answers/ }).click();
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("Please clarify the intended behavior.");
    await expect(page.getByRole("combobox", { name: "Verdict", exact: true })).toHaveValue("needs-discussion");
    await page.screenshot({ path: testInfo.outputPath("dashboard-review.png"), fullPage: true });
    await page.getByText("Ask an LLM judge · uses subscription", { exact: true }).click();
    await page.getByLabel("Judge model", { exact: true }).fill("gpt-5.6-luna");
    await page.getByRole("button", { name: "Review this answer with LLM…" }).click();
    await expect(page.getByRole("dialog")).toContainText("gpt-5.6-luna / high");
    await expect(page.getByRole("dialog")).toContainText("one saved answer (question:1)");
    await page.getByRole("dialog").press("Escape");
    expect(launches).toBe(0); expect(loadReport(root, run).hash).toBe(hash);
    expect(listReports(root)[0].reviews.map((r) => r.type)).toEqual(["human"]);
    expect(errors).toEqual([]);
  } finally { await page.close(); dashboard.stop(); dashboard.server.closeAllConnections(); rmSync(root, { recursive: true, force: true }); }
});
