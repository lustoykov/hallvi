import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  askPi: vi.fn(),
  inspectGithubRepository: vi.fn(),
}));

vi.mock("../src/server/github", async () => {
  const actual = await vi.importActual<typeof import("../src/server/github")>(
    "../src/server/github",
  );
  return { ...actual, inspectGithubRepository: mocks.inspectGithubRepository };
});

vi.mock("../src/server/pi", () => ({ askPi: mocks.askPi }));

let databaseDirectory: string;
let databasePath: string;
let database: typeof import("../src/server/db");
let phaseOne: typeof import("../src/server/phase-one");

beforeAll(async () => {
  databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-phase-one-"));
  databasePath = join(databaseDirectory, "test.db");
  process.env.SERVER_GUY_DB_PATH = databasePath;
  delete globalThis.__serverGuyDb;
  database = await import("../src/server/db");
  phaseOne = await import("../src/server/phase-one");
});

beforeEach(() => {
  database.db().exec("DELETE FROM applications");
  mocks.askPi.mockReset();
  mocks.inspectGithubRepository.mockReset();
  mocks.inspectGithubRepository.mockResolvedValue({
    status: "passed",
    summary: "lustoykov/todo-fastapi is readable at main · abcdef12.",
    sourceUrl: "https://github.com/lustoykov/todo-fastapi/commit/abcdef123456",
    raw: {
      repository: "lustoykov/todo-fastapi",
      defaultBranch: "main",
      commitSha: "abcdef123456",
      commitUrl: "https://github.com/lustoykov/todo-fastapi/commit/abcdef123456",
      authenticatedAs: "lustoykov",
      permissions: { pull: true },
    },
  });
});

afterAll(() => {
  globalThis.__serverGuyDb?.close();
  delete globalThis.__serverGuyDb;
  delete process.env.SERVER_GUY_DB_PATH;
  rmSync(databaseDirectory, { recursive: true, force: true });
});

async function createApplication(approvalMode: "pi-decides" | "always-ask" = "pi-decides") {
  return phaseOne.createPhaseOneApplication({
    repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
    environment: "production",
    approvalMode,
  });
}

describe("Phase 1 application workspace", () => {
  it("records the launch, authority context, prerequisites, and five passing checks", async () => {
    const result = await createApplication();

    expect(result.created).toBe(true);
    expect(result.view.checks).toHaveLength(5);
    expect(result.view.checks.every((check) => check.status === "passed")).toBe(true);
    expect(result.view.blockers).toHaveLength(3);
    expect(result.view.observations.map((observation) => observation.kind)).toEqual(
      expect.arrayContaining(["github-repository-identity", "authority-context"]),
    );
    expect(result.view.application?.approvalMode).toBe("pi-decides");
    expect(result.view.application?.status).toBe("phase-1-ready");
    expect(result.view.decisions).toEqual([]);
  });

  it("is idempotent for the same policy and rejects a conflicting policy", async () => {
    const first = await createApplication();
    const repeated = await createApplication();

    expect(repeated.created).toBe(false);
    expect(repeated.view.application?.id).toBe(first.view.application?.id);
    await expect(createApplication("always-ask")).rejects.toBeInstanceOf(
      phaseOne.ExistingApplicationConflictError,
    );
  });

  it("preserves each Operator Session priority without treating application policy as a decision", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const sessionId = created.view.activeSessionId!;
    mocks.askPi
      .mockResolvedValueOnce({
        message: "I recorded fast recovery.",
        decisions: [{ kind: "launch-priority", value: "Recover quickly" }],
      })
      .mockResolvedValueOnce({
        message: "I recorded predictable cost.",
        decisions: [{ kind: "launch-priority", value: "Keep spend predictable" }],
      });

    await phaseOne.sendOperatorMessage(applicationId, sessionId, "Recovery matters.");
    const view = await phaseOne.sendOperatorMessage(applicationId, sessionId, "Keep spend predictable.");
    const priorities = view.decisions.filter(
      (decision) => decision.label === "Additional launch priority",
    );

    expect(priorities.map((decision) => decision.value)).toEqual([
      "Recover quickly",
      "Keep spend predictable",
    ]);
    expect(view.application?.approvalMode).toBe("pi-decides");
  });

  it("does not rewrite provenance timestamps when completion is recomputed", async () => {
    const created = await createApplication();
    const application = created.view.application!;
    const workspace = created.view.workspace!;

    database.updateApplicationStatus(application.id, "phase-1-ready");
    database.updateWorkspaceStatus(workspace.id, "ready");

    expect(database.getApplication(application.id)?.updatedAt).toBe(application.updatedAt);
    expect(database.getWorkspace(application.id)?.updatedAt).toBe(workspace.updatedAt);
  });
});
