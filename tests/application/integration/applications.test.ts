// Applications and their conversations: creation with a repository access
// check, the GitHub reconnect check and its manual retry, removal, and the
// requirements every conversation of an application shares.
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
import {
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";

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
let applications: typeof import("../../../src/server/applications");
let views: typeof import("../../../src/server/operator-view");
let list: typeof import("../../../src/server/application-list");

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
function connection(id: string, login: string, account = 1): GithubConnection {
  return {
    id,
    mode: "app",
    clientId: "Iv1.fixture",
    slug: "server-guy-test",
    token: "ghu_QA-SYNTHETIC-TOKEN",
    expiresAt: null,
    account: { id: account, login },
    connectedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-applications-"));
  databasePath = join(databaseDirectory, "test.db");
  process.env.SERVER_GUY_DB_PATH = databasePath;
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", databaseDirectory);
  saveGithubConnection(
    connection(passingInspection.raw.connectionId, "fixture"),
  );
  pushTestDatabase(databasePath);
  delete globalThis.__serverGuyDb;
  database = await import("../../../src/server/db");
  applications = await import("../../../src/server/applications");
  views = await import("../../../src/server/operator-view");
  list = await import("../../../src/server/application-list");
});

beforeEach(() => {
  saveGithubConnection(
    connection(passingInspection.raw.connectionId, "fixture"),
  );
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
  input: { requestKey?: string; name?: string; repositoryUrl?: string } = {},
) {
  const { application, created } = await applications.createApplication({
    repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
    ...input,
  });
  return { created, view: views.getOperatorView(application.id) };
}
/** The manual repository check, posted as the application page posts it. */
async function checkAgain(
  applicationId: string,
  origin = "http://localhost:3000",
) {
  const { POST } =
    await import("../../../src/app/api/applications/[applicationId]/repository-check/route");
  return POST(
    new Request(
      `http://localhost:3000/api/applications/${applicationId}/repository-check`,
      { method: "POST", headers: { Origin: origin } },
    ),
    { params: Promise.resolve({ applicationId }) },
  );
}

describe("repository verification after reconnecting", () => {
  const connectionId = "00000000-0000-4000-8000-000000000002";
  function reconnect() {
    saveGithubConnection(connection(connectionId, "new-login", 2));
    mocks.inspectGithubRepository.mockResolvedValue({
      ...passingInspection,
      raw: { ...passingInspection.raw, connectionId },
    });
    mocks.inspectGithubRepository.mockClear();
  }

  it("checks each existing application with the new connection, preserving chats and avoiding model calls", async () => {
    const first = await createApplication();
    await applications.createApplication({
      repositoryUrl: "https://github.com/example/second",
    });
    reconnect();
    const results = await applications.recheckGithubRepositories(connectionId);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "passed")).toBe(true);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(2);
    expect(mocks.askPi).not.toHaveBeenCalled();
    expect(views.getOperatorView(first.view.application!.id).messages).toEqual(
      first.view.messages,
    );
    await applications.recheckGithubRepositories(connectionId);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(2);
  });

  it("does nothing without existing applications", async () => {
    reconnect();
    expect(await applications.recheckGithubRepositories(connectionId)).toEqual(
      [],
    );
    expect(mocks.inspectGithubRepository).not.toHaveBeenCalled();
  });

  it("records denial without automatic retry loops, and keeps the manual check available", async () => {
    const { view } = await createApplication();
    const id = view.application!.id;
    reconnect();
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "failed",
      summary: "Grant repository access, then retry.",
      sourceUrl: null,
      raw: { connectionId },
    });
    expect(
      await applications.recheckGithubRepositories(connectionId),
    ).toMatchObject([
      { status: "blocked", result: "Grant repository access, then retry." },
    ]);
    await applications.recheckGithubRepositories(connectionId);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(1);
    expect(views.getOperatorView(id).repository).toEqual({
      status: "blocked",
      result: "Grant repository access, then retry.",
      checkedAt: expect.any(String),
      connected: true,
    });
    // A cross-origin request reaches no provider.
    expect((await checkAgain(id, "https://attacker.example")).status).toBe(400);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(1);
    // After the owner grants access, the application's own check passes.
    const response = await checkAgain(id);
    expect(response.status).toBe(200);
    expect((await response.json()).repository).toMatchObject({
      status: "passed",
      connected: true,
    });
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(2);
    expect(mocks.askPi).not.toHaveBeenCalled();
  });

  it("shares simultaneous reconnect checks instead of writing duplicate observations", async () => {
    const { view } = await createApplication();
    reconnect();
    const results = await Promise.all([
      applications.recheckGithubRepositories(connectionId),
      applications.recheckGithubRepositories(connectionId),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(mocks.inspectGithubRepository).toHaveBeenCalledTimes(1);
    expect(database.listObservations(view.application!.id)).toHaveLength(2);
  });

  it("rejects a stale connection before sending any provider request", async () => {
    await createApplication();
    mocks.inspectGithubRepository.mockClear();
    await expect(
      applications.recheckGithubRepositories(connectionId),
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
      const pending = applications.recheckGithubRepositories(connectionId);
      const rejected = expect(pending).rejects.toThrow("connection changed");
      saveGithubConnection(
        operation === "disconnect"
          ? null
          : connection(passingInspection.raw.connectionId, "replacement"),
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

  it("offers GitHub setup instead of a check when no login is saved", async () => {
    const { view } = await createApplication();
    saveGithubConnection(null);
    expect(views.getOperatorView(view.application!.id).repository).toEqual({
      status: "not-yet",
      result: "Connect GitHub, then run the repository check.",
      checkedAt: null,
      connected: false,
    });
  });
});

describe("applications and conversations", () => {
  it("requires the exact repository before removing anything", async () => {
    const { view } = await createApplication();
    expect(() =>
      applications.removeApplication(view.application!.id, "wrong/repo"),
    ).toThrow("exact repository");
    expect(views.getOperatorView(view.application!.id)).toEqual(view);
    expect(() =>
      applications.removeApplication("unknown", "lustoykov/todo-fastapi"),
    ).toThrow(applications.NotFoundError);
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
    const other = await createApplication({
      repositoryUrl: "https://github.com/example/other",
    });
    applications.removeApplication(id, "lustoykov/todo-fastapi");
    expect(database.getApplication(id)).toBeNull();
    expect(database.getChat(chatId)).toBeNull();
    expect(database.listMessages(chatId)).toEqual([]);
    expect(database.getDecision(first.decisions[0].id)).toBeNull();
    expect(database.listObservations(id)).toEqual([]);
    expect(database.listActivity(id)).toEqual([]);
    expect(views.getOperatorView(other.view.application!.id)).toEqual(
      other.view,
    );
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
    applications.removeApplication(
      view.application!.id,
      "lustoykov/todo-fastapi",
    );
    const fresh = await createApplication();
    finish({ message: "Old reply", decisionProposals: [] });
    await rejected;
    expect(views.getOperatorView(fresh.view.application!.id)).toEqual(
      fresh.view,
    );
  });

  it("lists no applications before any have been added", () => {
    expect(list.listApplicationItems()).toEqual([]);
  });

  it("lists every application from its own records, newest first", async () => {
    const first = await createApplication();
    mocks.inspectGithubRepository.mockResolvedValueOnce({
      status: "failed",
      summary: "Repository unavailable.",
      sourceUrl: null,
      raw: { connectionId: passingInspection.raw.connectionId },
    });
    const second = await createApplication({
      repositoryUrl: "https://github.com/example/another-app",
    });
    const items = list.listApplicationItems();
    expect(items.map((item) => item.id)).toEqual([
      second.view.application!.id,
      first.view.application!.id,
    ]);
    expect(items[0]).toMatchObject({
      source: "example/another-app",
      condition: { text: "Not deployed" },
      stack: "Not deployed yet",
      attention: 0,
    });
    expect(items[0]).not.toHaveProperty("messages");
    expect(views.getOperatorView(first.view.application!.id)).toEqual(
      first.view,
    );
    expect(
      views.getOperatorView(second.view.application!.id).repository,
    ).toEqual(expect.objectContaining({ status: "blocked" }));
  });

  it("rejects an unknown application instead of opening another", async () => {
    await createApplication();
    expect(() => views.getOperatorView("unknown")).toThrow(
      applications.NotFoundError,
    );
  });

  it("records the application, its first conversation and the repository check", async () => {
    const result = await createApplication();
    expect(result.created).toBe(true);
    const { view } = result;
    expect(view.application).toMatchObject({
      name: "todo-fastapi",
      repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
      repositoryOwner: "lustoykov",
      repositoryName: "todo-fastapi",
    });
    expect(view.chats.map((chat) => chat.title)).toEqual(["Main operator"]);
    expect(view.messages).toMatchObject([
      { role: "assistant", source: "server-guy" },
    ]);
    expect(view.repository).toEqual({
      status: "passed",
      result: passingInspection.summary,
      checkedAt: expect.any(String),
      connected: true,
    });
    expect(
      database
        .listObservations(view.application!.id)
        .map((observation) => observation.kind),
    ).toEqual(["github-repository-identity"]);
    expect(view.decisions).toEqual([]);
    expect(view.activity.map((event) => event.kind)).toEqual([
      "repository-observed",
      "application-created",
    ]);
  });

  it("deduplicates a creation request without making repository identity unique", async () => {
    const input = {
      requestKey: "00000000-0000-4000-8000-000000000099",
      repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
    };
    const first = await createApplication(input);
    const repeated = await createApplication(input);

    expect(repeated.created).toBe(false);
    expect(repeated.view.application?.id).toBe(first.view.application?.id);
    const separate = await createApplication({
      ...input,
      requestKey: "00000000-0000-4000-8000-000000000098",
      name: "Staging",
    });
    expect(separate.view.application?.id).not.toBe(first.view.application?.id);
    expect(separate.view.application?.name).toBe("Staging");
    expect(separate.view.selectedChatId).not.toBe(first.view.selectedChatId);
    await expect(
      applications.createApplication({ ...input, name: "Renamed" }),
    ).rejects.toBeInstanceOf(applications.ExistingApplicationConflictError);
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
    const chat = applications.createChat(applicationId, "Cost questions");
    const second = views.getOperatorView(applicationId, chat.id);

    expect(second.decisions.map((decision) => decision.value)).toEqual([
      "Recover quickly",
    ]);
    expect(second.messages.map((message) => message.role)).toEqual([
      "assistant",
    ]);
    expect(second.chats).toHaveLength(2);
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

    const after = views.getOperatorView(applicationId, chatId);
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

    const view = views.getOperatorView(applicationId, chatId);
    expect(view.messages.map((message) => message.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    expect(view.messages.at(-1)?.status).toBe("failed");
  });

  it("reports repository access from the latest result without treating unavailability as failure", async () => {
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
    await applications.observeRepository(applicationId);
    expect(views.getOperatorView(applicationId).repository).toMatchObject({
      status: "blocked",
      result: "Repository not found.",
    });

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
    const unavailable = await applications.observeRepository(applicationId);
    expect(views.getOperatorView(applicationId).repository).toEqual({
      status: "not-yet",
      result: "GitHub inspection timed out.",
      checkedAt: unavailable.observedAt,
      connected: true,
    });
  });
});
