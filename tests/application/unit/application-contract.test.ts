import { describe, expect, it } from "vitest";

import {
  contractGapReport,
  ContractValidationError,
  describeContractChanges,
  reviewContractProvenance,
  validateContractProposal,
  type ContractValidationContext,
} from "../../../src/server/application-contract";
import { APPLICATION_PROFILE } from "../../../src/server/application-profile";
import type {
  ApplicationContractRecord,
  ChatMessage,
  Decision,
  Observation,
  ProfileResolution,
} from "../../../src/server/types";
import {
  buildContractProposal,
  type SeenRead,
} from "../../fixtures/contract-builder";
import {
  fixtureTree,
  repositoryFixtures,
  type RepositoryFixtureName,
} from "../../fixtures/repositories";

const APP = "app-a";
const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);

function fileObservation(
  path: string,
  content: string,
  options: { id?: string; applicationId?: string; commitSha?: string } = {},
): Observation {
  return {
    id: options.id ?? `read:${path}`,
    applicationId: options.applicationId ?? APP,
    kind: "github-repository-file",
    status: "passed",
    summary: `Read ${path}`,
    sourceLabel: `Repository file · ${path}`,
    sourceUrl: null,
    raw: { commitSha: options.commitSha ?? COMMIT, path, content },
    observedAt: "2026-09-06T10:00:00.000Z",
  };
}

function inspectionObservation(
  name: RepositoryFixtureName,
  options: { id?: string; commitSha?: string; truncated?: boolean } = {},
): Observation {
  return {
    id: options.id ?? "inspection",
    applicationId: APP,
    kind: "github-repository-inspection",
    status: "passed",
    summary: "Inspected",
    sourceLabel: "Repository inspection",
    sourceUrl: null,
    raw: {
      commitSha: options.commitSha ?? COMMIT,
      entries: fixtureTree(repositoryFixtures[name]),
      truncated: options.truncated ?? false,
    },
    observedAt: "2026-09-06T10:00:00.000Z",
  };
}

const matched: ProfileResolution = {
  status: "matched",
  profileId: APPLICATION_PROFILE.id,
  profileVersion: APPLICATION_PROFILE.version,
  label: APPLICATION_PROFILE.label,
  criteria: [],
  reason: null,
};

/** Every fixture file observed at COMMIT, as the synthetic model saw it. */
function scenario(name: RepositoryFixtureName) {
  const files = repositoryFixtures[name];
  const inspection = inspectionObservation(name);
  const observations = new Map<string, Observation>([
    [inspection.id, inspection],
    ...files.map(
      (file) =>
        [
          `read:${file.path}`,
          fileObservation(file.path, file.content),
        ] as const,
    ),
  ]);
  const reads: SeenRead[] = files.map((file) => ({
    status: "read",
    observationId: `read:${file.path}`,
    path: file.path,
    content: file.content,
  }));
  const seen = {
    inspection: { observationId: inspection.id, commitSha: COMMIT },
    tree: { entries: fixtureTree(files).map((entry) => entry.path) },
  };
  const messages = new Map<string, ChatMessage>();
  const decisions = new Map<string, Decision>();
  const context: ContractValidationContext = {
    applicationId: APP,
    commitSha: COMMIT,
    profile: matched,
    currentContract: null,
    lookups: {
      observation: (id) => observations.get(id) ?? null,
      activeDecision: (id) => decisions.get(id) ?? null,
      applicationMessage: (id) => messages.get(id) ?? null,
    },
  };
  return {
    files,
    inspection,
    observations,
    reads,
    seen,
    messages,
    decisions,
    context,
  };
}

const rejects = (work: () => unknown, ...fragments: string[]) => {
  let error: unknown;
  try {
    work();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ContractValidationError);
  for (const fragment of fragments)
    expect((error as Error).message).toContain(fragment);
};

describe("Application Contract validation", () => {
  it("retains the model's image build recipe and records a recipe-only change", () => {
    const s = scenario("fastapi-conforming");
    const input = buildContractProposal(s.seen, s.reads);
    const standard = validateContractProposal(input, s.context);
    const imageBuild = {
      dockerfile: "deploy/Dockerfile",
      context: "services/api",
      target: "production",
    };
    const chosen = validateContractProposal(
      { ...input, imageBuild },
      s.context,
    );
    expect(chosen.body.imageBuild).toEqual(imageBuild);
    expect(describeContractChanges(standard.body, chosen.body)).toEqual({
      count: 1,
      detail: "Application image build configuration changed",
    });
  });

  it.each([
    { dockerfile: "../Dockerfile" },
    { dockerfile: "/tmp/Dockerfile" },
    { dockerfile: "Dockerfile", context: "../elsewhere" },
    { dockerfile: "." },
  ])("rejects image build paths outside the repository: %j", (imageBuild) => {
    const s = scenario("fastapi-conforming");
    rejects(
      () =>
        validateContractProposal(
          { ...buildContractProposal(s.seen, s.reads), imageBuild },
          s.context,
        ),
      "inside the repository",
    );
  });

  it("accepts a conforming proposal, computes source lines and orders the fields", () => {
    const s = scenario("fastapi-conforming");
    const proposal = validateContractProposal(
      buildContractProposal(s.seen, s.reads),
      s.context,
    );
    expect(proposal.revises).toBeNull();
    expect(proposal.body).toMatchObject({
      profileId: "fastapi-uv",
      profileVersion: 1,
      commitSha: COMMIT,
    });
    expect(proposal.body.fields.map((field) => field.key)).toEqual(
      APPLICATION_PROFILE.fields.map((field) => field.key),
    );
    const health = proposal.body.fields.find((f) => f.key === "health.path")!;
    expect(health).toMatchObject({
      value: "/health",
      provenance: {
        kind: "repository-declared",
        citation: {
          path: "app/main.py",
          snippet: '@app.get("/health")',
          line: 10,
        },
      },
    });
    const port = proposal.body.fields.find((f) => f.key === "network.port")!;
    expect(port.provenance).toMatchObject({
      kind: "repository-declared",
      citation: { path: "Dockerfile", line: 7 },
    });
    const gaps = contractGapReport(proposal.body);
    expect(gaps.blockers).toEqual([]);
    expect(gaps.conformance).toEqual([]);
    expect(
      gaps.policies.map((gap) => [
        gap.field,
        gap.dependency,
        gap.requiredBeforePhase,
      ]),
    ).toEqual([
      ["migrations.rollbackPolicy", "U16", 8],
      ["observability.telemetry", "U1", 7],
      ["backup.policy", "U1", 7],
      ["verification.requiredChecks", "U15", 4],
    ]);
  });

  it("records a missing health endpoint as Phase 3 conformance work, not a blocker", () => {
    const s = scenario("fastapi-nohealth");
    const proposal = validateContractProposal(
      buildContractProposal(s.seen, s.reads),
      s.context,
    );
    const gaps = contractGapReport(proposal.body);
    expect(gaps.blockers).toEqual([]);
    expect(gaps.conformance).toEqual([
      {
        field: "health.path",
        label: "Health endpoint",
        observed: "app/main.py declares no health route.",
        change: "Add GET /health returning 200 when the service can serve.",
      },
    ]);
    const health = proposal.body.fields.find((f) => f.key === "health.path")!;
    expect(health.provenance).toEqual({
      kind: "profile-rule",
      ruleId: "health-path",
    });
    expect(health.conformance?.citation).toMatchObject({
      path: "app/main.py",
      line: 6,
    });
  });

  it("records a localhost bind as conformance work against the profile rule", () => {
    const s = scenario("fastapi-localhost");
    const gaps = contractGapReport(
      validateContractProposal(
        buildContractProposal(s.seen, s.reads),
        s.context,
      ).body,
    );
    expect(gaps.conformance.map((gap) => gap.field)).toEqual([
      "network.bindHost",
    ]);
    expect(gaps.blockers).toEqual([]);
  });

  it("keeps a SQLite declaration as a contradiction that needs a decision", () => {
    const s = scenario("fastapi-sqlite");
    const gaps = contractGapReport(
      validateContractProposal(
        buildContractProposal(s.seen, s.reads),
        s.context,
      ).body,
    );
    expect(gaps.blockers).toEqual([
      expect.objectContaining({
        field: "persistence.database",
        blocker: "contradiction",
        observed: 'database_url: str = "sqlite:///./todo.db"',
      }),
    ]);
  });

  it("rejects an invented Observation, path or snippet", () => {
    const s = scenario("fastapi-conforming");
    rejects(
      () =>
        validateContractProposal(
          buildContractProposal(s.seen, s.reads, { invented: true }),
          s.context,
        ),
      "health.path",
      "not a saved repository-file read of this application",
    );
    const wrongPath = buildContractProposal(s.seen, s.reads);
    const port = wrongPath.fields.find((f) => f.key === "network.port")!;
    (port.provenance as { citation: { path: string } }).citation.path =
      "app/main.py";
    rejects(
      () => validateContractProposal(wrongPath, s.context),
      "is a read of Dockerfile, not app/main.py",
    );
    const wrongSnippet = buildContractProposal(s.seen, s.reads);
    const health = wrongSnippet.fields.find((f) => f.key === "health.path")!;
    (health.provenance as { citation: { snippet: string } }).citation.snippet =
      '@app.get("/healthz")';
    rejects(
      () => validateContractProposal(wrongSnippet, s.context),
      "does not occur verbatim in app/main.py",
    );
  });

  it("refuses to call a non-verbatim value repository-declared", () => {
    const s = scenario("fastapi-conforming");
    const proposal = buildContractProposal(s.seen, s.reads);
    const start = proposal.fields.find(
      (f) => f.key === "runtime.startCommand",
    )!;
    start.provenance = {
      kind: "repository-declared",
      citation: (start.provenance as unknown as { citation: never }).citation,
    };
    rejects(
      () => validateContractProposal(proposal, s.context),
      "runtime.startCommand",
      "label it inferred",
    );
  });

  it("rejects an Observation from another application or another commit", () => {
    const s = scenario("fastapi-conforming");
    const proposal = buildContractProposal(s.seen, s.reads);
    s.observations.set(
      "read:Dockerfile",
      fileObservation(
        "Dockerfile",
        s.files.find((f) => f.path === "Dockerfile")!.content,
        {
          id: "read:Dockerfile",
          applicationId: "app-b",
        },
      ),
    );
    rejects(
      () => validateContractProposal(proposal, s.context),
      "network.port",
      "not a saved repository-file read of this application",
    );
    s.observations.set(
      "read:Dockerfile",
      fileObservation(
        "Dockerfile",
        s.files.find((f) => f.path === "Dockerfile")!.content,
        {
          id: "read:Dockerfile",
          commitSha: OTHER_COMMIT,
        },
      ),
    );
    rejects(
      () => validateContractProposal(proposal, s.context),
      "was read at bbbbbbbb",
      "read it again",
    );
  });

  it("checks profile rules by identity and exact value", () => {
    const s = scenario("fastapi-conforming");
    const unknownRule = buildContractProposal(s.seen, s.reads);
    unknownRule.fields.find(
      (f) => f.key === "build.packageManager",
    )!.provenance = {
      kind: "profile-rule",
      ruleId: "made-up",
    };
    rejects(
      () => validateContractProposal(unknownRule, s.context),
      "made-up is not a rule",
    );
    const wrongValue = buildContractProposal(s.seen, s.reads);
    wrongValue.fields.find((f) => f.key === "build.packageManager")!.value =
      "pip";
    rejects(
      () => validateContractProposal(wrongValue, s.context),
      'sets "uv", not "pip"',
    );
  });

  it("binds a profile rule to the one field it governs, at proposal and in review", () => {
    const s = scenario("fastapi-conforming");
    // The database rule's exact value cited for the health endpoint: the
    // value matches the rule, the field does not.
    const wrongField = buildContractProposal(s.seen, s.reads);
    const health = wrongField.fields.find((f) => f.key === "health.path")!;
    health.value = "PostgreSQL";
    health.provenance = { kind: "profile-rule", ruleId: "database" };
    delete health.conformance;
    rejects(
      () => validateContractProposal(wrongField, s.context),
      "health.path: rule database governs persistence.database, not health.path",
    );
    for (const [ruleId, rule] of Object.entries(APPLICATION_PROFILE.rules))
      expect(
        APPLICATION_PROFILE.fields.some((field) => field.key === rule.field),
        `${ruleId} names a material field`,
      ).toBe(true);
    // A stored contract that slipped through an older validator is reported
    // by the review, so P2.G3 blocks instead of trusting it.
    const accepted = validateContractProposal(
      buildContractProposal(s.seen, s.reads),
      s.context,
    );
    const record: ApplicationContractRecord = {
      id: "c-rule",
      applicationId: APP,
      workspaceId: "ws",
      version: 1,
      profileId: accepted.body.profileId,
      profileVersion: accepted.body.profileVersion,
      commitSha: COMMIT,
      sourceMessageId: "m0",
      body: {
        ...accepted.body,
        fields: accepted.body.fields.map((field) =>
          field.key === "health.path"
            ? {
                key: field.key,
                value: "PostgreSQL",
                provenance: { kind: "profile-rule", ruleId: "database" },
              }
            : field,
        ),
      },
      supersededById: null,
      createdAt: "2026-09-06T10:00:00.000Z",
    };
    expect(
      reviewContractProvenance(record, {
        applicationId: APP,
        commitSha: COMMIT,
        lookups: s.context.lookups,
      }),
    ).toEqual([
      {
        field: "health.path",
        reason: "rule database governs persistence.database, not this field",
      },
    ]);
  });

  it("accepts the engineer's own quoted words or an active Decision, and nothing else", () => {
    const s = scenario("fastapi-conforming");
    s.messages.set("m1", {
      id: "m1",
      chatId: "chat",
      role: "user",
      source: "user",
      body: "The health endpoint is /healthz, not /health.",
      createdAt: "2026-09-06T10:00:00.000Z",
      status: "completed",
      revision: 0,
    });
    s.messages.set("m2", {
      ...s.messages.get("m1")!,
      id: "m2",
      source: "server-guy",
    });
    const corrected = buildContractProposal(s.seen, s.reads, {
      corrections: [
        {
          key: "health.path",
          value: "/healthz",
          messageId: "m1",
          quote: "/healthz",
        },
      ],
    });
    const proposal = validateContractProposal(corrected, s.context);
    expect(
      proposal.body.fields.find((f) => f.key === "health.path"),
    ).toMatchObject({
      value: "/healthz",
      provenance: {
        kind: "user-confirmed",
        source: { type: "message", messageId: "m1" },
      },
    });
    rejects(
      () =>
        validateContractProposal(
          buildContractProposal(s.seen, s.reads, {
            corrections: [
              {
                key: "health.path",
                value: "/healthz",
                messageId: "m2",
                quote: "/healthz",
              },
            ],
          }),
          s.context,
        ),
      "not one of the engineer's own messages",
    );
    rejects(
      () =>
        validateContractProposal(
          buildContractProposal(s.seen, s.reads, {
            corrections: [
              {
                key: "health.path",
                value: "/healthz",
                messageId: "m1",
                quote: "/status",
              },
            ],
          }),
          s.context,
        ),
      "does not occur verbatim in the engineer's message",
    );
    const byDecision = buildContractProposal(s.seen, s.reads);
    (
      byDecision.fields.find((f) => f.key === "persistence.database")! as {
        provenance: unknown;
      }
    ).provenance = {
      kind: "user-confirmed",
      source: { type: "decision", decisionId: "d1" },
    };
    rejects(
      () => validateContractProposal(byDecision, s.context),
      "Decision d1 is not an active saved requirement",
    );
    s.decisions.set("d1", {
      id: "d1",
      applicationId: APP,
      sourceMessageId: "m1",
      kind: "launch-priority",
      label: "Saved requirement",
      value: "Use PostgreSQL",
      supersededById: null,
      createdAt: "2026-09-06T10:00:00.000Z",
    });
    expect(
      validateContractProposal(byDecision, s.context).body.fields.find(
        (f) => f.key === "persistence.database",
      )?.provenance,
    ).toMatchObject({ kind: "user-confirmed" });
  });

  it("keeps policy fields open and rejects invented values or wrong dependencies", () => {
    const s = scenario("fastapi-conforming");
    const defaulted = buildContractProposal(s.seen, s.reads);
    defaulted.fields.find((f) => f.key === "backup.policy")!.value = "nightly";
    defaulted.fields.find((f) => f.key === "backup.policy")!.provenance = {
      kind: "profile-rule",
      ruleId: "database",
    };
    rejects(
      () => validateContractProposal(defaulted, s.context),
      "backup.policy",
      "U1",
      "Record it as unresolved",
    );
    const wrongDependency = buildContractProposal(s.seen, s.reads);
    (
      wrongDependency.fields.find((f) => f.key === "backup.policy")!
        .provenance as { dependency: string }
    ).dependency = "U16";
    rejects(
      () => validateContractProposal(wrongDependency, s.context),
      "its open policy is U1, not U16",
    );
    const notPolicy = buildContractProposal(s.seen, s.reads);
    notPolicy.fields.find((f) => f.key === "network.port")!.value = null;
    notPolicy.fields.find((f) => f.key === "network.port")!.provenance = {
      kind: "unresolved",
      blocker: "policy",
      dependency: "U1",
      reason: "x",
    };
    rejects(
      () => validateContractProposal(notPolicy, s.context),
      "network.port: not a policy field",
    );
    const valued = buildContractProposal(s.seen, s.reads);
    valued.fields.find((f) => f.key === "verification.requiredChecks")!.value =
      "GET /health";
    rejects(
      () => validateContractProposal(valued, s.context),
      "verification.requiredChecks",
    );
  });

  it("requires every material field once and rejects unknown keys or empty values", () => {
    const s = scenario("fastapi-conforming");
    const missing = buildContractProposal(s.seen, s.reads);
    missing.fields = missing.fields.filter((f) => f.key !== "health.path");
    rejects(
      () => validateContractProposal(missing, s.context),
      "Missing material fields: health.path",
    );
    const duplicate = buildContractProposal(s.seen, s.reads);
    duplicate.fields.push({ ...duplicate.fields[0] });
    rejects(
      () => validateContractProposal(duplicate, s.context),
      "listed more than once",
    );
    const unknown = buildContractProposal(s.seen, s.reads);
    unknown.fields.push({ ...unknown.fields[0], key: "build.magic" });
    rejects(
      () => validateContractProposal(unknown, s.context),
      "build.magic: not a field",
    );
    const empty = buildContractProposal(s.seen, s.reads);
    empty.fields.find((f) => f.key === "build.packageManager")!.value = "   ";
    rejects(() => validateContractProposal(empty, s.context), "value is empty");
    rejects(
      () => validateContractProposal({ summary: "x" }, s.context),
      "must have required",
    );
  });

  it("rejects credential-shaped text anywhere in the proposal without echoing it", () => {
    const s = scenario("fastapi-conforming");
    const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab";
    const rejectsSafely = (input: unknown, path: string) => {
      let error: unknown;
      try {
        validateContractProposal(input, s.context);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ContractValidationError);
      const message = (error as Error).message;
      expect(message).toContain(
        `${path}: credential-shaped text is never recorded in a contract`,
      );
      expect(message).not.toContain(token);
      expect(message).not.toContain("ghp_");
    };
    const leaked = buildContractProposal(s.seen, s.reads);
    const secrets = leaked.fields.findIndex(
      (f) => f.key === "configuration.secretVariables",
    );
    leaked.fields[secrets].value = `SECRET_KEY=${token}`;
    rejectsSafely(leaked, `/fields/${secrets}/value`);
    // The summary, an engineer quote and a citation snippet are strings the
    // per-field scan never saw. Each is rejected by its JSON path, before any
    // later reason could repeat the value.
    const summary = buildContractProposal(s.seen, s.reads);
    summary.summary = `Synthetic token ${token} in the summary`;
    rejectsSafely(summary, "/summary");
    s.messages.set("m-secret", {
      id: "m-secret",
      chatId: "chat",
      role: "user",
      source: "user",
      body: `Use ${token} as the key`,
      createdAt: "2026-09-06T10:00:00.000Z",
      status: "completed",
      revision: 0,
    });
    const quoted = buildContractProposal(s.seen, s.reads, {
      corrections: [
        {
          key: "configuration.secretVariables",
          value: "SECRET_KEY",
          messageId: "m-secret",
          quote: `Use ${token} as the key`,
        },
      ],
    });
    rejectsSafely(quoted, `/fields/${secrets}/provenance/source/quote`);
    const snippet = buildContractProposal(s.seen, s.reads);
    const python = snippet.fields.findIndex(
      (f) => f.key === "build.pythonVersion",
    );
    (
      snippet.fields[python].provenance as {
        citation: { snippet: string };
      }
    ).citation.snippet = `requires-python = "${token}"`;
    rejectsSafely(snippet, `/fields/${python}/provenance/citation/snippet`);
    // A value that mismatches its rule is still explained, because it is not
    // credential-shaped; that message is the one the scan protects.
    const wrongValue = buildContractProposal(s.seen, s.reads);
    wrongValue.fields.find((f) => f.key === "build.packageManager")!.value =
      "pip";
    rejects(() => validateContractProposal(wrongValue, s.context), 'not "pip"');
  });

  it("proves absence only from an untruncated inspection at the same commit", () => {
    const s = scenario("fastapi-nolock");
    const proposal = buildContractProposal(s.seen, s.reads);
    const tool = proposal.fields.find((f) => f.key === "migrations.tool")!;
    expect(tool.provenance).toMatchObject({
      kind: "inferred",
      citation: { absent: "alembic.ini" },
    });
    // The nolock fixture is unmatched; validate the citation through a
    // matched context instead.
    const context = { ...s.context, profile: matched };
    // Absent path exists in the tree.
    (tool.provenance as { citation: { absent: string } }).citation.absent =
      "app/main.py";
    rejects(
      () => validateContractProposal(proposal, context),
      "app/main.py exists in the inspected tree",
    );
    (tool.provenance as { citation: { absent: string } }).citation.absent =
      "alembic.ini";
    s.observations.set(
      "inspection",
      inspectionObservation("fastapi-nolock", { truncated: true }),
    );
    rejects(
      () => validateContractProposal(proposal, context),
      "tree was truncated",
    );
    s.observations.set(
      "inspection",
      inspectionObservation("fastapi-nolock", { commitSha: OTHER_COMMIT }),
    );
    rejects(
      () => validateContractProposal(proposal, context),
      "not the contract commit",
    );
  });

  it("rejects profile selections with fabricated, foreign or stale evidence", () => {
    const s = scenario("fastapi-conforming");
    const proposed = buildContractProposal(s.seen, s.reads);
    const citation = proposed.profileSelection!.citations[0];
    const input = (patch: Partial<typeof citation>) => ({
      ...proposed,
      profileSelection: {
        ...proposed.profileSelection!,
        citations: [{ ...citation, ...patch }],
      },
    });
    rejects(
      () =>
        validateContractProposal(
          input({ snippet: "invented runtime claim" }),
          s.context,
        ),
      "Profile selection",
      "does not occur verbatim",
    );
    const original = s.observations.get(citation.observationId)!;
    s.observations.set(original.id, {
      ...original,
      applicationId: "another-app",
    });
    rejects(
      () => validateContractProposal(proposed, s.context),
      "Profile selection",
    );
    s.observations.set(original.id, {
      ...original,
      raw: { ...(original.raw as object), commitSha: OTHER_COMMIT },
    });
    rejects(
      () => validateContractProposal(proposed, s.context),
      "Profile selection",
    );
  });

  it("requires an available profile selection and a current revision reference", () => {
    const s = scenario("fastapi-conforming");
    const proposed = buildContractProposal(s.seen, s.reads);
    rejects(
      () =>
        validateContractProposal(
          { ...proposed, profileSelection: undefined },
          s.context,
        ),
      "Select an available application profile",
    );
    rejects(
      () =>
        validateContractProposal(
          {
            ...proposed,
            profileSelection: {
              ...proposed.profileSelection!,
              profileId: "django",
            },
          },
          s.context,
        ),
      "not currently supported",
    );
    // The old classifier has no veto: the model selects from cited evidence.
    expect(
      validateContractProposal(proposed, {
        ...s.context,
        profile: { ...matched, status: "pending" },
      }).body.profileSelection?.profileId,
    ).toBe("fastapi-uv");
    const existing = {
      id: "contract-1",
      version: 1,
      body: validateContractProposal(proposed, s.context).body,
    } as ApplicationContractRecord;
    rejects(
      () =>
        validateContractProposal(buildContractProposal(s.seen, s.reads), {
          ...s.context,
          currentContract: existing,
        }),
      "v1 (contract-1) already exists. Supply revises",
    );
    rejects(
      () =>
        validateContractProposal(
          buildContractProposal(s.seen, s.reads, { revises: "contract-1" }),
          s.context,
        ),
      "no contract to revise yet",
    );
    expect(
      validateContractProposal(
        buildContractProposal(s.seen, s.reads, { revises: "contract-1" }),
        { ...s.context, currentContract: existing },
      ).revises,
    ).toBe("contract-1");
  });

  it("reports provenance that no longer resolves and describes revisions", () => {
    const s = scenario("fastapi-conforming");
    const first = validateContractProposal(
      buildContractProposal(s.seen, s.reads),
      s.context,
    );
    const record: ApplicationContractRecord = {
      id: "c1",
      applicationId: APP,
      workspaceId: "ws",
      version: 1,
      profileId: first.body.profileId,
      profileVersion: first.body.profileVersion,
      commitSha: COMMIT,
      sourceMessageId: "m0",
      body: first.body,
      supersededById: null,
      createdAt: "2026-09-06T10:00:00.000Z",
    };
    const review = {
      applicationId: APP,
      commitSha: COMMIT,
      lookups: s.context.lookups,
    };
    expect(reviewContractProvenance(record, review)).toEqual([]);
    s.observations.delete("read:Dockerfile");
    const issues = reviewContractProvenance(record, review);
    expect(issues.map((issue) => issue.field)).toEqual([
      "build.containerImage",
      "runtime.startCommand",
      "runtime.application",
      "network.port",
      "network.bindHost",
    ]);
    s.messages.set("m1", {
      id: "m1",
      chatId: "chat",
      role: "user",
      source: "user",
      body: "Use /healthz",
      createdAt: "2026-09-06T10:00:00.000Z",
      status: "completed",
      revision: 0,
    });
    const revised = validateContractProposal(
      buildContractProposal(s.seen, s.reads, {
        revises: "c1",
        corrections: [
          {
            key: "health.path",
            value: "/healthz",
            messageId: "m1",
            quote: "/healthz",
          },
        ],
      }),
      {
        ...s.context,
        currentContract: record,
        lookups: {
          ...s.context.lookups,
          observation: (id) =>
            id === "read:Dockerfile"
              ? fileObservation(
                  "Dockerfile",
                  s.files.find((f) => f.path === "Dockerfile")!.content,
                )
              : (s.observations.get(id) ?? null),
        },
      },
    );
    expect(describeContractChanges(first.body, revised.body)).toEqual({
      count: 1,
      detail: "Health endpoint: /health → /healthz",
    });
    const confirmationOnly = {
      ...revised.body,
      fields: revised.body.fields.map((field) =>
        field.key === "health.path" ? { ...field, value: "/health" } : field,
      ),
    };
    expect(describeContractChanges(first.body, confirmationOnly)).toEqual({
      count: 1,
      detail:
        "Health endpoint: source changed from repository-declared to user-confirmed (value unchanged)",
    });
  });
});
