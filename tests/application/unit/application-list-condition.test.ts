import { describe, expect, it } from "vitest";

import { applicationListCondition } from "../../../src/server/application-list";
import type { SavedInformation } from "../../../src/server/operator-data";

const APP = "11111111-2222-4333-8444-555555555555";
const ref = { kind: "application" as const, id: APP };

function state(
  id: string,
  status: "verified" | "failed" | "warning" | "info",
  at: string,
): SavedInformation {
  return {
    id,
    applicationId: APP,
    title: id,
    body: "",
    evidence: [],
    establishedAt: at,
    createdAt: at,
    updatedAt: at,
    retiredAt: null,
    presentation: {
      states: { ref, presence: "present" },
      views: ["overview"],
      role: "status",
      status,
      checks: [
        {
          key: "http",
          label: "Homepage answered",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: ref,
        },
      ],
    },
  };
}

describe("the applications list condition", () => {
  it("does not turn a current warning green because its check passed", () => {
    const warning = state("warning", "warning", "2026-09-18T08:00:00.000Z");
    warning.presentation!.nextStep = "Make an offsite copy.";
    expect(
      applicationListCondition([warning], APP, Date.parse(warning.createdAt)),
    ).toEqual({
      tone: "warn",
      text: "warning",
      nextStep: "Make an offsite copy.",
    });
  });

  it("keeps a failed check more urgent than a qualified record", () => {
    const warning = state("warning", "warning", "2026-09-18T08:00:00.000Z");
    warning.presentation!.checks![0].status = "failed";
    expect(
      applicationListCondition([warning], APP, Date.parse(warning.createdAt)),
    ).toEqual({ tone: "bad", text: "“Homepage answered” did not pass" });
  });

  it("does not let an informational observation clear a failure", () => {
    const failed = state("failed", "failed", "2026-09-18T08:00:00.000Z");
    const note = state("note", "info", "2026-09-18T08:05:00.000Z");
    note.presentation!.checks = [];
    expect(
      applicationListCondition([failed, note], APP, Date.parse(note.createdAt)),
    ).toEqual({ tone: "bad", text: "failed" });
  });

  it("lets a newer verified state replace an older failure", () => {
    const failed = state("failed", "failed", "2026-09-18T08:00:00.000Z");
    const recovered = state(
      "recovered",
      "verified",
      "2026-09-18T08:05:00.000Z",
    );
    expect(
      applicationListCondition(
        [failed, recovered],
        APP,
        Date.parse(recovered.createdAt),
      ),
    ).toEqual({ tone: "live", text: "Checks held" });
  });

  it("does not promote a historical failed event to current state", () => {
    const recovered = state(
      "recovered",
      "verified",
      "2026-09-18T08:05:00.000Z",
    );
    const event = {
      ...state("failed-event", "failed", "2026-09-18T08:10:00.000Z"),
      presentation: {
        ...state("failed-event", "failed", "2026-09-18T08:10:00.000Z")
          .presentation!,
        states: undefined,
        checks: [],
      },
    };
    expect(
      applicationListCondition(
        [recovered, event],
        APP,
        Date.parse(event.createdAt),
      ),
    ).toEqual({ tone: "live", text: "Checks held" });
  });
});
