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
const record = () =>
  ({
    id: "0b38e71d-b054-412c-87dd-5c87fae80d08",
    lifecycle: { attempts: [{ outcome: "working" }] },
  }) as unknown as DeploymentRecord;
// The host prints the command's output, then its exit code after the marker.
const host = (output: string, code: number) =>
  mocks.ssh.mockImplementation(async (_record, script: string) => {
    const marker = /printf '\\n(SG_CHECK_EXIT_[0-9a-f]+)%s/.exec(script)![1];
    return `${output}\n${marker}${code}\n`;
  });

it("passes private inputs on standard input, never in the command, and keeps redacted, bounded output", async () => {
  host(`${"x".repeat(5000)}\nsigned in with pa ss$word: LOGIN_OK`, 0);
  const result = await runCommandCheck(
    record(),
    login,
    new AbortController().signal,
  );
  const [, script, options] = mocks.ssh.mock.calls[0];
  expect(script).not.toContain("pa ss$word");
  expect(script).toContain("-e ADMIN_PASSWORD 'app' 'php' 'check-login.php'");
  expect(script).toContain("docker compose -p sg-0b38e71d -f compose.json");
  expect(options.input).toBe("pa ss$word\n");
  expect(result).toMatchObject({ passed: true, status: 0, kind: "command" });
  expect(result.output).toContain("[REDACTED]: LOGIN_OK");
  expect(result.output!.length).toBeLessThanOrEqual(2000);
});

it("stops verification at a failing command with its exit status and output, recorded on the attempt", async () => {
  const deployment = record();
  mocks.commands.splice(0, Infinity, login);
  host("LOGIN_REJECTED", 1);
  await expect(
    verifyCommandChecks(deployment, new AbortController().signal),
  ).rejects.toThrow(/Owner administrator signs in \(exit 1\).*LOGIN_REJECTED/);
  // Exit 0 without the expected output fails too; an unknown outcome is
  // never a pass.
  host("signed in", 0);
  await expect(
    verifyCommandChecks(deployment, new AbortController().signal),
  ).rejects.toThrow('output lacks "LOGIN_OK"');
  mocks.ssh.mockRejectedValueOnce(new Error("connection lost"));
  await expect(
    verifyCommandChecks(deployment, new AbortController().signal),
  ).rejects.toThrow("outcome unknown");
  expect(
    deployment.lifecycle!.attempts[0].checks!.map((check) => [
      check.passed,
      check.status,
    ]),
  ).toEqual([
    [false, 1],
    [false, 0],
    [false, null],
  ]);
});
