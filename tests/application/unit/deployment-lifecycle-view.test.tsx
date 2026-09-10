import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeploymentPanel } from "../../../src/components/server-guy/deployment-panel";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import {
  beginDeploymentAttempt,
  finishDeploymentAttempt,
  invalidateDeploymentRuntime,
} from "../../../src/server/deployment-lifecycle";
import { stackOf } from "../../../src/server/application-stack";

it("shows failed recreation separately from historical verification", () => {
  const record = richScenario.initial().deployment!;
  const attempt = beginDeploymentAttempt(
    record,
    "recreate",
    "synthetic-operation",
  );
  invalidateDeploymentRuntime(record);
  finishDeploymentAttempt(
    record,
    attempt.id,
    "failed",
    "Worker readiness did not pass",
  );
  const html = renderToStaticMarkup(
    <DeploymentPanel
      applicationId={record.applicationId}
      chatId={record.chatId}
      record={record}
      connected
      onRefresh={async () => {}}
    />,
  );
  // The panel heading states unknown runtime, not the historical verification.
  expect(html).toContain("<h2>Runtime needs verification</h2>");
  expect(html).toContain("Last verified revision");
  expect(html).toContain("Worker readiness did not pass");
  expect(html).toContain("2 deployment attempts");
  expect(html).toContain("1 release");
  expect(stackOf(record).processes.every((p) => p.state === "unknown")).toBe(
    true,
  );
});
