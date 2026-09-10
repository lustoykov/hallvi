import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProcessesView } from "../../../src/components/server-guy/views/processes-view";
import { ArchitectureCanvas } from "../../../src/components/server-guy/architecture-canvas";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import { stackOf } from "../../../src/server/application-stack";
import { queuePlan } from "../../fixtures/queue-worker/plan";

it("shows a broker and a worker with historical readiness, without claiming all processes are healthy", () => {
  const state = richScenario.initial();
  const deployment = {
    ...state.deployment!,
    plan: queuePlan(),
    stack: undefined,
    serviceReadiness: {
      worker: {
        checkedAt: "2026-09-10T10:00:00Z",
        kind: "command" as const,
        imageId: "synthetic-image",
      },
    },
  };
  const stack = stackOf(deployment);
  const facts = {
    ...state.facts,
    monitoring: {
      ...state.facts.monitoring!,
      checks: state.facts.monitoring!.checks.filter((c) => c.target === "app"),
    },
  };
  const html = renderToStaticMarkup(
    <ProcessesView
      stack={stack}
      deployment={deployment}
      facts={facts}
      operations={[]}
      chats={[]}
      now={Date.now()}
      onOpenDestination={() => {}}
      onOpenConversation={() => {}}
      onAsk={() => {}}
    />,
  );
  expect(html).toContain("Broker");
  expect(stack.processes).toHaveLength(3);
  expect(html).toContain("Worker");
  expect(html).toContain("Passed readiness command at");
  expect(html).toContain("Some process checks are unavailable");
  expect(html).not.toContain("3 processes healthy");
});

it("does not let a passing first companion hide a failing later companion in Architecture", () => {
  const state = richScenario.initial();
  const deployment = {
    ...state.deployment!,
    plan: queuePlan(),
    stack: undefined,
  };
  const monitoring = {
    ...state.facts.monitoring!,
    checks: [
      {
        ...state.facts.monitoring!.checks[0],
        kind: "process" as const,
        target: "worker",
        state: "passing" as const,
      },
      {
        ...state.facts.monitoring!.checks[0],
        kind: "process" as const,
        target: "queue",
        state: "failing" as const,
      },
    ],
  };
  const html = renderToStaticMarkup(
    <ArchitectureCanvas
      application={state.application}
      deployment={deployment}
      stack={stackOf(deployment)}
      facts={{ monitoring }}
    />,
  );
  expect(html).toContain('fill="#c1524a"');
});
