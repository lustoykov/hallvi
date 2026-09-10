import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  composeDefinition,
  composeStartCommand,
} from "../../../src/server/deployment-compose";
import { queuePlan } from "../../fixtures/queue-worker/plan";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

// Exercise the production verifier, changing only SSH transport to the local
// Docker fixture. No provider calls, real deployment records or credentials.
const transport = vi.hoisted(() => ({ root: "" }));
vi.mock("../../../src/server/db", () => ({ getApplication: vi.fn() }));
vi.mock("../../../src/server/deployment-store", () => ({
  saveDeployment: vi.fn(),
  deploymentEvent: vi.fn(),
  deploymentMessage: vi.fn(),
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (file: string, args: string[], options: object) => {
      if (file !== "ssh") throw Error("Unexpected transport in fixture");
      const command = args.at(-1)!;
      if (!command.startsWith("cd /opt/server-guy/"))
        throw Error("Unexpected remote command in fixture");
      return actual.spawn(
        "sh",
        ["-c", command.replace(/^cd \/opt\/server-guy\/[a-f0-9-]+ && /, "")],
        { ...options, cwd: transport.root },
      );
    },
  };
});
import {
  verifyDeployment,
  verifyServiceImages,
  verifyPrivateServices,
} from "../../../src/server/deployment-executor";

it.skipIf(process.env.SG_RUN_DOCKER_PROOF !== "1")(
  "deploys, verifies, recreates and detects a stopped worker using real Linux containers",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "sg-services-"));
    transport.root = root;
    vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "controller"));
    const id = randomUUID();
    const project = `sg-${id.slice(0, 8)}`;
    const args = ["compose", "-p", project, "-f", "compose.json"];
    const compose = (...more: string[]) =>
      execFileSync("docker", [...args, ...more], {
        cwd: root,
        encoding: "utf8",
        timeout: 240000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const signal = new AbortController().signal;
    const plan = queuePlan();
    const record = {
      id,
      applicationId: "synthetic",
      chatId: "synthetic",
      plan,
      revision: "a".repeat(40),
      repository: "synthetic/queue",
      events: [],
      logs: "",
      status: "deploying",
    } as unknown as DeploymentRecord;
    try {
      execFileSync(
        "docker",
        ["pull", "--platform", "linux/amd64", plan.services![1].image!],
        {
          encoding: "utf8",
          timeout: 240000,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      plan.services![1].image = execFileSync(
        "docker",
        [
          "image",
          "inspect",
          "--format",
          "{{index .RepoDigests 0}}",
          plan.services![1].image!,
        ],
        { encoding: "utf8" },
      ).trim();
      mkdirSync(join(root, "source"));
      cpSync(
        resolve("tests/fixtures/queue-worker/app.py"),
        join(root, "source/app.py"),
      );
      cpSync(
        resolve("tests/fixtures/queue-worker/Dockerfile"),
        join(root, "source/Dockerfile"),
      );
      const definition = composeDefinition(
        plan,
        record.revision!,
        id,
        "unused",
        { QUEUE_PASSWORD: "synthetic$with${dollars}" },
      );
      // Only transport differs: ephemeral loopback port, and production's amd64
      // target is explicit when Docker Desktop itself runs on Apple silicon.
      (definition.services.app as { ports: string[] }).ports = [
        "127.0.0.1::8080",
      ];
      for (const service of Object.values(definition.services))
        (service as Record<string, unknown>).platform = "linux/amd64";
      writeFileSync(join(root, "compose.json"), JSON.stringify(definition), {
        mode: 0o600,
      });
      execFileSync(
        "sh",
        [
          "-c",
          composeStartCommand(
            plan,
            `docker compose -p ${project} -f compose.json`,
          ),
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 240000,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const updateAddress = () =>
        (record.address = compose("port", "app", "8080"));
      const observe = async () => {
        const httpAddress = record.address;
        record.address = "127.0.0.1";
        try {
          await verifyServiceImages(record, signal);
          await verifyPrivateServices(record, signal);
        } finally {
          record.address = httpAddress;
        }
      };
      updateAddress();
      await observe();
      expect(record.serviceImages!.worker).toBe(record.serviceImages!.app);
      expect(Object.keys(record.serviceReadiness!).sort()).toEqual([
        "queue",
        "worker",
      ]);
      await verifyDeployment(record, signal);
      const clean = () =>
        expect(
          compose(
            "exec",
            "-T",
            "queue",
            "sh",
            "-c",
            'REDISCLI_AUTH="$QUEUE_PASSWORD" valkey-cli dbsize',
          ),
        ).toBe("1"); // only heartbeat remains
      clean();
      const queueVolume = execFileSync(
        "docker",
        [
          "inspect",
          "--format",
          "{{range .Mounts}}{{.Name}}{{end}}",
          compose("ps", "-q", "queue"),
        ],
        { encoding: "utf8" },
      ).trim();
      compose(
        "up",
        "-d",
        "--force-recreate",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "120",
      );
      updateAddress();
      await observe();
      await verifyDeployment(record, signal);
      clean();
      expect(
        execFileSync(
          "docker",
          [
            "inspect",
            "--format",
            "{{range .Mounts}}{{.Name}}{{end}}",
            compose("ps", "-q", "queue"),
          ],
          { encoding: "utf8" },
        ).trim(),
      ).toBe(queueVolume);
      compose("stop", "worker");
      await expect(observe()).rejects.toThrow("worker is not running");
      await expect(verifyDeployment(record, signal)).rejects.toThrow();
      expect(record.cleanup).toBeNull();
      clean();
      compose("start", "worker");
      compose(
        "up",
        "-d",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "120",
      );
      await observe();
      await verifyDeployment(record, signal);
      clean();
    } finally {
      try {
        compose("down", "--volumes", "--remove-orphans", "--rmi", "local");
      } finally {
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
  600000,
);
