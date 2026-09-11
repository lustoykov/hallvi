// A mutating command check whose reply is lost: the host's own record, not
// a retry, decides what happened. The check script runs under a real shell
// against a stub `docker` that records every "mutation" it performs; the
// SSH stand-in drops the session while the command is still running.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  type CheckTarget,
} from "../../../src/server/command-checks";

let root: string;
let mutations: string;
let target: CheckTarget;
const attemptId = "5d1e0d2e-2c4a-4c8e-9f7b-3a1c2b4d5e6f";
const record = () =>
  ({
    id: "0b38e71d-b054-412c-87dd-5c87fae80d08",
    lifecycle: {
      attempts: [{ id: attemptId, operationId: "op-1", outcome: "working" }],
    },
  }) as unknown as DeploymentRecord;
const check = {
  name: "Create the marked page",
  service: "app",
  run: ["php", "create-page.php"],
  inputs: ["ADMIN_PASSWORD"],
  contains: "PAGE_CREATED",
  timeoutSeconds: 4,
};
// The stub docker: `command -v timeout` answers as the container would, and
// the command itself appends one mutation, slowly or quickly.
const stub = `#!/bin/sh
case "$*" in
  *"command -v timeout"*) exit "\${SG_STUB_NO_TIMEOUT:-0}" ;;
esac
[ -n "$ADMIN_PASSWORD" ] || { echo "no input"; exit 2; }
sleep "\${SG_STUB_SLEEP:-0}"
case "$*" in
  *"timeout -k 5 4"*) if [ "\${SG_STUB_EXPIRE:-0}" = 1 ]; then exit 124; fi ;;
esac
printf 'mutation by %s\\n' "$ADMIN_PASSWORD" >> "$SG_STUB_LOG"
echo "PAGE_CREATED"
`;
/** A local host shell standing in for SSH; `drop` ends the session early. */
function shell(environment: Record<string, string>, drop = false) {
  mocks.ssh.mockImplementationOnce(
    (_record, script: string, options: { input?: string }) =>
      new Promise<string>((resolvePromise, reject) => {
        const child = spawn("sh", ["-c", script], {
          env: {
            ...process.env,
            ...environment,
            PATH: `${join(root, "bin")}:${resolve("tests/rig/bin")}:${process.env.PATH}`,
            SG_STUB_LOG: mutations,
          },
          stdio: "pipe",
        });
        let output = "";
        child.stdout!.on("data", (chunk) => (output += chunk));
        child.stdin!.end(options.input);
        if (drop)
          setTimeout(() => {
            child.kill("SIGHUP");
            reject(new Error("connection lost"));
          }, 700);
        child.on("close", () => (drop ? undefined : resolvePromise(output)));
      }),
  );
}
const lines = () => readFileSync(mutations, "utf8").split("\n").filter(Boolean);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const signal = () => new AbortController().signal;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-check-hold-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/docker"), stub);
  chmodSync(join(root, "bin/docker"), 0o755);
  mutations = join(root, "mutations.log");
  writeFileSync(mutations, "");
  target = {
    cwd: root,
    project: "sg-0b38e71d",
    results: join(root, "checks"),
    hold: true,
  };
  mocks.commands.splice(0, Infinity, check);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("a lost session leaves a hold; the host's record resolves it and the mutation is never replayed", async () => {
  const deployment = record();
  shell({ SG_STUB_SLEEP: "2" }, true);
  const lost = await runCommandCheck(deployment, check, signal(), target);
  expect(lost.status).toBeNull();
  expect(lost.passed).toBe(false);
  const pending = deployment.commandPending!;
  expect(pending).toMatchObject({
    name: check.name,
    attemptId,
    timeoutSeconds: 4,
  });
  // The host recorded the start before the session dropped; the command
  // is still running there, and nothing may run again meanwhile.
  await expect(
    verifyCommandChecks(deployment, new AbortController().signal),
  ).rejects.toThrow("unknown outcome");
  shell({});
  expect(
    await resolvePendingCommand(deployment, new AbortController().signal),
  ).toEqual({ kind: "running" });
  await wait(2500);
  shell({});
  const known = await resolvePendingCommand(
    deployment,
    new AbortController().signal,
  );
  expect(known).toMatchObject({
    kind: "known",
    result: { passed: true, status: 0 },
  });
  expect((known as { result: { output: string } }).result.output).toContain(
    "PAGE_CREATED",
  );
  expect((known as { result: { output: string } }).result.output).not.toContain(
    "pa ss$word",
  );
  // Exactly one mutation, made with the private input, and no replay.
  expect(lines()).toEqual(["mutation by pa ss$word"]);
  expect(mocks.ssh).toHaveBeenCalledTimes(3);
});

it("a command that finishes in time is a known result, and a container-enforced limit is a known failure", async () => {
  const deployment = record();
  shell({});
  const done = await runCommandCheck(deployment, check, signal(), target);
  expect(done).toMatchObject({ passed: true, status: 0 });
  expect(deployment.commandPending).toBeNull();
  expect(lines()).toHaveLength(1);
  shell({ SG_STUB_EXPIRE: "1" });
  const expired = await runCommandCheck(deployment, check, signal(), target);
  expect(expired).toMatchObject({ passed: false, status: 124 });
  expect(expired.output).toContain("Stopped after exceeding its 4 s limit");
  expect(deployment.commandPending).toBeNull();
});

it("without a timeout command in the container, an expired limit is an unknown outcome", async () => {
  const deployment = record();
  // The stub sleeps past the 4 s limit; the host-side timeout ends the
  // client, but nothing stopped the command inside the container.
  shell({ SG_STUB_NO_TIMEOUT: "1", SG_STUB_SLEEP: "6" });
  const abandoned = await runCommandCheck(
    deployment,
    check,
    new AbortController().signal,
    target,
  );
  expect(abandoned.status).toBeNull();
  expect(abandoned.output).toContain("no timeout command to stop it");
  expect(deployment.commandPending).not.toBeNull();
  // The record on the host keeps saying so: exit 124, unbounded, is lost.
  shell({});
  expect(
    await resolvePendingCommand(deployment, new AbortController().signal),
  ).toEqual({ kind: "lost" });
}, 20_000);
