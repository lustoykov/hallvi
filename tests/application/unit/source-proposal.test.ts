import { describe, expect, it } from "vitest";

import {
  lineDiff,
  SourceProposalError,
  validateSourceProposal,
  type SourceProposalContext,
} from "../../../src/server/source-proposal";
import type { ApplicationContractRecord } from "../../../src/server/types";
import { fixtureTree, repositoryFixtures } from "../../fixtures/repositories";

const COMMIT = "a".repeat(40);
const contract = {
  id: "contract-1",
  version: 1,
  commitSha: COMMIT,
} as ApplicationContractRecord;

function context(
  overrides: Partial<SourceProposalContext> = {},
): SourceProposalContext {
  const files = repositoryFixtures["fastapi-nohealth"];
  return {
    contract,
    requiredFields: ["health.path"],
    treePaths: new Set(
      fixtureTree(files)
        .filter((e) => e.type === "blob")
        .map((e) => e.path),
    ),
    baseObservationId: (path) => (path === "app/main.py" ? "read:main" : null),
    ...overrides,
  };
}

const valid = () => ({
  summary: "Add GET /health returning 200.",
  changes: [
    {
      path: "app/main.py",
      content:
        "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/health')\ndef health():\n    return {'status': 'ok'}\n",
    },
  ],
  mapping: [
    {
      field: "health.path",
      paths: ["app/main.py"],
      explanation: "Adds the route.",
    },
  ],
});

const rejects = (
  input: unknown,
  ctx: SourceProposalContext,
  ...fragments: string[]
) => {
  let error: unknown;
  try {
    validateSourceProposal(input, ctx);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SourceProposalError);
  for (const fragment of fragments)
    expect((error as Error).message).toContain(fragment);
};

describe("source-change proposals", () => {
  it("accepts a complete, mapped change bound to the contract", () => {
    const proposal = validateSourceProposal(valid(), context());
    expect(proposal).toMatchObject({
      baseSha: COMMIT,
      contractId: "contract-1",
      contractVersion: 1,
      requestApproval: true,
      changes: [{ path: "app/main.py", baseObservationId: "read:main" }],
      mapping: [{ field: "health.path", paths: ["app/main.py"] }],
    });
    expect(proposal.filesDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects sensitive and denied paths as out of scope, with the reason", () => {
    rejects(
      {
        ...valid(),
        changes: [
          ...valid().changes,
          { path: ".github/workflows/ci.yml", content: "x" },
        ],
      },
      context(),
      ".github/workflows/ci.yml: outside the allowed scope (GitHub workflows",
    );
    rejects(
      { ...valid(), changes: [{ path: ".env", content: "SECRET=1" }] },
      context(),
      ".env",
    );
    rejects(
      { ...valid(), changes: [{ path: "../outside.py", content: "x" }] },
      context(),
      "without .. segments",
    );
  });

  it("requires an existing file to have been read before it is replaced, and refuses deleting what is absent", () => {
    rejects(
      valid(),
      context({ baseObservationId: () => null }),
      "app/main.py: read the current file with read_repository_file before replacing it",
    );
    rejects(
      { ...valid(), changes: [{ path: "app/nothing.py", delete: true }] },
      context(),
      "cannot delete a file that does not exist",
    );
  });

  it("requires every required change to be mapped to changed paths", () => {
    rejects(
      { ...valid(), mapping: [] },
      context(),
      "Required changes without a mapped path: health.path",
    );
    rejects(
      {
        ...valid(),
        mapping: [
          {
            field: "network.bindHost",
            paths: ["app/main.py"],
            explanation: "x",
          },
        ],
      },
      context(),
      "network.bindHost: not a required change in the brief",
    );
    rejects(
      {
        ...valid(),
        mapping: [
          { field: "health.path", paths: ["Dockerfile"], explanation: "x" },
        ],
      },
      context(),
      "mapped to paths that are not in this change: Dockerfile",
    );
  });

  it("rejects credential-shaped text by JSON path without echoing it", () => {
    const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab";
    let error: unknown;
    try {
      validateSourceProposal(
        {
          ...valid(),
          changes: [{ path: "app/main.py", content: `TOKEN = "${token}"` }],
        },
        context(),
      );
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toContain(
      "/changes/0/content: credential-shaped text",
    );
    expect((error as Error).message).not.toContain(token);
  });

  it("diffs lines with bounded context for review", () => {
    const diff = lineDiff("a\nb\nc\nd\ne\nf\ng\n", "a\nb\nc\nX\ne\nf\ng\n");
    expect(diff).toMatchObject({ added: 1, removed: 1 });
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]).toContain("-d");
    expect(diff.hunks[0]).toContain("+X");
    expect(lineDiff("", "new\n")).toMatchObject({ added: 1, removed: 0 });
  });
});
