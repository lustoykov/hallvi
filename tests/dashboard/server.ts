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
import { checkout, developmentState, releasesState } from "./development.ts";

// Bumped when the page needs a newer server; the page warns instead of failing
// quietly against a stale process.
export const API_VERSION = 7;

const REPOSITORY = "lustoykov/hallvi";

/** `gh`, with fixed arguments, or the reason it could not run. */
function gh(args: string[]) {
  try {
    return {
      ok: true as const,
      output: execFileSync("gh", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      }).trim(),
    };
  } catch (error) {
    const said =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr).trim()
        : "";
    return {
      ok: false as const,
      error:
        said ||
        (error instanceof Error ? error.message : "gh could not be run."),
    };
  }
}

/**
 * Starts the existing release workflow for one version at one revision. It
 * signs in as nobody: `gh` uses the login already on this machine, and no
 * token is entered, stored or displayed here.
 */
export function dispatchRelease(
  root: string,
  version: string,
  revision: string,
) {
  const here = checkout(root);
  if (here.revision !== revision || here.branch === "HEAD" || !here.branch)
    return {
      started: false,
      error:
        "The checkout changed or has no branch. Reload and select a committed branch to release.",
    };
  const currentVersion = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ).version;
  if (currentVersion !== version)
    return {
      started: false,
      error: "The version changed. Reload before building a release.",
    };
  // workflow_dispatch takes a branch or tag, not an arbitrary commit SHA.
  // The workflow checks the expected commit before building, so a branch
  // moving between this click and dispatch cannot release different code.
  const started = gh([
    "workflow",
    "run",
    "release.yml",
    "--repo",
    REPOSITORY,
    "--ref",
    here.branch,
    "-f",
    `version=${version}`,
    "-f",
    "channel=alpha",
    "-f",
    `expected_revision=${revision}`,
  ]);
  if (!started.ok) return { started: false, error: started.error };
  // Listing the latest run here can return somebody else's previous build.
  // The panel lists runs separately, with the actual revision of each run.
  return { started: true, version, revision };
}

/** Promotes a draft this repository already has. Nothing is rebuilt. */
function publishRelease(tag: string) {
  const drafts = gh([
    "release",
    "list",
    "--repo",
    REPOSITORY,
    "--limit",
    "20",
    "--json",
    "tagName,isDraft",
  ]);
  if (!drafts.ok) return { published: false, error: drafts.error };
  const known = (
    JSON.parse(drafts.output) as { tagName: string; isDraft: boolean }[]
  ).some((release) => release.tagName === tag && release.isDraft);
  if (!known)
    return {
      published: false,
      error: `${tag} is not a draft release of ${REPOSITORY}.`,
    };
  const done = gh([
    "release",
    "edit",
    tag,
    "--repo",
    REPOSITORY,
    "--draft=false",
  ]);
  return done.ok
    ? { published: true, tag }
    : { published: false, error: done.error };
}
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
    scope: "2 desktop journeys through Hallvi",
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
  const pairedAppPort = Number(process.env.HALLVI_DEV_APP_PORT) || undefined;
  const appUrl = `http://127.0.0.1:${pairedAppPort ?? 3000}`;
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
      HALLVI_LIVE_EVALS: "",
      HALLVI_LIVE_JUDGE: "",
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
        [
          "/",
          "/evals",
          "/about",
          "/development",
          "/releases",
          "/dashboard.js",
          "/dashboard.css",
        ].includes(url.pathname)
      ) {
        const name = [
          "/",
          "/evals",
          "/about",
          "/development",
          "/releases",
        ].includes(url.pathname)
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
          readFileSync(new URL(name, import.meta.url), "utf8")
            .replace("CSRF_TOKEN", token)
            .replace("HALLVI_APP_URL", appUrl),
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
      if (request.headers["x-hallvi-testing-token"] !== token) {
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
      if (request.method === "GET" && url.pathname === "/api/development") {
        json({
          apiVersion: API_VERSION,
          ...(await developmentState(
            root,
            pairedAppPort && process.env.HALLVI_DB_PATH
              ? { port: pairedAppPort, database: process.env.HALLVI_DB_PATH }
              : undefined,
          )),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/releases") {
        json({ apiVersion: API_VERSION, ...(await releasesState(root)) });
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
          "/api/releases/build",
          "/api/releases/publish",
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
      if (url.pathname === "/api/releases/build") {
        // A narrow wrapper: two validated values become fixed arguments to
        // one known command. Nothing here builds a shell string, and the
        // signing key stays where it is, in the workflow.
        const input = z
          .strictObject({
            version: z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/),
            revision: z.string().regex(/^[0-9a-f]{40}$/),
          })
          .parse(body);
        json(dispatchRelease(root, input.version, input.revision));
        return;
      }
      if (url.pathname === "/api/releases/publish") {
        // Publishing promotes the reviewed draft. It never rebuilds, and it
        // never invents a tag: the tag has to be one gh already lists as a
        // draft of this repository.
        const input = z
          .strictObject({ tag: z.string().regex(/^v[0-9A-Za-z.\-+]{1,60}$/) })
          .parse(body);
        json(publishRelease(input.tag));
        return;
      }
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
    throw new Error("Run from the Hallvi repository");
  const dashboard = createDashboard(root);
  const port = Number(process.env.HALLVI_DASHBOARD_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("HALLVI_DASHBOARD_PORT must be a TCP port from 1 to 65535");
  dashboard.server.listen(port, "127.0.0.1", () =>
    console.log(
      `Hallvi Testing: http://127.0.0.1:${port} (local only; no checks start automatically)`,
    ),
  );
  dashboard.server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  process.on("SIGINT", dashboard.stop);
  process.on("SIGTERM", dashboard.stop);
}
