// What stopping actually did.
//
// Stopping ends the reply; it does not undo the work. By the time somebody
// reaches for Stop, Pi has usually already run something on their server, and
// a message saying only "Reply cancelled." invites them to believe otherwise.

import { describe, expect, it } from "vitest";

import { stopOutcome } from "@/components/server-guy/chat-pane";

const run = "run-1";
const other = "run-2";

describe("what stopping did", () => {
  it("says nothing ran when nothing had", () => {
    expect(stopOutcome([], run)).toBe("Stopped. Nothing had run.");
  });

  it("counts what had already finished, and says it was not undone", () => {
    const said = stopOutcome(
      [
        { runId: run, status: "succeeded" },
        { runId: run, status: "succeeded" },
        { runId: run, status: "running" },
      ],
      run,
    );
    expect(said).toContain("2 commands");
    expect(said).toMatch(/not undone/);
  });

  it("reads as one command when it was one", () => {
    const said = stopOutcome([{ runId: run, status: "succeeded" }], run);
    expect(said).toContain("1 command");
    expect(said).toContain("was not undone");
  });

  it("counts only this reply's work", () => {
    expect(stopOutcome([{ runId: other, status: "succeeded" }], run)).toBe(
      "Stopped. Nothing had run.",
    );
  });

  it("does not count a command that never completed", () => {
    // A declined or still-running call did not happen to the server.
    expect(
      stopOutcome(
        [
          { runId: run, status: "declined" },
          { runId: run, status: "awaiting-approval" },
        ],
        run,
      ),
    ).toBe("Stopped. Nothing had run.");
  });

  it("survives an execution list that was never loaded", () => {
    expect(stopOutcome(undefined, run)).toBe("Stopped. Nothing had run.");
  });
});
