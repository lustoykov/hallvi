// The recorded stack: derived from what the executor runs, extended by what
// a deployment records, and used to decide which destinations exist.
import { describe, expect, it } from "vitest";

import {
  persistentState,
  stackOf,
} from "../../../src/server/application-stack";
import { visibleSections } from "../../../src/components/server-guy/application-sections";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const base: DeploymentRecord = {
  id: "dep-1",
  applicationId: "app",
  chatId: "chat-a",
  status: "live",
  repository: "qa/todo",
  revision: "a".repeat(40),
  plan: {
    summary: "Deploy the todo application with a private database.",
    dockerfile: "Dockerfile",
    generatedDockerfile: null,
    context: ".",
    port: 8000,
    command: ["uvicorn", "app:app"],
    environment: [],
    postgres: { version: "16", variable: "DATABASE_URL", scheme: "postgresql" },
    missingInputs: [],
    healthPath: "/health",
    checks: [
      {
        name: "Home",
        method: "GET",
        path: "/",
        body: null,
        expectedStatus: 200,
        contains: "Todo",
        captureId: null,
      },
    ],
  },
  offer: null,
  authority: null,
  serverId: 1,
  serverCreateAttempted: true,
  address: "203.0.113.10",
  imageId: "server-guy-dep-1:aaaaaaaaaaaa",
  url: "http://203.0.113.10",
  verifiedAt: "2026-09-08T19:33:41.000Z",
  error: null,
  events: [],
  logs: "",
  createdAt: "2026-09-08T19:20:00.000Z",
  updatedAt: "2026-09-08T19:33:41.000Z",
};

describe("stackOf", () => {
  it("is unrecorded before a plan exists, so the stack group stays hidden", () => {
    const stack = stackOf({ ...base, plan: null });
    expect(stack.recorded).toBe(false);
    expect(visibleSections(stack, null).map((section) => section.id)).toEqual([
      "overview",
      "architecture",
      "deployment",
      "history",
      "backups",
      "logs",
      "monitoring",
      "domains",
      "variables",
    ]);
  });

  it("derives the web process, PostgreSQL and its volume from the plan", () => {
    const stack = stackOf(base);
    expect(stack.processes).toEqual([
      expect.objectContaining({
        name: "app",
        role: "web",
        command: "uvicorn app:app",
        port: 8000,
        state: "running",
      }),
    ]);
    expect(stack.databases[0]).toMatchObject({
      kind: "postgres",
      version: "16",
    });
    expect(stack.volumes[0]).toMatchObject({
      name: "database",
      mount: "/var/lib/postgresql/data",
      kind: "database",
    });
    const ids = visibleSections(stack, null).map((section) => section.id);
    expect(ids).toContain("processes");
    expect(ids).toContain("database");
    expect(ids).toContain("storage");
    expect(ids).not.toContain("cache");
    expect(ids).not.toContain("jobs");
    expect(persistentState(stack).map((item) => item.label)).toEqual([
      "PostgreSQL 16",
    ]);
  });

  it("adds recorded workers, services, queues, jobs and file volumes", () => {
    const stack = stackOf({
      ...base,
      stack: {
        processes: [
          { name: "worker", role: "worker", command: "celery worker" },
        ],
        services: [{ kind: "valkey", name: "broker", role: "broker" }],
        queues: [{ library: "Celery", backend: "redis", workers: ["worker"] }],
        jobs: [
          {
            name: "Nightly cleanup",
            command: "document_cleanup",
            schedule: "Daily at 03:00",
            timezone: "UTC",
            runsIn: "app",
          },
        ],
        volumes: [
          { name: "media", usedBy: "app", mount: "/data/media", kind: "files" },
        ],
      },
    });
    expect(stack.processes.map((process) => process.role)).toEqual([
      "web",
      "worker",
    ]);
    const ids = visibleSections(stack, null).map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "processes",
        "database",
        "cache",
        "jobs",
        "storage",
      ]),
    );
    expect(persistentState(stack).map((item) => item.label)).toEqual([
      "PostgreSQL 16",
      "Files · media",
    ]);
  });

  it("keeps the viewed destination listed even when nothing is recorded", () => {
    const ids = visibleSections(stackOf(null), "jobs").map((s) => s.id);
    expect(ids).toContain("jobs");
  });
});
