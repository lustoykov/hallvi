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
});
