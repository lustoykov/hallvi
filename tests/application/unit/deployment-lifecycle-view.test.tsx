import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  expect(html).toContain("Runtime needs verification");
  expect(html).toContain("Last verified revision");
  expect(html).toContain("Worker readiness did not pass");
  expect(html).toContain("2 deployment attempts");
  expect(html).toContain("1 release");
  expect(html).not.toContain("<h2>Deployment verified</h2>");
  expect(stackOf(record).processes.every((p) => p.state === "unknown")).toBe(
    true,
  );
  if (process.env.SG_UI_PROOF_DIR) {
    const dir = process.env.SG_UI_PROOF_DIR;
    mkdirSync(dir, { recursive: true });
    const css = [
      "src/app/globals.css",
      "src/components/server-guy/application-shell.css",
      "src/components/server-guy/views.css",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    writeFileSync(
      join(dir, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deployment lifecycle · synthetic proof</title><style>${css}\nbody{padding:24px;font-family:Arial,sans-serif}.sg-adaptive-shell{max-width:900px;margin:auto;height:auto;display:block}.sg-section-content{padding:20px}</style></head><body><main class="sg-adaptive-shell"><div class="sg-section-content"><p>Synthetic UI proof · failed recreation</p>${html}</div></main></body></html>`,
    );
  }
});
