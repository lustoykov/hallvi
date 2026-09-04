import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { directory, findCase, humanReviewSchema, listReports, loadReport, saveReview, writeJson } from "./dashboard/results";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sg-results-test-")); roots.push(root);
  const run = "sample-run";
  const path = directory(join(root, "tests/results/evals", run));
  writeJson(join(path, "results.json"), {
    model: "synthetic", effort: "high", startedAt: "2026-09-04", commit: "test", dirty: false, sourceFingerprints: {},
    results: [{ caseId: "greeting", repetition: 1, rubric: "No invented choice", outcome: "checks-passed", checks: { count: true },
      error: null, input: { userMessage: "Hello" }, reply: { message: "Hello", decisionProposals: [] }, before: {}, after: {} }],
  });
  return { root, run, path, hash: loadReport(root, run).hash };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("keeps human and advisory LLM verdicts separate, without mutating the original report", () => {
  const { root, run, hash } = fixture();
  saveReview(root, run, hash, "greeting:1", { type: "human", reviewer: "Test reviewer", verdict: "fail", reason: "Misleading claim" });
  saveReview(root, run, hash, "greeting:1", { type: "llm", model: "synthetic", effort: "low", promptVersion: "test", piVersion: "test", verdict: "pass", reason: "Looks correct" });
  expect(loadReport(root, run).hash).toBe(hash);
  expect(listReports(root)[0].reviews.map((r) => r.type)).toEqual(["human", "llm"]);
});
it("rejects stale results, fabricated cases and path traversal", () => {
  const { root, run, hash } = fixture();
  expect(() => loadReport(root, "../outside")).toThrow();
  expect(() => findCase(root, run, "old-hash", "greeting:1")).toThrow("Results changed");
  expect(() => findCase(root, run, hash, "fabricated:1")).toThrow();
  expect(humanReviewSchema.safeParse({ reviewer: "", verdict: "pass", reason: "" }).success).toBe(false);
});
it("does not follow symlinked reports", () => {
  const { root, path } = fixture();
  symlinkSync(path, join(root, "tests/results/evals", "linked"));
  expect(() => loadReport(root, "linked")).toThrow();
  expect(listReports(root)).toHaveLength(1);
});
