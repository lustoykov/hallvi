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

const passingInspection = {
  status: "passed" as const,
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
};

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
  mocks.inspectGithubRepository.mockResolvedValue(passingInspection);
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
  it("stores durable inputs and derives four passing checks plus later requirements", async () => {
    const result = await createApplication();

    expect(result.created).toBe(true);
    expect(result.view.checks).toHaveLength(4);
    expect(result.view.checks.every((check) => check.status === "passed")).toBe(true);
    expect(result.view.upcomingRequirements).toHaveLength(3);
    expect(result.view.upcomingRequirements.every((item) => item.status === "missing")).toBe(true);
    expect(result.view.observations.map((observation) => observation.kind)).toEqual([
      "github-repository-identity",
    ]);
    expect(result.view.application?.approvalMode).toBe("pi-decides");
    expect(result.view.workspace).toEqual(
      expect.objectContaining({
        phaseKey: "start",
        phaseNumber: 1,
        deliverable: "Launch Brief",
        status: "ready",
      }),
    );
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

  it("shares Decisions across Chats while keeping transcripts separate", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const primaryChatId = created.view.selectedChatId!;
    mocks.askPi.mockResolvedValueOnce({
      message: "I recorded fast recovery.",
      decisions: [{ kind: "launch-priority", value: "Recover quickly" }],
    });

    await phaseOne.sendChatMessage(applicationId, primaryChatId, "Recovery matters.");
    const secondChat = phaseOne.createChat(applicationId, "Cost questions");

    expect(secondChat.decisions.map((decision) => decision.value)).toEqual(["Recover quickly"]);
    expect(secondChat.messages.map((message) => message.role)).toEqual(["assistant"]);
    expect(secondChat.chats).toHaveLength(2);
  });

  it("revises a Decision while preserving its originating Message and history", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    mocks.askPi.mockResolvedValueOnce({
      message: "I recorded fast recovery.",
      decisions: [{ kind: "launch-priority", value: "Recover quickly" }],
    });
    const firstView = await phaseOne.sendChatMessage(applicationId, chatId, "Recovery matters.");
    const first = firstView.decisions[0];
    mocks.askPi.mockResolvedValueOnce({
      message: "I replaced that priority.",
      decisions: [
        {
          kind: "launch-priority",
          value: "Prefer predictable cost",
          replaces: first.id,
        },
      ],
    });

    const revised = await phaseOne.sendChatMessage(
      applicationId,
      chatId,
      "Actually, predictable cost matters more.",
    );
    const replacement = revised.decisions[0];
    const sourceMessage = database
      .db()
      .prepare("SELECT body FROM messages WHERE id = ?")
      .get(replacement.sourceMessageId) as { body: string };

    expect(revised.decisions.map((decision) => decision.value)).toEqual([
      "Prefer predictable cost",
    ]);
    expect(database.getDecision(first.id)?.supersededById).toBe(replacement.id);
    expect(sourceMessage.body).toBe("Actually, predictable cost matters more.");
  });

  it("rejects an invalid Decision replacement without committing a partial transcript", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    const before = created.view.messages;
    mocks.askPi.mockResolvedValueOnce({
      message: "I changed the decision.",
      decisions: [
        { kind: "launch-priority", value: "Invented replacement", replaces: "missing" },
      ],
    });

    await expect(
      phaseOne.sendChatMessage(applicationId, chatId, "Replace the old priority."),
    ).rejects.toThrow("missing, already replaced, or belongs to another application");

    const after = phaseOne.getPhaseOneOperatorView(applicationId, chatId);
    expect(after.messages).toEqual(before);
    expect(after.decisions).toEqual([]);
  });

  it("keeps a failed Pi turn out of the transcript", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    mocks.askPi.mockRejectedValueOnce(new Error("Pi is unavailable: no model is configured."));

    await expect(
      phaseOne.sendChatMessage(applicationId, chatId, "Recovery matters."),
    ).rejects.toThrow("Pi is unavailable");

    const view = phaseOne.getPhaseOneOperatorView(applicationId, chatId);
    expect(view.messages.map((message) => message.role)).toEqual(["assistant"]);
  });

  it("derives readiness from the latest result without treating unavailability as failure", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "failed",
      summary: "Repository not found.",
      sourceUrl: "https://github.com/lustoykov/todo-fastapi",
      raw: { repository: "lustoykov/todo-fastapi", error: "Not Found" },
    });
    await phaseOne.observeRepository(applicationId);
    const failed = phaseOne.getPhaseOneOperatorView(applicationId);

    expect(
      failed.checks.find((check) => check.key === "repository-readable")?.status,
    ).toBe("blocked");
    expect(failed.workspace?.status).toBe("in-progress");

    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "unavailable",
      summary: "GitHub inspection timed out.",
      sourceUrl: "https://github.com/lustoykov/todo-fastapi",
      raw: { repository: "lustoykov/todo-fastapi", error: "timeout" },
    });
    const unavailableObservation = await phaseOne.observeRepository(applicationId);
    const unavailable = phaseOne.getPhaseOneOperatorView(applicationId);
    const repositoryCheck = unavailable.checks.find(
      (check) => check.key === "repository-readable",
    )!;

    expect(repositoryCheck.status).toBe("not-yet");
    expect(repositoryCheck.evidence[0].recordId).toBe(unavailableObservation.id);
    expect(unavailable.workspace?.status).toBe("in-progress");
  });
});
