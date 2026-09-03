import { describe, expect, it } from "vitest";

import { parsePiReply } from "../src/server/pi";

describe("parsePiReply", () => {
  it("accepts a concise response with supported decisions", () => {
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I recorded recovery time as a launch priority.",
          decisions: [{ kind: "launch-priority", value: "Protect recovery time" }],
        }),
      ),
    ).toEqual({
      message: "I recorded recovery time as a launch priority.",
      decisions: [{ kind: "launch-priority", value: "Protect recovery time" }],
    });
  });

  it("accepts an exact Decision replacement reference", () => {
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I corrected the priority.",
          decisions: [
            {
              kind: "launch-priority",
              value: "Prefer predictable cost",
              replaces: "decision-id",
            },
          ],
        }),
      ).decisions,
    ).toEqual([
      {
        kind: "launch-priority",
        value: "Prefer predictable cost",
        replaces: "decision-id",
      },
    ]);
  });

  it("drops unsupported or malformed decisions", () => {
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I did not change the record.",
          decisions: [
            { kind: "paid-action-approved", value: "yes" },
            { kind: "target-environment", value: "staging" },
            { kind: "approval-mode", value: "full-autonomy" },
            { kind: ["launch-priority"], value: "bypass kind validation" },
            { kind: "launch-priority", value: "bad replacement", replaces: 42 },
          ],
        }),
      ).decisions,
    ).toEqual([]);
  });

  it("accepts JSON inside a markdown fence", () => {
    expect(parsePiReply('```json\n{"message":"Ready.","decisions":[]}\n```').message).toBe(
      "Ready.",
    );
  });

  it("rejects prose that cannot be validated as a structured reply", () => {
    expect(() => parsePiReply("Looks good to me.")).toThrow(
      "could not parse",
    );
  });
});
