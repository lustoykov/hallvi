import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { commandFor, createDashboard } from "./dashboard/server";
import type { Launch } from "./dashboard/server";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.unstubAllEnvs(); });
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sg-dashboard-test-"));
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"], { cwd: root });
  const launch = vi.fn<Launch>((_command, _args, options) => spawn(process.execPath,
    ["-e", "console.log(JSON.stringify({live:process.env.SERVER_GUY_LIVE_EVALS,judge:process.env.SERVER_GUY_LIVE_JUDGE}));setTimeout(()=>{},30000)"], options));
  const dashboard = createDashboard(root, launch);
  dashboard.server.listen(0, "127.0.0.1"); await once(dashboard.server, "listening");
  const address = dashboard.server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = { "X-SG-Testing-Token": dashboard.token, Origin: origin, "Content-Type": "application/json" };
  cleanup.push(async () => {
    const process = launch.mock.results.at(-1)?.value;
    const closed = process && process.exitCode === null && process.signalCode === null ? once(process, "close") : Promise.resolve();
    dashboard.stop(); await closed;
    dashboard.server.closeAllConnections();
    rmSync(root, { recursive: true, force: true });
  });
  return { origin, headers, launch, dashboard };
}
it("maps a closed set of suites to fixed arguments and requires explicit spend consent", () => {
  expect(commandFor({ suite: "smoke" })).toEqual({ args: ["run", "test:e2e:smoke"], env: {} });
  expect(() => commandFor({ suite: "live" })).toThrow("Confirm subscription");
  expect(() => commandFor({ suite: "live", consent: true })).toThrow("model and effort");
  expect(() => commandFor({ suite: "judge", consent: true })).toThrow("saved answer");
  expect(commandFor({ suite: "live", consent: true, model: "gpt-5.6-sol", effort: "high" }).env).toEqual({
    SERVER_GUY_LIVE_EVALS: "1", PI_EVAL_REPEATS: "1", PI_EVAL_EXPECTED_MODEL: "gpt-5.6-sol", PI_EVAL_EXPECTED_EFFORT: "high",
  });
});
it("opens without launching anything and rejects foreign Host, Origin and missing token", async () => {
  const { origin, headers, launch } = await fixture();
  expect((await fetch(origin)).status).toBe(200);
  expect((await fetch(`${origin}/api/state`, { headers })).status).toBe(200);
  expect((await fetch(`${origin}/api/state`)).status).toBe(403);
  const hostileHost = await new Promise((resolve, reject) => {
    get(origin, { headers: { Host: "attacker.invalid" } }, (response) => { response.resume(); resolve(response.statusCode); }).on("error", reject);
  });
  expect(hostileHost).toBe(403);
  expect((await fetch(origin, { headers: { Origin: "https://attacker.invalid" } })).status).toBe(403);
  expect(launch).not.toHaveBeenCalled();
});
it("rejects missing consent, missing Origin, non-JSON, arbitrary commands and fabricated saved cases", async () => {
  const { origin, headers, launch } = await fixture();
  for (const body of [{ suite: "live" }, { suite: "npm;whoami" }, { suite: "unit", command: "whoami" },
    { suite: "judge", consent: true, run: "../outside", hash: "x", key: "case:1", model: "gpt-5.6-sol", effort: "high" }]) {
    expect((await fetch(`${origin}/api/start`, { method: "POST", headers, body: JSON.stringify(body) })).status).toBe(400);
  }
  for (const changed of [{ Origin: "" }, { "Content-Type": "text/plain" }]) {
    expect((await fetch(`${origin}/api/start`, { method: "POST", headers: { ...headers, ...changed }, body: '{"suite":"unit"}' })).status).toBe(403);
  }
  expect(launch).not.toHaveBeenCalled();
});
it("clears inherited paid opt-ins, allows one process and records cancellation", async () => {
  vi.stubEnv("SERVER_GUY_LIVE_EVALS", "1"); vi.stubEnv("SERVER_GUY_LIVE_JUDGE", "1");
  const { origin, headers, launch } = await fixture();
  const post = (path: string, body: unknown) => fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  expect((await post("/api/start", { suite: "unit" })).status).toBe(202);
  expect(launch.mock.calls[0].slice(0, 2)).toEqual(["npm", ["run", "test"]]);
  await vi.waitFor(async () => expect((await (await fetch(`${origin}/api/state`, { headers })).json()).active.log).toContain('"live":"","judge":""'));
  expect((await post("/api/start", { suite: "unit" })).status).toBe(400);
  expect((await post("/api/stop", {})).status).toBe(200);
  await vi.waitFor(async () => {
    const state = await (await fetch(`${origin}/api/state`, { headers })).json();
    expect(state.active).toBeNull(); expect(state.history[0].status).toBe("cancelled");
  });
});
