import { expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
const mocks = vi.hoisted(() => ({ ssh: vi.fn() }));
vi.mock("../../../src/server/deployment-ssh", async (original) => ({
  ...(await original<typeof import("../../../src/server/deployment-ssh")>()),
  deploymentSsh: mocks.ssh,
}));
vi.mock("../../../src/server/release-executor", () => ({
  releaseSecrets: () => ({
    redact: (s: string) => s.replaceAll("synthetic-secret", "[REDACTED]"),
  }),
}));
vi.mock("../../../src/server/release-facts", () => ({
  currentFacts: () => ({ services: [{ name: "app" }, { name: "migrate" }] }),
}));
import { inspectRuntime } from "../../../src/server/release-diagnostics";

const record = {
  id: "0b38e71d-b054-412c-87dd-5c87fae80d08",
} as DeploymentRecord;
// The host prints each container's state line after the per-call marker.
const host =
  (sections: [object, string][]) => (_record: unknown, command: string) => {
    const marker = /printf '\\n%s ' '([^']+)'/.exec(command)![1];
    return Promise.resolve(
      sections
        .map(([state, logs]) => `\n${marker} ${JSON.stringify(state)}\n${logs}`)
        .join(""),
    );
  };

it("reads only this application's containers with fixed read-only queries, bounding and redacting each container's evidence", async () => {
  mocks.ssh.mockImplementation(
    host([
      [
        { service: "app", status: "running", exitCode: 0 },
        `${"old line\n".repeat(2000)}boot failed: synthetic-secret\n`,
      ],
      [
        { service: "migrate", status: "exited", exitCode: 0 },
        "migrations complete\n",
      ],
    ]),
  );
  const result = await inspectRuntime(record, new AbortController().signal);
  const command = mocks.ssh.mock.calls[0][1] as string;
  expect(command).toContain("label=com.docker.compose.project=sg-0b38e71d");
  expect(command).not.toMatch(
    /\.Config\.Env|docker (exec|stop|start|restart|rm|run|compose)/,
  );
  expect(result.containers).toEqual([
    { service: "app", status: "running", exitCode: 0 },
    { service: "migrate", status: "exited", exitCode: 0 },
  ]);
  // Each container keeps its latest lines within its share of the budget.
  expect(result.evidence).toContain("boot failed: [REDACTED]");
  expect(result.evidence).toContain("[earlier lines omitted]");
  expect(result.evidence).toContain("migrations complete");
  expect(result.evidence.length).toBeLessThan(12_500);
  expect(JSON.stringify(result)).not.toContain("synthetic-secret");
});

it("filters one recorded service and refuses other names without contacting the host", async () => {
  mocks.ssh.mockClear().mockImplementation(host([]));
  await expect(
    inspectRuntime(record, new AbortController().signal, {
      service: "db; docker rm -f app",
    }),
  ).rejects.toThrow("not a recorded service");
  expect(mocks.ssh).not.toHaveBeenCalled();
  const result = await inspectRuntime(record, new AbortController().signal, {
    service: "migrate",
    lines: 5000,
  });
  const command = mocks.ssh.mock.calls[0][1] as string;
  expect(command).toContain("label=com.docker.compose.service=migrate");
  expect(command).toContain("--tail 400");
  expect(result.evidence).toMatch(/No containers exist/);
});
