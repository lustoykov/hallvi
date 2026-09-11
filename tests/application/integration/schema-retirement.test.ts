import Database from "better-sqlite3";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import golden from "../fixtures/legacy-plan-golden.json";
import { legacyReleaseId } from "../../../scripts/retire-preparation.mjs";
import { pushTestDatabase } from "../../test-database";
import schemaVersion from "../../../src/server/schema-version.json";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import {
  releaseIdentityHolds,
  releaseOf,
  type NativeConfiguration,
} from "../../../src/server/deployment-release";
import { nativeFacts, releaseFacts } from "../../../src/server/release-facts";
import { assertReleaseScope } from "../../../src/server/release-scope";

// A populated v13 controller: phase workspaces, contracts, conformance,
// publication and preview records, retired operations in every state, and
// legacy deployment plans in each lifecycle position. Each test works on its
// own disposable copy; the owner's database is never opened.
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__serverGuyDb?.$client.close();
  globalThis.__serverGuyDb = undefined;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const T0 = "2026-09-08T10:00:00.000Z";
const T1 = "2026-09-08T11:00:00.000Z";
const T2 = "2026-09-08T12:00:00.000Z";
const REV = golden.revision;
const image = (n: number) => `sha256:${String(n).repeat(64)}`;
const plan = (name: string) => golden.cases.find((item) => item.name === name)!;
const offer = {
  serverType: "cx23",
  location: "fsn1",
  cores: 2,
  memory: 4,
  monthly: 5.99,
  hourly: 0.0082,
  currency: "EUR",
};
const ids = {
  legacy: golden.deploymentId,
  early: "22222222-2222-4222-8222-222222222222",
  recommended: "33333333-3333-4333-8333-333333333333",
  failed: "44444444-4444-4444-8444-444444444444",
  native: "55555555-5555-4555-8555-555555555555",
};
const nativeConfiguration: NativeConfiguration = {
  format: 1,
  resolver: "docker compose 2.40.3",
  compose: ["compose.yaml", ".server-guy/override.compose.json"],
  files: [],
  resolved: {
    name: "sg-55555555",
    services: {
      web: {
        image: `nginx@sha256:${"e".repeat(64)}`,
        ports: [{ target: 80, published: "80", protocol: "tcp" }],
        labels: { "server-guy.revision": REV },
      },
    },
  },
  inputs: [],
  data: [],
  database: null,
  httpAccess: "public",
  criterion: {
    healthPath: "/",
    checks: [
      {
        name: "Home",
        method: "GET",
        path: "/about",
        body: null,
        expectedStatus: 200,
        contains: "About",
        captureId: null,
      },
    ],
    services: [],
  },
  summary: "A native release of a static site with one checked page.",
};
const nativeRelease = releaseOf({
  repository: "fixture/native",
  revision: REV,
  native: nativeConfiguration,
})!;

function insert(
  db: Database.Database,
  table: string,
  row: Record<string, unknown>,
) {
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((key) => `@${key}`).join(", ")})`,
  ).run(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : typeof value === "boolean"
            ? Number(value)
            : value,
      ]),
    ),
  );
}

function operation(
  id: string,
  applicationId: string,
  fields: Record<string, unknown>,
) {
  return {
    id,
    application_id: applicationId,
    kind: (fields.kind as string) ?? "change",
    state: fields.state as string,
    body: {
      id,
      source: { type: "preparation", id },
      kind: "change",
      title: id,
      destinations: ["deployment", "history"],
      origin: null,
      mentions: [],
      startedAt: T0,
      updatedAt: T1,
      summary: `${id} summary`,
      steps: [{ label: id, state: "active" }],
      applicationId,
      target: id,
      preconditions: {},
      approvedAt: T0,
      executorPid: null,
      executionId: null,
      blocksQueue: false,
      queuedAt: null,
      ...fields,
    },
  };
}

function deployment(record: Record<string, unknown>) {
  return {
    id: record.id,
    application_id: record.applicationId,
    status: record.status,
    body: {
      offer,
      authority: null,
      serverId: null,
      serverCreateAttempted: false,
      address: null,
      imageId: null,
      url: null,
      verifiedAt: null,
      error: null,
      events: [{ at: T0, message: "Recorded" }],
      logs: "",
      createdAt: T0,
      updatedAt: T1,
      repositoryId: 7,
      ...record,
    },
  };
}

/** A lifecycle as the executor recorded it for one legacy release. */
function lifecycle(id: string, releaseId: string, verified: boolean) {
  const hostId = `host:${id}`;
  const snapshot = {
    attemptId: `attempt:${id}`,
    releaseId,
    hostId,
    revision: REV,
    checkedAt: T2,
    images: { app: image(1), postgres: image(2) },
  };
  return {
    host: {
      id: hostId,
      provider: "hetzner",
      connectionId: "hetzner",
      serverId: 1,
      address: "203.0.113.10",
    },
    attempts: [
      {
        id: `attempt:${id}`,
        operationId: `deployment:${id}`,
        releaseId,
        hostId,
        kind: "deploy",
        startedAt: T0,
        finishedAt: T2,
        outcome: verified ? "verified" : "failed",
        remoteStartedAt: T1,
        error: verified ? null : "Verification failed.",
        eventOffset: 0,
      },
    ],
    ...(verified
      ? {
          verifiedImages: [
            {
              attemptId: `attempt:${id}`,
              releaseId,
              hostId,
              checkedAt: T2,
              images: snapshot.images,
            },
          ],
        }
      : {}),
    runtime: verified
      ? {
          state: "verified",
          lastVerified: snapshot,
          observed: { ...snapshot, behavior: "passed" },
        }
      : { state: "unknown", lastVerified: null, observed: null },
  };
}

function populate(db: Database.Database) {
  const apps = ["legacy", "early", "recommended", "failed", "native"];
  for (const key of apps) {
    insert(db, "applications", {
      id: `app-${key}`,
      name: key,
      repository_url: `https://github.com/fixture/${key}`,
      repository_owner: "fixture",
      repository_name: key,
      environment: "production",
      approval_mode: key === "legacy" ? "full-autonomy" : "always-ask",
      approval_scope: "Current application launch",
      created_at: T0,
      updated_at: T0,
    });
    insert(db, "phase_workspaces", {
      id: `ws-${key}`,
      application_id: `app-${key}`,
      phase_key: "start",
      created_at: T0,
      completed_at: key === "legacy" ? T1 : null,
      deliverable_evidence:
        key === "legacy"
          ? { completedAt: T1, checks: [{ key: "repository-readable" }] }
          : null,
    });
    insert(db, "chats", {
      id: `chat-${key}`,
      application_id: `app-${key}`,
      workspace_id: `ws-${key}`,
      title: "Deploy application",
      is_primary: 1,
      created_at: T0,
      archived_at: null,
      native_session_id: key === "legacy" ? "native-legacy" : null,
    });
    insert(db, "messages", {
      id: `msg-${key}`,
      chat_id: `chat-${key}`,
      role: "assistant",
      body: `Created ${key}.`,
      source: "server-guy",
      status: "completed",
      revision: 0,
      created_at: T0,
    });
  }
  // The legacy application's full phase history.
  for (const [id, phase, completed] of [
    ["ws-legacy-inspect", "inspect-app", T2],
    ["ws-legacy-ready", "make-launch-ready", null],
  ] as const)
    insert(db, "phase_workspaces", {
      id,
      application_id: "app-legacy",
      phase_key: phase,
      created_at: T1,
      completed_at: completed,
      deliverable_evidence: completed ? { contractId: "contract-2" } : null,
    });
  insert(db, "chats", {
    id: "chat-contract",
    application_id: "app-legacy",
    workspace_id: "ws-legacy-inspect",
    title: "Application Contract",
    is_primary: 1,
    created_at: T1,
    archived_at: null,
    native_session_id: "native-contract",
  });
  insert(db, "chats", {
    id: "chat-archived",
    application_id: "app-legacy",
    workspace_id: "ws-legacy-ready",
    title: "Conversation 3",
    is_primary: 0,
    created_at: T1,
    archived_at: T2,
    native_session_id: null,
  });
  for (const [id, chat, role, source, status] of [
    ["user-1", "chat-legacy", "user", "user", "completed"],
    ["reply-1", "chat-legacy", "assistant", "pi", "completed"],
    ["user-2", "chat-contract", "user", "user", "completed"],
    ["reply-2", "chat-contract", "assistant", "pi", "failed"],
    ["reply-3", "chat-contract", "assistant", "pi", "queued"],
    ["user-3", "chat-archived", "user", "user", "completed"],
  ] as const)
    insert(db, "messages", {
      id,
      chat_id: chat,
      role,
      body: `${id} body`,
      source,
      status,
      revision: 1,
      created_at: T1,
    });
  insert(db, "pi_runs", {
    id: "run-1",
    application_id: "app-legacy",
    workspace_id: "ws-legacy",
    chat_id: "chat-legacy",
    user_message_id: "user-1",
    assistant_message_id: "reply-1",
    request_key: "request-1",
    status: "succeeded",
    pi_calls: 2,
    created_at: T1,
    started_at: T1,
    finished_at: T1,
  });
  insert(db, "pi_runs", {
    id: "run-2",
    application_id: "app-legacy",
    workspace_id: "ws-legacy-inspect",
    chat_id: "chat-contract",
    user_message_id: "user-2",
    assistant_message_id: "reply-2",
    request_key: "request-2",
    status: "failed",
    error: "Provider unavailable.",
    created_at: T1,
  });
  insert(db, "pi_runs", {
    id: "run-3",
    application_id: "app-legacy",
    workspace_id: "ws-legacy-inspect",
    chat_id: "chat-contract",
    user_message_id: "user-2",
    assistant_message_id: "reply-3",
    request_key: "request-3",
    retry_of_id: "run-2",
    status: "queued",
    created_at: T2,
  });
  insert(db, "chat_summaries", {
    chat_id: "chat-legacy",
    body: "Earlier summary",
    covered_message_id: "reply-1",
    updated_at: T1,
  });
  insert(db, "decisions", {
    id: "decision-1",
    application_id: "app-legacy",
    source_message_id: "user-1",
    kind: "launch-priority",
    label: "Saved requirement",
    value: "Keep data in the EU",
    created_at: T0,
  });
  insert(db, "decisions", {
    id: "decision-2",
    application_id: "app-legacy",
    source_message_id: "user-1",
    kind: "launch-priority",
    label: "Saved requirement",
    value: "Keep data in Germany",
    created_at: T1,
  });
  db.exec(
    "UPDATE decisions SET superseded_by_id = 'decision-2' WHERE id = 'decision-1'",
  );
  insert(db, "observations", {
    id: "observation-repo",
    application_id: "app-legacy",
    kind: "github-repository-identity",
    status: "passed",
    summary: "Readable",
    source_label: "GitHub commit",
    source_url: "https://github.com/fixture/legacy",
    raw_json: { repositoryId: 7, connectionId: "conn", commitSha: REV },
    observed_at: T0,
  });
  for (const [id, workspace, kind] of [
    ["activity-1", "ws-legacy", "decision-recorded"],
    ["activity-2", "ws-legacy-inspect", "contract-established"],
    ["activity-3", "ws-legacy-ready", "chat-created"],
    ["activity-4", "ws-early", "repository-observed"],
  ] as const)
    insert(db, "activity_events", {
      id,
      workspace_id: workspace,
      kind,
      summary: `${kind} summary`,
      detail: `${kind} detail`,
      created_at: T1,
    });
  for (const [id, version] of [
    ["contract-1", 1],
    ["contract-2", 2],
  ] as const)
    insert(db, "application_contracts", {
      id,
      application_id: "app-legacy",
      workspace_id: "ws-legacy-inspect",
      version,
      profile_id: "fastapi-uv",
      profile_version: 1,
      commit_sha: REV,
      source_message_id: "user-2",
      body_json: { summary: `contract ${version}`, fields: [] },
      created_at: T1,
    });
  db.exec(
    "UPDATE application_contracts SET superseded_by_id = 'contract-2' WHERE id = 'contract-1'",
  );
  const proposal = {
    application_id: "app-legacy",
    workspace_id: "ws-legacy-ready",
    origin: "server-guy",
    base_sha: REV,
    contract_id: "contract-2",
    contract_version: 2,
    summary: "Add a health endpoint",
    changes_json: [{ path: "app.py", content: "print('ok')\n" }],
    files_digest: "f".repeat(64),
    mapping_json: [],
    created_at: T2,
  };
  insert(db, "conformance_proposals", {
    ...proposal,
    id: "proposal-published",
    status: "published",
    publication_json: {
      branch: "server-guy/prepare",
      commitSha: "d".repeat(40),
      pullRequestNumber: 12,
      pullRequestUrl: "https://github.com/fixture/legacy/pull/12",
      publishedAt: T2,
      connectionId: "conn",
      adopted: false,
      state: "open",
    },
  });
  insert(db, "conformance_proposals", {
    ...proposal,
    id: "proposal-approved",
    status: "approved",
  });
  for (const [id, kind, status] of [
    ["conformance-run-1", "candidate", "passed"],
    ["conformance-run-2", "preview", "queued"],
  ] as const)
    insert(db, "conformance_runs", {
      id,
      application_id: "app-legacy",
      workspace_id: "ws-legacy-ready",
      kind,
      status,
      source_json: { commitSha: REV, overlayDigest: null, treeDigest: "t" },
      contract_id: "contract-2",
      contract_version: 2,
      profile_id: "fastapi-uv",
      profile_version: 1,
      definition_version: 3,
      results_json: [],
      summary: `${kind} ${status}`,
      created_at: T2,
    });
  insert(db, "acceptance_checks", {
    id: "acceptance-1",
    application_id: "app-legacy",
    workspace_id: "ws-legacy-ready",
    version: 1,
    status: "accepted",
    rationale: "Create and read a todo",
    steps_json: [{ name: "Create", method: "POST", path: "/todos" }],
    evidence_json: [],
    digest: "a".repeat(64),
    contract_id: "contract-2",
    contract_version: 2,
    created_at: T2,
  });
  insert(db, "publication_grants", {
    id: "grant-1",
    application_id: "app-legacy",
    connection_id: "conn",
    mechanism: "app",
    verified_permissions_json: { contents: "write" },
    granted_at: T2,
  });
  insert(db, "application_previews", {
    id: "preview-1",
    application_id: "app-legacy",
    record: {
      id: "preview-1",
      applicationId: "app-legacy",
      runId: "conformance-run-1",
      status: "ready",
      containerId: "c0ffee",
      createdAt: T2,
      expiresAt: T2,
      url: "http://127.0.0.1:3900",
      imageDigest: null,
      summary: "Ready",
      confirmedAt: null,
    },
  });
  insert(db, "preparation_branches", {
    id: "branch-1",
    application_id: "app-legacy",
    record: {
      id: "branch-1",
      applicationId: "app-legacy",
      branch: "server-guy/shared",
      status: "working",
      pullRequestNumber: 13,
      pullRequestUrl: "https://github.com/fixture/legacy/pull/13",
      createdAt: T2,
    },
  });
  insert(db, "application_operation_processes", {
    id: "guard-dead",
    application_id: "app-legacy",
    pid: 2_147_483_000,
  });
  insert(db, "application_operation_processes", {
    id: "guard-live",
    application_id: "app-early",
    pid: process.pid,
  });
  const retiredPreconditions = {
    repository: "https://github.com/fixture/legacy",
    permissionPolicy: "full-autonomy",
    contract: "contract-2",
    sourceRevision: REV,
    servingRevision: REV,
    stack: "s".repeat(64),
    inputNames: null,
  };
  for (const row of [
    operation("retired-proposed", "app-legacy", {
      state: "proposed",
      command: { type: "publish-proposal", proposalId: "proposal-approved" },
      approvedAt: null,
    }),
    operation("retired-held", "app-legacy", {
      state: "working",
      command: { type: "start-preparation" },
      executorPid: 12345,
      executionId: "execution-1",
      blocksQueue: true,
    }),
    operation("retired-failed", "app-legacy", {
      state: "failed",
      command: { type: "refresh-candidate" },
      decision: { kind: "recovery", retry: "Retry", cancel: "Cancel" },
    }),
    operation("retired-verified", "app-legacy", {
      state: "verified",
      command: { type: "grant-publication" },
      evidence: "Granted.",
    }),
    operation("release-proposed", "app-legacy", {
      state: "proposed",
      source: { type: "release", id: `${ids.legacy}:${REV}` },
      command: {
        type: "release-deployment",
        scope: { id: "scope-1" },
        requirements: "Update",
      },
      preconditions: retiredPreconditions,
    }),
    operation(`deployment:${ids.legacy}`, "app-legacy", {
      state: "verified",
      source: { type: "deployment", id: ids.legacy },
      command: { type: "deployment", deploymentId: ids.legacy },
      preconditions: retiredPreconditions,
    }),
    operation(`deployment:${ids.recommended}`, "app-recommended", {
      state: "proposed",
      source: { type: "deployment", id: ids.recommended },
      command: { type: "deployment", deploymentId: ids.recommended },
      preconditions: retiredPreconditions,
    }),
  ])
    insert(db, "application_operations", row);

  const bindings = plan("postgres-connection-bindings");
  insert(
    db,
    "deployments",
    deployment({
      id: ids.legacy,
      applicationId: "app-legacy",
      chatId: "chat-legacy",
      status: "live",
      repository: golden.repository,
      revision: REV,
      plan: bindings.plan,
      releaseId: bindings.releaseId,
      operationId: `deployment:${ids.legacy}`,
      authority: {
        acceptedAt: T0,
        connectionId: "hetzner",
        maxMonthly: 10,
        releaseId: bindings.releaseId,
      },
      serverId: 1,
      serverCreateAttempted: true,
      address: "203.0.113.10",
      imageId: image(1),
      serviceImages: { app: image(1), postgres: image(2) },
      bundleHashes: { "compose.json": "b".repeat(64) },
      verifiedAt: T2,
      inspectedRevision: "c".repeat(40),
      lifecycle: {
        releases: [
          {
            id: bindings.releaseId,
            repository: golden.repository,
            revision: REV,
            plan: bindings.plan,
          },
        ],
        ...lifecycle(ids.legacy, bindings.releaseId, true),
      },
    }),
  );
  insert(
    db,
    "deployments",
    deployment({
      id: ids.early,
      applicationId: "app-early",
      chatId: "chat-early",
      status: "live",
      repository: "fixture/early",
      revision: REV,
      plan: plan("kuma-sqlite").plan,
      authority: { acceptedAt: T0, connectionId: "hetzner", maxMonthly: 10 },
      serverId: 2,
      serverCreateAttempted: true,
      address: "203.0.113.20",
      imageId: image(3),
      verifiedAt: T2,
    }),
  );
  const generated = plan("generated-dockerfile-controller").plan;
  insert(
    db,
    "deployments",
    deployment({
      id: ids.recommended,
      applicationId: "app-recommended",
      chatId: "chat-recommended",
      status: "awaiting-approval",
      repository: "fixture/recommended",
      revision: REV,
      plan: generated,
      releaseId: legacyReleaseId("fixture/recommended", REV, generated),
      recommendationId: "recommendation-1",
      operationId: `deployment:${ids.recommended}`,
    }),
  );
  const queue = plan("queue-worker").plan;
  const queueRelease = legacyReleaseId("fixture/failed", REV, queue);
  insert(
    db,
    "deployments",
    deployment({
      id: ids.failed,
      applicationId: "app-failed",
      chatId: "chat-failed",
      status: "failed",
      repository: "fixture/failed",
      revision: REV,
      plan: queue,
      releaseId: queueRelease,
      authority: {
        acceptedAt: T0,
        connectionId: "hetzner",
        maxMonthly: 10,
        releaseId: queueRelease,
      },
      serverId: 4,
      serverCreateAttempted: true,
      address: "203.0.113.40",
      error: "Verification failed.",
      lifecycle: {
        releases: [
          {
            id: queueRelease,
            repository: "fixture/failed",
            revision: REV,
            plan: queue,
          },
        ],
        ...lifecycle(ids.failed, queueRelease, false),
      },
    }),
  );
  insert(
    db,
    "deployments",
    deployment({
      id: ids.native,
      applicationId: "app-native",
      chatId: "chat-native",
      status: "live",
      repository: "fixture/native",
      revision: REV,
      plan: null,
      native: nativeConfiguration,
      releaseId: nativeRelease.id,
      inspectedRevision: REV,
      serverId: 5,
      serverCreateAttempted: true,
      address: "203.0.113.50",
      verifiedAt: T2,
      lifecycle: {
        ...lifecycle(ids.native, nativeRelease.id, true),
        releases: [nativeRelease],
      },
    }),
  );
}

function v13Database(change?: (db: Database.Database) => void) {
  const root = mkdtempSync(join(tmpdir(), "server-guy-retirement-"));
  roots.push(root);
  const path = join(root, "v13.db");
  const db = new Database(path);
  db.exec(readFileSync("tests/application/fixtures/schema-v13.sql", "utf8"));
  db.pragma("foreign_keys = ON");
  populate(db);
  change?.(db);
  expect(db.pragma("foreign_key_check")).toEqual([]);
  db.close();
  return { root, path };
}

function open(path: string) {
  return new Database(path, { readonly: true });
}
/** A copy of a row without the named columns. */
function without(row: object, ...keys: string[]) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !keys.includes(key)),
  );
}
function rows(path: string) {
  const db = open(path);
  try {
    return Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name)
        .map((name) => [
          name,
          db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        ]),
    );
  } finally {
    db.close();
  }
}
/** Tables, columns, keys and indexes: what a schema push compares. */
function structure(path: string) {
  const db = open(path);
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    return Object.fromEntries(
      tables.map((table) => [
        table,
        {
          columns: db.prepare(`PRAGMA table_xinfo("${table}")`).all(),
          foreignKeys: db.prepare(`PRAGMA foreign_key_list("${table}")`).all(),
          indexes: db
            .prepare(
              "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name",
            )
            .all(table),
        },
      ]),
    );
  } finally {
    db.close();
  }
}
const json = <T>(value: unknown) => JSON.parse(value as string) as T;

it("retires the preparation workflow while keeping chats, history, holds and deployment identities", () => {
  const { root, path } = v13Database();
  const before = rows(path);
  pushTestDatabase(path);
  const after = rows(path);

  // Same schema a fresh installation gets; nothing cascaded.
  const fresh = join(root, "fresh.db");
  pushTestDatabase(fresh);
  expect(structure(path)).toEqual(structure(fresh));
  const db = open(path);
  expect(db.pragma("user_version", { simple: true })).toBe(
    schemaVersion.version,
  );
  expect(db.pragma("foreign_key_check")).toEqual([]);
  db.close();
  expect(
    readdirSync(root).some((name) => /\.pre-v14-.*\.backup$/.test(name)),
  ).toBe(true);
  for (const table of [
    "phase_workspaces",
    "application_contracts",
    "conformance_proposals",
    "conformance_runs",
    "acceptance_checks",
    "publication_grants",
    "application_previews",
    "preparation_branches",
    "application_operation_processes",
  ])
    expect(after).not.toHaveProperty(table);

  // Conversations keep identity, ownership, native sessions and lineage.
  expect(after.chats).toEqual(
    (before.chats as Record<string, unknown>[]).map((chat) =>
      without(chat, "workspace_id", "is_primary"),
    ),
  );
  expect(after.messages).toEqual(before.messages);
  expect(after.pi_runs).toEqual(
    (before.pi_runs as Record<string, unknown>[]).map((run) =>
      without(run, "workspace_id"),
    ),
  );
  expect(after.chat_summaries).toEqual(before.chat_summaries);
  expect(after.decisions).toEqual(before.decisions);
  expect(after.applications).toEqual(
    (before.applications as Record<string, unknown>[]).map((application) =>
      without(application, "environment", "approval_mode", "approval_scope"),
    ),
  );
  // Activity belongs to its application; one retirement summary each.
  const workspaceApplication = Object.fromEntries(
    (before.phase_workspaces as { id: string; application_id: string }[]).map(
      (row) => [row.id, row.application_id],
    ),
  );
  const activity = after.activity_events as {
    id: string;
    application_id: string;
    kind: string;
    detail: string;
  }[];
  for (const event of before.activity_events as {
    id: string;
    workspace_id: string;
  }[])
    expect(activity.find((row) => row.id === event.id)?.application_id).toBe(
      workspaceApplication[event.workspace_id],
    );
  const retirement = activity.filter(
    (row) => row.kind === "preparation-retired",
  );
  expect(retirement.map((row) => row.application_id).sort()).toEqual([
    "app-early",
    "app-failed",
    "app-legacy",
    "app-native",
    "app-recommended",
  ]);
  const legacyNote = retirement.find(
    (row) => row.application_id === "app-legacy",
  )!.detail;
  expect(legacyNote).toContain("pull/12");
  expect(legacyNote).toContain("server-guy/shared");
  expect(legacyNote).toContain("c0ffee");
  expect(legacyNote).toContain("record what you verified");

  // Retired rows are retained verbatim under their original identities.
  const observations = after.observations as {
    id: string;
    kind: string;
    application_id: string;
    raw_json: string;
    source_url: string | null;
  }[];
  const archived = (id: string) => {
    const found = observations.find((row) => row.id === id);
    expect(found?.kind).toBe("retired-record");
    return json<{ table: string; record: Record<string, unknown> }>(
      found!.raw_json,
    );
  };
  expect(archived("contract-2").record.body_json).toEqual({
    summary: "contract 2",
    fields: [],
  });
  expect(archived("proposal-published").record.publication_json).toMatchObject({
    pullRequestNumber: 12,
  });
  expect(observations.find((row) => row.id === "proposal-published")).toEqual(
    expect.objectContaining({
      source_url: "https://github.com/fixture/legacy/pull/12",
    }),
  );
  for (const id of [
    "ws-legacy",
    "ws-legacy-inspect",
    "contract-1",
    "proposal-approved",
    "conformance-run-1",
    "conformance-run-2",
    "acceptance-1",
    "grant-1",
    "preview-1",
    "branch-1",
    "guard-dead",
    "guard-live",
  ])
    expect(archived(id).table).toBeTruthy();
  expect(
    observations
      .filter((row) => row.kind === "retired-record")
      .map((row) => json<{ table: string }>(row.raw_json).table)
      .filter((table) => table === "applications"),
  ).toHaveLength(5);
  expect(after.observations).toHaveLength(
    // 7 workspaces, 2 contracts, 2 proposals, 2 runs, 1 acceptance set,
    // 1 grant, 1 preview, 1 branch, 2 guards, 5 settings and 4 plans.
    (before.observations as unknown[]).length + 28,
  );

  // Operations: nothing retired re-runs; unknown outcomes keep their hold.
  const operations = Object.fromEntries(
    (after.application_operations as { id: string; body: string }[]).map(
      (row) => [row.id, json<Record<string, unknown>>(row.body)],
    ),
  );
  expect(operations["retired-proposed"]).toMatchObject({
    state: "cancelled",
    command: null,
    decision: null,
  });
  expect(operations["retired-held"]).toMatchObject({
    state: "failed",
    command: null,
    blocksQueue: true,
    executorPid: null,
    decision: { kind: "recovery", retry: null },
  });
  expect(
    (operations["retired-held"].decision as { inputs: { name: string }[] })
      .inputs[0].name,
  ).toBe("What you verified");
  expect(operations["retired-failed"]).toMatchObject({
    state: "failed",
    command: null,
    blocksQueue: false,
    decision: { retry: null, cancel: "Dismiss" },
  });
  expect(operations["retired-verified"]).toMatchObject({
    state: "verified",
    command: null,
    evidence: "Granted.",
  });
  expect(operations["release-proposed"].preconditions).toEqual({
    repository: "https://github.com/fixture/legacy",
    sourceRevision: REV,
    servingRevision: REV,
    stack: "s".repeat(64),
    inputNames: null,
  });
  // A completed receipt keeps the assumptions it was approved under.
  expect(operations[`deployment:${ids.legacy}`].preconditions).toMatchObject({
    contract: "contract-2",
    permissionPolicy: "full-autonomy",
  });
  const guard = Object.values(operations).find(
    (item) => item.target === "process-guard:guard-live",
  );
  expect(guard).toMatchObject({
    applicationId: "app-early",
    state: "failed",
    blocksQueue: true,
    command: null,
  });
  expect(
    Object.values(operations).some(
      (item) => item.target === "process-guard:guard-dead",
    ),
  ).toBe(false);

  // Deployments: native artifacts only, with historical identities intact.
  const deployments = Object.fromEntries(
    (after.deployments as { id: string; status: string; body: string }[]).map(
      (row) => [row.id, json<DeploymentRecord>(row.body)],
    ),
  );
  const beforeDeployments = Object.fromEntries(
    (before.deployments as { id: string; body: string }[]).map((row) => [
      row.id,
      json<DeploymentRecord & { plan: unknown }>(row.body),
    ]),
  );
  for (const record of Object.values(deployments)) {
    expect(record).not.toHaveProperty("plan");
    expect(record).not.toHaveProperty("inspectedRevision");
    for (const release of record.lifecycle?.releases ?? []) {
      expect(release).not.toHaveProperty("plan");
      expect(releaseIdentityHolds(release)).toBe(true);
    }
  }
  const legacy = deployments[ids.legacy];
  const bindings = plan("postgres-connection-bindings");
  expect(legacy.native?.converted).toEqual({
    from: "deployment-plan",
    schema: 14,
  });
  expect(releaseOf(legacy)?.id).toBe(bindings.releaseId);
  expect(legacy.releaseId).toBe(bindings.releaseId);
  expect(legacy.authority).toEqual(beforeDeployments[ids.legacy].authority);
  expect(legacy.lifecycle!.releases.map((release) => release.id)).toEqual([
    bindings.releaseId,
  ]);
  // Attempts, runtime, verified images and host identity are untouched.
  expect(without(legacy.lifecycle!, "releases")).toEqual(
    without(beforeDeployments[ids.legacy].lifecycle!, "releases"),
  );
  expect(legacy.serviceImages).toEqual(
    beforeDeployments[ids.legacy].serviceImages,
  );
  expect(legacy.bundleHashes).toEqual(
    beforeDeployments[ids.legacy].bundleHashes,
  );
  const facts = releaseFacts(legacy.lifecycle!.releases[0]);
  expect(facts.volumes.map((volume) => volume.dockerName)).toEqual(
    bindings.facts.volumes.map((volume) => volume.dockerName),
  );
  expect(facts.inputs).toEqual(bindings.facts.inputs);
  expect(nativeFacts(legacy.native!).exposure).toEqual(bindings.facts.exposure);
  expect(
    archived(`plan:${ids.legacy}:${bindings.releaseId}`).record.plan,
  ).toEqual(bindings.plan);
  // Its baseline still bounds a native update's effects.
  expect(() =>
    assertReleaseScope(
      legacy,
      {
        id: "scope",
        deploymentId: legacy.id,
        hostId: legacy.lifecycle!.host.id,
        serverId: legacy.serverId!,
        address: legacy.address!,
        repository: legacy.repository,
        repositoryId: legacy.repositoryId!,
        revision: REV,
        baselineReleaseId: bindings.releaseId,
        maxAttempts: 3,
      },
      facts,
    ),
  ).not.toThrow();

  const early = deployments[ids.early];
  const earlyRelease = legacyReleaseId(
    "fixture/early",
    REV,
    plan("kuma-sqlite").plan,
  );
  expect(early.releaseId).toBe(earlyRelease);
  expect(early.lifecycle).toMatchObject({
    releases: [{ id: earlyRelease }],
    attempts: [{ id: `legacy:${ids.early}`, kind: "legacy" }],
    runtime: {
      state: "verified",
      lastVerified: { releaseId: earlyRelease, images: { app: image(3) } },
    },
  });

  const recommended = deployments[ids.recommended];
  expect(recommended).toMatchObject({
    status: "failed",
    native: null,
    authority: null,
  });
  expect(recommended).not.toHaveProperty("releaseId");
  expect(recommended.error).toContain("retired planner");
  expect(operations[`deployment:${ids.recommended}`]).toMatchObject({
    state: "failed",
    kind: "inspection",
    blocksQueue: false,
  });

  const failed = deployments[ids.failed];
  expect(failed).toMatchObject({
    status: "failed",
    releaseId: legacyReleaseId(
      "fixture/failed",
      REV,
      plan("queue-worker").plan,
    ),
    serverId: 4,
  });
  expect(failed.authority).toEqual(beforeDeployments[ids.failed].authority);
  expect(failed.native?.converted).toBeTruthy();

  const native = deployments[ids.native];
  expect(native.native).toEqual(nativeConfiguration);
  expect(native.lifecycle!.releases).toEqual([nativeRelease]);

  // A second preparation finds nothing left to retire.
  pushTestDatabase(path);
  expect(rows(path)).toEqual(after);
}, 60_000);

it("continues native sessions and releases a retired hold only on the owner's statement", async () => {
  const { root, path } = v13Database();
  pushTestDatabase(path);
  vi.stubEnv("SERVER_GUY_DB_PATH", path);
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", root);
  const session = join(root, "pi-sessions", "app-legacy", "chat-legacy.jsonl");
  mkdirSync(join(root, "pi-sessions", "app-legacy"), { recursive: true });
  writeFileSync(
    session,
    `${JSON.stringify({ type: "session", id: "native-legacy", version: 3, timestamp: T0, cwd: "/fixture" })}\n`,
    { mode: 0o600 },
  );
  const { openNativeChatSession } =
    await import("../../../src/server/pi-sessions");
  const opened = await openNativeChatSession("app-legacy", "chat-legacy");
  expect(opened.sessionManager.getSessionId()).toBe("native-legacy");
  opened.release();

  const { getOperatorView } = await import("../../../src/server/operator-view");
  const view = getOperatorView("app-legacy");
  expect(view.chats.map((chat) => chat.id)).toEqual([
    "chat-legacy",
    "chat-contract",
    "chat-archived",
  ]);
  expect(view.selectedChatId).toBe("chat-legacy");
  expect(view.decisions.map((decision) => decision.id)).toEqual(["decision-2"]);
  expect(view.activity.map((event) => event.kind)).toContain(
    "preparation-retired",
  );

  const store = await import("../../../src/server/operation-store");
  const held = store.operation("retired-held")!;
  expect(store.applicationChangeActive("app-legacy")).toBe(true);
  expect(() => store.retryOperation(held.id, held.updatedAt)).toThrow(
    /capability was retired/,
  );
  expect(() => store.cancelOperation(held.id, held.updatedAt)).toThrow(
    /Record what you verified/,
  );
  const closed = store.cancelOperation(
    held.id,
    held.updatedAt,
    "Checked GitHub: no branch or pull request exists for this preparation.",
  );
  expect(closed).toMatchObject({ state: "cancelled", blocksQueue: false });
  expect(closed.evidence).toContain("did not verify this statement");
  expect(store.applicationChangeActive("app-legacy")).toBe(false);
}, 60_000);

it("refuses a legacy release whose identity does not match its plan, changing nothing", () => {
  const { path } = v13Database((db) => {
    const row = db
      .prepare("SELECT body FROM deployments WHERE id = ?")
      .get(ids.legacy) as { body: string };
    const body = JSON.parse(row.body);
    body.lifecycle.releases[0].plan.summary = "Edited after it was recorded";
    db.prepare("UPDATE deployments SET body = ? WHERE id = ?").run(
      JSON.stringify(body),
      ids.legacy,
    );
  });
  const before = rows(path);
  expect(() => pushTestDatabase(path)).toThrow();
  expect(rows(path)).toEqual(before);
  const db = open(path);
  expect(db.pragma("user_version", { simple: true })).toBe(13);
  db.close();
}, 60_000);
