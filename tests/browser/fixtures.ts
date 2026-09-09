import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { removeTemporaryRoot } from "../temporary-root.mjs";

// One disposable app per worker; distinct repositories per test. Never port
// 3000.
export const test = base.extend<
  Record<never, never>,
  { fixture: { url: string; state: string } }
>({
  fixture: [
    async ({}, provide, workerInfo) => {
      const port = 3180 + workerInfo.workerIndex;
      const child = spawn(
        process.execPath,
        ["tests/browser/qa-fixture.mjs", String(port), "success", "ready"],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-80_000);
      });
      child.stderr.on("data", (data) => {
        output = (output + data).slice(-80_000);
      });
      const url = `http://127.0.0.1:${port}`;
      let root = "";
      try {
        let state = "";
        await expect
          .poll(
            async () => {
              if (child.exitCode !== null)
                throw new Error(`QA app exited: ${output}`);
              const manifest = output
                .split("\n")
                .find((line) => line.startsWith('{"root":'));
              if (!manifest) return false;
              ({ root, state } = JSON.parse(manifest));
              return fetch(`${url}/applications`)
                .then((r) => r.ok)
                .catch(() => false);
            },
            { timeout: 90_000, intervals: [500, 1000] },
          )
          .toBe(true);
        // Compile conversation handlers before interaction deadlines begin.
        // GETs against nonexistent IDs create no application, chat or run.
        // Compilation is fixture setup, not an application response-time check.
        const missing = "00000000-0000-4000-8000-000000000000";
        for (const path of [
          `/api/applications/${missing}`,
          `/api/applications/${missing}/chats`,
          `/api/applications/${missing}/chats/${missing}/messages`,
          `/api/applications/${missing}/chats/${missing}/events`,
        ]) {
          const response = await fetch(`${url}${path}`, {
            headers: { origin: url },
            signal: AbortSignal.timeout(60_000),
          });
          await response.body?.cancel();
          expect([200, 400, 404, 405], `Fixture warm-up: ${path}`).toContain(
            response.status,
          );
        }
        await provide({ url, state });
      } finally {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          const closed = once(child, "close");
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            /* already stopped */
          }
          const timer = setTimeout(() => {
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch {
              /* stopped */
            }
          }, 5000);
          await closed;
          clearTimeout(timer);
        }
        // The fixture deletes its own root as it exits; this only matters if
        // the SIGKILL fallback above fired.
        if (root) removeTemporaryRoot(root);
      }
    },
    { scope: "worker", timeout: 180_000 },
  ],
  baseURL: async ({ fixture }, provide) => {
    await provide(fixture.url);
  },
  page: async ({ page, fixture }, provide) => {
    // Restore synthetic preferences after settings tests, without touching user
    // state.
    const path = join(fixture.state, "pi-settings.json");
    const settings = readFileSync(path, "utf8");
    const githubPath = join(fixture.state, "github-connection.json");
    const githubSettings = readFileSync(githubPath, "utf8");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.context().route("**/*", (route) => {
      const origin = new URL(route.request().url()).origin;
      return origin === fixture.url ? route.continue() : route.abort();
    });
    try {
      await provide(page);
    } finally {
      writeFileSync(path, settings, { mode: 0o600 });
      writeFileSync(githubPath, githubSettings, { mode: 0o600 });
      writeFileSync(join(fixture.state, "github-scenario.json"), "{}", {
        mode: 0o600,
      });
    }
    expect(errors, "Unexpected browser exceptions").toEqual([]);
  },
});
export { expect };
