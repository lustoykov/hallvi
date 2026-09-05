import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { directory, writeJson } from "../../dashboard/results";
import { createDashboard } from "../../dashboard/server";

it.each([false, true])(
  "explains failed live runs without leaking output (partial report: %s)",
  async (partialReport) => {
    const root = mkdtempSync(join(tmpdir(), "sg-dashboard-failure-"));
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
    const saveReport = (run: string) =>
      writeJson(
        join(directory(join(root, "tests/results/evals", run)), "results.json"),
        {
          model: "gpt-5.6-sol",
          effort: "high",
          startedAt: new Date().toISOString(),
          commit: "test",
          dirty: false,
          sourceFingerprints: {},
          results: [],
        },
      );
    // An older report must not hide a setup failure in this run.
    saveReport("older");
    const dashboard = createDashboard(root, (_command, _args, options) => {
      if (partialReport) saveReport("partial");
      return spawn(
        process.execPath,
        ["-e", "console.error('FAKE-PROVIDER-SECRET');process.exit(1)"],
        options,
      );
    });
    try {
      dashboard.server.listen(0, "127.0.0.1");
      await once(dashboard.server, "listening");
      const address = dashboard.server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing server address");
      const origin = `http://127.0.0.1:${address.port}`;
      const headers = {
        "X-SG-Testing-Token": dashboard.token,
        Origin: origin,
        "Content-Type": "application/json",
      };
      const response = await fetch(`${origin}/api/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          suite: "live",
          consent: true,
          model: "gpt-5.6-sol",
          effort: "high",
          cases: ["greeting"],
          repeats: 1,
        }),
      });
      expect(response.status).toBe(202);
      await vi.waitFor(async () => {
        const state = await (
          await fetch(`${origin}/api/state`, { headers })
        ).json();
        expect(state.active).toBeNull();
        const run = state.history[0];
        expect(run.status).toBe("failed");
        expect(run.log).toContain("exit code 1");
        expect(run.log).toContain(run.command);
        expect(run.log).toContain("Rerunning may use subscription usage");
        expect(run.log).not.toContain("FAKE-PROVIDER-SECRET");
        expect(
          run.log.includes("No readable eval report was saved by this run"),
        ).toBe(!partialReport);
        expect(
          state.reports.map((report: { run: string }) => report.run).sort(),
        ).toEqual(partialReport ? ["older", "partial"] : ["older"]);
      });
    } finally {
      dashboard.stop();
      dashboard.server.closeAllConnections();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
