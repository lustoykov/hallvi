// Application Activity inclusion rules: which outcomes become feed items, that
// each committed change produces exactly one, that rollbacks leave no success
// claim, and that a GitHub disconnect/replacement records its application
// consequence once. Reply diagnostics do not become application Activity.
import { randomUUID } from "node:crypto";
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
import {
  credentialFingerprint,
  readGithubConnection,
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import { disconnectGithub } from "../../../src/server/github-setup";
import type { PiDecision } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({ askPi: vi.fn(), inspect: vi.fn() }));
vi.mock("../../../src/server/github", async (original) => ({
  ...(await original<typeof import("../../../src/server/github")>()),
  inspectGithubRepository: mocks.inspect,
}));
// No real gh CLI, environment token or network: the CLI candidate is synthetic.
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  readGithubCliCredential: vi.fn(async () => ({
    token: "qa-cli-token",
    source: "gh" as const,
  })),
  githubJson: vi.fn(async () => ({
    data: { id: 7, login: "cli-user" },
    scopes: ["repo"],
  })),
  githubDeviceRequest: vi.fn(),
}));
vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.askPi,
}));

let root: string;
let store: typeof import("../../../src/server/db");
let phaseOne: typeof import("../../../src/server/phase-one");
let runs: typeof import("../../../src/server/pi-runs");
let worker: typeof import("../../../src/server/pi-worker");

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";
function login(id: string, account = 1): GithubConnection {
  return {
    id,
    mode: "cli",
    source: "gh",
    fingerprint: "0".repeat(64),
    account: { id: account, login: `login-${account}` },
    connectedAt: new Date().toISOString(),
  };
}
function passing(connectionId: string, repository = "qa/app") {
  return {
    status: "passed" as const,
    summary: `${repository} is readable at main · 12345678.`,
    sourceUrl: `https://github.com/${repository}/commit/1234567890abcdef`,
    raw: {
      connectionId,
      repository,
      repositoryId: 99,
      commitSha: "1234567890abcdef",
    },
  };
}
function failing(connectionId: string) {
  return {
    status: "failed" as const,
    summary: "Grant repository access, then retry.",
    sourceUrl: "https://github.com/qa/app",
    raw: { connectionId, repository: "qa/app", error: "denied" },
  };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "server-guy-activity-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("SERVER_GUY_TRACING", "0");
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  delete globalThis.__serverGuyDb;
  store = await import("../../../src/server/db");
  phaseOne = await import("../../../src/server/phase-one");
  runs = await import("../../../src/server/pi-runs");
  worker = await import("../../../src/server/pi-worker");
});
beforeEach(() => {
  saveGithubConnection(login(FIRST));
  store.db().$client.exec("DELETE FROM applications");
  // Evidence follows whichever login is saved when the check runs.
  mocks.inspect
    .mockReset()
    .mockImplementation(async (repository: { owner: string; name: string }) =>
      passing(
        readGithubConnection()?.id ?? FIRST,
        `${repository.owner}/${repository.name}`,
      ),
    );
  mocks.askPi.mockReset();
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

async function application(repository = "qa/app") {
  const { view } = await phaseOne.createPhaseOneApplication({
    repositoryUrl: `https://github.com/${repository}`,
    environment: "production",
    approvalMode: "pi-decides",
  });
  return {
    id: view.application!.id,
    workspaceId: view.workspace!.id,
    chatId: view.selectedChatId!,
  };
}
type App = Awaited<ReturnType<typeof application>>;
function feed(app: App) {
  return store
    .listActivity(app.workspaceId)
    .map((event) => [event.kind, event.summary, event.detail] as const);
}
function invalidated(app: App) {
  return feed(app).filter(
    ([kind]) => kind === "repository-verification-invalidated",
  );
}
async function reply(
  app: App,
  message: string,
  decisionProposals: PiDecision[] = [],
  activity?: (options: {
    onActivity: (signal: Record<string, unknown>) => void;
  }) => void,
) {
  mocks.askPi.mockImplementationOnce(async (_input, options) => {
    activity?.(options);
    return { message, decisionProposals };
  });
  const accepted = runs.sendChatMessage(
    app.id,
    app.chatId,
    message,
    randomUUID(),
  );
  await worker.executePiRun(runs.claimNextPiRun()!);
  return {
    run: runs.getPiRun(accepted.run.id)!,
  };
}

describe("application creation, checks and chat administration", () => {
  it("records workspace creation and the repository result once, and nothing for chat creation or archiving", async () => {
    const app = await application();
    const created = feed(app);
    expect(created).toEqual([
      [
        "repository-observed",
        "Repository identity recorded",
        "qa/app is readable at main · 12345678.",
      ],
      [
        "workspace-created",
        "Application workspace created",
        expect.stringContaining("https://github.com/qa/app"),
      ],
    ]);
    const view = phaseOne.createChat(app.id, "Side question");
    phaseOne.archiveChat(app.id, view.selectedChatId!);
    const chats = store.listChats(app.workspaceId);
    expect(chats).toHaveLength(2);
    expect(chats[1].archivedAt).not.toBeNull();
    expect(feed(app)).toEqual(created);
  });

  it("records each explicit recheck outcome truthfully", async () => {
    const app = await application();
    mocks.inspect.mockResolvedValueOnce(failing(FIRST));
    await phaseOne.observeRepository(app.id);
    expect(feed(app)[0]).toEqual([
      "repository-unavailable",
      "Repository check did not pass",
      "Grant repository access, then retry.",
    ]);
    await phaseOne.observeRepository(app.id);
    expect(feed(app)[0]).toEqual([
      "repository-observed",
      "Repository identity recorded",
      "qa/app is readable at main · 12345678.",
    ]);
    expect(feed(app)).toHaveLength(4);
  });

  it("keeps stored reply history and legacy chat rows out of the feed without deleting them", async () => {
    const app = await application();
    store.insertActivity(app.workspaceId, "chat-created", "Chat created", "x");
    store.insertActivity(
      app.workspaceId,
      "chat-archived",
      "Chat archived",
      "x",
    );
    await reply(app, "Hello");
    expect(feed(app).map(([kind]) => kind)).toEqual([
      "repository-observed",
      "workspace-created",
    ]);
    const stored = store
      .db()
      .$client.prepare(
        "select kind from activity_events where workspace_id = ? order by rowid",
      )
      .all(app.workspaceId) as { kind: string }[];
    expect(stored.map((row) => row.kind)).toEqual([
      "workspace-created",
      "repository-observed",
      "chat-created",
      "chat-archived",
    ]);
    expect(runs.chatRunSnapshot(app.id, app.chatId)).not.toHaveProperty(
      "executions",
    );
  });
});

describe("decisions", () => {
  it("adds no application event for an ordinary answer or a lookup", async () => {
    const app = await application();
    const before = feed(app);
    const lookup = await reply(app, "No saved requirements yet.", [], (o) => {
      o.onActivity({ type: "start", key: "tool:1", kind: "search_decisions" });
      o.onActivity({ type: "end", key: "tool:1" });
      // A status read changes nothing either; it stays with the reply.
      o.onActivity({
        type: "start",
        key: "tool:2",
        kind: "get_application_status",
      });
      o.onActivity({ type: "end", key: "tool:2" });
    });
    expect(lookup.run.status).toBe("succeeded");
    expect(feed(app)).toEqual(before);
  });

  it("records one event per committed Decision and one old → new event per replacement", async () => {
    const app = await application();
    const before = feed(app);
    const saved = await reply(app, "Saved.", [
      { kind: "launch-priority", value: "Budget at most €30/month" },
    ]);
    expect(saved.run.status).toBe("succeeded");
    expect(feed(app)).toEqual([
      ["decision-recorded", "Requirement saved", "Budget at most €30/month"],
      ...before,
    ]);
    const previous = store.listActiveDecisions(app.id)[0];
    const changed = await reply(app, "Updated.", [
      {
        kind: "launch-priority",
        value: "Budget at most €50/month",
        replaces: previous.id,
      },
      { kind: "launch-priority", value: "Customer data stays in the EU" },
    ]);
    expect(changed.run.status).toBe("succeeded");
    expect(feed(app).slice(0, 2)).toEqual([
      [
        "decision-recorded",
        "Requirement saved",
        "Customer data stays in the EU",
      ],
      [
        "decision-revised",
        "Requirement changed",
        "Budget at most €30/month → Budget at most €50/month",
      ],
    ]);
    expect(feed(app)).toHaveLength(before.length + 3);
    expect(store.getDecision(previous.id)?.supersededById).not.toBeNull();
  });

  it("rolls back a rejected save without a success event; the failed attempt remains recorded", async () => {
    const app = await application();
    const before = feed(app);
    const rejected = await reply(
      app,
      "Saved both.",
      [
        { kind: "launch-priority", value: "Valid" },
        { kind: "launch-priority", value: "Invalid", replaces: randomUUID() },
      ],
      (o) => {
        o.onActivity({
          type: "start",
          key: "tool:1",
          kind: "propose_decision",
        });
        o.onActivity({ type: "end", key: "tool:1" });
      },
    );
    expect(rejected.run.status).toBe("failed");
    expect(store.listActiveDecisions(app.id)).toEqual([]);
    expect(feed(app)).toEqual(before);
  });

  it("adds no event for a cancelled attempt", async () => {
    const app = await application();
    const before = feed(app);
    const accepted = runs.sendChatMessage(
      app.id,
      app.chatId,
      "Slow",
      randomUUID(),
    );
    runs.cancelPiRun(app.id, app.chatId, accepted.run.id);
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("cancelled");
    expect(feed(app)).toEqual(before);
  });
});

describe("repository verification invalidation", () => {
  it("records one consequence per affected application on disconnect, never on reads, refreshes or repeated disconnects", async () => {
    const verified = await application("qa/verified");
    const blocked = await application("qa/blocked");
    mocks.inspect.mockResolvedValueOnce(failing(FIRST));
    await phaseOne.observeRepository(blocked.id);
    const verifiedBefore = feed(verified);
    const blockedBefore = feed(blocked);
    phaseOne.getPhaseOneOperatorView(verified.id);
    runs.chatRunSnapshot(verified.id, verified.chatId);
    expect(feed(verified)).toEqual(verifiedBefore);

    await phaseOne.withGithubConnectionTransition(() => disconnectGithub());
    expect(feed(verified)).toEqual([
      [
        "repository-verification-invalidated",
        "Repository verification invalidated",
        expect.stringContaining("GitHub was disconnected"),
      ],
      ...verifiedBefore,
    ]);
    const detail = feed(verified)[0][2];
    expect(detail).toContain("does not show that access was lost");
    expect(detail).toContain("Earlier result: qa/verified is readable at main");
    expect(feed(blocked)).toEqual(blockedBefore);
    expect(phaseOne.getPhaseOneOperatorView(verified.id).checks[1].status).toBe(
      "not-yet",
    );

    await phaseOne.withGithubConnectionTransition(() => disconnectGithub());
    phaseOne.getPhaseOneOperatorView(verified.id);
    expect(invalidated(verified)).toHaveLength(1);
  });

  it("records a replacement once even when concurrent requests observe the same transition, and the fresh check adds its own result", async () => {
    const app = await application();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const replace = async () => {
      await gate;
      saveGithubConnection(login(SECOND, 2));
    };
    const pending = Promise.all([
      phaseOne.withGithubConnectionTransition(replace),
      phaseOne.withGithubConnectionTransition(replace),
    ]);
    release();
    await pending;
    expect(invalidated(app)).toHaveLength(1);
    expect(feed(app)[0][2]).toContain("The GitHub connection was replaced");
    expect(phaseOne.getPhaseOneOperatorView(app.id).checks[1].status).toBe(
      "not-yet",
    );

    await phaseOne.recheckGithubRepositories(SECOND);
    expect(feed(app)[0]).toEqual([
      "repository-observed",
      "Repository identity recorded",
      "qa/app is readable at main · 12345678.",
    ]);
    expect(phaseOne.getPhaseOneOperatorView(app.id).checks[1].status).toBe(
      "passed",
    );
    expect(invalidated(app)).toHaveLength(1);

    // A later disconnect is a new transition against the new verification.
    await phaseOne.withGithubConnectionTransition(() => disconnectGithub());
    expect(invalidated(app)).toHaveLength(2);
    expect(feed(app)[0][2]).toContain("GitHub was disconnected");
  });

  it("records nothing when the latest check did not pass, or when the same login only renews", async () => {
    const app = await application();
    mocks.inspect.mockResolvedValueOnce(failing(FIRST));
    await phaseOne.observeRepository(app.id);
    const before = feed(app);
    await phaseOne.withGithubConnectionTransition(() =>
      saveGithubConnection({
        ...login(FIRST),
        connectedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    await phaseOne.withGithubConnectionTransition(() => disconnectGithub());
    expect(feed(app)).toEqual(before);
  });

  it("records the consequence through the disconnect and reuse routes", async () => {
    const app = await application();
    const { DELETE, POST } =
      await import("../../../src/app/api/github/setup/route");
    const origin = "http://localhost:3000";
    const disconnected = await DELETE(
      new Request(`${origin}/api/github/setup`, {
        method: "DELETE",
        headers: { Origin: origin },
        body: JSON.stringify({ confirm: "disconnect" }),
      }),
    );
    expect(disconnected.status).toBe(200);
    expect(invalidated(app)).toHaveLength(1);
    expect(await disconnected.text()).not.toContain("qa-cli-token");

    const reused = await POST(
      new Request(`${origin}/api/github/setup`, {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({
          candidateId: credentialFingerprint("qa-cli-token", "gh"),
        }),
      }),
    );
    expect(reused.status).toBe(200);
    // Reconnecting after a disconnect finds no current verification to
    // invalidate; the automatic recheck records the new result instead.
    expect(invalidated(app)).toHaveLength(1);
    const connection = readGithubConnection()!;
    expect(connection.id).not.toBe(FIRST);
    await phaseOne.recheckGithubRepositories(connection.id);
    expect(feed(app)[0][0]).toBe("repository-observed");
    expect(invalidated(app)).toHaveLength(1);
  });
});
