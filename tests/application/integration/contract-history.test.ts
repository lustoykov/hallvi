// Contract history over real SQLite: every saved version newest first, the
// current one marked, field changes classified as value, source, both, work,
// added or removed, the causing message quoted, and the route's 404.
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

import type {
  ApplicationContractBody,
  ContractField,
} from "../../../src/server/types";
import { pushTestDatabase } from "../../test-database";

let root: string;
let store: typeof import("../../../src/server/db");
let history: typeof import("../../../src/server/contract-history");
let route: typeof import("../../../src/app/api/applications/[applicationId]/contracts/route");

const COMMIT_ONE = "1".repeat(40);
const COMMIT_TWO = "2".repeat(40);

function declared(path: string, snippet: string): ContractField["provenance"] {
  return {
    kind: "repository-declared",
    citation: { observationId: "obs-1", path, snippet },
  };
}

function body(
  commitSha: string,
  fields: ContractField[],
  summary = "FastAPI service managed with uv.",
): ApplicationContractBody {
  return {
    profileId: "fastapi-uv",
    profileVersion: 1,
    commitSha,
    summary,
    fields,
  };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "server-guy-contract-history-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("SERVER_GUY_TRACING", "0");
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  delete globalThis.__serverGuyDb;
  store = await import("../../../src/server/db");
  history = await import("../../../src/server/contract-history");
  route =
    await import("../../../src/app/api/applications/[applicationId]/contracts/route");
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function seed() {
  const application = store.insertApplication({
    name: "todo",
    repositoryUrl: "https://github.com/qa/todo",
    repositoryOwner: "qa",
    repositoryName: "todo",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Current application launch",
  });
  const start = store.insertWorkspace(application.id, "start");
  store.insertChat(start.id, "Launch Brief", true);
  store.completeWorkspace(start.id, { completedAt: new Date().toISOString() });
  const workspace = store.insertWorkspace(application.id, "inspect-app");
  const chat = store.insertChat(workspace.id, "Application Contract", true);
  const request = store.insertMessage(
    chat.id,
    "user",
    "Inspect the repository and propose the Application Contract.",
    "server-guy",
  );
  const v1 = store.insertContract({
    applicationId: application.id,
    workspaceId: workspace.id,
    version: 1,
    sourceMessageId: request.id,
    body: body(COMMIT_ONE, [
      {
        key: "health.path",
        value: "/health",
        provenance: { kind: "profile-rule", ruleId: "health-path" },
        conformance: {
          observed: "app/main.py declares no health route.",
          change: "Add GET /health returning 200.",
        },
      },
      {
        key: "network.port",
        value: "8000",
        provenance: declared("Dockerfile", "EXPOSE 8000"),
      },
      {
        key: "database.migrations",
        value: "alembic",
        provenance: declared("alembic.ini", "[alembic]"),
      },
    ]),
  });
  const correction = store.insertMessage(
    chat.id,
    "user",
    "contract: the health endpoint is /health, confirmed by me",
    "user",
  );
  const v2 = store.insertContract({
    applicationId: application.id,
    workspaceId: workspace.id,
    version: 2,
    sourceMessageId: correction.id,
    body: body(COMMIT_TWO, [
      {
        key: "health.path",
        value: "/health",
        provenance: {
          kind: "user-confirmed",
          source: {
            type: "message",
            messageId: correction.id,
            quote: "the health endpoint is /health",
          },
        },
        conformance: {
          observed: "app/main.py declares no health route.",
          change: "Add GET /health returning 200.",
        },
      },
      {
        key: "network.port",
        value: "8080",
        provenance: {
          kind: "inferred",
          citation: {
            observationId: "obs-2",
            path: "app/config.py",
            snippet: "port = 8080",
          },
        },
      },
      {
        key: "runtime.python",
        value: ">=3.12",
        provenance: declared("pyproject.toml", 'requires-python = ">=3.12"'),
      },
    ]),
  });
  store.supersedeContract(application.id, v1.id, v2.id);
  return { application, v1, v2, correction, request };
}

describe("contractHistory", () => {
  it("lists every saved version newest first with the current one marked", () => {
    const { application, v1, v2 } = seed();
    const versions = history.contractHistory(application.id);
    expect(versions.map((entry) => entry.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      id: v2.id,
      current: true,
      commitSha: COMMIT_TWO,
      commitChanged: true,
      phaseKey: "inspect-app",
      fieldCount: 3,
    });
    expect(versions[1]).toMatchObject({
      id: v1.id,
      current: false,
      commitChanged: false,
      changes: [],
    });
  });

  it("classifies field changes and never calls a source-only change a value change", () => {
    const { application } = seed();
    const [latest] = history.contractHistory(application.id);
    const byKey = Object.fromEntries(
      latest.changes.map((change) => [change.key, change]),
    );
    expect(byKey["health.path"]).toMatchObject({
      kind: "source",
      before: { value: "/health", source: "profile-rule" },
      after: { value: "/health", source: "user-confirmed" },
    });
    expect(byKey["network.port"]).toMatchObject({
      kind: "value-and-source",
      before: { value: "8000", source: "repository-declared" },
      after: { value: "8080", source: "inferred" },
    });
    expect(byKey["runtime.python"]).toMatchObject({
      kind: "added",
      before: null,
      after: { value: ">=3.12", source: "repository-declared" },
    });
    expect(byKey["database.migrations"]).toMatchObject({
      kind: "removed",
      after: null,
    });
    expect(latest.changes.map((change) => change.label)).not.toContain(
      "health.path",
    );
  });

  it("quotes the message that led to each version", () => {
    const { application, correction, request } = seed();
    const [latest, first] = history.contractHistory(application.id);
    expect(latest.reason).toMatchObject({
      messageId: correction.id,
      role: "user",
      source: "user",
      quote: "contract: the health endpoint is /health, confirmed by me",
    });
    expect(first.reason).toMatchObject({
      messageId: request.id,
      source: "server-guy",
    });
  });

  it("serves the history over the read route and 404s an unknown application", async () => {
    const { application } = seed();
    const ok = await route.GET(new Request("http://localhost"), {
      params: Promise.resolve({ applicationId: application.id }),
    });
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as {
      versions: Array<{ version: number; current: boolean }>;
    };
    expect(payload.versions.map((entry) => entry.version)).toEqual([2, 1]);
    const missing = await route.GET(new Request("http://localhost"), {
      params: Promise.resolve({
        applicationId: "00000000-0000-4000-8000-000000000000",
      }),
    });
    expect(missing.status).toBe(404);
  });
});
