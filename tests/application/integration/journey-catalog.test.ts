import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { browserJourneys } from "../../browser/journeys";

it("keeps dashboard journeys and CI scope in agreement with executable Playwright tests", () => {
  type Suite = { suites?: Suite[]; specs?: { tags: string[] }[] };
  const listed = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "node_modules/playwright/cli.js",
        "test",
        "--config",
        "tests/browser/playwright.config.ts",
        "--list",
        "--reporter=json",
      ],
      { encoding: "utf8" },
    ),
  ) as Suite;
  const specs = (suite: Suite): { tags: string[] }[] => [
    ...(suite.specs ?? []),
    ...(suite.suites?.flatMap(specs) ?? []),
  ];
  const tests = specs(listed);
  for (const test of tests) {
    const journeyTags = test.tags.filter((tag) => tag.startsWith("journey-"));
    expect(journeyTags).toHaveLength(1);
    expect(
      browserJourneys.some((item) => journeyTags[0] === `journey-${item.id}`),
    ).toBe(true);
  }
  for (const item of browserJourneys) {
    // Playwright's JSON reporter omits the leading @ from tags.
    const matches = tests.filter((test) =>
      test.tags.includes(`journey-${item.id}`),
    );
    expect(matches.length, item.id).toBeGreaterThan(0);
    for (const match of matches)
      expect(match.tags.includes("smoke"), item.id).toBe(item.smoke);
  }
});
