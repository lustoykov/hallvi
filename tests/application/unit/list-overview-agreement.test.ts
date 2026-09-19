// The applications list and the Overview a card opens read the same records,
// so they must not disagree about them. Each case is one the two used to
// answer differently, because the list kept its own copy of the rule.

import { describe, expect, it } from "vitest";

import { applicationListCondition } from "@/server/application-list";
import { applicationCondition } from "@/components/hallvi/overview-records";
import type { Ref, SavedInformation } from "@/server/operator-data";

const APP = "11111111-2222-4333-8444-555555555555";
const AT = "2026-09-18T08:00:00.000Z";
const NOW = Date.parse("2026-09-18T08:10:00.000Z");
const application: Ref = { kind: "application", id: APP };
const domain: Ref = { kind: "door", id: "public-https" };

type Check = NonNullable<SavedInformation["presentation"]>["checks"][number];

function record(input: {
  id: string;
  ref: Ref;
  status?: "verified" | "failed" | "warning" | "info";
  checks?: Check[];
}): SavedInformation {
  return {
    id: input.id,
    applicationId: APP,
    title: input.id,
    body: "",
    evidence: [],
    establishedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
    presentation: {
      states: { ref: input.ref, presence: "present" },
      views: ["overview"],
      role: "status",
      status: input.status ?? "verified",
      checks: input.checks ?? [],
    },
  } as SavedInformation;
}

const check = (about: Ref, status: "passed" | "failed"): Check => ({
  key: `${about.kind}-http`,
  label: `${about.id} answered`,
  status,
  claim: "reachability",
  basis: "observed",
  about,
});

const readings = (records: SavedInformation[]) => ({
  list: applicationListCondition(records, APP, NOW),
  overview: applicationCondition(records, APP, NOW),
});

describe("the applications list and Overview", () => {
  it("A: Pi's failed judgement outranks the application's passing check", () => {
    const { list, overview } = readings([
      record({
        id: "Checkout is down",
        ref: application,
        status: "failed",
        checks: [check(application, "passed")],
      }),
    ]);
    expect(list).toEqual({ tone: "bad", text: "A recorded condition failed" });
    expect(overview.certainty).toBe("failed");
    expect(overview.text).toContain("Checkout is down");
  });

  it("B: a failed check on another subject fails the application", () => {
    const { list, overview } = readings([
      record({
        id: "app",
        ref: application,
        checks: [check(application, "passed")],
      }),
      record({ id: "domain", ref: domain, checks: [check(domain, "failed")] }),
    ]);
    expect(list).toEqual({ tone: "bad", text: "A check did not pass" });
    expect(overview).toEqual({
      certainty: "failed",
      text: '"public-https answered" did not pass.',
    });
  });
});
