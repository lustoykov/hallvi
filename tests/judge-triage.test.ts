import { expect, it } from "vitest";
import { triageCase, type SavedCase } from "./dashboard/results";
import { JUDGE_PROMPT_VERSION } from "./evals/judge-policy";

const record: SavedCase = { caseId: "greeting", repetition: 1, rubric: "Greet without inventing a choice",
  input: { userMessage: "Hello" }, reply: { message: "Hello", decisionProposals: [] },
  outcome: "checks-passed", checks: { noDecisions: true }, error: null, before: {}, after: {} };
type Review = Parameters<typeof triageCase>[1][number];
const common = { key: "greeting:1", sourceHash: "hash", rubric: record.rubric, createdAt: "2026-09-04T10:00:00Z", reason: "Evidence against the rubric" };
const llm = (verdict: Review["verdict"], promptVersion = JUDGE_PROMPT_VERSION): Review => ({ ...common, type: "llm", verdict, promptVersion, model: "synthetic", effort: "high", piVersion: "fixture" });
const human = (verdict: Review["verdict"]): Review => ({ ...common, type: "human", verdict, reviewer: "Fixture reviewer" });

it("keeps unjudged and old-policy answers in attention; only current passes clear", () => {
  expect(triageCase(record, []).status).toBe("needs-judge");
  expect(triageCase(record, [llm("pass", "phase-one-meaning-v1")]).status).toBe("needs-judge");
  expect(triageCase(record, [llm("pass")]).status).toBe("cleared");
  expect(triageCase(record, [llm("fail")]).status).toBe("failures");
  expect(triageCase(record, [llm("needs-discussion")]).status).toBe("needs-review");
});
it.each(["checks-failed", "run-error", "not-run"] as const)("never clears %s, even with model and human passes", (outcome) => {
  expect(triageCase({ ...record, outcome }, [llm("pass"), human("pass")]).status).toBe("failures");
});
it("checks individual failures and saved errors independently of the outcome label", () => {
  expect(triageCase({ ...record, checks: { noDecisions: false } }, [llm("pass"), human("pass")]).status).toBe("failures");
  expect(triageCase({ ...record, error: "Turn rejected" }, [llm("pass")]).status).toBe("failures");
});
it("does not clear missing automatic evidence, input or reply", () => {
  for (const patch of [{ checks: {} }, { input: null }, { reply: null }]) {
    expect(triageCase({ ...record, ...patch }, [llm("pass")]).status).toBe("needs-review");
  }
});
it("keeps human decisions distinct, and a later LLM pass never overwrites them", () => {
  expect(triageCase(record, [human("fail"), llm("pass")]).status).toBe("failures");
  expect(triageCase(record, [human("needs-discussion"), llm("pass")]).status).toBe("needs-review");
  expect(triageCase(record, [human("pass"), llm("fail")]).status).toBe("reviewed");
  expect(triageCase(record, [human("fail"), human("pass")]).label).toBe("Human pass");
});
it("uses the latest judgment for the exact answer without mutating evidence", () => {
  const reviews = [llm("pass"), llm("fail"), { ...llm("pass"), key: "greeting:2" }];
  const before = JSON.stringify({ record, reviews });
  expect(triageCase(record, reviews).status).toBe("failures");
  expect(JSON.stringify({ record, reviews })).toBe(before);
});
