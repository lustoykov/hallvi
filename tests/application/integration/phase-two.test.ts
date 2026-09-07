// Phase 2 end to end over real SQLite, the real worker and the actual SDK
// tool loop: the explicit transition, deterministic inspection, Pi's bounded
// pinned reads saved as Observations, contract proposals validated twice,
// cancellation/retry/revision boundaries, phase-aware status, connection and
// revision invalidation, isolation and removal. GitHub and the model are
// synthetic; everything else is the production code path.
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

import * as store from "../../../src/server/db";
import { diagnosticLogPath } from "../../../src/server/diagnostics";
import { GithubAccessError } from "../../../src/server/github-api";
import {
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import {
  getOperatorView,
  getApplicationStatus,
} from "../../../src/server/operator-view";
import * as phaseOne from "../../../src/server/phase-one";
import {
  completeLaunchBrief,
  completeInspectApp,
  INSPECTION_REQUEST,
} from "../../../src/server/phase-transition";
import {
  inspectRepository,
  repositoryEvidence,
} from "../../../src/server/phase-two";
import {
  previewRevisionCorrection,
  applyRevisionCorrection,
} from "../../../src/server/revision-correction";
import * as runs from "../../../src/server/pi-runs";
import { executePiRun } from "../../../src/server/pi-worker";
import {
  buildContractProposal,
  CONTRACT_READ_ORDER,
  treePaths,
  type SeenRead,
} from "../../fixtures/contract-builder";
import {
  contentsResponse,
  fixtureCommitSha,
  treeResponse,
} from "../../fixtures/github-responses";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({
  githubJson: vi.fn(),
  configure: vi.fn(),
  cli: vi.fn(),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  githubJson: mocks.githubJson,
  githubDeviceRequest: vi.fn(() => {
    throw new Error("No GitHub login in Phase 2 tests");
  }),
  readGithubCliCredential: mocks.cli,
}));
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-configuration")>()),
  configuredPiRuntime: mocks.configure,
}));

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";
const TOKEN = "QA-GITHUB-TOKEN";
function login(id: string): GithubConnection {
  return {
    id,
    mode: "app",
    clientId: "Iv1.fixture",
    slug: "server-guy-test",
    token: "ghu_QA-SYNTHETIC-TOKEN",
    expiresAt: null,
    account: { id: 1, login: "fixture" },
    connectedAt: new Date().toISOString(),
  };
}

// Synthetic GitHub: identity, pinned commit per revision, fixture trees and
// contents. Failures are injected per path pattern.
const github = {
  revision: "1",
  failing: [] as RegExp[],
  calls: [] as string[],
};
mocks.githubJson.mockImplementation(
  async (path: string, _token: string, options?: { signal?: AbortSignal }) => {
    github.calls.push(path);
    if (options?.signal?.aborted) throw options.signal.reason;
    if (github.failing.some((pattern) => pattern.test(path)))
      throw new GithubAccessError("GitHub is unavailable. Try again later.");
    if (path === "/user")
      return { data: { id: 1, login: "fixture" }, scopes: ["repo"] };
    if (path.startsWith("/user/installations?"))
      return {
        data: {
          installations: [
            {
              id: 7,
              app_slug: "server-guy-test",
              account: { id: 2, login: "qa" },
              permissions: { contents: "read" },
              repository_selection: "selected",
              suspended_at: null,
            },
          ],
        },
        scopes: [],
      };
    if (path.startsWith("/user/installations/7/repositories"))
      return { data: { repositories: [{ id: 99 }] }, scopes: [] };
    const match = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path);
    if (!match) throw new Error(`Unexpected GitHub path ${path}`);
    const [, fullName, rest = ""] = match;
    if (!rest)
      return {
        data: {
          id: 99,
          full_name: fullName,
          visibility: "private",
          default_branch: "main",
          permissions: { pull: true, push: false, admin: false },
        },
        scopes: ["repo"],
      };
    if (rest.startsWith("/commits/"))
      return {
        data: { sha: fixtureCommitSha(fullName, github.revision) },
        scopes: [],
      };
    if (rest.startsWith("/git/trees/")) {
      const sha = rest.slice("/git/trees/".length).split("?")[0];
      return { data: treeResponse(fullName, sha), scopes: [] };
    }
    if (rest.startsWith("/contents/")) {
      const [encoded, query = ""] = rest.slice("/contents/".length).split("?");
      const body = contentsResponse(
        fullName,
        decodeURIComponent(encoded),
        new URLSearchParams(query).get("ref") ?? "",
      );
      if (!body)
        throw new GithubAccessError(
          "The repository is missing or this login cannot access it. Check its URL and repository access on GitHub.",
          "access",
        );
      return { data: body, scopes: [] };
    }
    throw new Error(`Unexpected GitHub path ${path}`);
  },
);

// The synthetic model: reads the inspection, then the fixture files it
// cares about, then proposes a contract built from exactly what it read.
const pause = {
  reached: null as null | (() => void),
  release: null as null | (() => void),
};
// One flag across the runtimes each Run creates: fail-once fails one Run.
const synthetic = { failed: false };
const text = (message: Context["messages"][number]) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
async function contractRuntime(
  sdk: typeof import("@earendil-works/pi-coding-agent"),
) {
  const runtime = await sdk.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const provider = "server-guy-contract-test";
  runtime.registerProvider(provider, {
    api: provider,
    apiKey: "NO-NETWORK",
    baseUrl: "https://synthetic.invalid",
    streamSimple: (model, context: Context, options) => {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [],
        stopReason: "stop",
        timestamp: Date.now(),
        usage: {
          input: 10,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 11,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      void (async () => {
        try {
          const userIndex = context.messages.findLastIndex(
            (m) => m.role === "user" && !text(m).startsWith("{"),
          );
          const user = text(context.messages[userIndex]);
          const runContext = context.messages
            .slice(0, userIndex + 1)
            .filter((m) => m.role === "user" && text(m).startsWith("{"))
            .map((m) => JSON.parse(text(m)) as { userMessageId?: string })
            .at(-1);
          const results = context.messages
            .slice(userIndex + 1)
            .filter((m) => m.role === "toolResult")
            .map((m) => ({
              name: m.toolName,
              isError: m.isError,
              body: text(m),
            }));
          const call = (name: string, args: Record<string, unknown>) => {
            message.content = [
              { type: "toolCall", id: randomUUID(), name, arguments: args },
            ];
            message.stopReason = "toolUse";
          };
          const answer = (value: unknown) => {
            message.content = [{ type: "text", text: JSON.stringify(value) }];
          };
          const contractFlow =
            user === INSPECTION_REQUEST || user.startsWith("contract:");
          if (!contractFlow) answer({ answered: user });
          else {
            const mode =
              user === INSPECTION_REQUEST
                ? "propose"
                : user.slice("contract:".length).trim();
            if (mode.startsWith("fail-once") && !synthetic.failed) {
              synthetic.failed = true;
              throw new Error("synthetic provider failure");
            }
            const inspectionResult = results.find(
              (r) => r.name === "get_repository_inspection" && !r.isError,
            );
            const proposalResult = results.find(
              (r) => r.name === "propose_application_contract",
            );
            const currentResult = results.find(
              (r) => r.name === "get_application_contract" && !r.isError,
            );
            if (!inspectionResult) call("get_repository_inspection", {});
            else if (proposalResult) {
              answer(
                proposalResult.isError
                  ? { rejected: proposalResult.body }
                  : { proposal: JSON.parse(proposalResult.body) },
              );
            } else {
              const inspection = JSON.parse(inspectionResult.body) as {
                inspection: { observationId: string; commitSha: string } | null;
                tree: { entries: string[] };
              };
              const paths = treePaths(inspection);
              const reads: SeenRead[] = results
                .filter((r) => r.name === "read_repository_file" && !r.isError)
                .map((r) => JSON.parse(r.body) as SeenRead);
              const next = CONTRACT_READ_ORDER.filter((p) =>
                paths.includes(p),
              ).find((p) => !reads.some((read) => read.path === p));
              const decisionResult = results.find(
                (r) => r.name === "propose_decision",
              );
              if (next) call("read_repository_file", { path: next });
              else if (mode.startsWith("confirm") && !decisionResult)
                call("propose_decision", {
                  kind: "launch-priority",
                  value: "Health checks must answer within one second.",
                });
              else if (mode.startsWith("pause")) {
                await new Promise<void>((resolve, reject) => {
                  pause.release = resolve;
                  pause.reached?.();
                  options?.signal?.addEventListener(
                    "abort",
                    () => reject(new Error("aborted")),
                    { once: true },
                  );
                });
                answer({ resumed: true });
              } else if (
                (mode.startsWith("correct") || mode.startsWith("confirm")) &&
                !currentResult
              )
                call("get_application_contract", {});
              else if (mode.startsWith("confirm")) {
                // Every resolved value becomes the engineer's own choice,
                // quoted from their message: a legitimate revision that cites
                // no repository read at all.
                const current = (
                  JSON.parse(currentResult!.body) as {
                    current: { id: string } | null;
                  }
                ).current;
                const proposal = buildContractProposal(inspection, reads, {
                  ...(current ? { revises: current.id } : {}),
                });
                for (const field of proposal.fields)
                  if (field.value !== null) {
                    field.provenance = {
                      kind: "user-confirmed",
                      source: {
                        type: "message",
                        messageId: runContext?.userMessageId ?? "missing",
                        quote: field.value,
                      },
                    };
                    delete field.conformance;
                  }
                call("propose_application_contract", proposal);
              } else {
                const value = mode.split(/\s+/).at(-1)!;
                const current = currentResult
                  ? (
                      JSON.parse(currentResult.body) as {
                        current: { id: string } | null;
                      }
                    ).current
                  : null;
                if (mode.startsWith("correct") && !current)
                  throw new Error("No contract to correct");
                call(
                  "propose_application_contract",
                  buildContractProposal(inspection, reads, {
                    ...(current ? { revises: current.id } : {}),
                    ...(mode.startsWith("correct")
                      ? {
                          corrections: [
                            {
                              key: "health.path",
                              value,
                              messageId: runContext?.userMessageId ?? "missing",
                              quote: value,
                            },
                          ],
                        }
                      : {}),
                    invented: mode === "invented",
                  }),
                );
              }
            }
          }
          if (
            ["correct-hold", "confirm-hold"].includes(mode(user)) &&
            message.stopReason === "stop"
          ) {
            await new Promise<void>((resolve) => {
              pause.release = resolve;
              pause.reached?.();
            });
          }
          stream.push({ type: "start", partial: message });
          stream.push({
            type: "done",
            reason: message.stopReason as "stop" | "toolUse",
            message,
          });
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? "aborted" : "error";
          message.errorMessage =
            error instanceof Error ? error.message : "failed";
          stream.push({
            type: "error",
            reason: message.stopReason,
            error: message,
          });
        }
      })();
      return stream;
    },
    models: [
      {
        id: "synthetic",
        name: "Synthetic",
        reasoning: false,
        input: ["text"],
        contextWindow: 200_000,
        maxTokens: 4_096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  return {
    configuration: { reasoningEffort: "off" as const },
    modelRuntime: runtime,
    model: runtime.getModel(provider, "synthetic")!,
  };
}
function mode(user: string) {
  return user.startsWith("contract:")
    ? user.slice("contract:".length).trim().split(/\s+/)[0]
    : "";
}

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-phase-two-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(directory, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(directory, "config"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "pi"));
  vi.stubEnv("SERVER_GUY_TRACING", "0");
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(() => {
  saveGithubConnection(login(FIRST));
  mocks.cli.mockResolvedValue({ token: TOKEN, source: "gh" as const });
  store.db().$client.exec("DELETE FROM applications");
  github.revision = "1";
  github.failing = [];
  github.calls = [];
  pause.reached = null;
  pause.release = null;
  synthetic.failed = false;
  mocks.configure.mockReset().mockImplementation((sdk) => contractRuntime(sdk));
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

async function application(name = "fastapi-app") {
  const { view } = await phaseOne.createPhaseOneApplication({
    repositoryUrl: `https://github.com/qa/${name}`,
    environment: "production",
    approvalMode: "pi-decides",
  });
  return {
    id: view.application!.id,
    startChatId: view.selectedChatId!,
    startWorkspaceId: view.workspace!.id,
    name,
  };
}
async function inspected(name = "fastapi-app") {
  const app = await application(name);
  const view = await completeLaunchBrief(app.id);
  return {
    ...app,
    view,
    chatId: view.selectedChatId!,
    workspaceId: view.workspace!.id,
  };
}
async function work() {
  const run = runs.claimNextPiRun();
  expect(run).not.toBeNull();
  await executePiRun(run!);
  return runs.getPiRun(run!.id)!;
}
const checks = (applicationId: string) =>
  Object.fromEntries(
    getOperatorView(applicationId).checks.map((check) => [
      check.key,
      check.status,
    ]),
  );
const feed = (workspaceId: string) =>
  store.listActivity(workspaceId).map((event) => event.kind);
const contractOf = (applicationId: string) =>
  store.currentContract(applicationId);
const fileReads = (applicationId: string) =>
  store
    .listObservations(applicationId)
    .filter((o) => o.kind === "github-repository-file");
const steps = (runId: string) =>
  readFileSync(diagnosticLogPath(), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((row) => row.runId === runId && row.event === "step.finished")
    .map((row) => [row.step, row.outcome]);

describe("the explicit Phase 1 → Phase 2 transition", () => {
  it("refuses an unready Launch Brief and a pending Run, then completes exactly once", async () => {
    saveGithubConnection(null);
    const app = await application();
    await expect(completeLaunchBrief(app.id)).rejects.toThrow(
      "not ready: GitHub repository access",
    );
    saveGithubConnection(login(FIRST));
    await phaseOne.observeRepository(app.id);
    const pending = runs.sendChatMessage(
      app.id,
      app.startChatId,
      "Hello",
      randomUUID(),
    );
    await expect(completeLaunchBrief(app.id)).rejects.toThrow(
      "Wait for the current reply",
    );
    runs.cancelPiRun(app.id, app.startChatId, pending.run.id);
    const observationsBefore = store.listObservations(app.id).length;
    const view = await completeLaunchBrief(app.id);
    expect(view.workspace).toMatchObject({
      phaseKey: "inspect-app",
      phaseNumber: 2,
      deliverable: "Application Contract",
      current: true,
      status: "in-progress",
    });
    expect(
      view.workspaces.map((w) => [w.phaseKey, w.status, w.current]),
    ).toEqual([
      ["start", "completed", false],
      ["inspect-app", "in-progress", true],
    ]);
    const start = store.getWorkspace(app.id, "start")!;
    expect(start.completedAt).not.toBeNull();
    expect(start.deliverableEvidence).toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({
          key: "repository-readable",
          status: "passed",
        }),
      ]),
      connectionId: FIRST,
      commitSha: fixtureCommitSha("qa/fastapi-app"),
      approvalMode: "pi-decides",
    });
    expect(feed(app.startWorkspaceId)[0]).toBe("phase-completed");
    expect(feed(view.workspace!.id)).toEqual([
      "repository-inspected",
      "phase-started",
    ]);
    // Inspection: only the tree, with all file choices left to Pi, then the
    // auto-started request attributed to Server Guy, queued for the worker.
    const inspection = repositoryEvidence(app.id);
    expect(inspection.inspection?.status).toBe("passed");
    expect(inspection.current).toBe(true);
    expect(inspection.resolution.status).toBe("pending");
    expect(
      inspection.files.map((f) => (f.raw as { path: string }).path),
    ).toEqual([]);
    expect(store.listObservations(app.id)).toHaveLength(observationsBefore + 1);
    expect(view.messages.map((m) => [m.role, m.source, m.status])).toEqual([
      ["assistant", "server-guy", "completed"],
      ["user", "server-guy", "completed"],
      ["assistant", "pi", "queued"],
    ]);
    expect(view.messages[1].body).toBe(INSPECTION_REQUEST);
    expect(checks(app.id)).toEqual({
      "profile-resolved": "not-yet",
      "contract-complete": "not-yet",
      "contract-provenance": "not-yet",
      "contract-gaps": "not-yet",
    });
    // Idempotent: no second workspace, inspection or request.
    const again = await completeLaunchBrief(app.id);
    expect(again.workspace?.id).toBe(view.workspace?.id);
    expect(store.listObservations(app.id)).toHaveLength(observationsBefore + 1);
    expect(store.listMessages(view.selectedChatId!)).toHaveLength(3);
    expect(store.listWorkspaces(app.id)).toHaveLength(2);
  });

  it("makes Phase 1 chats read-only at every mutation boundary while keeping them readable", async () => {
    const app = await inspected();
    const readOnly = "Phase 1 is complete; its chats are read-only.";
    expect(() =>
      runs.sendChatMessage(app.id, app.startChatId, "Late", randomUUID()),
    ).toThrow(readOnly);
    expect(() => phaseOne.archiveChat(app.id, app.startChatId)).toThrow();
    const view = getOperatorView(app.id, app.startChatId);
    expect(view.workspace).toMatchObject({
      phaseKey: "start",
      status: "completed",
      current: false,
    });
    expect(view.checks.map((c) => c.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(view.checks.every((c) => c.rerun === null)).toBe(true);
    expect(view.messages).toHaveLength(1);
    // A retry of an old Phase 1 attempt is refused too.
    const status = getApplicationStatus(app.id, app.startChatId);
    expect(status.workspace).toMatchObject({
      phaseKey: "start",
      status: "completed",
    });
    expect(status.contract).toBeUndefined();
    // A new chat always opens in the current phase.
    const chat = phaseOne.createChat(app.id, "Side question");
    expect(chat.workspace?.phaseKey).toBe("inspect-app");
    expect(chat.messages[0].body).toContain("same Application Contract");
  });

  it("fails a Run whose phase completed underneath it, saving nothing", async () => {
    const app = await application();
    const accepted = runs.sendChatMessage(
      app.id,
      app.startChatId,
      "Slow",
      randomUUID(),
    );
    mocks.configure.mockImplementationOnce(async (sdk) => {
      const runtime = await contractRuntime(sdk);
      // Complete the phase while the model is "thinking".
      store.completeWorkspace(app.startWorkspaceId, {
        completedAt: new Date().toISOString(),
        checks: [],
      });
      return runtime;
    });
    const run = runs.claimNextPiRun()!;
    expect(run.id).toBe(accepted.run.id);
    await executePiRun(run);
    expect(runs.getPiRun(run.id)?.status).toBe("failed");
    expect(store.listMessages(app.startChatId).at(-1)).toMatchObject({
      status: "failed",
      body: "",
    });
  });
});

describe("inspection outcomes", () => {
  it("records a failed identity check without starting a Run and explains it in chat", async () => {
    const app = await application("fastapi-denied");
    github.failing = [/\/repos\/qa\/fastapi-denied$/];
    const view = await completeLaunchBrief(app.id);
    const inspection = repositoryEvidence(app.id).inspection!;
    expect(inspection.status).toBe("unavailable");
    expect(view.messages.map((m) => m.source)).toEqual([
      "server-guy",
      "server-guy",
    ]);
    expect(view.messages[1].body).toContain("Re-inspect repository");
    expect(runs.claimNextPiRun()).toBeNull();
    expect(checks(app.id)["profile-resolved"]).toBe("not-yet");
    expect(feed(view.workspace!.id)).toEqual([
      "repository-inspection-failed",
      "phase-started",
    ]);
    // An explicit re-inspection appends a new Observation once GitHub answers.
    github.failing = [];
    await inspectRepository(app.id);
    expect(
      store
        .listObservations(app.id)
        .filter((o) => o.kind === "github-repository-inspection"),
    ).toHaveLength(2);
    expect(checks(app.id)["profile-resolved"]).toBe("not-yet");
  });

  it("lets Pi inspect unfamiliar and mixed-manifest repositories instead of rejecting filenames", async () => {
    const app = await application("django-site");
    const view = await completeLaunchBrief(app.id);
    const firstRun = runs.claimNextPiRun()!;
    expect(firstRun).not.toBeNull();
    runs.cancelPiRun(app.id, firstRun.chatId, firstRun.id);
    expect(view.inspection?.profile.criteria).toEqual([]);
    expect(view.messages[1].body).toBe(INSPECTION_REQUEST);
    const ambiguous = await application("ambiguous-app");
    await completeLaunchBrief(ambiguous.id);
    expect(getOperatorView(ambiguous.id).checks[0].result).toContain(
      "propose an evidence-backed application profile",
    );
    expect(runs.claimNextPiRun()).not.toBeNull();
  });

  it("treats a tree failure as unavailable, not as a failed profile", async () => {
    const app = await application("fastapi-tree");
    github.failing = [/\/git\/trees\//];
    await completeLaunchBrief(app.id);
    const inspection = repositoryEvidence(app.id).inspection!;
    expect(inspection.status).toBe("unavailable");
    expect(inspection.summary).toContain("GitHub is unavailable");
    expect(checks(app.id)["profile-resolved"]).toBe("not-yet");
  });
});

describe("Pi's adaptive inspection through the real SDK tool loop", () => {
  it("reads pinned files as saved Observations and commits a sourced contract with its checks passing", async () => {
    const app = await inspected("fastapi-app");
    const run = await work();
    expect(run.status).toBe("succeeded");
    const reply = JSON.parse(store.listMessages(app.chatId).at(-1)!.body);
    expect(reply.proposal).toMatchObject({
      status: "pending, not saved",
      version: 1,
      blockers: [],
      conformanceItems: [],
    });
    const contract = contractOf(app.id)!;
    expect(contract).toMatchObject({
      version: 1,
      profileId: "fastapi-uv",
      commitSha: fixtureCommitSha("qa/fastapi-app"),
      sourceMessageId: app.view.messages[1].id,
    });
    expect(contract.body.fields).toHaveLength(19);
    const reads = fileReads(app.id).map(
      (o) => (o.raw as { path: string }).path,
    );
    expect(reads.sort()).toEqual(
      [
        "pyproject.toml",
        "Dockerfile",
        "app/main.py",
        "app/config.py",
        ".env.example",
        "alembic.ini",
        "README.md",
      ].sort(),
    );
    // pyproject.toml is fetched only when the model asks; subsequent reads
    // use the saved Observation without another network call.
    expect(
      github.calls.filter((p) => p.includes("/contents/pyproject.toml")),
    ).toHaveLength(1);
    expect(checks(app.id)).toEqual({
      "profile-resolved": "passed",
      "contract-complete": "passed",
      "contract-provenance": "passed",
      "contract-gaps": "passed",
    });
    expect(getOperatorView(app.id).workspace?.status).toBe("ready");
    expect(feed(app.workspaceId)[0]).toBe("contract-established");
    expect(store.listActivity(app.workspaceId)[0].detail).toContain(
      "19 fields · 0 blockers, 0 conformance items, 4 open policies",
    );
    expect(steps(run.id)).toEqual([
      ["context", "completed"],
      ["session", "completed"],
      ["model", "completed"],
      ["get_repository_inspection", "completed"],
      ...Array(7)
        .fill(["model", "completed"])
        .flatMap((model) => [model, ["read_repository_file", "completed"]]),
      ["model", "completed"],
      ["propose_application_contract", "completed"],
      ["model", "completed"],
      ["save", "completed"],
    ]);
    const status = getApplicationStatus(app.id, app.chatId);
    expect(status.workspace).toMatchObject({
      phaseKey: "inspect-app",
      phaseNumber: 2,
      status: "ready",
    });
    expect(status.contract).toMatchObject({
      version: 1,
      fieldCount: 19,
      blockers: 0,
      conformanceItems: 0,
      policyItems: 4,
    });
    expect(status.inspection).toMatchObject({
      current: true,
      profile: { status: "matched" },
    });
    expect(JSON.stringify(status).length).toBeLessThan(12_000);
    // Provenance links resolve to the pinned commit.
    const health = contract.body.fields.find((f) => f.key === "health.path")!;
    expect(health.provenance).toMatchObject({
      kind: "repository-declared",
      citation: { path: "app/main.py", line: 10 },
    });
    const observation = store.getObservation(
      (health.provenance as { citation: { observationId: string } }).citation
        .observationId,
    )!;
    expect(observation.sourceUrl).toBe(
      `https://github.com/qa/fastapi-app/blob/${contract.commitSha}/app/main.py`,
    );
  }, 30_000);

  it("keeps a missing health endpoint as Phase 3 work and a SQLite declaration as a blocker", async () => {
    const nohealth = await inspected("fastapi-nohealth");
    expect((await work()).status).toBe("succeeded");
    const nohealthView = getOperatorView(nohealth.id);
    expect(nohealthView.contract?.gaps.conformance.map((g) => g.field)).toEqual(
      ["health.path"],
    );
    expect(checks(nohealth.id)["contract-gaps"]).toBe("passed");
    expect(nohealthView.checks[3].result).toContain(
      "1 conformance item for Phase 3",
    );
    const sqlite = await inspected("fastapi-sqlite");
    expect((await work()).status).toBe("succeeded");
    const sqliteView = getOperatorView(sqlite.id);
    expect(sqliteView.contract?.gaps.blockers).toEqual([
      expect.objectContaining({
        field: "persistence.database",
        blocker: "contradiction",
      }),
    ]);
    expect(checks(sqlite.id)["contract-gaps"]).toBe("blocked");
    expect(sqliteView.workspace?.status).toBe("in-progress");
    expect(sqliteView.checks[3].result).toContain("Database (contradiction");
    // The two applications never see each other's reads.
    expect(
      fileReads(sqlite.id).every((o) => o.applicationId === sqlite.id),
    ).toBe(true);
  }, 30_000);

  it("returns a rejected proposal to the model and saves no contract", async () => {
    const app = await inspected();
    runs.cancelPiRun(app.id, app.chatId, runs.claimNextPiRun()!.id);
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: invented",
      randomUUID(),
    );
    const run = await work();
    expect(run.status).toBe("succeeded");
    const reply = JSON.parse(store.listMessages(app.chatId).at(-1)!.body);
    expect(reply.rejected).toContain("health.path");
    expect(reply.rejected).toContain("not a saved repository-file read");
    expect(contractOf(app.id)).toBeNull();
    expect(steps(run.id)).toContainEqual([
      "propose_application_contract",
      "failed",
    ]);
    expect(feed(app.workspaceId)).not.toContain("contract-established");
  });

  it("keeps observed facts after cancellation but publishes no contract; retry then commits", async () => {
    const app = await inspected();
    runs.cancelPiRun(app.id, app.chatId, runs.claimNextPiRun()!.id);
    const accepted = runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: pause",
      randomUUID(),
    );
    const reached = new Promise<void>((resolve) => {
      pause.reached = resolve;
    });
    const running = executePiRun(runs.claimNextPiRun()!);
    await reached;
    expect(fileReads(app.id).length).toBeGreaterThanOrEqual(3);
    runs.cancelPiRun(app.id, app.chatId, accepted.run.id);
    await running;
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("cancelled");
    const observed = fileReads(app.id).length;
    expect(contractOf(app.id)).toBeNull();
    expect(feed(app.workspaceId)).not.toContain("contract-established");
    // A failed attempt, then a linked retry that succeeds, reusing the reads.
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: fail-once",
      randomUUID(),
    );
    const failed = await work();
    expect(failed.status).toBe("failed");
    expect(contractOf(app.id)).toBeNull();
    runs.retryPiRun(app.id, app.chatId, failed.id);
    const retried = await work();
    expect(retried).toMatchObject({
      status: "succeeded",
      retryOfId: failed.id,
    });
    expect(contractOf(app.id)?.version).toBe(1);
    expect(fileReads(app.id)).toHaveLength(observed);
  }, 30_000);

  it("revises the contract from the engineer's correction and refuses a stale revision at commit", async () => {
    const app = await inspected();
    expect((await work()).status).toBe("succeeded");
    const first = contractOf(app.id)!;
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct /healthz",
      randomUUID(),
    );
    expect((await work()).status).toBe("succeeded");
    const second = contractOf(app.id)!;
    expect(second.version).toBe(2);
    expect(store.getContract(first.id)?.supersededById).toBe(second.id);
    const health = second.body.fields.find((f) => f.key === "health.path")!;
    expect(health).toMatchObject({
      value: "/healthz",
      provenance: {
        kind: "user-confirmed",
        source: { type: "message", quote: "/healthz" },
      },
    });
    expect(store.listActivity(app.workspaceId)[0]).toMatchObject({
      kind: "contract-revised",
      detail: expect.stringContaining("v1 → v2"),
    });
    expect(store.listActivity(app.workspaceId)[0].detail).toContain(
      "Health endpoint: /health → /healthz",
    );
    expect(checks(app.id)["contract-provenance"]).toBe("passed");
    // A revision proposed against v2 loses to one committed meanwhile.
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct-hold /status",
      randomUUID(),
    );
    const reached = new Promise<void>((resolve) => {
      pause.reached = resolve;
    });
    mocks.configure.mockImplementationOnce(async (sdk) => contractRuntime(sdk));
    const holding = executePiRun(runs.claimNextPiRun()!);
    await reached;
    const external = store.insertContract({
      applicationId: app.id,
      workspaceId: app.workspaceId,
      version: 3,
      sourceMessageId: second.sourceMessageId,
      body: second.body,
    });
    store.supersedeContract(app.id, second.id, external.id);
    pause.release!();
    await holding;
    const last = runs.chatRunSnapshot(app.id, app.chatId).runs.at(-1)!;
    expect(last.status).toBe("failed");
    expect(store.listMessages(app.chatId).at(-1)).toMatchObject({
      status: "failed",
    });
    expect(contractOf(app.id)?.id).toBe(external.id);
    expect(store.listContracts(app.id)).toHaveLength(3);
  }, 30_000);

  it("fails the attempt if stored inspection changes under a citation-free revision", async () => {
    const app = await inspected();
    expect((await work()).status).toBe("succeeded");
    const first = contractOf(app.id)!;
    const firstCommit = fixtureCommitSha("qa/fastapi-app");
    expect(first.commitSha).toBe(firstCommit);
    // The engineer restates every resolved value, so the revision can quote
    // their message for each field and cite no repository read.
    const values = first.body.fields
      .map((field) => field.value)
      .filter((value): value is string => value !== null);
    runs.sendChatMessage(
      app.id,
      app.chatId,
      `contract: confirm-hold\n${values.join("\n")}`,
      randomUUID(),
    );
    const reached = new Promise<void>((resolve) => {
      pause.reached = resolve;
    });
    const holding = executePiRun(runs.claimNextPiRun()!);
    await reached;
    // Defence in depth: inject a concurrent stored revision change. The user
    // correction operation separately refuses to do this during a Run.
    github.revision = "2";
    const later = await inspectRepository(app.id);
    expect(later.status).toBe("passed");
    const secondCommit = fixtureCommitSha("qa/fastapi-app", "2");
    store.insertObservation({
      applicationId: app.id,
      kind: later.kind,
      status: later.status,
      summary: later.summary,
      sourceLabel: later.sourceLabel,
      sourceUrl: later.sourceUrl,
      raw: { ...(later.raw as object), commitSha: secondCommit },
    });
    expect(repositoryEvidence(app.id).commitSha).toBe(secondCommit);
    pause.release!();
    await holding;
    const run = runs.chatRunSnapshot(app.id, app.chatId).runs.at(-1)!;
    expect(run.status).toBe("failed");
    expect(run.error).toContain(
      `re-inspected while this contract was being proposed (${firstCommit.slice(0, 8)} → ${secondCommit.slice(0, 8)})`,
    );
    // The failed placeholder carries no answer; the chat shows the Run's
    // reason instead, which names both commits.
    expect(store.listMessages(app.chatId).at(-1)).toMatchObject({
      status: "failed",
      body: "",
    });
    expect(run.error).toContain("the proposal was not saved");
    // Atomic: no answer, no Decision, no version, no supersede, no Activity.
    expect(store.listContracts(app.id)).toHaveLength(1);
    expect(contractOf(app.id)?.id).toBe(first.id);
    expect(store.getContract(first.id)?.supersededById).toBeNull();
    expect(store.listActiveDecisions(app.id)).toEqual([]);
    expect(feed(app.workspaceId)).not.toContain("contract-revised");
    expect(feed(app.workspaceId)).not.toContain("decision-recorded");
    expect(feed(app.workspaceId)[0]).toBe("repository-inspected");
    expect(checks(app.id)["contract-complete"]).toBe("blocked");
    // The correction path: a new request proposes from the current commit.
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct /health",
      randomUUID(),
    );
    expect((await work()).status).toBe("succeeded");
    expect(contractOf(app.id)).toMatchObject({
      version: 2,
      commitSha: secondCommit,
    });
    expect(store.getContract(first.id)?.supersededById).toBe(
      contractOf(app.id)!.id,
    );
    expect(checks(app.id)["contract-complete"]).toBe("passed");
  }, 30_000);
});

describe("invalidation, isolation and removal", () => {
  it("withholds support from an inspection made with a replaced login and re-inspects without re-reading", async () => {
    const app = await inspected();
    expect((await work()).status).toBe("succeeded");
    const reads = fileReads(app.id).length;
    await phaseOne.withGithubConnectionTransition(() =>
      saveGithubConnection(login(SECOND)),
    );
    expect(checks(app.id)).toEqual({
      "profile-resolved": "not-yet",
      "contract-complete": "not-yet",
      "contract-provenance": "not-yet",
      "contract-gaps": "not-yet",
    });
    expect(getOperatorView(app.id).checks[0].result).toContain(
      "previous login",
    );
    expect(feed(app.workspaceId)[0]).toBe("repository-inspection-invalidated");
    expect(feed(app.startWorkspaceId)[0]).toBe(
      "repository-verification-invalidated",
    );
    await phaseOne.withGithubConnectionTransition(() =>
      saveGithubConnection(login(SECOND)),
    );
    expect(
      feed(app.workspaceId).filter(
        (k) => k === "repository-inspection-invalidated",
      ),
    ).toHaveLength(1);
    const status = getApplicationStatus(app.id, app.chatId);
    expect(status.checks[0].evidence).toEqual([]);
    expect(status.inspection?.current).toBe(false);
    const before = github.calls.length;
    await inspectRepository(app.id);
    expect(checks(app.id)).toEqual({
      "profile-resolved": "passed",
      "contract-complete": "passed",
      "contract-provenance": "passed",
      "contract-gaps": "passed",
    });
    expect(fileReads(app.id)).toHaveLength(reads);
    expect(
      github.calls.slice(before).some((p) => p.includes("/contents/")),
    ).toBe(false);
  }, 30_000);

  it("adopts a new commit only through reviewed impact, and Phase 1 stays as recorded", async () => {
    const app = await inspected();
    expect((await work()).status).toBe("succeeded");
    github.revision = "2";
    await inspectRepository(app.id);
    expect(repositoryEvidence(app.id).commitSha).toBe(
      fixtureCommitSha("qa/fastapi-app"),
    );
    const impact = await previewRevisionCorrection(app.id, {
      reference: "main",
    });
    applyRevisionCorrection(app.id, { impactId: impact.id });
    const view = getOperatorView(app.id);
    expect(view.checks.map((c) => c.status)).toEqual([
      "not-yet",
      "blocked",
      "not-yet",
      "not-yet",
    ]);
    expect(view.checks[1].result).toContain(
      `(${fixtureCommitSha("qa/fastapi-app").slice(0, 8)} → ${fixtureCommitSha("qa/fastapi-app", "2").slice(0, 8)})`,
    );
    // Revising re-reads at the new commit and passes again.
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct /healthz",
      randomUUID(),
    );
    expect((await work()).status).toBe("succeeded");
    expect(contractOf(app.id)).toMatchObject({
      version: 2,
      commitSha: fixtureCommitSha("qa/fastapi-app", "2"),
    });
    expect(checks(app.id)["contract-complete"]).toBe("passed");
    saveGithubConnection(null);
    const retained = getOperatorView(app.id, app.startChatId);
    expect(retained.workspace?.status).toBe("completed");
    expect(retained.checks[1].status).toBe("passed");
    expect(checks(app.id)["profile-resolved"]).toBe("not-yet");
  }, 30_000);

  it("removes contracts, Phase 2 chats and native files with the application", async () => {
    const app = await inspected();
    expect((await work()).status).toBe("succeeded");
    const other = await inspected("fastapi-other");
    const sessions = join(directory, "pi-sessions", app.id);
    expect(existsSync(sessions)).toBe(true);
    phaseOne.removeApplication(app.id, "qa/fastapi-app");
    expect(store.listContracts(app.id)).toEqual([]);
    expect(store.getChat(app.chatId)).toBeNull();
    expect(store.listWorkspaces(app.id)).toEqual([]);
    expect(existsSync(sessions)).toBe(false);
    expect(store.listWorkspaces(other.id)).toHaveLength(2);
    expect(repositoryEvidence(other.id).inspection).not.toBeNull();
  }, 30_000);
});

describe("explicit revision correction", () => {
  it("previews without changing state, applies the reviewed SHA despite later pushes, and resumes the existing phase", async () => {
    const app = await inspected();
    await work();
    const phase3 = completeInspectApp(app.id);
    const priorChat = phase3.selectedChatId!;
    const oldContract = contractOf(app.id)!;
    github.revision = "2";
    const impact = await previewRevisionCorrection(app.id, {
      reference: "main",
    });
    expect(getOperatorView(app.id).workspace?.phaseKey).toBe(
      "make-launch-ready",
    );
    expect(impact.required).toHaveLength(3);
    github.revision = "3";
    const adopted = applyRevisionCorrection(app.id, { impactId: impact.id });
    expect(adopted.commitSha).toBe(fixtureCommitSha("qa/fastapi-app", "2"));
    expect(getOperatorView(app.id).workspace?.phaseKey).toBe("inspect-app");
    expect(store.getContract(oldContract.id)).not.toBeNull();
    expect(
      store
        .listObservations(app.id)
        .some((o) => o.kind === "phase-completion-history"),
    ).toBe(true);
    expect(() =>
      runs.sendChatMessage(app.id, priorChat, "continue", randomUUID()),
    ).toThrow("earlier phase");
    expect(applyRevisionCorrection(app.id, { impactId: impact.id })).toEqual(
      adopted,
    );
    expect(
      feed(app.workspaceId).filter((kind) => kind === "revision-changed"),
    ).toHaveLength(1);
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct /healthz",
      randomUUID(),
    );
    await work();
    const resumed = completeInspectApp(app.id);
    expect(resumed.selectedChatId).toBe(priorChat);
    expect(store.listWorkspaces(app.id)).toHaveLength(3);
  });

  it("rejects changed base state, expired impact, another application's impact and pending work", async () => {
    const app = await inspected();
    await work();
    github.revision = "2";
    const impact = await previewRevisionCorrection(app.id, {
      reference: "main",
    });
    const other = await application("another-app");
    expect(() =>
      applyRevisionCorrection(other.id, { impactId: impact.id }),
    ).toThrow("not found");
    runs.sendChatMessage(
      app.id,
      app.chatId,
      "contract: correct /healthz",
      randomUUID(),
    );
    expect(() =>
      applyRevisionCorrection(app.id, { impactId: impact.id }),
    ).toThrow("current work");
    await work();
    expect(() =>
      applyRevisionCorrection(app.id, { impactId: impact.id }),
    ).toThrow("out of date");
    const fresh = await previewRevisionCorrection(app.id, {
      reference: "main",
    });
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse(fresh.expiresAt) + 1);
    try {
      expect(() =>
        applyRevisionCorrection(app.id, { impactId: fresh.id }),
      ).toThrow("out of date");
    } finally {
      clock.mockRestore();
    }
    saveGithubConnection(login(SECOND));
    expect(() =>
      applyRevisionCorrection(app.id, { impactId: fresh.id }),
    ).toThrow("out of date");
  });

  it("retains the selected commit after an unavailable inspection and refuses a provider failure during impact", async () => {
    const app = await inspected();
    await work();
    github.revision = "2";
    github.failing = [/\/commits\//];
    expect((await inspectRepository(app.id)).status).toBe("unavailable");
    github.failing = [];
    await inspectRepository(app.id);
    expect(repositoryEvidence(app.id).commitSha).toBe(
      fixtureCommitSha("qa/fastapi-app"),
    );
    github.failing = [/\/git\/trees\//];
    await expect(
      previewRevisionCorrection(app.id, { reference: "main" }),
    ).rejects.toThrow();
    expect(repositoryEvidence(app.id).commitSha).toBe(
      fixtureCommitSha("qa/fastapi-app"),
    );
  });
});
