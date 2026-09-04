import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { browserJourneys } from "./e2e/journeys";

it("keeps dashboard journeys in one-to-one agreement with executable Playwright tests", () => {
  type Suite = { suites?: Suite[]; specs?: { tags: string[] }[] };
  const listed = JSON.parse(execFileSync(process.execPath, ["node_modules/playwright/cli.js", "test", "--config", "tests/e2e/playwright.config.ts", "--list", "--reporter=json"], { encoding: "utf8" })) as Suite;
  const specs = (suite: Suite): { tags: string[] }[] => [...suite.specs ?? [], ...suite.suites?.flatMap(specs) ?? []];
  const tests = specs(listed);
  expect(tests).toHaveLength(browserJourneys.length);
  for (const item of browserJourneys) {
    // Playwright's JSON reporter omits the leading @ from tags.
    const matches = tests.filter((test) => test.tags.includes(`journey-${item.id}`));
    expect(matches, item.id).toHaveLength(1);
    expect(matches[0].tags.includes("smoke"), item.id).toBe(item.smoke);
  }
});
