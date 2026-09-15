// What earns a row in a history.
//
// This page listed every execution as its own top-level event, so one
// deployment filled it with a dozen rows that each said a command had been
// run, and "what happened to my application" was somewhere underneath them.

import { describe, expect, it } from "vitest";

import { historyFromRecords } from "@/components/server-guy/history-records";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

const APP = "11111111-2222-4333-8444-555555555555";
const AT = "2026-09-15T12:00:00.000Z";

const record = (
  id: string,
  over: Record<string, unknown> = {},
  presentation: Record<string, unknown> = {},
): SavedInformation =>
  ({
    id,
    applicationId: APP,
    title: id,
    body: "",
    evidence: [],
    establishedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
    ...over,
    presentation: {
      views: ["history"],
      role: "outcome",
      status: "verified",
      checks: [],
      ...presentation,
    },
  }) as unknown as SavedInformation;

const execution = (
  id: string,
  status: ExecutionRecord["status"],
  at = AT,
): ExecutionRecord =>
  ({
    id,
    applicationId: APP,
    chatId: "c",
    runId: "r",
    tool: "server_bash",
    target: "root@host:22",
    input: JSON.stringify({ command: "docker compose up -d" }),
    mode: "pi-decides",
    status,
    output: "shop-web Started",
    createdAt: at,
    finishedAt: at,
  }) as ExecutionRecord;

describe("what earns a row in a history", () => {
  it("does not make an event of every command that worked", () => {
    const events = historyFromRecords({
      records: [],
      executions: [
        execution("a", "succeeded"),
        execution("b", "succeeded"),
        execution("c", "succeeded"),
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("keeps a command that needs the reader, went wrong, or was declined", () => {
    const events = historyFromRecords({
      records: [],
      executions: [
        execution("ok", "succeeded"),
        execution("ask", "awaiting-approval"),
        execution("bad", "failed"),
        execution("stopped", "interrupted"),
        execution("no", "declined"),
      ],
    });
    expect(events.map((event) => event.source.id).sort()).toEqual([
      "ask",
      "bad",
      "no",
      "stopped",
    ]);
  });

  it("keeps releases, access, backups and failures; drops a passing inspection", () => {
    const events = historyFromRecords({
      records: [
        record(
          "release",
          {},
          {
            content: {
              kind: "deployment",
              repositoryUrl: "https://github.com/qa/shop",
              revision: "a1b2c3d4e5f6",
              image: "ghcr.io/qa/shop:a1b2c3d",
              server: "host",
              changes: [],
            },
          },
        ),
        record(
          "backup",
          {},
          {
            states: {
              ref: { kind: "backup-copy", id: "c1" },
              presence: "present",
            },
          },
        ),
        record(
          "broke",
          {},
          {
            status: "failed",
            states: {
              ref: { kind: "process", id: "web" },
              presence: "present",
            },
          },
        ),
        // The one that used to fill the page: a check that found nothing wrong.
        record(
          "routine",
          {},
          {
            states: {
              ref: { kind: "process", id: "web" },
              presence: "present",
            },
          },
        ),
      ],
      executions: [],
    });
    expect(events.map((event) => event.source.id).sort()).toEqual([
      "backup",
      "broke",
      "release",
    ]);
  });

  it("carries the commands that ran around an event as its own steps", () => {
    // Adjacency, not causation — nothing Pi writes links a command to the
    // record it produced, so this is offered as what ran around it.
    const events = historyFromRecords({
      records: [
        record(
          "release",
          {},
          {
            content: {
              kind: "deployment",
              repositoryUrl: "https://github.com/qa/shop",
              revision: "a1b2c3d4e5f6",
              image: "ghcr.io/qa/shop:a1b2c3d",
              server: "host",
              changes: [],
            },
          },
        ),
      ],
      executions: [
        execution("near", "succeeded", "2026-09-15T11:56:00.000Z"),
        // Half an hour earlier: not this event's evidence.
        execution("far", "succeeded", "2026-09-15T11:25:00.000Z"),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].steps?.map((step) => step.at)).toEqual([
      "2026-09-15T11:56:00.000Z",
    ]);
  });
});
