import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { NotFoundError } from "../applications";
import { currentAccessRecord } from "../access-record";
import { listInformation } from "../saved-information";

// Simulated traffic for developing the Traffic page: the fixture generator's
// `live` mode, started from the page instead of a terminal. It sends real
// requests to the application's public address, so they travel the whole
// pipeline (proxy, log, collector, page) and count in that application's
// real totals. That is why it exists only outside a production build, and
// why the packaged controller does not ship the generator at all.

export const SIMULATED_SHAPES = ["busy", "spa", "tiny", "api"] as const;
export type SimulatedShape = (typeof SIMULATED_SHAPES)[number];

export interface Simulation {
  shape: SimulatedShape;
  /** Visits a minute. */
  rate: number;
  origin: string;
  startedAt: string;
  endsAt: string;
  /** Requests the generator has had an answer to, or not, so far. */
  requests: number;
  /** Visits still clicking through pages. */
  open: number;
  running: boolean;
  error: string | null;
}

interface Run extends Simulation {
  child: ChildProcess | null;
}

/** Shared across Next route bundles and development module reloads. */
declare global {
  var __hallviSimulations: Map<string, Run> | undefined;
}

const runs = () => (globalThis.__hallviSimulations ??= new Map<string, Run>());
const GENERATOR = join(process.cwd(), "scripts", "traffic-fixture.ts");

function available() {
  if (process.env.NODE_ENV === "production" || !existsSync(GENERATOR))
    throw new NotFoundError("Simulated traffic exists only in development.");
}

const shown = (run: Run): Simulation => {
  const { child, ...simulation } = run;
  void child;
  return simulation;
};

export function simulation(applicationId: string): Simulation | null {
  available();
  const run = runs().get(applicationId);
  return run ? shown(run) : null;
}

/** What the generator tallied, as `verify` names it: requests, not events. */
function requestsIn(counts: Record<string, number>) {
  return ["browser", "bot", "client", "own", "failed"].reduce(
    (sum, key) => sum + (counts[key] ?? 0),
    0,
  );
}

export async function startSimulation(
  applicationId: string,
  wanted: { shape: SimulatedShape; rate: number; minutes: number },
): Promise<Simulation> {
  available();
  if (runs().get(applicationId)?.running)
    throw new Error("Simulated traffic is already running here.");
  const record = currentAccessRecord(
    await listInformation(applicationId),
    applicationId,
  );
  const content = record?.presentation?.content;
  const url = record?.presentation?.url;
  if (
    content?.kind !== "application-access" ||
    content.mode !== "public" ||
    !url
  )
    throw new Error(
      "Simulated traffic needs a public address, so it passes the proxy that writes the log.",
    );
  const origin = new URL(url).origin;
  const now = Date.now();
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      GENERATOR,
      "live",
      "--url",
      origin,
      "--shape",
      wanted.shape,
      "--rate",
      String(wanted.rate),
      "--minutes",
      String(wanted.minutes),
      "--report",
      "5",
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  const run: Run = {
    shape: wanted.shape,
    rate: wanted.rate,
    origin,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + wanted.minutes * 60_000).toISOString(),
    requests: 0,
    open: 0,
    running: true,
    error: null,
    child,
  };
  runs().set(applicationId, run);

  let pending = "";
  child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      // The generator's own report lines (scripts/traffic-fixture.ts, live):
      // "  12 browser, 3 bot; 2 visits open" and "Done: {…}".
      const done = /^Done: (\{.*\})$/.exec(line);
      if (done) {
        run.requests = requestsIn(JSON.parse(done[1]));
        run.open = 0;
        continue;
      }
      const report = /^ {2}(.*); (\d+) visits open$/.exec(line);
      if (!report) continue;
      const counts: Record<string, number> = {};
      for (const part of report[1].split(", ")) {
        const [, value, key] = /^(\d+) (.+)$/.exec(part) ?? [];
        if (key) counts[key] = Number(value);
      }
      run.requests = requestsIn(counts);
      run.open = Number(report[2]);
    }
  });
  let errors = "";
  child.stderr!.setEncoding("utf8").on("data", (chunk: string) => {
    errors = (errors + chunk).slice(-2_000);
  });
  child.once("error", (error) => {
    run.error = error.message;
  });
  child.once("exit", (code, signal) => {
    run.running = false;
    run.child = null;
    run.open = 0;
    if (code && !signal && !run.error)
      run.error =
        errors.trim().split("\n").pop() || `Stopped with code ${code}.`;
  });
  return shown(run);
}

export function stopSimulation(applicationId: string): Simulation | null {
  available();
  const run = runs().get(applicationId);
  // SIGINT lets the generator finish its open visits and print its total.
  if (run?.running && run.child?.pid) process.kill(run.child.pid, "SIGINT");
  return run ? shown(run) : null;
}
