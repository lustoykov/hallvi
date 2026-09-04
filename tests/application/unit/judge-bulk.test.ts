import { expect, it, vi } from "vitest";
import { judgeCaseKeys, judgeSelectedAnswers } from "../../evals/judge";

it("validates a bounded explicit saved-answer selection", () => {
  expect(judgeCaseKeys('["greeting:1","greeting:2"]')).toEqual(["greeting:1", "greeting:2"]);
  expect(judgeCaseKeys(undefined, "greeting:1")).toEqual(["greeting:1"]);
  for (const value of ["[]", '["greeting:1","greeting:1"]', '["../outside:1"]', "not-json"]) expect(() => judgeCaseKeys(value)).toThrow();
});
it("judges sequentially and never proceeds or retries after a failure", async () => {
  const completed: string[] = [];
  const judge = vi.fn(async (key: string) => {
    if (key === "greeting:2") throw new Error("synthetic failure");
    await Promise.resolve(); completed.push(key);
  });
  await expect(judgeSelectedAnswers(["greeting:1", "greeting:2", "greeting:3"], judge)).rejects.toThrow("synthetic failure");
  expect(completed).toEqual(["greeting:1"]);
  expect(judge.mock.calls.flat()).toEqual(["greeting:1", "greeting:2"]);
});
