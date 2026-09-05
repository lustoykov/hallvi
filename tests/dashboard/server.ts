import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  archiveRun,
  caseKey,
  directory,
  findCase,
  humanReviewSchema,
  listReports,
  readJson,
  reviewKeysSchema,
  saveHumanReviews,
  saveReview,
  writeJson,
} from "./results.ts";
import { browserJourneys } from "../browser/journeys.ts";
import { phaseOneCases } from "../evals/phase-one-cases.ts";
import { suiteGuides } from "./suite-guides.ts";
import { guidePage, renderMarkdown } from "./markdown.ts";

// Bumped when the page needs a newer server; the page warns instead of failing
// quietly against a stale process.
export const API_VERSION = 6;
const currentRubrics = Object.fromEntries(
  phaseOneCases.map((item) => [item.id, item.rubric]),
);
export const suites = [
  {
    id: "unit",
    name: "Application tests",
    command: "npm test",
    scope: "Schemas, domain rules, SQLite and adapter tests",
    cost: "No AI calls",
    ci: "Every PR",
    ciDetail: "",
  },
  {
    id: "smoke",
    name: "Browser smoke",
    command: "npm run test:e2e:smoke",
    scope: "2 desktop journeys through Server Guy",
    cost: "No AI calls",
    ci: "Every PR",
    ciDetail: "",
  },
  {
    id: "e2e",
    name: "Browser journeys",
    command: "npm run test:e2e",
    scope: `${browserJourneys.length} selectable journeys · native Pi SDK, synthetic model and services`,
    cost: "No AI calls",
    ci: `${browserJourneys.filter((journey) => journey.smoke).length} of ${browserJourneys.length} per PR`,
    ciDetail: `All ${browserJourneys.length} on demand`,
  },
  {
    id: "live",
    name: "Live agent evals",
    command: "npm run eval:pi",
    scope: `${phaseOneCases.length} selectable cases · real Server Guy agent responses to review`,
    cost: "Uses subscription",
    ci: "On demand only",
    ciDetail: "Local only · never in CI",
  },
] as const;
const startSchema = z.strictObject({
  suite: z.enum(["unit", "smoke", "e2e", "live", "judge"]),
  consent: z.literal(true).optional(),
  run: z.string().optional(),
  hash: z.string().optional(),
  key: z.string().optional(),
  keys: reviewKeysSchema.optional(),
  journeys: z
    .array(z.enum(browserJourneys.map((item) => item.id)))
    .min(1)
    .max(browserJourneys.length)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  cases: z
    .array(z.enum(phaseOneCases.map((item) => item.id)))
    .min(1)
    .max(phaseOneCases.length)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  repeats: z.number().int().min(1).max(5).optional(),
  judgeAfter: z.boolean().optional(),
  model: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
    .optional(),
  effort: z
    .enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"])
    .optional(),
});
export type StartRequest = z.infer<typeof startSchema>;
type Run = {
  id: string;
  suite: string;
  command?: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  log: string;
  commit: string;
  dirty: boolean;
  exitCode?: number | null;
};
export function commandFor(request: StartRequest) {
  const input = startSchema.parse(request);
  if (input.suite !== "e2e" && input.journeys)
    throw new Error("Journey selection is for browser tests");
  if (input.suite !== "live" && (input.cases || input.repeats !== undefined))
    throw new Error("Case selection is for live evals");
  if (
    input.suite !== "judge" &&
    (input.key || input.keys || input.run || input.hash)
  )
    throw new Error("Saved answers are for the judge");
  if (input.suite !== "live" && input.judgeAfter)
    throw new Error("Automatic judging follows a live eval run");
  const commands = {
    unit: "test",
    smoke: "test:e2e:smoke",
    e2e: "test:e2e",
    live: "eval:pi",
    judge: "eval:judge",
  };
  const env: Record<string, string> = {};
  if (input.suite === "live" || input.suite === "judge") {
    if (!input.consent)
      throw new Error("Confirm subscription usage before starting");
    if (input.suite === "live") {
      if (!input.model || !input.effort)
        throw new Error("Confirm the model and effort before starting");
      Object.assign(env, {
        SERVER_GUY_LIVE_EVALS: "1",
        PI_EVAL_REPEATS: String(input.repeats ?? 1),
        PI_EVAL_CASES: (
          input.cases ?? phaseOneCases.map((item) => item.id)
        ).join(","),
        PI_EVAL_EXPECTED_MODEL: input.model,
        PI_EVAL_EXPECTED_EFFORT: input.effort,
      });
    } else {
      if (
        !input.run ||
        !input.hash ||
        (!input.key && !input.keys) ||
        (input.key && input.keys) ||
        !input.model ||
        !input.effort
      )
        throw new Error("Select saved answers and judge settings");
      const keys = reviewKeysSchema.parse(input.keys ?? [input.key]);
      Object.assign(env, {
        SERVER_GUY_LIVE_JUDGE: "1",
        PI_JUDGE_RUN: input.run,
        PI_JUDGE_HASH: input.hash,
        PI_JUDGE_CASES: JSON.stringify(keys),
        PI_JUDGE_MODEL: input.model,
        PI_JUDGE_EFFORT: input.effort,
      });
    }
  }
  const args = ["run", commands[input.suite]];
  if (input.journeys)
    args.push(
      "--",
      "--grep",
      `@journey-(?:${input.journeys.join("|")})(?:\\s|$)`,
    );
  return { args, env };
}

function commandText(command: ReturnType<typeof commandFor>) {
  const quote = (value: string) =>
    /^[\w@/:=.,-]+$/.test(value)
      ? value
      : `'${value.replaceAll("'", "'\\''")}'`;
  // Only explicit runner options, never the inherited environment or
  // credentials.
  return [
    ...Object.entries(command.env).map(
      ([key, value]) => `${key}=${quote(value)}`,
    ),
    "npm",
    ...command.args.map(quote),
  ].join(" ");
}

export type Launch = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;
export function createDashboard(root: string, launch: Launch = spawn) {
  const storage = directory(join(root, "tests/results"));
  const historyDir = directory(join(storage, "runs"));
  const token = randomUUID();
  let active: Run | null = null;
  let child: ReturnType<typeof spawn> | null = null;
  let cancelActive: (() => void) | null = null;
  let origin = "";
  function history() {
    return readdirSync(historyDir)
      .filter((name) => /^[a-f0-9-]+\.json$/.test(name))
      .flatMap((name) => {
        try {
          const run = readJson(join(historyDir, name)) as Run;
          if (run.status === "running" && run.id !== active?.id)
            return [{ ...run, status: "interrupted" }];
          return [run];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 30);
  }
  function start(input: StartRequest) {
    if (active)
      throw new Error("A check is already running. Wait for it to finish.");
    const command = commandFor(input);
    const previousReports =
      input.suite === "live"
        ? new Set(listReports(root).map((report) => report.run))
        : null;
    if (input.suite === "judge")
      for (const key of input.keys ?? [input.key!])
        findCase(root, input.run!, input.hash!, key);
    const run: Run = {
      id: randomUUID(),
      suite: input.suite,
      startedAt: new Date().toISOString(),
      status: "running",
      log: "Starting…\n",
      command: commandText(command),
      commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ),
    };
    active = run;
    const path = join(historyDir, `${run.id}.json`);
    writeJson(path, run);
    // Never inherit opt-in switches from the dashboard's shell for ordinary
    // runs.
    const env = {
      ...process.env,
      SERVER_GUY_LIVE_EVALS: "",
      SERVER_GUY_LIVE_JUDGE: "",
      ...command.env,
      FORCE_COLOR: "0",
    };
    try {
      child = launch("npm", command.args, {
        cwd: root,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      run.status = "failed";
      run.finishedAt = new Date().toISOString();
      run.log = "Could not start the test runner.";
      writeJson(path, run);
      active = null;
      throw error;
    }
    const processForRun = child;
    const paid = input.suite === "live" || input.suite === "judge";
    const log = (data: Buffer) => {
      // SDK diagnostics may contain secrets. Live runs expose only completion
      // and saved reports.
      if (!paid) {
        run.log = (
          run.log + data.toString().replace(/\x1b\[[0-9;]*m/g, "")
        ).slice(-40_000);
        writeJson(path, run);
      }
    };
    child.stdout?.on("data", log);
    child.stderr?.on("data", log);
    let timedOut = false;
    let cancelled = false;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (processForRun.pid) {
        try {
          process.kill(-processForRun.pid, "SIGTERM");
        } catch {
          /* stopped */
        }
        forceKill = setTimeout(() => {
          try {
            process.kill(-processForRun.pid!, "SIGKILL");
          } catch {
            /* stopped */
          }
        }, 3000);
      }
    };
    cancelActive = () => {
      cancelled = true;
      kill();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      kill();
    }, 15 * 60_000);
    const finish = (code: number | null) => {
      if (run.finishedAt) return;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      run.status = timedOut
        ? "timed-out"
        : cancelled
          ? "cancelled"
          : code === 0
            ? "passed"
            : "failed";
      run.exitCode = code;
      run.finishedAt = new Date().toISOString();
      if (paid) {
        const noReport =
          previousReports &&
          !listReports(root).some((report) => !previousReports.has(report.run));
        run.log =
          code === 0
            ? "Run completed. Open Eval runs to inspect answers and judgments. Runner completion is not semantic acceptance.\n"
            : `Run ${run.status}${code === null ? "" : ` (exit code ${code})`}. ${noReport ? "No readable eval report was saved by this run. Setup may have failed before the first turn; this does not prove that no model requests were made." : "Earlier saved answers and verdicts remain; remaining items may not have run."}\nProvider output is hidden because it may contain credentials. Check your saved Server Guy login and model settings. For full diagnostics, run the following command in a terminal from the project directory. Rerunning may use subscription usage; nothing is retried automatically.\n\n${run.command}\n`;
      }
      writeJson(path, run);
      active = null;
      child = null;
      cancelActive = null;
      if (input.suite === "live" && input.judgeAfter && code === 0)
        judgeAfterRun(run, path, input);
    };
    child.on("error", () => finish(null));
    child.on("close", finish);
    return run;
  }
  // The one confirmation for a live run also covers judging its answers with
  // the same model once they are saved.
  function judgeAfterRun(run: Run, path: string, input: StartRequest) {
    try {
      const report = listReports(root).find(
        (r) => r.startedAt >= run.startedAt,
      );
      const keys =
        report?.results.filter((c) => c.reply && c.input).map(caseKey) ?? [];
      if (!report || !keys.length)
        throw new Error("no saved answers were found for this run");
      start({
        suite: "judge",
        consent: true,
        run: report.run,
        hash: report.hash,
        keys,
        model: input.model,
        effort: input.effort,
      });
      run.log += `Judging ${keys.length} saved answer${keys.length === 1 ? "" : "s"} automatically.\n`;
    } catch (error) {
      run.log += `Automatic judging did not start: ${error instanceof Error ? error.message : "unknown error"}.\n`;
    }
    writeJson(path, run);
  }
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const json = (value: unknown, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      json({ error: "Local same-origin requests only" }, 403);
      return;
    }
    const url = new URL(request.url!, origin);
    try {
      if (
        request.method === "GET" &&
        ["/", "/evals", "/about", "/dashboard.js", "/dashboard.css"].includes(
          url.pathname,
        )
      ) {
        const name = ["/", "/evals", "/about"].includes(url.pathname)
          ? "dashboard.html"
          : url.pathname.slice(1);
        response.setHeader(
          "Content-Type",
          name.endsWith("html")
            ? "text/html; charset=utf-8"
            : name.endsWith("css")
              ? "text/css"
              : "text/javascript",
        );
        response.end(
          readFileSync(new URL(name, import.meta.url), "utf8").replace(
            "CSRF_TOKEN",
            token,
          ),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/guide") {
        // The written acceptance contract, rendered read-only inside the
        // dashboard shell.
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        try {
          response.end(
            guidePage(
              renderMarkdown(
                readFileSync(
                  join(root, "docs/testing/phase-one-acceptance.md"),
                  "utf8",
                ),
              ),
              "Acceptance guide",
            ),
          );
        } catch {
          response.writeHead(404);
          response.end(
            guidePage(
              '<p class="empty">The acceptance guide was not found at docs/testing/phase-one-acceptance.md.</p>',
              "Acceptance guide",
            ),
          );
        }
        return;
      }
      if (request.headers["x-sg-testing-token"] !== token) {
        json({ error: "Reload the dashboard to reconnect" }, 403);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        let defaults = { model: "gpt-5.6-sol", effort: "high" };
        try {
          const settings = readJson(
            join(
              process.env.SERVER_GUY_CONFIG_DIR ?? join(root, ".server-guy"),
              "pi-settings.json",
            ),
          );
          defaults = z.object({ model: z.string(), effort: z.string() }).parse({
            model: settings.modelId,
            effort: settings.reasoningEffort,
          });
        } catch {
          /* No saved settings: display defaults, not an authenticated claim. */
        }
        const reports = listReports(root, currentRubrics);
        // Archived runs count too. Planned/skipped cases are not attempts.
        const attempted = new Set(
          reports.flatMap((report) =>
            report.results
              .filter((record) => record.outcome !== "not-run")
              .map((record) => record.caseId),
          ),
        );
        // The newest attempt of each case, summarised for the picker: its
        // triage status, when it ran, and whether the rubric wording has
        // changed since. Reports are newest first.
        const lastAttempt = (item: (typeof phaseOneCases)[number]) => {
          for (const report of reports) {
            const records = report.results.filter(
              (record) =>
                record.caseId === item.id && record.outcome !== "not-run",
            );
            if (!records.length) continue;
            const statuses = records.map(
              (record) => report.triage[caseKey(record)].status,
            );
            return {
              run: report.run,
              startedAt: report.startedAt,
              status:
                ["failures", "needs-review", "needs-judge", "reviewed"].find(
                  (status) => statuses.includes(status),
                ) ?? "cleared",
              rubricChanged: records.some(
                (record) => record.rubric !== item.rubric,
              ),
            };
          }
          return null;
        };
        json({
          apiVersion: API_VERSION,
          suites: suites.map((suite) => ({
            ...suite,
            guide: suiteGuides[suite.id],
          })),
          journeys: browserJourneys,
          evalCases: phaseOneCases.map((item) => ({
            ...item,
            hasRun: attempted.has(item.id),
            last: lastAttempt(item),
          })),
          active,
          history: history(),
          reports,
          defaults,
        });
        return;
      }
      if (
        request.method !== "POST" ||
        ![
          "/api/start",
          "/api/review",
          "/api/review/bulk",
          "/api/runs/archive",
          "/api/stop",
        ].includes(url.pathname)
      ) {
        json({ error: "Not found" }, 404);
        return;
      }
      if (
        request.headers.origin !== origin ||
        !request.headers["content-type"]?.startsWith("application/json")
      ) {
        json({ error: "Same-origin JSON required" }, 403);
        return;
      }
      let text = "";
      for await (const chunk of request) {
        text += chunk;
        if (Buffer.byteLength(text) > 16_000)
          throw new Error("Request too large");
      }
      const body = JSON.parse(text);
      if (url.pathname === "/api/stop") {
        z.strictObject({}).parse(body);
        cancelActive?.();
        json({ stopping: Boolean(active) });
        return;
      }
      if (url.pathname === "/api/start") {
        json(start(body), 202);
        return;
      } // commandFor validates before any launch or artifact write.
      if (url.pathname === "/api/runs/archive") {
        const input = z
          .strictObject({
            run: z.string(),
            hash: z.string(),
            archived: z.boolean(),
          })
          .parse(body);
        json(archiveRun(root, input.run, input.hash, input.archived));
        return;
      }
      if (url.pathname === "/api/review/bulk") {
        const batch = z
          .strictObject({
            run: z.string(),
            hash: z.string(),
            keys: reviewKeysSchema,
            review: humanReviewSchema,
          })
          .parse(body);
        json(
          saveHumanReviews(
            root,
            batch.run,
            batch.hash,
            batch.keys,
            batch.review,
          ),
        );
        return;
      }
      const review = z
        .strictObject({
          run: z.string(),
          hash: z.string(),
          key: z.string(),
          review: humanReviewSchema,
        })
        .parse(body);
      json(
        saveReview(root, review.run, review.hash, review.key, {
          type: "human",
          ...review.review,
        }),
      );
    } catch {
      json(
        {
          error:
            "Could not complete this request. Check the selection, required fields and running check, then reload if results changed.",
        },
        400,
      );
    }
  });
  server.on("listening", () => {
    const address = server.address();
    if (address && typeof address !== "string")
      origin = `http://127.0.0.1:${address.port}`;
  });
  return {
    server,
    token,
    stop: () => {
      cancelActive?.();
      server.close();
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.cwd();
  if (!existsSync(join(root, "tests/evals", "phase-one-cases.ts")))
    throw new Error("Run from the Server Guy repository");
  const dashboard = createDashboard(root);
  dashboard.server.listen(4317, "127.0.0.1", () =>
    console.log(
      "Server Guy Testing: http://127.0.0.1:4317 (local only; no checks start automatically)",
    ),
  );
  dashboard.server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  process.on("SIGINT", dashboard.stop);
  process.on("SIGTERM", dashboard.stop);
}
