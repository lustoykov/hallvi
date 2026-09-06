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
import { diagnosticLogPath } from "../../../src/server/diagnostics";
import * as github from "../../../src/server/github";
import {
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import {
  getApplicationStatus,
  NotFoundError,
} from "../../../src/server/phase-one";
import * as runs from "../../../src/server/pi-runs";
import {
  applicationStatusParameters,
  MAX_APPLICATION_STATUS_CHARACTERS,
  readPiApplicationStatus,
} from "../../../src/server/pi-status";
import { executePiRun } from "../../../src/server/pi-worker";
import type { ApplicationStatus } from "../../../src/server/types";
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
function fixtureApplication(
  name = "status",
  approvalMode: "pi-decides" | "always-ask" = "pi-decides",
) {
  const application = store.insertApplication({
    name,
    repositoryUrl: `https://github.com/qa/${name}`,
    repositoryOwner: "qa",
    repositoryName: name,
    environment: "production",
    approvalMode,
    approvalScope: "Current application launch",
  });
  const workspace = store.insertWorkspace(application.id);
  const chat = store.insertChat(workspace.id, "Launch Brief", true);
  return { application, workspace, chat };
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
      commitSha: "abcdef12".repeat(5),
      error: "raw-provider-detail",
    },
  });
  if (!observedAt) return observation;
  store
    .db()
    .$client.prepare("UPDATE observations SET observed_at = ? WHERE id = ?")
    .run(observedAt, observation.id);
  return { ...observation, observedAt };
}
const repositoryCheck = (status: ApplicationStatus) =>
  status.checks.find((check) => check.key === "repository-readable")!;

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
  store.db().$client.exec("DELETE FROM applications");
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
  it("projects saved configuration, current checks, applicable evidence and catalog requirements without writing", () => {
    saveGithubConnection(login(FIRST));
    const observation = observe(app.application.id, "passed", FIRST, OLD);
    const changes = () =>
      store.db().$client.prepare("SELECT total_changes() AS count").get();
    const before = changes();
    const started = Date.now();
    const status = getApplicationStatus(app.application.id, app.chat.id);
    const applicationEvidence = {
      recordType: "application",
      recordId: app.application.id,
      label: "Application record",
      href: `/api/applications/${app.application.id}`,
      observedAt: app.application.updatedAt,
    };
    expect(status).toEqual({
      retrievedAt: expect.any(String),
      application: {
        id: app.application.id,
        name: "status",
        repositoryUrl: "https://github.com/qa/status",
        environment: "production",
        approvalMode: { key: "pi-decides", label: "Let Server Guy decide" },
        updatedAt: app.application.updatedAt,
      },
      workspace: {
        phaseKey: "start",
        phaseNumber: 1,
        deliverable: "Launch Brief",
        status: "ready",
      },
      checks: [
        {
          key: "application-identity",
          label: "Application details",
          status: "passed",
          result: "status · qa/status · Production",
          evidence: [applicationEvidence],
        },
        {
          key: "repository-readable",
          label: "GitHub repository access",
          status: "passed",
          result: "qa/status is readable at main · abcdef12.",
          evidence: [
            {
              recordType: "observation",
              recordId: observation.id,
              label: "GitHub commit",
              href: `/api/observations/${observation.id}`,
              observedAt: OLD,
            },
          ],
        },
        {
          key: "target-environment",
          label: "Deployment environment",
          status: "passed",
          result: "Production",
          evidence: [applicationEvidence],
        },
        {
          key: "approval-authority",
          label: "When Server Guy asks for approval",
          status: "passed",
          result: "Let Server Guy decide · Current application launch",
          evidence: [applicationEvidence],
        },
      ],
      upcomingRequirements: [
        {
          key: "hetzner-access",
          label: "Hetzner access",
          requiredBeforePhase: 5,
          resolutionPath: "Connect or verify Hetzner before Set up server.",
        },
        {
          key: "cloudflare-access",
          label: "Cloudflare access",
          requiredBeforePhase: 6,
          resolutionPath: "Connect or verify Cloudflare before Connect domain.",
        },
        {
          key: "domain-starting-state",
          label: "Domain starting state",
          requiredBeforePhase: 6,
          resolutionPath:
            "Tell Server Guy whether the domain is already owned before Connect domain.",
        },
      ],
    });
    // Reading is not observing: the snapshot time is now; the repository
    // evidence keeps the time its check actually ran.
    expect(Date.parse(status.retrievedAt)).toBeGreaterThanOrEqual(
      Math.floor(started / 1000) * 1000,
    );
    expect(Date.parse(status.retrievedAt)).toBeGreaterThan(Date.parse(OLD));
    expect(changes()).toEqual(before);
    expect(store.listActivity(app.workspace.id)).toEqual([]);
    expect(store.listObservations(app.application.id)).toHaveLength(1);
    expect(github.inspectGithubRepository).not.toHaveBeenCalled();
    const { text } = readPiApplicationStatus(app.application.id, app.chat.id);
    expect(JSON.parse(text)).toEqual(
      expect.objectContaining({ retrievedAt: expect.any(String) }),
    );
    for (const secret of [
      "ghu_",
      "raw-account-login",
      "raw-provider-detail",
      "abcdef12abcdef12",
      "connectionId",
    ])
      expect(text).not.toContain(secret);
  });

  it("binds scope to the accepted Run's application and Chat and fails for mismatched or deleted records", () => {
    const other = fixtureApplication("other");
    expect(() =>
      getApplicationStatus(app.application.id, other.chat.id),
    ).toThrow(NotFoundError);
    expect(() =>
      getApplicationStatus(other.application.id, app.chat.id),
    ).toThrow("Chat not found.");
    expect(() => getApplicationStatus("missing", app.chat.id)).toThrow(
      "Application not found.",
    );
    expect(
      getApplicationStatus(other.application.id, other.chat.id).application.id,
    ).toBe(other.application.id);
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
    const passed = observe(app.application.id, "passed", FIRST, OLD);
    const failed = observe(app.application.id, "failed", FIRST);
    const status = getApplicationStatus(app.application.id, app.chat.id);
    expect(repositoryCheck(status)).toEqual({
      key: "repository-readable",
      label: "GitHub repository access",
      status: "blocked",
      result: failed.summary,
      evidence: [
        {
          recordType: "observation",
          recordId: failed.id,
          label: "GitHub repository check",
          href: `/api/observations/${failed.id}`,
          observedAt: failed.observedAt,
        },
      ],
    });
    expect(status.workspace.status).toBe("in-progress");
    const text = JSON.stringify(status);
    expect(text).not.toContain(passed.id);
    expect(text).not.toContain("readable at main");
  });

  it("withholds a passing check's evidence once the GitHub login was replaced or removed", () => {
    saveGithubConnection(login(FIRST));
    const passed = observe(app.application.id, "passed", FIRST);
    expect(
      repositoryCheck(getApplicationStatus(app.application.id, app.chat.id)),
    ).toMatchObject({ status: "passed", evidence: [{ recordId: passed.id }] });
    saveGithubConnection(login(SECOND));
    const replaced = getApplicationStatus(app.application.id, app.chat.id);
    expect(repositoryCheck(replaced)).toEqual({
      key: "repository-readable",
      label: "GitHub repository access",
      status: "not-yet",
      result: "Run the repository check with your current GitHub connection.",
      evidence: [],
    });
    expect(replaced.workspace.status).toBe("in-progress");
    expect(JSON.stringify(replaced)).not.toContain(passed.id);
    saveGithubConnection(null);
    expect(
      repositoryCheck(getApplicationStatus(app.application.id, app.chat.id)),
    ).toEqual({
      key: "repository-readable",
      label: "GitHub repository access",
      status: "not-yet",
      result: "Connect GitHub, then run the repository check.",
      evidence: [],
    });
  });

  it("keeps an unavailable result as applicable evidence and manufactures none when no check exists", () => {
    saveGithubConnection(login(FIRST));
    expect(
      repositoryCheck(getApplicationStatus(app.application.id, app.chat.id)),
    ).toMatchObject({
      status: "not-yet",
      result: "Run the repository check with your current GitHub connection.",
      evidence: [],
    });
    const unavailable = observe(app.application.id, "unavailable", FIRST);
    expect(
      repositoryCheck(getApplicationStatus(app.application.id, app.chat.id)),
    ).toMatchObject({
      status: "not-yet",
      result: unavailable.summary,
      evidence: [
        { recordId: unavailable.id, label: "GitHub repository check" },
      ],
    });
  });

  it("reads the saved Approval Mode again on every call", () => {
    const first = getApplicationStatus(app.application.id, app.chat.id);
    expect(first.application.approvalMode).toEqual({
      key: "pi-decides",
      label: "Let Server Guy decide",
    });
    store
      .db()
      .$client.prepare("UPDATE applications SET approval_mode = ? WHERE id = ?")
      .run("always-ask", app.application.id);
    const second = getApplicationStatus(app.application.id, app.chat.id);
    expect(second.application.approvalMode).toEqual({
      key: "always-ask",
      label: "Always ask",
    });
    expect(
      second.checks.find((check) => check.key === "approval-authority")?.result,
    ).toBe("Always ask · Current application launch");
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
    const observation = observe(app.application.id, "passed", FIRST, OLD);
    const observationsBefore = store.listObservations(app.application.id);
    const { run, reply, steps } = await turn("status");
    expect(run.status).toBe("succeeded");
    const seen = JSON.parse(reply.body) as { isError: boolean; text: string };
    expect(seen.isError).toBe(false);
    const status = JSON.parse(seen.text) as ApplicationStatus;
    expect(status.application.id).toBe(app.application.id);
    expect(status.workspace.status).toBe("ready");
    expect(repositoryCheck(status)).toMatchObject({
      status: "passed",
      evidence: [{ recordId: observation.id, observedAt: OLD }],
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
      "GitHub repository access",
    );
    expect(JSON.stringify(requests[1].messages)).toContain(
      "GitHub repository access",
    );
    expect(steps.map((row) => [row.stepId, row.step, row.outcome])).toEqual([
      ["context", "context", "completed"],
      ["session", "session", "completed"],
      ["model:1", "model", "completed"],
      ["tool:1", "get_application_status", "completed"],
      ["model:2", "model", "completed"],
      ["save", "save", "completed"],
    ]);
    expect(store.listActivity(app.workspace.id)).toEqual([]);
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
      expect(seen.text).not.toContain('"checks"');
      expect(failed.steps.find((row) => row.stepId === "tool:1")).toMatchObject(
        { step: "get_application_status", outcome: "failed" },
      );
    } finally {
      failing.mockRestore();
    }
    expect(store.listActivity(app.workspace.id)).toEqual([]);
  });
});
