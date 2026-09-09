// The real repository-evidence projection into the Phase 2 gate evaluator,
// over SQLite rows and saved GitHub connections: a failed or unavailable
// inspection under the current login keeps its own reason; only an inspection
// made with another login, or with no login left, asks for a fresh one.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as store from "../../../src/server/db";
import {
  saveGithubConnection,
  type GithubConnection,
} from "../../../src/server/github-connection";
import { getOperatorView } from "../../../src/server/operator-view";
import {
  newRunReadBudget,
  readRepositoryFileForRun,
  repositoryEvidence,
} from "../../../src/server/phase-two";
import type { Observation, PiRun } from "../../../src/server/types";
import { fixtureTree, repositoryFixtures } from "../../fixtures/repositories";
import { pushTestDatabase } from "../../test-database";

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";
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

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-phase-two-evidence-"));
  process.env.SERVER_GUY_DB_PATH = join(directory, "test.db");
  process.env.SERVER_GUY_CONFIG_DIR = join(directory, "config");
  process.env.SERVER_GUY_TRACING = "0";
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH);
});
beforeEach(() => {
  saveGithubConnection(login(FIRST));
  store.db().$client.exec("DELETE FROM applications");
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  rmSync(directory, { recursive: true, force: true });
});

function application() {
  const app = store.insertApplication({
    name: "Evidence fixture",
    repositoryUrl: "https://github.com/qa/fastapi-app",
    repositoryOwner: "qa",
    repositoryName: "fastapi-app",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "External changes require approval.",
  });
  const start = store.insertWorkspace(app.id, "start");
  store.completeWorkspace(start.id, { checks: [] });
  const workspace = store.insertWorkspace(app.id, "inspect-app");
  const chat = store.insertChat(workspace.id, "Contract", true);
  return { app, workspace, chat };
}

const COMMIT = "a".repeat(40);
function inspection(
  applicationId: string,
  connectionId: string,
  status: Observation["status"],
) {
  const summary = {
    passed: "Inspected qa/fastapi-app at main · aaaaaaaa: 6 files.",
    failed:
      "Repository inspection did not pass: this login cannot access the repository.",
    unavailable:
      "Repository inspection is unavailable: GitHub tree request timed out.",
  }[status];
  return store.insertObservation({
    applicationId,
    kind: "github-repository-inspection",
    status,
    summary,
    sourceLabel: "Repository inspection",
    sourceUrl: null,
    raw:
      status === "passed"
        ? {
            connectionId,
            commitSha: COMMIT,
            entries: fixtureTree(repositoryFixtures["fastapi-conforming"]),
            truncated: false,
          }
        : { connectionId, error: summary },
  });
}

const profileCheck = (applicationId: string) =>
  getOperatorView(applicationId).checks[0];

describe("repository evidence into the Phase 2 gate", () => {
  it.each([
    ["unavailable", "not-yet"],
    ["failed", "blocked"],
  ] as const)(
    "keeps the actual reason of a %s inspection made with the current login",
    (status, expected) => {
      const { app, chat, workspace } = application();
      const observation = inspection(app.id, FIRST, status);
      const evidence = repositoryEvidence(app.id);
      expect(evidence).toMatchObject({
        connectionCurrent: true,
        current: false,
        commitSha: null,
      });
      const check = profileCheck(app.id);
      expect(check.status).toBe(expected);
      expect(check.result).toBe(observation.summary);
      expect(check.result).not.toContain("previous login");
      expect(check.rerun?.label).toBe("Re-inspect repository");
      expect(check.evidence.map((item) => item.recordId)).toEqual([
        observation.id,
      ]);
      // The tool path agrees with the gate: the read fails for the recorded
      // reason, not for a login that was never replaced.
      const run = {
        applicationId: app.id,
        chatId: chat.id,
        workspaceId: workspace.id,
      } as PiRun;
      return expect(
        readRepositoryFileForRun(
          run,
          { path: "pyproject.toml" },
          newRunReadBudget(),
        ),
      ).rejects.toThrow(
        `The latest inspection did not pass: ${observation.summary}`,
      );
    },
  );

  it.each(["passed", "failed", "unavailable"] as const)(
    "asks for a fresh inspection when the %s one was made with a replaced login",
    (status) => {
      const { app } = application();
      inspection(app.id, FIRST, status);
      saveGithubConnection(login(SECOND));
      expect(repositoryEvidence(app.id)).toMatchObject({
        connectionCurrent: false,
        current: false,
      });
      const check = profileCheck(app.id);
      expect(check.status).toBe("not-yet");
      expect(check.result).toBe(
        "Re-inspect the repository with your current GitHub connection; the last inspection used a previous login.",
      );
      expect(check.rerun?.label).toBe("Re-inspect repository");
    },
  );

  it("asks to connect GitHub again when no login is left", () => {
    const { app } = application();
    inspection(app.id, FIRST, "passed");
    saveGithubConnection(null);
    expect(repositoryEvidence(app.id)).toMatchObject({
      connectionId: null,
      connectionCurrent: false,
      current: false,
    });
    const check = profileCheck(app.id);
    expect(check.status).toBe("not-yet");
    expect(check.result).toBe(
      "Connect GitHub, then re-inspect the repository; the last inspection used a login that is no longer connected.",
    );
    expect(check.rerun?.label).toBe("Inspect repository");
  });

  it("supports the profile only from a passed inspection under the current login", () => {
    const { app } = application();
    inspection(app.id, FIRST, "passed");
    expect(repositoryEvidence(app.id)).toMatchObject({
      connectionCurrent: true,
      current: true,
      commitSha: COMMIT,
    });
    const check = profileCheck(app.id);
    // Repository context is available, but no model-backed selection was saved.
    expect(check.status).toBe("not-yet");
    expect(check.result).toContain(
      "propose an evidence-backed application profile",
    );
  });
});
