import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createDashboard } from "../dashboard/server";
import { journey } from "./journeys";

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function descendants(pid: number): number[] {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const pids = [pid];
  for (let index = 0; index < pids.length; index++) {
    pids.push(
      ...rows.filter((row) => row[1] === pids[index]).map((row) => row[0]),
    );
  }
  return pids;
}
async function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
async function unusedQaPort() {
  for (let port = 3800; port < 4000; port++) {
    const server = createServer();
    const available = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("No free QA port");
}

test(
  "stopping a runner cleans up its detached real Next fixture and permits restart",
  journey("dashboard"),
  async () => {
    const root = mkdtempSync(join(tmpdir(), "sg-fixture-lifecycle-"));
    const port = await unusedQaPort();
    execFileSync("git", ["init", "--quiet", root]);
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "fixture",
      ],
      { cwd: root },
    );
    const fixturePath = fileURLToPath(
      new URL("./qa-fixture.mjs", import.meta.url),
    );
    const fixturePids: number[] = [];
    const fixtureRoots: string[] = [];
    // Mirrors Playwright's detached worker fixture, but deliberately has no
    // teardown:
    // the dashboard kills its parent before any worker finally block can run.
    const parentScript = `const {spawn}=require('node:child_process');
    const fixture=spawn(process.execPath,[${JSON.stringify(fixturePath)},${JSON.stringify(String(port))},'success','ready'],{detached:true,stdio:'inherit'});
    console.log(JSON.stringify({fixturePid:fixture.pid}));
    setInterval(()=>{},1000);`;
    const dashboard = createDashboard(root, (_command, _args, options) => {
      const child = spawn(process.execPath, ["-e", parentScript], options);
      let pending = "";
      child.stdout?.on("data", (data) => {
        pending += data.toString();
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const line of lines) {
          try {
            const value = JSON.parse(line);
            if (Number.isInteger(value.fixturePid))
              fixturePids.push(value.fixturePid);
            if (
              typeof value.root === "string" &&
              /^\/tmp\/server-guy-e2e-[A-Za-z0-9]+$/.test(value.root)
            )
              fixtureRoots.push(value.root);
          } catch {
            /* Ordinary Next output is not a manifest. */
          }
        }
      });
      return child;
    });
    try {
      dashboard.server.listen(0, "127.0.0.1");
      await once(dashboard.server, "listening");
      const address = dashboard.server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing dashboard address");
      const origin = `http://127.0.0.1:${address.port}`;
      const headers = {
        "X-SG-Testing-Token": dashboard.token,
        Origin: origin,
        "Content-Type": "application/json",
      };
      const post = (path: string, body: unknown) =>
        fetch(`${origin}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      for (const method of ["stop-button", "dashboard-shutdown"]) {
        expect((await post("/api/start", { suite: "smoke" })).status).toBe(202);
        await expect
          .poll(() => listening(port), { timeout: 25_000 })
          .toBe(true);
        const pids = descendants(fixturePids.at(-1)!);
        // Includes an actual Next subprocess.
        expect(pids.length).toBeGreaterThan(1);
        if (method === "stop-button")
          expect((await post("/api/stop", {})).status).toBe(200);
        else dashboard.stop();
        await expect
          .poll(() => pids.filter(alive), { timeout: 15_000 })
          .toEqual([]);
        await expect.poll(() => listening(port)).toBe(false);
        // The fixture deletes its own /tmp/server-guy-e2e-* root as it exits,
        // on both cancellation paths.
        expect(fixtureRoots.length).toBeGreaterThan(0);
        await expect
          .poll(() => fixtureRoots.filter((path) => existsSync(path)), {
            timeout: 10_000,
          })
          .toEqual([]);
        if (method === "stop-button") {
          await expect
            .poll(
              async () =>
                (await (await fetch(`${origin}/api/state`, { headers })).json())
                  .active,
            )
            .toBeNull();
        }
      }
    } finally {
      dashboard.stop();
      dashboard.server.closeAllConnections();
      // Only clean up processes and temporary directories created by this test.
      for (const pid of fixturePids) {
        if (alive(pid)) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            /* Already stopped. */
          }
        }
      }
      for (const path of fixtureRoots)
        rmSync(path, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "ordinary worker teardown deletes the fixture directory and keeps the shared node_modules",
  journey("dashboard"),
  async () => {
    const port = await unusedQaPort();
    const fixturePath = fileURLToPath(
      new URL("./qa-fixture.mjs", import.meta.url),
    );
    const source = fileURLToPath(new URL("../..", import.meta.url));
    // Exactly how tests/browser/fixtures.ts starts and stops the QA app.
    const child = spawn(
      process.execPath,
      [fixturePath, String(port), "success", "ready"],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let root = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    try {
      await expect
        .poll(
          () => {
            if (child.exitCode !== null)
              throw new Error(`QA app exited: ${output}`);
            root =
              output
                .split("\n")
                .filter((line) => line.startsWith('{"root":'))
                .map((line) => JSON.parse(line).root as string)[0] ?? "";
            return root;
          },
          { timeout: 60_000 },
        )
        .toMatch(/^\/tmp\/server-guy-e2e-[A-Za-z0-9]{6}$/);
      await expect.poll(() => listening(port), { timeout: 60_000 }).toBe(true);
      expect(existsSync(join(root, "state", "qa.db"))).toBe(true);
      const closed = once(child, "close");
      process.kill(-child.pid!, "SIGTERM");
      await closed;
      expect(existsSync(root)).toBe(false);
      expect(existsSync(join(source, "node_modules", "next"))).toBe(true); // The symlinked node_modules was unlinked, not emptied.
      await expect.poll(() => listening(port)).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* stopped */
        }
      }
      if (root && existsSync(root))
        rmSync(root, { recursive: true, force: true });
    }
  },
);
