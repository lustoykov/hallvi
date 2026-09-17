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
  directory,
  humanReviewSchema,
  listReports,
  readJson,
  reviewKeysSchema,
  saveHumanReviews,
  saveReview,
  writeJson,
} from "./results.ts";
import { browserJourneys } from "../browser/journeys.ts";
import { suiteGuides } from "./suite-guides.ts";
import { guidePage, renderMarkdown } from "./markdown.ts";

// Bumped when the page needs a newer server; the page warns instead of failing
// quietly against a stale process.
export const API_VERSION = 6;
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
    scope: "2 desktop journeys through Haldur",
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
] as const;
const startSchema = z.strictObject({
  suite: z.enum(["unit", "smoke", "e2e"]),
  journeys: z
    .array(z.enum(browserJourneys.map((item) => item.id)))
    .min(1)
    .max(browserJourneys.length)
    .refine((ids) => new Set(ids).size === ids.length)
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
  const commands = { unit: "test", smoke: "test:e2e:smoke", e2e: "test:e2e" };
  const args = ["run", commands[input.suite]];
  if (input.journeys)
    args.push(
      "--",
      "--grep",
      `@journey-(?:${input.journeys.join("|")})(?:\\s|$)`,
    );
  // Nothing this dashboard starts makes a model call, so there is no run
  // environment to build and nothing to confirm before starting one.
  return { args, env: {} as Record<string, string> };
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
      HALDUR_LIVE_EVALS: "",
      HALDUR_LIVE_JUDGE: "",
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
    const log = (data: Buffer) => {
      run.log = (
        run.log + data.toString().replace(/\x1b\[[0-9;]*m/g, "")
      ).slice(-40_000);
      writeJson(path, run);
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
      writeJson(path, run);
      active = null;
      child = null;
      cancelActive = null;
    };
    child.on("error", () => finish(null));
    child.on("close", finish);
    return run;
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
      if (request.headers["x-haldur-testing-token"] !== token) {
        json({ error: "Reload the dashboard to reconnect" }, 403);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        // The saved answers stay readable; nothing here can start another
        // run against them, so no model, effort or case picker is sent.
        json({
          apiVersion: API_VERSION,
          suites: suites.map((suite) => ({
            ...suite,
            guide: suiteGuides[suite.id],
          })),
          journeys: browserJourneys,
          active,
          history: history(),
          reports: listReports(root),
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
  if (!existsSync(join(root, "tests/browser", "journeys.ts")))
    throw new Error("Run from the Haldur repository");
  const dashboard = createDashboard(root);
  dashboard.server.listen(4317, "127.0.0.1", () =>
    console.log(
      "Haldur Testing: http://127.0.0.1:4317 (local only; no checks start automatically)",
    ),
  );
  dashboard.server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  process.on("SIGINT", dashboard.stop);
  process.on("SIGTERM", dashboard.stop);
}
