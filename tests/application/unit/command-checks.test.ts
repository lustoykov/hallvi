import { expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const mocks = vi.hoisted(() => ({ ssh: vi.fn(), commands: [] as unknown[] }));
vi.mock("../../../src/server/deployment-ssh", async (original) => ({
  ...(await original<typeof import("../../../src/server/deployment-ssh")>()),
  deploymentSsh: mocks.ssh,
}));
vi.mock("../../../src/server/release-executor", () => ({
  releaseSecrets: () => ({
    values: { ADMIN_PASSWORD: "pa ss$word" },
    redact: (text: string) => text.replaceAll("pa ss$word", "[REDACTED]"),
  }),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  deploymentEvent: vi.fn(),
  saveDeployment: vi.fn(),
}));
vi.mock("../../../src/server/release-facts", async (original) => ({
  ...(await original<typeof import("../../../src/server/release-facts")>()),
  currentFacts: () => ({ criterion: { commands: mocks.commands } }),
}));
import {
  resolvePendingCommand,
  runCommandCheck,
  verifyCommandChecks,
} from "../../../src/server/command-checks";

const login = {
  name: "Owner administrator signs in",
  service: "app",
  run: ["php", "check-login.php"],
  inputs: ["ADMIN_PASSWORD"],
  contains: "LOGIN_OK",
};
const attemptId = "5d1e0d2e-2c4a-4c8e-9f7b-3a1c2b4d5e6f";
const record = () =>
  ({
    id: "0b38e71d-b054-412c-87dd-5c87fae80d08",
    lifecycle: {
      attempts: [{ id: attemptId, operationId: "op-1", outcome: "working" }],
    },
  }) as unknown as DeploymentRecord;
const signal = () => new AbortController().signal;
// The host prints the command's output, then its exit record after the marker.
const host = (output: string, tail: string) =>
  mocks.ssh.mockImplementation(async (_record, script: string) => {
    const marker = /printf '\\n(SG_CHECK_EXIT_[0-9a-f]+)%s/.exec(script)![1];
    return `${output}\n${marker}${tail}\n`;
  });
const exit = (code: number, bounded = 1) =>
  JSON.stringify({ exitCode: code, bounded });

it("passes private inputs on standard input, never in the command, and keeps redacted, bounded output", async () => {
  host(`${"x".repeat(5000)}\nsigned in with pa ss$word: LOGIN_OK`, exit(0));
  const deployment = record();
  const result = await runCommandCheck(deployment, login, signal());
  const [, script, options] = mocks.ssh.mock.calls[0];
  expect(script).not.toContain("pa ss$word");
  expect(script).toContain("-e ADMIN_PASSWORD ");
  expect(script).toContain("check-login.php");
  expect(script).toContain("sg-0b38e71d");
  // The host keeps a start record and the exit record beside the attempt's
  // host result, and the command runs under the container's own timeout.
  expect(script).toContain(
    `/opt/server-guy/0b38e71d-b054-412c-87dd-5c87fae80d08/releases/${attemptId}/checks`,
  );
  expect(script).toContain("command -v timeout");
  expect(script).toContain("nohup sh -c");
  expect(options.input).toBe("pa ss$word\n");
  expect(result).toMatchObject({ passed: true, status: 0, kind: "command" });
  expect(result.output).toContain("[REDACTED]: LOGIN_OK");
  expect(result.output!.length).toBeLessThanOrEqual(2000);
  // A known outcome leaves no hold.
  expect(deployment.commandPending).toBeNull();
});

it("stops verification at a failing command with its exit status and output, recorded on the attempt", async () => {
  const deployment = record();
  mocks.commands.splice(0, Infinity, login);
  host("LOGIN_REJECTED", exit(1));
  await expect(verifyCommandChecks(deployment, signal())).rejects.toThrow(
    /Owner administrator signs in \(exit 1\).*LOGIN_REJECTED/,
  );
  // Exit 0 without the expected output fails too.
  host("signed in", exit(0));
  await expect(verifyCommandChecks(deployment, signal())).rejects.toThrow(
    'output lacks "LOGIN_OK"',
  );
  // A time limit the container enforced is a known failure.
  host("still waiting", exit(124));
  await expect(verifyCommandChecks(deployment, signal())).rejects.toThrow(
    "exit 124",
  );
  expect(deployment.commandPending).toBeNull();
  expect(
    deployment.lifecycle!.attempts[0].checks!.map((check) => [
      check.passed,
      check.status,
    ]),
  ).toEqual([
    [false, 1],
    [false, 0],
    [false, 124],
  ]);
  expect(deployment.lifecycle!.attempts[0].checks![2].output).toContain(
    "Stopped after exceeding its 60 s limit",
  );
});

it("holds the deployment while a command's outcome is unknown, and refuses to run checks until it is resolved", async () => {
  mocks.commands.splice(0, Infinity, login);
  for (const [name, arrange] of [
    ["lost session", () => mocks.ssh.mockRejectedValueOnce(new Error("lost"))],
    ["no record", () => mocks.ssh.mockResolvedValueOnce("garbled")],
    ["still running", () => host("", "pending")],
    ["unbounded timeout", () => host("", exit(124, 0))],
  ] as const) {
    const deployment = record();
    arrange();
    await expect(
      verifyCommandChecks(deployment, signal()),
      name,
    ).rejects.toThrow("outcome unknown");
    const pending = deployment.commandPending!;
    expect(pending, name).toMatchObject({
      attemptId,
      operationId: "op-1",
      name: login.name,
      service: "app",
      timeoutSeconds: 60,
    });
    expect(pending.results).toBe(
      `/opt/server-guy/0b38e71d-b054-412c-87dd-5c87fae80d08/releases/${attemptId}/checks`,
    );
    expect(pending.token).toMatch(/^[0-9a-f-]{36}$/);
    const recorded = deployment.lifecycle!.attempts[0].checks!.at(-1)!;
    expect(recorded.status, name).toBeNull();
    expect(recorded.output, name).toContain("nothing runs again");
    // Nothing runs again under the hold.
    await expect(verifyCommandChecks(deployment, signal())).rejects.toThrow(
      "unknown outcome. Reconcile it",
    );
  }
});

it("resolves a held command from the host's record: never started, still running, lost, or done", async () => {
  const deployment = record();
  host("", "pending");
  await runCommandCheck(deployment, login, signal());
  const pending = deployment.commandPending!;
  const reply = (tail: string, output = "") =>
    mocks.ssh.mockImplementationOnce(async (_record, script: string) => {
      const marker = /printf '\\n(SG_CHECK_RECORD_[0-9a-f]+)%s/.exec(script)![1];
      expect(script).toContain(`${pending.results}/${pending.token}`);
      return `${output}\n${marker}${tail}\n`;
    });
  reply("none");
  expect(await resolvePendingCommand(deployment, signal())).toEqual({
    kind: "never-started",
  });
  reply("started");
  expect(await resolvePendingCommand(deployment, signal())).toEqual({
    kind: "running",
  });
  // Past its limit with no result, the host lost it: still unknown.
  pending.startedAt = new Date(Date.now() - 200_000).toISOString();
  reply("started");
  expect(await resolvePendingCommand(deployment, signal())).toEqual({
    kind: "lost",
  });
  reply(exit(124, 0), "abandoned");
  expect(await resolvePendingCommand(deployment, signal())).toEqual({
    kind: "lost",
  });
  reply(exit(0), "signed in with pa ss$word: LOGIN_OK");
  const known = await resolvePendingCommand(deployment, signal());
  expect(known).toMatchObject({
    kind: "known",
    result: { name: login.name, passed: true, status: 0 },
  });
  expect((known as { result: { output: string } }).result.output).toContain(
    "[REDACTED]: LOGIN_OK",
  );
  reply(exit(1), "LOGIN_REJECTED");
  expect(await resolvePendingCommand(deployment, signal())).toMatchObject({
    kind: "known",
    result: { passed: false, status: 1 },
  });
});
