import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { ArchitectureCanvas } from "../../../src/components/server-guy/architecture-canvas";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import { stackOf } from "../../../src/server/application-stack";

it("does not label an unobserved node verified just because deployment is live", () => {
  const state = richScenario.initial();
  expect(state.deployment?.status).toBe("live");
  const html = renderToStaticMarkup(
    <ArchitectureCanvas
      application={state.application}
      deployment={state.deployment}
      stack={stackOf(state.deployment)}
      facts={{}}
    />,
  );
  expect(html).toContain("PostgreSQL");
  expect(html).toContain("Valkey");
  expect(html).not.toContain('fill="#267c58"');
});

it("keeps observed failures visible alongside passing checks", () => {
  const state = richScenario.initial();
  state.facts.monitoring!.checks.find((check) => check.kind === "http")!.state =
    "failing";
  const html = renderToStaticMarkup(
    <ArchitectureCanvas
      application={state.application}
      deployment={state.deployment}
      stack={stackOf(state.deployment)}
      facts={state.facts}
    />,
  );
  expect(html).toContain('fill="#c1524a"');
  expect(html).toContain('fill="#267c58"');
});
