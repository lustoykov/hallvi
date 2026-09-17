// Where the request sits, and what it is allowed to say.
//
// Two rules this surface must not break: the request stays at the point Pi
// asked (answering one field must not walk it down the transcript, and a
// refresh must put it back in the same place), and nothing it renders is
// derived from a supplied value.

import { describe, expect, it } from "vitest";

import {
  purposeOf,
  secretRequestPoint,
  type SecretRequest,
} from "@/components/haldur/secret-request";

const messages = [
  { id: "m1", createdAt: "2026-09-13T10:00:00.000Z" },
  { id: "m2", createdAt: "2026-09-13T11:00:00.000Z" },
  { id: "m3", createdAt: "2026-09-13T13:00:00.000Z" },
];

function ask(
  name: string,
  requestedAt: string,
  establishedAt: string | null = null,
): SecretRequest {
  return { name, why: "Needed.", process: null, requestedAt, establishedAt };
}

describe("the point in the transcript", () => {
  it("is the message Pi was on when it asked", () => {
    expect(
      secretRequestPoint([ask("A", "2026-09-13T11:30:00.000Z")], messages),
    ).toBe("m2");
  });

  it("does not move when one of the group is answered", () => {
    const before = [
      ask("A", "2026-09-13T11:30:00.000Z"),
      ask("B", "2026-09-13T11:31:00.000Z"),
    ];
    const after = [
      ask("A", "2026-09-13T11:30:00.000Z", "2026-09-13T14:00:00.000Z"),
      ask("B", "2026-09-13T11:31:00.000Z"),
    ];
    expect(secretRequestPoint(after, messages)).toBe(
      secretRequestPoint(before, messages),
    );
  });

  it("stays put once every value is supplied, so the receipt keeps its place", () => {
    const done = [
      ask("A", "2026-09-13T11:30:00.000Z", "2026-09-13T14:00:00.000Z"),
      ask("B", "2026-09-13T11:31:00.000Z", "2026-09-13T14:01:00.000Z"),
    ];
    expect(secretRequestPoint(done, messages)).toBe("m2");
  });

  it("takes the earliest ask when the group was raised across two messages", () => {
    expect(
      secretRequestPoint(
        [
          ask("B", "2026-09-13T13:30:00.000Z"),
          ask("A", "2026-09-13T11:30:00.000Z"),
        ],
        messages,
      ),
    ).toBe("m2");
  });

  it("says nowhere rather than guessing when it predates the transcript", () => {
    expect(
      secretRequestPoint([ask("A", "2026-09-13T09:00:00.000Z")], messages),
    ).toBeNull();
    expect(secretRequestPoint([], messages)).toBeNull();
  });
});

describe("the purpose, without the paragraph repeated under every field", () => {
  it("keeps the sentence that says what the value is for", () => {
    expect(
      purposeOf(
        "Required by the Shop admin endpoint and compared with the X-Admin-Password header. It will be stored only in the server deployment environment, not the repository or logs.",
      ),
    ).toBe(
      "Required by the Shop admin endpoint and compared with the X-Admin-Password header.",
    );
  });

  it("leaves a single-sentence purpose alone", () => {
    expect(purposeOf("Needed to reach the database.")).toBe(
      "Needed to reach the database.",
    );
  });

  it("returns something for a purpose with no full stop", () => {
    expect(purposeOf("Needed to reach the database")).toBe(
      "Needed to reach the database",
    );
  });
});
