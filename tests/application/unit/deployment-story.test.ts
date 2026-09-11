import { expect, it } from "vitest";
import { buildStory } from "../../../src/components/server-guy/deployment-prototype/deployment-model";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import type { ApplicationOperation } from "../../../src/server/operation-record";

const at = (minute: string) => `2026-09-11T12:${minute}:00.000Z`;
const first = `5d9c1a8${"0".repeat(33)}`;
const second = `b36da9c${"0".repeat(33)}`;
const passed = (name: string, kind: "http" | "command", minute: string) => ({
  name,
  kind,
  target: kind === "http" ? "GET /login" : "app",
  at: at(minute),
  durationMs: 20,
  passed: true,
  status: kind === "http" ? 200 : 0,
});
const attempt = (
  id: string,
  kind: "deploy" | "release" | "recreate",
  releaseId: string,
  operationId: string,
  eventOffset: number,
  outcome: "verified" | "failed",
  minute: string,
  extra: object = {},
) => ({
  id,
  operationId,
  releaseId,
  hostId: "host",
  kind,
  outcome,
  startedAt: at(minute),
  finishedAt: at(minute),
  remoteStartedAt: at(minute),
  error: null,
  eventOffset,
  ...extra,
});
const record = {
  id: "0a1b2c3d-0000-4000-8000-000000000011",
  applicationId: "app",
  chatId: "chat",
  status: "live",
  repository: "linuxserver/docker-bookstack",
  revision: first,
  offer: null,
  native: {
    format: 1,
    resolver: "docker compose 2.40.3",
    compose: [],
    files: [],
    resolved: {
      name: "sg-0a1b2c3d",
      services: {
        app: {
          image: `lscr.io/linuxserver/bookstack@sha256:${"1".repeat(64)}`,
          ports: [{ target: 80, published: "80", protocol: "tcp" }],
        },
        mariadb: { image: `mariadb@sha256:${"2".repeat(64)}` },
      },
    },
    inputs: ["ADMIN_PASSWORD"],
    data: [],
    database: null,
    httpAccess: "public",
    criterion: {
      healthPath: "/status",
      checks: [
        {
          name: "Login page is served",
          method: "GET",
          path: "/login",
          body: null,
          expectedStatus: 200,
          contains: "BookStack",
          captureId: null,
        },
      ],
      services: [],
      commands: [
        {
          name: "Owner administrator signs in",
          service: "app",
          run: ["php", "check.php"],
          inputs: ["ADMIN_PASSWORD"],
          contains: "OK",
        },
      ],
    },
    summary: "BookStack with MariaDB",
  },
  events: [
    { at: at("00"), message: "Inspecting the repository at an exact revision" },
    { at: at("01"), message: "Recommendation ready. No server has been purchased." },
    { at: at("05"), message: "Preparing SSH access" },
    { at: at("10"), message: "Releasing revision 5d9c1a8 on the existing host" },
    { at: at("11"), message: "Passed: Login page is served" },
    { at: at("15"), message: "Releasing revision b36da9c on the existing host" },
    { at: at("20"), message: "Releasing revision b36da9c on the existing host" },
    { at: at("30"), message: "Releasing revision 5d9c1a8 on the existing host" },
    { at: at("40"), message: "Recreating the accepted containers" },
  ],
  lifecycle: {
    host: { id: "host", provider: "hetzner", connectionId: null, serverId: 1, address: "203.0.113.7" },
    releases: [
      { id: "r1", repository: "linuxserver/docker-bookstack", revision: first },
      { id: "r2", repository: "linuxserver/docker-bookstack", revision: second },
    ],
    attempts: [
      attempt("t1", "deploy", "r1", "deployment", 3, "verified", "10", {
        checks: [passed("Login page is served", "http", "11")],
      }),
      attempt("t2", "release", "r2", "update", 5, "failed", "15", {
        error:
          "Application command check failed: Owner administrator signs in (exit 1).",
      }),
      attempt("t3", "release", "r2", "update", 6, "verified", "20", {
        checks: [
          passed("Login page is served", "http", "21"),
          passed("Owner administrator signs in", "command", "21"),
        ],
      }),
      attempt("t4", "release", "r1", "rollback", 7, "verified", "30", {
        checks: [
          passed("Login page is served", "http", "31"),
          passed("Owner administrator signs in", "command", "31"),
        ],
      }),
      attempt("t5", "recreate", "r1", "recreate", 8, "verified", "40"),
    ],
    runtime: {
      state: "verified",
      lastVerified: {
        attemptId: "t5",
        releaseId: "r1",
        hostId: "host",
        revision: first,
        checkedAt: at("40"),
        images: {},
      },
    },
  },
} as unknown as DeploymentRecord;
const operations = [
  {
    id: "rollback",
    title: "Roll back to 5d9c1a8da691",
    state: "verified",
    source: { type: "release", id: "deployment" },
  },
] as unknown as ApplicationOperation[];

it("tells the history from recorded attempts and operations: updates, a failure, a rollback and a recreation", () => {
  const story = buildStory({
    record,
    operations,
    now: Date.parse(at("45")),
    approvedIn: "Deploy BookStack",
  });
  expect(story.phases.map((phase) => [phase.title, phase.tone])).toEqual([
    ["Read the repository", "pass"],
    ["Planned the server", "pass"],
    ["You approved it", "wait"],
    ["Created the server and locked it down", "pass"],
    ["Deployed revision 5d9c1a8", "pass"],
    ["Released revision b36da9c", "fail"],
    ["Released revision b36da9c", "pass"],
    ["Rolled back to 5d9c1a8", "pass"],
    ["Recreated the containers", "pass"],
  ]);
  // Each attempt carries its own events and its recorded outcome.
  expect(story.phases[4].lines.map((line) => line.text)).toEqual([
    "Releasing revision 5d9c1a8 on the existing host",
    "Passed: Login page is served",
  ]);
  expect(story.phases[5].detail).toContain(
    "Owner administrator signs in (exit 1)",
  );
  expect(story.phases[6].detail).toBe(
    "2 checks passed: Login page is served, Owner administrator signs in",
  );
  expect(story.attempts).toBe(4);
  // What was checked, with when each check last passed on record.
  expect(
    story.checks.map((check) => [check.name, check.inside, check.at]),
  ).toEqual([
    ["Login page is served", false, at("31")],
    ["Owner administrator signs in", true, at("31")],
  ]);
  expect(story.gaps.map((gap) => gap.id)).toEqual(["push"]);
});
