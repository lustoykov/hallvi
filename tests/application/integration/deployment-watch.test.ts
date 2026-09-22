import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as api from "../../../src/server/github-api";
import {
  askDeploymentChoice,
  changeDeploymentState,
  chooseDeployment,
  deploymentState,
  deploymentStatus,
} from "../../../src/server/deployment-automation";
import { deploymentWatch } from "../../../src/server/deployment-watch";
import { saveOperatorSettings } from "../../../src/server/operator-execution";
import { saveInformation } from "../../../src/server/saved-information";
import type { Transcript } from "../../../src/server/pi-transcript";
import { pushTestDatabase } from "../../test-database";

// The branch watch against a real database and its real record on disk. Only
// GitHub and Pi are stood in for: GitHub says where the branch is, and "Pi" is
// a conversation that is driving or not and may have saved a release record.

vi.mock("../../../src/server/github-connection", async (original) => ({
  ...(await original<object>()),
  repositoryCredential: async () => ({
    token: "ghu_fixture",
    connection: { id: "fixture-connection" },
  }),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<object>()),
  githubJson: vi.fn(),
}));

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
let root: string;
let applicationId: string;
let chatId: string;
let tip = A;
let driving = false;
let status: Transcript["status"] = "idle";
const sent: { id: string; body: string }[] = [];

const conversations = {
  driving: (id: string) => id === chatId && driving,
  async send(_scope: unknown, message: { id: string; body: string }) {
    sent.push(message);
    driving = true;
  },
  transcript: async (): Promise<Transcript> => ({
    status,
    messages: [],
    calls: {},
    said: [],
  }),
};

/** A watch whose minute has always passed: every tick looks at GitHub. */
function watch() {
  vi.setSystemTime(Date.now() + 61_000);
  return deploymentWatch(conversations);
}

function release(revision: string, outcome: "verified" | "failed") {
  saveInformation(applicationId, {
    title: `Release ${revision.slice(0, 7)}`,
    body: "What the deployment did.",
    establishedAt: new Date().toISOString(),
    presentation: {
      views: ["deployment"],
      role: "outcome",
      status: outcome,
      checks: [
        {
          key: "http",
          label: "The application answered",
          status: outcome === "verified" ? "passed" : "failed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "application", id: applicationId },
        },
      ],
      facts: [],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/private",
        revision,
        image: "app:latest",
        server: "fixture",
        changes: [],
      },
    },
  });
  driving = false;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  root = mkdtempSync(join(tmpdir(), "hallvi-watch-test-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
  const app = store.insertApplication({
    name: "Private app",
    repositoryUrl: "https://github.com/qa/private",
    repositoryOwner: "qa",
    repositoryName: "private",
  });
  applicationId = app.id;
  chatId = store.insertChat(app.id, "Main operator").id;
  saveOperatorSettings(app.id, {
    permissionMode: "bypass",
    host: {
      address: "fixture.invalid",
      user: "root",
      port: 22,
      privateKeyPath: "/fixture/key",
      knownHostsPath: "/fixture/hosts",
    },
  });
  vi.mocked(api.githubJson).mockImplementation(async (path) => {
    if (path.endsWith("/commits/gone"))
      throw new api.GithubAccessError("No such branch.", "access");
    expect(path).toBe("/repos/qa/private/commits/main");
    return {
      data: { sha: tip, commit: { message: `Change ${tip[0]}\n\nbody` } },
      scopes: [],
      etag: null,
    };
  });
});
afterAll(() => {
  vi.useRealTimers();
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("refuses an unreadable branch suggested by the setup card without saving the choice", async () => {
  askDeploymentChoice(applicationId, "gone");
  await expect(
    chooseDeployment(applicationId, { mode: "automatic", branch: "gone" }),
  ).rejects.toThrow(/no branch “gone”/);
  expect(deploymentState(applicationId).mode).toBeNull();
});

it("is watching only once GitHub has answered, and waits for a first release", async () => {
  const chosen = await chooseDeployment(applicationId, {
    mode: "automatic",
    branch: "main",
  });
  expect(chosen.latest?.commit).toBe(A);
  expect(deploymentStatus(applicationId).watching).toBe(true);
  // Nothing is deployed yet: the first deployment is the owner's and Pi's.
  await watch().tick();
  expect(sent).toHaveLength(0);
});

it("deploys each pushed commit once, one at a time, and catches up to the newest", async () => {
  release(A, "verified");
  await watch().tick();
  expect(sent).toHaveLength(0);

  tip = B;
  const watching = watch();
  await watching.tick();
  expect(sent).toHaveLength(1);
  expect(sent[0].id).toMatch(/^wakeup:/);
  expect(sent[0].body).toContain(B);

  // A second push lands while B is still deploying: noticed, not started.
  tip = C;
  vi.setSystemTime(Date.now() + 61_000);
  await watching.tick();
  expect(sent).toHaveLength(1);
  expect(deploymentState(applicationId).latest?.commit).toBe(C);

  // Pi verifies B. Only now is B deployed, and C starts.
  release(B, "verified");
  await watching.tick();
  const state = deploymentState(applicationId);
  expect(state.attempts.map((one) => [one.commit, one.outcome])).toEqual([
    [C, "running"],
    [B, "deployed"],
  ]);
  expect(sent).toHaveLength(2);
  expect(sent[1].body).toContain(C);
});

it("reports a failed deployment and never retries that commit by itself", async () => {
  release(C, "failed");
  await watch().tick();
  // A restart changes nothing: the record says C was tried.
  await watch().tick();
  const status = deploymentStatus(applicationId);
  expect(status.attempts[0]).toMatchObject({ commit: C, outcome: "failed" });
  expect(status.attempts[0].detail).toContain("The application answered");
  expect(status.deployed).toBe(B);
  expect(sent).toHaveLength(2);
});

it("lets the owner retry, and calls a deployment a restart cut short interrupted", async () => {
  const watching = watch();
  await watching.handle({ applicationId }, { action: "deploy" });
  expect(sent).toHaveLength(3);
  expect(deploymentState(applicationId).attempts[0]).toMatchObject({
    commit: C,
    trigger: "owner",
    outcome: "running",
  });

  // The worker goes away mid-deployment. The next one finds nobody driving
  // and a conversation Pi says was interrupted.
  driving = false;
  status = "interrupted";
  await watch().tick();
  expect(deploymentState(applicationId).attempts[0].outcome).toBe(
    "interrupted",
  );
  expect(sent).toHaveLength(3);
  status = "idle";
});

it("holds pushes while paused and deploys the newest on resume", async () => {
  await chooseDeployment(applicationId, { paused: true });
  tip = "d".repeat(40);
  await watch().tick();
  expect(sent).toHaveLength(3);
  expect(deploymentState(applicationId).latest?.commit).toBe(tip);

  await chooseDeployment(applicationId, { paused: false });
  await watch().tick();
  expect(sent).toHaveLength(4);
  expect(sent[3].body).toContain(tip);
});

it("keeps the newest twenty attempts without refusing the next deployment", async () => {
  driving = false;
  changeDeploymentState(applicationId, (state) => ({
    ...state,
    attempts: Array.from({ length: 20 }, (_, index) => ({
      id: `wakeup:older-${index}`,
      commit: A,
      title: "Earlier deployment",
      trigger: "push" as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      outcome: "deployed" as const,
      detail: null,
      recordId: null,
    })),
  }));
  tip = "e".repeat(40);
  await watch().handle({ applicationId }, { action: "deploy" });
  const state = deploymentState(applicationId);
  expect(state.attempts).toHaveLength(20);
  expect(state.attempts[0]).toMatchObject({ commit: tip, outcome: "running" });
  expect(state.attempts.at(-1)?.id).toBe("wakeup:older-18");
});

it("accepts only one deployment while simultaneous sends are being opened", async () => {
  driving = false;
  changeDeploymentState(applicationId, (state) => ({ ...state, attempts: [] }));
  let finish!: () => void;
  const accepted = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const send = vi.fn(async () => {
    await accepted;
    driving = true;
  });
  const watching = deploymentWatch({ ...conversations, send });
  const results = Promise.allSettled([
    watching.handle({ applicationId }, { action: "deploy" }),
    watching.handle({ applicationId }, { action: "deploy" }),
  ]);
  await vi.waitFor(() => expect(send).toHaveBeenCalled());
  finish();
  const outcomes = await results;
  expect(send).toHaveBeenCalledTimes(1);
  expect(outcomes.filter((one) => one.status === "fulfilled")).toHaveLength(1);
  expect(deploymentState(applicationId).attempts).toHaveLength(1);
});

it("does not deploy a cached tip when Deploy latest cannot read GitHub", async () => {
  driving = false;
  changeDeploymentState(applicationId, (state) => ({ ...state, attempts: [] }));
  const send = vi.fn(conversations.send);
  vi.mocked(api.githubJson).mockRejectedValueOnce(
    new api.GithubAccessError("GitHub is unavailable."),
  );
  const watching = deploymentWatch({ ...conversations, send });
  await expect(
    watching.handle({ applicationId }, { action: "deploy" }),
  ).rejects.toThrow("GitHub is unavailable.");
  expect(send).not.toHaveBeenCalled();
  expect(deploymentState(applicationId).attempts).toHaveLength(0);
});
