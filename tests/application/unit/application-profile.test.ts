import { describe, expect, it } from "vitest";

import {
  APPLICATION_PROFILE,
  dependencyName,
  profileRule,
  readPyproject,
  resolveApplicationProfile,
} from "../../../src/server/application-profile";
import {
  fixtureTree,
  repositoryFixtures,
  type RepositoryFixtureName,
} from "../../fixtures/repositories";

function resolve(name: RepositoryFixtureName, captured = ["pyproject.toml"]) {
  const files = repositoryFixtures[name];
  return resolveApplicationProfile({
    inspected: true,
    entries: fixtureTree(files),
    files: new Map(
      files
        .filter((file) => captured.includes(file.path))
        .map((file) => [file.path, file.content]),
    ),
  });
}

describe("FastAPI + uv profile resolution", () => {
  it("matches a conforming repository and cites every criterion", () => {
    const resolution = resolve("fastapi-conforming");
    expect(resolution).toMatchObject({
      status: "matched",
      profileId: "fastapi-uv",
      profileVersion: 1,
      reason: null,
    });
    expect(resolution.criteria.map((c) => [c.id, c.matched])).toEqual([
      ["pyproject-present", true],
      ["fastapi-dependency", true],
      ["uv-managed", true],
      ["requires-python", true],
    ]);
    expect(resolution.criteria[1].evidence).toContain(
      'declares "fastapi>=0.115"',
    );
    expect(resolution.criteria[3].evidence).toBe('requires-python = ">=3.12"');
  });

  it.each([
    ["fastapi-nohealth", "matched"],
    ["fastapi-localhost", "matched"],
    ["fastapi-sqlite", "matched"],
    ["fastapi-malicious-readme", "matched"],
    ["fastapi-secret-leak", "matched"],
  ] as const)(
    "resolves %s as %s: conformance is not a profile question",
    (name, status) => {
      expect(resolve(name).status).toBe(status);
    },
  );

  it("rejects a Django repository at the first criterion", () => {
    const resolution = resolve("django-unsupported");
    expect(resolution.status).toBe("unmatched");
    expect(resolution.reason).toContain("no pyproject.toml at the root");
    expect(resolution.criteria[0]).toMatchObject({
      id: "pyproject-present",
      matched: false,
    });
  });

  it("rejects a FastAPI project that is not managed with uv", () => {
    const resolution = resolve("fastapi-nolock");
    expect(resolution.status).toBe("unmatched");
    expect(
      resolution.criteria.find((c) => c.id === "uv-managed"),
    ).toMatchObject({
      matched: false,
      evidence: "neither uv.lock nor [tool.uv] was found",
    });
    expect(
      resolution.criteria.find((c) => c.id === "fastapi-dependency")?.matched,
    ).toBe(true);
  });

  it("reports ambiguity when a second root manifest names another runtime", () => {
    const resolution = resolve("ambiguous-fullstack");
    expect(resolution.status).toBe("ambiguous");
    expect(resolution.reason).toContain("package.json");
    expect(resolution.criteria.every((c) => c.matched)).toBe(true);
  });

  it("does not guess when the manifest was not captured", () => {
    const resolution = resolve("fastapi-conforming", []);
    expect(resolution.status).toBe("unmatched");
    expect(resolution.criteria[0].evidence).toContain("was not captured");
  });

  it("stays not-inspected without an inspection", () => {
    expect(
      resolveApplicationProfile({
        inspected: false,
        entries: [],
        files: new Map(),
      }),
    ).toMatchObject({ status: "not-inspected", criteria: [] });
  });

  it("reads only the [project] table, multi-line arrays and the [tool.uv] header", () => {
    const parsed = readPyproject(
      [
        "[project]",
        'name = "x"',
        'requires-python = ">=3.11"',
        "dependencies = [",
        "  'fastapi>=0.1',",
        '  "sqlalchemy",',
        "]",
        "[project.optional-dependencies]",
        'dev = ["pytest"]',
        "[tool.uv]",
        "managed = true",
      ].join("\n"),
    );
    expect(parsed).toEqual({
      requiresPython: ">=3.11",
      dependencies: ["fastapi>=0.1", "sqlalchemy"],
      hasToolUv: true,
      dynamicDependencies: false,
    });
    expect(
      readPyproject('[project]\ndynamic = ["dependencies"]\n')
        .dynamicDependencies,
    ).toBe(true);
    expect(dependencyName(" FastAPI[standard] >= 0.115 ")).toBe("fastapi");
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
