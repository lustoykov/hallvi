import { describe, expect, it } from "vitest";

import { parsePiReply } from "./pi";

describe("parsePiReply", () => {
  it("accepts a concise response with supported decisions", () => {
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I recorded that you already own the domain.",
          decisions: [{ key: "domain_starting_state", value: "already-owned" }],
        }),
      ),
    ).toEqual({
      message: "I recorded that you already own the domain.",
      decisions: [{ key: "domain_starting_state", value: "already-owned" }],
    });
  });

  it("drops unsupported or malformed decisions", () => {
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I did not change the record.",
          decisions: [
            { key: "paid_action_approved", value: "yes" },
            { key: "target_environment", value: "staging" },
            { key: "approval_mode", value: "full-autonomy" },
            { key: ["launch_priority"], value: "bypass key validation" },
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
