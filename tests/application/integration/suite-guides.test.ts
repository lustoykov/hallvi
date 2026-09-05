import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { suites } from "../../dashboard/server";
import { suiteGuides } from "../../dashboard/suite-guides";

it("every suite has the same explanation fields and real source pointers", () => {
  expect(Object.keys(suiteGuides).sort()).toEqual(
    suites.map((suite) => suite.id).sort(),
  );
  for (const suite of suites) {
    const guide = suiteGuides[suite.id];
    for (const key of [
      "purpose",
      "execution",
      "real",
      "mocked",
      "isolation",
      "checks",
      "limits",
      "artifacts",
    ] as const) {
      expect(guide[key].trim().length, `${suite.id}: ${key}`).toBeGreaterThan(
        0,
      );
    }
    for (const path of guide.sources) expect(existsSync(path), path).toBe(true);
  }
});
