import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRun, directory, findCase, humanReviewSchema, listReports, loadReport, readJson, saveHumanReviews, saveReview, writeJson } from "../../dashboard/results";

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
  // Reviews saved in the same millisecond have no guaranteed relative order.
  expect(listReports(root)[0].reviews.map((r) => r.type).sort()).toEqual(["human", "llm"]);
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
it("preserves run counts and distinguishes planned cases from available answers", () => {
  const { root, path } = fixture();
  writeJson(join(path, "results.json"), { ...readJson(join(path, "results.json")), caseIds: ["greeting", "hypothetical"], repeats: 2, plannedCases: 4 });
  expect(listReports(root)[0]).toMatchObject({ caseIds: ["greeting", "hypothetical"], repeats: 2, plannedCases: 4 });
  expect(listReports(root)[0].results).toHaveLength(1);
});
it("validates the whole bulk selection before writing human verdicts", () => {
  const { root, run, path } = fixture();
  const original = readJson(join(path, "results.json"));
  original.results.push({ ...original.results[0], repetition: 2 });
  writeJson(join(path, "results.json"), original);
  const hash = loadReport(root, run).hash;
  const review = { reviewer: "Test", verdict: "needs-discussion" as const, reason: "Shared reason" };
  expect(() => saveHumanReviews(root, run, hash, ["greeting:1", "unknown:1"], review)).toThrow();
  expect(() => saveHumanReviews(root, run, "stale", ["greeting:1"], review)).toThrow();
  expect(listReports(root)[0].reviews).toEqual([]);
  expect(saveHumanReviews(root, run, hash, ["greeting:1", "greeting:2"], review)).toEqual({ saved: ["greeting:1", "greeting:2"], failed: [] });
  expect(listReports(root)[0].reviews.map((r) => r.type)).toEqual(["human", "human"]);
  expect(loadReport(root, run).hash).toBe(hash);
});
it("archives and restores a whole run without altering evidence or saved verdicts", () => {
  const { root, run, hash } = fixture();
  saveReview(root, run, hash, "greeting:1", { type: "human", reviewer: "Test", verdict: "pass", reason: "Read it" });
  const reviews = listReports(root)[0].reviews;
  expect(archiveRun(root, run, hash, true)).toEqual({ archived: true });
  expect(listReports(root)[0].archived).toBe(true);
  expect(archiveRun(root, run, hash, true)).toEqual({ archived: true });
  expect(archiveRun(root, run, hash, false)).toEqual({ archived: false });
  expect(listReports(root)[0]).toMatchObject({ archived: false, archiveError: false, reviews });
  expect(loadReport(root, run).hash).toBe(hash);
});
it("rejects invalid run archival and ignores metadata for a different source hash", () => {
  const { root, run, path, hash } = fixture();
  expect(() => archiveRun(root, "unknown", hash, true)).toThrow("Unknown eval run");
  expect(() => archiveRun(root, "../outside", hash, true)).toThrow();
  expect(() => archiveRun(root, run, hash, "true" as never)).toThrow();
  expect(() => archiveRun(root, run, "stale", true)).toThrow("Results changed");
  expect(listReports(root)[0].archived).toBe(false);
  writeJson(join(path, "run-state.json"), { sourceHash: "old-results", archived: true });
  expect(listReports(root)[0].archived).toBe(false);
});
it("keeps reports visible but blocks writes when archive metadata is malformed or symlinked", () => {
  const { root, run, path, hash } = fixture();
  const archive = join(path, "run-state.json");
  writeJson(archive, { sourceHash: hash, archived: "broken" });
  expect(listReports(root)[0]).toMatchObject({ archiveError: true, archived: false });
  expect(() => archiveRun(root, run, hash, true)).toThrow();
  rmSync(archive);
  symlinkSync(join(path, "results.json"), archive);
  expect(listReports(root)[0]).toMatchObject({ archiveError: true, archived: false });
  expect(() => archiveRun(root, run, hash, false)).toThrow();
  expect(loadReport(root, run).hash).toBe(hash);
});
it("can archive failed or empty runs without reviewable answers", () => {
  const { root, run, path } = fixture();
  const original = readJson(join(path, "results.json"));
  original.results[0].reply = null; original.results[0].input = null;
  original.results[0].outcome = "not-run";
  writeJson(join(path, "results.json"), original);
  expect(archiveRun(root, run, loadReport(root, run).hash, true)).toEqual({ archived: true });
  writeJson(join(path, "results.json"), { ...original, results: [] });
  expect(archiveRun(root, run, loadReport(root, run).hash, true)).toEqual({ archived: true });
});
