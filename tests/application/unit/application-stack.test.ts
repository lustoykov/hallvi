// The recorded stack: derived from what the executor runs, extended by what
// a deployment records, and used to decide which destinations exist.
import { describe, expect, it } from "vitest";

import {
  persistentState,
  stackOf,
} from "../../../src/server/application-stack";
import {
  hiddenSections,
  visibleSections,
} from "../../../src/components/server-guy/application-sections";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { nativeApp } from "../../fixtures/native";

const base: DeploymentRecord = {
  id: "dep-1",
  applicationId: "app",
  chatId: "chat-a",
  status: "live",
  repository: "qa/todo",
  revision: "a".repeat(40),
  native: nativeApp({
    summary: "Deploy the todo application with a private database.",
    port: 8000,
    command: ["uvicorn", "app:app"],
    postgres: "16",
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
  }),
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
  it("is unrecorded before a configuration exists, so the stack group stays hidden", () => {
    const stack = stackOf({ ...base, native: undefined });
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

  it("derives the web process, PostgreSQL and its volume from the configuration", () => {
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

  it("adds services and file volumes from the configuration and recorded queues and jobs", () => {
    const stack = stackOf({
      ...base,
      native: nativeApp({
        port: 8000,
        command: ["uvicorn", "app:app"],
        postgres: "16",
        volumes: [{ name: "media", target: "/data/media", kind: "files" }],
        services: [
          {
            name: "worker",
            sharesAppImage: true,
            command: ["celery", "worker"],
          },
          { name: "broker", image: "valkey/valkey:8.1.3-alpine" },
        ],
        checks: [],
      }),
      stack: {
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
      },
    });
    expect(
      stack.processes.map((process) => [
        process.name,
        process.role,
        process.private,
      ]),
    ).toEqual([
      ["app", "web", false],
      ["worker", "service", true],
      ["broker", "service", true],
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

  it("keeps Security available for a provisioned host before the first read", () => {
    const stack = stackOf(base);
    const ids = visibleSections(stack, null).map((section) => section.id);
    expect(ids).toContain("domains");
    expect(ids).not.toContain("cdn");
    expect(ids).not.toContain("security");
    const notes = Object.fromEntries(
      hiddenSections(stack, null).map((section) => [section.id, section.note]),
    );
    expect(notes.cdn).toBe("nothing recorded yet");
    expect(notes.security).toBe("check firewall rules");
    expect(
      visibleSections(stack, null, {}, true).some(
        (item) => item.id === "security",
      ),
    ).toBe(true);
  });

  it("lists CDN once one caches and Security once the firewall is read back", () => {
    const stack = stackOf(base);
    const ids = visibleSections(stack, null, {
      domains: {
        address: "https://example.dev",
        domain: null,
        tls: { state: "valid" },
        cdn: { state: "active", provider: "Cloudflare", detail: "Caching" },
        routes: [],
      },
      security: {
        firewall: { state: "active", provider: "Hetzner Cloud", detail: "One" },
        rules: [],
        ssh: { state: "key-only", detail: "Keys only" },
        privateServices: [],
      },
    }).map((section) => section.id);
    expect(ids).toContain("cdn");
    expect(ids).toContain("security");
  });
});
