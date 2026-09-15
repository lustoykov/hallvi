// What a turn in flight is allowed to say about itself.
//
// One sentence covered every case: "Working for 6m 12s", whether Pi was
// waiting on the model, building an image on the server, or stopped on an
// approval the owner had not noticed. Six minutes of that reads as a stall,
// and the only move it offers is to stop the turn.
//
// Every case here is read from a record. None of them estimates progress or
// names a stage nothing wrote down.

import { describe, expect, it } from "vitest";

import { runActivity, runFailure } from "@/components/server-guy/run-activity";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";

const RUN = "run-1";
const NOW = Date.parse("2026-09-15T12:10:00.000Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const execution = (over: Partial<ExecutionRecord>): ExecutionRecord => ({
  id: "e1",
  applicationId: "app",
  chatId: "chat",
  runId: RUN,
  tool: "server_bash",
  target: "root@203.0.113.7:22",
  input: '{"command":"docker compose build"}',
  mode: "pi-decides",
  status: "running",
  output: "",
  createdAt: ago(60),
  ...over,
});

const call = (over: Partial<ActivityRecord>): ActivityRecord =>
  ({
    kind: "tool",
    id: "a1",
    applicationId: "app",
    runId: RUN,
    sequence: 1,
    tool: "save_information",
    args: "{}",
    preview: "",
    result: "",
    status: "running",
    truncated: false,
    startedAt: ago(4),
    ...over,
  }) as ActivityRecord;

const ask = (over: Partial<Parameters<typeof runActivity>[0]> = {}) =>
  runActivity({
    runId: RUN,
    status: "running",
    startedAt: ago(90),
    executions: [],
    activity: [],
    now: NOW,
    ...over,
  });

describe("what a turn in flight says it is doing", () => {
  it("a decision nobody has made outranks everything else", () => {
    // The turn is not working. It is stopped, on the reader, and the word
    // "Working" said the opposite for as long as they did not notice.
    const said = ask({
      executions: [
        execution({ status: "awaiting-approval", createdAt: ago(200) }),
      ],
    });
    expect(said.says).toBe("Waiting for you to approve a command");
    expect(said.since).toBe("3m 20s");
    expect(said.waitingOnYou).toBe(true);
  });

  it("names the machine a running command is running on", () => {
    const said = ask({ executions: [execution({ createdAt: ago(75) })] });
    expect(said.says).toBe("Running a command on the server");
    expect(said.since).toBe("1m 15s");
    expect(said.waitingOnYou).toBe(false);
  });

  it("does not call a workspace command a command on the server", () => {
    const said = ask({
      executions: [execution({ tool: "bash", target: "Repository workspace" })],
    });
    expect(said.says).toBe("Running a command in the repository copy");
  });

  it("says how long a command has been silent, once silence is the point", () => {
    // Building Paperless installs 201 packages and prints nothing for
    // minutes. The last line on screen reads the same whether it is working
    // or wedged; how long ago it was written does not.
    expect(
      ask({
        executions: [execution({ createdAt: ago(400), outputAt: ago(230) })],
      }).since,
    ).toBe("6m 40s · quiet for 3m 50s");
    // A gap between two lines is not a silence.
    expect(
      ask({
        executions: [execution({ createdAt: ago(400), outputAt: ago(3) })],
      }).since,
    ).toBe("6m 40s");
  });

  it("reports work that has no execution card of its own", () => {
    const said = ask({ activity: [call({})] });
    expect(said.says).toBe("Working in Server Guy's records");
    expect(said.since).toBe("4s");
  });

  it("separates waiting for the model from writing the reply", () => {
    expect(ask().says).toBe("Waiting for the model");
    expect(ask().since).toBe("1m 30s");
    expect(ask({ hasDraft: true }).says).toBe("Writing the reply");
  });

  it("ignores another turn's records", () => {
    // Executions and calls are read per run. A command still running under
    // an earlier turn must not describe this one.
    const said = ask({
      executions: [execution({ runId: "another-run" })],
      activity: [call({ runId: "another-run" })],
    });
    expect(said.says).toBe("Waiting for the model");
  });

  it("says a queued turn has not started", () => {
    const said = ask({ status: "queued" });
    expect(said.says).toBe("Waiting to start");
    expect(said.since).toBeNull();
  });
});

describe("what to say and offer when a turn failed", () => {
  const failed = (over: Partial<ExecutionRecord>): ExecutionRecord =>
    execution({ status: "failed", exitCode: 1, ...over });

  it("reads the failure out of the command that produced it", () => {
    const said = runFailure({
      runId: RUN,
      executions: [
        failed({
          output:
            "Step 4/9 : RUN pip install -r requirements.txt\nERROR: No matching distribution found for django==6.0\nexit status 1",
        }),
      ],
    });
    expect(said.says).toContain("on the server");
    expect(said.says).toContain("exit 1");
    // The last line that says something, not the exit code the card shows.
    expect(said.says).toContain("No matching distribution");
  });

  it("offers understanding, not retry, when a command rejected its input", () => {
    // Running it again gets the same exit code. Retrying is a way of not
    // reading the error.
    const said = runFailure({
      runId: RUN,
      executions: [failed({ output: "ERROR: manifest unknown" })],
    });
    expect(said.action.kind).toBe("ask");
    expect(said.action.label).toBe("Ask what went wrong");
  });

  it("offers retry when the connection dropped", () => {
    const said = runFailure({
      runId: RUN,
      executions: [
        failed({ output: "client_loop: send disconnect: Broken pipe" }),
      ],
    });
    expect(said.action.kind).toBe("retry");
    expect(said.action.label).toBe("Try again");
  });

  it("keeps a run's internal error out of the line, and offers retry", () => {
    // A run's own error is runtime text, and this product has already decided
    // it does not reach the reader. A failed command's output is different:
    // it is the command's own words, already redacted and already on screen
    // in its own terminal.
    const said = runFailure({
      runId: RUN,
      error: "Transaction failed for internal Run id.",
      executions: [],
    });
    expect(said.says).not.toContain("Transaction failed");
    expect(said.says).toContain("no command recorded why");
    expect(said.action.kind).toBe("retry");
  });

  it("does not read another turn's failure", () => {
    const said = runFailure({
      runId: RUN,
      executions: [failed({ runId: "another", output: "ERROR: boom" })],
    });
    expect(said.says).toContain("no command recorded why");
  });
});
