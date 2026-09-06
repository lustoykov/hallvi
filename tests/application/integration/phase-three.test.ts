// Phase 3 end to end over real SQLite, the real worker and the actual SDK
// tool loop: the explicit transition, the brief, Pi's staged change and
// preview through a fake executor, approval under each policy, publication
// through a synthetic Git Data API with duplicate-safe retry, merges of every
// method, external returns and scope violations, the no-change path, the
// candidate run, contract revisions, cancellation, interruption and removal.
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
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

import * as store from "../../../src/server/db";
import { CONFORMANCE_DEFINITION } from "../../../src/server/conformance-definition";
import {
  claimNextConformanceRun,
  interruptConformanceRuns,
} from "../../../src/server/conformance-runs";
import {
  credentialFingerprint,
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import {
  getApplicationStatus,
  getOperatorView,
} from "../../../src/server/operator-view";
import * as phaseOne from "../../../src/server/phase-one";
import {
  completeInspectApp,
  completeLaunchBrief,
} from "../../../src/server/phase-transition";
import {
  acceptAcceptanceChecks,
  approveProposal,
  cancelCandidateVerification,
  CONFORMANCE_REQUEST,
  continueWithServerGuy,
  executeClaimedConformanceRun,
  exportBrief,
  grantPublication,
  publishProposal,
  refreshCandidate,
  requestCandidateVerification,
  returnExternalChange,
  selectCurrentRevision,
  setConformanceExecutor,
  withdrawProposal,
} from "../../../src/server/phase-three";
import * as runs from "../../../src/server/pi-runs";
import { executePiRun } from "../../../src/server/pi-worker";
import { writeTar } from "../../../src/server/tar";
import {
  buildAcceptanceChecks,
  buildSourceChanges,
  CONFORMANCE_READ_ORDER,
  type SeenBrief,
} from "../../fixtures/conformance-builder";
import {
  buildContractProposal,
  CONTRACT_READ_ORDER,
  treePaths,
  type SeenRead,
} from "../../fixtures/contract-builder";
import {
  FakeExecutor,
  missingEnvironment,
  readyEnvironment,
} from "../../fixtures/fake-executor";
import { fixtureCommitSha } from "../../fixtures/github-responses";
import { repositoryFixtures } from "../../fixtures/repositories";
import {
  SyntheticGithub,
  SyntheticGithubError,
} from "../../fixtures/synthetic-github";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({
  githubJson: vi.fn(),
  githubArchive: vi.fn(),
  configure: vi.fn(),
  cli: vi.fn(),
}));
vi.mock("../../../src/server/github-api", async (original) => {
  const real =
    await original<typeof import("../../../src/server/github-api")>();
  return {
    ...real,
    githubJson: mocks.githubJson,
    githubArchive: mocks.githubArchive,
    githubDeviceRequest: vi.fn(() => {
      throw new Error("No GitHub login in Phase 3 tests");
    }),
    readGithubCliCredential: mocks.cli,
  };
});
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-configuration")>()),
  configuredPiRuntime: mocks.configure,
}));

const FIRST = "00000000-0000-4000-8000-000000000001";
const TOKEN = "QA-GITHUB-TOKEN";
function login(id: string): GithubConnection {
  return {
    id,
    mode: "cli",
    source: "gh",
    fingerprint: credentialFingerprint(TOKEN, "gh"),
    account: { id: 1, login: "fixture" },
    connectedAt: new Date().toISOString(),
  };
}

// One synthetic GitHub per repository name; every request routes by name.
const githubs = new Map<string, SyntheticGithub>();
function github(name: string) {
  const fullName = `qa/${name}`;
  let synthetic = githubs.get(fullName);
  if (!synthetic) {
    synthetic = new SyntheticGithub(fullName);
    githubs.set(fullName, synthetic);
  }
  return synthetic;
}
mocks.githubJson.mockImplementation(
  async (path: string, _token: string, options?: Record<string, unknown>) => {
    if (path === "/user")
      return { data: { id: 1, login: "fixture" }, scopes: ["repo"] };
    const match = /^\/repos\/qa\/([^/]+)/.exec(path);
    const name =
      match?.[1] ?? [...githubs.keys()][0]?.split("/")[1] ?? "fastapi-app";
    try {
      return await github(name).request(path, options as never);
    } catch (error) {
      if (error instanceof SyntheticGithubError) {
        const { GithubAccessError } = await vi.importActual<
          typeof import("../../../src/server/github-api")
        >("../../../src/server/github-api");
        throw new GithubAccessError(error.message, error.kind);
      }
      throw error;
    }
  },
);
mocks.githubArchive.mockImplementation(async (fullName: string, sha: string) =>
  github(fullName.split("/")[1]).archive(sha, writeTar),
);

const executor = new FakeExecutor();
setConformanceExecutor(executor);

// The synthetic model: Phase 2 contract flow and Phase 3 conformance flow.
const pause = {
  reached: null as null | (() => void),
  release: null as null | (() => void),
};
const text = (message: Context["messages"][number]) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
function mode(user: string) {
  return user.startsWith("contract:")
    ? user.slice("contract:".length).trim().split(/\s+/)[0]
    : user.startsWith("conformance:")
      ? user.slice("conformance:".length).trim().split(/\s+/)[0]
      : "";
}
async function runtime(sdk: typeof import("@earendil-works/pi-coding-agent")) {
  const modelRuntime = await sdk.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const provider = "server-guy-phase-three-test";
  modelRuntime.registerProvider(provider, {
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
          const reads: SeenRead[] = results
            .filter((r) => r.name === "read_repository_file" && !r.isError)
            .map((r) => JSON.parse(r.body) as SeenRead);
          const inspectionResult = results.find(
            (r) => r.name === "get_repository_inspection" && !r.isError,
          );
          if (
            user ===
              "Inspect the repository and propose the Application Contract." ||
            user.startsWith("contract:")
          ) {
            const contractMode = user.startsWith("contract:")
              ? user.slice("contract:".length).trim()
              : "propose";
            const proposalResult = results.find(
              (r) => r.name === "propose_application_contract",
            );
            const currentResult = results.find(
              (r) => r.name === "get_application_contract" && !r.isError,
            );
            if (!inspectionResult) call("get_repository_inspection", {});
            else if (proposalResult)
              answer(
                proposalResult.isError
                  ? { rejected: proposalResult.body }
                  : { proposal: JSON.parse(proposalResult.body) },
              );
            else {
              const inspection = JSON.parse(inspectionResult.body) as {
                inspection: { observationId: string; commitSha: string } | null;
                tree: { entries: string[] };
              };
              const paths = treePaths(inspection);
              const next = CONTRACT_READ_ORDER.filter((p) =>
                paths.includes(p),
              ).find((p) => !reads.some((read) => read.path === p));
              if (next) call("read_repository_file", { path: next });
              else if (contractMode.startsWith("correct") && !currentResult)
                call("get_application_contract", {});
              else {
                const current = currentResult
                  ? (
                      JSON.parse(currentResult.body) as {
                        current: { id: string } | null;
                      }
                    ).current
                  : null;
                const value = contractMode.split(/\s+/).at(-1)!;
                const proposal = buildContractProposal(inspection, reads, {
                  ...(current ? { revises: current.id } : {}),
                  ...(contractMode.startsWith("correct") &&
                  current &&
                  value !== "blocked" &&
                  value !== "unblocked"
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
                });
                if (value === "blocked") {
                  const field = proposal.fields.find(
                    (f) => f.key === "persistence.database",
                  )!;
                  field.value = null;
                  field.provenance = {
                    kind: "unresolved",
                    blocker: "contradiction",
                    reason:
                      "The engineer now says the database may be SQLite; decide before conformance continues.",
                  };
                  delete field.conformance;
                }
                call("propose_application_contract", proposal);
              }
            }
          } else if (
            user === CONFORMANCE_REQUEST ||
            user.startsWith("conformance:")
          ) {
            const conformanceMode =
              user === CONFORMANCE_REQUEST ? "full" : mode(user);
            const briefResult = results.find(
              (r) => r.name === "get_conformance_brief" && !r.isError,
            );
            const changesResult = results.find(
              (r) => r.name === "propose_source_changes",
            );
            const previewResult = results.find(
              (r) => r.name === "run_conformance_preview",
            );
            const acceptanceResult = results.find(
              (r) => r.name === "propose_acceptance_checks",
            );
            const commandResult = results.find(
              (r) => r.name === "run_repository_command",
            );
            if (!briefResult) call("get_conformance_brief", {});
            else if (!inspectionResult) call("get_repository_inspection", {});
            else {
              const brief = JSON.parse(briefResult.body) as SeenBrief;
              const inspection = JSON.parse(inspectionResult.body) as {
                tree: { entries: string[] };
              };
              const paths = treePaths(inspection as never);
              const next = CONFORMANCE_READ_ORDER.filter((p) =>
                paths.includes(p),
              ).find((p) => !reads.some((read) => read.path === p));
              if (next) call("read_repository_file", { path: next });
              else if (conformanceMode === "command" && !commandResult)
                call("run_repository_command", {
                  command: user.split(/\s+/).slice(2),
                });
              else if (conformanceMode === "command")
                answer({ command: JSON.parse(commandResult!.body) });
              else if (!changesResult && brief.brief.requiredChanges.length)
                call(
                  "propose_source_changes",
                  buildSourceChanges(brief, reads, {
                    scopeViolation: conformanceMode === "scope-violation",
                    unmapped: conformanceMode === "unmapped",
                    ...(conformanceMode === "auto"
                      ? { requestApproval: false }
                      : {}),
                  }),
                );
              else if (changesResult?.isError)
                answer({ rejected: changesResult.body });
              else if (!acceptanceResult && conformanceMode !== "propose-only")
                call(
                  "propose_acceptance_checks",
                  buildAcceptanceChecks(reads, {
                    invented: conformanceMode === "invented-route",
                    weak: conformanceMode === "weak",
                  }),
                );
              else if (!previewResult && conformanceMode !== "propose-only")
                call("run_conformance_preview", {});
              else if (conformanceMode === "hold") {
                await new Promise<void>((resolve, reject) => {
                  pause.release = resolve;
                  pause.reached?.();
                  options?.signal?.addEventListener(
                    "abort",
                    () => reject(new Error("aborted")),
                    { once: true },
                  );
                });
                answer({ held: true });
              } else
                answer({
                  changes: changesResult
                    ? changesResult.isError
                      ? "rejected"
                      : JSON.parse(changesResult.body)
                    : null,
                  preview: previewResult
                    ? previewResult.isError
                      ? { unavailable: previewResult.body }
                      : JSON.parse(previewResult.body)
                    : null,
                  acceptance: acceptanceResult
                    ? acceptanceResult.isError
                      ? { rejected: acceptanceResult.body }
                      : JSON.parse(acceptanceResult.body)
                    : null,
                });
            }
          } else answer({ answered: user });
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
    modelRuntime,
    model: modelRuntime.getModel(provider, "synthetic")!,
  };
}

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-phase-three-"));
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
  for (const synthetic of githubs.values()) synthetic.reset();
  executor.plans = [];
  executor.status = readyEnvironment();
  executor.hold = null;
  executor.reached = null;
  pause.reached = null;
  pause.release = null;
  mocks.configure.mockReset().mockImplementation((sdk) => runtime(sdk));
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

async function work() {
  const run = runs.claimNextPiRun();
  expect(run).not.toBeNull();
  await executePiRun(run!);
  return runs.getPiRun(run!.id)!;
}
/** An application taken through Phase 2 to a passing contract. */
async function inPhaseTwo(
  name: string,
  approvalMode: "always-ask" | "pi-decides" | "full-autonomy" = "always-ask",
) {
  const { view } = await phaseOne.createPhaseOneApplication({
    repositoryUrl: `https://github.com/qa/${name}`,
    environment: "production",
    approvalMode,
  });
  const id = view.application!.id;
  const second = await completeLaunchBrief(id);
  expect((await work()).status).toBe("succeeded");
  return { id, name, phaseTwoChatId: second.selectedChatId! };
}
async function inPhaseThree(
  name: string,
  approvalMode: "always-ask" | "pi-decides" | "full-autonomy" = "always-ask",
) {
  const app = await inPhaseTwo(name, approvalMode);
  const view = completeInspectApp(app.id);
  return {
    ...app,
    chatId: view.selectedChatId!,
    workspaceId: view.workspace!.id,
    view,
  };
}
const checks = (id: string) =>
  Object.fromEntries(
    getOperatorView(id, undefined, "make-launch-ready").checks.map((check) => [
      check.key,
      check.status,
    ]),
  );
const results = (id: string) =>
  Object.fromEntries(
    getOperatorView(id, undefined, "make-launch-ready").checks.map((check) => [
      check.key,
      check.result,
    ]),
  );
const conformance = (id: string) =>
  getOperatorView(id, undefined, "make-launch-ready").conformance!;
const feed = (workspaceId: string) =>
  store.listActivity(workspaceId).map((event) => event.kind);
async function verifyCandidate(id: string) {
  requestCandidateVerification(id);
  const claimed = claimNextConformanceRun();
  expect(claimed).not.toBeNull();
  return executeClaimedConformanceRun(claimed!);
}
async function serverGuyTurn(id: string, chatId?: string, message?: string) {
  if (message) runs.sendChatMessage(id, chatId!, message, randomUUID());
  else continueWithServerGuy(id);
  return work();
}

describe("the explicit Phase 2 → Phase 3 transition", () => {
  it("refuses an unready contract or a pending Run, then completes once with retained evidence and no automatic request", async () => {
    const blocked = await inPhaseTwo("fastapi-sqlite");
    expect(() => completeInspectApp(blocked.id)).toThrow(
      /not ready: No unresolved contract gaps/,
    );
    const app = await inPhaseTwo("fastapi-nohealth");
    runs.sendChatMessage(app.id, app.phaseTwoChatId, "hello", randomUUID());
    expect(() => completeInspectApp(app.id)).toThrow(
      /Wait for the current reply/,
    );
    expect((await work()).status).toBe("succeeded");
    const view = completeInspectApp(app.id);
    expect(view.workspace).toMatchObject({
      phaseKey: "make-launch-ready",
      current: true,
      status: "in-progress",
    });
    const contract = store.currentContract(app.id)!;
    const retained = view.workspaces.find((w) => w.phaseKey === "inspect-app")!
      .deliverableEvidence as {
      contractId: string;
      commitSha: string;
      checks: unknown[];
    };
    expect(retained).toMatchObject({
      contractId: contract.id,
      contractVersion: 1,
      commitSha: contract.commitSha,
    });
    expect(retained.checks).toHaveLength(4);
    expect(view.messages.at(-1)?.body).toContain(
      "Phase 3, Make launch-ready, starts here",
    );
    expect(view.messages.at(-1)?.body).toContain(
      "1 required change (Health endpoint)",
    );
    expect(runs.claimNextPiRun()).toBeNull();
    expect(completeInspectApp(app.id).workspace?.id).toBe(view.workspace?.id);
    expect(store.listWorkspaces(app.id)).toHaveLength(3);
    expect(() =>
      runs.sendChatMessage(app.id, app.phaseTwoChatId, "late", randomUUID()),
    ).toThrow(/Phase 2 is complete/);
    expect(feed(view.workspaces[1].id)[0]).toBe("phase-completed");
    expect(feed(view.workspace!.id)).toEqual(["phase-started"]);
    expect(checks(app.id)).toEqual({
      "candidate-identified": "not-yet",
      "changes-resolved": "not-yet",
      "conformance-passed": "not-yet",
    });
    expect(
      view.conformance?.brief?.requiredChanges.map((item) => item.field),
    ).toEqual(["health.path"]);
    expect(exportBrief(app.id).text).toContain("Health endpoint (health.path)");
    expect(feed(view.workspace!.id)[0]).toBe("brief-exported");
    exportBrief(app.id);
    expect(
      feed(view.workspace!.id).filter((k) => k === "brief-exported"),
    ).toHaveLength(1);
  }, 60_000);
});

describe("Pi's edit, preview and fix loop through the real SDK tool loop", () => {
  it("stages a mapped change, previews it in the runner, proposes behavior checks, and saves them for approval", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    const run = await serverGuyTurn(app.id);
    expect(run.status).toBe("succeeded");
    const reply = JSON.parse(store.listMessages(app.chatId).at(-1)!.body);
    expect(reply.changes.files).toEqual(["app/main.py"]);
    expect(reply.preview.status).toBe("passed");
    expect(
      reply.preview.checks.map((check: { key: string; outcome: string }) => [
        check.key,
        check.outcome,
      ]),
    ).toEqual([
      ["install", "passed"],
      ["configuration", "passed"],
      ["database", "passed"],
      ["migrations", "passed"],
      ["startup", "passed"],
      ["health", "passed"],
      ["behavior", "passed"],
      ["tests", "passed"],
    ]);
    expect(reply.acceptance.steps).toBe(2);
    const view = conformance(app.id);
    expect(view.proposal).toMatchObject({
      origin: "server-guy",
      status: "proposed",
      baseSha: fixtureCommitSha("qa/fastapi-nohealth"),
      mapping: [{ field: "health.path", paths: ["app/main.py"] }],
    });
    expect(view.proposal?.changes[0].baseObservationId).not.toBeNull();
    expect(view.proposal?.changes[0].content).toContain('@app.get("/health")');
    expect(view.proposedAcceptance).toMatchObject({
      version: 1,
      status: "proposed",
    });
    expect(view.acceptance).toBeNull();
    expect(view.latestPreview).toMatchObject({
      kind: "preview",
      status: "passed",
      piRunId: run.id,
      source: { commitSha: fixtureCommitSha("qa/fastapi-nohealth") },
    });
    expect(view.latestPreview?.source.overlayDigest).toBe(
      view.proposal?.filesDigest,
    );
    expect(
      executor.plans[0].files
        .find((file) => file.path === "app/main.py")
        ?.content.toString(),
    ).toContain("/health");
    expect(executor.plans[0].configuration.startCommand).toContain("0.0.0.0");
    expect(executor.plans[0].configuration.environment.SECRET_KEY).toMatch(
      /^synthetic-/,
    );
    expect(executor.plans[0].acceptance?.label).toContain(
      "proposed in this request",
    );
    expect(feed(app.workspaceId).slice(0, 2)).toEqual([
      "acceptance-proposed",
      "change-proposed",
    ]);
    expect(store.listActivity(app.workspaceId)[1].detail).toContain(
      "waiting for your approval",
    );
    expect(results(app.id)["candidate-identified"]).toContain(
      "waits for review",
    );
    expect(results(app.id)["conformance-passed"]).toContain(
      "previews never satisfy",
    );
    const status = getApplicationStatus(app.id, app.chatId);
    expect(status.conformance).toMatchObject({
      requiredChanges: 1,
      proposal: { status: "proposed", files: 1 },
      latestPreview: { status: "passed", failed: [] },
      executionEnvironment: "ready",
    });
  }, 60_000);

  it("returns scope violations and unmapped changes to the model and saves nothing", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: scope-violation"))
        .status,
    ).toBe("succeeded");
    expect(
      JSON.parse(store.listMessages(app.chatId).at(-1)!.body).rejected,
    ).toContain(".github/workflows/ci.yml: outside the allowed scope");
    expect(conformance(app.id).proposal).toBeNull();
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: unmapped")).status,
    ).toBe("succeeded");
    expect(
      JSON.parse(store.listMessages(app.chatId).at(-1)!.body).rejected,
    ).toContain("Required changes without a mapped path: health.path");
    expect(conformance(app.id).proposal).toBeNull();
    expect(executor.plans).toHaveLength(0);
    expect(feed(app.workspaceId)).toEqual(["phase-started"]);
  }, 60_000);

  it("rejects an invented route and a command runs as worker evidence in the same isolated runner", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: invented-route"))
        .status,
    ).toBe("succeeded");
    const reply = JSON.parse(store.listMessages(app.chatId).at(-1)!.body);
    expect(reply.acceptance.rejected).toContain(
      "no cited snippet declares /invented",
    );
    expect(conformance(app.id).proposedAcceptance).toBeNull();
    expect(conformance(app.id).proposal?.status).toBe("proposed");
    expect(
      (
        await serverGuyTurn(
          app.id,
          app.chatId,
          "conformance: command sh -c ls /var/run/docker.sock",
        )
      ).status,
    ).toBe("succeeded");
    const command = JSON.parse(
      store.listMessages(app.chatId).at(-1)!.body,
    ).command;
    expect(command.kind).toBe("command");
    expect(command.checks.at(-1).outputTail).toContain(
      "No such file or directory",
    );
    const runs3 = conformance(app.id).runs;
    expect(runs3.find((run) => run.kind === "command")).toMatchObject({
      status: "passed",
      configuration: { command: ["sh", "-c", "ls", "/var/run/docker.sock"] },
    });
    expect(checks(app.id)["conformance-passed"]).toBe("not-yet");
  }, 60_000);

  it("keeps working without an execution environment and says so", async () => {
    executor.status = missingEnvironment();
    const app = await inPhaseThree("fastapi-nohealth");
    expect((await serverGuyTurn(app.id)).status).toBe("succeeded");
    const reply = JSON.parse(store.listMessages(app.chatId).at(-1)!.body);
    expect(reply.preview.unavailable).toContain(
      "execution environment is not available",
    );
    expect(reply.preview.unavailable).toContain("Settings → Execution");
    expect(conformance(app.id).proposal?.status).toBe("proposed");
    expect(conformance(app.id).runs).toEqual([]);
    expect(results(app.id)["candidate-identified"]).toContain(
      "waits for review",
    );
  }, 60_000);

  it("cancels a preview and stops the runner; the staged change is dropped, the run row keeps its outcome", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    executor.holdNext();
    const reached = new Promise<void>((resolve) => {
      executor.reached = resolve;
    });
    const accepted = continueWithServerGuy(app.id);
    const running = executePiRun(runs.claimNextPiRun()!);
    await reached;
    runs.cancelPiRun(app.id, app.chatId, accepted.run.id);
    await running;
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("cancelled");
    expect(conformance(app.id).proposal).toBeNull();
    expect(conformance(app.id).runs[0]).toMatchObject({
      kind: "preview",
      status: "cancelled",
    });
    expect(
      conformance(app.id).runs[0].results.every(
        (result) => result.outcome === "not-run",
      ),
    ).toBe(true);
  }, 60_000);
});

describe("approval, publication and the exact merged candidate", () => {
  async function proposed(
    name = "fastapi-nohealth",
    approvalMode: "always-ask" | "pi-decides" | "full-autonomy" = "always-ask",
  ) {
    const app = await inPhaseThree(name, approvalMode);
    expect((await serverGuyTurn(app.id)).status).toBe("succeeded");
    return app;
  }

  it("needs an explicit verified grant, publishes one branch and pull request, and adopts them on retry", async () => {
    const app = await proposed();
    const proposal = conformance(app.id).proposal!;
    await expect(publishProposal(app.id, proposal.id)).rejects.toThrow(
      /Only an approved change/,
    );
    approveProposal(app.id, proposal.id);
    expect(conformance(app.id).proposal?.approval).toMatchObject({
      by: "engineer",
      mode: "always-ask",
      filesDigest: proposal.filesDigest,
    });
    await expect(publishProposal(app.id, proposal.id)).rejects.toThrow(
      /needs your explicit grant/,
    );
    await expect(grantPublication(app.id)).rejects.toThrow(/cannot push/);
    github(app.name).permissions = { pull: true, push: true, admin: false };
    const grant = await grantPublication(app.id);
    expect(grant).toMatchObject({
      mechanism: "cli",
      connectionId: FIRST,
      verifiedPermissions: { accountRepositoryPermissions: { push: true } },
    });
    const published = await publishProposal(app.id, proposal.id);
    expect(published.status).toBe("published");
    expect(published.publication).toMatchObject({
      branch: `server-guy/conformance-${proposal.id.slice(0, 8)}`,
      pullRequestNumber: 1,
      adopted: false,
      state: "open",
    });
    const pulls = github(app.name).pullsFor();
    expect(pulls).toHaveLength(1);
    expect(
      github(app.name)
        .filesAt(github(app.name).head(published.publication!.branch)!)
        ?.find((file) => file.path === "app/main.py")?.content,
    ).toContain("/health");
    expect(feed(app.workspaceId).slice(0, 3)).toEqual([
      "change-published",
      "publication-granted",
      "change-approved",
    ]);
    // A lost receipt: the row says approved again, GitHub already has both.
    store.updateConformanceProposal(proposal.id, ["published"], {
      status: "approved",
      publication: null,
      publicationError: "connection lost",
    });
    const retried = await publishProposal(app.id, proposal.id);
    expect(retried.publication).toMatchObject({
      pullRequestNumber: 1,
      adopted: true,
    });
    expect(github(app.name).pullsFor()).toHaveLength(1);
    expect(
      github(app.name).calls.filter(
        (call) => call === "POST /repos/qa/fastapi-nohealth/pulls",
      ),
    ).toHaveLength(1);
    expect(checks(app.id)).toEqual({
      "candidate-identified": "not-yet",
      "changes-resolved": "not-yet",
      "conformance-passed": "not-yet",
    });
    expect(results(app.id)["candidate-identified"]).toContain(
      "unmerged head gets preview results only",
    );
    await refreshCandidate(app.id);
    expect(conformance(app.id).proposal?.candidate).toBeNull();
  }, 60_000);

  it.each(["merge", "squash", "rebase"] as const)(
    "records the observed default-branch head after a %s merge and verifies the reviewed change there",
    async (method) => {
      const app = await proposed();
      const proposal = conformance(app.id).proposal!;
      approveProposal(app.id, proposal.id);
      github(app.name).permissions = { pull: true, push: true, admin: false };
      await grantPublication(app.id);
      const published = await publishProposal(app.id, proposal.id);
      const merged = github(app.name).merge(
        published.publication!.pullRequestNumber,
        method,
      );
      const refreshed = await refreshCandidate(app.id);
      expect(refreshed.candidate).toMatchObject({
        sha: merged,
        defaultBranch: "main",
        source: "merged-pull-request",
        merge: { pullRequestNumber: 1, method },
      });
      expect(refreshed.candidate!.sha).not.toBe(
        published.publication!.commitSha,
      );
      expect(refreshed.verification).toMatchObject({
        candidateSha: merged,
        changesComplete: true,
        scope: { ok: true, changedFiles: ["app/main.py"] },
      });
      expect(feed(app.workspaceId)[0]).toBe("candidate-recorded");
      expect(checks(app.id)).toEqual({
        "candidate-identified": "passed",
        "changes-resolved": "passed",
        "conformance-passed": "blocked",
      });
      expect(results(app.id)["conformance-passed"]).toContain(
        "waits for your acceptance",
      );
      acceptAcceptanceChecks(
        app.id,
        conformance(app.id).proposedAcceptance!.id,
      );
      expect(conformance(app.id).acceptance).toMatchObject({
        version: 1,
        status: "accepted",
        acceptedBy: "engineer",
      });
      expect(checks(app.id)["conformance-passed"]).toBe("not-yet");
      const run = await verifyCandidate(app.id);
      expect(run).toMatchObject({
        kind: "candidate",
        status: "passed",
        source: { commitSha: merged },
        acceptanceChecksVersion: 1,
        definitionVersion: CONFORMANCE_DEFINITION.version,
        imageDigest: "sha256:runner",
      });
      expect(run.results.map((result) => [result.key, result.outcome])).toEqual(
        [
          ["install", "passed"],
          ["configuration", "passed"],
          ["database", "passed"],
          ["migrations", "passed"],
          ["startup", "passed"],
          ["health", "passed"],
          ["behavior", "passed"],
          ["tests", "passed"],
        ],
      );
      expect(
        executor.plans
          .at(-1)
          ?.files.find((file) => file.path === "app/main.py")
          ?.content.toString(),
      ).toContain("/health");
      expect(executor.plans.at(-1)?.acceptance?.label).toBe("accepted v1");
      expect(checks(app.id)).toEqual({
        "candidate-identified": "passed",
        "changes-resolved": "passed",
        "conformance-passed": "passed",
      });
      expect(
        getOperatorView(app.id, undefined, "make-launch-ready").workspace
          ?.status,
      ).toBe("ready");
      expect(feed(app.workspaceId).slice(0, 2)).toEqual([
        "conformance-passed",
        "conformance-requested",
      ]);
      // Reload: everything is read back from records.
      const reloaded = getOperatorView(app.id, app.chatId);
      expect(reloaded.conformance?.latestCandidateRun?.id).toBe(run.id);
      expect(reloaded.checks.every((check) => check.status === "passed")).toBe(
        true,
      );
      expect(
        getApplicationStatus(app.id, app.chatId).conformance,
      ).toMatchObject({
        proposal: { candidateSha: merged },
        latestCandidateRun: { status: "passed", commitSha: merged },
      });
    },
    90_000,
  );

  it("blocks when the merged candidate differs from the reviewed change, and a later push makes the run stale", async () => {
    const app = await proposed();
    const proposal = conformance(app.id).proposal!;
    approveProposal(app.id, proposal.id);
    github(app.name).permissions = { pull: true, push: true, admin: false };
    await grantPublication(app.id);
    const published = await publishProposal(app.id, proposal.id);
    // A reviewer edits the branch before merging: the merged content differs.
    const edited = github(app.name)
      .filesAt(github(app.name).head(published.publication!.branch)!)!
      .map((file) =>
        file.path === "app/main.py"
          ? { ...file, content: `${file.content}# reviewer edit\n` }
          : file,
      );
    github(app.name).pushBranch(
      published.publication!.branch,
      edited,
      "reviewer edit",
      false,
    );
    github(app.name).merge(published.publication!.pullRequestNumber, "merge");
    await refreshCandidate(app.id);
    expect(checks(app.id)).toMatchObject({
      "candidate-identified": "passed",
      "changes-resolved": "blocked",
    });
    expect(results(app.id)["changes-resolved"]).toContain(
      "app/main.py differs from the reviewed content",
    );
    // A push to main after a passing run: the candidate moved.
    const app2 = await proposed("fastapi-nohealth-two");
    const proposal2 = conformance(app2.id).proposal!;
    approveProposal(app2.id, proposal2.id);
    github(app2.name).permissions = { pull: true, push: true, admin: false };
    await grantPublication(app2.id);
    const published2 = await publishProposal(app2.id, proposal2.id);
    github(app2.name).merge(
      published2.publication!.pullRequestNumber,
      "squash",
    );
    await refreshCandidate(app2.id);
    acceptAcceptanceChecks(
      app2.id,
      conformance(app2.id).proposedAcceptance!.id,
    );
    expect((await verifyCandidate(app2.id)).status).toBe("passed");
    expect(checks(app2.id)["conformance-passed"]).toBe("passed");
    github(app2.name).pushToMain(
      github(app2.name).filesAt(github(app2.name).head()!)!,
    );
    await refreshCandidate(app2.id);
    expect(checks(app2.id)["conformance-passed"]).toBe("not-yet");
    expect(results(app2.id)["conformance-passed"]).toContain(
      "No conformance run for candidate",
    );
    expect(
      conformance(app2.id).runs.filter((run) => run.kind === "candidate"),
    ).toHaveLength(1);
  }, 90_000);

  it("publishes automatically under Full autonomy once a grant exists, and under Let Server Guy decide when Pi asks for no approval", async () => {
    const app = await inPhaseThree("fastapi-nohealth", "full-autonomy");
    github(app.name).permissions = { pull: true, push: true, admin: false };
    await grantPublication(app.id);
    expect((await serverGuyTurn(app.id)).status).toBe("succeeded");
    const view = conformance(app.id);
    expect(view.proposal).toMatchObject({
      status: "published",
      approval: { by: "approval-mode", mode: "full-autonomy" },
    });
    expect(view.acceptance).toMatchObject({
      status: "accepted",
      acceptedBy: "approval-mode",
    });
    expect(github(app.name).pullsFor()).toHaveLength(1);
    expect(
      store
        .listActivity(app.workspaceId)
        .find((event) => event.kind === "change-proposed")?.detail,
    ).toContain("approved by the Full autonomy policy");
    // Still nothing merges: the candidate waits for the engineer on GitHub.
    expect(checks(app.id)["candidate-identified"]).toBe("not-yet");
    const decides = await inPhaseThree(
      "fastapi-nohealth-decides",
      "pi-decides",
    );
    github(decides.name).permissions = { pull: true, push: true, admin: false };
    await grantPublication(decides.id);
    expect(
      (await serverGuyTurn(decides.id, decides.chatId, "conformance: auto"))
        .status,
    ).toBe("succeeded");
    expect(conformance(decides.id).proposal).toMatchObject({
      status: "published",
      requestApproval: false,
      approval: { by: "approval-mode", mode: "pi-decides" },
    });
    expect(conformance(decides.id).acceptance).toBeNull();
    expect(conformance(decides.id).proposedAcceptance?.status).toBe("proposed");
    const noGrant = await inPhaseThree(
      "fastapi-nohealth-nogrant",
      "full-autonomy",
    );
    expect((await serverGuyTurn(noGrant.id)).status).toBe("succeeded");
    expect(conformance(noGrant.id).proposal).toMatchObject({
      status: "approved",
      publicationError: expect.stringContaining("No publishing grant"),
    });
  }, 90_000);

  it("withdraws a proposal and lets a later one supersede it; a weaker behavior definition needs the engineer", async () => {
    const app = await proposed("fastapi-nohealth", "full-autonomy");
    const first = conformance(app.id).proposal!;
    withdrawProposal(app.id, first.id);
    expect(conformance(app.id).proposal).toBeNull();
    expect(feed(app.workspaceId)[0]).toBe("change-withdrawn");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: weak")).status,
    ).toBe("succeeded");
    const second = conformance(app.id).proposal!;
    expect(second.id).not.toBe(first.id);
    expect(store.getConformanceProposal(first.id)?.status).toBe("withdrawn");
    expect(conformance(app.id).acceptance?.version).toBe(1);
    expect(conformance(app.id).proposedAcceptance).toMatchObject({
      version: 2,
      status: "proposed",
    });
    expect(
      store
        .listActivity(app.workspaceId)
        .find((event) => event.kind === "acceptance-proposed")?.detail,
    ).toContain("weaker than the accepted version");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: propose-only"))
        .status,
    ).toBe("succeeded");
    expect(store.getConformanceProposal(second.id)?.status).toBe("superseded");
  }, 90_000);
});

describe("external returns, the no-change path and contract revisions", () => {
  it("accepts a returned branch, applies the scope rules independently and refuses another repository", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    const files = repositoryFixtures["fastapi-conforming"];
    await expect(
      returnExternalChange(app.id, "https://github.com/other/repo/pull/3"),
    ).rejects.toThrow(/points at other\/repo/);
    await expect(
      returnExternalChange(app.id, "nonsense branch name!!"),
    ).rejects.toThrow(/Enter a pull request URL/);
    const pushed = github(app.name).pushBranch(
      "feature/health",
      files,
      "Add health route",
    );
    const returned = await returnExternalChange(app.id, "feature/health");
    expect(returned).toMatchObject({
      origin: "external",
      status: "published",
      external: {
        branch: "feature/health",
        headSha: pushed.sha,
        pullRequestNumber: pushed.number,
        state: "open",
      },
    });
    expect(returned.changes.map((change) => change.path)).toEqual([
      "app/main.py",
    ]);
    expect(returned.mapping[0].explanation).toContain("Returned externally");
    expect(returned.verification?.scope.ok).toBe(true);
    expect(feed(app.workspaceId)[0]).toBe("change-returned");
    expect(results(app.id)["candidate-identified"]).toContain(
      "unmerged head gets preview results only",
    );
    github(app.name).merge(pushed.number!, "rebase");
    const refreshed = await refreshCandidate(app.id);
    expect(refreshed.candidate).toMatchObject({
      source: "external",
      merge: { method: "rebase" },
    });
    expect(checks(app.id)).toMatchObject({
      "candidate-identified": "passed",
      "changes-resolved": "passed",
    });
    // Out of scope: a workflow file in the returned change.
    const violating = await inPhaseThree("fastapi-nohealth-violating");
    const bad = github(violating.name).pushBranch(
      "feature/ci",
      [
        ...files,
        { path: ".github/workflows/deploy.yml", content: "on: push\n" },
      ],
      "Add deploy workflow",
    );
    await returnExternalChange(violating.id, `#${bad.number}`);
    expect(results(violating.id)["changes-resolved"]).toContain(
      "Out-of-scope changes: .github/workflows/deploy.yml",
    );
    expect(checks(violating.id)["changes-resolved"]).toBe("blocked");
    const empty = await inPhaseThree("fastapi-nohealth-empty");
    await expect(
      returnExternalChange(
        empty.id,
        fixtureCommitSha("qa/fastapi-nohealth-empty"),
      ),
    ).rejects.toThrow(/changes nothing/);
  }, 90_000);

  it("verifies an already-conforming repository at the contract commit without a pull request", async () => {
    const app = await inPhaseThree("fastapi-app");
    expect(conformance(app.id).brief?.requiredChanges).toEqual([]);
    expect(results(app.id)["candidate-identified"]).toContain(
      "verify the current revision",
    );
    const selected = selectCurrentRevision(app.id);
    expect(selected).toMatchObject({
      origin: "no-change",
      candidate: {
        sha: fixtureCommitSha("qa/fastapi-app"),
        source: "contract-commit",
      },
    });
    expect(checks(app.id)).toEqual({
      "candidate-identified": "passed",
      "changes-resolved": "passed",
      "conformance-passed": "blocked",
    });
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: propose-only"))
        .status,
    ).toBe("succeeded");
    // No required changes: the model proposes behavior checks only.
    expect(conformance(app.id).proposal?.origin).toBe("no-change");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: full")).status,
    ).toBe("succeeded");
    acceptAcceptanceChecks(app.id, conformance(app.id).proposedAcceptance!.id);
    const run = await verifyCandidate(app.id);
    expect(run.status).toBe("passed");
    expect(checks(app.id)["conformance-passed"]).toBe("passed");
    expect(github(app.name).pullsFor()).toHaveLength(0);
    const nohealth = await inPhaseThree("fastapi-nohealth");
    expect(() => selectCurrentRevision(nohealth.id)).toThrow(
      /1 required change/,
    );
  }, 90_000);

  it("reports honest failures per check for a candidate that starts, answers health, but breaks behavior", async () => {
    const app = await inPhaseThree("fastapi-broken");
    selectCurrentRevision(app.id);
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: full")).status,
    ).toBe("succeeded");
    acceptAcceptanceChecks(app.id, conformance(app.id).proposedAcceptance!.id);
    const run = await verifyCandidate(app.id);
    expect(run.status).toBe("failed");
    expect(run.results.find((result) => result.key === "health")?.outcome).toBe(
      "passed",
    );
    expect(
      run.results.find((result) => result.key === "behavior"),
    ).toMatchObject({
      outcome: "failed",
      steps: [{ passed: true }, { passed: false }],
    });
    expect(results(app.id)["conformance-passed"]).toContain("Failed: behavior");
    expect(feed(app.workspaceId)[0]).toBe("conformance-failed");
    // Rerun appends a new attempt; the earlier one stays as history.
    expect((await verifyCandidate(app.id)).status).toBe("failed");
    expect(
      conformance(app.id).runs.filter((run) => run.kind === "candidate"),
    ).toHaveLength(2);
  }, 90_000);

  it("a Phase 3 contract revision that reintroduces a blocker blocks every check until a further revision resolves it", async () => {
    const app = await inPhaseThree("fastapi-nohealth");
    expect((await serverGuyTurn(app.id)).status).toBe("succeeded");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "contract: correct blocked"))
        .status,
    ).toBe("succeeded");
    expect(store.currentContract(app.id)?.version).toBe(2);
    expect(store.listActivity(app.workspaceId)[0].detail).toContain(
      "revised during Make launch-ready",
    );
    expect(
      Object.values(checks(app.id)).every((status) => status === "blocked"),
    ).toBe(true);
    expect(results(app.id)["candidate-identified"]).toContain(
      "reintroduced 1 unresolved value (Database)",
    );
    expect(conformance(app.id).brief?.blockers).toHaveLength(1);
    await expect(
      serverGuyTurn(app.id, app.chatId, "conformance: full"),
    ).resolves.toMatchObject({ status: "succeeded" });
    expect(
      JSON.parse(store.listMessages(app.chatId).at(-1)!.body).rejected ?? "",
    ).toContain("reintroduced");
    expect(
      (await serverGuyTurn(app.id, app.chatId, "contract: correct unblocked"))
        .status,
    ).toBe("succeeded");
    expect(store.currentContract(app.id)?.version).toBe(3);
    expect(conformance(app.id).contractBlocked).toBeNull();
    // The earlier proposal was bound to v1: approval against v3 is refused.
    const stale = conformance(app.id).proposal!;
    expect(stale.contractVersion).toBe(1);
    expect(() => approveProposal(app.id, stale.id)).toThrow(/now v3/);
  }, 90_000);

  it("cancels a queued candidate run, marks a running one interrupted on restart, and removal cascades", async () => {
    const app = await inPhaseThree("fastapi-app");
    selectCurrentRevision(app.id);
    expect(
      (await serverGuyTurn(app.id, app.chatId, "conformance: full")).status,
    ).toBe("succeeded");
    acceptAcceptanceChecks(app.id, conformance(app.id).proposedAcceptance!.id);
    const queued = requestCandidateVerification(app.id);
    expect(() => requestCandidateVerification(app.id)).toThrow(
      /already queued/,
    );
    expect(cancelCandidateVerification(app.id, queued.id).status).toBe(
      "cancelled",
    );
    expect(results(app.id)["conformance-passed"]).toContain(
      "Unrun checks cannot pass",
    );
    requestCandidateVerification(app.id);
    const claimed = claimNextConformanceRun()!;
    expect(claimed.status).toBe("running");
    const interrupted = interruptConformanceRuns();
    expect(interrupted.map((run) => run.id)).toEqual([claimed.id]);
    expect(store.getConformanceRun(claimed.id)).toMatchObject({
      status: "interrupted",
      error: "Interrupted by a worker restart.",
    });
    expect(results(app.id)["conformance-passed"]).toContain("interrupted");
    phaseOne.removeApplication(app.id, "qa/fastapi-app");
    expect(store.listConformanceProposals(app.id)).toEqual([]);
    expect(store.listConformanceRuns(app.id)).toEqual([]);
    expect(store.listAcceptanceChecks(app.id)).toEqual([]);
    expect(store.activePublicationGrant(app.id)).toBeNull();
  }, 60_000);
});
