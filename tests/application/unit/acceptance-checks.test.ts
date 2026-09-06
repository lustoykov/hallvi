import { describe, expect, it } from "vitest";

import {
  AcceptanceChecksError,
  validateAcceptanceChecks,
  weakensAcceptedChecks,
} from "../../../src/server/acceptance-checks";
import type {
  AcceptanceChecksRecord,
  ApplicationContractRecord,
  Observation,
} from "../../../src/server/types";
import { repositoryFixtures } from "../../fixtures/repositories";

const COMMIT = "a".repeat(40);
const contract = {
  id: "c1",
  version: 1,
  commitSha: COMMIT,
} as ApplicationContractRecord;
const router = repositoryFixtures["fastapi-conforming"].find(
  (f) => f.path === "app/routes/todos.py",
)!;
const observation: Observation = {
  id: "read:todos",
  applicationId: "app",
  kind: "github-repository-file",
  status: "passed",
  summary: "read",
  sourceLabel: "Repository file · app/routes/todos.py",
  sourceUrl: null,
  raw: { commitSha: COMMIT, path: router.path, content: router.content },
  observedAt: "2026-09-06T10:00:00.000Z",
};
const ctx = {
  contract,
  citations: {
    applicationId: "app",
    commitSha: COMMIT,
    lookups: {
      observation: (id: string) => (id === observation.id ? observation : null),
    },
  },
};
const evidence = [
  {
    observationId: "read:todos",
    path: router.path,
    snippet: 'router = APIRouter(prefix="/todos", tags=["todos"])',
  },
];
const steps = [
  {
    name: "create",
    method: "POST" as const,
    path: "/todos",
    body: '{"title":"Buy milk"}',
    expectStatus: 201,
    expectBodyIncludes: ["Buy milk"],
  },
  {
    name: "list",
    method: "GET" as const,
    path: "/todos",
    expectStatus: 200,
    expectBodyIncludes: ["Buy milk"],
  },
];

describe("acceptance checks", () => {
  it("accepts steps grounded in cited route declarations and digests them", () => {
    const proposal = validateAcceptanceChecks(
      {
        rationale: "The todos router declares create and list.",
        steps,
        evidence,
      },
      ctx,
    );
    expect(proposal.steps).toHaveLength(2);
    expect(proposal.evidence[0]).toMatchObject({ path: router.path, line: 8 });
    expect(proposal.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal).toMatchObject({ contractId: "c1", contractVersion: 1 });
  });

  it("rejects routes no cited snippet declares, unresolvable citations and unasserted GET-only sets", () => {
    const rejects = (input: unknown, fragment: string) => {
      let error: unknown;
      try {
        validateAcceptanceChecks(input, ctx);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(AcceptanceChecksError);
      expect((error as Error).message).toContain(fragment);
    };
    rejects(
      { rationale: "x", steps: [{ ...steps[0], path: "/invented" }], evidence },
      "no cited snippet declares /invented",
    );
    rejects(
      {
        rationale: "x",
        steps,
        evidence: [{ ...evidence[0], snippet: "not in the file" }],
      },
      "does not occur verbatim",
    );
    rejects(
      {
        rationale: "x",
        steps: [
          { name: "list", method: "GET", path: "/todos", expectStatus: 200 },
        ],
        evidence,
      },
      "At least one step must write or assert on the body",
    );
    rejects(
      { rationale: "x", steps: [{ ...steps[0], body: "{not json" }], evidence },
      "body is not valid JSON",
    );
  });

  it("detects a definition weaker than the accepted one", () => {
    const accepted = { steps } as AcceptanceChecksRecord;
    expect(weakensAcceptedChecks(steps, accepted)).toBe(false);
    expect(weakensAcceptedChecks([steps[1]], accepted)).toBe(true);
    expect(
      weakensAcceptedChecks(
        steps.map((step) => ({ ...step, expectBodyIncludes: undefined })),
        accepted,
      ),
    ).toBe(true);
    expect(weakensAcceptedChecks(steps, null)).toBe(false);
  });
});
