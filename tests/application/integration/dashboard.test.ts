import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { commandFor, createDashboard } from "../../dashboard/server";
import type { Launch } from "../../dashboard/server";
import {
  directory,
  listReports,
  loadReport,
  readJson,
  writeJson,
  archiveRun,
} from "../../dashboard/results";
import { phaseOneCases } from "../../evals/phase-one-cases";
import { browserJourneys } from "../../browser/journeys";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.unstubAllEnvs();
});
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sg-dashboard-test-"));
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
  const launch = vi.fn<Launch>((_command, _args, options) =>
    spawn(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify({live:process.env.SERVER_GUY_LIVE_EVALS,judge:process.env.SERVER_GUY_LIVE_JUDGE}));setTimeout(()=>{},30000)",
      ],
      options,
    ),
  );
  const dashboard = createDashboard(root, launch);
  dashboard.server.listen(0, "127.0.0.1");
  await once(dashboard.server, "listening");
  const address = dashboard.server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = {
    "X-SG-Testing-Token": dashboard.token,
    Origin: origin,
    "Content-Type": "application/json",
  };
  cleanup.push(async () => {
    const process = launch.mock.results.at(-1)?.value;
    const closed =
      process && process.exitCode === null && process.signalCode === null
        ? once(process, "close")
        : Promise.resolve();
    dashboard.stop();
    await closed;
    dashboard.server.closeAllConnections();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, origin, headers, launch, dashboard };
}
it("serves both dashboard routes without launching checks or weakening API protection", async () => {
  const { root, origin, launch, dashboard } = await fixture();
  for (const route of ["/", "/evals", "/about"]) {
    const response = await fetch(`${origin}${route}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('href="/evals"');
    expect(html).toContain(`content="${dashboard.token}"`);
    expect(
      (
        await fetch(`${origin}${route}`, {
          headers: { Origin: "https://attacker.invalid" },
        })
      ).status,
    ).toBe(403);
  }
  // The acceptance guide renders as a page in the same shell, escaped, and says
  // so when the file is missing.
  expect((await fetch(`${origin}/guide`)).status).toBe(404);
  mkdirSync(join(root, "docs/testing"), { recursive: true });
  writeFileSync(
    join(root, "docs/testing/phase-one-acceptance.md"),
    "# Guide\n\n| Entry | Note |\n| --- | --- |\n| P1-01 | <b>escaped</b> |\n",
  );
  const guide = await fetch(`${origin}/guide`);
  expect(guide.status).toBe(200);
  expect(guide.headers.get("Content-Type")).toContain("text/html");
  const rendered = await guide.text();
  expect(rendered).toContain('<h1 id="guide">Guide</h1>');
  expect(rendered).toContain("<td>&lt;b&gt;escaped&lt;/b&gt;</td>");
  expect(rendered).toContain('href="/dashboard.css"');
  expect(rendered).not.toContain("<script");
  expect((await fetch(`${origin}/api/state`)).status).toBe(403);
  expect(launch).not.toHaveBeenCalled();
});
it("saves one-click verdicts without a name or note, filling in the local reviewer", async () => {
  const { root, origin, headers } = await fixture();
  const path = directory(join(root, "tests/results/evals", "quick"));
  writeJson(join(path, "results.json"), {
    model: "synthetic",
    effort: "high",
    startedAt: "2026-09-04",
    commit: "test",
    dirty: false,
    sourceFingerprints: {},
    results: [1, 2].map((repetition) => ({
      caseId: "greeting",
      repetition,
      rubric: "No invented choice",
      outcome: "checks-passed",
      checks: { count: true },
      error: null,
      input: { userMessage: "Hello" },
      reply: { message: "Hello", decisionProposals: [] },
      before: {},
      after: {},
    })),
  });
  const hash = loadReport(root, "quick").hash;
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  expect(
    (
      await post("/api/review", {
        run: "quick",
        hash,
        key: "greeting:1",
        review: { verdict: "pass" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post("/api/review/bulk", {
        run: "quick",
        hash,
        keys: ["greeting:2"],
        review: { verdict: "fail", reason: "Too terse" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post("/api/review", {
        run: "quick",
        hash,
        key: "greeting:1",
        review: { verdict: "maybe" },
      })
    ).status,
  ).toBe(400);
  const reviews = listReports(root)[0].reviews;
  expect(
    reviews.map(
      (review) =>
        review.type === "human" && [
          review.verdict,
          review.reason,
          review.reviewer.length > 0,
        ],
    ),
  ).toEqual([
    ["pass", "", true],
    ["fail", "Too terse", true],
  ]);
  expect(listReports(root)[0].triage["greeting:1"].status).toBe("reviewed");
  expect(listReports(root)[0].triage["greeting:2"].status).toBe("failures");
});
it("marks attempted cases across archived runs, without treating skipped or merely planned cases as run", async () => {
  const { root, origin, headers, launch } = await fixture();
  const stateOf = async () =>
    (await fetch(`${origin}/api/state`, { headers })).json();
  expect(
    (await stateOf()).evalCases.every(
      (item: { hasRun: boolean }) => !item.hasRun,
    ),
  ).toBe(true);
  const run = "archived-eval-attempts";
  writeJson(
    join(directory(join(root, "tests/results/evals", run)), "results.json"),
    {
      model: "synthetic",
      effort: "high",
      startedAt: "2026-09-05T00:00:00Z",
      commit: "test",
      dirty: false,
      sourceFingerprints: {},
      caseIds: [
        "greeting",
        "explicit-priority",
        "question-not-commitment",
        "hypothetical",
        "revise-existing",
      ],
      results: [
        { caseId: "greeting", outcome: "checks-passed" },
        { caseId: "explicit-priority", outcome: "checks-failed" },
        { caseId: "question-not-commitment", outcome: "run-error" },
        { caseId: "hypothetical", outcome: "not-run" },
      ].map((record) => ({
        ...record,
        repetition: 1,
        rubric: "Fixture",
        checks: {},
        error: null,
        input: null,
        reply: null,
        before: {},
        after: {},
      })),
    },
  );
  archiveRun(root, run, loadReport(root, run).hash, true);
  const state = await stateOf();
  expect(state.reports[0].archived).toBe(true);
  expect(
    state.evalCases
      .filter((item: { hasRun: boolean }) => item.hasRun)
      .map((item: { id: string }) => item.id),
  ).toEqual(["greeting", "explicit-priority", "question-not-commitment"]);
  const last = Object.fromEntries(
    state.evalCases.map((item: { id: string; last: unknown }) => [
      item.id,
      item.last,
    ]),
  );
  expect(last.greeting).toEqual({
    run,
    startedAt: "2026-09-05T00:00:00Z",
    status: "needs-judge",
    rubricChanged: true,
  });
  expect(last["explicit-priority"]).toMatchObject({ status: "failures" });
  expect(last["question-not-commitment"]).toMatchObject({ status: "failures" });
  expect(last.hypothetical).toBeNull();
  expect(
    state.evalCases.every(
      (item: { category: string }) => item.category.length > 0,
    ),
  ).toBe(true);
  expect(launch).not.toHaveBeenCalled();
});

it("judges a finished live run automatically only when asked, with the same model settings", async () => {
  const { root, origin, headers, launch } = await fixture();
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const stateOf = async () =>
    (await fetch(`${origin}/api/state`, { headers })).json();
  // A report the runner "saved" during the run: dated after the dashboard run
  // starts.
  writeJson(
    join(directory(join(root, "tests/results/evals", "fresh")), "results.json"),
    {
      model: "gpt-5.6-sol",
      effort: "high",
      startedAt: new Date(Date.now() + 60_000).toISOString(),
      commit: "test",
      dirty: false,
      sourceFingerprints: {},
      results: [
        {
          caseId: "greeting",
          repetition: 1,
          rubric: "No invented choice",
          outcome: "checks-passed",
          checks: { count: true },
          error: null,
          input: { userMessage: "Hello" },
          reply: { message: "Hello", decisionProposals: [] },
          before: {},
          after: {},
        },
      ],
    },
  );
  const exitQuickly: Launch = (_command, _args, options) =>
    spawn(process.execPath, ["-e", "process.exit(0)"], options);
  launch.mockImplementationOnce(exitQuickly);
  expect(
    (
      await post("/api/start", {
        suite: "live",
        cases: ["greeting"],
        consent: true,
        model: "gpt-5.6-sol",
        effort: "high",
      })
    ).status,
  ).toBe(202);
  await vi.waitFor(async () => expect((await stateOf()).active).toBeNull());
  expect(launch).toHaveBeenCalledTimes(1);
  launch.mockImplementationOnce(exitQuickly);
  expect(
    (
      await post("/api/start", {
        suite: "live",
        cases: ["greeting"],
        consent: true,
        model: "gpt-5.6-luna",
        effort: "low",
        judgeAfter: true,
      })
    ).status,
  ).toBe(202);
  await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(3));
  expect(launch.mock.calls[2][2].env).toMatchObject({
    SERVER_GUY_LIVE_JUDGE: "1",
    PI_JUDGE_RUN: "fresh",
    PI_JUDGE_HASH: loadReport(root, "fresh").hash,
    PI_JUDGE_CASES: '["greeting:1"]',
    PI_JUDGE_MODEL: "gpt-5.6-luna",
    PI_JUDGE_EFFORT: "low",
  });
  const state = await stateOf();
  expect(state.history.map((run: { suite: string }) => run.suite)).toEqual([
    "judge",
    "live",
    "live",
  ]);
  expect(state.history[1].log).toContain(
    "Judging 1 saved answer automatically",
  );
  expect(() =>
    commandFor({ suite: "judge", judgeAfter: true, consent: true } as never),
  ).toThrow();
});
it("maps a closed set of suites to fixed arguments and requires explicit spend consent", () => {
  expect(commandFor({ suite: "smoke" })).toEqual({
    args: ["run", "test:e2e:smoke"],
    env: {},
  });
  expect(() => commandFor({ suite: "live" })).toThrow("Confirm subscription");
  expect(() => commandFor({ suite: "live", consent: true })).toThrow(
    "model and effort",
  );
  expect(() => commandFor({ suite: "judge", consent: true })).toThrow(
    "saved answer",
  );
  expect(
    commandFor({
      suite: "live",
      consent: true,
      model: "gpt-5.6-sol",
      effort: "high",
    }).env,
  ).toEqual({
    SERVER_GUY_LIVE_EVALS: "1",
    PI_EVAL_REPEATS: "1",
    PI_EVAL_EXPECTED_MODEL: "gpt-5.6-sol",
    PI_EVAL_EXPECTED_EFFORT: "high",
    PI_EVAL_CASES: phaseOneCases.map((item) => item.id).join(","),
  });
});
it("runs a single eval case once without implicitly judging it", () => {
  const command = commandFor({
    suite: "live",
    cases: ["greeting"],
    consent: true,
    model: "gpt-5.6-sol",
    effort: "high",
  });
  expect(command.args).toEqual(["run", "eval:pi"]);
  expect(command.env).toEqual({
    SERVER_GUY_LIVE_EVALS: "1",
    PI_EVAL_CASES: "greeting",
    PI_EVAL_REPEATS: "1",
    PI_EVAL_EXPECTED_MODEL: "gpt-5.6-sol",
    PI_EVAL_EXPECTED_EFFORT: "high",
  });
});
it("selects exact known journey tags and rejects empty, duplicate and foreign selections", () => {
  const command = commandFor({
    suite: "e2e",
    journeys: ["settings", "disconnect"],
  });
  expect(command.args.slice(0, 4)).toEqual(["run", "test:e2e", "--", "--grep"]);
  const pattern = new RegExp(command.args[4]);
  expect(
    browserJourneys
      .filter((item) => pattern.test(`title @journey-${item.id}`))
      .map((item) => item.id),
  ).toEqual(["settings", "disconnect"]);
  for (const journeys of [
    [],
    ["settings", "settings"],
    ["settings|.*"],
    ["missing"],
  ]) {
    expect(() => commandFor({ suite: "e2e", journeys } as never)).toThrow();
  }
  expect(() => commandFor({ suite: "unit", journeys: ["settings"] })).toThrow();
});
it("bounds live selection and passes exact bulk judge keys without starting a model", () => {
  const command = commandFor({
    suite: "live",
    cases: ["greeting", "hypothetical"],
    repeats: 2,
    consent: true,
    model: "gpt-5.6-sol",
    effort: "high",
  });
  expect(command.env).toMatchObject({
    PI_EVAL_REPEATS: "2",
    PI_EVAL_CASES: "greeting,hypothetical",
  });
  for (const patch of [
    { repeats: 6 },
    { repeats: 1.5 },
    { cases: [] },
    { cases: ["fake"] },
    { cases: ["greeting", "greeting"] },
  ]) {
    expect(() =>
      commandFor({ suite: "live", consent: true, ...patch } as never),
    ).toThrow();
  }
  const judge = {
    suite: "judge" as const,
    run: "run",
    hash: "hash",
    keys: ["greeting:1", "greeting:2"],
    model: "gpt-5.6-sol",
    effort: "high" as const,
  };
  expect(() => commandFor(judge)).toThrow("Confirm subscription");
  expect(commandFor({ ...judge, consent: true }).env.PI_JUDGE_CASES).toBe(
    '["greeting:1","greeting:2"]',
  );
  expect(() => commandFor({ ...judge, consent: true, keys: [] })).toThrow();
  expect(() =>
    commandFor({ ...judge, consent: true, key: "greeting:1" }),
  ).toThrow();
});
it("opens without launching anything and rejects foreign Host, Origin and missing token", async () => {
  const { origin, headers, launch } = await fixture();
  expect((await fetch(origin)).status).toBe(200);
  expect((await fetch(`${origin}/api/state`, { headers })).status).toBe(200);
  expect((await fetch(`${origin}/api/state`)).status).toBe(403);
  const hostileHost = await new Promise((resolve, reject) => {
    get(origin, { headers: { Host: "attacker.invalid" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
  expect(hostileHost).toBe(403);
  expect(
    (await fetch(origin, { headers: { Origin: "https://attacker.invalid" } }))
      .status,
  ).toBe(403);
  expect(launch).not.toHaveBeenCalled();
});
it("rejects missing consent, missing Origin, non-JSON, arbitrary commands and fabricated saved cases", async () => {
  const { origin, headers, launch } = await fixture();
  for (const body of [
    { suite: "live" },
    { suite: "npm;whoami" },
    { suite: "unit", command: "whoami" },
    {
      suite: "judge",
      consent: true,
      run: "../outside",
      hash: "x",
      key: "case:1",
      model: "gpt-5.6-sol",
      effort: "high",
    },
  ]) {
    expect(
      (
        await fetch(`${origin}/api/start`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  }
  for (const changed of [{ Origin: "" }, { "Content-Type": "text/plain" }]) {
    expect(
      (
        await fetch(`${origin}/api/start`, {
          method: "POST",
          headers: { ...headers, ...changed },
          body: '{"suite":"unit"}',
        })
      ).status,
    ).toBe(403);
  }
  expect(launch).not.toHaveBeenCalled();
});
it("clears inherited paid opt-ins, allows one process and saves the launched command through cancellation", async () => {
  vi.stubEnv("SERVER_GUY_LIVE_EVALS", "1");
  vi.stubEnv("SERVER_GUY_LIVE_JUDGE", "1");
  const { root, origin, headers, launch } = await fixture();
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const response = await post("/api/start", { suite: "unit" });
  expect(response.status).toBe(202);
  const run = await response.json();
  expect(run.command).toBe("npm run test");
  expect(
    readJson(join(root, "tests/results/runs", `${run.id}.json`)).command,
  ).toBe(run.command);
  expect(launch.mock.calls[0].slice(0, 2)).toEqual(["npm", ["run", "test"]]);
  await vi.waitFor(async () =>
    expect(
      (await (await fetch(`${origin}/api/state`, { headers })).json()).active
        .log,
    ).toContain('"live":"","judge":""'),
  );
  expect((await post("/api/start", { suite: "unit" })).status).toBe(400);
  expect((await post("/api/stop", {})).status).toBe(200);
  await vi.waitFor(async () => {
    const state = await (
      await fetch(`${origin}/api/state`, { headers })
    ).json();
    expect(state.active).toBeNull();
    expect(state.history[0].status).toBe("cancelled");
    expect(state.history[0].command).toBe(run.command);
  });
});
it("preflights all bulk judge answers before launch and protects bulk human writes", async () => {
  const { root, origin, headers, launch } = await fixture();
  const path = directory(join(root, "tests/results/evals", "sample"));
  writeJson(join(path, "results.json"), {
    model: "synthetic",
    effort: "high",
    startedAt: "2026-09-04",
    commit: "test",
    dirty: false,
    sourceFingerprints: {},
    results: [1, 2].map((repetition) => ({
      caseId: "greeting",
      repetition,
      rubric: "No invented choice",
      outcome: "checks-passed",
      checks: {},
      error: null,
      input: { userMessage: "Hello" },
      reply: { message: "Hello", decisionProposals: [] },
      before: {},
      after: {},
    })),
  });
  const hash = loadReport(root, "sample").hash;
  const post = (path: string, body: unknown, changed = {}) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { ...headers, ...changed },
      body: JSON.stringify(body),
    });
  expect(
    (
      await post("/api/start", {
        suite: "judge",
        run: "sample",
        hash,
        keys: ["greeting:1", "missing:1"],
        consent: true,
        model: "gpt-5.6-sol",
        effort: "high",
      })
    ).status,
  ).toBe(400);
  expect(launch).not.toHaveBeenCalled();
  const batch = {
    run: "sample",
    hash,
    keys: ["greeting:1", "greeting:2"],
    review: {
      reviewer: "Test",
      verdict: "pass",
      reason: "Reviewed both greetings",
    },
  };
  expect(
    (
      await post("/api/review/bulk", batch, {
        Origin: "https://attacker.invalid",
      })
    ).status,
  ).toBe(403);
  expect((await post("/api/review/bulk", { ...batch, keys: [] })).status).toBe(
    400,
  );
  expect(
    (await post("/api/review/bulk", { ...batch, hash: "stale" })).status,
  ).toBe(400);
  expect(listReports(root)[0].reviews).toHaveLength(0);
  expect(await (await post("/api/review/bulk", batch)).json()).toEqual({
    saved: batch.keys,
    failed: [],
  });
  expect(listReports(root)[0].reviews).toHaveLength(2);
  expect(loadReport(root, "sample").hash).toBe(hash);
  const archive = { run: "sample", hash, archived: true };
  expect(
    (
      await post("/api/runs/archive", archive, {
        Origin: "https://attacker.invalid",
      })
    ).status,
  ).toBe(403);
  expect(
    (await post("/api/runs/archive", archive, { "X-SG-Testing-Token": "" }))
      .status,
  ).toBe(403);
  expect(
    (await post("/api/runs/archive", { ...archive, archived: "true" })).status,
  ).toBe(400);
  expect(
    (await post("/api/runs/archive", { ...archive, keys: ["greeting:1"] }))
      .status,
  ).toBe(400);
  expect(
    (await post("/api/runs/archive", { ...archive, hash: "stale" })).status,
  ).toBe(400);
  expect(listReports(root)[0].archived).toBe(false);
  expect(await (await post("/api/runs/archive", archive)).json()).toEqual({
    archived: true,
  });
  expect(
    await (
      await post("/api/runs/archive", { ...archive, archived: false })
    ).json(),
  ).toEqual({ archived: false });
  expect(listReports(root)[0].reviews).toHaveLength(2);
  expect(loadReport(root, "sample").hash).toBe(hash);
});
