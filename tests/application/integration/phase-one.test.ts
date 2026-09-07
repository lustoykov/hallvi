import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { pushTestDatabase } from "../../test-database";
import { executePiTurn } from "../../execute-pi-turn";
import { saveGithubConnection } from "../../../src/server/github-connection";

const mocks = vi.hoisted(() => ({
  askPi: vi.fn(),
  inspectGithubRepository: vi.fn(),
}));

vi.mock("../../../src/server/github", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/server/github")
  >("../../../src/server/github");
  return { ...actual, inspectGithubRepository: mocks.inspectGithubRepository };
});

vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.askPi,
  PiUnavailableError: class extends Error {},
}));

let databaseDirectory: string;
let databasePath: string;
let database: typeof import("../../../src/server/db");
let phaseOne: typeof import("../../../src/server/phase-one");

const passingInspection = {
  status: "passed" as const,
  summary: "lustoykov/todo-fastapi is readable at main · abcdef12.",
  sourceUrl: "https://github.com/lustoykov/todo-fastapi/commit/abcdef123456",
  raw: {
    connectionId: "00000000-0000-4000-8000-000000000001",
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
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", databaseDirectory);
  saveGithubConnection({
    id: passingInspection.raw.connectionId,
    mode: "app",
    clientId: "Iv1.fixture",
    slug: "server-guy-test",
    token: "ghu_QA-SYNTHETIC-TOKEN",
    expiresAt: null,
    account: { id: 1, login: "fixture" },
    connectedAt: new Date().toISOString(),
  });
  pushTestDatabase(databasePath);
  delete globalThis.__serverGuyDb;
  database = await import("../../../src/server/db");
  phaseOne = await import("../../../src/server/phase-one");
});

beforeEach(() => {
  saveGithubConnection({
    id: passingInspection.raw.connectionId,
    mode: "app",
    clientId: "Iv1.fixture",
    slug: "server-guy-test",
    token: "ghu_QA-SYNTHETIC-TOKEN",
    expiresAt: null,
    account: { id: 1, login: "fixture" },
    connectedAt: new Date().toISOString(),
  });
  database.db().$client.exec("DELETE FROM applications");
  mocks.askPi.mockReset();
  mocks.inspectGithubRepository.mockReset();
  mocks.inspectGithubRepository.mockResolvedValue(passingInspection);
});

afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  delete process.env.SERVER_GUY_DB_PATH;
  vi.unstubAllEnvs();
  rmSync(databaseDirectory, { recursive: true, force: true });
});

async function createApplication(
  approvalMode: "pi-decides" | "always-ask" = "pi-decides",
) {
  return phaseOne.createPhaseOneApplication({
    repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
    environment: "production",
    approvalMode,
  });
}

describe("repository verification after reconnecting", () => {
  const connectionId = "00000000-0000-4000-8000-000000000002";
  function reconnect() {
    saveGithubConnection({
      id: connectionId,
      mode: "app",
      clientId: "Iv1.fixture",
      slug: "server-guy-test",
      token: "ghu_QA-SYNTHETIC-TOKEN",
      expiresAt: null,
      account: { id: 2, login: "new-login" },
      connectedAt: new Date().toISOString(),
    });
    mocks.inspectGithubRepository.mockResolvedValue({
      ...passingInspection,
      raw: { ...passingInspection.raw, connectionId },
    });
    mocks.inspectGithubRepository.mockClear();
  }

  it("checks each existing application with the new connection, preserving chats and avoiding model calls", async () => {
    const first = await createApplication();
    await phaseOne.createPhaseOneApplication({
      repositoryUrl: "https://github.com/example/second",
      environment: "production",
      approvalMode: "always-ask",
    });
    reconnect();
    const results = await phaseOne.recheckGithubRepositories(connectionId);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "passed")).toBe(true);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(2);
    expect(mocks.askPi).not.toHaveBeenCalled();
    expect(
      phaseOne.getPhaseOneOperatorView(first.view.application!.id).messages,
    ).toEqual(first.view.messages);
    await phaseOne.recheckGithubRepositories(connectionId);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(2);
  });

  it("does nothing without existing applications", async () => {
    reconnect();
    expect(await phaseOne.recheckGithubRepositories(connectionId)).toEqual([]);
    expect(mocks.inspectGithubRepository).not.toHaveBeenCalled();
  });

  it("records denial without automatic retry loops, and keeps manual retry available", async () => {
    const { view } = await createApplication();
    reconnect();
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "failed",
      summary: "Grant repository access, then retry.",
      sourceUrl: null,
      raw: { connectionId },
    });
    expect(
      await phaseOne.recheckGithubRepositories(connectionId),
    ).toMatchObject([
      { status: "blocked", result: "Grant repository access, then retry." },
    ]);
    await phaseOne.recheckGithubRepositories(connectionId);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(1);
    await phaseOne.observeRepository(view.application!.id);
    expect(
      phaseOne.getPhaseOneOperatorView(view.application!.id).checks[1].status,
    ).toBe("passed");
  });

  it("shares simultaneous reconnect checks instead of writing duplicate observations", async () => {
    const { view } = await createApplication();
    reconnect();
    const results = await Promise.all([
      phaseOne.recheckGithubRepositories(connectionId),
      phaseOne.recheckGithubRepositories(connectionId),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(1);
    expect(database.listObservations(view.application!.id)).toHaveLength(2);
  });

  it("rejects a stale connection before sending any provider request", async () => {
    await createApplication();
    mocks.inspectGithubRepository.mockClear();
    await expect(
      phaseOne.recheckGithubRepositories(connectionId),
    ).rejects.toThrow("connection changed");
    expect(mocks.inspectGithubRepository).not.toHaveBeenCalled();
  });

  it.each(["disconnect", "replace"])(
    "discards a late observation after %s",
    async (operation) => {
      const { view } = await createApplication();
      reconnect();
      let finish!: (value: typeof passingInspection) => void;
      mocks.inspectGithubRepository.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = phaseOne.recheckGithubRepositories(connectionId);
      const rejected = expect(pending).rejects.toThrow("connection changed");
      saveGithubConnection(
        operation === "disconnect"
          ? null
          : {
              id: passingInspection.raw.connectionId,
              mode: "app",
              clientId: "Iv1.fixture",
              slug: "server-guy-test",
              token: "ghu_QA-SYNTHETIC-TOKEN",
              expiresAt: null,
              account: { id: 1, login: "replacement" },
              connectedAt: new Date().toISOString(),
            },
      );
      const observations = database.listObservations(view.application!.id);
      finish({
        ...passingInspection,
        raw: { ...passingInspection.raw, connectionId },
      });
      await rejected;
      expect(database.listObservations(view.application!.id)).toEqual(
        observations,
      );
    },
  );

  it("validates same-origin requests and the exact saved connection before running checks", async () => {
    const { POST } =
      await import("../../../src/app/api/github/setup/repositories/route");
    await createApplication();
    reconnect();
    const request = (body: object, origin = "http://localhost:3000") =>
      new Request("http://localhost:3000/api/github/setup/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    expect(
      (await POST(request({ connectionId }, "https://attacker.example")))
        .status,
    ).toBe(400);
    expect((await POST(request({ connectionId: "invalid" }))).status).toBe(400);
    expect((await POST(request({ connectionId, extra: true }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          request({ connectionId: passingInspection.raw.connectionId }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.inspectGithubRepository).not.toHaveBeenCalled();
    const response = await POST(request({ connectionId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ status: "passed" }]);
  });
});

describe("Phase 1 application workspace", () => {
  it("requires the exact repository before removing anything", async () => {
    const { view } = await createApplication();
    expect(() =>
      phaseOne.removeApplication(view.application!.id, "wrong/repo"),
    ).toThrow("exact repository");
    expect(phaseOne.getPhaseOneOperatorView(view.application!.id)).toEqual(
      view,
    );
    expect(() =>
      phaseOne.removeApplication("unknown", "lustoykov/todo-fastapi"),
    ).toThrow(phaseOne.NotFoundError);
  });

  it("removes only the selected application, including superseded decisions, then permits a fresh start", async () => {
    const { view } = await createApplication();
    const id = view.application!.id;
    const chatId = view.selectedChatId!;
    mocks.askPi.mockResolvedValueOnce({
      message: "First",
      decisionProposals: [{ kind: "launch-priority", value: "First" }],
    });
    const first = await executePiTurn(id, chatId, "First priority");
    mocks.askPi.mockResolvedValueOnce({
      message: "Second",
      decisionProposals: [
        {
          kind: "launch-priority",
          value: "Second",
          replaces: first.decisions[0].id,
        },
      ],
    });
    await executePiTurn(id, chatId, "Replace priority");
    const other = await phaseOne.createPhaseOneApplication({
      repositoryUrl: "https://github.com/example/other",
      environment: "production",
      approvalMode: "always-ask",
    });
    phaseOne.removeApplication(id, "lustoykov/todo-fastapi");
    expect(database.getApplication(id)).toBeNull();
    expect(database.getChat(chatId)).toBeNull();
    expect(database.listMessages(chatId)).toEqual([]);
    expect(database.getDecision(first.decisions[0].id)).toBeNull();
    expect(database.listObservations(id)).toEqual([]);
    expect(database.listActivity(view.workspace!.id)).toEqual([]);
    expect(
      phaseOne.getPhaseOneOperatorView(other.view.application!.id),
    ).toEqual(other.view);
    const fresh = await createApplication();
    expect(fresh.view.application!.id).not.toBe(id);
    expect(fresh.view.messages).toHaveLength(1);
    expect(fresh.view.decisions).toEqual([]);
  });

  it("cannot save an old in-flight Pi turn into a recreated application", async () => {
    const { view } = await createApplication();
    let finish!: (value: { message: string; decisionProposals: [] }) => void;
    mocks.askPi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = executePiTurn(
      view.application!.id,
      view.selectedChatId!,
      "Old message",
    );
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    phaseOne.removeApplication(view.application!.id, "lustoykov/todo-fastapi");
    const fresh = await createApplication();
    finish({ message: "Old reply", decisionProposals: [] });
    await rejected;
    expect(
      phaseOne.getPhaseOneOperatorView(fresh.view.application!.id),
    ).toEqual(fresh.view);
  });

  it("lists no applications before any have been added", () => {
    expect(phaseOne.listApplicationSummaries()).toEqual([]);
  });

  it("lists every application with its own derived checks, newest first", async () => {
    const first = await createApplication();
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "blocked",
      summary: "Repository unavailable.",
      sourceUrl: null,
      raw: {},
    });
    const second = await phaseOne.createPhaseOneApplication({
      repositoryUrl: "https://github.com/example/another-app",
      environment: "production",
      approvalMode: "always-ask",
    });
    const summaries = phaseOne.listApplicationSummaries();
    expect(summaries.map(({ application }) => application.id)).toEqual([
      second.view.application!.id,
      first.view.application!.id,
    ]);
    expect(summaries[0].passedChecks).toBeLessThan(summaries[0].totalChecks);
    expect(summaries[1]).toMatchObject({ passedChecks: 4, totalChecks: 4 });
    expect(summaries[0]).not.toHaveProperty("messages");
    expect(
      phaseOne.getPhaseOneOperatorView(first.view.application!.id),
    ).toEqual(first.view);
    expect(
      phaseOne.getPhaseOneOperatorView(second.view.application!.id).chats,
    ).not.toEqual(first.view.chats);
  });

  it("rejects an unknown application instead of opening another workspace", async () => {
    await createApplication();
    expect(() => phaseOne.getPhaseOneOperatorView("unknown")).toThrow(
      phaseOne.NotFoundError,
    );
  });

  it("stores durable inputs and derives four passing checks plus later requirements", async () => {
    const result = await createApplication();

    expect(result.created).toBe(true);
    expect(result.view.checks).toHaveLength(4);
    expect(result.view.checks.every((check) => check.status === "passed")).toBe(
      true,
    );
    expect(result.view.upcomingRequirements).toHaveLength(3);
    expect(
      result.view.upcomingRequirements.every(
        (item) => item.status === "missing",
      ),
    ).toBe(true);
    expect(
      result.view.observations.map((observation) => observation.kind),
    ).toEqual(["github-repository-identity"]);
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

  it.each([
    "Hosting must cost at most €30/month.",
    "Customer data must stay in the EU.",
  ])(
    "saves an optional app-specific requirement without changing the storage contract: %s",
    async (value) => {
      const created = await createApplication();
      mocks.askPi.mockResolvedValueOnce({
        message: "I recorded that requirement.",
        decisionProposals: [{ kind: "launch-priority", value }],
      });
      const result = await executePiTurn(
        created.view.application!.id,
        created.view.selectedChatId!,
        value,
      );
      expect(result.decisions).toEqual([
        expect.objectContaining({
          kind: "launch-priority",
          label: "Saved requirement",
          value,
        }),
      ]);
    },
  );

  it("shares Decisions across Chats while keeping transcripts separate", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const primaryChatId = created.view.selectedChatId!;
    mocks.askPi.mockResolvedValueOnce({
      message: "I recorded fast recovery.",
      decisionProposals: [
        { kind: "launch-priority", value: "Recover quickly" },
      ],
    });

    await executePiTurn(applicationId, primaryChatId, "Recovery matters.");
    const secondChat = phaseOne.createChat(applicationId, "Cost questions");

    expect(secondChat.decisions.map((decision) => decision.value)).toEqual([
      "Recover quickly",
    ]);
    expect(secondChat.messages.map((message) => message.role)).toEqual([
      "assistant",
    ]);
    expect(secondChat.chats).toHaveLength(2);
  });

  it("revises a Decision while preserving its originating Message and history", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    mocks.askPi.mockResolvedValueOnce({
      message: "I recorded fast recovery.",
      decisionProposals: [
        { kind: "launch-priority", value: "Recover quickly" },
      ],
    });
    const firstView = await executePiTurn(
      applicationId,
      chatId,
      "Recovery matters.",
    );
    const first = firstView.decisions[0];
    mocks.askPi.mockResolvedValueOnce({
      message: "I replaced that priority.",
      decisionProposals: [
        {
          kind: "launch-priority",
          value: "Prefer predictable cost",
          replaces: first.id,
        },
      ],
    });

    const revised = await executePiTurn(
      applicationId,
      chatId,
      "Actually, predictable cost matters more.",
    );
    const replacement = revised.decisions[0];
    const sourceMessage = database
      .db()
      .$client.prepare("SELECT body FROM messages WHERE id = ?")
      .get(replacement.sourceMessageId) as { body: string };

    expect(revised.decisions.map((decision) => decision.value)).toEqual([
      "Prefer predictable cost",
    ]);
    expect(database.getDecision(first.id)?.supersededById).toBe(replacement.id);
    expect(sourceMessage.body).toBe("Actually, predictable cost matters more.");
  });

  it("keeps accepted intent but no completed answer or Decisions after an invalid replacement", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    const before = created.view.messages;
    mocks.askPi.mockResolvedValueOnce({
      message: "I changed the decision.",
      decisionProposals: [
        {
          kind: "launch-priority",
          value: "Invented replacement",
          replaces: "00000000-0000-4000-8000-000000000000",
        },
      ],
    });

    await expect(
      executePiTurn(applicationId, chatId, "Replace the old priority."),
    ).rejects.toThrow("no Decisions were saved");

    const after = phaseOne.getPhaseOneOperatorView(applicationId, chatId);
    expect(after.messages.slice(0, before.length)).toEqual(before);
    expect(after.messages.slice(before.length)).toMatchObject([
      { role: "user", body: "Replace the old priority." },
      { role: "assistant", status: "failed" },
    ]);
    expect(after.decisions).toEqual([]);
  });

  it("keeps a failed attempt visible without treating it as a completed answer", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    const chatId = created.view.selectedChatId!;
    mocks.askPi.mockRejectedValueOnce(
      new Error("Pi is unavailable: no model is configured."),
    );

    await expect(
      executePiTurn(applicationId, chatId, "Recovery matters."),
    ).rejects.toThrow("no Decisions were saved");

    const view = phaseOne.getPhaseOneOperatorView(applicationId, chatId);
    expect(view.messages.map((message) => message.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    expect(view.messages.at(-1)?.status).toBe("failed");
  });

  it("derives readiness from the latest result without treating unavailability as failure", async () => {
    const created = await createApplication();
    const applicationId = created.view.application!.id;
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "failed",
      summary: "Repository not found.",
      sourceUrl: "https://github.com/lustoykov/todo-fastapi",
      raw: {
        repository: "lustoykov/todo-fastapi",
        error: "Not Found",
        connectionId: passingInspection.raw.connectionId,
      },
    });
    await phaseOne.observeRepository(applicationId);
    const failed = phaseOne.getPhaseOneOperatorView(applicationId);

    expect(
      failed.checks.find((check) => check.key === "repository-readable")
        ?.status,
    ).toBe("blocked");
    expect(failed.workspace?.status).toBe("in-progress");

    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "unavailable",
      summary: "GitHub inspection timed out.",
      sourceUrl: "https://github.com/lustoykov/todo-fastapi",
      raw: {
        repository: "lustoykov/todo-fastapi",
        error: "timeout",
        connectionId: passingInspection.raw.connectionId,
      },
    });
    const unavailableObservation =
      await phaseOne.observeRepository(applicationId);
    const unavailable = phaseOne.getPhaseOneOperatorView(applicationId);
    const repositoryCheck = unavailable.checks.find(
      (check) => check.key === "repository-readable",
    )!;

    expect(repositoryCheck.status).toBe("not-yet");
    expect(repositoryCheck.evidence[0].recordId).toBe(
      unavailableObservation.id,
    );
    expect(unavailable.workspace?.status).toBe("in-progress");
  });
});
