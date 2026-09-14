// Which run "How it got here" tells the story of.
//
// The heading names a revision, so the phases under it have to be the
// commands that put that revision there. A release record cites the commands
// it was written from, and every command carries its run, so the page never
// has to guess — but it used to, whenever the record cited no message, and
// the guess was "whatever ran most recently".

import { expect, it, describe } from "vitest";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import { deploymentFromRecords } from "@/components/server-guy/deployment-records";

const APP = "11111111-2222-4333-8444-555555555555";
const DEPLOY_RUN = "aaaaaaaa-0000-4000-8000-000000000001";
const LATER_RUN = "bbbbbbbb-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-09-14T17:10:00.000Z");

function execution(input: {
  id: string;
  runId: string;
  at: string;
  command: string;
}): ExecutionRecord {
  return {
    id: input.id,
    applicationId: APP,
    chatId: "cccccccc-0000-4000-8000-000000000003",
    runId: input.runId,
    tool: "server_bash",
    target: "root@203.0.113.10",
    input: JSON.stringify({ command: input.command }),
    mode: "pi-decides",
    status: "succeeded",
    output: "",
    createdAt: input.at,
    finishedAt: input.at,
  } as unknown as ExecutionRecord;
}

/** The four commands the release was written from, and one later turn. */
const deployCommands = [
  execution({
    id: "dddddddd-0000-4000-8000-000000000011",
    runId: DEPLOY_RUN,
    at: "2026-09-14T16:37:00.000Z",
    command: "docker compose up -d",
  }),
  execution({
    id: "dddddddd-0000-4000-8000-000000000012",
    runId: DEPLOY_RUN,
    at: "2026-09-14T16:46:00.000Z",
    command: "curl -fsS http://127.0.0.1:8000/health",
  }),
];
const reopenCommand = execution({
  id: "eeeeeeee-0000-4000-8000-000000000021",
  runId: LATER_RUN,
  at: "2026-09-14T17:00:00.000Z",
  command: "ssh -O check",
});

function release(evidence: SavedInformation["evidence"]): SavedInformation {
  return {
    id: "ffffffff-0000-4000-8000-000000000031",
    applicationId: APP,
    title: "Shop revision 4e31d1df is deployed",
    body: "",
    evidence,
    establishedAt: "2026-09-14T16:46:10.000Z",
    presentation: {
      views: ["deployment"],
      role: "outcome",
      status: "verified",
      checks: [],
      content: {
        kind: "deployment",
        revision: "4e31d1df",
        image: "shop:latest",
      },
    },
    createdAt: "2026-09-14T16:46:10.000Z",
    updatedAt: "2026-09-14T16:46:10.000Z",
    retiredAt: null,
  } as unknown as SavedInformation;
}

function story(record: SavedInformation, executions: ExecutionRecord[]) {
  return deploymentFromRecords({
    records: [record],
    executions,
    applicationName: "Shop",
    now: NOW,
  });
}

describe("the run behind a release's phases", () => {
  it("uses the commands the record cites, not the newest turn", () => {
    const record = release(
      deployCommands.map((item) => ({ type: "execution", id: item.id })),
    );
    const built = story(record, [...deployCommands, reopenCommand]);
    expect(built.phases.map((phase) => phase.id)).toEqual(
      deployCommands.map((item) => item.id),
    );
    // The later turn belongs to the work that reopened access, and saying it
    // is how this revision got here is simply untrue.
    expect(built.phases.map((phase) => phase.id)).not.toContain(
      reopenCommand.id,
    );
  });

  it("prefers the cited message when there is one", () => {
    const record = release([
      { type: "message", id: LATER_RUN },
      ...deployCommands.map((item) => ({
        type: "execution" as const,
        id: item.id,
      })),
    ]);
    // A message names the run directly; it is the better citation and wins.
    expect(
      story(record, [...deployCommands, reopenCommand]).phases,
    ).toHaveLength(1);
  });

  it("falls back to the newest run only when the record cites nothing", () => {
    const built = story(release([]), [...deployCommands, reopenCommand]);
    expect(built.phases.map((phase) => phase.id)).toEqual([reopenCommand.id]);
  });
});
