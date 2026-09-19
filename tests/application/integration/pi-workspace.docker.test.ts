// Pi's real built-in implementations in the real per-run workspace container.
// Opt in with HALLVI_DOCKER_TESTS=1 on a host with a reachable Docker
// Engine. The first run builds the workspace image, which needs network.
import * as sdk from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../../temporary-root.mjs";
import {
  DockerClient,
  resolveDockerEndpoint,
} from "../../../src/server/docker";
import {
  cleanupPiWorkspaces,
  PiWorkspace,
  piWorkspaceTools,
} from "../../../src/server/pi-workspace";

const variables = ["HALLVI_DB_PATH", "HALLVI_PROBE_TOKEN"] as const;

describe.skipIf(process.env.HALLVI_DOCKER_TESTS !== "1")(
  "Pi built-ins in the real workspace container",
  () => {
    const saved = Object.fromEntries(
      variables.map((name) => [name, process.env[name]]),
    );
    let root = "";
    beforeAll(() => {
      root = createTemporaryRoot("/tmp/hallvi-pi-docker-");
      // Workspace ownership labels and event logs belong to this root.
      process.env.HALLVI_DB_PATH = join(root, "hallvi.db");
      process.env.HALLVI_PROBE_TOKEN = "controller-only-credential";
    });
    afterAll(async () => {
      await cleanupPiWorkspaces().catch(() => undefined);
      for (const name of variables)
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      removeTemporaryRoot(root);
    });

    it(
      "runs Pi's own tools on the seeded snapshot, never the controller, and removes the container on cancellation",
      async () => {
        const endpoint = resolveDockerEndpoint();
        if (endpoint?.kind !== "unix")
          throw new Error("A local Docker Engine socket is required.");
        const docker = new DockerClient(endpoint.path);
        const controllerFile = join(root, "controller-only.txt");
        writeFileSync(controllerFile, "controller data\n");
        const file = (path: string, content: string) => ({
          path,
          mode: 0o644,
          content: Buffer.from(content),
        });
        const workspace = new PiWorkspace({
          applicationId: "app-docker-proof",
          chatId: "run-docker-proof",
          source: async () => ({
            description: "qa/example@abc123",
            files: [
              file("README.md", "# Example\nStart with node src/server.js\n"),
              file("src/server.js", "export const port = 3000;\n"),
              file(".env", "API_TOKEN=do-not-copy\n"),
            ],
          }),
        });
        const tools = new Map(
          piWorkspaceTools(sdk, workspace).map((tool) => [tool.name, tool]),
        );
        // Output text, or the error Pi receives as tool feedback.
        const run = (name: string, args: object, signal?: AbortSignal) =>
          tools
            .get(name)!
            .execute(`${name}-call`, args, signal)
            .then(
              (result) =>
                result.content
                  .map((part) => ("text" in part ? part.text : ""))
                  .join("\n"),
              (error: Error) => `Error: ${error.message}`,
            );
        const container = `hv-pi-${workspace.id}`;
        try {
          // The selected snapshot, described, without credential files.
          const listing = await run("ls", { path: "." });
          expect.soft(listing).toContain("README.md");
          expect.soft(listing).toContain("src/");
          expect.soft(listing).not.toContain(".env");
          expect
            .soft(await run("read", { path: ".hallvi-source.txt" }))
            .toContain("qa/example@abc123");
          expect
            .soft(await run("read", { path: "README.md" }))
            .toContain("Start with node src/server.js");

          // Edits, new files, both shells and searches share one filesystem.
          const edits = [{ oldText: "3000", newText: "8080" }];
          expect
            .soft(await run("edit", { path: "src/server.js", edits }))
            .not.toMatch(/^Error/);
          expect
            .soft(
              await run("write", {
                path: "scripts/check.sh",
                content: "grep -q 8080 src/server.js && echo port-ok\n",
              }),
            )
            .not.toMatch(/^Error/);
          expect
            .soft(await run("bash", { command: "sh scripts/check.sh" }))
            .toContain("port-ok");
          expect
            .soft(
              await run("powershell", { command: "Get-Content src/server.js" }),
            )
            .toContain("8080");
          expect
            .soft(await run("grep", { pattern: "8080" }))
            .toContain("src/server.js");
          expect
            .soft(await run("find", { pattern: "*.sh" }))
            .toContain("scripts/check.sh");
          // Generated files can exceed one command-line argument.
          const large = "x".repeat(200_000);
          expect
            .soft(await run("write", { path: "large.txt", content: large }))
            .not.toMatch(/^Error/);
          expect
            .soft(await run("bash", { command: "wc -c < large.txt" }))
            .toContain("200000");

          // Not the controller: no host files, credentials, socket or network.
          const isolation = await run("bash", {
            command: `test ! -e ${controllerFile} && test ! -e /var/run/docker.sock && echo isolated; env | grep -q HALLVI_PROBE_TOKEN || echo no-credentials; node -e 'process.exit(Object.values(require("node:os").networkInterfaces()).flat().some(a => !a.internal) ? 1 : 0)' && echo no-external-address`,
          });
          expect
            .soft(isolation.trim())
            .toBe("isolated\nno-credentials\nno-external-address");
          expect
            .soft(await run("read", { path: controllerFile }))
            .toMatch(/^Error: .*ENOENT/);
          await run("write", { path: controllerFile, content: "from Pi\n" });
          expect(readFileSync(controllerFile, "utf8")).toBe(
            "controller data\n",
          );
          const inspected = await docker.json<{
            HostConfig: { NetworkMode: string; Binds: string[] | null };
            Mounts: Array<{ Type: string }>;
            Config: { Env: string[] | null };
          }>(`/containers/${container}/json`);
          expect.soft(inspected.HostConfig.NetworkMode).toBe("none");
          expect.soft(inspected.HostConfig.Binds ?? []).toEqual([]);
          expect
            .soft(inspected.Mounts.filter((mount) => mount.Type === "bind"))
            .toEqual([]);
          expect
            .soft((inspected.Config.Env ?? []).join("\n"))
            .not.toContain("controller-only-credential");
          // Only the model's container remains; no helper lingers beside it.
          expect
            .soft(
              await docker.listContainers({
                "hallvi.pi-workspace": workspace.id,
              }),
            )
            .toHaveLength(1);

          // Wrong calls return Pi's own actionable errors.
          expect
            .soft(
              await run("edit", {
                path: "src/server.js",
                edits: [{ oldText: "9999", newText: "1" }],
              }),
            )
            .toContain("Could not find the exact text in src/server.js");
          expect
            .soft(await run("bash", { command: "echo partial; exit 3" }))
            .toMatch(/partial[\s\S]*Command exited with code 3/);

          // Cancelling a running command removes the owned container.
          const cancel = new AbortController();
          const long = run("bash", { command: "sleep 600" }, cancel.signal);
          await vi.waitFor(
            async () => {
              const { Processes } = await docker.json<{
                Processes: string[][];
              }>(`/containers/${container}/top`);
              expect(
                Processes.some((row) => row.join(" ").includes("sleep 600")),
              ).toBe(true);
            },
            { timeout: 60_000, interval: 250 },
          );
          cancel.abort();
          expect(await long).toMatch(/^Error/);
          await expect(
            docker.json(`/containers/${container}/json`),
          ).rejects.toMatchObject({ status: 404 });
          // Nothing is replayed or silently recreated.
          expect(await run("ls", { path: "." })).toMatch(/^Error/);
          await expect(
            docker.json(`/containers/${container}/json`),
          ).rejects.toMatchObject({ status: 404 });
        } finally {
          await workspace.dispose();
        }
      },
      30 * 60_000,
    );
  },
);
