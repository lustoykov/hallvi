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
    const decisionId = "18b38547-0f1b-4d78-a5a2-f0f0adab02d1";
    expect(
      parsePiReply(
        JSON.stringify({
          message: "I corrected the priority.",
          decisions: [
            {
              kind: "launch-priority",
              value: "Prefer predictable cost",
              replaces: decisionId,
            },
          ],
        }),
      ).decisions,
    ).toEqual([
      {
        kind: "launch-priority",
        value: "Prefer predictable cost",
        replaces: decisionId,
      },
    ]);
  });

  it.each([
    [{ kind: "paid-action-approved", value: "yes" }, "unsupported Decision kind"],
    [{ kind: "target-environment", value: "staging" }, "unsupported Decision kind"],
    [{ kind: "approval-mode", value: "full-autonomy" }, "unsupported Decision kind"],
    [{ kind: ["launch-priority"], value: "bypass kind validation" }, "unsupported Decision kind"],
    [{ kind: "launch-priority", value: "bad replacement", replaces: 42 }, "replacement ID"],
    [{ kind: "launch-priority", value: "bad replacement", replaces: "invented" }, "replacement ID"],
  ])("rejects a malformed or unsupported Decision %#", (decision, message) => {
    expect(() =>
      parsePiReply(
        JSON.stringify({
          message: "I did not change the record.",
          decisions: [decision],
        }),
      ),
    ).toThrow(message);
  });

  it("rejects oversized model-authored fields instead of truncating them", () => {
    expect(() =>
      parsePiReply(
        JSON.stringify({
          message: "Ready.",
          decisions: [{ kind: "launch-priority", value: "x".repeat(301) }],
        }),
      ),
    ).toThrow("longer than 300 characters");
  });

  it("rejects an oversized model reply before parsing it", () => {
    expect(() => parsePiReply("x".repeat(20_001))).toThrow(
      "longer than 20,000 characters",
    );
  });

  it("rejects too many Decisions in one reply", () => {
    expect(() =>
      parsePiReply(
        JSON.stringify({
          message: "Too many priorities.",
          decisions: Array.from({ length: 21 }, (_, index) => ({
            kind: "launch-priority",
            value: `Priority ${index}`,
          })),
        }),
      ),
    ).toThrow("more than 20 Decisions");
  });

  it("rejects unknown output fields", () => {
    expect(() =>
      parsePiReply(
        JSON.stringify({
          message: "Ready.",
          decisions: [],
          approvedPaidAction: true,
        }),
      ),
    ).toThrow("Unrecognized key");
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

  it("rejects prose wrapped around otherwise valid JSON", () => {
    expect(() =>
      parsePiReply('Here is the result: {"message":"Ready.","decisions":[]}'),
    ).toThrow("could not parse");
  });
});
