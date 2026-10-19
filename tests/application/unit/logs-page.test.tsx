import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { LogsPage } from "@/components/hallvi/logs-page";
import { historyFromRecords } from "@/components/hallvi/history-records";
import type { ExecutionRecord } from "@/server/operator-execution";

const AT = "2026-10-19T12:00:00.000Z";
const command = (
  id: string,
  status: ExecutionRecord["status"],
): ExecutionRecord => ({
  id,
  applicationId: "app",
  chatId: "chat",
  runId: "run",
  tool: "bash",
  input: JSON.stringify({ command: `echo ${id}` }),
  target: "local",
  mode: "always-ask",
  status,
  output: `${id} output`,
  exitCode: status === "succeeded" ? 0 : 1,
  createdAt: AT,
  finishedAt: AT,
});

it("keeps successful command output without offering a nonexistent History event", () => {
  const executions = [
    command("standalone", "succeeded"),
    command("failure", "failed"),
  ];
  const html = renderToStaticMarkup(
    <LogsPage
      executions={executions}
      now={Date.parse(AT)}
      onAsk={() => undefined}
      onOpenDestination={() => undefined}
    />,
  );
  expect(html).toContain("standalone output");
  expect(html).toContain("failure output");
  expect(
    historyFromRecords({ records: [], executions }).map((row) => row.id),
  ).toEqual(["execution:failure"]);
  expect(html.match(/See it in History/g)).toHaveLength(1);
  expect(html).not.toContain("Each of these also sits on the event");
});
