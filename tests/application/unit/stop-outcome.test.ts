// What stopping actually did.
//
// Stopping ends the reply; it does not undo the work. Status alone does not
// prove a command reached the server. Tool evidence keeps results and gaps.

import { describe, expect, it } from "vitest";

import { firstAppearances, stopOutcome } from "@/components/hallvi/chat-pane";

describe("what stopping did", () => {
  it("explains the queue and remote boundary without claiming whether a command ran", () => {
    const said = stopOutcome();
    expect(said).toContain("waiting messages were cancelled");
    expect(said).toContain("does not undo changes");
    expect(said).toContain("confirm that remote processes stopped");
    expect(said).not.toMatch(
      /had (already )?run|Nothing had run|still running/,
    );
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
