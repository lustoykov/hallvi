// The scoped application status lookup: what Pi receives, how scope is bound,
// that the latest or invalidated repository result always wins, that reading
// writes nothing and contacts no provider, and that the real SDK tool loop
// carries the projection or the failure back to the model.
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
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
import { NotFoundError } from "../../../src/server/applications";
import { requestDeployment } from "../../../src/server/deployment-store";
import { diagnosticLogPath } from "../../../src/server/diagnostics";
import * as github from "../../../src/server/github";
import {
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import * as runs from "../../../src/server/pi-runs";
import {
  applicationStatusParameters,
  MAX_APPLICATION_STATUS_CHARACTERS,
  readPiApplicationStatus,
} from "../../../src/server/pi-status";
import { executePiRun } from "../../../src/server/pi-worker";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({ configure: vi.fn() }));
vi.mock("../../../src/server/github", async (original) => ({
  ...(await original<typeof import("../../../src/server/github")>()),
  inspectGithubRepository: vi.fn(() => {
    throw new Error("A status read never contacts GitHub.");
  }),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  githubJson: vi.fn(() => {
    throw new Error("No GitHub API calls in status tests");
  }),
  githubDeviceRequest: vi.fn(() => {
    throw new Error("No GitHub login in status tests");
  }),
  readGithubCliCredential: vi.fn(() => {
    throw new Error("No real GitHub credentials in status tests");
  }),
}));
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-configuration")>()),
  configuredPiRuntime: mocks.configure,
}));

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";
const OLD = "2026-09-01T10:00:00.000Z";
const SHA = "abcdef12".repeat(5);
function login(id: string): GithubConnection {
  return {
    id,
    mode: "app",
    account: { id: 42, login: "status-fixture" },
    connectedAt: new Date().toISOString(),
    clientId: "Iv1.fixture",
    slug: "server-guy-fixture",
    token: "ghu_fixture-not-a-real-token",
    expiresAt: null,
  };
}
function fixtureApplication(name = "status") {
  const application = store.insertApplication({
    name,
    repositoryUrl: `https://github.com/qa/${name}`,
    repositoryOwner: "qa",
    repositoryName: name,
  });
  const chat = store.insertChat(application.id, "Deploy application");
  return { application, chat };
}
function observe(
  applicationId: string,
  status: "passed" | "failed" | "unavailable",
  connectionId: string,
  observedAt?: string,
) {
  const observation = store.insertObservation({
    applicationId,
    kind: "github-repository-identity",
    status,
    summary:
      status === "passed"
        ? "qa/status is readable at main · abcdef12."
        : status === "failed"
          ? "qa/status is not readable with the current GitHub access: the repository is not allowed in the installation."
          : "GitHub inspection is unavailable: the request timed out.",
    sourceLabel:
      status === "passed" ? "GitHub commit" : "GitHub repository check",
    sourceUrl: null,
    raw: {
      connectionId,
      repository: "qa/status",
      authenticatedAs: "raw-account-login",
      error: "raw-provider-detail",
      ...(status === "passed" ? { defaultBranch: "main", commitSha: SHA } : {}),
    },
  });
  if (!observedAt) return observation;
  store
    .db()
    .$client.prepare("UPDATE observations SET observed_at = ? WHERE id = ?")
    .run(observedAt, observation.id);
  return { ...observation, observedAt };
}
const getStatus = (applicationId: string, chatId: string) =>
  readPiApplicationStatus(applicationId, chatId).status;
type Status = ReturnType<typeof getStatus>;
const notChecked = (result: string) => ({
  status: "not-yet",
  result,
  checkedAt: null,
  commitSha: null,
  defaultBranch: null,
});

let directory: string;
let app: ReturnType<typeof fixtureApplication>;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-status-tool-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(directory, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(directory, "config"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "pi"));
  vi.stubEnv("SERVER_GUY_TRACING", "0");
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(() => {
  saveGithubConnection(null);
  // Deployment records are retained history: they never cascade.
  store.db().$client.exec("DELETE FROM deployments; DELETE FROM applications");
  app = fixtureApplication();
  mocks.configure.mockReset();
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("scoped application status projection", () => {
  it("projects saved identity, current repository access and the recorded deployment without writing", () => {
    saveGithubConnection(login(FIRST));
    const observation = observe(app.application.id, "passed", FIRST, OLD);
    const changes = () =>
      store.db().$client.prepare("SELECT total_changes() AS count").get();
    const before = changes();
    const started = Date.now();
    const status = getStatus(app.application.id, app.chat.id);
    expect(status).toEqual({
      retrievedAt: expect.any(String),
      application: {
        id: app.application.id,
        name: "status",
        repositoryUrl: "https://github.com/qa/status",
        updatedAt: app.application.updatedAt,
      },
      repositoryAccess: {
        status: "passed",
        result: "qa/status is readable at main · abcdef12.",
        checkedAt: OLD,
        commitSha: SHA,
        defaultBranch: "main",
      },
      deployment: null,
    });
    // Reading is not observing: the snapshot time is now; the repository
    // result keeps the time its check actually ran.
    expect(Date.parse(status.retrievedAt)).toBeGreaterThanOrEqual(
      Math.floor(started / 1000) * 1000,
    );
    expect(Date.parse(status.retrievedAt)).toBeGreaterThan(Date.parse(OLD));
    expect(changes()).toEqual(before);
    expect(store.listActivity(app.application.id)).toEqual([]);
    expect(store.listObservations(app.application.id)).toHaveLength(1);
    expect(github.inspectGithubRepository).not.toHaveBeenCalled();
    const { text } = readPiApplicationStatus(app.application.id, app.chat.id);
    expect(JSON.parse(text)).toEqual(
      expect.objectContaining({ retrievedAt: expect.any(String) }),
    );
    for (const hidden of [
      "ghu_",
      "raw-account-login",
      "raw-provider-detail",
      "connectionId",
      observation.id,
    ])
      expect(text).not.toContain(hidden);
  });

  it("binds scope to the accepted Run's application and Chat and fails for mismatched or deleted records", () => {
    const other = fixtureApplication("other");
    expect(() => getStatus(app.application.id, other.chat.id)).toThrow(
      NotFoundError,
    );
    expect(() => getStatus(other.application.id, app.chat.id)).toThrow(
      "Chat not found.",
    );
    expect(() => getStatus("missing", app.chat.id)).toThrow(
      "Application not found.",
    );
    expect(getStatus(other.application.id, other.chat.id).application.id).toBe(
      other.application.id,
    );
    store.deleteApplication(app.application.id);
    expect(() =>
      readPiApplicationStatus(app.application.id, app.chat.id),
    ).toThrow("Application not found.");
    // The model supplies nothing: not an application, a filter or a refresh.
    expect(Value.Check(applicationStatusParameters, {})).toBe(true);
    for (const attempt of [
      { applicationId: other.application.id },
      { chatId: other.chat.id },
      { refresh: true },
      null,
    ])
      expect(Value.Check(applicationStatusParameters, attempt)).toBe(false);
  });

  it("reports the latest failed check and never substitutes an older passing Observation", () => {
    saveGithubConnection(login(FIRST));
    observe(app.application.id, "passed", FIRST, OLD);
    const failed = observe(app.application.id, "failed", FIRST);
    const status = getStatus(app.application.id, app.chat.id);
    expect(status.repositoryAccess).toEqual({
      status: "blocked",
      result: failed.summary,
      checkedAt: failed.observedAt,
      commitSha: null,
      defaultBranch: null,
    });
    const text = JSON.stringify(status);
    expect(text).not.toContain("readable at main");
    expect(text).not.toContain(SHA);
  });

  it("withholds a passing check's evidence once the GitHub login was replaced or removed", () => {
    saveGithubConnection(login(FIRST));
    observe(app.application.id, "passed", FIRST);
    expect(
      getStatus(app.application.id, app.chat.id).repositoryAccess,
    ).toMatchObject({ status: "passed", commitSha: SHA });
    saveGithubConnection(login(SECOND));
    const replaced = getStatus(app.application.id, app.chat.id);
    expect(replaced.repositoryAccess).toEqual(
      notChecked(
        "Run the repository check with your current GitHub connection.",
      ),
    );
    expect(JSON.stringify(replaced)).not.toContain(SHA);
    saveGithubConnection(null);
    expect(getStatus(app.application.id, app.chat.id).repositoryAccess).toEqual(
      notChecked("Connect GitHub, then run the repository check."),
    );
  });

  it("keeps an unavailable result as the current outcome and manufactures none when no check exists", () => {
    saveGithubConnection(login(FIRST));
    expect(getStatus(app.application.id, app.chat.id).repositoryAccess).toEqual(
      notChecked(
        "Run the repository check with your current GitHub connection.",
      ),
    );
    const unavailable = observe(app.application.id, "unavailable", FIRST);
    expect(getStatus(app.application.id, app.chat.id).repositoryAccess).toEqual(
      {
        status: "not-yet",
        result: unavailable.summary,
        checkedAt: unavailable.observedAt,
        commitSha: null,
        defaultBranch: null,
      },
    );
  });

  it("reads the recorded deployment again on every call", () => {
    const first = getStatus(app.application.id, app.chat.id);
    expect(first.deployment).toBeNull();
    const record = requestDeployment(app.application.id, app.chat.id);
    const second = getStatus(app.application.id, app.chat.id);
    expect(second.deployment).toMatchObject({
      status: record.status,
      revision: record.revision,
      serverId: null,
      verifiedAt: null,
      runtime: { state: "not-observed", lastVerified: null },
    });
    expect(Date.parse(second.retrievedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.retrievedAt),
    );
  });

  it("propagates storage failures and oversized projections as errors, not empty status", () => {
    const client = store.db().$client;
    const failing = vi.spyOn(client, "prepare").mockImplementationOnce(() => {
      throw new Error("Status storage unavailable");
    });
    try {
      expect(() =>
        readPiApplicationStatus(app.application.id, app.chat.id),
      ).toThrow("Status storage unavailable");
    } finally {
      failing.mockRestore();
    }
    const huge = fixtureApplication(
      "h".repeat(MAX_APPLICATION_STATUS_CHARACTERS),
    );
    expect(() =>
      readPiApplicationStatus(huge.application.id, huge.chat.id),
    ).toThrow("larger than the supported tool result");
  });
});

// The synthetic provider asks for the status once, then answers with what the
// tool loop handed back, so the test can read exactly what the model saw.
async function syntheticRuntime(
  sdk: typeof import("@earendil-works/pi-coding-agent"),
  requests: Context[],
) {
  const runtime = await sdk.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const provider = "server-guy-status-test";
  const text = (message: Context["messages"][number]) =>
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  runtime.registerProvider(provider, {
    api: provider,
    apiKey: "NO-NETWORK",
    baseUrl: "https://synthetic.invalid",
    streamSimple: (model, context: Context) => {
      requests.push(context);
      const stream = createAssistantMessageEventStream();
      const userIndex = context.messages.findLastIndex(
        (message) => message.role === "user",
      );
      const user = text(context.messages[userIndex]);
      const results = context.messages
        .slice(userIndex + 1)
        .filter((message) => message.role === "toolResult");
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
      if (user.startsWith("status") && !results.length) {
        message.content = [
          {
            type: "toolCall",
            id: randomUUID(),
            name: "get_application_status",
            arguments:
              user === "status-extra" ? { applicationId: "other" } : {},
          },
        ];
        message.stopReason = "toolUse";
      } else {
        const last = results.at(-1);
        message.content = [
          {
            type: "text",
            text: JSON.stringify(
              last
                ? { isError: last.isError, text: text(last) }
                : { answered: user },
            ),
          },
        ];
      }
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason as "stop" | "toolUse",
        message,
      });
      return stream;
    },
    models: [
      {
        id: "synthetic",
        name: "Synthetic",
        reasoning: false,
        input: ["text"],
        contextWindow: 200_000,
        maxTokens: 2_048,
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

describe("status lookup through the actual SDK tool loop", () => {
  const requests: Context[] = [];
  beforeEach(() => {
    requests.length = 0;
    mocks.configure.mockImplementation((sdk) =>
      syntheticRuntime(sdk, requests),
    );
  });
  async function turn(message: string) {
    const accepted = runs.sendChatMessage(
      app.application.id,
      app.chat.id,
      message,
      randomUUID(),
    );
    const run = runs.claimNextPiRun()!;
    expect(run.id).toBe(accepted.run.id);
    await executePiRun(run);
    // Step outcomes live in the bounded local diagnostic log, keyed by Run.
    const steps = readFileSync(diagnosticLogPath(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((row) => row.runId === run.id && row.event === "step.finished");
    return {
      run: runs.getPiRun(run.id)!,
      reply: store.listMessages(app.chat.id).at(-1)!,
      steps,
    };
  }
  const nativeText = () =>
    readFileSync(
      join(
        directory,
        "pi-sessions",
        app.application.id,
        `${app.chat.id}.jsonl`,
      ),
      "utf8",
    );

  it("hands the model the current projection with no injected summary and records only reply details", async () => {
    saveGithubConnection(login(FIRST));
    observe(app.application.id, "passed", FIRST, OLD);
    const observationsBefore = store.listObservations(app.application.id);
    const { run, reply, steps } = await turn("status");
    expect(run.status).toBe("succeeded");
    const seen = JSON.parse(reply.body) as { isError: boolean; text: string };
    expect(seen.isError).toBe(false);
    const status = JSON.parse(seen.text) as Status;
    expect(status.application.id).toBe(app.application.id);
    expect(status.repositoryAccess).toMatchObject({
      status: "passed",
      checkedAt: OLD,
    });
    expect(Date.parse(status.retrievedAt)).toBeGreaterThan(Date.parse(OLD));
    // The context message identifies the Run; it carries no checks or mode.
    const context = requests[0].messages
      .filter((message) => message.role === "user")
      .map((message) => {
        try {
          return JSON.parse(
            typeof message.content === "string"
              ? message.content
              : message.content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join(""),
          ) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((value) => value?.runId === run.id)!;
    expect(Object.keys(context).sort()).toEqual([
      "applicationId",
      "chatId",
      "createdAt",
      "previousAttempt",
      "runId",
    ]);
    expect(JSON.stringify(requests[0].messages)).not.toContain(
      "repositoryAccess",
    );
    expect(JSON.stringify(requests[1].messages)).toContain("repositoryAccess");
    expect(steps.map((row) => [row.stepId, row.step, row.outcome])).toEqual([
      ["context", "context", "completed"],
      ["session", "session", "completed"],
      ["model:1", "model", "completed"],
      ["tool:1", "get_application_status", "completed"],
      ["model:2", "model", "completed"],
      ["save", "save", "completed"],
    ]);
    expect(store.listActivity(app.application.id)).toEqual([]);
    expect(store.listObservations(app.application.id)).toEqual(
      observationsBefore,
    );
    expect(github.inspectGithubRepository).not.toHaveBeenCalled();
    expect(nativeText()).toContain('"toolName":"get_application_status"');
    expect(nativeText()).not.toContain("currentApplication");
  });

  it("rejects an application choice before execution and returns a failed read as an error result", async () => {
    saveGithubConnection(login(FIRST));
    const extra = await turn("status-extra");
    expect(extra.run.status).toBe("succeeded");
    const rejected = JSON.parse(extra.reply.body);
    expect(rejected.isError).toBe(true);
    expect(rejected.text).toContain("Validation failed");
    expect(rejected.text).not.toContain("retrievedAt");
    expect(extra.steps.find((row) => row.stepId === "tool:1")).toMatchObject({
      step: "get_application_status",
      outcome: "failed",
    });

    const failing = vi
      .spyOn(store, "latestObservation")
      .mockImplementationOnce(() => {
        throw new Error("Status storage unavailable");
      });
    try {
      const failed = await turn("status-fail");
      expect(failed.run.status).toBe("succeeded");
      const seen = JSON.parse(failed.reply.body);
      expect(seen.isError).toBe(true);
      expect(seen.text).toContain("Status storage unavailable");
      expect(seen.text).not.toContain('"repositoryAccess"');
      expect(failed.steps.find((row) => row.stepId === "tool:1")).toMatchObject(
        { step: "get_application_status", outcome: "failed" },
      );
    } finally {
      failing.mockRestore();
    }
    expect(store.listActivity(app.application.id)).toEqual([]);
  });
});
