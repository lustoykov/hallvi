// Opt-in (SG_RUN_DOCKER_PROOF=1): the host-side deployment lock that guards
// release execution and its durable result, on a real Linux filesystem.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it.skipIf(process.env.SG_RUN_DOCKER_PROOF !== "1")(
  "cannot read a completion receipt while the Linux deployment lock is held",
  async () => {
    const { deploymentLock } =
      await import("../../../src/server/deployment-ssh");
    const id = randomUUID(),
      name = `sg-lock-${id}`;
    const run = (args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        timeout: 30000,
        stdio: "pipe",
      }).trim();
    const inside = (command: string) =>
      run(["exec", name, "sh", "-c", command]);
    const waitForFile = async (path: string) => {
      for (let i = 0; i < 100; i++) {
        try {
          inside(`test -f ${path}`);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      throw new Error(`Linux fixture never reached ${path}`);
    };
    try {
      // Use the Linux filesystem: macOS shared mounts do not preserve Linux
      // advisory-lock behavior across independent Docker Desktop mounts.
      run([
        "run",
        "-d",
        "--name",
        name,
        "--platform",
        "linux/amd64",
        "--tmpfs",
        "/run/lock",
        "python:3.12-alpine",
        "sh",
        "-c",
        `printf '{"exitCode":0}' > /run/lock/result.json; ${deploymentLock(id, "touch /run/lock/held; while [ ! -f /run/lock/release ]; do sleep 0.1; done")}; touch /run/lock/released; sleep 30`,
      ]);
      await waitForFile("/run/lock/held");
      const inspect = () =>
        inside(deploymentLock(id, "cat /run/lock/result.json"));
      expect(inspect).toThrow();
      inside("touch /run/lock/release");
      await waitForFile("/run/lock/released");
      expect(JSON.parse(inspect())).toEqual({ exitCode: 0 });
    } finally {
      run(["rm", "-f", name]);
    }
  },
  60000,
);
