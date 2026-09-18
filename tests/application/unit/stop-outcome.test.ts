// What stopping actually did.
//
// Stopping ends the reply; it does not undo the work. By the time somebody
// reaches for Stop, Pi has usually already run something on their server, and
// a message saying only "Reply cancelled." invites them to believe otherwise.

import { describe, expect, it } from "vitest";

import { firstAppearances, stopOutcome } from "@/components/hallvi/chat-pane";

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

  it("does not count a command that never started", () => {
    // Declined and awaiting-approval never reached the server.
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

  it("counts a command that ran and failed, because it still ran", () => {
    const said = stopOutcome([{ runId: run, status: "failed" }], run);
    expect(said).toContain("1 command");
    expect(said).toContain("not undone");
  });

  it("will not claim an in-flight command stopped", () => {
    // Stopping the reply is not a signal that reaches a command already
    // executing on the far side of an SSH connection.
    const said = stopOutcome([{ runId: run, status: "running" }], run);
    expect(said).toMatch(/still running/);
    expect(said).toMatch(/does not confirm it stopped/);
    expect(said).not.toMatch(/Nothing had run/);
  });

  it("reports what finished and what is unconfirmed together", () => {
    const said = stopOutcome(
      [
        { runId: run, status: "succeeded" },
        { runId: run, status: "failed" },
        { runId: run, status: "running" },
        { runId: run, status: "declined" },
      ],
      run,
    );
    expect(said).toContain("2 commands had already run");
    expect(said).toMatch(/One command was still running/);
  });

  it("survives an execution list that was never loaded", () => {
    expect(stopOutcome(undefined, run)).toBe("Stopped. Nothing had run.");
  });
});

describe("which record is shown in full", () => {
  const msg = (id: string, ...records: string[]) => ({
    id,
    blocks: records.map((record) => ({
      type: "saved-information",
      id: record,
    })),
  });

  it("gives a record its full card once, at its first appearance", () => {
    const first = firstAppearances([msg("m1", "r1"), msg("m2", "r1")]);
    expect(first.get("r1")).toBe("m1:0");
  });

  it("keeps two different records about the same subject, both in full", () => {
    // The rule is identity, never subject. "The domain resolves" and "the
    // domain does not serve the application" are two observations and both
    // still hold; folding the earlier one away because a newer record
    // mentions the same subject would erase a claim that is still true.
    const first = firstAppearances([
      msg("m1", "resolves"),
      msg("m2", "serves"),
    ]);
    expect(first.get("resolves")).toBe("m1:0");
    expect(first.get("serves")).toBe("m2:0");
    expect(first.size).toBe(2);
  });

  it("counts position within a message, so one reply can carry several", () => {
    const first = firstAppearances([msg("m1", "a", "b")]);
    expect(first.get("a")).toBe("m1:0");
    expect(first.get("b")).toBe("m1:1");
  });

  it("ignores blocks that are not records", () => {
    const first = firstAppearances([
      {
        id: "m1",
        blocks: [{ type: "text" }, { type: "saved-information", id: "r1" }],
      },
    ]);
    expect(first.get("r1")).toBe("m1:1");
    expect(first.size).toBe(1);
  });

  it("survives a message with no blocks", () => {
    expect(firstAppearances([{ id: "m1" }]).size).toBe(0);
  });
});
