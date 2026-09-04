import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { commandFor, createDashboard } from "./dashboard/server";
import type { Launch } from "./dashboard/server";
import { directory, listReports, loadReport, readJson, writeJson } from "./dashboard/results";
import { phaseOneCases } from "./evals/phase-one-cases";
import { browserJourneys } from "./e2e/journeys";

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
  return { root, origin, headers, launch, dashboard };
}
it("serves both dashboard routes without launching checks or weakening API protection", async () => {
  const { origin, launch, dashboard } = await fixture();
  for (const route of ["/", "/evals"]) {
    const response = await fetch(`${origin}${route}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('href="/evals"');
    expect(html).toContain(`content="${dashboard.token}"`);
    expect((await fetch(`${origin}${route}`, { headers: { Origin: "https://attacker.invalid" } })).status).toBe(403);
  }
  expect((await fetch(`${origin}/api/state`)).status).toBe(403);
  expect(launch).not.toHaveBeenCalled();
});
it("maps a closed set of suites to fixed arguments and requires explicit spend consent", () => {
  expect(commandFor({ suite: "smoke" })).toEqual({ args: ["run", "test:e2e:smoke"], env: {} });
  expect(() => commandFor({ suite: "live" })).toThrow("Confirm subscription");
  expect(() => commandFor({ suite: "live", consent: true })).toThrow("model and effort");
  expect(() => commandFor({ suite: "judge", consent: true })).toThrow("saved answer");
  expect(commandFor({ suite: "live", consent: true, model: "gpt-5.6-sol", effort: "high" }).env).toEqual({
    SERVER_GUY_LIVE_EVALS: "1", PI_EVAL_REPEATS: "1", PI_EVAL_EXPECTED_MODEL: "gpt-5.6-sol", PI_EVAL_EXPECTED_EFFORT: "high",
    PI_EVAL_CASES: phaseOneCases.map((item) => item.id).join(","),
  });
});
it("runs a single eval case once without implicitly judging it", () => {
  const command = commandFor({ suite: "live", cases: ["greeting"], consent: true, model: "gpt-5.6-sol", effort: "high" });
  expect(command.args).toEqual(["run", "eval:pi"]);
  expect(command.env).toEqual({
    SERVER_GUY_LIVE_EVALS: "1", PI_EVAL_CASES: "greeting", PI_EVAL_REPEATS: "1",
    PI_EVAL_EXPECTED_MODEL: "gpt-5.6-sol", PI_EVAL_EXPECTED_EFFORT: "high",
  });
});
it("selects exact known journey tags and rejects empty, duplicate and foreign selections", () => {
  const command = commandFor({ suite: "e2e", journeys: ["settings", "disconnect"] });
  expect(command.args.slice(0, 4)).toEqual(["run", "test:e2e", "--", "--grep"]);
  const pattern = new RegExp(command.args[4]);
  expect(browserJourneys.filter((item) => pattern.test(`title @journey-${item.id}`)).map((item) => item.id)).toEqual(["settings", "disconnect"]);
  for (const journeys of [[], ["settings", "settings"], ["settings|.*"], ["missing"]]) {
    expect(() => commandFor({ suite: "e2e", journeys } as never)).toThrow();
  }
  expect(() => commandFor({ suite: "unit", journeys: ["settings"] })).toThrow();
});
it("bounds live selection and passes exact bulk judge keys without starting a model", () => {
  const command = commandFor({ suite: "live", cases: ["greeting", "hypothetical"], repeats: 2, consent: true, model: "gpt-5.6-sol", effort: "high" });
  expect(command.env).toMatchObject({ PI_EVAL_REPEATS: "2", PI_EVAL_CASES: "greeting,hypothetical" });
  for (const patch of [{ repeats: 6 }, { repeats: 1.5 }, { cases: [] }, { cases: ["fake"] }, { cases: ["greeting", "greeting"] }]) {
    expect(() => commandFor({ suite: "live", consent: true, ...patch } as never)).toThrow();
  }
  const judge = { suite: "judge" as const, run: "run", hash: "hash", keys: ["greeting:1", "greeting:2"], model: "gpt-5.6-sol", effort: "high" as const };
  expect(() => commandFor(judge)).toThrow("Confirm subscription");
  expect(commandFor({ ...judge, consent: true }).env.PI_JUDGE_CASES).toBe('["greeting:1","greeting:2"]');
  expect(() => commandFor({ ...judge, consent: true, keys: [] })).toThrow();
  expect(() => commandFor({ ...judge, consent: true, key: "greeting:1" })).toThrow();
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
it("clears inherited paid opt-ins, allows one process and saves the launched command through cancellation", async () => {
  vi.stubEnv("SERVER_GUY_LIVE_EVALS", "1"); vi.stubEnv("SERVER_GUY_LIVE_JUDGE", "1");
  const { root, origin, headers, launch } = await fixture();
  const post = (path: string, body: unknown) => fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const response = await post("/api/start", { suite: "unit" });
  expect(response.status).toBe(202);
  const run = await response.json();
  expect(run.command).toBe("npm run test");
  expect(readJson(join(root, "tests/results/runs", `${run.id}.json`)).command).toBe(run.command);
  expect(launch.mock.calls[0].slice(0, 2)).toEqual(["npm", ["run", "test"]]);
  await vi.waitFor(async () => expect((await (await fetch(`${origin}/api/state`, { headers })).json()).active.log).toContain('"live":"","judge":""'));
  expect((await post("/api/start", { suite: "unit" })).status).toBe(400);
  expect((await post("/api/stop", {})).status).toBe(200);
  await vi.waitFor(async () => {
    const state = await (await fetch(`${origin}/api/state`, { headers })).json();
    expect(state.active).toBeNull(); expect(state.history[0].status).toBe("cancelled");
    expect(state.history[0].command).toBe(run.command);
  });
});
it("preflights all bulk judge answers before launch and protects bulk human writes", async () => {
  const { root, origin, headers, launch } = await fixture();
  const path = directory(join(root, "tests/results/evals", "sample"));
  writeJson(join(path, "results.json"), {
    model: "synthetic", effort: "high", startedAt: "2026-09-04", commit: "test", dirty: false, sourceFingerprints: {},
    results: [1, 2].map((repetition) => ({ caseId: "greeting", repetition, rubric: "No invented choice", outcome: "checks-passed", checks: {},
      error: null, input: { userMessage: "Hello" }, reply: { message: "Hello", decisionProposals: [] }, before: {}, after: {} })),
  });
  const hash = loadReport(root, "sample").hash;
  const post = (path: string, body: unknown, changed = {}) => fetch(`${origin}${path}`, { method: "POST", headers: { ...headers, ...changed }, body: JSON.stringify(body) });
  expect((await post("/api/start", { suite: "judge", run: "sample", hash, keys: ["greeting:1", "missing:1"], consent: true, model: "gpt-5.6-sol", effort: "high" })).status).toBe(400);
  expect(launch).not.toHaveBeenCalled();
  const batch = { run: "sample", hash, keys: ["greeting:1", "greeting:2"], review: { reviewer: "Test", verdict: "pass", reason: "Reviewed both greetings" } };
  expect((await post("/api/review/bulk", batch, { Origin: "https://attacker.invalid" })).status).toBe(403);
  expect((await post("/api/review/bulk", { ...batch, keys: [] })).status).toBe(400);
  expect((await post("/api/review/bulk", { ...batch, hash: "stale" })).status).toBe(400);
  expect(listReports(root)[0].reviews).toHaveLength(0);
  expect(await (await post("/api/review/bulk", batch)).json()).toEqual({ saved: batch.keys, failed: [] });
  expect(listReports(root)[0].reviews).toHaveLength(2);
  expect(loadReport(root, "sample").hash).toBe(hash);
  const archive = { run: "sample", hash, archived: true };
  expect((await post("/api/runs/archive", archive, { Origin: "https://attacker.invalid" })).status).toBe(403);
  expect((await post("/api/runs/archive", archive, { "X-SG-Testing-Token": "" })).status).toBe(403);
  expect((await post("/api/runs/archive", { ...archive, archived: "true" })).status).toBe(400);
  expect((await post("/api/runs/archive", { ...archive, keys: ["greeting:1"] })).status).toBe(400);
  expect((await post("/api/runs/archive", { ...archive, hash: "stale" })).status).toBe(400);
  expect(listReports(root)[0].archived).toBe(false);
  expect(await (await post("/api/runs/archive", archive)).json()).toEqual({ archived: true });
  expect(await (await post("/api/runs/archive", { ...archive, archived: false })).json()).toEqual({ archived: false });
  expect(listReports(root)[0].reviews).toHaveLength(2);
  expect(loadReport(root, "sample").hash).toBe(hash);
});
