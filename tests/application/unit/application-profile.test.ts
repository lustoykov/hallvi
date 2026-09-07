import { describe, expect, it } from "vitest";
import {
  APPLICATION_PROFILE,
  profileRule,
  resolveApplicationProfile,
} from "../../../src/server/application-profile";

describe("evidence-backed profile selection", () => {
  it("does not infer a stack before the model has inspected it", () => {
    expect(resolveApplicationProfile({ inspected: true })).toMatchObject({
      status: "pending",
      criteria: [],
    });
  });
  it("uses the cited model interpretation rather than filename heuristics", () => {
    const selection = {
      profileId: "fastapi-uv",
      rationale:
        "One FastAPI service; the JavaScript manifest is lint tooling, not a second service.",
      citations: [
        {
          observationId: "read",
          path: "services/api/settings.toml",
          snippet: "fastapi",
        },
      ],
    };
    expect(
      resolveApplicationProfile({ inspected: true, selection }),
    ).toMatchObject({
      status: "matched",
      criteria: [{ evidence: selection.rationale }],
    });
    expect(
      resolveApplicationProfile({ inspected: false, selection }).status,
    ).toBe("not-inspected");
  });
  it("does not turn an unavailable profile into a supported capability", () => {
    expect(
      resolveApplicationProfile({
        inspected: true,
        selection: {
          profileId: "unimplemented-stack",
          rationale: "Another application",
          citations: [],
        },
      }).status,
    ).toBe("unmatched");
  });
  it("exposes versioned rules and nineteen material fields with their policies", () => {
    expect(profileRule("health-path")).toMatchObject({ value: "/health" });
    expect(profileRule("nope")).toBeNull();
    expect(APPLICATION_PROFILE.fields).toHaveLength(19);
    const policies = APPLICATION_PROFILE.fields
      .filter((field) => "policy" in field)
      .map((field) => [
        field.key,
        (field as { policy: { dependency: string } }).policy.dependency,
      ]);
    expect(policies).toEqual([
      ["build.containerImage", "F-8"],
      ["migrations.rollbackPolicy", "U16"],
      ["observability.telemetry", "U1"],
      ["backup.policy", "U1"],
      ["verification.requiredChecks", "U15"],
    ]);
  });
});
